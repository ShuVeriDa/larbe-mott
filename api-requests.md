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

| Метод  | Путь                               | Описание                                | Авторизация    |
| ------ | ---------------------------------- | --------------------------------------- | -------------- |
| GET    | `/api/texts`                       | Список всех текстов                     | Bearer         |
| GET    | `/api/texts/:id`                   | Текст по ID (все страницы)              | Bearer         |
| GET    | `/api/texts/:id/pages/:pageNumber` | Одна страница текста (контент + токены) | Bearer         |
| POST   | `/api/texts`                       | Создать текст                           | Bearer + Admin |
| PATCH  | `/api/texts/:id`                   | Частично обновить текст                 | Bearer + Admin |
| DELETE | `/api/texts/:id`                   | Удалить текст                           | Bearer + Admin |

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

### 3.4 POST `/api/texts` (только админ)

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

### 3.5 PATCH `/api/texts/:id` (только админ)

**Параметры пути:** `id` — UUID текста.

**Тело (JSON), все поля необязательны:** те же поля, что и при создании. Передача `pages` заменяет все страницы.

**Ответ:** обновлённый текст.

---

### 3.6 DELETE `/api/texts/:id` (только админ)

**Параметры пути:** `id` — UUID текста.

**Ответ:** 204 No Content.

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

| Метод | Путь                    | Описание                                        | Авторизация    |
| ----- | ----------------------- | ----------------------------------------------- | -------------- |
| GET   | `/api/tokens/:id`       | Информация о токене по ID (перевод, грамматика) | Bearer         |
| GET   | `/api/tokens/:id/admin` | Данные токена для редактирования в админке      | Bearer + Admin |
| PATCH | `/api/tokens/bulk`      | Массовое обновление токенов (до 100 за запрос) | Bearer + Admin |
| PATCH | `/api/tokens/:id`       | Обновить отдельный токен (слово в тексте)       | Bearer + Admin |

### 5.1 GET `/api/tokens/:id`

**Параметры пути:** `id` — ID токена (cuid).

**Ответ:** `tokenId`, `word`, `translation`, `grammar`, `baseForm`, `lemma`, `forms`, `source` и др.

---

### 5.2 GET `/api/tokens/:id/admin` (только админ)

**Параметры пути:** `id` — ID токена (cuid).

**Ответ:** полные данные для формы редактирования:

- `id`, `versionId`, `pageId`, `pageNumber`, `position`
- `original`, `normalized`, `startOffset`, `endOffset`, `status`
- `vocabId`, `vocabulary` (если привязан: id, normalized, translation, baseForm, partOfSpeech)

---

### 5.3 PATCH `/api/tokens/:id` (только админ)

Редактирование отдельного слова в тексте без переразметки всего текста.

**Параметры пути:** `id` — ID токена (cuid).

**Тело запроса (JSON), все поля необязательны:**

```json
{
  "original": "string",     // исправленное слово в тексте (например, опечатка)
  "normalized": "string",   // нормализованная форма для поиска в словаре
  "vocabId": "string" | null   // id записи TextVocabulary для привязки к словарю или null для отвязки
}
```

**Ответ:** обновлённый объект токена в формате ответа GET `/api/tokens/:id/admin`.

**Важно:**
- При изменении `original` обновляется и сам текст на странице: правка вносится в `contentRaw` и `contentRich` (TipTap), затем пересчитываются токены этой страницы (original, normalized, смещения). Остальные страницы и полная переразметка текста не затрагиваются.
- При изменении только `normalized` или `vocabId` обновляется только запись токена и кэш перевода.

---

### 5.4 PATCH `/api/tokens/bulk` (только админ)

Массовое редактирование токенов: применить несколько правок за один запрос (одна и та же опечатка в нескольких местах, нормализация или привязка к словарю для выбранных слов).

**Тело запроса (JSON):**

```json
{
  "updates": [
    { "tokenId": "cuid1", "original": "исправлено" },
    { "tokenId": "cuid2", "normalized": "форма", "vocabId": null }
  ]
}
```

- `updates` — массив от 1 до 100 элементов.
- В каждом элементе обязателен `tokenId`; хотя бы одно из полей: `original`, `normalized`, `vocabId` (иначе элемент попадает в `errors`).

**Ответ:**

```json
{
  "updated": [ /* массив объектов токенов в формате GET .../admin */ ],
  "errors": [ { "tokenId": "cuid", "message": "Token not found" } ]
}
```

Успешные обновления возвращаются в `updated`; для каждого неудачного элемента в `errors` добавляется запись с `tokenId` и `message`.

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

## 7. Админ: словарь (`/api/admin/dictionary`)

| Метод | Путь                    | Описание                 | Авторизация    |
| ----- | ----------------------- | ------------------------ | -------------- |
| POST  | `/api/admin/dictionary` | Создать запись в словаре | Bearer + Admin |

### 7.1 POST `/api/admin/dictionary` (только админ)

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
| Texts    | POST   | `/api/texts`                       |
| Texts    | PATCH  | `/api/texts/:id`                   |
| Texts    | DELETE | `/api/texts/:id`                   |
| Words    | POST   | `/api/words/lookup`                |
| Words    | POST   | `/api/words/lookup-by-word`        |
| Tokens   | GET    | `/api/tokens/:id`                  |
| Tokens   | GET    | `/api/tokens/:id/admin`            |
| Tokens   | PATCH  | `/api/tokens/bulk`                 |
| Tokens   | PATCH  | `/api/tokens/:id`                  |
| Progress | GET    | `/api/progress/text/:id`           |
| Admin    | POST   | `/api/admin/dictionary`            |

Интерактивная документация Swagger доступна по адресу **`/api/docs`** (если включена в приложении).
