ПОЛНЫЙ АУДИТ BACKEND — MottLarbe
ЭТАП 1: КАРТА ФУНКЦИОНАЛЬНОСТИ
Модули и эндпоинты
auth — Аутентификация
Method Path Что делает Вход Выход
POST /auth/login Вход по username+password, выдаёт JWT пару { username, password } { user, accessToken } + refresh cookie
POST /auth/register Регистрация, выдаёт JWT пару CreateUserDto { user, accessToken } + refresh cookie
POST /auth/login/access-token Обновление access token по refresh cookie refresh cookie { user, accessToken }
GET /auth/sessions Список активных сессий JWT UserSession[]
DELETE /auth/sessions/:id Отзыв конкретной сессии JWT + sessionId { success }
DELETE /auth/sessions Отзыв всех сессий JWT { success }
POST /auth/logout Выход: очищает refreshToken + добавляет blacklist в Redis JWT —
Зависимости: Prisma (User, UserSession, UserEvent), Redis (blacklist), argon2, JWT

users — Профиль пользователя
GET /users/:id — получить пользователя (self или admin)
PATCH /users — обновить профиль
DELETE /users — удалить аккаунт
texts — Тексты и контент
GET /texts — список с фильтрацией (language, level, tag, search, status), сортировка (newest/oldest/alpha/progress/length/level)
GET /texts/:id — полный текст со всеми страницами
GET /texts/:id/pages/:pageNumber — одна страница с токенами
GET /texts/continue-reading — тексты в процессе чтения (0 < progress < 100)
GET /texts/bookmarks — закладки
POST /texts/:id/bookmark — переключить закладку
GET /texts/tags — все теги
GET /texts/:id/related — похожие тексты
tokens — Токены
GET /tokens/:id — инфо о токене (перевод, грамматика, базовая форма, analyses)
words — Слова
POST /words/lookup — перевод по tokenId (цепочка: DB → online → morphology)
POST /words/lookup-by-word — перевод по строке слова
GET /words/:lemmaId/examples — примеры из корпуса
progress — Прогресс обучения
GET /progress/text/:id — прогресс чтения текста (0–100%)
GET /progress/review/stats — статистика SM-2 (due words, streak) [Premium]
GET /progress/review/due — слова для повторения сегодня [Premium]
POST /progress/review/:lemmaId — отправить результат повторения (quality 0–5) [Premium]
PATCH /progress/words/:lemmaId/status — ручная установка статуса (NEW/LEARNING/KNOWN)
GET /progress/words/:lemmaId/contexts — контексты встречи слова [Premium]
dictionary — Личный словарь
CRUD для записей словаря + папки [Premium для папок]
subscription / plans — Подписки
GET /plans — активные планы с группировкой
GET /subscription/me — текущая подписка
GET /subscription/payments — история платежей
GET /subscription/usage — текущее использование лимитов
POST /subscription/subscribe — подписаться на план
DELETE /subscription — отменить подписку
POST /subscription/promo — применить промокод
deck — Флеш-карточки [Premium]
GET/PATCH /deck/settings — настройки колоды
POST /deck/add/:lemmaId — добавить слово в NEW колоду
DELETE /deck/remove/:lemmaId — удалить слово
POST /deck/rate/:lemmaId — оценить карточку (know/again)
GET /deck/daily — N слов для добавления сегодня
GET /deck/due — карточки для повторения по типам колод
GET /deck/stats — статистика колоды
analytics / statistics / dashboard
GET /analytics/me — 30-дневная активность [Premium]
GET /statistics/me — полная статистика с heatmap, streak, charts [Premium]
POST /statistics/reading-time — логировать время чтения [Premium]
POST /statistics/review-session — логировать сессию повторений [Premium]
GET /dashboard/me — дашборд (stats + continue-reading)
settings — Настройки пользователя
GET/PATCH предпочтений, целей, уведомлений + экспорт данных + сброс прогресса/словаря
feedback — Обратная связь
Создание тредов, сообщения, реакции (👍👎🤯)
phrasebook — Разговорник
Категории, фразы, сохранение, предложения
Admin-модули (15 модулей)
/admin/: users, texts, billing, analytics, feature-flags, feedback, morphology, dictionary, tokenization, system-logs, tags, token, unknown-words, phrasebook, dashboard

Скрытая / неочевидная логика
Слово "кликнуто" → регистрируется событие + прогресс: при lookup() в WordsService вызывается registerClick() на WordProgressService, который делает upsert в UserWordProgress со статусом LEARNING и nextReview = today. Это происходит даже для неаутентифицированных пользователей (если userId не передан — пропускается через guard).

Токен не найден → записывается в UnknownWord: если слово не найдено ни в одном источнике, void this.unknownWordProcessor.recordFromLookup(...) вызывается fire-and-forget — без await и без обработки ошибки. Это намеренно, но неочевидно.

Logout ≠ revoke session: logout() добавляет Redis-blacklist по userId + timestamp, но revokeSession() отдельно обновляет UserSession.revokedAt. Это две независимые механики, не связанные между собой. Отзыв сессии в таблице не приводит к инвалидации токена.

PremiumGuard пропускает ADMIN/SUPERADMIN: делает 2 запроса к БД на каждый запрос к Premium-эндпоинтам.

Купон не создаёт подписку: redeemCoupon() только помечает купон как использованный, возвращает { type, amount }. Никакой подписки не создаётся — бэкенд не завершает flow.

Сортировка progress и level в getTexts: сортировка по прогрессу и уровню происходит в JavaScript, а не в SQL — весь список текстов загружается в память.

Дублирование функциональности
Функция Где реализована Дублирует
getStreak() analytics.service.ts:73 statistics.service.ts:199
getStreakRecord() analytics.service.ts:114 В statistics.getStreak() (поле record)
getStreakDays() (weekDays) analytics.service.ts:150 statistics.service.ts:241
getWordStats() analytics.service.ts:26 statistics.service.ts:317
Формула streak Идентична в обоих сервисах —
ЭТАП 2: АНАЛИЗ ВЫЧИСЛЕНИЙ
SM-2 Алгоритм (word-progress.service.ts:13)

Входные данные: repetitions, easeFactor (EF), interval, quality (0–5)

quality >= 3 (успех):
rep=0 → interval=1
rep=1 → interval=6
rep>1 → interval = round(interval _ EF)
EF = max(1.3, EF + 0.1 - (5-q)_(0.08 + (5-q)\*0.02))
rep++

quality < 3 (провал):
rep = 0, interval = 1
EF = max(1.3, EF - 0.2)

После applyFrequencyEffect:
uniqueTexts >= 3 → interval = max(1, round(interval _ 0.8))
uniqueTexts >= 2 → interval = max(1, round(interval _ 0.9))
Анализ корректности:

EF_DEFAULT = 2.5, EF_MIN = 1.3 — соответствует стандарту SM-2 ✓
Формула EF при успехе: EF + 0.1 - (5-q)*(0.08 + (5-q)*0.02) — это не совсем классический SM-2. Стандарт: EF - 0.8 + 0.28*q - 0.02*q². Текущая формула при q=5 даёт +0.1, при q=3 даёт +0.1 - 2*(0.08+0.04) = +0.1-0.24 = -0.14 — менее агрессивный рост. Это кастомизация, не баг.
При fail: EF - 0.2 вместо стандартного EF + 0.1 - 0.8*(0.8-0.28) → более мягкое снижение. OK.
Риск: после applySM2 переменная nextReview из destructuring перезаписывается правильно (строки 121–122). Пересчёт корректен.
Риск: nextReview = new Date(); nextReview.setDate(...) — создаётся местное время сервера. Если сервер в UTC+0, OK. Проблема при смене timezone сервера.
Прогресс текста (text-progress.service.ts:8)

Прогресс = count(known_lemmas_in_text) / count(unique_lemmas_in_text) \* 100
Риски:

total === 0 → return 0 — деление на 0 обработано ✓
Берёт только token.analyses[0]?.lemmaId — при ambiguous-токенах (несколько lemmaId) учитывается только первый. Это может занижать denominator.
Критически: TextProgressService запрашивает textToken.findMany (все токены текста), извлекает lemmaId в JS и затем делает userWordProgress.count. При тексте с 10 000 токенов — большой запрос.
Прогресс в statistics.getTextsProgress() берётся из userTextProgress.progressPercent (кешированное значение), а text-progress.service.ts считает "вживую". Нет консистентности — в statistics используется старый cached percent, в /progress/text/:id считается заново.
Статистика биллинга — MRR/ARR/Churn (admin-billing.service.ts:92)

MRR = Σ(monthly subs priceCents) + Σ(yearly subs priceCents / 12)
ARR = MRR _ 12
Conversion = newPaidLast30 / newUsersLast30 _ 100
Churn = canceledLast30 / payingCount \* 100
Риск деления на 0:

conversionRate: newUsersLast30 > 0 проверяется ✓
churnRate: payingCount > 0 проверяется ✓
Логические ошибки:

Churn Rate использует текущий payingCount (активные сейчас), а не количество на начало периода. Стандартная формула: canceled / (active_at_start_of_period). Текущая реализация искажает churn в сторону занижения при росте базы.
ARR = MRR _ 12 — неверно для годовых планов. Для годового плана ARR = priceCents (не priceCents/12 _ 12 = priceCents). Математически равно, но показывает что ежегодные планы вносят в ARR меньше, чем должны.
Не учитываются TRIALING-подписки в MRR (при trial пользователь ещё не платит — логично).
Streak расчёт (analytics.service.ts, statistics.service.ts)

1. Загрузить ВСЕ события пользователя
2. Извлечь уникальные дни (UTC ISO)
3. Если сегодня или вчера есть активность — считать streak
4. Итерировать назад, пока дни последовательны
   Риски:

new Date().toISOString() — UTC. Для пользователя в UTC+3, событие в 23:00 местного = 20:00 UTC = "сегодня" по UTC. Событие в 01:00 местного = 22:00 UTC предыдущего дня = "вчера" по UTC. Streak сломается, если пользователь учится вечером.
Date.now() - 86_400_000 для "вчера" — некорректно при DST-переходе (день может быть 23 или 25 часов). Минимальный риск для prod.
Performance: findMany({ where: { userId } }) без ограничения — для пользователя с 2+ годами активности может загрузить 50 000+ событий.
Revenue by plan (admin-billing.service.ts:168)

net = amountCents - refundedCents
Суммируется по planId
Риск: p.subscription?.plan может быть null (если подписка удалена). Обработано: if (!plan) continue ✓

Accuracy/Streak в statistics (statistics.service.ts:422)

percent = correct / total * 100
bestStreak = максимальная серия правильных ответов подряд
total > 0 ? Math.round(correct/total*100) : 0 — деление на 0 обработано ✓
correct / total — float, Math.round — нет потери точности
rebalanceRetired — N+1 (deck.service.ts:251)

for (const card of oldest) {
const deckCount = await this.prisma.userDeckCard.count(...) // query per card
await this.prisma.userDeckCard.update(...) // query per card
}
Критическая проблема производительности: 2 SQL запроса на каждую карточку. При overflow 100 карточек = 200 запросов.

ЭТАП 3: КАК РАБОТАЕТ VS КАК ДОЛЖНО
Auth — токен-блэклист
Как сейчас При logout: Redis key session:blacklist:{userId} = timestamp. JwtStrategy проверяет iat \* 1000 < blacklistTimestamp. TTL = время жизни access token (1h).
Как должно Так и должно работать — это правильный паттерн "issued-before invalidation".
Расхождение Revoke session в таблице UserSession не связана с JWT-блэклистом. Можно "отозвать" сессию в UI, но токен продолжит работать до logout.
Критичность medium
Auth — register race condition
Как сейчас Проверка getByUsername + getByEmail, затем create — не атомарно
Как должно Unique constraints на DB уровне (есть в Prisma schema?) + обработка P2002 ошибки от Prisma → ConflictException
Расхождение При concurrent регистрации с одинаковым email оба запроса пройдут проверки, один упадёт с Prisma P2002 необработанной ошибкой (500 вместо 409)
Критичность medium
PremiumGuard — 2 DB запроса на каждый запрос
Как сейчас findFirst для adminRole + findFirst для subscription = 2 запроса синхронно (выполнены через await последовательно в guard)
Как должно Параллельные запросы через Promise.all(), или кеш подписки в Redis (TTL 5 мин)
Расхождение Выполняется последовательно (сначала admin check, потом subscription). При высокой нагрузке — latency overhead
Критичность low-medium
PlanLimits — не enforced
Как сейчас PlanLimits DTO определён, limits хранятся в plan.limits (JSON). /subscription/usage возвращает текущее использование vs лимит. Но нигде в бизнес-логике не проверяется лимит при добавлении слова или при переводе.
Как должно При добавлении слова в словарь: if (count >= limit) throw ForbiddenException. При переводе: считать CLICK_WORD сегодня и блокировать при превышении.
Расхождение Лимиты — декоративные. Пользователь с бесплатным планом может добавить неограниченно слов.
Критичность high
Coupon — незавершённый flow
Как сейчас redeemCoupon() → { type, amount }. Создаётся CouponRedemption. Никакой подписки или скидки не применяется.
Как должно Купон должен либо: создавать бесплатную подписку на N дней, либо применяться как скидка при следующем платеже
Расхождение Flow полностью не реализован на бэкенде — фронтенд получает тип/сумму скидки и... ничего не может сделать с этим
Критичность high
Text Progress — кэш vs live расчёт
Как сейчас /progress/text/:id пересчитывает прогресс "вживую" каждый раз. В UserTextProgress.progressPercent хранится кешированное значение (обновляется где-то). В statistics.getTextsProgress() используется кеш.
Как должно Один источник правды: либо всегда live, либо всегда кеш с явным обновлением
Расхождение Статистика показывает одно значение прогресса, а /progress/text/:id может показывать другое
Критичность medium
getTexts — сортировка в памяти
Как сейчас getTexts() загружает ВСЕ опубликованные тексты, затем для сортировки progress/level сортирует массив в JS (строки 100+)
Как должно Пагинация + push sorting в DB. При 10 000+ текстах — проблема
Расхождение Нет пагинации в /texts endpoint
Критичность medium (пока текстов мало)
Statistics — все события без лимита
Как сейчас getStreak() делает findMany({ where: { userId } }) без take
Как должно Ограничить выборку последними 365–730 днями или использовать оконные функции SQL
Расхождение Потенциально медленно для активных пользователей
Критичность medium
ЭТАП 4: СЛАБЫЕ МЕСТА И РИСКИ
Логические ошибки и баги
[BUG-1] rebalanceRetired — N+1 внутри цикла
deck.service.ts:267 — prisma.count и prisma.update внутри for цикла. При overflow в 50 карточек = 100 SQL запросов.

[BUG-2] Register не обрабатывает Prisma P2002
Concurrent registration с одинаковым email → один упадёт с необработанным Prisma error → 500 Internal Server Error вместо 409 Conflict.

[BUG-3] Coupon не создаёт подписку
subscription.service.ts:170 — redeemCoupon() помечает купон, но не применяет никакого эффекта. Flow сломан.

[BUG-4] Plan limits не enforced
Нет проверки лимитов при createDictionaryEntry и при lookup (перевод). Монетизация не работает.

[BUG-5] Timezone в streak
analytics.service.ts:87, statistics.service.ts:208 — toISOString() всегда UTC. Пользователь в UTC+3, учащийся в 01:30 ночи — его активность "падает" на предыдущий день по UTC, ломая streak.

[BUG-6] TextProgress inconsistency
Два источника прогресса: UserTextProgress.progressPercent (кеш) vs TextProgressService.calculateProgress() (live). Нигде нет явного обновления кеша.

[BUG-7] setWordStatus LEARNING не сохраняет repetitions/interval
word-progress.service.ts:247 — при установке LEARNING через upsert не обновляются repetitions и interval (только в create). Если прогресс уже существует — repetitions сохраняются от предыдущего состояния, nextReview ставится на сегодня.

[BUG-8] Churn Rate формула
admin-billing.service.ts:149 — делитель payingCount (текущие активные), а не активные в начале периода. Метрика математически некорректна.

[BUG-9] getTexts — нет пагинации
text.service.ts:53 — findMany без take/skip. При тысячах текстов — проблема памяти и latency.

Проблемы безопасности
[SEC-1] Validate login по username, не по email
auth.service.ts:238 — findFirst({ where: { username: dto.username } }). Если LoginDto называется поле username, но пользователь ожидает логин по email — потенциальная путаница в API-контракте. Надо уточнить намерение.

[SEC-2] Session revoke не инвалидирует JWT
Отзыв сессии через DELETE /auth/sessions/:id только устанавливает revokedAt в таблице. JWT не помещается в blacklist. Токен остаётся рабочим.

[SEC-3] Нет rate limiting на token refresh
/auth/login/access-token нет @Throttle() декоратора. Брутфорс refresh токена возможен.

[SEC-4] Refresh token в cookie — secure только в production
auth.service.ts:115 — secure: isProduction. В development cookies передаются незашифрованными.

[SEC-5] Нет валидации durationSeconds
statistics/reading-time принимает durationSeconds из клиента без верхнего лимита. Можно отправить durationSeconds: 999999.

Проблемы масштабирования
[SCALE-1] streak/analytics загружают все события без лимита
При активном пользователе за 1–2 года: десятки тысяч строк. Нет индекса на (userId, createdAt) + type?

[SCALE-2] getReadingTime — агрегация в JS
statistics.service.ts:121 — findMany всех READ_SESSION, суммирование в JavaScript. Должен быть aggregate({ \_sum: { durationSeconds } }) через SQL.

[SCALE-3] statistics.getWordStats дублируется
analytics.service.ts:26 и statistics.service.ts:317 — идентичные запросы groupBy по userId+status. Dashboard вызывает analytics, statistics вызывает свой — итого при одном открытии страницы статистики с дашборда может быть 2 одинаковых groupBy запроса.

[SCALE-4] PremiumGuard — 2 запроса на каждый API-вызов
Без кеша при 1000 rps на premium-эндпоинты = 2000 дополнительных DB запросов в секунду.

[SCALE-5] saveContext — fire-and-forget внутри lookup
word-progress.service.ts:176 — void this.saveContext(...) без await. Если БД перегружена — ошибки молча глотаются. Возможна потеря контекстов.

Проблемы консистентности данных
[DATA-1] UserWordProgress без транзакции в registerClick
word-progress.service.ts:52 — upsert без транзакции. При concurrent кликах на одно слово — race condition на upsert. Prisma должен справиться, но гарантий нет.

[DATA-2] progressPercent в UserTextProgress не обновляется автоматически
Нет явного механизма обновления кешированного прогресса при каждом submitReview или setWordStatus. Кеш устареет.

[DATA-3] SubscriptionEvent не используется
Модель SubscriptionEvent определена в schema, но в subscription.service.ts никаких событий не создаётся. Аудит-лог подписок отсутствует.

[DATA-4] Coupon.redeemedCount vs CouponRedemption count
redeemedCount обновляется вручную через increment. При сбое транзакции после create(CouponRedemption) — счётчик может рассинхронизироваться.

ЭТАП 5: РЕКОМЕНДАЦИИ
🔴 Critical (исправить до production)
C1. Enforcing plan limits
Добавить проверку лимитов в dictionary.service.ts (при createDictionaryEntry) и в words.service.ts (при lookup). Использовать subscription/usage логику.

C2. Завершить coupon flow
redeemCoupon() должен либо создавать бесплатную временную подписку, либо сохранять примененную скидку к user/subscription. Текущий код — заглушка.

C3. Обработка Prisma P2002 при регистрации
В auth.service.ts добавить try/catch вокруг create() пользователя, конвертировать Prisma P2002 → 409 ConflictException.

C4. Rate limiting на token refresh
Добавить @Throttle({ default: { limit: 10, ttl: 60000 } }) на /auth/login/access-token.

C5. Session revoke должен инвалидировать токен
revokeSession() должен также добавлять userId в Redis blacklist с текущим timestamp.

C6. Исправить N+1 в rebalanceRetired
Заменить цикл с индивидуальными запросами на batch-операцию: updateMany по ID списка.

🟡 Important (исправить в ближайшем спринте)
I1. Добавить пагинацию в GET /texts
take, skip, возвращать { items, total, page, limit }.

I2. Устранить дублирование streak логики
Вынести streak расчёт в отдельный StreakService, который используют AnalyticsService и StatisticsService.

I3. Timezone-aware дата для streak
Передавать timezone пользователя (из настроек или заголовка) и использовать его при расчёте streak вместо UTC.

I4. Оптимизировать getReadingTime
Заменить findMany + reduce на SQL-агрегацию: raw query или jsonb aggregate function.

I5. Ограничить streak query по дате
Добавить createdAt: { gte: twoYearsAgo } в streak queries — нет смысла загружать все события за историю.

I6. PremiumGuard — параллельные запросы
Promise.all([adminCheck, subscriptionCheck]) вместо последовательного.

I7. Источник правды для text progress
Либо всегда live calculation, либо кеш с явным обновлением после каждого setWordStatus/submitReview. Выбрать одно.

I8. Валидация durationSeconds
Добавить @Max(86400) на поле durationSeconds в DTO (максимум 24 часа сессии).

I9. SubscriptionEvent — заполнять аудит-лог
В subscribeToPlan, cancelSubscription создавать SubscriptionEvent записи.

I10. Исправить Churn Rate
Хранить snapshot активных подписок начала периода или использовать SubscriptionEvent для корректного расчёта.

🟢 Nice-to-have
N1. Добавить тесты
Приоритет: SM-2 алгоритм, streak calculation, billing metrics, text progress formula.

N2. Кеш premium-статуса в Redis
TTL 5 минут на premium:{userId} — сократит DB нагрузку от PremiumGuard.

N3. Индексы для streak queries
CREATE INDEX ON user_event (user_id, created_at) + CREATE INDEX ON user_event (user_id, type, created_at).

N4. Response DTO / Swagger ApiResponse
Большинство endpoint'ов не имеют @ApiResponse с типом ответа — Swagger неполный.

N5. Логин по email или username
Сейчас только по username. Если планируется email — добавить OR [{ username }, { email }] в validateUser.

N6. Упростить getTextsProgress в statistics
Цепочка: userTextProgress → textProcessingVersion → textToken.groupBy — 3 запроса можно сократить до 2 с правильными join.

ЭТАП 6: ГОТОВНОСТЬ К FRONTEND
✅ Готово к использованию
Модуль Статус Примечания
Auth (login/register/logout/refresh) Стабильно Полный flow с cookie/JWT
Texts (list/page/bookmark/tags) Стабильно Нет пагинации — учесть
Token info Стабильно
Word lookup Стабильно Цепочка lookup работает
Dictionary (CRUD) Стабильно Лимиты не enforced
Settings (preferences/goals/export) Стабильно
Phrasebook Стабильно
Feedback (threads/messages) Стабильно
Progress (word status, text progress) Стабильно Inconsistency в кеше
Dashboard Стабильно
⚠️ Нестабильно / осторожно
Модуль Проблема Риск для фронтенда
Subscription/Billing Только MANUAL provider, coupon не работает Нельзя строить реальный payment flow
Statistics Медленно при большой истории, timezone bug Streak может быть неверным для пользователей не в UTC
Deck (flashcards) N+1 при rebalance, нет очевидного триггера обновления UI может зависать при rebalance
Progress review (SM-2) Логика работает, но inconsistency с text progress
❌ Нельзя использовать в prod
Модуль Проблема
Coupon redeem Не создаёт подписку — фронтенд не знает что делать с ответом
Plan limits Не enforced — нет смысла показывать лимиты если они не применяются
Где не хватает контрактов (DTO/схем)
Ответы всех GET endpoints — большинство возвращают Prisma-модели напрямую (включая лишние поля), нет @ApiResponse с response DTO. Swagger неполный.
plan.limits (JSON field) — тип не определён строго: PlanLimits DTO есть, но при чтении кастится через as Record<string, number>. Нет автоматической валидации при updatePlan.
userEvent.metadata (JSON field) — тип строго не описан. В 4 местах кастится по-разному: { durationSeconds }, { textId }, { correct, wrong }, { pageNumber }. Нет единого union type.
Ответ GET /texts — возвращает прогрессы / закладки только если авторизован. Фронтенд должен знать этот контракт заранее.
/words/lookup возвращает разный набор полей для токенов с данными vs без — два разных shape ответа из одного endpoint.
Потенциальные проблемы интеграции
Refresh token в httpOnly cookie: фронтенд не должен читать токен вручную. При SSR (Next.js) нужна специальная обработка cookie forwarding.
CORS exposedHeaders: ['set-cookie']: в main.ts это выставлено, но браузеры обычно не дают JS доступ к set-cookie. Это нормально — refresh работает через cookie, не через JS.
Swagger только в non-production: при staging деплое с NODE_ENV=production — /api/docs недоступен.
Нет версионирования API: /api/v1/... отсутствует. При breaking changes — проблема.
ФИНАЛЬНАЯ САМОПРОВЕРКА
Что могло быть проанализировано недостаточно глубоко
Markup Engine pipeline — tokenizer.service.ts, morphology.service.ts, rule-engine.service.ts не были прочитаны детально. Цепочка токенизации может иметь свои баги и узкие места.

Admin services — admin-analytics.service.ts, admin-users.service.ts, admin-text.service.ts прочитаны частично. Возможны дополнительные N+1 проблемы.

Prisma schema — не был прочитан полностью. Неизвестно: есть ли @@unique на User.email/username, есть ли индексы на userEvent(userId, createdAt), есть ли onDelete: Cascade там где нужно.

feature-flags.service.ts — логика rolloutPercent и per-user overrides не проверялась. Возможны баги в A/B распределении.

word-lookup-by-word.service.ts — цепочка admin→cache→online→morphology не проверена на корректность приоритетов и обработку ошибок.

settings/export — экспорт данных в CSV/JSON не проверялся на корректность и безопасность.

Что нужно проверить вручную
Prisma schema: @@unique constraints на User (email, username)
Prisma schema: индексы на user_event, user_word_progress, user_text_progress
Работает ли token refresh при конкурентных запросах (race condition на hashedRefreshToken)
Корректно ли обновляется UserTextProgress.progressPercent — когда и где
Что происходит при удалении пользователя (DELETE /users) — каскады в schema
Throttler конфигурация — применяется ли глобально или только на помеченных роутах
Загрузка изображений (обложки текстов) — сохраняются в /uploads/covers/, нет валидации типа/размера файла, нет CDN
