# Архитектура проекта

## Общая картина

MottLarbe — это REST API для платформы изучения чеченского языка. Фронтенд (отдельный репозиторий) общается с бэкендом по HTTP через `/api`.

```
Фронтенд (Next.js)
      │
      ▼ HTTP /api
┌──────────────────────────────────────────────────┐
│                  NestJS Backend                  │
│                                                  │
│  [Middleware] → [Guards] → [Controllers]         │
│                              │                   │
│                              ▼                   │
│                         [Services]               │
│                       │           │              │
│                       ▼           ▼              │
│                 [Prisma ORM]   [Redis]           │
│                       │           │              │
└───────────────────────┼───────────┼──────────────┘
                        ▼           ▼
                  PostgreSQL      Redis
                                    │
                                    ▼
                          Внешний API: Dosham
                          (online-dictionary)
```

## Слои приложения

### 1. Контроллеры (Controllers)
Принимают HTTP-запросы, валидируют DTO, возвращают ответы.
Файлы: `src/*/**.controller.ts`

### 2. Сервисы (Services)
Вся бизнес-логика. Контроллеры вызывают сервисы.
Файлы: `src/*/**.service.ts`

### 3. Гварды (Guards)
Проверяют права доступа до того, как запрос попадёт в контроллер.

| Guard | Файл | Что делает |
|-------|------|-----------|
| `JwtAuthGuard` | [src/auth/jwt/jwt.guard.ts](../src/auth/jwt/jwt.guard.ts) | Проверяет JWT access-токен |
| `OptionalJwtAuthGuard` | [src/auth/jwt/optional-jwt.guard.ts](../src/auth/jwt/optional-jwt.guard.ts) | Не падает, если токена нет — но если он передан, валидирует его |
| `PermissionGuard` | [src/auth/permissions/permission.guard.ts](../src/auth/permissions/permission.guard.ts) | Проверяет наличие конкретного `PermissionCode` у пользователя через RBAC |
| `PremiumGuard` | [src/auth/guards/premium.guard.ts](../src/auth/guards/premium.guard.ts) | Проверяет наличие активной подписки |
| `ThrottlerGuard` | глобально (APP_GUARD) | Rate limiting (100 запросов / 60 сек), хранилище — Redis |

### 4. Декораторы
Удобные обёртки и параметрические декораторы для использования в контроллерах.

| Декоратор | Файл | Что делает |
|-----------|------|-----------|
| `@Auth()` | [auth.decorator.ts](../src/auth/decorators/auth.decorator.ts) | Требует валидный JWT (`JwtAuthGuard`) |
| `@OptionalAuth()` | [optional-auth.decorator.ts](../src/auth/decorators/optional-auth.decorator.ts) | Авторизация необязательна, но `req.user` заполняется при наличии токена |
| `@Admin()` | [admin.decorator.ts](../src/auth/decorators/admin.decorator.ts) | Требует `PermissionCode.CAN_MANAGE_USERS` (через `JwtAuthGuard` + `PermissionGuard`) |
| `@AdminPermission(code)` | [admin-permission.decorator.ts](../src/auth/decorators/admin-permission.decorator.ts) | Требует конкретный `PermissionCode` |
| `@RequiresPremium()` | [premium.decorator.ts](../src/auth/decorators/premium.decorator.ts) | JWT + проверка активной подписки + Swagger-метаданные |
| `@SessionId()` | [session-id.decorator.ts](../src/auth/decorators/session-id.decorator.ts) | Достаёт `sessionId` из JWT-payload (`sid`) |
| `@RequirePermission(code)` | [permission.decorator.ts](../src/auth/permissions/permission.decorator.ts) | Низкоуровневый маркер для `PermissionGuard` (используется внутри `Admin`/`AdminPermission`) |

### 5. Middleware, интерцепторы и фильтры

- **`correlationIdMiddleware`** — присваивает каждому запросу `X-Correlation-Id` (или принимает входящий) для сквозного трекинга. Файл: [src/common/middleware/correlation-id.middleware.ts](../src/common/middleware/correlation-id.middleware.ts).
- **`LoggingInterceptor`** — глобальный (APP_INTERCEPTOR), логирует каждый запрос/ответ. Файл: [src/common/interceptors/logging.interceptor.ts](../src/common/interceptors/logging.interceptor.ts).
- **`AllExceptionsFilter`** — глобальный (APP_FILTER), перехватывает все ошибки и отдаёт единый формат ответа. Файл: [src/common/filters/all-exceptions.filter.ts](../src/common/filters/all-exceptions.filter.ts).
- **`ObservabilityModule`** — общий модуль наблюдаемости (метрики/трассировка). Файлы: [src/common/observability/](../src/common/observability/).

---

## Конфигурация приложения

### Точка входа: [src/main.ts](../src/main.ts)

```
Порт:           9555 (или PORT из .env)
Префикс API:    /api
CORS:           разрешён с FRONTEND_URL, credentials=true
Swagger UI:     /api/docs (только в non-production)
OpenAPI JSON:   /api/openapi.json + openapi/openapi.v1.json (генерируется при старте)
Cookies:        cookie-parser, для refresh-токена
Helmet:         HTTP-security заголовки
Static:         /uploads → ./uploads (covers и пр.)
ValidationPipe: whitelist + forbidNonWhitelisted + transform (глобально)
Versioning:     временно отключено (заголовок x-api-version в CORS остаётся)
Logger:         Winston через WINSTON_MODULE_NEST_PROVIDER
```

### Корневой модуль: [src/app.module.ts](../src/app.module.ts)

Регистрирует:
- `ConfigModule` — переменные окружения с Joi-валидацией ([src/config/env.validation.ts](../src/config/env.validation.ts))
- `WinstonModule` — логирование
- `RedisModule` — подключение к Redis (`ioredis`)
- `ScheduleModule` — cron-задачи (например, очистка просроченных password-reset токенов)
- `ObservabilityModule` — наблюдаемость
- `ThrottlerModule` — rate limiting через Redis-хранилище
- Глобальные провайдеры: `ThrottlerGuard`, `LoggingInterceptor`, `AllExceptionsFilter`
- Все feature-модули (см. ниже)

---

## Список feature-модулей

Публичные / пользовательские модули в `src/`:

| Модуль | Папка | Назначение |
|--------|-------|-----------|
| Auth | [src/auth/](../src/auth/) | Регистрация/логин, JWT, refresh, password reset, RBAC |
| User | [src/user/](../src/user/) | Профиль пользователя |
| Text | [src/text/](../src/text/) | Тексты и страницы для чтения |
| Token | [src/token/](../src/token/) | Работа с токенами текста (слово в позиции) |
| Words | [src/words/](../src/words/) | Пользовательский словарь / личные слова |
| Dictionary | [src/dictionary/](../src/dictionary/) | Публичный словарь |
| Deck | [src/deck/](../src/deck/) | Колоды для повторения |
| Progress | [src/progress/](../src/progress/) | Прогресс изучения |
| Subscription | [src/subscription/](../src/subscription/) | Подписки (Premium) |
| Analytics | [src/analytics/](../src/analytics/) | Пользовательская аналитика |
| Dashboard | [src/dashboard/](../src/dashboard/) | Сводный дашборд для пользователя |
| Statistics | [src/statistics/](../src/statistics/) | Публичная статистика |
| Feedback | [src/feedback/](../src/feedback/) | Отзывы / обратная связь |
| Phrasebook | [src/phrasebook/](../src/phrasebook/) | Разговорник |
| Settings | [src/settings/](../src/settings/) | Пользовательские настройки (preferences/goals/notifications/export/reset) |
| Health | [src/health/](../src/health/) | Liveness/readiness-эндпоинты |
| Legal | [src/legal/](../src/legal/) | Публикация юридических документов |
| Tokenizer | [src/markup-engine/tokenizer/](../src/markup-engine/tokenizer/) | Точка входа в конвейер обработки текста |
| Admin | [src/admin/](../src/admin/) | Админ-API (см. ниже) |

Внутренние / служебные:

| Модуль | Папка | Назначение |
|--------|-------|-----------|
| Markup-engine | [src/markup-engine/](../src/markup-engine/) | Конвейер обработки текста (tokenizer, normalizer, dictionary, dictionary-cache, online-dictionary, morphology, unknown-word) |
| Cache | [src/cache/](../src/cache/) | `TokenInfoCacheService` — Redis-кеш по `tokenId` и `(versionId, normalized)` |
| Redis | [src/redis/](../src/redis/) | Тонкая обёртка над `ioredis` |
| Logger | [src/logger/](../src/logger/) | Конфиг Winston |
| Mail | [src/mail/](../src/mail/) | Отправка писем (provider: log / resend), шаблоны |
| Billing | [src/billing/](../src/billing/) | DTO и лимиты тарифных планов |
| Feature-flags | [src/feature-flags/](../src/feature-flags/) | Feature-flags сервис |
| Temporary-pos | [src/temporary-pos/](../src/temporary-pos/) | Вспомогательные POS-DTO |
| Common | [src/common/](../src/common/) | Глобальные middleware/filters/interceptors/observability |
| Config | [src/config/](../src/config/) | Joi-валидация env |
| Prisma | [src/prisma.service.ts](../src/prisma.service.ts) | Prisma client как Nest-провайдер |

Подмодули админ-API ([src/admin/](../src/admin/)):
`analytics`, `billing`, `dashboard`, `dictionary`, `feature-flags`, `feedback`, `legal`, `logs`, `morphology`, `phrasebook`, `system-logs`, `tags`, `text`, `token`, `tokenization`, `unknown-words`, `uploads`, `users`.

---

## Redis — для чего используется

| Назначение | Описание |
|-----------|---------|
| Rate limiting | `ThrottlerStorageRedisService` хранит счётчики запросов per-IP (TTL 60 сек, лимит 100) |
| Кеш токен-инфо | `TokenInfoCacheService` — кеш развёрнутой информации по `tokenId` и по `(versionId, normalized)` (TTL 24 ч) |
| Кеш online-словаря | Результаты от Dosham API кешируются конвейером (`dictionary-cache`) |
| Очереди событий | `TokenizationEventsService` использует Redis для рассылки `progress`/`status_change` подписчикам |

Подключение: единый `RedisService extends IORedis` ([src/redis/redis.service.ts](../src/redis/redis.service.ts)) с авто-reconnect.

---

## Конвейер обработки текста

Запускается из [TokenizerProcessor.processText()](../src/markup-engine/tokenizer/tokenizer.processor.ts). Создаёт новую `TextProcessingVersion` и переводит её сначала в `RUNNING`, по завершении — в `COMPLETED` (или `ERROR`). Прогресс публикуется через `TokenizationEventsService` (`progress`, `status_change`).

```
Сырой текст (TipTap JSON в TextPage.contentRaw)
        │
        ▼
  Tokenizer            — режет страницы на токены с offset’ами
        │  (progress 20%)
        ▼
  Normalizer           — нормализованная форма для каждого токена
        │  (progress 40%)         [может быть отключено useNormalization=false]
        ▼
  Dictionary           — ищет совпадения в админ-словаре (DictionaryEntry source=ADMIN)
        │  (progress 55%)
        ▼
  Dictionary-cache     — ранее закэшированные результаты внешних источников
        │  (progress 70%)
        ▼
  Online-dictionary    — внешний API Dosham (DOSHAM_API_URL); ответы кладутся в кеш
        │  (progress 80%)
        ▼
  Unknown-word         — всё, что не нашли — фиксируется как UnknownWord
        │  (progress 90%)         [блок Dictionary…Unknown отключается useMorphAnalysis=false]
        ▼
  Vocabulary index     — TextVocabulary (уникальные слова версии) + перенос lemma/translation
        │  (progress 100%)
        ▼
  Версия помечается isCurrent=true, предыдущие — isCurrent=false
```

Морфологические правила управляются отдельно: [src/markup-engine/morphology/](../src/markup-engine/morphology/) — `morphology.service`, `rule-engine.service`, `morphology-importer.service`, `morphology-cleaner.service`.

Логи каждой версии пишутся в `TextVersionLog` (см. `writeLogs` в процессоре).

---

## Логирование

Используется **Winston** (`nest-winston`):
- В production — JSON-формат
- В development — читаемый цветной вывод
- Файлы (через ротацию): `logs/error.log` (только ошибки) и `logs/combined.log` (всё)
- Каждый запрос получает `X-Correlation-Id` (см. middleware) — он попадает в логи

Настройка: [src/logger/logger.config.ts](../src/logger/logger.config.ts).

---

## Переменные окружения

Все переменные валидируются Joi-схемой в [src/config/env.validation.ts](../src/config/env.validation.ts). Если что-то критичное не задано — приложение не стартует.

### Базовые

| Переменная | Описание | По умолчанию |
|-----------|---------|--------------|
| `NODE_ENV` | `development` / `test` / `production` | `development` |
| `PORT` | Порт сервера | `9555` |
| `FRONTEND_URL` | URL фронта для CORS | `http://localhost:3000` |
| `DOMAIN` | Домен для cookie | (опционально) |

### Хранилища

| Переменная | Описание |
|-----------|---------|
| `DATABASE_URL` | Строка подключения к PostgreSQL (`postgres://` / `postgresql://`) |
| `REDIS_URL` | Строка подключения к Redis (`redis://` / `rediss://`) |

### JWT / сессии

| Переменная | Описание |
|-----------|---------|
| `JWT_ACCESS_SECRET` | Секрет access-токена (мин. 16 симв.) |
| `JWT_REFRESH_SECRET` | Секрет refresh-токена (мин. 16 симв.) |
| `ACCESS_TOKEN_EXPIRES_IN` | Время жизни access-токена (например, `1h`) |
| `REFRESH_TOKEN_EXPIRES_IN` | Время жизни refresh-токена (например, `7d`) |
| `EXPIRE_DAY_REFRESH_TOKEN` | Срок refresh-cookie в днях (default 7) |
| `REFRESH_TOKEN_NAME` | Имя cookie для refresh-токена |

### Биллинг

| Переменная | Описание | По умолчанию |
|-----------|---------|--------------|
| `BILLING_PROVIDER` | `STRIPE` / `PAYPAL` / `PADDLE` / `LEMONSQUEEZY` / `MANUAL` | `MANUAL` |
| `ALLOW_MANUAL_BILLING_IN_PROD` | `true`/`false` — разрешить `MANUAL` в production | `false` |

### Внешние сервисы

| Переменная | Описание | По умолчанию |
|-----------|---------|--------------|
| `DOSHAM_API_URL` | URL внешнего словарного API Dosham | `http://localhost:9666/api` |

### Mail / password reset

| Переменная | Описание | По умолчанию |
|-----------|---------|--------------|
| `MAIL_PROVIDER` | `log` (только в логи, dev) или `resend` (реальная отправка) | `log` |
| `MAIL_FROM` | Адрес отправителя | `Мотт Ларбе <noreply@example.com>` |
| `MAIL_REPLY_TO` | Reply-To (опционально) | — |
| `RESEND_API_KEY` | Обязателен при `MAIL_PROVIDER=resend` | — |
| `PASSWORD_RESET_TOKEN_TTL_HOURS` | TTL токена сброса пароля (1..168) | `24` |
