// Тести нових можливостей: null у погоді, захист від подвійного кліку, ручна оцінка вологості,
// помилка запису у сховище, версія застосунку. Ізольований Chromium, мережа Open-Meteo підмінена.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const URL = process.env.APP_URL || 'http://localhost:4173/'
const srv = process.env.APP_URL ? null : spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { shell: true, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, srv ? 3500 : 0))
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const browser = await chromium.launch()

const weather = (body, status = 200) => (route) => route.fulfill({ status, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) })
const isoOk = { current: { temperature_2m: 18, relative_humidity_2m: null, precipitation: null }, daily: { precipitation_sum: [null, null, null, null, null], temperature_2m_max: [18, 19, null, 21, 20] } }

async function addPlant(page, name) {
  await page.goto(URL + '#/plants/new')
  await page.getByRole('radio', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
  await page.getByRole('heading', { name }).waitFor()
}

try {
  // 1. null не стає нулем
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.route('https://api.open-meteo.com/**', weather(isoOk))
    await page.goto(URL)
    await page.getByLabel('Погода').getByText('18°C', { exact: true }).waitFor()
    const t = await page.getByLabel('Погода').innerText()
    ok(!/0\.0 мм/.test(t) && /—/.test(t), 'null опади/вологість показуються як «—», не як 0')
    await ctx.close()
  }
  // 2. пошкоджена відповідь -> unavailable
  for (const [name, body] of [['не JSON', '<html>'], ['без current', { daily: {} }], ['масиви не масиви', { current: { temperature_2m: 5 }, daily: { precipitation_sum: 'x', temperature_2m_max: 1 } }]]) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const errs = []; page.on('pageerror', (e) => errs.push(e.message))
    await page.route('https://api.open-meteo.com/**', weather(body))
    await page.goto(URL)
    await page.getByText(/Погода недоступна/).waitFor()
    ok(errs.length === 0, `пошкоджена відповідь (${name}) -> недоступно без винятків`)
    await ctx.close()
  }
  // 3. подвійний клік, ручна оцінка вологості, версія
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.route('https://api.open-meteo.com/**', weather(isoOk))
    await page.goto(URL)
    await addPlant(page, 'Монстера')
    await page.getByRole('button', { name: 'Полив виконано' }).dblclick()
    await page.waitForTimeout(500)
    const n = await page.getByRole('button', { name: /Скасувати запис/ }).count()
    ok(n === 1, `подвійний клік «Полив виконано» створює 1 запис (є ${n})`)

    // simple режим: без панелі оцінки
    await page.getByRole('button', { name: 'Перевірив ґрунт' }).click()
    ok(await page.getByRole('group', { name: 'Оцінка вологості ґрунту' }).count() === 0, 'у Простому режимі оцінки вологості не питаємо')

    // розумний режим
    await page.goto(URL + '#/settings')
    await page.getByRole('radio', { name: 'Розумний' }).click()
    ok((await page.getByTestId('app-version').innerText()).length > 0, 'версія застосунку видна в налаштуваннях')
    await page.goto(URL + '#/plants')
    await page.getByRole('button', { name: /Монстера/ }).click()
    await page.waitForTimeout(2200) // вийти з вікна антидубля
    await page.getByRole('button', { name: 'Перевірив ґрунт' }).click()
    await page.getByRole('button', { name: 'Сухий' }).click()
    await page.getByText(/\(сухий\)/).waitFor()
    ok(await page.getByText(/перекриває розрахунок/).isVisible(), 'оцінка «Сухий» відображена в журналі і в поясненні підказки')
    // перезавантаження зберігає
    await page.reload()
    ok(await page.getByText(/\(сухий\)/).isVisible(), 'оцінка вологості зберігається після reload')
    // експорт/імпорт містить moisture
    await page.goto(URL + '#/settings')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Експорт/ }).click()])
    const fs = await import('node:fs')
    await dl.saveAs('tests/_f.json')
    const j = JSON.parse(fs.readFileSync('tests/_f.json', 'utf8'))
    ok(j.events.some((e) => e.moisture === 'dry'), 'експорт містить оцінку вологості')
    j.events[0].moisture = 'bogus'; fs.writeFileSync('tests/_f.json', JSON.stringify(j))
    await page.setInputFiles('#imp', 'tests/_f.json')
    await page.getByText(/Імпорт скасовано/).waitFor()
    ok(true, 'імпорт з некоректною оцінкою вологості відхилено')
    fs.unlinkSync('tests/_f.json')
    await ctx.close()
  }
  // 3б. фото: камера і галерея — окремі кнопки
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.route('https://api.open-meteo.com/**', weather(isoOk))
    await page.goto(URL + '#/plants/new')
    await page.locator('#photo-cam').waitFor({ state: 'attached' })
    ok((await page.locator('#photo-cam').getAttribute('capture')) === 'environment' && (await page.locator('#photo-file').getAttribute('capture')) === null, 'є кнопка камери (capture) і окрема кнопка галереї/файлу')
    await page.locator('#photo-file').setInputFiles('public/zhorzhyna-rudriges-logo.png')
    await page.getByAltText('Попередній перегляд').waitFor()
    await page.locator('#photo-cam').setInputFiles('public/zhorzhyna-rudriges-logo.png')
    ok(await page.getByAltText('Попередній перегляд').isVisible(), 'фото з файлу та з камери показують перегляд')
    await ctx.close()
  }
  // 4. помилка запису у сховище
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.route('https://api.open-meteo.com/**', weather(isoOk))
    await page.goto(URL)
    await page.getByRole('button', { name: 'Додати рослину' }).first().waitFor()
    await page.evaluate(() => {
      const orig = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function () { throw new DOMException('quota', 'QuotaExceededError') }
      window.__restore = () => { IDBObjectStore.prototype.put = orig }
    })
    await page.goto(URL + '#/plants/new')
    await page.getByRole('radio', { name: /Томат/ }).click()
    await page.getByRole('button', { name: 'Додати рослину', exact: true }).last().click()
    await page.getByRole('alert').filter({ hasText: 'Недостатньо місця' }).waitFor()
    ok(/plants\/new/.test(page.url()), 'помилка квоти показана, рослину не позначено збереженою')
    await page.evaluate(() => window.__restore())
    await page.goto(URL + '#/plants')
    ok(await page.getByText('0 рослин у колекції').isVisible(), 'після збою запису колекція лишилась порожньою')
    await ctx.close()
  }
} catch (e) { console.log('FAIL exception', e.message); fails++ }
await browser.close(); srv?.kill()
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0)
