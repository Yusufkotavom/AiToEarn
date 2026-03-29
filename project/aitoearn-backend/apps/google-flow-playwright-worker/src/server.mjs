import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { v4 as uuidv4 } from 'uuid'

const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = Number(process.env.PORT || 4310)
const API_KEY = process.env.GOOGLE_FLOW_WORKER_API_KEY || ''
const FLOW_URL = process.env.GOOGLE_FLOW_URL || 'https://labs.google/fx/tools/flow'
const USER_DATA_DIR = process.env.GOOGLE_FLOW_USER_DATA_DIR || '/tmp/google-flow-user-data'
const HEADLESS = String(process.env.GOOGLE_FLOW_HEADLESS || 'false').toLowerCase() === 'true'
const ACTION_TIMEOUT_MS = Number(process.env.GOOGLE_FLOW_ACTION_TIMEOUT_MS || 120000)
const TASK_TTL_MS = Number(process.env.GOOGLE_FLOW_TASK_TTL_MS || 24 * 60 * 60 * 1000)
const SELECTOR_PROMPT = (process.env.GOOGLE_FLOW_SELECTOR_PROMPT || 'textarea,[contenteditable="true"],input[type="text"]').split(',').map(s => s.trim()).filter(Boolean)
const SELECTOR_SUBMIT = (process.env.GOOGLE_FLOW_SELECTOR_SUBMIT || 'button:has-text("Generate"),button:has-text("Create"),button:has-text("Run")').split(',').map(s => s.trim()).filter(Boolean)
const SELECTOR_IMAGE_OUTPUT = (process.env.GOOGLE_FLOW_SELECTOR_IMAGE_OUTPUT || 'img[src^="https://"],img[src^="blob:"]').split(',').map(s => s.trim()).filter(Boolean)
const SELECTOR_VIDEO_OUTPUT = (process.env.GOOGLE_FLOW_SELECTOR_VIDEO_OUTPUT || 'video[src],video source[src],a[href$=".mp4"]').split(',').map(s => s.trim()).filter(Boolean)
const SELECTOR_LOGIN_MARKER = (process.env.GOOGLE_FLOW_SELECTOR_LOGIN_MARKER || 'input[type="email"],button:has-text("Sign in"),a:has-text("Sign in")').split(',').map(s => s.trim()).filter(Boolean)

/**
 * Single-worker queue to keep browser actions serialized.
 * This avoids race conditions on one persistent Google Flow session.
 */
let queue = Promise.resolve()
const tasks = new Map()
let contextPromise = null

function enqueue(taskFn) {
  queue = queue.then(taskFn, taskFn)
  return queue
}

function authGuard(req, res, next) {
  if (!API_KEY) {
    return next()
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (token !== API_KEY) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  return next()
}

function compactTasks() {
  const now = Date.now()
  for (const [id, task] of tasks.entries()) {
    if (now - task.createdAt > TASK_TTL_MS) {
      tasks.delete(id)
    }
  }
}

async function getContext() {
  if (!contextPromise) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true })
    contextPromise = chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: HEADLESS,
      viewport: { width: 1440, height: 900 },
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
  }
  return contextPromise
}

async function closeContext() {
  if (contextPromise) {
    const ctx = await contextPromise
    await ctx.close()
    contextPromise = null
  }
}

async function firstSelector(page, selectors, timeoutMs = 5000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if (await locator.count()) {
      try {
        await locator.waitFor({ state: 'visible', timeout: timeoutMs })
        return locator
      }
      catch {}
    }
  }
  return null
}

async function openFlowPage() {
  const context = await getContext()
  const page = await context.newPage()
  await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: ACTION_TIMEOUT_MS })
  return page
}

async function detectLoginRequired(page) {
  const marker = await firstSelector(page, SELECTOR_LOGIN_MARKER, 2500)
  return !!marker
}

async function extractMediaUrl(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).last()
    if (await locator.count()) {
      const href = await locator.getAttribute('href')
      const src = await locator.getAttribute('src')
      const text = await locator.innerText().catch(() => '')
      const candidate = href || src || (text?.startsWith('http') ? text : '')
      if (candidate) {
        return candidate
      }
    }
  }
  return null
}

async function runGeneration(kind, payload) {
  const page = await openFlowPage()
  try {
    const requiresLogin = await detectLoginRequired(page)
    if (requiresLogin) {
      throw new Error('Google Flow session is not logged in. Complete login first.')
    }

    const promptInput = await firstSelector(page, SELECTOR_PROMPT, 8000)
    if (!promptInput) {
      throw new Error('Prompt input selector not found. Update worker selectors.')
    }

    const prompt = String(payload.prompt || '').trim()
    if (!prompt) {
      throw new Error('Prompt is required')
    }

    await promptInput.click()
    await promptInput.fill('')
    await promptInput.type(prompt, { delay: 8 })

    const submitButton = await firstSelector(page, SELECTOR_SUBMIT, 5000)
    if (!submitButton) {
      throw new Error('Generate button selector not found. Update worker selectors.')
    }
    await submitButton.click()

    const outputSelectors = kind === 'video' ? SELECTOR_VIDEO_OUTPUT : SELECTOR_IMAGE_OUTPUT
    const deadline = Date.now() + ACTION_TIMEOUT_MS
    while (Date.now() < deadline) {
      const outputUrl = await extractMediaUrl(page, outputSelectors)
      if (outputUrl) {
        return outputUrl
      }
      await page.waitForTimeout(2000)
    }

    throw new Error(`${kind} generation timed out`)
  }
  finally {
    await page.close().catch(() => {})
  }
}

app.use(authGuard)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/v1/auth/login-url', (_req, res) => {
  res.json({
    url: FLOW_URL,
    requiresLogin: true,
    note: 'Open URL and login using the same persistent browser profile.',
  })
})

app.get('/v1/auth/session-status', async (_req, res) => {
  const page = await openFlowPage()
  try {
    const requiresLogin = await detectLoginRequired(page)
    const account = await page.evaluate(() => {
      const txt = document.body?.innerText || ''
      const m = txt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
      return m ? m[0] : null
    })
    res.json({
      loggedIn: !requiresLogin,
      account: account || undefined,
    })
  }
  finally {
    await page.close().catch(() => {})
  }
})

app.post('/v1/auth/relogin', async (_req, res) => {
  await closeContext()
  res.json({
    loggedIn: false,
    note: 'Session reset done. Open login URL and sign in again.',
  })
})

app.post('/v1/image/generate', async (req, res) => {
  const taskId = uuidv4()
  const task = {
    id: taskId,
    type: 'image',
    status: 'queued',
    outputUrl: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  tasks.set(taskId, task)

  enqueue(async () => {
    const current = tasks.get(taskId)
    if (!current) {
      return
    }
    current.status = 'processing'
    current.updatedAt = Date.now()
    try {
      const outputUrl = await runGeneration('image', req.body || {})
      current.status = 'succeeded'
      current.outputUrl = outputUrl
      current.updatedAt = Date.now()
    }
    catch (error) {
      current.status = 'failed'
      current.error = error instanceof Error ? error.message : String(error)
      current.updatedAt = Date.now()
    }
    compactTasks()
  })

  res.json({ taskId, status: 'queued' })
})

app.post('/v1/video/generate', async (req, res) => {
  const taskId = uuidv4()
  const task = {
    id: taskId,
    type: 'video',
    status: 'queued',
    outputUrl: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  tasks.set(taskId, task)

  enqueue(async () => {
    const current = tasks.get(taskId)
    if (!current) {
      return
    }
    current.status = 'processing'
    current.updatedAt = Date.now()
    try {
      const outputUrl = await runGeneration('video', req.body || {})
      current.status = 'succeeded'
      current.outputUrl = outputUrl
      current.updatedAt = Date.now()
    }
    catch (error) {
      current.status = 'failed'
      current.error = error instanceof Error ? error.message : String(error)
      current.updatedAt = Date.now()
    }
    compactTasks()
  })

  res.json({ taskId, status: 'queued' })
})

app.get('/v1/tasks/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId)
  if (!task) {
    return res.status(404).json({ message: 'Task not found' })
  }
  return res.json({
    taskId: task.id,
    status: task.status,
    outputUrl: task.outputUrl || undefined,
    error: task.error || undefined,
  })
})

app.listen(PORT, () => {
  console.log(`google-flow-playwright-worker listening on :${PORT}`)
})
