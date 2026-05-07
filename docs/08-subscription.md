# Подписки и биллинг

Модуль: [src/subscription/](../src/subscription/), [src/billing/](../src/billing/)

Глобальный prefix приложения — `api`. Контроллер `SubscriptionController` объявлен с пустым `@Controller()`, поэтому фактические URL — `/api/plans`, `/api/subscription/...`.

---

## Тарифные планы

Тип плана хранится в enum `PlanType` (`prisma/schema.prisma`):

| Тип | Описание |
|-----|---------|
| `FREE` | Бесплатный — базовые функции с лимитами |
| `BASIC` | Зарезервирован, в seed не используется |
| `PRO` | Полный доступ + расширенная аналитика и приоритетная поддержка |
| `PREMIUM` | Безлимит переводов и большинство функций обучения |
| `LIFETIME` | Зарезервирован для одноразовой оплаты |

Конкретные планы (см. [prisma/helpers/billingHelper.ts](../prisma/helpers/billingHelper.ts)) сидятся в БД как записи модели `Plan`. В стандартном seed создаются:

| Code | Type | Interval | Группа (`groupCode`) | Цена | Trial |
|------|------|----------|----------------------|------|-------|
| `FREE` | `FREE` | — | — | 0 RUB | 0 |
| `PREMIUM_MONTHLY` | `PREMIUM` | `month` | `PREMIUM` | 690 RUB | 7 |
| `PREMIUM_YEARLY` | `PREMIUM` | `year` | `PREMIUM` | 6 624 RUB | 7 |
| `PRO_MONTHLY` | `PRO` | `month` | `PRO` | 1 290 RUB | 7 |
| `PRO_YEARLY` | `PRO` | `year` | `PRO` | 12 384 RUB | 7 |

Поле `groupCode` объединяет помесячный и годовой варианты одного тарифа — эндпоинт `GET /plans` возвращает их в виде `groups[].variants[]`.

---

## Лимиты планов (`PlanLimits`)

Структура DTO лимитов описана в [src/billing/plan-limits.ts](../src/billing/plan-limits.ts). Значение `-1` — безлимит, `0` — функция недоступна.

### Числовые лимиты

| Поле | Тип | Описание |
|------|-----|---------|
| `translationsPerDay` | `number?` | Переводов слова по клику в день |
| `wordsInDictionary` | `number?` | Слов в личном словаре |
| `availableTexts` | `number?` | Доступных текстов |
| `statisticsDays` | `number?` | Дней хранения статистики |
| `maxFolders` | `number?` | Максимум папок в личном словаре (`0` = функция недоступна) |

### Булевы фичи

| Поле | Описание |
|------|---------|
| `readTexts` | Чтение текстов |
| `wordTranslation` | Перевод слов по клику |
| `tokenAnalysis` | Грамматический разбор и базовая форма |
| `personalDictionary` | Личный словарь (добавление слов) |
| `dictionaryFolders` | Папки в личном словаре |
| `hasComplexTexts` | Доступ к сложным текстам (B2+/C-уровень) |
| `textProgress` | Прогресс чтения текстов в процентах |
| `spaceRepetition` | Интервальные повторения (SM-2) |
| `hasFlashcards` | Деки зазубривания (флэш-карточки) |
| `wordContexts` | Контексты слова — фрагменты текстов |
| `analytics` | Личная аналитика и статистика обучения |
| `hasAdvancedAnalytics` | Расширенная аналитика |
| `hasPrioritySupport` | Приоритетная поддержка |

Лимиты хранятся в поле `Plan.limits` (Json) и возвращаются клиенту целиком через `GET /subscription/usage`, чтобы фронт мог построить feature-list карточек и сравнительную таблицу планов.

### Сводка значений по seed-планам

| Поле | FREE | PREMIUM | PRO |
|------|------|---------|-----|
| `translationsPerDay` | 50 | -1 | -1 |
| `wordsInDictionary` | 500 | 10 000 | -1 |
| `availableTexts` | 20 | -1 | -1 |
| `statisticsDays` | -1 | -1 | -1 |
| `maxFolders` | 0 | 20 | -1 |
| `dictionaryFolders` | false | true | true |
| `hasComplexTexts` | false | true | true |
| `spaceRepetition` | false | true | true |
| `hasFlashcards` | false | true | true |
| `wordContexts` | false | true | true |
| `analytics` | false | true | true |
| `hasAdvancedAnalytics` | false | false | true |
| `hasPrioritySupport` | false | false | true |

---

## Статусы подписки

Enum `SubscriptionStatus`:

| Статус | Описание |
|--------|---------|
| `TRIALING` | Пробный период (создаётся через `POST /subscription/trial`) |
| `ACTIVE` | Активная подписка |
| `CANCELED` | Отменена пользователем или из-за смены плана |
| `EXPIRED` | Закончилась |

Активной для пользователя считается подписка со статусом `ACTIVE` или `TRIALING`.

---

## API Endpoints

Все маршруты ниже автоматически получают префикс `/api` благодаря `app.setGlobalPrefix("api")`. Защищённые эндпоинты используют `@Auth()` (Bearer JWT).

### Планы

| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| GET | `/api/plans` | — | Все активные планы, сгруппированные по `groupCode` |

Пример ответа:

```json
{
  "groups": [
    {
      "groupCode": "PREMIUM",
      "variants": [
        { "id": "...", "code": "PREMIUM_MONTHLY", "type": "PREMIUM", "interval": "month", "priceCents": 69000, "currency": "RUB", "trialDays": 7, "limits": { "...": "..." } },
        { "id": "...", "code": "PREMIUM_YEARLY",  "type": "PREMIUM", "interval": "year",  "priceCents": 662400, "currency": "RUB", "trialDays": 7, "limits": { "...": "..." } }
      ]
    }
  ],
  "ungrouped": [
    { "id": "...", "code": "FREE", "type": "FREE", "interval": null, "priceCents": 0, "currency": "RUB", "trialDays": 0, "limits": { "...": "..." } }
  ]
}
```

### Подписка пользователя

| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| GET | `/api/subscription/me` | Bearer | Текущая `ACTIVE` или `TRIALING` подписка с `plan` или `null` |
| GET | `/api/subscription/payments` | Bearer | История платежей пользователя (cursor-пагинация) |
| GET | `/api/subscription/usage` | Bearer | Сегодняшнее использование и лимиты текущего плана |
| POST | `/api/subscription/trial` | Bearer | Запуск бесплатного триала на выбранном плане |
| POST | `/api/subscription/subscribe` | Bearer | Подписка/смена плана |
| DELETE | `/api/subscription` | Bearer | Отмена текущей активной подписки |
| POST | `/api/subscription/promo` | Bearer | Применение промокода (сохраняется до следующей подписки) |

### `GET /api/subscription/payments`

Query-параметры:

| Параметр | Тип | По умолч. | Описание |
|----------|-----|-----------|---------|
| `limit` | int 1..100 | 20 | Размер страницы |
| `cursor` | string (id) | — | id последнего платежа предыдущей страницы |

Ответ:

```json
{
  "items": [
    {
      "id": "...",
      "amountCents": 69000,
      "currency": "RUB",
      "status": "SUCCEEDED",
      "provider": "MANUAL",
      "createdAt": "2026-04-29T12:00:00.000Z",
      "subscription": { "...": "...", "plan": { "code": "PREMIUM_MONTHLY" } }
    }
  ],
  "nextCursor": "uuid-or-null",
  "hasMore": true
}
```

### `GET /api/subscription/usage`

```json
{
  "translationsToday": 12,
  "wordsInDictionary": 84,
  "limits": {
    "translationsPerDay": 50,
    "wordsInDictionary": 500,
    "availableTexts": 20,
    "statisticsDays": -1,
    "maxFolders": 0,
    "readTexts": true,
    "wordTranslation": true,
    "tokenAnalysis": true,
    "personalDictionary": true,
    "dictionaryFolders": false,
    "hasComplexTexts": false,
    "textProgress": true,
    "spaceRepetition": false,
    "hasFlashcards": false,
    "wordContexts": false,
    "analytics": false,
    "hasAdvancedAnalytics": false,
    "hasPrioritySupport": false
  }
}
```

`translationsToday` считается по событиям `UserEvent` типа `CLICK_WORD` начиная с 00:00 по серверному времени. Если у пользователя нет активной подписки, возвращаются дефолтные FREE-лимиты `{ translationsPerDay: 50, wordsInDictionary: 500 }`.

### `POST /api/subscription/trial`

Тело запроса (`StartTrialDto`) — нужно передать ровно одно из:

```json
{ "planId": "uuid-of-plan" }
```

или

```json
{ "planCode": "PREMIUM_MONTHLY" }
```

Правила:
- План не должен быть `FREE`.
- У плана должно быть `trialDays > 0`.
- У пользователя не должно быть активной подписки.
- Триал даётся один раз — проверяется по событию `SubscriptionEventType.TRIAL_STARTED` для любого его прошлого `Subscription`.

Ответ — созданная `Subscription` (status `TRIALING`, `endDate = now + plan.trialDays`) с включённым `plan`.

Возможные ошибки: `404` (план не найден/неактивен), `400` (триал недоступен / план FREE), `409` (уже есть активная подписка / триал уже использовался).

### `POST /api/subscription/subscribe`

Тело — `SubscribePlanDto` (`planId` либо `planCode`).

Логика:
- Подписаться на `FREE` запрещено — для понижения используйте `DELETE /subscription`.
- Если уже подписан на тот же план — `409 Conflict`.
- Если новая цена ниже — это даунгрейд: текущая подписка отменяется (`status=CANCELED`), новая создаётся с `endDate` = `endDate` старой (оставшийся оплаченный период) и платёж не создаётся.
- Если выше — апгрейд, создаётся `Payment` со `status=SUCCEEDED`.
- При апгрейде/равноценной смене плана ищется неиспользованный `CouponRedemption` пользователя (`paymentId IS NULL`); если он применим к выбранному плану (`coupon.applicablePlans` пуст или содержит `plan.code`), скидка применяется к `amountCents` и `CouponRedemption.paymentId` привязывается к созданному платежу.
- Все события (`SUBSCRIBED` / `UPGRADED` / `DOWNGRADED` / `CANCELED`) логируются в `SubscriptionEvent`.

Ответ — новая `Subscription` с `plan` и дополнительным полем `couponApplied` (либо `null`):

```json
{
  "id": "...",
  "status": "ACTIVE",
  "startDate": "2026-04-29T...",
  "endDate":   "2026-05-29T...",
  "plan": { "code": "PREMIUM_MONTHLY", "...": "..." },
  "couponApplied": {
    "code": "LAUNCH20",
    "type": "PERCENT",
    "amount": 20,
    "discountCents": 13800
  }
}
```

### `DELETE /api/subscription`

Отменяет текущую `ACTIVE` или `TRIALING` подписку: ставит `status=CANCELED`, проставляет `canceledAt`, пишет `SubscriptionEvent` с `type=CANCELED` и `metadata.reason="user_cancel"`.

Ошибки: `404` если активной подписки нет.

### `POST /api/subscription/promo`

Тело (`RedeemPromoDto`):

```json
{ "code": "PROMO2024" }
```

Проверки:
- Купон существует и `isActive`.
- `validFrom <= now <= validUntil`.
- `redeemedCount < maxRedemptions` (если задан).
- Этот пользователь ещё не использовал этот купон (`@@unique([couponId, userId])`).

Важно: купон только сохраняется (`CouponRedemption` без `paymentId`). Никакого моментального списания, изменения текущей подписки или начисления средств нет — скидка применится при следующем `POST /subscription/subscribe`.

Ответ:

```json
{
  "code": "LAUNCH20",
  "name": "Запуск платформы",
  "type": "PERCENT",
  "amount": 20,
  "status": "saved_for_next_subscription",
  "appliesOn": "next_subscription_payment",
  "requiresSubscriptionAction": true
}
```

### Защита прод-окружения от ручного биллинга

Метод `assertBillingModeSafeForCurrentEnv()` вызывается перед `subscribe` и `trial`. Если `NODE_ENV === "production"`, `BILLING_PROVIDER === "MANUAL"` и `ALLOW_MANUAL_BILLING_IN_PROD !== "true"` — операция запрещается с `400 Bad Request`. Это страховка от случайного «бесплатного» оформления подписок в боевом окружении до подключения реального провайдера платежей.

---

## Провайдеры оплаты

Enum `PaymentProvider`:

| Провайдер | Описание |
|-----------|---------|
| `STRIPE` | Stripe |
| `PAYPAL` | PayPal |
| `PADDLE` | Paddle (налоговый агент / merchant-of-record) |
| `LEMONSQUEEZY` | Lemon Squeezy |
| `MANUAL` | Ручное добавление: используется по умолчанию (`Subscription.provider`, `Payment.provider`) до подключения реального шлюза |

Статусы платежа — enum `PaymentStatus`: `PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED`. Поле `Payment.refundedCents` отражает частичный/полный возврат.

---

## События подписки

Enum `SubscriptionEventType` (хранится в `SubscriptionEvent.metadata` JSON):

| Событие | Когда генерируется |
|---------|--------------------|
| `SUBSCRIBED` | Новая подписка без предыдущей активной |
| `RENEWED` | Продление |
| `UPGRADED` | Смена плана на более дорогой |
| `DOWNGRADED` | Смена плана на более дешёвый |
| `CANCELED` | Пользователь отменил или произошла смена плана |
| `REFUNDED` | Возврат |
| `TRIAL_STARTED` | `POST /subscription/trial` |
| `TRIAL_ENDED` | Завершение пробного периода |
| `EXTENDED` | Продление администратором |
| `PLAN_CHANGED` | Универсальная смена плана |

---

## Промокоды (Coupons)

Модель `Coupon`:

| Поле | Тип | Назначение |
|------|-----|-----------|
| `code` | `string @unique` | Код, вводимый пользователем |
| `name` | `string?` | Подпись для UI (например, «Запуск платформы») |
| `type` | `CouponType` | `PERCENT` (процент) или `FIXED` (центы) |
| `amount` | `int` | Размер скидки: процент 0..100 или сумма в центах |
| `maxRedemptions` | `int?` | Глобальный лимит активаций |
| `redeemedCount` | `int` | Атомарно инкрементируется через `updateMany` |
| `validFrom`, `validUntil` | `DateTime?` | Окно действия |
| `applicablePlans` | `string[]` | Коды планов, к которым применим (пустой массив = все планы) |
| `maxPerUser` | `int?` | Лимит активаций на пользователя |
| `newUsersOnly` | `bool` | Только для пользователей без оплаченной подписки в прошлом |
| `isStackable` | `bool` | Можно ли комбинировать с другими купонами |
| `isActive` | `bool` | Включён ли купон |

Использование фиксируется в `CouponRedemption` (уникальность `(couponId, userId)`). Поле `paymentId` заполняется только когда скидка реально применилась к платежу при `POST /subscription/subscribe`.

---

## Проверка доступа к Premium функциям

Guard [src/auth/guards/premium.guard.ts](../src/auth/guards/premium.guard.ts) разрешает запрос, если выполняется любое из условий:

1. У пользователя есть роль `ADMIN` или `SUPERADMIN`.
2. Последняя по `startDate` подписка с `plan.type === PlanType.PREMIUM` имеет статус `ACTIVE` или `TRIALING`.

Иначе бросается `403 Forbidden` с одним из кодов:

| Код ошибки | Когда |
|------------|-------|
| `SUBSCRIPTION_REQUIRED` | Premium-подписки никогда не было |
| `SUBSCRIPTION_EXPIRED` | Последняя Premium-подписка `CANCELED` или `EXPIRED` |

Результат проверки кешируется в Redis с TTL 300 секунд (`premium:<userId>` → `active` / `expired` / `none`). Любые ошибки Redis молча игнорируются — guard продолжает работать через прямой запрос в БД.

Применение в контроллерах (см. `@Premium()` декоратор):

```typescript
@Premium()
@Get("analytics")
getAnalytics() { ... }
```

> Важно: guard смотрит исключительно на планы `PlanType.PREMIUM`. Подписка на `PlanType.PRO` не активирует кэш `active` в этом guard'е — для PRO-only функций нужен отдельный guard или изменение логики `PremiumGuard`.

---

## Файлы модуля

| Файл | Описание |
|------|---------|
| [src/subscription/subscription.module.ts](../src/subscription/subscription.module.ts) | `@Global()` модуль, экспортирует `SubscriptionService`, `PremiumGuard`, `PrismaService` |
| [src/subscription/subscription.controller.ts](../src/subscription/subscription.controller.ts) | HTTP эндпоинты `/plans`, `/subscription/...` |
| [src/subscription/subscription.service.ts](../src/subscription/subscription.service.ts) | Логика планов, подписок, триала, отмены, купонов, usage |
| [src/subscription/subscription.service.spec.ts](../src/subscription/subscription.service.spec.ts) | Юнит-тесты сервиса |
| [src/subscription/dto/subscribe-plan.dto.ts](../src/subscription/dto/subscribe-plan.dto.ts) | DTO `POST /subscription/subscribe` (`planId` \| `planCode`) |
| [src/subscription/dto/start-trial.dto.ts](../src/subscription/dto/start-trial.dto.ts) | DTO `POST /subscription/trial` (`planId` \| `planCode`) |
| [src/subscription/dto/redeem-promo.dto.ts](../src/subscription/dto/redeem-promo.dto.ts) | DTO `POST /subscription/promo` (`code`) |
| [src/subscription/dto/fetch-my-payments.dto.ts](../src/subscription/dto/fetch-my-payments.dto.ts) | DTO `GET /subscription/payments` (`limit`, `cursor`) |
| [src/billing/plan-limits.ts](../src/billing/plan-limits.ts) | Класс `PlanLimits` — структура поля `Plan.limits` (Json) |
| [src/auth/guards/premium.guard.ts](../src/auth/guards/premium.guard.ts) | Guard проверки Premium-подписки с Redis-кешем |
| [prisma/helpers/billingHelper.ts](../prisma/helpers/billingHelper.ts) | Seed планов FREE / PREMIUM_(MONTHLY\|YEARLY) / PRO_(MONTHLY\|YEARLY) и наборов лимитов |
| [src/admin/billing/](../src/admin/billing/) | Административное управление планами, подписками, платежами и купонами |
