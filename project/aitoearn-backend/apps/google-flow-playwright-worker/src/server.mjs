import express from "express"
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"
import { v4 as uuidv4 } from "uuid"

const app = express()
app.use(express.json({ limit: "1mb" }))

const PORT = Number(process.env.PORT || 4310)
const API_KEY = process.env.GOOGLE_FLOW_WORKER_API_KEY || ""
const FLOW_URL = process.env.GOOGLE_FLOW_URL || "https://labs.google/fx/tools/flow"
const PROFILES_ROOT_DIR = process.env.GOOGLE_FLOW_PROFILES_ROOT_DIR || "/tmp/google-flow-profiles"
const HEADLESS = String(process.env.GOOGLE_FLOW_HEADLESS || "true").toLowerCase() === "true"
const ACTION_TIMEOUT_MS = Number(process.env.GOOGLE_FLOW_ACTION_TIMEOUT_MS || 120000)
const TASK_TTL_MS = Number(process.env.GOOGLE_FLOW_TASK_TTL_MS || 24 * 60 * 60 * 1000)
const LEGACY_DEFAULT_PROFILE_ID = process.env.GOOGLE_FLOW_DEFAULT_PROFILE_ID || "legacy-default"
const LOGIN_SNAPSHOT_ENABLED = String(process.env.GOOGLE_FLOW_LOGIN_SNAPSHOT_ENABLED || "true").toLowerCase() === "true"

const SELECTOR_PROMPT = (process.env.GOOGLE_FLOW_SELECTOR_PROMPT || "textarea,[contenteditable=\"true\"],input[type=\"text\"]").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_SUBMIT = (process.env.GOOGLE_FLOW_SELECTOR_SUBMIT || "button:has-text(\"Generate\"),button:has-text(\"Create\"),button:has-text(\"Run\")").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_IMAGE_OUTPUT = (process.env.GOOGLE_FLOW_SELECTOR_IMAGE_OUTPUT || "img[src^=\"https://\"],img[src^=\"blob:\"]").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_VIDEO_OUTPUT = (process.env.GOOGLE_FLOW_SELECTOR_VIDEO_OUTPUT || "video[src],video source[src],a[href$=\".mp4\"]").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_LOGIN_MARKER = (process.env.GOOGLE_FLOW_SELECTOR_LOGIN_MARKER || "input[type=\"email\"],button:has-text(\"Sign in\"),a:has-text(\"Sign in\")").split(",").map(s => s.trim()).filter(Boolean)

const PROFILE_STATE_IDLE = "idle"
const PROFILE_STATE_STARTING = "starting"
const PROFILE_STATE_AWAITING_CHALLENGE = "awaiting_challenge"
const PROFILE_STATE_AUTHENTICATED = "authenticated"
const PROFILE_STATE_EXPIRED = "expired"
const PROFILE_STATE_FAILED = "failed"

const profiles = new Map()
const contexts = new Map()
const profileQueues = new Map()
const tasks = new Map()

function authGuard(req, res, next) {
  if (!API_KEY) {
    return next()
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "")
  if (token !== API_KEY) {
    return res.status(401).json({ message: "Unauthorized" })
  }
  return next()
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function nowIso() {
  return new Date().toISOString()
}

function compactTasks() {
  const now = Date.now()
  for (const [id, task] of tasks.entries()) {
    if (now - task.createdAt > TASK_TTL_MS) {
      tasks.delete(id)
    }
  }
}

function safeFilename(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 128)
}

function profileDir(profileId) {
  return path.join(PROFILES_ROOT_DIR, safeFilename(profileId))
}

function profileMetaPath(profileId) {
  return path.join(profileDir(profileId), "profile.json")
}

function appendEvent(profile, level, message, extra = {}) {
  const event = {
    at: nowIso(),
    level,
    message,
    ...extra,
  }
  profile.debug.events.unshift(event)
  if (profile.debug.events.length > 200) {
    profile.debug.events.length = 200
  }
  profile.updatedAt = nowIso()
}

function serializeProfile(profile) {
  return {
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    capabilities: profile.capabilities,
    headless: profile.headless,
    status: profile.status,
    account: profile.account || undefined,
    loginUrl: FLOW_URL,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

function createProfileRuntime(input = {}) {
  const id = String(input.id || uuidv4())
  const now = nowIso()
  return {
    id,
    label: String(input.label || id),
    provider: String(input.provider || "google-flow"),
    capabilities: Array.isArray(input.capabilities) && input.capabilities.length
      ? input.capabilities.map(v => String(v))
      : ["image", "video"],
    headless: typeof input.headless === "boolean" ? input.headless : HEADLESS,
    status: String(input.status || PROFILE_STATE_IDLE),
    account: typeof input.account === "string" ? input.account : "",
    loginUrl: FLOW_URL,
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
    debug: {
      lastStep: "",
      lastError: "",
      lastUrl: FLOW_URL,
      lastSnapshotPath: "",
      events: [],
    },
  }
}

function writeProfileMeta(profile) {
  const dir = profileDir(profile.id)
  ensureDir(dir)
  const meta = {
    ...serializeProfile(profile),
    debug: profile.debug,
  }
  fs.writeFileSync(profileMetaPath(profile.id), JSON.stringify(meta, null, 2), "utf8")
}

function loadProfilesFromDisk() {
  ensureDir(PROFILES_ROOT_DIR)
  const profileDirs = fs.readdirSync(PROFILES_ROOT_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const entry of profileDirs) {
    const metaFile = path.join(PROFILES_ROOT_DIR, entry.name, "profile.json")
    if (!fs.existsSync(metaFile)) {
      continue
    }
    try {
      const raw = JSON.parse(fs.readFileSync(metaFile, "utf8"))
      const profile = createProfileRuntime(raw)
      if (raw?.debug && typeof raw.debug === "object") {
        profile.debug = {
          lastStep: String(raw.debug.lastStep || ""),
          lastError: String(raw.debug.lastError || ""),
          lastUrl: String(raw.debug.lastUrl || FLOW_URL),
          lastSnapshotPath: String(raw.debug.lastSnapshotPath || ""),
          events: Array.isArray(raw.debug.events) ? raw.debug.events.slice(0, 200) : [],
        }
      }
      profiles.set(profile.id, profile)
    }
    catch {
      // ignore invalid profile metadata
    }
  }
}

function ensureLegacyProfile() {
  if (profiles.has(LEGACY_DEFAULT_PROFILE_ID)) {
    return
  }
  const profile = createProfileRuntime({
    id: LEGACY_DEFAULT_PROFILE_ID,
    label: "Legacy Default",
    provider: "google-flow",
    capabilities: ["image", "video"],
  })
  appendEvent(profile, "info", "Legacy default profile initialized.")
  profiles.set(profile.id, profile)
  writeProfileMeta(profile)
}

function getProfileOrThrow(profileId) {
  const id = String(profileId || "")
  const profile = profiles.get(id)
  if (!profile) {
    const error = new Error(`Profile not found: ${id}`)
    error.statusCode = 404
    throw error
  }
  return profile
}

function enqueueForProfile(profileId, taskFn) {
  const currentQueue = profileQueues.get(profileId) || Promise.resolve()
  const nextQueue = currentQueue.then(taskFn, taskFn)
  profileQueues.set(profileId, nextQueue)
  return nextQueue
}

async function closeProfileContext(profileId) {
  const promise = contexts.get(profileId)
  if (!promise) {
    return
  }
  const context = await promise
  await context.close().catch(() => {})
  contexts.delete(profileId)
}

async function getProfileContext(profile) {
  const existing = contexts.get(profile.id)
  if (existing) {
    return existing
  }

  const userDataDir = path.join(profileDir(profile.id), "user-data")
  ensureDir(userDataDir)
  const contextPromise = chromium.launchPersistentContext(userDataDir, {
    headless: profile.headless,
    viewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  contexts.set(profile.id, contextPromise)
  return contextPromise
}

async function firstSelector(page, selectors, timeoutMs = 5000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if (await locator.count()) {
      try {
        await locator.waitFor({ state: "visible", timeout: timeoutMs })
        return locator
      }
      catch {
        // ignore selector candidate failure
      }
    }
  }
  return null
}

async function openFlowPage(profile) {
  const context = await getProfileContext(profile)
  const page = await context.newPage()
  await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS })
  profile.debug.lastUrl = page.url()
  return page
}

async function detectLoginRequired(page) {
  const marker = await firstSelector(page, SELECTOR_LOGIN_MARKER, 2500)
  return !!marker
}

async function detectAccount(page) {
  return await page.evaluate(() => {
    const txt = document.body?.innerText || ""
    const m = txt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    return m ? m[0] : null
  })
}

async function saveSnapshot(profile, page, label) {
  if (!LOGIN_SNAPSHOT_ENABLED) {
    return ""
  }
  try {
    const debugDir = path.join(profileDir(profile.id), "debug")
    ensureDir(debugDir)
    const filename = `${Date.now()}-${safeFilename(label)}.png`
    const fullpath = path.join(debugDir, filename)
    await page.screenshot({ path: fullpath, fullPage: true })
    profile.debug.lastSnapshotPath = fullpath
    return fullpath
  }
  catch {
    return ""
  }
}

async function ensureProfileAuthenticated(profile, page) {
  const requiresLogin = await detectLoginRequired(page)
  if (!requiresLogin) {
    profile.status = PROFILE_STATE_AUTHENTICATED
    profile.account = (await detectAccount(page)) || ""
    profile.debug.lastStep = "authenticated"
    profile.debug.lastError = ""
    appendEvent(profile, "success", "Session authenticated.", {
      account: profile.account || undefined,
    })
    writeProfileMeta(profile)
    return
  }

  profile.status = PROFILE_STATE_AWAITING_CHALLENGE
  profile.debug.lastStep = "awaiting_challenge"
  profile.debug.lastError = "Login challenge detected. Complete verification then call resume."
  await saveSnapshot(profile, page, "awaiting-challenge")
  appendEvent(profile, "warn", "Login challenge detected; waiting for manual verification.")
  writeProfileMeta(profile)
  throw new Error("Profile requires login challenge completion. Call /login/resume after verification.")
}

async function openAndCheckLogin(profile) {
  const page = await openFlowPage(profile)
  try {
    await ensureProfileAuthenticated(profile, page)
    return {
      loggedIn: true,
      account: profile.account || undefined,
      status: profile.status,
    }
  }
  finally {
    await page.close().catch(() => {})
  }
}

async function extractMediaUrl(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).last()
    if (await locator.count()) {
      const href = await locator.getAttribute("href")
      const src = await locator.getAttribute("src")
      const text = await locator.innerText().catch(() => "")
      const candidate = href || src || (text?.startsWith("http") ? text : "")
      if (candidate) {
        return candidate
      }
    }
  }
  return null
}

async function runGeneration(profile, kind, payload) {
  const page = await openFlowPage(profile)
  try {
    await ensureProfileAuthenticated(profile, page)

    const promptInput = await firstSelector(page, SELECTOR_PROMPT, 8000)
    if (!promptInput) {
      throw new Error("Prompt input selector not found. Update worker selectors.")
    }

    const prompt = String(payload.prompt || "").trim()
    if (!prompt) {
      throw new Error("Prompt is required")
    }

    await promptInput.click()
    await promptInput.fill("")
    await promptInput.type(prompt, { delay: 8 })

    const submitButton = await firstSelector(page, SELECTOR_SUBMIT, 5000)
    if (!submitButton) {
      throw new Error("Generate button selector not found. Update worker selectors.")
    }
    await submitButton.click()

    const outputSelectors = kind === "video" ? SELECTOR_VIDEO_OUTPUT : SELECTOR_IMAGE_OUTPUT
    const deadline = Date.now() + ACTION_TIMEOUT_MS
    while (Date.now() < deadline) {
      const outputUrl = await extractMediaUrl(page, outputSelectors)
      if (outputUrl) {
        appendEvent(profile, "success", `${kind} output URL extracted.`)
        writeProfileMeta(profile)
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

function parseCapabilities(input) {
  if (!Array.isArray(input)) {
    return ["image", "video"]
  }
  const allowed = new Set(["image", "video"])
  const unique = [...new Set(input.map(v => String(v).toLowerCase()).filter(v => allowed.has(v)))]
  return unique.length ? unique : ["image", "video"]
}

function requireProfileCapability(profile, capability) {
  if (!profile.capabilities.includes(capability)) {
    const error = new Error(`Profile ${profile.id} does not support ${capability}`)
    error.statusCode = 400
    throw error
  }
}

function sendError(res, error) {
  const statusCode = Number(error?.statusCode) || 500
  return res.status(statusCode).json({ message: error?.message || "Internal error" })
}

app.use(authGuard)

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.post("/v1/profiles", (req, res) => {
  try {
    const body = req.body || {}
    const profile = createProfileRuntime({
      id: body.id,
      label: body.label,
      provider: body.provider || "google-flow",
      capabilities: parseCapabilities(body.capabilities),
      headless: typeof body.headless === "boolean" ? body.headless : HEADLESS,
    })

    if (profiles.has(profile.id)) {
      return res.status(409).json({ message: `Profile already exists: ${profile.id}` })
    }

    appendEvent(profile, "info", "Profile created.")
    profiles.set(profile.id, profile)
    writeProfileMeta(profile)
    return res.json(serializeProfile(profile))
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.get("/v1/profiles", (_req, res) => {
  res.json({
    profiles: [...profiles.values()].map(serializeProfile),
  })
})

app.get("/v1/profiles/:id", (req, res) => {
  try {
    const profile = getProfileOrThrow(req.params.id)
    return res.json(serializeProfile(profile))
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.post("/v1/profiles/:id/login/start", async (req, res) => {
  try {
    const profile = getProfileOrThrow(req.params.id)
    profile.status = PROFILE_STATE_STARTING
    profile.debug.lastStep = "login_start_requested"
    profile.debug.lastError = ""
    appendEvent(profile, "info", "Login flow started.")
    writeProfileMeta(profile)

    await enqueueForProfile(profile.id, async () => {
      try {
        await openAndCheckLogin(profile)
      }
      catch (error) {
        if (profile.status !== PROFILE_STATE_AWAITING_CHALLENGE) {
          profile.status = PROFILE_STATE_FAILED
          profile.debug.lastError = error instanceof Error ? error.message : String(error)
          appendEvent(profile, "error", profile.debug.lastError)
          writeProfileMeta(profile)
        }
        throw error
      }
    })

    return res.json({
      profile: serializeProfile(profile),
      status: profile.status,
      loginUrl: FLOW_URL,
      account: profile.account || undefined,
      note: profile.status === PROFILE_STATE_AUTHENTICATED
        ? "Login flow completed."
        : "Login challenge detected. Complete verification then call resume.",
    })
  }
  catch (error) {
    if (String(error?.message || "").includes("challenge")) {
      const profile = profiles.get(req.params.id)
      return res.status(202).json({
        profile: profile ? serializeProfile(profile) : undefined,
        status: profile?.status || PROFILE_STATE_AWAITING_CHALLENGE,
        loginUrl: FLOW_URL,
        note: "Challenge required. Complete verification and call /login/resume.",
      })
    }
    return sendError(res, error)
  }
})

app.get("/v1/profiles/:id/login/status", async (req, res) => {
  try {
    const profile = getProfileOrThrow(req.params.id)
    await enqueueForProfile(profile.id, async () => {
      const page = await openFlowPage(profile)
      try {
        const requiresLogin = await detectLoginRequired(page)
        profile.account = (await detectAccount(page)) || ""
        profile.status = requiresLogin ? PROFILE_STATE_AWAITING_CHALLENGE : PROFILE_STATE_AUTHENTICATED
        profile.debug.lastStep = "login_status_checked"
        profile.debug.lastError = requiresLogin ? "Login required/challenge pending." : ""
        profile.debug.lastUrl = page.url()
        if (requiresLogin) {
          await saveSnapshot(profile, page, "status-awaiting-challenge")
        }
        appendEvent(profile, requiresLogin ? "warn" : "success", requiresLogin ? "Status checked: awaiting challenge." : "Status checked: authenticated.")
        writeProfileMeta(profile)
      }
      finally {
        await page.close().catch(() => {})
      }
    })

    return res.json({
      profile: serializeProfile(profile),
      loggedIn: profile.status === PROFILE_STATE_AUTHENTICATED,
      account: profile.account || undefined,
      status: profile.status,
    })
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.post("/v1/profiles/:id/login/resume", async (req, res) => {
  try {
    const profile = getProfileOrThrow(req.params.id)
    appendEvent(profile, "info", "Login resume requested.")

    await enqueueForProfile(profile.id, async () => {
      const page = await openFlowPage(profile)
      try {
        const requiresLogin = await detectLoginRequired(page)
        if (requiresLogin) {
          profile.status = PROFILE_STATE_AWAITING_CHALLENGE
          profile.debug.lastStep = "resume_awaiting_challenge"
          profile.debug.lastError = "Challenge is still pending."
          await saveSnapshot(profile, page, "resume-awaiting-challenge")
          appendEvent(profile, "warn", "Resume checked: challenge still pending.")
          writeProfileMeta(profile)
          return
        }

        profile.status = PROFILE_STATE_AUTHENTICATED
        profile.account = (await detectAccount(page)) || ""
        profile.debug.lastStep = "resume_authenticated"
        profile.debug.lastError = ""
        appendEvent(profile, "success", "Resume completed and session authenticated.", {
          account: profile.account || undefined,
        })
        writeProfileMeta(profile)
      }
      finally {
        await page.close().catch(() => {})
      }
    })

    return res.json({
      profile: serializeProfile(profile),
      loggedIn: profile.status === PROFILE_STATE_AUTHENTICATED,
      account: profile.account || undefined,
      status: profile.status,
      loginUrl: FLOW_URL,
    })
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.post("/v1/profiles/:id/login/reset", async (req, res) => {
  try {
    const profile = getProfileOrThrow(req.params.id)

    await enqueueForProfile(profile.id, async () => {
      await closeProfileContext(profile.id)
      profile.status = PROFILE_STATE_IDLE
      profile.account = ""
      profile.debug.lastStep = "login_reset"
      profile.debug.lastError = ""
      appendEvent(profile, "warn", "Session reset. Login required again.")
      writeProfileMeta(profile)
    })

    return res.json({
      profile: serializeProfile(profile),
      loggedIn: false,
      status: profile.status,
      loginUrl: FLOW_URL,
      note: "Session reset done. Start login again.",
    })
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.get("/v1/profiles/:id/debug", (req, res) => {
  try {
    const profile = getProfileOrThrow(req.params.id)
    return res.json({
      profile: serializeProfile(profile),
      debug: profile.debug,
    })
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.post("/v1/image/generate", async (req, res) => {
  try {
    const profileId = String(req.body?.profileId || "").trim()
    if (!profileId) {
      return res.status(400).json({ message: "profileId is required" })
    }

    const profile = getProfileOrThrow(profileId)
    requireProfileCapability(profile, "image")

    const taskId = uuidv4()
    const task = {
      id: taskId,
      type: "image",
      profileId,
      status: "queued",
      outputUrl: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    tasks.set(taskId, task)

    enqueueForProfile(profileId, async () => {
      const current = tasks.get(taskId)
      if (!current) {
        return
      }
      current.status = "processing"
      current.updatedAt = Date.now()
      try {
        const outputUrl = await runGeneration(profile, "image", req.body || {})
        current.status = "succeeded"
        current.outputUrl = outputUrl
        current.updatedAt = Date.now()
      }
      catch (error) {
        current.status = "failed"
        current.error = error instanceof Error ? error.message : String(error)
        current.updatedAt = Date.now()
        profile.status = profile.status === PROFILE_STATE_AWAITING_CHALLENGE ? PROFILE_STATE_AWAITING_CHALLENGE : PROFILE_STATE_FAILED
        profile.debug.lastError = current.error
        appendEvent(profile, "error", `Image generation failed: ${current.error}`)
        writeProfileMeta(profile)
      }
      compactTasks()
    })

    return res.json({ taskId, status: "queued", profileId })
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.post("/v1/video/generate", async (req, res) => {
  try {
    const profileId = String(req.body?.profileId || "").trim()
    if (!profileId) {
      return res.status(400).json({ message: "profileId is required" })
    }

    const profile = getProfileOrThrow(profileId)
    requireProfileCapability(profile, "video")

    const taskId = uuidv4()
    const task = {
      id: taskId,
      type: "video",
      profileId,
      status: "queued",
      outputUrl: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    tasks.set(taskId, task)

    enqueueForProfile(profileId, async () => {
      const current = tasks.get(taskId)
      if (!current) {
        return
      }
      current.status = "processing"
      current.updatedAt = Date.now()
      try {
        const outputUrl = await runGeneration(profile, "video", req.body || {})
        current.status = "succeeded"
        current.outputUrl = outputUrl
        current.updatedAt = Date.now()
      }
      catch (error) {
        current.status = "failed"
        current.error = error instanceof Error ? error.message : String(error)
        current.updatedAt = Date.now()
        profile.status = profile.status === PROFILE_STATE_AWAITING_CHALLENGE ? PROFILE_STATE_AWAITING_CHALLENGE : PROFILE_STATE_FAILED
        profile.debug.lastError = current.error
        appendEvent(profile, "error", `Video generation failed: ${current.error}`)
        writeProfileMeta(profile)
      }
      compactTasks()
    })

    return res.json({ taskId, status: "queued", profileId })
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.get("/v1/tasks/:taskId", (req, res) => {
  const task = tasks.get(req.params.taskId)
  if (!task) {
    return res.status(404).json({ message: "Task not found" })
  }
  return res.json({
    taskId: task.id,
    profileId: task.profileId,
    status: task.status,
    outputUrl: task.outputUrl || undefined,
    error: task.error || undefined,
  })
})

// Legacy compatibility endpoints (single-profile shim)
app.get("/v1/auth/login-url", (_req, res) => {
  res.json({
    url: FLOW_URL,
    requiresLogin: true,
    profileId: LEGACY_DEFAULT_PROFILE_ID,
    note: "Deprecated endpoint. Use /v1/profiles/{id}/login/start.",
  })
})

app.get("/v1/auth/session-status", async (_req, res) => {
  try {
    const profile = getProfileOrThrow(LEGACY_DEFAULT_PROFILE_ID)
    await enqueueForProfile(profile.id, async () => {
      const page = await openFlowPage(profile)
      try {
        const requiresLogin = await detectLoginRequired(page)
        profile.status = requiresLogin ? PROFILE_STATE_AWAITING_CHALLENGE : PROFILE_STATE_AUTHENTICATED
        profile.account = (await detectAccount(page)) || ""
        profile.debug.lastStep = "legacy_session_status_checked"
        profile.debug.lastError = requiresLogin ? "Login required" : ""
        appendEvent(profile, requiresLogin ? "warn" : "success", `Legacy status check: ${profile.status}`)
        writeProfileMeta(profile)
      }
      finally {
        await page.close().catch(() => {})
      }
    })

    return res.json({
      loggedIn: profile.status === PROFILE_STATE_AUTHENTICATED,
      account: profile.account || undefined,
      profileId: profile.id,
      status: profile.status,
      deprecated: true,
    })
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.post("/v1/auth/relogin", async (_req, res) => {
  try {
    const profile = getProfileOrThrow(LEGACY_DEFAULT_PROFILE_ID)
    await enqueueForProfile(profile.id, async () => {
      await closeProfileContext(profile.id)
      profile.status = PROFILE_STATE_IDLE
      profile.account = ""
      profile.debug.lastStep = "legacy_relogin_reset"
      profile.debug.lastError = ""
      appendEvent(profile, "warn", "Legacy relogin reset requested.")
      writeProfileMeta(profile)
    })
    return res.json({
      loggedIn: false,
      account: undefined,
      profileId: profile.id,
      status: profile.status,
      note: "Deprecated endpoint. Use /v1/profiles/{id}/login/reset.",
      deprecated: true,
    })
  }
  catch (error) {
    return sendError(res, error)
  }
})

loadProfilesFromDisk()
ensureLegacyProfile()

app.listen(PORT, () => {
  console.log(`google-flow-playwright-worker listening on :${PORT}`)
})
