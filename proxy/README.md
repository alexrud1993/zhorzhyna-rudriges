# Проксі розпізнавання рослин (Cloudflare Worker + Pl@ntNet)

Сайт на GitHub Pages — статичний, тому ключ сервісу розпізнавання **не можна** класти в код сайту. Цей воркер тримає ключ у секретах і пересилає фото на Pl@ntNet.

Що робить воркер: приймає лише `POST /identify` із дозволених сайтів (CORS), лише JPEG/PNG до 4 МБ, обмежує 10 запитів/хв з однієї IP-адреси, відповідає 5 варіантами без ключа у відповіді, фото не зберігає й не логує.

## Активація (≈10 хвилин, безкоштовно)

1. **Ключ Pl@ntNet.** Зареєструйтесь на <https://my.plantnet.org>, створіть API-ключ. Безкоштовний план: до 500 розпізнавань на день, некомерційне використання. Умови: <https://my.plantnet.org/terms_of_use>.
2. **Обліковий запис Cloudflare** (безкоштовний): <https://dash.cloudflare.com/sign-up>.
3. У цій теці:
   ```bash
   npx wrangler login
   npx wrangler secret put PLANTNET_API_KEY
   npx wrangler deploy
   ```
   `wrangler deploy` надрукує адресу на кшталт `https://zhorzhyna-identify.<ваш-піддомен>.workers.dev`.
4. **Підключити до сайту:** GitHub → репозиторій → Settings → Secrets and variables → Actions → вкладка **Variables** → New variable: `IDENTIFY_URL` = `https://zhorzhyna-identify.<ваш-піддомен>.workers.dev/identify`. Потім Actions → «Deploy to GitHub Pages» → Run workflow.

Після цього на сайті зникне напис «Автоматичне розпізнавання ще не підключено», а фото з камери одразу даватиме варіанти.

## Перевірка
```bash
node worker.test.mjs     # модульні тести без мережі
```
Список дозволених сайтів — `ALLOWED_ORIGINS` у `wrangler.toml`.
