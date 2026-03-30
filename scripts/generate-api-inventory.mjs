#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

function walkControllers(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkControllers(full))
      continue
    }
    if (entry.isFile() && full.endsWith('.controller.ts')) {
      out.push(full)
    }
  }
  return out
}

function normalizePath(base, routePath) {
  const parts = [base, routePath]
    .filter(Boolean)
    .map(v => String(v).replace(/^\/+|\/+$/g, ''))
  const full = `/${parts.join('/')}`
  return full === '/' ? '/' : full
}

function parseControllerFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  let base = ''
  let pending = []
  const rows = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    const controller = line.match(/^@Controller\((.*)\)/)
    if (controller) {
      const raw = (controller[1] || '').trim().replace(/^[`'"]|[`'"]$/g, '')
      base = raw
    }

    const method = line.match(/^@(Get|Post|Put|Delete|Patch)\((.*)\)/)
    if (method) {
      const routePath = (method[2] || '').trim().replace(/^[`'"]|[`'"]$/g, '')
      pending.push({
        method: method[1].toUpperCase(),
        routePath,
        line: i + 1,
      })
      continue
    }

    if (pending.length && (/^(async\s+)?[A-Za-z0-9_]+\(/.test(line) || line.startsWith('public ') || line.startsWith('private ') || line.startsWith('protected '))) {
      for (const item of pending) {
        rows.push({
          method: item.method,
          path: normalizePath(base, item.routePath),
          source: `${filePath}:${item.line}`,
        })
      }
      pending = []
    }
  }

  for (const item of pending) {
    rows.push({
      method: item.method,
      path: normalizePath(base, item.routePath),
      source: `${filePath}:${item.line}`,
    })
  }

  return rows
}

function generateInventory({ appName, srcRoot, outputFile }) {
  const controllerFiles = walkControllers(path.join(ROOT, srcRoot))
  const rows = controllerFiles
    .flatMap(parseControllerFile)
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))

  const out = []
  out.push(`# API Inventory ${appName}`)
  out.push('')
  out.push(`Generated: ${new Date().toISOString()}`)
  out.push('')
  out.push(`Total endpoint: ${rows.length}`)
  out.push('')
  out.push('| Method | Path | Source |')
  out.push('|---|---|---|')
  for (const row of rows) {
    out.push(`| ${row.method} | \`${row.path}\` | \`${row.source}\` |`)
  }
  out.push('')

  const fullOutput = path.join(ROOT, outputFile)
  fs.mkdirSync(path.dirname(fullOutput), { recursive: true })
  fs.writeFileSync(fullOutput, out.join('\n'))
  return { count: rows.length, outputFile }
}

const targets = [
  {
    appName: 'AiToEarn AI',
    srcRoot: 'project/aitoearn-backend/apps/aitoearn-ai/src',
    outputFile: 'docs/API_INVENTORY_AITOEARN_AI_ID.md',
  },
  {
    appName: 'AiToEarn Server',
    srcRoot: 'project/aitoearn-backend/apps/aitoearn-server/src',
    outputFile: 'docs/API_INVENTORY_AITOEARN_SERVER_ID.md',
  },
]

for (const target of targets) {
  const result = generateInventory(target)
  console.log(`[ok] ${result.outputFile} (${result.count} endpoint)`)
}

