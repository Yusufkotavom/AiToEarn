import express from "express"
import fs from "node:fs"
import path from "node:path"
import { chromium as baseChromium } from "playwright"
import { chromium as chromiumExtra } from "playwright-extra"
import StealthPlugin from "puppeteer-extra-plugin-stealth"
import { v4 as uuidv4 } from "uuid"

const app = express()
app.use(express.json({ limit: "1mb" }))

function compactBody(body) {
  if (!body || typeof body !== "object") {
    return undefined
  }
  const b = body
  return {
    profileId: typeof b.profileId === "string" ? b.profileId : undefined,
    model: typeof b.model === "string" ? b.model : undefined,
    promptLength: typeof b.prompt === "string" ? b.prompt.length : undefined,
    hasImage: typeof b.image === "string" && b.image.length > 0 ? true : undefined,
    size: typeof b.size === "string" ? b.size : undefined,
    duration: typeof b.duration === "number" ? b.duration : undefined,
  }
}

app.use((req, res, next) => {
  const start = Date.now()
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const bodyInfo = compactBody(req.body)
  console.log(`[req:${reqId}] ${req.method} ${req.path}${bodyInfo ? ` body=${JSON.stringify(bodyInfo)}` : ""}`)

  res.on("finish", () => {
    const ms = Date.now() - start
    console.log(`[res:${reqId}] ${req.method} ${req.path} status=${res.statusCode} ${ms}ms`)
  })
  next()
})

const PORT = Number(process.env.PORT || 4310)
const API_KEY = process.env.GOOGLE_FLOW_WORKER_API_KEY || ""
const FLOW_URL = process.env.GOOGLE_FLOW_URL || "https://labs.google/fx/tools/flow"
const PROFILES_ROOT_DIR = process.env.GOOGLE_FLOW_PROFILES_ROOT_DIR || process.env.GOOGLE_FLOW_USER_DATA_DIR || "/tmp/google-flow-profiles"
const DEBUG_EXPORT_DIR = process.env.GOOGLE_FLOW_DEBUG_EXPORT_DIR || ""
const HEADLESS = String(process.env.GOOGLE_FLOW_HEADLESS || "true").toLowerCase() === "true"
const ACTION_TIMEOUT_MS = Number(process.env.GOOGLE_FLOW_ACTION_TIMEOUT_MS || 120000)
const TASK_TTL_MS = Number(process.env.GOOGLE_FLOW_TASK_TTL_MS || 24 * 60 * 60 * 1000)
const LEGACY_DEFAULT_PROFILE_ID = process.env.GOOGLE_FLOW_DEFAULT_PROFILE_ID || "legacy-default"
const LOGIN_SNAPSHOT_ENABLED = String(process.env.GOOGLE_FLOW_LOGIN_SNAPSHOT_ENABLED || "true").toLowerCase() === "true"
const STEALTH_USER_AGENT = process.env.GOOGLE_FLOW_STEALTH_USER_AGENT
  || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
const STEALTH_LOCALE = process.env.GOOGLE_FLOW_STEALTH_LOCALE || "en-US"
const STEALTH_TIMEZONE = process.env.GOOGLE_FLOW_STEALTH_TIMEZONE || "America/New_York"
const STEALTH_PLATFORM = process.env.GOOGLE_FLOW_STEALTH_PLATFORM || "Win32"
const STEALTH_VENDOR = process.env.GOOGLE_FLOW_STEALTH_VENDOR || "Google Inc."
const STEALTH_ACCEPT_LANGUAGE = process.env.GOOGLE_FLOW_STEALTH_ACCEPT_LANGUAGE || "en-US,en;q=0.9"
const STEALTH_SEC_CH_UA = process.env.GOOGLE_FLOW_STEALTH_SEC_CH_UA
  || "\"Not(A:Brand\";v=\"99\", \"Google Chrome\";v=\"123\", \"Chromium\";v=\"123\""
const STEALTH_SEC_CH_UA_PLATFORM = process.env.GOOGLE_FLOW_STEALTH_SEC_CH_UA_PLATFORM || "\"Windows\""
const STEALTH_SEC_CH_UA_MOBILE = process.env.GOOGLE_FLOW_STEALTH_SEC_CH_UA_MOBILE || "?0"
const STEALTH_DNT = process.env.GOOGLE_FLOW_STEALTH_DNT || "1"
const STEALTH_PLUGIN_ENABLED = String(process.env.GOOGLE_FLOW_STEALTH_PLUGIN_ENABLED || "true").toLowerCase() === "true"
const BROWSER_CHANNEL = process.env.GOOGLE_FLOW_BROWSER_CHANNEL || "chrome"
const REMOTE_CDP_URL = process.env.GOOGLE_FLOW_REMOTE_CDP_URL || ""
const REMOTE_LOGIN_OPEN_URL = process.env.GOOGLE_FLOW_REMOTE_LOGIN_OPEN_URL || ""
const REMOTE_LOGIN_PUBLIC_URL = process.env.GOOGLE_FLOW_REMOTE_LOGIN_PUBLIC_URL || ""

if (STEALTH_PLUGIN_ENABLED) {
  chromiumExtra.use(StealthPlugin())
}

const chromium = STEALTH_PLUGIN_ENABLED ? chromiumExtra : baseChromium

const SELECTOR_PROMPT = (process.env.GOOGLE_FLOW_SELECTOR_PROMPT || "div[role=\"textbox\"],textarea[placeholder*=\"prompt\" i],textarea[aria-label*=\"prompt\" i],textarea[placeholder*=\"describe\" i],textarea:not([id^=\"g-recaptcha\"]),[contenteditable=\"true\"][role=\"textbox\"],div[role=\"textbox\"][contenteditable=\"true\"],input[type=\"text\"][placeholder*=\"prompt\" i],input[aria-label*=\"Editable text\" i]").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_SUBMIT = (process.env.GOOGLE_FLOW_SELECTOR_SUBMIT || [
  "button:has-text(\"Generate\")",
  "button:has-text(\"Create\")",
  "button:has-text(\"Run\")",
  "button:has-text(\"arrow_forward\")",
  "[role=\"button\"]:has-text(\"arrow_forward\")",
  "button[aria-label*=\"Generate\" i]",
  "button[aria-label*=\"Create\" i]",
  "button[aria-label*=\"Send\" i]",
  "[role=\"button\"][aria-label*=\"Generate\" i]",
  "[role=\"button\"][aria-label*=\"Send\" i]",
].join(",")).split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_IMAGE_OUTPUT = (process.env.GOOGLE_FLOW_SELECTOR_IMAGE_OUTPUT || "img[src^=\"https://\"],img[src^=\"blob:\"],img[src^=\"data:image/\"],source[srcset],a[href^=\"blob:\"],a[href^=\"data:image/\"]").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_VIDEO_OUTPUT = (process.env.GOOGLE_FLOW_SELECTOR_VIDEO_OUTPUT || "video[src],video source[src],a[href$=\".mp4\"]").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_LOGIN_MARKER = (process.env.GOOGLE_FLOW_SELECTOR_LOGIN_MARKER || "input[type=\"email\"],button:has-text(\"Sign in\"),a:has-text(\"Sign in\")").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_LOGIN_EMAIL = (process.env.GOOGLE_FLOW_SELECTOR_LOGIN_EMAIL || "input[type=\"email\"],input[name=\"identifier\"],input[autocomplete=\"username\"],input[type=\"text\"][autocomplete=\"username\"],input[type=\"text\"][name=\"identifier\"],input[type=\"text\"][aria-label*=\"Email\" i],input[type=\"text\"][aria-label*=\"phone\" i]").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_LOGIN_PASSWORD = (process.env.GOOGLE_FLOW_SELECTOR_LOGIN_PASSWORD || "input[type=\"password\"]").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_LOGIN_SUBMIT = (process.env.GOOGLE_FLOW_SELECTOR_LOGIN_SUBMIT || "button[type=\"submit\"],button:has-text(\"Next\"),button:has-text(\"Sign in\"),div[role=\"button\"]:has-text(\"Next\")").split(",").map(s => s.trim()).filter(Boolean)
const SELECTOR_DOWNLOAD = (process.env.GOOGLE_FLOW_SELECTOR_DOWNLOAD || [
  "button:has-text(\"Download\")",
  "button:has-text(\"download\")",
  "button:has-text(\"file_download\")",
  "[role=\"button\"]:has-text(\"Download\")",
  "[role=\"button\"][aria-label*=\"download\" i]",
  "a:has-text(\"Download\")",
  "a[download]",
].join(",")).split(",").map(s => s.trim()).filter(Boolean)

const PROFILE_STATE_IDLE = "idle"
const PROFILE_STATE_STARTING = "starting"
const PROFILE_STATE_AWAITING_CHALLENGE = "awaiting_challenge"
const PROFILE_STATE_AUTHENTICATED = "authenticated"
const PROFILE_STATE_EXPIRED = "expired"
const PROFILE_STATE_FAILED = "failed"

const FLOW_IMAGE_MODE_LABELS = ["Image", "image"]
const FLOW_VIDEO_MODE_LABELS = ["Video", "videocam Video", "videocam"]
const FLOW_MODEL_LABELS = {
  "google-flow-browser-image": "🍌 Nano Banana 2",
  "google-flow-browser-image-nano-banana-2": "🍌 Nano Banana 2",
  "google-flow-browser-image-nano-banana-pro": "🍌 Nano Banana Pro",
  "google-flow-browser-image-imagen-4": "Imagen 4",
  "google-flow-browser-video": "🍌 Nano Banana 2",
  "google-flow-browser-video-nano-banana-2": "🍌 Nano Banana 2",
  "google-flow-browser-video-nano-banana-pro": "🍌 Nano Banana Pro",
}

const profiles = new Map()
const contexts = new Map()
let remoteCdpBrowserPromise = null
let remoteCdpContextPromise = null
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
    loginUrl: profile.loginUrl || REMOTE_LOGIN_PUBLIC_URL || FLOW_URL,
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
    loginUrl: String(input.loginUrl || REMOTE_LOGIN_PUBLIC_URL || FLOW_URL),
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
  if (REMOTE_CDP_URL) {
    contexts.delete(profileId)
    return
  }
  const promise = contexts.get(profileId)
  if (!promise) {
    return
  }
  const context = await promise
  await context.close().catch(() => {})
  contexts.delete(profileId)
}

async function resolveRemoteCdpEndpoint() {
  const baseUrl = new URL(REMOTE_CDP_URL)
  const directVersionUrl = new URL("/json/version", baseUrl)
  let response = await fetch(directVersionUrl, {
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok && REMOTE_LOGIN_OPEN_URL) {
    const fallbackUrl = new URL("/v1/cdp/version", REMOTE_LOGIN_OPEN_URL)
    response = await fetch(fallbackUrl, {
      signal: AbortSignal.timeout(8000),
    })
  }
  if (!response.ok) {
    throw new Error(`Remote CDP discovery failed: HTTP ${response.status}`)
  }
  const payload = await response.json().catch(() => ({}))
  const rawWs = String(payload?.webSocketDebuggerUrl || "").trim()
  if (!rawWs) {
    throw new Error("Remote CDP discovery failed: missing webSocketDebuggerUrl")
  }
  const wsUrl = new URL(rawWs)
  const scheme = baseUrl.protocol === "https:" ? "wss:" : "ws:"
  wsUrl.protocol = scheme
  wsUrl.hostname = baseUrl.hostname
  wsUrl.port = baseUrl.port
  return wsUrl.toString()
}

async function getRemoteCdpContext() {
  if (!remoteCdpContextPromise) {
    remoteCdpContextPromise = (async () => {
      if (!remoteCdpBrowserPromise) {
        const wsEndpoint = await resolveRemoteCdpEndpoint()
        remoteCdpBrowserPromise = chromium.connectOverCDP(wsEndpoint, {
          timeout: ACTION_TIMEOUT_MS,
        })
      }
      const browser = await remoteCdpBrowserPromise
      const existingContexts = browser.contexts()
      if (existingContexts.length > 0) {
        return existingContexts[0]
      }
      return await browser.newContext({
        viewport: { width: 1440, height: 900 },
      })
    })().catch((error) => {
      remoteCdpContextPromise = null
      remoteCdpBrowserPromise = null
      throw error
    })
  }
  return await remoteCdpContextPromise
}

function resetRemoteCdpSession() {
  remoteCdpContextPromise = null
  remoteCdpBrowserPromise = null
}

async function openRemoteLoginBrowser(profile) {
  if (!REMOTE_LOGIN_OPEN_URL) {
    profile.loginUrl = REMOTE_LOGIN_PUBLIC_URL || FLOW_URL
    return
  }
  try {
    const response = await fetch(REMOTE_LOGIN_OPEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: profile.id,
        url: FLOW_URL,
      }),
      signal: AbortSignal.timeout(15000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(String(payload?.message || `Remote login open failed: HTTP ${response.status}`))
    }
    const candidateUrl = String(payload?.noVncUrl || payload?.loginUrl || "").trim()
    if (candidateUrl) {
      profile.loginUrl = candidateUrl
    } else {
      profile.loginUrl = REMOTE_LOGIN_PUBLIC_URL || FLOW_URL
    }
  }
  catch (error) {
    appendEvent(profile, "warn", `Remote login browser open failed: ${error instanceof Error ? error.message : String(error)}`)
    profile.loginUrl = REMOTE_LOGIN_PUBLIC_URL || FLOW_URL
  }
}

async function getProfileContext(profile) {
  if (REMOTE_CDP_URL) {
    const remoteContextPromise = getRemoteCdpContext()
    contexts.set(profile.id, remoteContextPromise)
    return await remoteContextPromise
  }
  const existing = contexts.get(profile.id)
  if (existing) {
    return existing
  }

  const userDataDir = path.join(profileDir(profile.id), "user-data")
  ensureDir(userDataDir)
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  let launchHeadless = Boolean(profile.headless)
  if (!launchHeadless && !hasDisplay) {
    launchHeadless = true
    profile.headless = true
    appendEvent(profile, "warn", "No DISPLAY detected. Falling back to headless mode.")
    writeProfileMeta(profile)
  }

  const launchContext = async (headless) => {
    const launchOptions = {
      headless,
      viewport: { width: 1440, height: 900 },
      channel: BROWSER_CHANNEL,
      userAgent: STEALTH_USER_AGENT,
      locale: STEALTH_LOCALE,
      timezoneId: STEALTH_TIMEZONE,
      colorScheme: "light",
      extraHTTPHeaders: {
        "accept-language": STEALTH_ACCEPT_LANGUAGE,
        "sec-ch-ua": STEALTH_SEC_CH_UA,
        "sec-ch-ua-mobile": STEALTH_SEC_CH_UA_MOBILE,
        "sec-ch-ua-platform": STEALTH_SEC_CH_UA_PLATFORM,
        "dnt": STEALTH_DNT,
      },
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1440,900",
      ],
    }
    const contextPromise = chromium.launchPersistentContext(userDataDir, launchOptions)
    contexts.set(profile.id, contextPromise)
    try {
      const context = await contextPromise
      await context.addInitScript((opts) => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        })
        Object.defineProperty(navigator, "platform", {
          get: () => opts.platform,
        })
        Object.defineProperty(navigator, "vendor", {
          get: () => opts.vendor,
        })
        Object.defineProperty(navigator, "language", {
          get: () => opts.language,
        })
        Object.defineProperty(navigator, "languages", {
          get: () => [opts.language, "en"],
        })
        Object.defineProperty(navigator, "hardwareConcurrency", {
          get: () => 8,
        })
        Object.defineProperty(navigator, "deviceMemory", {
          get: () => 8,
        })
        Object.defineProperty(navigator, "maxTouchPoints", {
          get: () => 0,
        })
        Object.defineProperty(navigator, "plugins", {
          get: () => [1, 2, 3, 4, 5],
        })
        Object.defineProperty(navigator, "mimeTypes", {
          get: () => [1, 2, 3],
        })
        if (!window.chrome) {
          Object.defineProperty(window, "chrome", {
            value: { runtime: {} },
            configurable: false,
            enumerable: true,
            writable: false,
          })
        }
        const originalQuery = window.navigator.permissions?.query
        if (originalQuery) {
          window.navigator.permissions.query = (parameters) => (
            parameters?.name === "notifications"
              ? Promise.resolve({ state: Notification.permission })
              : originalQuery(parameters)
          )
        }
      }, {
        platform: STEALTH_PLATFORM,
        vendor: STEALTH_VENDOR,
        language: STEALTH_LOCALE,
      })
      return context
    }
    catch (error) {
      contexts.delete(profile.id)
      const message = String(error?.message || "")
      if (BROWSER_CHANNEL && /channel|executable|not found|chrome/i.test(message)) {
        const fallbackPromise = chromium.launchPersistentContext(userDataDir, { ...launchOptions, channel: undefined })
        contexts.set(profile.id, fallbackPromise)
        try {
          return await fallbackPromise
        }
        catch (fallbackError) {
          contexts.delete(profile.id)
          throw fallbackError
        }
      }
      throw error
    }
  }

  try {
    return await launchContext(launchHeadless)
  }
  catch (error) {
    const message = String(error?.message || "")
    if (!launchHeadless && /Missing X server|\$DISPLAY|headless/i.test(message)) {
      profile.headless = true
      appendEvent(profile, "warn", "Headed launch failed; retrying with headless mode.")
      writeProfileMeta(profile)
      return await launchContext(true)
    }
    throw error
  }
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
  const open = async () => {
    const context = await getProfileContext(profile)
    const page = await context.newPage()
    await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS })
    profile.debug.lastUrl = page.url()
    return page
  }

  try {
    return await open()
  }
  catch (error) {
    const message = String(error?.message || "")
    const remoteClosed = REMOTE_CDP_URL && /(context|browser).*(closed|disconnected)|Target page, context or browser has been closed/i.test(message)
    const transientFetchFailed = /fetch failed|net::err_/i.test(message)
    if (!remoteClosed && !transientFetchFailed) {
      throw error
    }

    // Remote Chrome can be restarted while worker still holds stale CDP context.
    // Reset and retry once so status/resume keep using the same logged-in profile session.
    await closeProfileContext(profile.id).catch(() => {})
    resetRemoteCdpSession()
    contexts.delete(profile.id)
    appendEvent(profile, "warn", transientFetchFailed
      ? "Transient page fetch failure; reconnecting CDP session."
      : "CDP context was closed; reconnecting.")
    writeProfileMeta(profile)
    await new Promise(resolve => setTimeout(resolve, 600))
    return await open()
  }
}

async function detectLoginRequired(page) {
  const currentUrl = page.url()
  if (/accounts\.google\.com/i.test(currentUrl) || /\/signin/i.test(currentUrl)) {
    return true
  }
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
    if (DEBUG_EXPORT_DIR) {
      const exportDir = path.join(DEBUG_EXPORT_DIR, safeFilename(profile.id))
      ensureDir(exportDir)
      const exportPath = path.join(exportDir, filename)
      fs.copyFileSync(fullpath, exportPath)
    }
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

async function clickSubmitIfPresent(page) {
  const submitButton = await firstSelector(page, SELECTOR_LOGIN_SUBMIT, 2000)
  if (submitButton) {
    await submitButton.click().catch(() => {})
    return true
  }
  await page.keyboard.press("Enter").catch(() => {})
  return false
}

async function detectAuthFailureMessage(page) {
  const text = await page.evaluate(() => (document.body?.innerText || "").slice(0, 12000)).catch(() => "")
  if (!text) {
    return null
  }
  const candidates = [
    "wrong password",
    "try again",
    "couldn’t find your google account",
    "couldn't find your google account",
    "enter a valid email",
    "incorrect password",
    "invalid email",
    "couldn't sign you in",
    "couldn’t sign you in",
    "browser or app may not be secure",
  ]
  const lower = text.toLowerCase()
  const hit = candidates.find(candidate => lower.includes(candidate))
  return hit || null
}

async function loginWithCredentials(profile, email, password) {
  const page = await openFlowPage(profile)
  try {
    await saveSnapshot(profile, page, "credentials-opened")
    // Don't trust landing page only; verify workspace prompt before considering authenticated.
    let promptInput = await firstSelector(page, SELECTOR_PROMPT, 1200)
    if (!promptInput) {
      await clickRoleByName(page, "button", ["Create with Flow", "Get Started", "Create", "New project", "New Project", "Create project", "Blank"]).catch(() => {})
      await clickRoleByName(page, "link", ["Create with Flow", "Get Started", "Create", "New project", "New Project", "Create project", "Blank"]).catch(() => {})
      await page.waitForTimeout(1200)
      promptInput = await firstSelector(page, SELECTOR_PROMPT, 1200)
    }
    if (promptInput && !(await detectLoginRequired(page))) {
      profile.status = PROFILE_STATE_AUTHENTICATED
      profile.account = (await detectAccount(page)) || ""
      profile.debug.lastStep = "credentials_already_authenticated"
      profile.debug.lastError = ""
      await saveSnapshot(profile, page, "credentials-already-authenticated")
      appendEvent(profile, "success", "Credentials login skipped: already authenticated.")
      writeProfileMeta(profile)
      return
    }

    // User-requested flow: click Create first, then proceed login form.
    const createNames = ["Create with Flow", "Create", "Get Started", "New project", "New Project", "Create project", "Blank"]
    await clickRoleByName(page, "button", createNames).catch(() => {})
    await clickRoleByName(page, "link", createNames).catch(() => {})
    await forceClickByText(page, createNames).catch(() => false)
    await page.waitForTimeout(1800)
    if (await isSignupPage(page)) {
      const signInNames = ["Sign in instead", "Sign in", "Masuk"]
      await clickRoleByName(page, "button", signInNames).catch(() => {})
      await clickRoleByName(page, "link", signInNames).catch(() => {})
      await forceClickByText(page, signInNames).catch(() => false)
      await page.waitForTimeout(1500)
      if (await isSignupPage(page)) {
        const signInUrl = extractSignInUrlFromSignup(page.url()) || await discoverSignInUrlFromPage(page)
        if (signInUrl) {
          await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS })
          await page.waitForTimeout(1000)
        } else {
          await page.goBack({ waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS }).catch(() => {})
          await page.waitForTimeout(1000)
        }
      }
      await saveSnapshot(profile, page, "credentials-signin-instead-clicked")
    }
    await saveSnapshot(profile, page, "credentials-after-create-click")
    if (await isGoogle400Page(page)) {
      await recoverFromGoogle400(page)
      await saveSnapshot(profile, page, "credentials-after-400-recovery")
    }

    profile.debug.lastStep = "credentials_email_input"
    let emailInput = await findEmailInput(page)
    if (!emailInput) {
      for (let attempt = 0; attempt < 2 && !emailInput; attempt++) {
        if (await isSignupPage(page)) {
          const signInNames = ["Sign in instead", "Sign in", "Masuk"]
          await clickRoleByName(page, "button", signInNames).catch(() => {})
          await clickRoleByName(page, "link", signInNames).catch(() => {})
          await forceClickByText(page, signInNames).catch(() => false)
        } else if (await isGoogle400Page(page)) {
          await recoverFromGoogle400(page)
        } else if (!(await detectLoginRequired(page))) {
          await clickRoleByName(page, "button", createNames).catch(() => {})
          await clickRoleByName(page, "link", createNames).catch(() => {})
          await forceClickByText(page, createNames).catch(() => false)
        }
        await page.waitForTimeout(1200)
        emailInput = await findEmailInput(page)
      }
    }
    if (!emailInput) {
      throw new Error("Email input not found. Update GOOGLE_FLOW_SELECTOR_LOGIN_EMAIL.")
    }
    await emailInput.click()
    await emailInput.fill("")
    await emailInput.type(email, { delay: 10 })
    await saveSnapshot(profile, page, "credentials-email-filled")
    await clickSubmitIfPresent(page)
    await saveSnapshot(profile, page, "credentials-email-submitted")

    profile.debug.lastStep = "credentials_password_input"
    await page.waitForTimeout(1200)
    const prePasswordFailure = await detectAuthFailureMessage(page)
    if (prePasswordFailure) {
      await saveSnapshot(profile, page, "credentials-failed-message")
      throw new Error(`Google login failed: ${prePasswordFailure}`)
    }
    const passwordInput = await firstSelector(page, SELECTOR_LOGIN_PASSWORD, 10000)
    if (!passwordInput) {
      throw new Error("Password input not found. Challenge may be required.")
    }
    await passwordInput.click()
    await passwordInput.fill("")
    await passwordInput.type(password, { delay: 10 })
    await saveSnapshot(profile, page, "credentials-password-filled")
    await clickSubmitIfPresent(page)
    await saveSnapshot(profile, page, "credentials-password-submitted")

    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const failMessage = await detectAuthFailureMessage(page)
      if (failMessage) {
        await saveSnapshot(profile, page, "credentials-failed-message")
        throw new Error(`Google login failed: ${failMessage}`)
      }
      const requiresLogin = await detectLoginRequired(page)
      if (!requiresLogin) {
        profile.status = PROFILE_STATE_AUTHENTICATED
        profile.account = (await detectAccount(page)) || ""
        profile.debug.lastStep = "credentials_authenticated"
        profile.debug.lastError = ""
        await saveSnapshot(profile, page, "credentials-authenticated")
        appendEvent(profile, "success", "Credentials login succeeded.", {
          account: profile.account || undefined,
        })
        writeProfileMeta(profile)
        return
      }
      await page.waitForTimeout(1200)
    }

    profile.status = PROFILE_STATE_AWAITING_CHALLENGE
    profile.debug.lastStep = "credentials_awaiting_challenge"
    profile.debug.lastError = "Additional verification required. Continue manually then resume login."
    await saveSnapshot(profile, page, "credentials-awaiting-challenge")
    appendEvent(profile, "warn", "Credentials submitted but challenge is still required.")
    writeProfileMeta(profile)
  }
  finally {
    await page.close().catch(() => {})
  }
}

function isLikelyAvatarUrl(url) {
  const value = String(url || "").toLowerCase()
  if (!value) {
    return true
  }
  if (/(googleusercontent\.com\/a\/|\/avatar|profile|s96-c|s48-c|s64-c|perlin\.png|placeholder)/i.test(value)) {
    return true
  }
  return false
}

async function extractMediaUrl(page, selectors, kind) {
  const candidates = []
  for (const selector of selectors) {
    const locator = page.locator(selector)
    const count = await locator.count()
    for (let i = 0; i < Math.min(count, 16); i++) {
      const item = locator.nth(i)
      const href = await item.getAttribute("href").catch(() => "")
      const src = await item.getAttribute("src").catch(() => "")
      const currentSrc = await item.evaluate(el => {
        const node = el
        return typeof node.currentSrc === "string" ? node.currentSrc : ""
      }).catch(() => "")
      const srcset = await item.getAttribute("srcset").catch(() => "")
      const text = await item.innerText().catch(() => "")
      const srcsetFirst = String(srcset || "").split(",").map(part => part.trim().split(/\s+/)[0]).find(Boolean) || ""
      const candidate = href || src || currentSrc || srcsetFirst || (text?.startsWith("http") ? text : "")
      if (!candidate) {
        continue
      }
      if (kind === "image" && isLikelyAvatarUrl(candidate)) {
        continue
      }
      const score = await item.evaluate((el) => {
        const img = el
        const width = Number(img?.naturalWidth || img?.videoWidth || img?.clientWidth || 0)
        const height = Number(img?.naturalHeight || img?.videoHeight || img?.clientHeight || 0)
        return width * height
      }).catch(() => 0)
      candidates.push({ candidate, score })
    }
  }
  const fallbackCandidates = await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const parseUrlFromCss = (value) => {
      const text = String(value || "")
      const match = text.match(/url\((['"]?)(.*?)\1\)/i)
      return match?.[2] || ""
    }
    const getFirstSrcset = (value) => String(value || "").split(",").map(part => part.trim().split(/\s+/)[0]).find(Boolean) || ""

    const nodes = Array.from(document.querySelectorAll("img,video,source,a,div,[role=\"img\"]"))
      .filter(isVisible)
    const output = []
    for (const node of nodes) {
      const rect = node.getBoundingClientRect()
      const width = Number(node.naturalWidth || node.videoWidth || rect.width || 0)
      const height = Number(node.naturalHeight || node.videoHeight || rect.height || 0)
      if (width < 120 || height < 80) {
        continue
      }
      const style = window.getComputedStyle(node)
      const src = node.getAttribute?.("src") || ""
      const href = node.getAttribute?.("href") || ""
      const currentSrc = typeof node.currentSrc === "string" ? node.currentSrc : ""
      const srcset = getFirstSrcset(node.getAttribute?.("srcset") || "")
      const dataSrc = node.getAttribute?.("data-src") || ""
      const bg = parseUrlFromCss(style.backgroundImage)
      const candidate = href || src || currentSrc || srcset || dataSrc || bg
      if (!candidate) {
        continue
      }
      output.push({ candidate, score: width * height })
    }
    return output
  }).catch(() => [])
  for (const item of fallbackCandidates) {
    if (item?.candidate) {
      candidates.push({ candidate: item.candidate, score: Number(item.score) || 0 })
    }
  }
  const filtered = candidates.filter((item) => {
    if (!item?.candidate) {
      return false
    }
    if (kind === "image" && isLikelyAvatarUrl(item.candidate)) {
      return false
    }
    return true
  })
  if (!filtered.length) {
    return null
  }
  filtered.sort((a, b) => b.score - a.score)
  const best = String(filtered[0].candidate || "").trim()
  if (!best) {
    return null
  }
  if (best.startsWith("/")) {
    try {
      return new URL(best, FLOW_URL).toString()
    }
    catch {
      return best
    }
  }
  return best
}

async function clickRoleByName(page, role, names) {
  for (const name of names) {
    const locator = page.getByRole(role, { name, exact: false }).first()
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 4000 })
        await page.waitForTimeout(1200)
        return true
      }
      catch {
        // try next candidate
      }
    }
  }
  return false
}

async function forceClickByText(page, texts) {
  return await page.evaluate((candidates) => {
    const nodes = Array.from(document.querySelectorAll("button, a, [role=\"button\"]"))
    for (const node of nodes) {
      const text = (node.textContent || "").trim().toLowerCase()
      if (!text) {
        continue
      }
      if (candidates.some(candidate => text.includes(candidate))) {
        node.click()
        return true
      }
    }
    return false
  }, texts.map(t => t.toLowerCase()))
}

async function isSignupPage(page) {
  const url = page.url()
  if (/accounts\.google\.com\/lifecycle\/steps\/signup/i.test(url)) {
    return true
  }
  const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "")
  return /create a google account/i.test(bodyText)
}

async function isGoogle400Page(page) {
  const url = page.url()
  if (!/accounts\.google\.com/i.test(url)) {
    return false
  }
  const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "")
  return /400\.\s*that'?s an error/i.test(bodyText) || /request.+malformed/i.test(bodyText)
}

async function recoverFromGoogle400(page) {
  await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: ACTION_TIMEOUT_MS })
  await page.waitForTimeout(1000)
  const createNames = ["Create with Flow", "Create", "Get Started", "New project", "New Project", "Create project", "Blank"]
  await clickRoleByName(page, "button", createNames).catch(() => {})
  await clickRoleByName(page, "link", createNames).catch(() => {})
  await forceClickByText(page, createNames).catch(() => false)
  await page.waitForTimeout(1500)
}

function extractSignInUrlFromSignup(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    const encoded = parsed.searchParams.get("signInUrl")
    if (!encoded) {
      return ""
    }
    const decoded = decodeURIComponent(encoded)
    if (!decoded) {
      return ""
    }
    if (/^https?:\/\//i.test(decoded)) {
      return decoded
    }
    if (decoded.startsWith("/")) {
      return `https://accounts.google.com${decoded}`
    }
    return ""
  }
  catch {
    return ""
  }
}

async function discoverSignInUrlFromPage(page) {
  return await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map(node => node.getAttribute("href") || "")
      .map(href => href.trim())
      .filter(Boolean)
    for (const href of links) {
      if (/signin|signInUrl|oauth/i.test(href)) {
        try {
          return new URL(href, window.location.origin).toString()
        }
        catch {
          // continue
        }
      }
    }
    return ""
  }).catch(() => "")
}

async function findEmailInput(page) {
  const bySelector = await firstSelector(page, SELECTOR_LOGIN_EMAIL, 3500)
  if (bySelector) {
    return bySelector
  }
  const byId = page.locator("#identifierId").first()
  if (await byId.count()) {
    try {
      await byId.waitFor({ state: "visible", timeout: 2500 })
      return byId
    }
    catch {
      // ignore and continue
    }
  }
  const byRole = page.getByRole("textbox", { name: /email|phone/i }).first()
  if (await byRole.count()) {
    try {
      await byRole.waitFor({ state: "visible", timeout: 2500 })
      return byRole
    }
    catch {
      // ignore and return null
    }
  }
  return null
}

async function ensureGenerationWorkspace(page) {
  for (let i = 0; i < 5; i++) {
    const promptInput = await firstSelector(page, SELECTOR_PROMPT, 1200)
    if (promptInput) {
      return
    }

    if (await detectLoginRequired(page)) {
      throw new Error("Login required/challenge pending before opening Flow workspace.")
    }

    const clickedButton = await clickRoleByName(page, "button", [
      "Create with Flow",
      "Get Started",
      "Create",
      "New project",
      "New Project",
      "Create project",
      "Compose",
      "Refine",
      "Try",
      "Blank",
    ])
    if (clickedButton) {
      continue
    }
    const clickedLink = await clickRoleByName(page, "link", [
      "Create with Flow",
      "Get Started",
      "Create",
      "New project",
      "New Project",
      "Create project",
      "Compose",
      "Refine",
      "Try",
      "Blank",
    ])
    if (clickedLink) {
      continue
    }

    await page.waitForTimeout(1200)
  }
}

async function waitForPromptInputReady(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const promptInput = await firstSelector(page, SELECTOR_PROMPT, 1200)
    if (promptInput) {
      const ready = await promptInput.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        if (!rect.width || !rect.height) {
          return false
        }
        if (style.visibility === "hidden" || style.display === "none") {
          return false
        }
        const editable = el.getAttribute("contenteditable")
        if (editable === "true") {
          return true
        }
        const node = el
        if (typeof node.disabled === "boolean" && node.disabled) {
          return false
        }
        if (typeof node.readOnly === "boolean" && node.readOnly) {
          return false
        }
        return true
      }).catch(() => false)
      if (ready) {
        return promptInput
      }
    }
    await page.waitForTimeout(500)
  }
  return null
}

async function checkWorkspaceLoginRequired(page) {
  for (let i = 0; i < 4; i++) {
    const promptInput = await firstSelector(page, SELECTOR_PROMPT, 1000)
    if (promptInput) {
      return false
    }
    if (await detectLoginRequired(page)) {
      return true
    }

    const clickedButton = await clickRoleByName(page, "button", [
      "Create with Flow",
      "Get Started",
      "Create",
      "New project",
      "New Project",
      "Create project",
      "Compose",
      "Refine",
      "Try",
      "Blank",
    ])
    if (clickedButton) {
      continue
    }
    const clickedLink = await clickRoleByName(page, "link", [
      "Create with Flow",
      "Get Started",
      "Create",
      "New project",
      "New Project",
      "Create project",
      "Compose",
      "Refine",
      "Try",
      "Blank",
    ])
    if (clickedLink) {
      continue
    }
    await page.waitForTimeout(1000)
  }
  return await detectLoginRequired(page)
}

function sizeToAspectRatio(size) {
  const value = String(size || "").trim()
  if (!value) {
    return ""
  }
  const direct = value.match(/^(\d{1,2}):(\d{1,2})$/)
  if (direct) {
    return `${Number.parseInt(direct[1], 10)}:${Number.parseInt(direct[2], 10)}`
  }
  const match = value.match(/^(\d+)\s*x\s*(\d+)$/i)
  if (!match) {
    return ""
  }
  const width = Number.parseInt(match[1], 10)
  const height = Number.parseInt(match[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return ""
  }
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
  const d = gcd(width, height)
  return `${Math.round(width / d)}:${Math.round(height / d)}`
}

function normalizeOutputCount(payload) {
  const n = Number(payload?.n || 1)
  if (!Number.isFinite(n)) {
    return 1
  }
  return Math.min(4, Math.max(1, Math.floor(n)))
}

async function clickControlByNames(page, names) {
  const candidates = names.map(v => String(v || "").trim()).filter(Boolean)
  if (!candidates.length) {
    return false
  }
  if (await clickRoleByName(page, "button", candidates)) {
    return true
  }
  if (await clickRoleByName(page, "link", candidates)) {
    return true
  }
  return await forceClickByText(page, candidates)
}

async function selectFlowMode(page, kind) {
  const labels = kind === "video" ? FLOW_VIDEO_MODE_LABELS : FLOW_IMAGE_MODE_LABELS
  await clickControlByNames(page, labels)
}

function flowModelKeywords(requested) {
  const text = String(requested || "").toLowerCase()
  if (text.includes("imagen")) {
    return ["imagen 4", "imagen"]
  }
  if (text.includes("pro")) {
    return ["nano banana pro", "banana pro"]
  }
  if (text.includes("banana") || text.includes("nano")) {
    return ["nano banana 2", "banana 2"]
  }
  return [text]
}

async function isFlowModelSelected(page, keywords) {
  return await page.evaluate((keys) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const nodes = Array.from(document.querySelectorAll("button,[role=\"button\"],div[role=\"button\"]")).filter(isVisible)
    return nodes.some((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.top < window.innerHeight * 0.55) {
        return false
      }
      const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase()
      return keys.some(k => k && text.includes(k))
    })
  }, keywords).catch(() => false)
}

async function openFlowModelPicker(page) {
  return await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const nodes = Array.from(document.querySelectorAll("button,[role=\"button\"],div[role=\"button\"]"))
      .filter(isVisible)
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.top < window.innerHeight * 0.55) {
          return false
        }
        const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase()
        return text.includes("banana") || text.includes("imagen")
      })
    if (!nodes.length) {
      return false
    }
    nodes.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)
    nodes[0].click()
    return true
  }).catch(() => false)
}

async function clickFlowModelOption(page, keywords) {
  return await page.evaluate((keys) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const nodes = Array.from(document.querySelectorAll("button,[role=\"button\"],[role=\"option\"],[role=\"menuitem\"],li"))
      .filter(isVisible)
    const ranked = nodes
      .map((el) => {
        const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase()
        let score = 0
        for (const key of keys) {
          if (!key) {
            continue
          }
          if (text.includes(key)) {
            score = Math.max(score, key.length)
          }
        }
        return { el, score }
      })
      .filter(item => item.score > 0)
    if (!ranked.length) {
      return false
    }
    ranked.sort((a, b) => b.score - a.score)
    ranked[0].el.click()
    return true
  }, keywords).catch(() => false)
}

async function selectFlowModel(page, payload) {
  const requested = String(payload?.flowModel || FLOW_MODEL_LABELS[String(payload?.model || "")] || "").trim()
  if (!requested) {
    return
  }
  const keywords = flowModelKeywords(requested)
  if (await isFlowModelSelected(page, keywords)) {
    return
  }
  await clickControlByNames(page, ["arrow_drop_down", "Nano Banana", "Imagen", requested])
  await page.waitForTimeout(300)
  await openFlowModelPicker(page)
  await page.waitForTimeout(300)
  await clickControlByNames(page, [requested])
  await clickFlowModelOption(page, keywords)
  await page.waitForTimeout(500)
}

async function selectFlowAspectRatio(page, payload) {
  const ratio = String(payload?.aspectRatio || payload?.metadata?.aspectRatio || sizeToAspectRatio(payload?.size) || "").trim()
  if (!ratio) {
    return
  }
  await clickControlByNames(page, [ratio])
  await page.waitForTimeout(300)
}

async function selectFlowOutputCount(page, payload) {
  const count = normalizeOutputCount(payload)
  await clickControlByNames(page, [`x${count}`])
  await page.waitForTimeout(300)
}

async function applyFlowGenerationControls(page, kind, payload) {
  await selectFlowMode(page, kind)
  await selectFlowModel(page, payload)
  await selectFlowAspectRatio(page, payload)
  if (kind === "image") {
    await selectFlowOutputCount(page, payload)
  }
}

async function clickLikelySubmitButtonNearComposer(page) {
  return await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("button, [role=\"button\"]"))
    const words = ["generate", "create", "run", "send", "submit", "arrow_forward", "play_arrow"]
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const score = (el) => {
      const rect = el.getBoundingClientRect()
      let s = 0
      if (rect.top > window.innerHeight * 0.55) {
        s += 3
      }
      if (rect.left > window.innerWidth * 0.55) {
        s += 2
      }
      const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase()
      if (words.some(word => text.includes(word))) {
        s += 4
      }
      return s
    }
    const candidates = nodes.filter(isVisible).map(el => ({ el, s: score(el) })).filter(item => item.s >= 5)
    if (!candidates.length) {
      return false
    }
    candidates.sort((a, b) => b.s - a.s)
    candidates[0].el.click()
    return true
  })
}

async function clickSubmitFromPromptContext(promptInput) {
  return await promptInput.evaluate((inputEl) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const textOf = (el) => `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase()
    const looksSubmit = (el) => {
      const text = textOf(el)
      if (!text) {
        return false
      }
      if (/close|clear|dismiss|cancel/.test(text)) {
        return false
      }
      if (/^\s*x\s*$/.test((el.textContent || "").trim())) {
        return false
      }
      return /generate|create|run|send|submit|arrow_forward|play_arrow/.test(text)
    }
    const inputRect = inputEl.getBoundingClientRect()

    let root = inputEl
    for (let depth = 0; depth < 6; depth++) {
      if (!root || !root.parentElement) {
        break
      }
      root = root.parentElement
      const candidates = Array.from(root.querySelectorAll("button, [role=\"button\"]"))
        .filter(isVisible)
        .filter(looksSubmit)
        .filter((el) => {
          const rect = el.getBoundingClientRect()
          return rect.left >= (inputRect.left + inputRect.width * 0.7)
            && rect.top >= (inputRect.top - 40)
            && rect.width >= 28
            && rect.height >= 28
        })
      if (candidates.length) {
        candidates.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)
        candidates[0].click()
        return true
      }
    }
    return false
  })
}

async function detectPromptRequiredToast(page) {
  return await page.evaluate(() => {
    const text = (document.body?.innerText || "").toLowerCase()
    return text.includes("prompt must be provided")
  }).catch(() => false)
}

async function detectGenerationStarted(page) {
  return await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const bodyText = (document.body?.innerText || "").toLowerCase()
    if (/\b\d{1,3}%\b/.test(bodyText)) {
      return true
    }
    const loadingCards = Array.from(document.querySelectorAll("img,canvas,video,[role=\"img\"],div"))
      .filter((el) => {
        const text = (el.textContent || "").trim()
        if (!/^(\d{1,3})%$/.test(text)) {
          return false
        }
        const rect = el.getBoundingClientRect()
        return rect.width >= 120 && rect.height >= 80
      })
    return loadingCards.length > 0
      || Array.from(document.querySelectorAll("img,source,video")).some((el) => {
        const src = String(el.getAttribute("src") || el.getAttribute("srcset") || "").toLowerCase()
        if (!/perlin\.png|placeholder/.test(src)) {
          return false
        }
        const rect = el.getBoundingClientRect()
        return rect.width >= 120 && rect.height >= 80
      })
      || (() => {
        const panels = Array.from(document.querySelectorAll("div,img,canvas,[role=\"img\"]"))
          .filter(isVisible)
          .filter((el) => {
            const rect = el.getBoundingClientRect()
            return rect.top < window.innerHeight * 0.75 && rect.width >= 260 && rect.height >= 130
          })
        return panels.length >= 2
      })()
  }).catch(() => false)
}

async function clickComposerPrimaryAction(promptInput) {
  return await promptInput.evaluate((inputEl) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const textOf = (el) => `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase()
    const looksPrimary = (el) => {
      const text = textOf(el)
      if (/\b\+\b/.test(text) || text.trim() === "+") {
        return false
      }
      if (/arrow_forward|send|generate|create|run|submit|play_arrow/.test(text)) {
        return true
      }
      const rect = el.getBoundingClientRect()
      return rect.width <= 80 && rect.height <= 80
    }

    let root = inputEl
    for (let depth = 0; depth < 8; depth++) {
      if (!root || !root.parentElement) {
        break
      }
      root = root.parentElement
      const candidates = Array.from(root.querySelectorAll("button,[role=\"button\"]"))
        .filter(isVisible)
        .filter(looksPrimary)
      if (!candidates.length) {
        continue
      }
      candidates.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)
      candidates[0].click()
      return true
    }
    return false
  })
}

async function setFlowPromptValue(promptInput, prompt) {
  await promptInput.click().catch(() => {})
  await promptInput.press("Control+A").catch(() => {})
  await promptInput.press("Meta+A").catch(() => {})
  await promptInput.press("Backspace").catch(() => {})
  await promptInput.type(prompt, { delay: 45 }).catch(() => {})
  await promptInput.press(" ").catch(() => {})
  await promptInput.press("Backspace").catch(() => {})
  await promptInput.press("ArrowRight").catch(() => {})
  await promptInput.press("ArrowLeft").catch(() => {})
  await new Promise(resolve => setTimeout(resolve, 450))
}

async function readFlowPromptValue(promptInput) {
  return await promptInput.evaluate((el) => {
    const node = el
    if (typeof node.value === "string") {
      return node.value
    }
    return node.textContent || ""
  }).catch(() => "")
}

async function submitGenerationPrompt(profile, page, promptInput, kind, prompt) {
  await promptInput.click().catch(() => {})
  await promptInput.focus().catch(() => {})
  await page.waitForTimeout(5000)
  await promptInput.press("Enter").catch(() => {})
  let startDeadline = Date.now() + 8000
  while (Date.now() < startDeadline) {
    if (await detectGenerationStarted(page)) {
      return
    }
    if (await detectPromptRequiredToast(page)) {
      if (await detectGenerationStarted(page)) {
        return
      }
      await saveSnapshot(profile, page, `${kind}-prompt-required`)
      throw new Error("Prompt must be provided after submit. No retry mode.")
    }
    await page.waitForTimeout(500)
  }

  // Fallback once: Enter may be ignored by Flow in some UI states.
  const clickedInContext = await clickSubmitFromPromptContext(promptInput).catch(() => false)
  if (clickedInContext) {
    startDeadline = Date.now() + 8000
    while (Date.now() < startDeadline) {
      if (await detectGenerationStarted(page)) {
        return
      }
      if (await detectPromptRequiredToast(page)) {
        if (await detectGenerationStarted(page)) {
          return
        }
        await saveSnapshot(profile, page, `${kind}-prompt-required`)
        throw new Error("Prompt must be provided after submit click fallback.")
      }
      await page.waitForTimeout(500)
    }
  }

  const submitButton = await firstSelector(page, SELECTOR_SUBMIT, 2000)
  if (submitButton) {
    await submitButton.click().catch(() => {})
    startDeadline = Date.now() + 8000
    while (Date.now() < startDeadline) {
      if (await detectGenerationStarted(page)) {
        return
      }
      if (await detectPromptRequiredToast(page)) {
        if (await detectGenerationStarted(page)) {
          return
        }
        await saveSnapshot(profile, page, `${kind}-prompt-required`)
        throw new Error("Prompt must be provided after submit selector fallback.")
      }
      await page.waitForTimeout(500)
    }
  }

  await saveSnapshot(profile, page, `${kind}-submit-not-started`)
  throw new Error("Generation did not start after Enter + click submit fallback.")
}

async function clickBestGeneratedImage(page) {
  return await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const isPlaceholder = (v) => /perlin\.png|placeholder|avatar|googleusercontent\.com\/a\//i.test(String(v || ""))
    const getSource = (el) => {
      const src = el.getAttribute?.("src") || ""
      const href = el.getAttribute?.("href") || ""
      const srcset = String(el.getAttribute?.("srcset") || "").split(",").map(part => part.trim().split(/\s+/)[0]).find(Boolean) || ""
      const currentSrc = typeof el.currentSrc === "string" ? el.currentSrc : ""
      return href || src || currentSrc || srcset
    }
    const nodes = Array.from(document.querySelectorAll("img,a,[role=\"img\"],div"))
      .filter(isVisible)
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const src = getSource(el)
        return { el, src, area: rect.width * rect.height }
      })
      .filter(item => item.area >= 120 * 80)
      .filter(item => !isPlaceholder(item.src))
    if (!nodes.length) {
      return false
    }
    nodes.sort((a, b) => b.area - a.area)
    const target = nodes[0].el
    target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true, view: window }))
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window }))
    target.click()
    return true
  }).catch(() => false)
}

async function clickDownloadButton(page) {
  const bySelector = await firstSelector(page, SELECTOR_DOWNLOAD, 3000)
  if (bySelector) {
    await bySelector.click().catch(() => {})
    return true
  }
  if (await clickRoleByName(page, "button", ["Download", "download", "file_download", "Unduh"])) {
    return true
  }
  if (await clickRoleByName(page, "link", ["Download", "download", "Unduh"])) {
    return true
  }
  const openedMenu = await clickRoleByName(page, "button", ["More", "More options", "Options", "menu", "more_vert"])
  if (openedMenu) {
    await page.waitForTimeout(500)
    const bySelectorAfterMenu = await firstSelector(page, SELECTOR_DOWNLOAD, 2000)
    if (bySelectorAfterMenu) {
      await bySelectorAfterMenu.click().catch(() => {})
      return true
    }
    if (await clickRoleByName(page, "button", ["Download", "download", "Unduh"])) {
      return true
    }
    if (await clickRoleByName(page, "link", ["Download", "download", "Unduh"])) {
      return true
    }
  }
  const openedMenuByAttr = await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const nodes = Array.from(document.querySelectorAll("button,[role=\"button\"]"))
      .filter(isVisible)
      .filter((el) => {
        const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase()
        return /more|options|overflow|more_vert/.test(text)
      })
    if (!nodes.length) {
      return false
    }
    nodes[0].click()
    return true
  }).catch(() => false)
  if (openedMenuByAttr) {
    await page.waitForTimeout(500)
    const bySelectorAfterMenu = await firstSelector(page, SELECTOR_DOWNLOAD, 2000)
    if (bySelectorAfterMenu) {
      await bySelectorAfterMenu.click().catch(() => {})
      return true
    }
  }
  const clickedIconDownload = await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const textOf = (el) => `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase()
    const nodes = Array.from(document.querySelectorAll("button,[role=\"button\"],div[role=\"menuitem\"],li[role=\"menuitem\"]"))
      .filter(isVisible)
      .filter((el) => /download|file_download|save image|save/.test(textOf(el)))
    if (!nodes.length) {
      return false
    }
    nodes[0].click()
    return true
  }).catch(() => false)
  if (clickedIconDownload) {
    return true
  }
  const clickedIconByChild = await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const maybeHit = (btn) => {
      const markers = btn.querySelectorAll("span,i,mat-icon,svg")
      for (const m of markers) {
        const t = (m.textContent || "").toLowerCase().trim()
        if (/^download$|^file_download$|^download_2$/.test(t)) {
          return true
        }
        const cls = String(m.getAttribute("class") || "").toLowerCase()
        if (/download/.test(cls)) {
          return true
        }
      }
      return false
    }
    const buttons = Array.from(document.querySelectorAll("button,[role=\"button\"]"))
      .filter(isVisible)
      .filter(maybeHit)
    if (!buttons.length) {
      return false
    }
    buttons[0].click()
    return true
  }).catch(() => false)
  if (clickedIconByChild) {
    return true
  }
  return false
}

async function waitUntilDownloadAvailable(page, waitUntilMs) {
  while (Date.now() < waitUntilMs) {
    await clickBestGeneratedImage(page).catch(() => false)
    await page.waitForTimeout(600)
    const downloaded = await clickDownloadButton(page).catch(() => false)
    if (downloaded) {
      return true
    }
    await page.waitForTimeout(5000)
  }
  return false
}

async function hasLikelyGeneratedImages(page) {
  return await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const isPlaceholder = (v) => /perlin\.png|placeholder|avatar|googleusercontent\.com\/a\//i.test(String(v || ""))
    const nodes = Array.from(document.querySelectorAll("img,canvas,[role=\"img\"],div"))
      .filter(isVisible)
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.top >= window.innerHeight * 0.75) {
          return false
        }
        if (rect.width < 260 || rect.height < 130) {
          return false
        }
        const src = String(el.getAttribute?.("src") || el.getAttribute?.("srcset") || "")
        if (src && isPlaceholder(src)) {
          return false
        }
        return true
      })
    return nodes.length >= 2
  }).catch(() => false)
}

async function hasVisibleProgressPercent(page) {
  return await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      if (!rect.width || !rect.height) {
        return false
      }
      if (style.visibility === "hidden" || style.display === "none") {
        return false
      }
      return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
    }
    const nodes = Array.from(document.querySelectorAll("div,span,p,[role=\"status\"],[role=\"progressbar\"]"))
      .filter(isVisible)
    return nodes.some((el) => /^\d{1,3}%$/.test((el.textContent || "").trim()))
  }).catch(() => false)
}

async function runGeneration(profile, kind, payload) {
  const page = await openFlowPage(profile)
  try {
    await saveSnapshot(profile, page, `${kind}-opened`)
    await ensureProfileAuthenticated(profile, page)
    await ensureGenerationWorkspace(page)
    await saveSnapshot(profile, page, `${kind}-workspace-ready`)
    if (await detectLoginRequired(page)) {
      await saveSnapshot(profile, page, `${kind}-login-required`)
      throw new Error("Login required/challenge pending before generation.")
    }

    await applyFlowGenerationControls(page, kind, payload)
    await saveSnapshot(profile, page, `${kind}-controls-set`)

    const promptInput = await waitForPromptInputReady(page, 20000)
    if (!promptInput) {
      await saveSnapshot(profile, page, "prompt-not-found")
      throw new Error("Prompt input selector not found. Update worker selectors.")
    }

    const prompt = String(payload.prompt || "").trim()
    if (!prompt) {
      throw new Error("Prompt is required")
    }

    await setFlowPromptValue(promptInput, prompt)
    const typedPrompt = (await readFlowPromptValue(promptInput)).trim()
    if (!typedPrompt) {
      await saveSnapshot(profile, page, `${kind}-prompt-empty-after-type`)
      throw new Error("Prompt is empty after typing. Fail without retry.")
    }
    await saveSnapshot(profile, page, `${kind}-prompt-filled`)

    await submitGenerationPrompt(profile, page, promptInput, kind, prompt).catch(async (error) => {
      await saveSnapshot(profile, page, `${kind}-submit-failed`)
      throw error
    })
    await saveSnapshot(profile, page, `${kind}-submitted`)

    const outputSelectors = kind === "video" ? SELECTOR_VIDEO_OUTPUT : SELECTOR_IMAGE_OUTPUT
    const deadline = Date.now() + ACTION_TIMEOUT_MS
    let firstOutputAt = 0
    let stableOutputUrl = ""
    let firstVisualReadyAt = 0
    let noPercentSince = 0
    while (Date.now() < deadline) {
      const stillGenerating = await detectGenerationStarted(page)
      const hasPercent = await hasVisibleProgressPercent(page)
      if (!hasPercent) {
        if (!noPercentSince) {
          noPercentSince = Date.now()
        }
      } else {
        noPercentSince = 0
      }
      if (kind === "image") {
        const visualReady = await hasLikelyGeneratedImages(page)
        if (visualReady) {
          if (!firstVisualReadyAt) {
            firstVisualReadyAt = Date.now()
          }
          const stableMs = Date.now() - firstVisualReadyAt
          const percentSettledMs = noPercentSince ? Date.now() - noPercentSince : 0
          if (stableMs >= 10000 && percentSettledMs >= 5000) {
            const downloaded = await waitUntilDownloadAvailable(page, deadline)
            if (!downloaded) {
              await saveSnapshot(profile, page, `${kind}-download-not-found`)
              throw new Error("Image ready but download button not found before timeout.")
            }
            await page.waitForTimeout(800)
            await saveSnapshot(profile, page, `${kind}-output-found`)
            appendEvent(profile, "success", `${kind} output detected from visual panels.`)
            writeProfileMeta(profile)
            const outputUrl = await extractMediaUrl(page, outputSelectors, kind)
            return outputUrl || page.url()
          }
        } else {
          firstVisualReadyAt = 0
        }
      }
      if (!stillGenerating) {
        const outputUrl = await extractMediaUrl(page, outputSelectors, kind)
        if (outputUrl) {
          if (stableOutputUrl !== outputUrl) {
            stableOutputUrl = outputUrl
            firstOutputAt = Date.now()
          }
          const stableMs = Date.now() - firstOutputAt
          const percentSettledMs = noPercentSince ? Date.now() - noPercentSince : 0
          if (stableMs >= 10000 && percentSettledMs >= 5000) {
            if (kind === "image") {
              const downloaded = await waitUntilDownloadAvailable(page, deadline)
              if (!downloaded) {
                await saveSnapshot(profile, page, `${kind}-download-not-found`)
                throw new Error("Image ready but download button not found before timeout.")
              }
              await page.waitForTimeout(800)
            }
            await saveSnapshot(profile, page, `${kind}-output-found`)
            appendEvent(profile, "success", `${kind} output URL extracted.`)
            writeProfileMeta(profile)
            return outputUrl
          }
        }
      }
      await page.waitForTimeout(2000)
    }

    await saveSnapshot(profile, page, `${kind}-before-fail`)
    await saveSnapshot(profile, page, `${kind}-timed-out`)
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
    await openRemoteLoginBrowser(profile)
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
      loginUrl: profile.loginUrl || REMOTE_LOGIN_PUBLIC_URL || FLOW_URL,
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

app.post("/v1/profiles/:id/login/credentials", async (req, res) => {
  try {
    const profile = getProfileOrThrow(req.params.id)
    await openRemoteLoginBrowser(profile)
    const email = String(req.body?.email || "").trim()
    const password = String(req.body?.password || "")

    if (!email) {
      return res.status(400).json({ message: "email is required" })
    }
    if (!password) {
      return res.status(400).json({ message: "password is required" })
    }

    appendEvent(profile, "info", "Credentials login requested.")
    profile.status = PROFILE_STATE_STARTING
    profile.debug.lastStep = "credentials_login_requested"
    profile.debug.lastError = ""
    writeProfileMeta(profile)

    await enqueueForProfile(profile.id, async () => {
      try {
        await loginWithCredentials(profile, email, password)
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
      loggedIn: profile.status === PROFILE_STATE_AUTHENTICATED,
      account: profile.account || undefined,
      status: profile.status,
      loginUrl: profile.loginUrl || REMOTE_LOGIN_PUBLIC_URL || FLOW_URL,
      note: profile.status === PROFILE_STATE_AUTHENTICATED
        ? "Credentials accepted and session authenticated."
        : "Additional challenge required. Complete verification then call /login/resume.",
    })
  }
  catch (error) {
    if (String(error?.message || "").includes("challenge")) {
      const profile = profiles.get(req.params.id)
      return res.status(202).json({
        profile: profile ? serializeProfile(profile) : undefined,
        loggedIn: false,
        account: profile?.account || undefined,
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
        const requiresLogin = (await detectLoginRequired(page)) || (await checkWorkspaceLoginRequired(page))
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
      loginUrl: profile.loginUrl || REMOTE_LOGIN_PUBLIC_URL || FLOW_URL,
    })
  }
  catch (error) {
    return sendError(res, error)
  }
})

app.post("/v1/profiles/:id/login/open", async (req, res) => {
  try {
    const profile = getProfileOrThrow(req.params.id)
    await openRemoteLoginBrowser(profile)
    appendEvent(profile, "info", "Remote login browser opened.")
    writeProfileMeta(profile)
    return res.json({
      profile: serializeProfile(profile),
      loginUrl: profile.loginUrl || REMOTE_LOGIN_PUBLIC_URL || FLOW_URL,
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
        if (/login required|challenge/i.test(current.error || "")) {
          profile.status = PROFILE_STATE_AWAITING_CHALLENGE
        }
        else {
          profile.status = profile.status === PROFILE_STATE_AWAITING_CHALLENGE ? PROFILE_STATE_AWAITING_CHALLENGE : PROFILE_STATE_FAILED
        }
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
        if (/login required|challenge/i.test(current.error || "")) {
          profile.status = PROFILE_STATE_AWAITING_CHALLENGE
        }
        else {
          profile.status = profile.status === PROFILE_STATE_AWAITING_CHALLENGE ? PROFILE_STATE_AWAITING_CHALLENGE : PROFILE_STATE_FAILED
        }
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
