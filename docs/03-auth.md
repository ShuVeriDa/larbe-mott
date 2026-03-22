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
   - Access Token  (живёт 1 час)     → отправляется в теле ответа
   - Refresh Token (живёт 7 дней)    → сохраняется в httpOnly cookie

2. Обычные запросы
   Клиент → Authorization: Bearer <access_token>

3. Обновление токенов
   Клиент → POST /api/auth/login/access-token (cookie с refresh_token)
   Сервер → новый access + новый refresh токен

4. Выход
   Клиент → POST /api/auth/logout
   Сервер → удаляет сессию, очищает cookie
```

**Refresh токен хранится в httpOnly cookie** — JS на фронтенде не может его прочитать, что защищает от XSS атак.

---

## API Endpoints

| Метод | URL | Описание |
|-------|-----|---------|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/login/access-token` | Обновить access токен по refresh |
| POST | `/api/auth/logout` | Выход |

### Ограничения (Rate Limiting)
- Вход и регистрация: **5 запросов в минуту** (защита от брутфорса)

---

## Пароли

Хранятся в виде хешей **Argon2** — один из самых безопасных алгоритмов хеширования. Исходный пароль никогда не сохраняется.

---

## Сессии

Каждый вход создаёт запись `UserSession` в БД:
- IP адрес
- User-Agent браузера
- Привязанный refresh токен

Это позволяет видеть активные сессии и управлять ими.

---

## Роли пользователей

Система ролей (RBAC — Role-Based Access Control).

| Роль | Назначение |
|------|-----------|
| `LEARNER` | Обычный учащийся (по умолчанию) |
| `SUPPORT` | Поддержка — отвечает на обращения пользователей |
| `CONTENT` | Контент-менеджер — управляет текстами |
| `LINGUIST` | Лингвист — управляет словарём и морфологией |
| `ADMIN` | Администратор — полный доступ к управлению |
| `SUPERADMIN` | Суперадмин — все права включая управление другими админами |

Одному пользователю можно назначить несколько ролей.

---

## Разрешения (Permissions)

Роли состоят из конкретных разрешений:

| Код разрешения | Описание |
|---------------|---------|
| `CAN_EDIT_TEXTS` | Создавать и редактировать учебные тексты |
| `CAN_EDIT_DICTIONARY` | Редактировать словарные статьи |
| `CAN_MANAGE_USERS` | Управлять аккаунтами пользователей |
| `CAN_MANAGE_ROLES` | Назначать роли пользователям |
| `CAN_MANAGE_BILLING` | Управлять подписками и платежами |
| `CAN_VIEW_ANALYTICS` | Просматривать аналитику |
| `CAN_MANAGE_FEEDBACK` | Отвечать на обращения |
| `CAN_MANAGE_FLAGS` | Управлять feature flags |
| `CAN_MANAGE_MORPHOLOGY` | Управлять морфологическими правилами |

---

## Декораторы для защиты маршрутов

Используются прямо в контроллерах:

```typescript
// Только авторизованные пользователи
@Auth()
@Get('profile')
getProfile() {}

// Только администраторы (ADMIN или SUPERADMIN)
@Admin()
@Get('admin/users')
getUsers() {}

// Только пользователи с активной подпиской
@Premium()
@Get('analytics')
getAnalytics() {}

// Только пользователи с конкретным разрешением
@Permission('CAN_EDIT_TEXTS')
@Post('texts')
createText() {}

// Получить текущего пользователя из запроса
@Get('me')
getMe(@User() user: UserModel) {}
```

---

## Как добавить нового пользователя с ролью

1. Пользователь регистрируется — получает роль `LEARNER`
2. Администратор через `POST /api/admin/users/:id/roles` назначает другую роль
3. Роль применяется при следующем запросе

---

## Файлы модуля

| Файл | Описание |
|------|---------|
| [auth.service.ts](../src/auth/auth.service.ts) | Логика входа, регистрации, токенов |
| [auth.controller.ts](../src/auth/auth.controller.ts) | HTTP эндпоинты |
| [guards/jwt-auth.guard.ts](../src/auth/guards/) | Проверка access токена |
| [guards/premium.guard.ts](../src/auth/guards/) | Проверка подписки |
| [jwt/jwt.strategy.ts](../src/auth/jwt/) | Passport JWT стратегия |
| [decorators/](../src/auth/decorators/) | @Auth(), @Admin(), @Premium(), @Permission() |
| [permissions/](../src/auth/permissions/) | RBAC логика проверки разрешений |
