const assert = require('node:assert/strict')
const test = require('node:test')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')

const BINARY_EXTENSIONS = new Set([
  '.ico',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.mp3',
  '.mp4',
  '.pdf',
  '.zip',
])

function extensionOf(file) {
  const match = file.match(/\.[^.\\/]+$/)
  return match?.[0]?.toLowerCase() ?? ''
}

function isProbablyBinary(buffer) {
  return buffer.includes(0)
}

function printableContext(text, index) {
  return text
    .slice(Math.max(0, index - 30), index + 40)
    .replace(/\s+/g, ' ')
}

function findMojibake(text) {
  const findings = []

  for (let index = 0; index < text.length; index++) {
    const current = text.codePointAt(index)
    const next = text.codePointAt(index + 1)

    const looksLikeBrokenUtf8 =
      current === 0xfffd ||
      current === 0x00c3 ||
      current === 0x00c5 ||
      (current === 0x00c2 && next !== undefined && next >= 0x0080 && next <= 0x00bf) ||
      (current === 0x00e2 && next !== undefined && next >= 0x0080 && next <= 0x20ff) ||
      (current === 0x00ef && next === 0x00b8) ||
      current === 0x00f0

    if (looksLikeBrokenUtf8) {
      findings.push({
        index,
        codePoint: `U+${current.toString(16).toUpperCase()}`,
        context: printableContext(text, index),
      })
    }
  }

  return findings
}

test('tracked text files do not contain common mojibake sequences', () => {
  const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)

  const failures = []

  for (const file of trackedFiles) {
    if (BINARY_EXTENSIONS.has(extensionOf(file))) continue
    if (!fs.existsSync(file)) continue

    const buffer = fs.readFileSync(file)
    if (isProbablyBinary(buffer)) continue

    const findings = findMojibake(buffer.toString('utf8'))
    for (const finding of findings) {
      failures.push(`${file}:${finding.index} ${finding.codePoint} ${finding.context}`)
    }
  }

  assert.deepEqual(failures, [])
})
