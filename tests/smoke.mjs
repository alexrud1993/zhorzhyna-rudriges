import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const URL = 'http://localhost:4173/'
const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { shell: true, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 3500))
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }

const browser = await chromium.launch()
try {
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))
    await page.goto(URL)
    await page.getByRole('button', { name: 'Додати рослину' }).first().waitFor()
    ok(await page.getByText('Колекція порожня').isVisible(), `[${w}] порожня колекція`)

    // додаємо кімнатну
    await page.getByRole('button', { name: 'Додати рослину' }).first().click()
    await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
    ok(await page.getByText('Оберіть рослину зі списку.').isVisible(), `[${w}] валідація форми`)
    await page.getByRole('radio', { name: /Монстера/ }).click()
    await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
    await page.getByRole('heading', { name: 'Монстера' }).waitFor()
    // городня
    await page.goto(URL + '#/plants/new')
    await page.getByRole('radio', { name: /Томат/ }).click()
    await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
    await page.getByRole('heading', { name: 'Томат' }).waitFor()
    ok(true, `[${w}] додано кімнатну і городню`)

    // полив + скасування
    await page.getByRole('button', { name: 'Полив виконано' }).click()
    await page.getByRole('button', { name: /Скасувати запис/ }).first().waitFor()
    ok(true, `[${w}] запис поливу`)
    await page.getByRole('button', { name: /Скасувати запис/ }).first().click()
    await page.getByText('Записів ще немає.').waitFor({ timeout: 3000 }).catch(() => {})
    ok(await page.getByText('Записів ще немає.').isVisible(), `[${w}] скасування запису`)

    // перезавантаження
    await page.goto(URL + '#/plants'); await page.reload()
    await page.getByText('2 рослин у колекції').waitFor()
    ok(true, `[${w}] дані після перезавантаження`)

    // місто
    await page.goto(URL + '#/'); 
    await page.getByLabel('Населений пункт').selectOption({ label: 'Одеса' })
    await page.waitForTimeout(2500)
    const wtxt = await page.getByLabel('Погода').innerText()
    ok(/Одеса/.test(wtxt) && /(Оновлено|недоступна)/.test(wtxt), `[${w}] погода/статус для Одеси: ${wtxt.replace(/\s+/g, ' ').slice(0, 90)}`)

    // горизонтальний overflow
    for (const p of ['#/', '#/plants', '#/calendar', '#/settings', '#/plants/new']) {
      await page.goto(URL + p); await page.waitForTimeout(300)
      const o = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      ok(!o, `[${w}] без горизонтального переповнення ${p}`)
    }

    // експорт / імпорт
    await page.goto(URL + '#/settings')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Експорт/ }).click()])
    const path = `tests/_backup-${w}.json`; await dl.saveAs(path)
    const j = JSON.parse(fs.readFileSync(path, 'utf8'))
    ok(j.plants.length === 2 && j.schemaVersion === 1, `[${w}] експорт містить 2 рослини`)
    fs.writeFileSync('tests/_bad.json', '{"foo":1}')
    await page.setInputFiles('#imp', 'tests/_bad.json')
    await page.getByText(/Імпорт скасовано/).waitFor({ timeout: 5000 }).catch(() => {})
    ok(await page.getByText(/Імпорт скасовано/).isVisible(), `[${w}] некоректний файл відхилено`)
    await page.goto(URL + '#/plants')
    ok(await page.getByText('2 рослин у колекції').isVisible(), `[${w}] дані цілі після поганого імпорту`)
    await page.goto(URL + '#/plants/new')
    // видалення
    await page.goto(URL + '#/plants')
    await page.getByRole('button', { name: /Томат/ }).click()
    await page.getByRole('button', { name: /Видалити/ }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click()
    await page.getByText('1 рослин у колекції').waitFor()
    // імпорт чистої копії
    await page.goto(URL + '#/settings')
    await page.setInputFiles('#imp', path)
    await page.getByRole('alertdialog').getByRole('button', { name: 'Замінити' }).click()
    await page.getByText(/Імпортовано: 2 рослин/).waitFor()
    await page.goto(URL + '#/plants')
    ok(await page.getByText('2 рослин у колекції').isVisible(), `[${w}] імпорт відновив колекцію`)

    // офлайн fallback
    await ctx.setOffline(true)
    await page.goto(URL + '#/'); await page.waitForTimeout(1500)
    await page.getByLabel('Населений пункт').selectOption({ label: 'Київ' }); await page.waitForTimeout(2500)
    await ctx.setOffline(true)
    await page.getByLabel('Населений пункт').selectOption({ label: 'Одеса' }); await page.waitForTimeout(1500)
    const off = await page.getByLabel('Погода').innerText()
    ok(/збережені дані/.test(off), `[${w}] офлайн-fallback`)
    await ctx.setOffline(false)

    await page.goto(URL + '#/'); await page.waitForTimeout(1500)
    await page.screenshot({ path: `tests/shot-${w}-home.png`, fullPage: true })
    await page.goto(URL + '#/calendar'); await page.screenshot({ path: `tests/shot-${w}-cal.png`, fullPage: true })
    ok(errs.length === 0, `[${w}] без помилок JS ${errs.join(';')}`)
    await ctx.close()
  }
} catch (e) { console.log('FAIL exception', e.message); fails++ }
await browser.close(); srv.kill()
try { for (const f of fs.readdirSync('tests')) if (f.startsWith('_')) fs.unlinkSync('tests/' + f) } catch {}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0)
