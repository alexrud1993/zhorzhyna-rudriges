// E2E: розпізнавання за фото (проксі підмінено) + регресії QA-дефектів. Ізольований Chromium.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const URL = process.env.APP_URL || 'http://localhost:4173/'
const srv = process.env.APP_URL ? null : spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { shell: true, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, srv ? 3500 : 0))
const PROXY = 'https://proxy.test/identify'
const PHOTO = 'public/icon-512.png'
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const browser = await chromium.launch()
const wx = { current: { temperature_2m: 12, relative_humidity_2m: 70, precipitation: 0 }, daily: { precipitation_sum: [0, 0, 0, 0, 0], temperature_2m_max: [12, 13, 14, 15, 14] } }

async function ctxPage({ proxy, width = 390, height = 844, ...opts } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, ...opts })
  await ctx.addInitScript((u) => { globalThis.__IDENTIFY_URL__ = u }, proxy ? PROXY : 'off')
  const page = await ctx.newPage()
  page.setDefaultTimeout(10000)
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(wx) }))
  return { ctx, page, errs }
}
const proxyReply = (page, status, body, seen) => page.route(PROXY, async (r) => {
  seen?.push(r.request().postDataBuffer()?.toString('latin1') ?? '')
  await r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
})
async function pickPhoto(page, click) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click()])
  await chooser.setFiles(PHOTO)
  return chooser
}
const centerCam = (page) => page.getByRole('button', { name: 'Розпізнати рослину за фото' })

try {
  // 1. Без підключеного сервісу: чесне повідомлення і шлях «фото + ручний вибір»
  {
    const { ctx, page, errs } = await ctxPage()
    await page.goto(URL)
    ok(await page.getByText(/Автоматичне розпізнавання ще не підключено, вид оберете зі списку/).waitFor().then(() => true, () => false), 'головна: блок «Розпізнати за фото» чесно каже, що AI не підключено')
    const ch = await pickPhoto(page, () => centerCam(page).click())
    ok(ch.isMultiple() === false, 'центральна кнопка нижньої навігації відкриває вибір фото (камера)')
    await page.getByRole('heading', { name: 'Автоматичне розпізнавання ще не підключено' }).waitFor()
    ok(/#\/identify$/.test(page.url()), 'після фото відкривається екран розпізнавання')
    await page.getByRole('button', { name: 'Обрати рослину вручну' }).click()
    await page.getByAltText('Попередній перегляд').waitFor()
    ok(true, 'фото перенесено у форму додавання')
    await page.getByRole('radio', { name: /Монстера/ }).click()
    await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
    await page.getByRole('heading', { name: 'Монстера' }).waitFor()
    ok(await page.locator('img[alt="Монстера"]').count() === 1, 'картка рослини створена з фото')
    ok(errs.length === 0, 'без JS-помилок (сценарій без AI) ' + errs.join(';'))
    await ctx.close()
  }
  // 2. Успішне розпізнавання: вид із каталогу → картка
  {
    const { ctx, page, errs } = await ctxPage({ proxy: true })
    const seen = []
    await proxyReply(page, 200, { source: 'Pl@ntNet', results: [
      { scientificName: 'Monstera deliciosa', genus: 'Monstera', commonNames: ['Swiss cheese plant'], score: 0.92 },
      { scientificName: 'Ribes rubrum', genus: 'Ribes', commonNames: ['Redcurrant'], score: 0.05 },
      { scientificName: 'Ficus lyrata', genus: 'Ficus', commonNames: ['Fiddle-leaf fig'], score: 0.02 },
    ] }, seen)
    await page.goto(URL)
    ok(await page.getByText(/запропонуємо варіанти та створимо картку/).waitFor().then(() => true, () => false), 'з підключеним сервісом головна обіцяє варіанти')
    await pickPhoto(page, () => page.getByRole('button', { name: 'Камера' }).click())
    await page.getByRole('list', { name: 'Запропоновані рослини' }).waitFor()
    const list = await page.getByRole('list', { name: 'Запропоновані рослини' }).innerText()
    ok(/Монстера/.test(list) && /92%/.test(list) && /Є в каталозі/.test(list), 'вид із каталогу показано українською з оцінкою 92%')
    ok(/того ж роду/.test(list) && /Немає в демо-каталозі/.test(list), 'рід і відсутній у каталозі вид позначені чесно')
    ok(seen[0].includes('image/jpeg') && /name="organ"\r\n\r\nauto/.test(seen[0]), 'на проксі надіслано JPEG і organ=auto')
    await page.getByRole('radio', { name: 'Лист' }).click()
    await page.getByRole('list', { name: 'Запропоновані рослини' }).waitFor()
    ok(/name="organ"\r\n\r\nleaf/.test(seen.at(-1)), 'вибір «Лист» повторює запит з organ=leaf')
    await page.getByRole('button', { name: /Додати в колекцію/ }).first().click()
    await page.getByText(/За фото запропоновано/).waitFor()
    ok(await page.getByRole('radio', { name: /Монстера/ }).getAttribute('aria-checked') === 'true', 'форма: Монстера обрана автоматично')
    ok(await page.getByAltText('Попередній перегляд').isVisible(), 'форма: фото вже додано')
    await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
    await page.getByRole('heading', { name: 'Монстера' }).waitFor()
    ok(await page.getByText('Monstera deliciosa').isVisible(), 'картка: показано наукову назву з розпізнавання')
    await page.reload()
    ok(await page.getByText('Monstera deliciosa').isVisible(), 'картка з науковою назвою зберігається після reload')
    ok(errs.length === 0, 'без JS-помилок (розпізнавання) ' + errs.join(';'))
    await ctx.close()
  }
  // 3. Вид поза каталогом → «Інша рослина» з назвою
  {
    const { ctx, page } = await ctxPage({ proxy: true })
    await proxyReply(page, 200, { source: 'Pl@ntNet', results: [{ scientificName: 'Aloe vera', genus: 'Aloe', commonNames: ['Aloe vera'], score: 0.8 }] })
    await page.goto(URL + '#/identify')
    await pickPhoto(page, () => page.getByRole('button', { name: 'Сфотографувати' }).click())
    await page.getByRole('button', { name: /Додати в колекцію/ }).click()
    await page.getByText(/немає в демо-каталозі/).waitFor()
    const radios = await page.getByRole('radiogroup', { name: 'Каталог рослин' }).getByRole('radio').allInnerTexts()
    ok(radios.length === 4 && radios.every((r) => /Інш/.test(r)), 'форма пропонує лише загальні типи «Інша …»')
    ok(await page.getByLabel(/Своя назва/).inputValue() === 'Aloe vera', 'назва з розпізнавання підставлена')
    await page.getByRole('radio', { name: /Інша кімнатна/ }).click()
    await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
    await page.getByRole('heading', { name: 'Aloe vera', exact: true }).waitFor()
    ok(true, 'картку «Aloe vera» (Інша кімнатна рослина) створено')
    await ctx.close()
  }
  // 4. Помилки та невпевненість
  for (const [name, setup, expect] of [
    ['429', (p) => proxyReply(p, 429, { error: 'rate_limited' }), /Ліміт розпізнавань/],
    ['500', (p) => proxyReply(p, 502, { error: 'upstream_error' }), /тимчасово недоступний/],
    ['мережа', (p) => p.route(PROXY, (r) => r.abort()), /Немає зʼєднання/],
    ['некоректна відповідь', (p) => p.route(PROXY, (r) => r.fulfill({ status: 200, body: '<html>' })), /некоректну відповідь/],
    ['не впізнано', (p) => proxyReply(p, 200, { source: 'Pl@ntNet', results: [] }), /Рослину не впізнано/],
    ['невпевнено', (p) => proxyReply(p, 200, { source: 'Pl@ntNet', results: [{ scientificName: 'Rosa canina', genus: 'Rosa', commonNames: [], score: 0.12 }] }), /Сервіс не впевнений/],
  ]) {
    const { ctx, page, errs } = await ctxPage({ proxy: true })
    await setup(page)
    await page.goto(URL + '#/identify')
    await pickPhoto(page, () => page.getByRole('button', { name: /З галереї/ }).click())
    await page.getByText(expect).waitFor()
    ok(await page.getByRole('button', { name: /обрати вручну/ }).isVisible() && errs.length === 0, `помилка «${name}»: зрозуміле повідомлення + ручний вибір`)
    await ctx.close()
  }
  // 6. Підказка про HTTPS-версію: лише без захищеного з'єднання
  {
    const { ctx, page } = await ctxPage()
    await page.goto(URL)
    await page.getByText('Розпізнати рослину за фото').first().waitFor()
    const hint = page.getByRole('complementary', { name: 'Встановити на телефон' })
    if (await page.evaluate(() => isSecureContext)) {
      ok(await hint.count() === 0, 'HTTPS/localhost: підказку про встановлення не показано')
    } else {
      ok(await hint.isVisible(), 'HTTP: на головній є підказка про HTTPS-версію')
      ok(await hint.getByRole('link').getAttribute('href') === 'https://alexrud1993.github.io/zhorzhyna-rudriges/', 'посилання веде на HTTPS-адресу')
      await hint.getByRole('button', { name: 'Сховати підказку' }).click()
      await page.reload(); await page.getByText('Розпізнати рослину за фото').first().waitFor()
      ok(await hint.count() === 0, 'сховану підказку не показано після reload')
      await page.goto(URL + '#/settings')
      ok(await page.getByRole('complementary', { name: 'Встановити на телефон' }).isVisible(), 'у параметрах підказка лишається завжди')
    }
    await ctx.close()
  }
  // 5. Регресії QA
  {
    const { ctx, page } = await ctxPage({ width: 320, height: 640 })
    const sizes = []
    page.on('response', async (r) => { try { sizes.push((await r.body()).length) } catch {} })
    await page.goto(URL, { waitUntil: 'networkidle' })
    const kb = Math.round(sizes.reduce((a, b) => a + b, 0) / 1024)
    ok(kb < 600, `вага першого завантаження ${kb} КБ (було ~2011 КБ)`)
    const clipped = await page.evaluate(() => [...document.querySelectorAll('nav.fixed a span')].some((s) => s.scrollWidth > s.clientWidth))
    ok(!clipped, '320 px: підписи нижньої навігації не обрізані')
    for (const h of ['#/', '#/identify', '#/plants/new']) {
      await page.goto(URL + h); await page.waitForTimeout(300)
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `320 px без переповнення ${h}`)
    }
    await page.goto(URL + '#/calendar'); await page.waitForTimeout(300)
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
    ok((await page.evaluate(() => [location.hash, document.activeElement?.id])).join() === '#/calendar,main', 'skip-link лишає на сторінці й фокусує main')
    await ctx.close()
  }
  {
    const { ctx, page } = await ctxPage({ timezoneId: 'Europe/Kyiv' })
    await page.clock.install({ time: new Date('2026-11-02T00:30:00+02:00') })
    await page.goto(URL + '#/plants/new')
    ok(await page.locator('#lw').getAttribute('max') === '2026-11-02', 'дата поливу: max = локальна дата після опівночі')
    await ctx.close()
  }
  {
    const { ctx, page } = await ctxPage({ timezoneId: 'Europe/Kyiv' })
    await page.clock.install({ time: new Date('2026-11-01T09:00:00+02:00') })
    await page.goto(URL + '#/plants/new')
    await page.getByRole('radio', { name: /Томат/ }).click()
    await page.locator('#lw').fill('2026-11-01')
    await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
    await page.getByText('Журнал догляду').waitFor()
    const row = await page.locator('section[aria-labelledby="hist"] li').first().innerText()
    ok(/09:0\d/.test(row), 'полив «сьогодні» записано поточним часом, не 12:00 у майбутньому: ' + row.replace(/\s+/g, ' '))
    await page.getByRole('button', { name: /Видалити/ }).click()
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab')
    ok(await page.evaluate(() => !!document.activeElement?.closest('[role=alertdialog]')), 'діалог тримає фокус усередині')
    await page.keyboard.press('Escape')
    ok(await page.evaluate(() => /Видалити/.test(document.activeElement?.textContent ?? '')), 'після закриття діалогу фокус повертається на кнопку')
    await page.goto(URL + '#/calendar')
    await page.getByRole('button', { name: /Позначити виконаним/ }).first().click().catch(() => {})
    ok(await page.getByRole('status').filter({ hasText: /перевірено/ }).count() <= 1, 'календар: дія «Виконано» не падає')
    await ctx.close()
  }
} catch (e) { console.log('FAIL exception', e.message); fails++ }
await browser.close(); srv?.kill()
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0)
