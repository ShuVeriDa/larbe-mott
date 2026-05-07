# Аутентификация и авторизация

Модуль: [src/auth/](../src/auth/)

---

## Как работает аутентификация

Используется схема с двумя JWT токенами:

```
1. Регистрация / Вход
      │
      ▼
   Сервер генерирует:
   - Access Token  (живёт ACCESS_TOKEN_EXPIRES_IN, по умолчанию 1 час) → в теле ответа
   - Refresh Token (живёт REFRESH_TOKEN_EXPIRES_IN, по умолчанию 7 дней) → в httpOnly cookie

2. Обычные запросы
   Клиент → Authorization: Bearer <access_token>
   JwtStrategy проверяет:
     - подпись токена
     - срок действия (iat / exp)
     - Redis blacklist (`session:blacklist:<userId>`)
     - валидность UserSession.sid (для запросов /auth/sessions*)

3. Обновление токенов
   Клиент → POST /api/auth/login/access-token (cookie с refresh_token)
   Сервер:
     - проверяет refresh_token (подпись + argon2-хеш в БД)
     - проверяет, что привязанная UserSession не отозвана
     - выдаёт новые access + refresh
     - переиспользует sid сессии

4. Выход
   Клиент → POST /api/auth/logout
   Сервер → чистит User.hashedRefreshToken, ставит redis blacklist, очищает cookie
```

JWT-payload содержит:
- `sub`, `id` — userId
- `sid` — id текущей `UserSession` (используется для пометки текущей сессии и точечного отзыва)
- `type` — `access` | `refresh`

**Refresh-токен хранится в httpOnly cookie** — JS на фронтенде не может его прочитать (защита от XSS). Имя cookie берётся из `REFRESH_TOKEN_NAME`. Атрибуты `secure` и `sameSite` определяются автоматически по `NODE_ENV`, `DOMAIN` и `FRONTEND_URL`.

---

## API Endpoints

### Базовая аутентификация

| Метод  | URL                              | Описание                                     |
|--------|----------------------------------|----------------------------------------------|
| POST   | `/api/auth/register`             | Регистрация                                  |
| POST   | `/api/auth/login`                | Вход (по `username` или `email`)             |
| POST   | `/api/auth/login/access-token`   | Обновить access по refresh-cookie            |
| POST   | `/api/auth/logout`               | Выход (отзыв refresh + redis blacklist)      |

### Управление сессиями (Auth required)

| Метод  | URL                          | Описание                                                 |
|--------|------------------------------|----------------------------------------------------------|
| GET    | `/api/auth/sessions`         | Список активных сессий с `device`, `location`, `isCurrent` |
| DELETE | `/api/auth/sessions`         | «Завершить все» — отзывает все сессии кроме текущей      |
| DELETE | `/api/auth/sessions/:id`     | Отзыв конкретной сессии                                  |

### Сброс пароля (публичный flow по email)

| Метод | URL                                  | Описание                                                          |
|-------|--------------------------------------|-------------------------------------------------------------------|
| POST  | `/api/auth/password-reset/request`   | Запрос ссылки на email. Всегда `{ ok: true }`                     |
| GET   | `/api/auth/password-reset/validate`  | Проверка reset-токена (`?token=...`). Возвращает маскированный email |
| POST  | `/api/auth/password-reset/confirm`   | Установить новый пароль по токену. Отзывает все сессии            |

### Смена пароля (Auth required)

| Метод | URL                       | Описание                                                                 |
|-------|---------------------------|--------------------------------------------------------------------------|
| POST  | `/api/auth/password/change` | Сменить пароль (текущий → новый). Отзывает все сессии, шлёт уведомление |

### Смена email (Auth required, двухшаговый flow)

| Метод | URL                              | Описание                                                                 |
|-------|----------------------------------|--------------------------------------------------------------------------|
| POST  | `/api/auth/email-change/request` | Запросить смену email — письмо со ссылкой на НОВЫЙ адрес                |
| POST  | `/api/auth/email-change/confirm` | Подтвердить новый email по токену. Уведомление шлётся на СТАРЫЙ адрес    |

---

## Rate Limiting

Лимиты заданы через `@Throttle({ default: { limit, ttl } })` в `AuthController`.

| Endpoint                                | Лимит               |
|-----------------------------------------|---------------------|
| `POST /auth/login`                      | 5 / минуту          |
| `POST /auth/register`                   | 5 / минуту          |
| `POST /auth/login/access-token`         | 10 / минуту         |
| `POST /auth/password-reset/request`     | 3 / минуту          |
| `GET  /auth/password-reset/validate`    | 30 / минуту         |
| `POST /auth/password-reset/confirm`     | 5 / минуту          |
| `POST /auth/password/change`            | 5 / минуту          |
| `POST /auth/email-change/request`       | 3 / минуту          |
| `POST /auth/email-change/confirm`       | 5 / минуту          |

`/auth/logout` и `/auth/sessions*` отдельных лимитов не имеют — используется глобальный throttler.

---

## Пароли

Хранятся в виде хешей **Argon2** (`hash`/`verify` из пакета `argon2`). Исходный пароль никогда не сохраняется.

При смене пароля (`reset` или `change`) одновременно:
- ставится новый argon2-хеш в `User.password`
- обнуляется `User.hashedRefreshToken`
- все активные `UserSession` помечаются `revokedAt = now`
- в Redis записывается `session:blacklist:<userId>` (TTL = `ACCESS_TOKEN_EXPIRES_IN`)
- best-effort отправляется уведомительное письмо

---

## Сессии

Каждый вход создаёт запись `UserSession` в БД ДО выпуска токенов — её id вшивается в JWT-пейлоад как `sid`. Это позволяет:

- помечать «текущую» сессию в `GET /auth/sessions`
- исключать текущую сессию при `DELETE /auth/sessions` («Завершить все»)
- при refresh — переиспользовать тот же `sid` и обновлять `lastActiveAt`

Поля сессии: `ipAddress`, `userAgent`, `createdAt`, `lastActiveAt`, `revokedAt`.

Утилита `parseDeviceLabel` строит человекочитаемую метку устройства из `userAgent`, `lookupSessionLocation` — приблизительную локацию по IP.

---

## Восстановление и смена email

Реализовано через одноразовые токены в БД:

| Модель Prisma         | Назначение                                |
|-----------------------|-------------------------------------------|
| `PasswordResetToken`  | argon2-хеш токена + `expiresAt`/`usedAt` |
| `EmailChangeToken`    | argon2-хеш + `newEmail` + `expiresAt`/`usedAt` |

Сырой токен — 32 байта `base64url`, передаётся ТОЛЬКО в письме. В БД лежит только хеш. TTL настраивается через `PASSWORD_RESET_TOKEN_TTL_HOURS` и `EMAIL_CHANGE_TOKEN_TTL_HOURS` (по умолчанию 24 часа).

Cron-таск [`PasswordResetCleanupTask`](../src/auth/password-reset-cleanup.task.ts) ежедневно в 03:00 удаляет истёкшие/использованные токены старше 7 дней (метод `cleanupExpiredPasswordResetTokens`). Аналогичный метод `cleanupExpiredEmailChangeTokens` доступен в `AuthService`.

Reset-flow при `confirm`:

```
найти токен по argon2-verify (линейный скан до 50 свежих кандидатов)
  ↓
проверить usedAt / expiresAt / status пользователя
  ↓
TRANSACTION:
  - пометить токен usedAt
  - инвалидировать все остальные неиспользованные токены того же юзера
  - обновить User.password, обнулить User.hashedRefreshToken
  - revokeAt всем UserSession
  - UserEvent.PASSWORD_RESET_COMPLETED
  ↓
Redis: session:blacklist:<userId>
  ↓
mail.sendPasswordChangedEmail (best effort)
```

---

## Роли пользователей (RoleName)

Определены в [prisma/schema.prisma](../prisma/schema.prisma) `enum RoleName`.

| Роль          | Назначение                                                         |
|---------------|--------------------------------------------------------------------|
| `LEARNER`     | Обычный учащийся (по умолчанию)                                    |
| `SUPPORT`     | Поддержка — отвечает на обращения, видит логи и аналитику          |
| `CONTENT`     | Контент-менеджер — управляет учебными текстами                     |
| `LINGUIST`    | Лингвист — управляет словарём и морфологией                        |
| `ADMIN`       | Администратор — управление пользователями, текстами, словарём, юр. документами |
| `SUPERADMIN`  | Суперадмин — полный доступ, включая биллинг и feature flags        |

Одному пользователю можно назначить несколько ролей через `UserRoleAssignment`.

---

## Разрешения (PermissionCode)

Определены в [prisma/schema.prisma](../prisma/schema.prisma) `enum PermissionCode`.

| Код разрешения             | Описание                                                |
|----------------------------|---------------------------------------------------------|
| `CAN_EDIT_TEXTS`           | Создавать и редактировать учебные тексты                |
| `CAN_EDIT_DICTIONARY`      | Редактировать словарные статьи                          |
| `CAN_EDIT_MORPHOLOGY`      | Редактировать морфологические правила                   |
| `CAN_MANAGE_USERS`         | Управлять аккаунтами и ролями пользователей             |
| `CAN_MANAGE_BILLING`       | Управлять подписками, планами, платежами                |
| `CAN_VIEW_ANALYTICS`       | Просматривать аналитику                                 |
| `CAN_VIEW_LOGS`            | Просматривать системные логи и админ-аудит              |
| `CAN_MANAGE_FEATURE_FLAGS` | Управлять feature flags                                 |
| `CAN_MANAGE_FEEDBACK`      | Отвечать на обращения пользователей                     |
| `CAN_MANAGE_LEGAL`         | Управлять юридическими документами                      |

### Матрица «роль → разрешения»

Источник: [prisma/helpers/rbacHelper.ts](../prisma/helpers/rbacHelper.ts), функция `seedRolesAndPermissions`.

| Permission \ Role          | LEARNER | SUPPORT | CONTENT | LINGUIST | ADMIN | SUPERADMIN |
|----------------------------|:-------:|:-------:|:-------:|:--------:|:-----:|:----------:|
| `CAN_EDIT_TEXTS`           |         |         |    +    |          |   +   |     +      |
| `CAN_EDIT_DICTIONARY`      |         |         |         |    +     |   +   |     +      |
| `CAN_EDIT_MORPHOLOGY`      |         |         |         |    +     |       |     +      |
| `CAN_MANAGE_USERS`         |         |         |         |          |   +   |     +      |
| `CAN_MANAGE_BILLING`       |         |         |         |          |       |     +      |
| `CAN_VIEW_ANALYTICS`       |         |    +    |         |          |   +   |     +      |
| `CAN_VIEW_LOGS`            |         |    +    |         |          |   +   |     +      |
| `CAN_MANAGE_FEATURE_FLAGS` |         |         |         |          |       |     +      |
| `CAN_MANAGE_FEEDBACK`      |         |    +    |         |          |   +   |     +      |
| `CAN_MANAGE_LEGAL`         |         |         |         |          |   +   |     +      |

---

## Декораторы для защиты маршрутов

Все декораторы лежат в [src/auth/decorators/](../src/auth/decorators/) и [src/auth/permissions/](../src/auth/permissions/).

```typescript
// Только авторизованные пользователи (JwtAuthGuard)
@Auth()
@Get('profile')
getProfile() {}

// Опциональная авторизация: req.user может быть null,
// но если токен валиден — он будет распарсен
@OptionalAuth()
@Get('public-with-extras')
getPublic() {}

// Только админ-уровень — Auth + проверка CAN_MANAGE_USERS
@Admin()
@Get('admin/users')
getUsers() {}

// Auth + проверка конкретного PermissionCode (для админ-эндпоинтов)
@AdminPermission(PermissionCode.CAN_EDIT_TEXTS)
@Post('admin/texts')
createText() {}

// Auth + PermissionGuard по любому permission (низкоуровневый аналог @AdminPermission)
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(PermissionCode.CAN_VIEW_ANALYTICS)
@Get('analytics')
viewAnalytics() {}

// Только пользователи с активной подпиской (Auth + PremiumGuard)
@RequiresPremium()
@Get('premium-feature')
getPremium() {}

// Получить текущего пользователя из запроса
@Get('me')
getMe(@User() user: UserModel) {}

// Получить sessionId текущего токена (sid из JWT-payload)
@Auth()
@Get('current-session')
getCurrentSession(@SessionId() sid?: string) {}
```

| Декоратор                  | Назначение                                                          |
|----------------------------|---------------------------------------------------------------------|
| `@Auth()`                  | `UseGuards(JwtAuthGuard)`                                           |
| `@OptionalAuth()`          | `UseGuards(OptionalJwtAuthGuard)` — не падает без токена            |
| `@Admin()`                 | `JwtAuthGuard` + `PermissionGuard` + `CAN_MANAGE_USERS`             |
| `@AdminPermission(code)`   | `JwtAuthGuard` + `PermissionGuard` + указанный `PermissionCode`     |
| `@RequirePermission(code)` | Ставит метаданные для `PermissionGuard` (без UseGuards)             |
| `@RequiresPremium()`       | `JwtAuthGuard` + `PremiumGuard` + Swagger-аннотации                 |
| `@SessionId()`             | Достаёт `sid` из `req.user.sessionId`                               |
| `@User()` / `@User('id')`  | Достаёт текущего пользователя или его поле (из `src/user/decorators`) |

---

## Как добавить нового пользователя с ролью

1. Пользователь регистрируется — попадает в БД с ролью `LEARNER` (назначается через сидер/UserService).
2. Администратор через `POST /api/admin/users/:id/roles` назначает другую роль (требует `CAN_MANAGE_USERS`).
3. Роль и связанные разрешения применяются при следующем запросе — `PermissionsService.getUserPermissions` считает их каждый раз через JOIN `UserRoleAssignment → Role → RolePermission → Permission`.

---

## Файлы модуля

| Файл                                                                            | Описание                                                              |
|---------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| [auth.module.ts](../src/auth/auth.module.ts)                                    | Регистрация провайдеров и JwtModule                                   |
| [auth.controller.ts](../src/auth/auth.controller.ts)                            | HTTP эндпоинты (login/register/refresh/logout/sessions/password/email) |
| [auth.service.ts](../src/auth/auth.service.ts)                                  | Логика входа, токенов, сессий, password reset, password/email change  |
| [password-reset-cleanup.task.ts](../src/auth/password-reset-cleanup.task.ts)    | Cron-задача очистки протухших reset-токенов                           |
| [strategies/jwt.strategy.ts](../src/auth/strategies/jwt.strategy.ts)            | Passport JWT стратегия + проверка redis blacklist                     |
| [jwt/jwt.guard.ts](../src/auth/jwt/jwt.guard.ts)                                | Стандартный `JwtAuthGuard`                                            |
| [jwt/optional-jwt.guard.ts](../src/auth/jwt/optional-jwt.guard.ts)              | `OptionalJwtAuthGuard` — пропускает запрос без токена                 |
| [guards/premium.guard.ts](../src/auth/guards/premium.guard.ts)                  | Проверка активной премиум-подписки                                    |
| [permissions/permissions.service.ts](../src/auth/permissions/permissions.service.ts) | Резолв разрешений пользователя через RBAC                          |
| [permissions/permission.guard.ts](../src/auth/permissions/permission.guard.ts)  | Гвард проверки `PermissionCode`                                       |
| [permissions/permission.decorator.ts](../src/auth/permissions/permission.decorator.ts) | `@RequirePermission(code)`                                      |
| [decorators/auth.decorator.ts](../src/auth/decorators/auth.decorator.ts)        | `@Auth()`                                                             |
| [decorators/optional-auth.decorator.ts](../src/auth/decorators/optional-auth.decorator.ts) | `@OptionalAuth()`                                          |
| [decorators/admin.decorator.ts](../src/auth/decorators/admin.decorator.ts)      | `@Admin()`                                                            |
| [decorators/admin-permission.decorator.ts](../src/auth/decorators/admin-permission.decorator.ts) | `@AdminPermission(code)`                              |
| [decorators/premium.decorator.ts](../src/auth/decorators/premium.decorator.ts)  | `@RequiresPremium()`                                                  |
| [decorators/session-id.decorator.ts](../src/auth/decorators/session-id.decorator.ts) | `@SessionId()`                                                   |
| [utils/session-meta.util.ts](../src/auth/utils/session-meta.util.ts)            | `parseDeviceLabel`, `lookupSessionLocation`                           |
| [dto/forgot-password.dto.ts](../src/auth/dto/forgot-password.dto.ts)            | DTO запроса сброса пароля                                             |
| [dto/confirm-password-reset.dto.ts](../src/auth/dto/confirm-password-reset.dto.ts) | DTO подтверждения сброса                                          |
| [dto/change-password.dto.ts](../src/auth/dto/change-password.dto.ts)            | DTO смены пароля авторизованным юзером                                |
| [dto/request-email-change.dto.ts](../src/auth/dto/request-email-change.dto.ts)  | DTO запроса смены email                                               |
| [dto/confirm-email-change.dto.ts](../src/auth/dto/confirm-email-change.dto.ts)  | DTO подтверждения смены email                                         |
