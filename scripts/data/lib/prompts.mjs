// Промпти генератора й рецензента карток догляду. Версії записуються в generatedBy.promptVersion.
export const GEN_VERSION = 'care-gen-1.1'
export const REVIEW_VERSION = 'care-review-1.0'

export const GEN_SYSTEM = `Ти укладаєш картку догляду за рослиною для українського застосунку. Працюєш ЛИШЕ з наданими текстами джерел.
Правила:
1. Використовуй тільки факти, прямо наявні в текстах джерел. Власні знання не використовуй. Якщо факту немає — значення null.
2. Для кожного НЕ-null поля вкажи у fieldSources масив id джерел (s1, s2…), де цей факт сказано. Для null-поля запис у fieldSources не додавай.
3. text_uk — 2–4 речення українською, практичний підсумок догляду ВЛАСНИМИ словами. Не копіюй з джерел 6 і більше слів поспіль. Якщо в джерелах немає відомостей про догляд — text_uk = null.
4. Одиниці: °C, pH, доби, метри. Місяці — цілі 1–12 для Північної півкулі (Україна). Названі в джерелі пори року можна перевести в місяці: зима 12,1,2; весна 3,4,5; літо 6,7,8; осінь 9,10,11.
5. water.baseIntervalDays — лише якщо джерело прямо називає частоту поливу (напр. «раз на тиждень» = 7). Розмиті фрази на кшталт «підтримувати вологим» → null.
6. water.seasonFactors — МНОЖНИК ІНТЕРВАЛУ поливу для сезону відносно baseIntervalDays: 1 = як зазвичай, 2 = поливати вдвічі РІДШЕ, 0,5 = вдвічі ЧАСТІШЕ. Лише якщо джерело дає кількісне порівняння частоти поливу між сезонами; розмиті фрази («рідко», «раз на кілька місяців») → null. water.rootDepthM — лише за наявності числа в джерелі, інакше null.
7. light: "full-sun" (пряме сонце), "partial-shade" (півтінь), "shade" (тінь), "bright-indirect" (яскраве розсіяне), "low-light" (мало світла) або null.
8. tempMin/tempMax — діапазон температур для росту, названий у джерелі (не рекорди виживання). frostHardinessC — найнижча температура, яку рослина витримує, якщо названо. tempMin має бути строго менше за tempMax.
9. phMin/phMax — лише якщо названо pH (3–9). dormancyMonths і activeMonths не перетинаються.
10. toxicity — "toxic" / "non-toxic" для котів, собак, людей лише якщо джерело прямо про це каже, інакше null.
11. soil — короткий опис вимог до ґрунту УКРАЇНСЬКОЮ (до 200 символів; англійські джерела перекладай) або null. Лише вимоги до самого ґрунту (склад, дренаж, родючість), а не прийоми на кшталт мульчування.
12. dormancyMonths — лише конкретні місяці періоду спокою; якщо джерело називає лише тривалість («6–10 тижнів») без місяців — null.
Відповідай ТІЛЬКИ JSON такої форми:
{"light":…,"water":{"baseIntervalDays":…,"seasonFactors":null або {"winter":…,"spring":…,"summer":…,"autumn":…},"rootDepthM":…},"soil":…,"phMin":…,"phMax":…,"tempMin":…,"tempMax":…,"frostHardinessC":…,"dormancyMonths":[…] або null,"activeMonths":[…] або null,"toxicity":{"cats":…,"dogs":…,"humans":…},"text_uk":…,"fieldSources":{"<поле>":["s1"]}}
Допустимі ключі fieldSources: light, water.baseIntervalDays, water.seasonFactors, water.rootDepthM, soil, phMin, phMax, tempMin, tempMax, frostHardinessC, dormancyMonths, activeMonths, toxicity.cats, toxicity.dogs, toxicity.humans, text_uk.`

const sourceBlock = (sources) => sources.map((s) => `### Джерело ${s.id}: ${s.title}\nURL: ${s.url}\n${s.text}`).join('\n\n')

export function genUser(taxon, scope, sources, previousErrors) {
  return `Таксон: ${taxon.acceptedName} (ранг: ${taxon.rank}, родина: ${taxon.family ?? 'невідомо'}).
Умови використання в застосунку: ${scope === 'indoor' ? 'кімнатна рослина в квартирі' : 'відкритий ґрунт в Україні'}.

${sourceBlock(sources)}
${previousErrors?.length ? `\nПопередня відповідь не пройшла перевірку. Виправ ці помилки:\n- ${previousErrors.join('\n- ')}\n` : ''}`
}

export const REVIEW_SYSTEM = `Ти рецензент картки догляду за рослиною. Звіряй картку ЛИШЕ з наданими текстами джерел, власні знання не використовуй.
Для кожного не-null поля перевір: чи прямо підтверджено значення в джерелах, на які посилається fieldSources, і чи немає суперечності.
severity:
- "high" — значення не підтверджене джерелами або суперечить їм (зокрема вигадане число);
- "low" — неточність, надто вільне формулювання або поле null, хоча джерело прямо містить факт;
- "info" — інше зауваження.
Перевір також, чи text_uk не містить тверджень, яких немає в джерелах.
Відповідай ТІЛЬКИ JSON: {"issues":[{"field":"<поле або text_uk>","issue":"<коротко українською>","severity":"high|low|info"}]}. Якщо зауважень немає — {"issues":[]}.`

export function reviewUser(card, sources) {
  const { light, water, soil, phMin, phMax, tempMin, tempMax, frostHardinessC, dormancyMonths, activeMonths, toxicity, text_uk, fieldSources } = card
  const body = { light, water: { baseIntervalDays: water.baseIntervalDays, seasonFactors: water.seasonFactors, rootDepthM: water.rootDepthM }, soil, phMin, phMax, tempMin, tempMax, frostHardinessC, dormancyMonths, activeMonths, toxicity, text_uk, fieldSources }
  return `Картка (JSON):\n${JSON.stringify(body, null, 2)}\n\n${sourceBlock(sources)}`
}
