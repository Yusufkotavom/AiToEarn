import express from "express"
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"

const app = express()
app.use(express.json({ limit: "1mb" }))

const PORT = Number(process.env.PORT || 4320)
const FLOW_URL = process.env.GOOGLE_FLOW_URL || "https://labs.google/fx/tools/flow"
const DISPLAY = process.env.DISPLAY || ":99"
const CDP_PORT = Number(process.env.CDP_PORT || 9222)
const CDP_PROXY_PORT = Number(process.env.CDP_PROXY_PORT || 9223)
const PROFILES_ROOT_DIR = process.env.GOOGLE_FLOW_PROFILES_ROOT_DIR || "/data/google-flow-user-data"
const LOGIN_PUBLIC_URL = process.env.GOOGLE_FLOW_REMOTE_LOGIN_PUBLIC_URL || "/flow-login/vnc.html?autoconnect=1&resize=scale"
const DEFAULT_PROFILE_ID = process.env.GOOGLE_FLOW_DEFAULT_PROFILE_ID || "legacy-default"

let chromeProc = null
let activeProfileId = ""
let activeUrl = FLOW_URL

// Track when Chrome last exited so worker can detect stale CDP
let chromeExitedAt = 0
let chromeStartedAt = 0

function runPkill(pattern) {
  return new Promise((resolve) => {
    const proc = spawn("pkill", ["-f", pattern], {
      stdio: "ignore",
    })
    proc.once("error", () => resolve(false))
    proc.once("close", (code) => {
      // pkill: 0=matched and killed, 1=no match.
      resolve(code === 0 || code === 1)
    })
  })
}

async function killOrphanChromeProcesses() {
  await Promise.all([
    runPkill("google-chrome"),
    runPkill("/opt/google/chrome/chrome"),
    runPkill("chrome_crashpad"),
  ])
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safeFilename(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 128)
}

function profileUserDataDir(profileId) {
  const id = safeFilename(profileId || DEFAULT_PROFILE_ID)
  // IMPORTANT: must use the SAME path as the playwright worker so the login
  // session saved here is reused by the headless generation worker.
  // Worker uses: {PROFILES_ROOT_DIR}/{profileId}/user-data
  return path.join(PROFILES_ROOT_DIR, id, "user-data")
}

function cleanupChromeSingletonLocks(userDataDir) {
  const lockFiles = [
    "SingletonLock",
    "SingletonSocket",
    "SingletonCookie",
  ]
  let removed = 0
  const failed = []
  for (const filename of lockFiles) {
    try {
      const targetPath = path.join(userDataDir, filename)
      fs.rmSync(targetPath, { force: true })
      removed += 1
    }
    catch (error) {
      failed.push({
        file: filename,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { removed, failed }
}

function cleanupChromeTmpSockets() {
  const tmpRoot = "/tmp"
  let removed = 0
  const failed = []
  let entries = []
  try {
    entries = fs.readdirSync(tmpRoot, { withFileTypes: true })
  }
  catch (error) {
    return {
      removed,
      failed: [{
        file: tmpRoot,
        error: error instanceof Error ? error.message : String(error),
      }],
    }
  }
  for (const entry of entries) {
    if (!/^com\.google\.Chrome\./.test(entry.name)) {
      continue
    }
    const targetPath = path.join(tmpRoot, entry.name)
    try {
      fs.rmSync(targetPath, { recursive: true, force: true })
      removed += 1
    }
    catch (error) {
      failed.push({
        file: targetPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { removed, failed }
}

async function stopChrome() {
  if (!chromeProc) {
    await killOrphanChromeProcesses()
    return
  }
  const proc = chromeProc
  chromeProc = null
  proc.kill("SIGTERM")
  await new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    proc.once("exit", done)
    setTimeout(() => {
      try {
        proc.kill("SIGKILL")
      }
      catch {
        // ignore
      }
      done()
    }, 5000)
  })
  await killOrphanChromeProcesses()
}

async function waitForCdpReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
        signal: AbortSignal.timeout(1500),
      })
      if (response.ok) {
        return true
      }
    }
    catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

function isChromeProcessRunning(proc) {
  return Boolean(proc && proc.exitCode == null && !proc.killed)
}

async function openChrome(profileId, url, attempt = 1) {
  const nextProfileId = String(profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID
  const nextUrl = String(url || FLOW_URL).trim() || FLOW_URL
  const userDataDir = profileUserDataDir(nextProfileId)
  ensureDir(userDataDir)
  await stopChrome()
  const lockCleanup = cleanupChromeSingletonLocks(userDataDir)
  const tmpCleanup = cleanupChromeTmpSockets()
  if (lockCleanup.removed || lockCleanup.failed.length || tmpCleanup.removed || tmpCleanup.failed.length) {
    console.log(`[remote-browser] lock cleanup profile=${nextProfileId} lockRemoved=${lockCleanup.removed} tmpRemoved=${tmpCleanup.removed} lockFailed=${lockCleanup.failed.length} tmpFailed=${tmpCleanup.failed.length}`)
  }

  const args = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--window-size=1440,900",
    `--remote-debugging-address=0.0.0.0`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    nextUrl,
  ]
  const proc = spawn("google-chrome", args, {
    env: {
      ...process.env,
      DISPLAY,
    },
    stdio: ["ignore", "ignore", "pipe"],
  })
  chromeProc = proc
  chromeStartedAt = Date.now()

  proc.stderr?.on("data", (chunk) => {
    const text = String(chunk || "").trim()
    if (text) {
      console.log(`[chrome] ${text}`)
    }
  })
  proc.on("exit", (code, signal) => {
    // Only clear if this is still the active process
    if (chromeProc === proc) {
      chromeProc = null
    }
    chromeExitedAt = Date.now()
    console.log(`[chrome] process exited (code=${code} signal=${signal}). Session saved to disk in ${userDataDir}`)
  })

  // Do not block too long here; UI only needs browser to be opened for VNC.
  // CDP may take time or be temporarily unavailable while Chrome is still usable.
  const cdpReady = await waitForCdpReady(5000)
  const chromeRunning = isChromeProcessRunning(proc)
  const exitCode = typeof proc.exitCode === "number" ? proc.exitCode : null
  activeProfileId = nextProfileId
  activeUrl = nextUrl

  if (!chromeRunning && exitCode === 21 && attempt < 2) {
    console.log(`[remote-browser] Chrome lock detected for profile=${nextProfileId}; retrying once with fresh cleanup`)
    await new Promise(resolve => setTimeout(resolve, 800))
    return await openChrome(nextProfileId, nextUrl, attempt + 1)
  }

  console.log(`[remote-browser] Chrome opened for profile=${nextProfileId} cdpReady=${cdpReady} chromeRunning=${chromeRunning} exitCode=${exitCode} userDataDir=${userDataDir}`)

  return {
    ok: cdpReady || chromeRunning,
    cdpReady,
    chromeRunning,
    exitCode,
    profileId: nextProfileId,
    loginUrl: nextUrl,
    noVncUrl: LOGIN_PUBLIC_URL,
    cdpUrl: `http://127.0.0.1:${CDP_PROXY_PORT}`,
    userDataDir,
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    chromeRunning: Boolean(chromeProc),
    activeProfileId: activeProfileId || null,
    chromeStartedAt: chromeStartedAt || null,
    chromeExitedAt: chromeExitedAt || null,
  })
})

app.get("/v1/login/info", (_req, res) => {
  res.json({
    activeProfileId: activeProfileId || null,
    loginUrl: activeUrl,
    noVncUrl: LOGIN_PUBLIC_URL,
    cdpUrl: `http://127.0.0.1:${CDP_PROXY_PORT}`,
    chromeRunning: Boolean(chromeProc),
    chromeStartedAt: chromeStartedAt || null,
    chromeExitedAt: chromeExitedAt || null,
  })
})

app.get("/v1/cdp/version", async (_req, res) => {
  try {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
      signal: AbortSignal.timeout(3000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return res.status(response.status).json(payload)
    }
    return res.json(payload)
  }
  catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : String(error) })
  }
})

app.post("/v1/login/open", async (req, res) => {
  try {
    const result = await openChrome(req.body?.profileId, req.body?.url)
    return res.json(result)
  }
  catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : String(error) })
  }
})

app.post("/v1/login/close", (_req, res) => {
  stopChrome()
    .then(() => res.json({ ok: true, note: "Chrome stopped. Session data preserved on disk." }))
    .catch(error => res.status(500).json({ message: error instanceof Error ? error.message : String(error) }))
})

app.listen(PORT, () => {
  console.log(`google-flow-remote-browser listening on :${PORT}`)
  console.log(`  PROFILES_ROOT_DIR = ${PROFILES_ROOT_DIR}`)
  console.log(`  user-data path pattern = ${PROFILES_ROOT_DIR}/{profileId}/user-data`)
  console.log(`  (same as playwright worker — sessions are shared)`)
})
