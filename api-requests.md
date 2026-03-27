# Возможные запросы к серверу (API)

Базовый префикс всех маршрутов: `**/api**`

Авторизация: для защищённых эндпоинтов передавать заголовок `**Authorization: Bearer <access_token>**`. Refresh token передаётся в cookie (имя задаётся в `REFRESH_TOKEN_NAME`).

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


| Метод | Путь                                    | Описание                                     | Авторизация    |
| ----- | --------------------------------------- | -------------------------------------------- | -------------- |
| GET   | `/api/progress/text/:id`                | Прогресс по тексту для текущего пользователя | Bearer         |
| GET   | `/api/progress/review/stats`            | Статистика SM-2 для intro-экрана             | Bearer+Premium |
| GET   | `/api/progress/review/due`              | Слова к повторению сегодня                   | Bearer+Premium |
| POST  | `/api/progress/review/:lemmaId`         | Отправить оценку повторения (SM-2)           | Bearer+Premium |
| GET   | `/api/progress/words/:lemmaId/contexts` | Контексты встреч слова из текстов            | Bearer+Premium |


### 6.1 GET `/api/progress/text/:id`

**Параметры пути:** `id` — UUID текста.

**Ответ:**

```json
{
  "progress": 0 // число 0..100 (процент выученных слов)
}
```

---

### 6.2 GET `/api/progress/review/stats`

Статистика для intro-экрана страницы `/review` (SM-2). Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ:**

```json
{
  "dueCount": 12,
  "learningCount": 48,
  "streak": 7
}
```


| Поле            | Описание                                                     |
| --------------- | ------------------------------------------------------------ |
| `dueCount`      | Слов к повторению сегодня (nextReview ≤ now, статус ≠ KNOWN) |
| `learningCount` | Всего слов в статусе LEARNING                                |
| `streak`        | Серия дней подряд (по событиям UserEvent)                    |


---

### 6.3 GET `/api/progress/review/due`

Список слов, запланированных к повторению сегодня по алгоритму SM-2. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Query-параметры:**


| Параметр | Тип    | По умолчанию | Описание                     |
| -------- | ------ | ------------ | ---------------------------- |
| `limit`  | number | 20           | Максимальное количество слов |


**Пример запроса:**

```
GET /api/progress/review/due?limit=12
```

**Ответ:** массив объектов `UserWordProgress` с вложенным `lemma`:

```json
[
  {
    "id": "cuid",
    "userId": "uuid",
    "lemmaId": "uuid",
    "status": "LEARNING",
    "repetitions": 2,
    "easeFactor": 2.5,
    "interval": 6,
    "nextReview": "2026-03-28T00:00:00.000Z",
    "lemma": {
      "id": "uuid",
      "baseForm": "мотт",
      "partOfSpeech": "noun",
      "headwords": [
        {
          "id": "uuid",
          "text": "мотт",
          "normalized": "мотт",
          "entry": { "rawTranslate": "язык, речь" }
        }
      ]
    }
  }
]
```

---

### 6.4 POST `/api/progress/review/:lemmaId`

Отправить результат повторения слова по SM-2. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Параметры пути:** `lemmaId` — UUID леммы.

**Тело запроса (JSON):**

```json
{
  "quality": 4
}
```


| Значение | Описание                           |
| -------- | ---------------------------------- |
| `0`      | Полный провал, не вспомнил         |
| `1`      | Неправильно, но вспомнил подсказку |
| `2`      | Неправильно, но ответ был близким  |
| `3`      | Правильно с трудом                 |
| `4`      | Правильно после лёгкого раздумья   |
| `5`      | Идеально, без раздумий             |


**Ответ:** обновлённый объект `UserWordProgress` с пересчитанными `interval`, `easeFactor`, `nextReview`.

---

### 6.5 GET `/api/progress/words/:lemmaId/contexts`

Все контексты (предложения из текстов), в которых пользователь встречал это слово. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Параметры пути:** `lemmaId` — UUID леммы.

**Ответ:**

```json
[
  {
    "id": "cuid",
    "word": "мотт",
    "snippet": "Чоьшца мотт раза мотт ду",
    "seenAt": "2026-03-20T10:00:00.000Z",
    "text": {
      "id": "uuid",
      "title": "Простые рассказы",
      "language": "CHE"
    }
  }
]
```

---

## 7. Деки — ShuVeriDenig (`/api/deck`)

Авторская система заучивания слов. Все эндпоинты требуют **Premium** подписку.


| Метод  | Путь                        | Описание                                     | Авторизация    |
| ------ | --------------------------- | -------------------------------------------- | -------------- |
| GET    | `/api/deck/settings`        | Текущие настройки дек                        | Bearer+Premium |
| PATCH  | `/api/deck/settings`        | Обновить настройки                           | Bearer+Premium |
| GET    | `/api/deck/daily`           | N слов из словаря, ещё не добавленных в деки | Bearer+Premium |
| POST   | `/api/deck/add/:lemmaId`    | Добавить слово в деку NEW                    | Bearer+Premium |
| DELETE | `/api/deck/remove/:lemmaId` | Убрать слово из всех дек                     | Bearer+Premium |
| POST   | `/api/deck/rate/:lemmaId`   | Оценить карточку (know / again)              | Bearer+Premium |
| GET    | `/api/deck/due`             | Карточки на сегодня (все деки + ротация)     | Bearer+Premium |
| GET    | `/api/deck/stats`           | Статистика: кол-во карточек в каждой деке    | Bearer+Premium |


### 7.1 GET `/api/deck/settings`

**Заголовки:** `Authorization: Bearer <token>`

**Ответ:**

```json
{
  "dailyWordCount": 5,
  "deckMaxSize": 90
}
```

---

### 7.2 PATCH `/api/deck/settings`

Обновить одно или оба поля. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Тело запроса (JSON), все поля необязательны:**

```json
{
  "dailyWordCount": 10,
  "deckMaxSize": 90
}
```


| Поле             | Допустимые значения | Описание                                 |
| ---------------- | ------------------- | ---------------------------------------- |
| `dailyWordCount` | `3`, `5`, `10`      | Сколько слов предлагать добавлять в день |
| `deckMaxSize`    | `10`–`500`          | Максимальный размер каждой деки          |


**Ответ:** обновлённый объект `UserDeckState`.

---

### 7.3 GET `/api/deck/daily`

Слова из личного словаря пользователя, которые ещё не добавлены ни в одну деку. Количество = `dailyWordCount` из настроек. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ:**

```json
[
  {
    "id": "uuid",
    "word": "мотт",
    "translation": "язык, речь",
    "lemmaId": "uuid",
    "addedAt": "2026-03-20T10:00:00.000Z",
    "lemma": {
      "id": "uuid",
      "baseForm": "мотт",
      "partOfSpeech": "noun"
    }
  }
]
```

Чтобы добавить слово в деку — используй `POST /api/deck/add/:lemmaId`.

---

### 7.4 POST `/api/deck/add/:lemmaId`

Добавляет слово в деку NEW. Если NEW переполнена — старые слова автоматически смещаются в OLD → RETIRED → NUMBERED. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Параметры пути:** `lemmaId` — UUID леммы.

**Тело:** не нужно.

**Ответ:** созданная или уже существующая карточка `UserDeckCard`.

```json
{
  "id": "cuid",
  "userId": "uuid",
  "lemmaId": "uuid",
  "deckType": "NEW",
  "deckNumber": null,
  "movedAt": "2026-03-28T12:00:00.000Z"
}
```

---

### 7.5 DELETE `/api/deck/remove/:lemmaId`

Удаляет слово из всех дек. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Параметры пути:** `lemmaId` — UUID леммы.

**Ответ:** удалённая карточка.

---

### 7.6 POST `/api/deck/rate/:lemmaId`

Оценить карточку после повторения. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Параметры пути:** `lemmaId` — UUID леммы.

**Тело запроса (JSON):**

```json
{
  "result": "know"
}
```


| Значение  | Описание                                                          |
| --------- | ----------------------------------------------------------------- |
| `"know"`  | Слово знаю — `movedAt` обновляется (карточка уходит в конец FIFO) |
| `"again"` | Не вспомнил — карточка остаётся на месте без изменений            |


**Ответ:** объект `UserDeckCard`.

---

### 7.7 GET `/api/deck/due`

Возвращает все карточки для повторения сегодня: деки NEW, OLD, RETIRED и текущая нумерованная дека (ротируется каждый день). Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ:**

```json
{
  "new": [ /* UserDeckCard[] с lemma */ ],
  "old": [ /* UserDeckCard[] с lemma */ ],
  "retired": [ /* UserDeckCard[] с lemma */ ],
  "numbered": [ /* UserDeckCard[] с lemma — текущая нумерованная */ ],
  "currentNumberedDeck": 3,
  "maxNumberedDeck": 7
}
```

Каждая карточка содержит вложенный `lemma`:

```json
{
  "id": "cuid",
  "userId": "uuid",
  "lemmaId": "uuid",
  "deckType": "NEW",
  "deckNumber": null,
  "movedAt": "2026-03-28T12:00:00.000Z",
  "lemma": {
    "id": "uuid",
    "baseForm": "мотт",
    "partOfSpeech": "noun",
    "headwords": [
      {
        "id": "uuid",
        "text": "мотт",
        "normalized": "мотт",
        "entry": { "rawTranslate": "язык, речь" }
      }
    ]
  }
}
```

---

### 7.8 GET `/api/deck/stats`

Статистика по деким + текущие настройки. Требует Premium.

**Заголовки:** `Authorization: Bearer <token>`

**Ответ:**

```json
{
  "new": 36,
  "old": 22,
  "retired": 0,
  "numbered": [
    { "deckNumber": 1, "count": 90 },
    { "deckNumber": 2, "count": 45 }
  ],
  "total": 193,
  "deckMaxSize": 90,
  "dailyWordCount": 5
}
```

---

## 8. Админ (`/api/admin/...`)

Все маршруты админки под префиксом `/api/admin`. Требуют роль Admin.


| Метод  | Путь                     | Описание                         |
| ------ | ------------------------ | -------------------------------- |
| POST   | `/api/admin/texts`       | Создать текст                    |
| PATCH  | `/api/admin/texts/:id`   | Частично обновить текст          |
| DELETE | `/api/admin/texts/:id`   | Удалить текст                    |
| GET    | `/api/admin/tokens/:id`  | Данные токена для редактирования |
| PATCH  | `/api/admin/tokens/bulk` | Массовое обновление токенов      |
| PATCH  | `/api/admin/tokens/:id`  | Обновить отдельный токен         |
| POST   | `/api/admin/dictionary`  | Создать запись в словаре         |


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

---

## 8. Разговорник (Phrasebook)

### 8.1 GET `/api/phrasebook/stats` (Bearer)

Возвращает общую статистику разговорника для текущего пользователя.

**Ответ:**

```json
{
  "totalPhrases": 28,
  "totalCategories": 8,
  "savedCount": 5
}
```

---

### 8.2 GET `/api/phrasebook/categories` (Bearer)

**Ответ:**

```json
[
  { "id": "uuid", "emoji": "👋", "name": "Приветствия", "sortOrder": 0, "phraseCount": 7 },
  { "id": "uuid", "emoji": "🤝", "name": "Знакомство",  "sortOrder": 1, "phraseCount": 4 }
]
```

---

### 8.3 GET `/api/phrasebook/phrases` (Bearer)

**Query-параметры:**


| Параметр     | Тип           | Описание                                          |
| ------------ | ------------- | ------------------------------------------------- |
| `categoryId` | string (UUID) | Фильтр по категории                               |
| `lang`       | `CHE`         | `RU`                                              |
| `saved`      | `true`        | Только сохранённые фразы                          |
| `search`     | string        | Поиск по original / translation / transliteration |


**Ответ:**

```json
[
  {
    "id": "uuid",
    "categoryId": "uuid",
    "original": "Салам!",
    "transliteration": "Salam!",
    "translation": "Привет! / Здравствуй!",
    "lang": "CHE",
    "saved": false,
    "words": [
      { "id": "uuid", "original": "Салам", "translation": "привет", "position": 0 }
    ],
    "examples": [
      {
        "id": "uuid",
        "phrase": "Салам! Мухa ду хьо?",
        "translation": "Привет! Как ты?",
        "context": "Неформальное приветствие"
      }
    ]
  }
]
```

---

### 8.4 POST `/api/phrasebook/saves/:phraseId` (Bearer)

Toggle сохранения фразы. Повторный вызов убирает из сохранённых.

**Ответ:**

```json
{ "saved": true }
```

---

### 8.5 POST `/api/phrasebook/suggestions` (Bearer)

Пользователь предлагает фразу для добавления в разговорник.

**Тело запроса (JSON):**

```json
{
  "original": "Массо а дикачу!",
  "translation": "Всего доброго!",
  "lang": "CHE",
  "context": "Используется при прощании",
  "categoryId": "uuid"
}
```

`categoryId` — необязательно.

**Ответ:**

```json
{
  "id": "uuid",
  "original": "Массо а дикачу!",
  "translation": "Всего доброго!",
  "lang": "CHE",
  "createdAt": "2026-03-28T..."
}
```

---

### 8.6 GET `/api/admin/phrasebook/categories` (Admin, CAN_EDIT_TEXTS)

**Ответ:** массив категорий с `_count.phrases`.

---

### 8.7 POST `/api/admin/phrasebook/categories` (Admin)

**Тело:**

```json
{
  "emoji": "👋",
  "name": "Приветствия",
  "sortOrder": 0
}
```

`sortOrder` — необязательно, по умолчанию 0.

---

### 8.8 PATCH `/api/admin/phrasebook/categories/:id` (Admin)

Все поля необязательны: `emoji`, `name`, `sortOrder`.

---

### 8.9 DELETE `/api/admin/phrasebook/categories/:id` (Admin)

Удаляет категорию и все её фразы (CASCADE). **204 No Content**.

---

### 8.10 GET `/api/admin/phrasebook/phrases` (Admin)

**Query:** `categoryId` (необязательно).

**Ответ:** массив фраз с `words[]`, `examples[]`, `_count.saves`.

---

### 8.11 POST `/api/admin/phrasebook/phrases` (Admin)

**Тело:**

```json
{
  "categoryId": "uuid",
  "original": "Салам!",
  "transliteration": "Salam!",
  "translation": "Привет!",
  "lang": "CHE",
  "sortOrder": 0,
  "words": [
    { "original": "Салам", "translation": "привет", "position": 0 }
  ],
  "examples": [
    { "phrase": "Салам! Мухa ду хьо?", "translation": "Привет! Как ты?", "context": "Неформально" }
  ]
}
```

`transliteration`, `sortOrder`, `words`, `examples` — необязательны.

---

### 8.12 PATCH `/api/admin/phrasebook/phrases/:id` (Admin)

Все поля необязательны. Если переданы `words` или `examples` — они **полностью заменяют** существующие (не дополняют).

---

### 8.13 DELETE `/api/admin/phrasebook/phrases/:id` (Admin)

**204 No Content**.

---

### 8.14 GET `/api/admin/phrasebook/suggestions` (Admin)

**Ответ:**

```json
[
  {
    "id": "uuid",
    "original": "Массо а дикачу!",
    "translation": "Всего доброго!",
    "lang": "CHE",
    "context": "При прощании",
    "createdAt": "2026-03-28T...",
    "user": { "id": "uuid", "username": "alibek", "email": "..." },
    "category": { "id": "uuid", "name": "Приветствия" }
  }
]
```

`user` и `category` могут быть `null`.

---

### 8.15 DELETE `/api/admin/phrasebook/suggestions/:id` (Admin)

**204 No Content**.

---

## Сводная таблица


| Группа     | Метод  | Путь                                    |
| ---------- | ------ | --------------------------------------- |
| Auth       | POST   | `/api/auth/login`                       |
| Auth       | POST   | `/api/auth/register`                    |
| Auth       | POST   | `/api/auth/login/access-token`          |
| Auth       | POST   | `/api/auth/logout`                      |
| Users      | GET    | `/api/users/:id`                        |
| Users      | PATCH  | `/api/users`                            |
| Users      | DELETE | `/api/users`                            |
| Texts      | GET    | `/api/texts`                            |
| Texts      | GET    | `/api/texts/:id`                        |
| Texts      | GET    | `/api/texts/:id/pages/:pageNumber`      |
| Words      | POST   | `/api/words/lookup`                     |
| Words      | POST   | `/api/words/lookup-by-word`             |
| Tokens     | GET    | `/api/tokens/:id`                       |
| Progress   | GET    | `/api/progress/text/:id`                |
| Progress   | GET    | `/api/progress/review/stats`            |
| Progress   | GET    | `/api/progress/review/due`              |
| Progress   | POST   | `/api/progress/review/:lemmaId`         |
| Progress   | GET    | `/api/progress/words/:lemmaId/contexts` |
| Deck       | GET    | `/api/deck/settings`                    |
| Deck       | PATCH  | `/api/deck/settings`                    |
| Deck       | GET    | `/api/deck/daily`                       |
| Deck       | POST   | `/api/deck/add/:lemmaId`                |
| Deck       | DELETE | `/api/deck/remove/:lemmaId`             |
| Deck       | POST   | `/api/deck/rate/:lemmaId`               |
| Deck       | GET    | `/api/deck/due`                         |
| Deck       | GET    | `/api/deck/stats`                       |
| Admin      | POST   | `/api/admin/texts`                      |
| Admin      | PATCH  | `/api/admin/texts/:id`                  |
| Admin      | DELETE | `/api/admin/texts/:id`                  |
| Admin      | GET    | `/api/admin/tokens/:id`                 |
| Admin      | PATCH  | `/api/admin/tokens/bulk`                |
| Admin      | PATCH  | `/api/admin/tokens/:id`                 |
| Admin      | POST   | `/api/admin/dictionary`                 |
| Phrasebook | GET    | `/api/phrasebook/stats`                 |
| Phrasebook | GET    | `/api/phrasebook/categories`            |
| Phrasebook | GET    | `/api/phrasebook/phrases`               |
| Phrasebook | POST   | `/api/phrasebook/saves/:phraseId`       |
| Phrasebook | POST   | `/api/phrasebook/suggestions`           |
| Admin      | GET    | `/api/admin/phrasebook/categories`      |
| Admin      | POST   | `/api/admin/phrasebook/categories`      |
| Admin      | PATCH  | `/api/admin/phrasebook/categories/:id`  |
| Admin      | DELETE | `/api/admin/phrasebook/categories/:id`  |
| Admin      | GET    | `/api/admin/phrasebook/phrases`         |
| Admin      | POST   | `/api/admin/phrasebook/phrases`         |
| Admin      | PATCH  | `/api/admin/phrasebook/phrases/:id`     |
| Admin      | DELETE | `/api/admin/phrasebook/phrases/:id`     |
| Admin      | GET    | `/api/admin/phrasebook/suggestions`     |
| Admin      | DELETE | `/api/admin/phrasebook/suggestions/:id` |


Интерактивная документация Swagger доступна по адресу `**/api/docs`** (если включена в приложении).