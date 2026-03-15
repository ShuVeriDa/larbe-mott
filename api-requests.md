# Возможные запросы к серверу (API)

Базовый префикс всех маршрутов: **`/api`**

Авторизация: для защищённых эндпоинтов передавать заголовок **`Authorization: Bearer <access_token>`**. Refresh token передаётся в cookie (имя задаётся в `REFRESH_TOKEN_NAME`).

---

## 1. Аутентификация (`/api/auth`)

| Метод | Путь                           | Описание                                               | Авторизация                  |
| ----- | ------------------------------ | ------------------------------------------------------ | ---------------------------- |
| POST  | `/api/auth/login`              | Вход по логину и паролю                                | Нет                          |
| POST  | `/api/auth/register`           | Регистрация нового пользователя                        | Нет                          |
| POST  | `/api/auth/login/access-token` | Обновление access-токена по refresh-токену (из cookie) | Нет (нужен refresh в cookie) |
| POST  | `/api/auth/logout`             | Выход, инвалидация refresh-токена                      | Bearer                       |

### 1.1 POST `/api/auth/login`

**Тело запроса (JSON):**

```json
{
  "username": "string",
  "password": "string" // минимум 6 символов
}
```

**Ответ:** `accessToken`, данные пользователя. В cookie устанавливается refresh-токен.

---

### 1.2 POST `/api/auth/register`

**Тело запроса (JSON):**

```json
{
  "email": "string", // валидный email
  "password": "string", // минимум 6 символов, 1 заглавная, 1 спецсимвол
  "username": "string", // 2–16 символов
  "name": "string", // 2–32 символа
  "surname": "string", // 2–32 символа
  "phone": "string" // необязательно, валидный номер
}
```

**Ответ:** `accessToken`, данные пользователя. В cookie — refresh-токен.

---

### 1.3 POST `/api/auth/login/access-token`

**Тело:** не требуется. Refresh-токен берётся из cookie.

**Ответ:** новый `accessToken` (и refresh в cookie).

---

### 1.4 POST `/api/auth/logout`

**Тело:** не требуется.  
**Ответ:** `true`. Cookie с refresh-токеном удаляется.

---

## 2. Пользователи (`/api/users`)

| Метод  | Путь             | Описание                               | Авторизация |
| ------ | ---------------- | -------------------------------------- | ----------- |
| GET    | `/api/users/:id` | Получить профиль пользователя по ID    | Bearer      |
| PATCH  | `/api/users`     | Обновить профиль текущего пользователя | Bearer      |
| DELETE | `/api/users`     | Удалить текущего пользователя          | Bearer      |

### 2.1 GET `/api/users/:id`

**Параметры пути:** `id` — UUID пользователя.

**Ответ:** объект профиля пользователя.

---

### 2.2 PATCH `/api/users`

**Тело запроса (JSON), все поля необязательны:**

```json
{
  "email": "string",
  "password": "string", // минимум 6 символов, 1 заглавная, 1 спецсимвол
  "username": "string", // 2–16 символов
  "name": "string", // 2–32 символа
  "surname": "string", // 2–32 символа
  "phone": "string"
}
```

**Ответ:** обновлённый профиль пользователя.

---

### 2.3 DELETE `/api/users`

**Тело:** не требуется.  
**Ответ:** успешное удаление аккаунта.

---

## 3. Тексты (`/api/texts`)

| Метод | Путь                               | Описание                                | Авторизация |
| ----- | ---------------------------------- | --------------------------------------- | ----------- |
| GET   | `/api/texts`                       | Список всех текстов                     | Bearer      |
| GET   | `/api/texts/:id`                   | Текст по ID (все страницы)              | Bearer      |
| GET   | `/api/texts/:id/pages/:pageNumber` | Одна страница текста (контент + токены) | Bearer      |

### 3.1 GET `/api/texts`

**Ответ:** массив текстов (id, title, language, level, author и т.д.).

---

### 3.2 GET `/api/texts/:id`

**Параметры пути:** `id` — UUID текста.

**Ответ:** текст с метаданными и всеми страницами (TipTap-контент).

---

### 3.3 GET `/api/texts/:id/pages/:pageNumber`

**Параметры пути:** `id` — UUID текста, `pageNumber` — номер страницы (с 1).

**Ответ:** метаданные текста, страница (contentRich, contentRaw), токены страницы, прогресс.

---

## 4. Слова / перевод (`/api/words`)

| Метод | Путь                        | Описание                                    | Авторизация |
| ----- | --------------------------- | ------------------------------------------- | ----------- |
| POST  | `/api/words/lookup`         | Перевод по tokenId (клик по слову в тексте) | Bearer      |
| POST  | `/api/words/lookup-by-word` | Перевод по строке слова (ввод пользователя) | Bearer      |

### 4.1 POST `/api/words/lookup`

**Тело запроса (JSON):**

```json
{
  "tokenId": "550e8400-e29b-41d4-a716-446655440000" // UUID токена
}
```

**Ответ:** `translation`, `grammar`, `baseForm`.

---

### 4.2 POST `/api/words/lookup-by-word`

**Тело запроса (JSON):**

```json
{
  "normalized": "string" // нормализованная форма или исходное слово
}
```

**Ответ:** `translation`, `grammar`, `baseForm`.

---

## 5. Токены (`/api/tokens`)

| Метод | Путь              | Описание                                        | Авторизация |
| ----- | ----------------- | ----------------------------------------------- | ----------- |
| GET   | `/api/tokens/:id` | Информация о токене по ID (перевод, грамматика) | Bearer      |

### 5.1 GET `/api/tokens/:id`

**Параметры пути:** `id` — ID токена (cuid).

**Ответ:** `tokenId`, `word`, `translation`, `grammar`, `baseForm`, `lemma`, `forms`, `source` и др.

---

## 6. Прогресс (`/api/progress`)

| Метод | Путь                     | Описание                                     | Авторизация |
| ----- | ------------------------ | -------------------------------------------- | ----------- |
| GET   | `/api/progress/text/:id` | Прогресс по тексту для текущего пользователя | Bearer      |

### 6.1 GET `/api/progress/text/:id`

**Параметры пути:** `id` — UUID текста.

**Ответ:**

```json
{
  "progress": 0 // число 0..100 (процент выученных слов)
}
```

---

## 7. Админ (`/api/admin/...`)

Все маршруты админки под префиксом `/api/admin`. Требуют роль Admin.

| Метод  | Путь                         | Описание                          |
| ------ | ---------------------------- | --------------------------------- |
| POST   | `/api/admin/texts`           | Создать текст                     |
| PATCH  | `/api/admin/texts/:id`      | Частично обновить текст           |
| DELETE | `/api/admin/texts/:id`      | Удалить текст                     |
| GET    | `/api/admin/tokens/:id`     | Данные токена для редактирования  |
| PATCH  | `/api/admin/tokens/bulk`    | Массовое обновление токенов       |
| PATCH  | `/api/admin/tokens/:id`     | Обновить отдельный токен          |
| POST   | `/api/admin/dictionary`     | Создать запись в словаре          |

### 7.1 POST `/api/admin/texts` (только админ)

**Тело запроса (JSON):**

```json
{
  "title": "string",        // 2–50 символов
  "language": "CHE" | "RU",
  "level": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",  // необязательно
  "author": "string",       // 2–50 символов
  "source": "string",       // необязательно
  "pages": [
    {
      "pageNumber": 1,
      "contentRich": {
        "type": "doc",
        "content": [ /* TipTap/ProseMirror узлы */ ]
      }
    }
  ]
}
```

**Ответ:** созданный текст.

---

### 7.2 PATCH `/api/admin/texts/:id` (только админ)

**Параметры пути:** `id` — UUID текста.

**Тело (JSON), все поля необязательны:** те же поля, что и при создании. Передача `pages` заменяет все страницы.

**Ответ:** обновлённый текст.

---

### 7.3 DELETE `/api/admin/texts/:id` (только админ)

**Параметры пути:** `id` — UUID текста.

**Ответ:** 204 No Content.

---

### 7.4 GET `/api/admin/tokens/:id` (только админ)

**Параметры пути:** `id` — ID токена (cuid).

**Ответ:** полные данные для формы редактирования: `id`, `versionId`, `pageId`, `pageNumber`, `position`, `original`, `normalized`, `startOffset`, `endOffset`, `status`, `vocabId`, `vocabulary`.

---

### 7.5 PATCH `/api/admin/tokens/:id` (только админ)

**Параметры пути:** `id` — ID токена (cuid).

**Тело (JSON), все поля необязательны:** `original`, `normalized`, `vocabId` (string | null).

**Ответ:** обновлённый объект токена (формат как в 7.4).

---

### 7.6 PATCH `/api/admin/tokens/bulk` (только админ)

**Тело (JSON):** `updates` — массив от 1 до 100 элементов, каждый: `tokenId` (обязательно), опционально `original`, `normalized`, `vocabId`.

**Ответ:** `{ "updated": [...], "errors": [{ "tokenId", "message" }] }`.

---

### 7.7 POST `/api/admin/dictionary` (только админ)

**Тело запроса (JSON):**

```json
{
  "word": "string",           // слово или фраза (лемма)
  "normalized": "string",     // нормализованная форма для поиска
  "language": "CHE" | "RU",
  "partOfSpeech": "string",   // необязательно, например "noun"
  "translation": "string",
  "notes": "string",          // необязательно
  "forms": ["string"]         // необязательно, массив словоформ
}
```

**Ответ:** созданная запись словаря.

---

## Сводная таблица

| Группа   | Метод  | Путь                               |
| -------- | ------ | ---------------------------------- |
| Auth     | POST   | `/api/auth/login`                  |
| Auth     | POST   | `/api/auth/register`               |
| Auth     | POST   | `/api/auth/login/access-token`     |
| Auth     | POST   | `/api/auth/logout`                 |
| Users    | GET    | `/api/users/:id`                   |
| Users    | PATCH  | `/api/users`                       |
| Users    | DELETE | `/api/users`                       |
| Texts    | GET    | `/api/texts`                       |
| Texts    | GET    | `/api/texts/:id`                   |
| Texts    | GET    | `/api/texts/:id/pages/:pageNumber` |
| Words    | POST   | `/api/words/lookup`                |
| Words    | POST   | `/api/words/lookup-by-word`        |
| Tokens   | GET    | `/api/tokens/:id`                  |
| Progress | GET    | `/api/progress/text/:id`           |
| Admin    | POST   | `/api/admin/texts`                 |
| Admin    | PATCH  | `/api/admin/texts/:id`             |
| Admin    | DELETE | `/api/admin/texts/:id`             |
| Admin    | GET    | `/api/admin/tokens/:id`             |
| Admin    | PATCH  | `/api/admin/tokens/bulk`           |
| Admin    | PATCH  | `/api/admin/tokens/:id`            |
| Admin    | POST   | `/api/admin/dictionary`            |

Интерактивная документация Swagger доступна по адресу **`/api/docs`** (если включена в приложении).
