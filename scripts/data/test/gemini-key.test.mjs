// Юніт-тести читання ключа Gemini (AI-CARE-001, SEC-102). Без мережі.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readKey } from '../lib/gemini.mjs'

const FAKE = 'test-key-' + 'x'.repeat(30) // не схожий на справжній ключ Google

function withEnv(env, fn) {
  const saved = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GEMINI_KEY_FILE: process.env.GEMINI_KEY_FILE }
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  try { return fn() } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }
}

test('змінна GEMINI_API_KEY має пріоритет', () => {
  withEnv({ GEMINI_API_KEY: FAKE, GEMINI_KEY_FILE: undefined }, () => assert.equal(readKey(), FAKE))
})

test('файл ключа поза репозиторієм читається (формат KEY=VALUE)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zr-key-'))
  const file = join(dir, 'gemini.env')
  writeFileSync(file, `GEMINI_API_KEY=${FAKE}\n`)
  withEnv({ GEMINI_API_KEY: undefined, GEMINI_KEY_FILE: file }, () => assert.equal(readKey(), FAKE))
})

test('файл ключа всередині репозиторію відхиляється (SEC-102)', () => {
  const inRepo = fileURLToPath(new URL('../../../.env', import.meta.url))
  withEnv({ GEMINI_API_KEY: undefined, GEMINI_KEY_FILE: inRepo }, () => assert.throws(() => readKey(), /не може лежати в репозиторії/))
})

test('відсутній файл — зрозуміла помилка без вмісту ключа', () => {
  withEnv({ GEMINI_API_KEY: undefined, GEMINI_KEY_FILE: join(tmpdir(), 'zr-no-such-file.env') }, () => assert.throws(() => readKey(), /Ключ Gemini не знайдено/))
})
