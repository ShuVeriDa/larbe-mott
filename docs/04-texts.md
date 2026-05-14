# Тексты и обработка

Модули: [src/text/](../src/text/), [src/markup-engine/](../src/markup-engine/)

---

## Что такое "текст" в платформе

Текст — это учебный материал на чеченском, русском, арабском или английском языке. Каждый текст:
- Разбит на **страницы** (для постраничного чтения)
- Хранится в формате **TipTap JSON** (rich text редактор) + сырой `contentRaw`
- Имеет уровень сложности (A1–C2, опционально) и язык
- Может иметь **теги** (один или несколько) для категоризации
- После загрузки проходит **конвейер обработки** — каждое слово анализируется
- Имеет **версии обработки** (`TextProcessingVersion`): каждая токенизация создаёт новую версию

---

## Модель данных

```
Text (title, description, level, language, author, source, imageUrl, publishedAt, archivedAt, processingStatus)
 ├── TextTag[] → Tag (теги текста)
 ├── TextPage[] (страницы: contentRich + contentRaw)
 │    └── TextToken[] (на каждую (version, page) — токены страницы)
 ├── TextProcessingVersion[] (история обработок)
 │    ├── TextToken[] (токены данной версии)
 │    ├── TextVocabulary[] (уникальные слова версии: lemmaId + translation)
 │    └── TextVersionLog[] (журнал шагов)
 ├── UserTextProgress[] (прогресс пользователей)
 └── UserTextBookmark[] (закладки пользователей)

TextToken
 └── TokenAnalysis[] (один токен → одна или несколько лемм)

Tag (id, name, createdAt) — глобальный справочник тегов
```

### Поля модели Text

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID | Уникальный идентификатор |
| `title` | string | Название текста |
| `description` | string? | Краткое описание/аннотация |
| `language` | `CHE` \| `RU` \| `AR` \| `EN` | Язык текста |
| `level` | `A1`–`C2`, nullable | Уровень сложности (опционально) |
| `author` | string? | Автор текста |
| `source` | string? | Источник (URL) |
| `imageUrl` | string? | URL обложки текста |
| `publishedAt` | DateTime? | Дата публикации; `null` = черновик |
| `archivedAt` | DateTime? | Дата архивирования; `null` = не в архиве |
| `processingStatus` | `IDLE` \| `RUNNING` \| `COMPLETED` \| `ERROR` | Статус последнего конвейера |
| `processingProgress` | int 0–100 | Прогресс текущей обработки |
| `processingError` | string? | Текст ошибки последней обработки |
| `autoTokenizeOnSave` | boolean | Авто-перетокенизация при изменении страниц |
| `useNormalization` | boolean | Применять нормализацию по умолчанию |
| `useMorphAnalysis` | boolean | Применять морфологию по умолчанию |
| `createdById` | UUID | Пользователь-автор записи |
| `createdAt` / `updatedAt` | DateTime | Стандартные таймстемпы |
| `tags` | TextTag[] | Теги текста (через связку TextTag) |
| `pages` | TextPage[] | Страницы |

### Поля TextPage

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | cuid | Идентификатор страницы |
| `textId` | UUID | Текст-родитель |
| `pageNumber` | int | Номер страницы (1-based) |
| `title` | string? | Название главы/раздела |
| `contentRich` | Json | TipTap JSON документ |
| `contentRaw` | string | Текст без разметки (используется токенизатором) |

### Поля TextToken

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | cuid | Идентификатор токена |
| `versionId` | UUID | Версия обработки |
| `pageId` | cuid? | Страница, где токен расположен |
| `position` | int | Позиция токена сквозная по тексту |
| `original` | string | Исходное написание |
| `normalized` | string | Нормализованная форма |
| `startOffset` / `endOffset` | int? | Смещения в `contentRaw` страницы |
| `status` | `ANALYZED` \| `AMBIGUOUS` \| `NOT_FOUND` | Результат анализа |
| `vocabId` | cuid? | Связь с TextVocabulary |

---

## API Endpoints (публичные)

Все эндпоинты ниже находятся под префиксом `/api/texts` (контроллер `TextController`).

### Обзор

| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| GET | `/api/texts/tags` | Optional | Список всех тегов (для построения фильтров) |
| GET | `/api/texts` | Optional | Список опубликованных текстов с фильтрами, сортировкой, пагинацией и счётчиками |
| GET | `/api/texts/continue-reading` | Bearer | Тексты в процессе чтения (0 < progress < 100) |
| GET | `/api/texts/bookmarks` | Bearer | Избранные (закладки) пользователя |
| GET | `/api/texts/:id` | Optional | Полная карточка текста: метаданные, страницы, теги, прогресс |
| GET | `/api/texts/:id/related` | Optional | До 6 похожих опубликованных текстов |
| GET | `/api/texts/:id/pages/:pageNumber` | Optional | Одна страница + токены + прогресс |
| GET | `/api/texts/:id/pages/:pageNumber/phrases` | Optional | Переводы фраз страницы (для reader) |
| POST | `/api/texts/:id/bookmark` | Bearer | Toggle закладки |
| DELETE | `/api/texts/:id/progress` | Bearer | Сбросить прогресс пользователя по тексту |
| POST | `/api/texts/:id/report` | Bearer | Жалоба на текст (создаётся FeedbackThread) |

---

### GET /api/texts/tags

Возвращает список всех тегов. Используется фронтом для построения фильтров в библиотеке.

**Auth:** Optional (декоратор `@OptionalAuth()`).

**Ответ:**
```json
[
  { "id": "uuid-1", "name": "Литература" },
  { "id": "uuid-2", "name": "История" },
  { "id": "uuid-3", "name": "Сказки" }
]
```

> Сортировка по `name asc`.

---

### GET /api/texts

Возвращает страницу опубликованных текстов. Поддерживает фильтрацию, сортировку, поиск, пагинацию и прогресс пользователя.

**Auth:** Optional. Прогресс (`progressPercent`, `progressStatus`, `lastOpened`, `isFavorite`) возвращается только при авторизации; без токена прогресс = 0, статус = `NEW`, `lastOpened = null`, `isFavorite = false`.

**Query-параметры:**

| Параметр | Значения | Обязательный | Описание |
|----------|---------|-------------|---------|
| `language` | `CHE` \| `RU` \| `AR` \| `EN` | Нет | Один или несколько (повторить параметр). Без параметра — все языки. |
| `level` | `A1`–`C2` | Нет | Один или несколько (повторить параметр). Без параметра — все уровни. |
| `tagId` | UUID | Нет | Один или несколько тегов (повторить параметр). Возвращает тексты у которых есть хотя бы один из указанных тегов. |
| `status` | `NEW` \| `IN_PROGRESS` \| `COMPLETED` | Нет | Фильтр по статусу прогресса. Применяется только при авторизации. |
| `orderBy` | `newest` \| `oldest` \| `alpha` \| `progress` \| `length` \| `level` | Нет | Сортировка. По умолчанию: `newest`. |
| `search` | string | Нет | Поиск по названию и автору (case-insensitive). |
| `page` | int ≥ 1 | Нет | Номер страницы. По умолчанию `1`. |
| `limit` | int 1–50 | Нет | Размер страницы. По умолчанию `20`, максимум `50`. |

**Значения `orderBy`:**

| Значение | Описание |
|----------|---------|
| `newest` | Сначала новые (по `createdAt desc`) — по умолчанию |
| `oldest` | Сначала старые (по `createdAt asc`) |
| `alpha` | По алфавиту (`title asc`) |
| `progress` | По убыванию `progressPercent` (требует авторизации; постсортировка после выборки страницы) |
| `length` | По убыванию `wordCount` (постсортировка после выборки страницы) |
| `level` | По уровню сложности (`A1 → C2`) |

**Значения `status`:**

| Значение | Условие |
|----------|---------|
| `NEW` | `progressPercent === 0` — не начат |
| `IN_PROGRESS` | `0 < progressPercent < 100` — читается |
| `COMPLETED` | `progressPercent >= 100` — завершён |

**Примеры:**
```
GET /api/texts
→ Все тексты, сортировка по дате (новые первые), 1-я страница из 20

GET /api/texts?language=CHE&language=RU
→ Чеченские и русские тексты

GET /api/texts?level=A1&level=A2&orderBy=alpha
→ Тексты уровней A1 и A2, по алфавиту

GET /api/texts?tagId=uuid-1&tagId=uuid-2
→ Тексты с тегом "Литература" или "История"

GET /api/texts?status=IN_PROGRESS&orderBy=progress
→ Тексты в процессе чтения, отсортированные по убыванию прогресса

GET /api/texts?language=RU&level=B1&search=рассказ&orderBy=length&page=2&limit=10
→ Русские тексты B1, содержащие "рассказ", от длинных к коротким, вторая страница по 10
```

**Ответ:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Название текста",
      "description": "Короткое описание",
      "level": "B1",
      "language": "RU",
      "author": "Автор",
      "source": null,
      "imageUrl": null,
      "publishedAt": "2026-01-01T00:00:00.000Z",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "tags": [
        { "id": "uuid-1", "name": "Литература" }
      ],
      "wordCount": 420,
      "readingTime": 3,
      "progressPercent": 35.5,
      "progressStatus": "IN_PROGRESS",
      "lastOpened": "2026-03-20T10:00:00.000Z",
      "isNew": false,
      "isFavorite": true
    }
  ],
  "page": 1,
  "limit": 20,
  "counts": {
    "total": 12,
    "new": 5,
    "inProgress": 4,
    "completed": 3
  }
}
```

> `wordCount` — число токенов в последней (`version desc`) обработке текста.
> `readingTime` — `max(1, round(wordCount / 200))`, минут.
> `counts.total` — общее число текстов под фильтрами language/level/tag/search (без `status`).
> `counts.new/inProgress/completed` — глобальные счётчики по той же выборке (без фильтра `status`); `new = total − completed − inProgress`.
> Прогресс-поля доступны только авторизованным; без токена: `progressPercent = 0`, `progressStatus = "NEW"`, `lastOpened = null`, `isFavorite = false`.
> `isNew: true` — если текст опубликован менее 30 дней назад. Возвращается всегда.

---

### GET /api/texts/continue-reading

Возвращает тексты, которые пользователь начал, но не дочитал (`0 < progressPercent < 100`). Отсортированы по `lastOpened desc` (последние открытые первые).

**Auth:** Bearer (обязателен).

**Ответ:**
```json
[
  {
    "id": "uuid",
    "title": "Название текста",
    "level": "B1",
    "language": "RU",
    "author": "Автор",
    "imageUrl": null,
    "tags": [{ "id": "uuid-1", "name": "Литература" }],
    "wordCount": 420,
    "readingTime": 3,
    "progressPercent": 35.5,
    "lastOpened": "2026-03-20T10:00:00.000Z",
    "currentPage": 3,
    "totalPages": 8
  }
]
```

> `currentPage` = `min(UserTextProgress.lastPageNumber, totalPages)`. Это фактическая страница чтения (монотонно вперёд), независимая от `progressPercent`.

---

### GET /api/texts/bookmarks

Возвращает тексты, добавленные пользователем в избранное. Сортировка по `bookmarkedAt desc`.

**Auth:** Bearer (обязателен).

**Ответ:**
```json
[
  {
    "id": "uuid",
    "title": "Название текста",
    "level": "B1",
    "language": "CHE",
    "author": "Автор",
    "imageUrl": null,
    "tags": [{ "id": "uuid-1", "name": "Литература" }],
    "wordCount": 420,
    "readingTime": 3,
    "totalPages": 8,
    "progressPercent": 20.0,
    "bookmarkedAt": "2026-03-25T10:00:00.000Z"
  }
]
```

---

### GET /api/texts/:id

Возвращает полную карточку текста для страницы `/library/:id`.

**Auth:** Optional. При авторизации возвращает дополнительные поля прогресса и статистики слов; также пишет событие `OPEN_TEXT` (mode=`full`), регистрирует «увиденные» леммы и обновляет lastOpened.

**Path-параметры:**

| Параметр | Тип | Описание |
|----------|-----|---------|
| `id` | UUID | ID текста |

**Ответ:**
```json
{
  "id": "uuid",
  "title": "Название текста",
  "description": "Короткое описание",
  "level": "B1",
  "language": "RU",
  "author": "Автор",
  "source": "https://example.com",
  "imageUrl": null,
  "publishedAt": "2026-03-01T00:00:00.000Z",
  "createdAt": "2026-03-01T00:00:00.000Z",
  "updatedAt": "2026-03-01T00:00:00.000Z",
  "tags": [{ "id": "uuid-1", "name": "Литература" }],
  "wordCount": 1840,
  "readingTime": 9,
  "totalPages": 14,
  "pages": [
    { "id": "cuid", "pageNumber": 1, "title": "Введение" },
    { "id": "cuid", "pageNumber": 2, "title": null }
  ],
  "progress": 35.5,
  "progressPercent": 35.5,
  "lastOpened": "2026-03-24T10:00:00.000Z",
  "currentPage": 5,
  "wordStats": {
    "total": 420,
    "known": 64,
    "learning": 31,
    "new": 325
  },
  "isFavorite": true
}
```

| Поле | Auth | Описание |
|------|------|---------|
| `wordCount` | — | Число токенов в последней версии обработки |
| `readingTime` | — | `max(1, round(wordCount / 200))` мин |
| `totalPages` | — | Количество страниц |
| `pages[]` | — | Список страниц: `id`, `pageNumber`, `title` (опционально) |
| `description` | — | Описание/аннотация (или `null`) |
| `publishedAt` | — | Дата публикации; `null` = черновик |
| `imageUrl` | — | URL обложки или `null` |
| `progress` | Optional | Прогресс 0–100, вычисляется по доле KNOWN-слов. Без токена: `0` |
| `progressPercent` | Optional | То же, что хранится в `UserTextProgress`. Без токена: `0` |
| `lastOpened` | Optional | Дата последнего открытия. Без токена: `null` |
| `currentPage` | Optional | Текущая страница (`min(lastPageNumber, totalPages)`). Без токена: `0` |
| `wordStats` | Optional | Слова текста по статусам пользователя. Без токена: все слова в `new`, `known/learning = 0` |
| `isFavorite` | Optional | Добавлен ли текст в закладки. Без токена: `false` |

> `wordStats.total` — число уникальных лемм (а не токенов) в тексте.

---

### GET /api/texts/:id/pages/:pageNumber/phrases

Возвращает все переводы фраз (словосочетаний) на данной странице. Используется ридером при загрузке страницы для построения карты фраз — frontend при наведении мышью между токенами проверяет по ней наличие перевода и отображает попап.

**Auth:** Optional.

**Path-параметры:**

| Параметр | Тип | Описание |
|----------|-----|---------|
| `id` | UUID | ID текста |
| `pageNumber` | int | Номер страницы (1-based) |

**Ответ:**
```json
[
  {
    "id": "uuid-occurrence",
    "startTokenPosition": 5,
    "endTokenPosition": 7,
    "phrase": {
      "id": "uuid-phrase",
      "original": "доттагIалла деш",
      "translation": "в дружбе",
      "notes": null
    }
  }
]
```

> Отсортировано по `startTokenPosition` asc. Позиции совпадают с `TextToken.position` токенов, возвращаемых в `/api/texts/:id/pages/:pageNumber`.

---

### GET /api/texts/:id/related

Возвращает до 6 похожих опубликованных текстов (тот же `language` + совпадение по `level` ИЛИ хотя бы по одному тегу). Сортировка кандидатов: `publishedAt desc`. Сам текст исключён из выборки.

**Auth:** Optional. При авторизации добавляет `progressPercent` по каждому тексту.

**Ответ:**
```json
[
  {
    "id": "uuid",
    "title": "Грамматика чеченского глагола",
    "language": "CHE",
    "level": "B2",
    "author": "Автор",
    "imageUrl": null,
    "tags": [{ "id": "uuid-1", "name": "Грамматика" }],
    "wordCount": 1120,
    "readingTime": 6,
    "totalPages": 8,
    "progressPercent": 0
  }
]
```

---

### GET /api/texts/:id/pages/:pageNumber

Возвращает одну страницу текста с токенами. Используется в ридере: 1 страница = 1 запрос.

**Auth:** Optional. При авторизации:
- двигает `lastPageNumber` (монотонно вперёд) через `TextProgressService.setPosition`,
- регистрирует «увиденные» леммы (`WordProgressService.registerSeenWords`),
- логирует событие `OPEN_TEXT` (с `pageNumber` в metadata),
- пересчитывает и сохраняет `progressPercent` и `lastOpened`.

**Path-параметры:**

| Параметр | Тип | Описание |
|----------|-----|---------|
| `id` | UUID | ID текста |
| `pageNumber` | int | Номер страницы (1-based) |

**Ответ (есть последняя версия с токенами):**
```json
{
  "id": "uuid",
  "title": "Название текста",
  "level": "B1",
  "language": "RU",
  "author": "Автор",
  "source": "https://example.com",
  "totalPages": 14,
  "wordCount": 320,
  "contentRich": { "type": "doc", "content": [] },
  "tokens": [
    {
      "id": "cuid",
      "position": 0,
      "original": "Со",
      "normalized": "со",
      "status": "ANALYZED",
      "vocabId": "cuid",
      "lemmaId": "uuid",
      "userStatus": "LEARNING"
    }
  ],
  "progress": 35.5,
  "bookmarked": true,
  "lastPageNumber": 5,
  "page": {
    "id": "cuid",
    "pageNumber": 1,
    "title": "Введение",
    "contentRich": { "type": "doc", "content": [] },
    "contentRaw": "Со бусулба нохчи ву."
  }
}
```

> Если у текста ещё нет ни одной обработанной версии, возвращается тот же объект, но с `wordCount: 0`, `tokens: []`, `progress: 0`.

| Поле | Auth | Описание |
|------|------|---------|
| `totalPages` | — | Общее число страниц текста |
| `wordCount` | — | Число токенов во всей текущей версии (не только этой страницы) |
| `contentRich` | — | TipTap JSON страницы (дублирует `page.contentRich`) |
| `page.contentRich` | — | TipTap JSON |
| `page.contentRaw` | — | Сырой текст страницы |
| `page.title` | — | Название главы/раздела (или `null`) |
| `tokens[].lemmaId` | — | ID леммы primary-анализа (или `null`) |
| `tokens[].vocabId` | — | ID связанной строки `TextVocabulary` |
| `tokens[].status` | — | `ANALYZED` \| `AMBIGUOUS` \| `NOT_FOUND` |
| `tokens[].userStatus` | Optional | Статус слова у пользователя: `NEW`, `LEARNING`, `KNOWN`, или `null`. Без токена: `null` |
| `progress` | Optional | Прогресс чтения 0–100 (по доле KNOWN-слов). Без токена: `0` |
| `bookmarked` | Optional | Добавлен ли текст в закладки. Без токена: `false` |
| `lastPageNumber` | Optional | Зафиксированная позиция чтения после запроса. Без токена: переданный `pageNumber` |

---

### POST /api/texts/:id/bookmark

Переключает состояние закладки (добавить если нет, удалить если есть).

**Auth:** Bearer (обязателен).

**Ответ:**
```json
{ "bookmarked": true }
```

> `bookmarked: true` — закладка добавлена, `bookmarked: false` — закладка удалена.

---

### DELETE /api/texts/:id/progress

Удаляет строку `UserTextProgress` для пары (user, text). Сбрасывает `progressPercent`, `lastOpened`, `lastPageNumber`, `completedAt`. Не затрагивает закладки и пословный прогресс.

**Auth:** Bearer (обязателен).

**Ответ:**
```json
{ "ok": true }
```

> 404, если текста с таким `id` не существует.

---

### POST /api/texts/:id/report

Создаёт жалобу на текст в виде `FeedbackThread` (`type=COMPLAINT`, `contextType=TEXT`, `contextTextId=:id`). Категория жалобы попадает в `FeedbackThread.contextAction`; пользовательский комментарий — в первое сообщение треда.

**Auth:** Bearer (обязателен).

**Body:**

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|---------|
| `reason` | enum | Да | `SPAM` \| `INAPPROPRIATE` \| `COPYRIGHT` \| `INCORRECT_CONTENT` \| `BROKEN` \| `OTHER` |
| `comment` | string ≤ 2000 | Нет | Произвольный комментарий |

**Ответ (201):**
```json
{
  "id": "uuid",
  "ticketNumber": "FB-000123",
  "status": "OPEN",
  "createdAt": "2026-04-29T10:00:00.000Z"
}
```

**Ошибки:**
- `404` — текст не найден.
- `409` — у пользователя уже есть незакрытая жалоба на этот текст. В теле ошибки: `{ message, threadId, ticketNumber }`.

---

## Теги

### Что такое тег

Тег — это метка для категоризации текстов. Примеры: «Литература», «Сказки», «История», «Природа».

- Теги создаются администратором через `/api/admin/tags` (глобальный справочник)
- Тексту можно назначить один или несколько тегов
- Теги задаются при **создании** и **редактировании** текста через `tagIds` и/или `tagNames`
- `tagNames` поддерживает find-or-create: новые названия создаются автоматически
- Удаление тега снимает его со всех текстов автоматически (`onDelete: Cascade` в `TextTag`)

### Endpoints (admin)

| Метод | URL | Permission | Описание |
|-------|-----|------------|---------|
| GET | `/api/admin/tags` | CAN_EDIT_TEXTS | Все теги + `_count.texts` |
| POST | `/api/admin/tags` | CAN_EDIT_TEXTS | Создать тег `{ name }` |
| PATCH | `/api/admin/tags/:id` | CAN_EDIT_TEXTS | Переименовать тег `{ name }` |
| DELETE | `/api/admin/tags/:id` | CAN_EDIT_TEXTS | Удалить тег (снимется со всех текстов) |

### Workflow работы с тегами

```
1. Создать теги:  POST  /api/admin/tags        { "name": "Литература" }
2. Получить ID:   GET   /api/admin/tags
3. Создать текст: POST  /api/admin/texts       { ..., "tagIds": ["uuid-1"], "tagNames": ["История"] }
4. Изменить теги: PATCH /api/admin/texts/:id   { "tagIds": ["uuid-3"] }
5. Фронт фильтрует: GET /api/texts?tagId=uuid-1&tagId=uuid-2
```

---

## Конвейер обработки текста

Запускается `TokenizerProcessor.processText(textId, opts)` (модуль [src/markup-engine/tokenizer/](../src/markup-engine/tokenizer/)). Создаёт новую `TextProcessingVersion` (`version = max + 1`), пишет журнал шагов в `TextVersionLog`, по завершении помечает версию `isCurrent = true` и снимает флаг с предыдущих.

Опции (`ProcessTextOpts`):

| Опция | Значение по умолчанию | Описание |
|-------|----------------------|---------|
| `trigger` | `MANUAL` | `MANUAL` \| `AUTO` \| `RETRY` (см. enum `ProcessingTrigger`) |
| `initiatorId` | `null` | UUID пользователя-инициатора |
| `useNormalization` | `true` | Включить шаг 2 |
| `useMorphAnalysis` | `true` | Включить шаги 3–5 |
| `label` | `"токенизация"` | Метка версии для UI |

### Шаг 0: Подготовка

- Меняет `Text.processingStatus = RUNNING`, `processingProgress = 0`.
- Эмитит SSE-событие `status_change` через `TokenizationEventsService` (если подключён).
- Если у текста нет страниц — сразу `COMPLETED` без создания версии.

### Шаг 1: Токенизация (progress → 20)

**Сервис:** [TokenizerService](../src/markup-engine/tokenizer/tokenizer.service.ts)

Регэксп `([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*)|([.,!?;:()"«»—])` разбивает `contentRaw` каждой страницы на слова и пунктуацию. Для каждого токена сохраняются:

- `position` (сквозная по тексту)
- `original` — исходное написание
- `normalized` — результат `normalizeToken(original)`
- `startOffset`, `endOffset` — смещения в `contentRaw` страницы (для редактирования)
- `pageId` — связь со страницей
- `status = ANALYZED` (значение по умолчанию; меняется на следующих шагах при необходимости)

### Шаг 2: Нормализация (progress → 40)

**Сервис:** [NormalizerService](../src/markup-engine/normalizer/normalizer.service.ts)
**Утилита:** [normalizeToken](../src/markup-engine/tokenizer/tokenizer.utils.ts)

Слово приводится к нормальной форме:
- lowercase
- удаление пунктуации `«»"().,!?;:—`
- NFD-разложение и удаление диакритик `̀-ͯ`
- схлопывание пробелов и trim

Если опция `useNormalization = false` — шаг пропускается.

### Шаг 3: Поиск в Admin Dictionary (progress → 55)

**Процессор:** [DictionaryProcessor](../src/markup-engine/dictionary/dictionary.processor.ts)

Запрашивает `DictionaryService.findWords(words)` и создаёт `TokenAnalysis` (`source = ADMIN`, `isPrimary = true`) для токенов, у которых ещё нет анализа и нашлась лемма.

### Шаг 4: Поиск в Dictionary Cache (progress → 70)

**Процессор:** [DictionaryCacheProcessor](../src/markup-engine/dictionary-cache/dictionary-cache.processor.ts)

Среди оставшихся слов ищет совпадения в `DictionaryCache`. Создаёт `TokenAnalysis` с `source = CACHE`.

### Шаг 5: Online Dictionary (progress → 80)

**Процессор:** [OnlineDictionaryProcessor](../src/markup-engine/online-dictionary/online-dictionary.processor.ts)

Для оставшихся слов вызывает внешний словарь `OnlineDictionaryService.lookupWord(word, language)` с ограничением `pLimit(5)`. Найденные слова:
- кэшируются в `DictionaryCache` (batch insert),
- получают `TokenAnalysis` (`source = ONLINE`, `lemmaId = null` — внешний словарь даёт только перевод).

### Шаг 6: Учёт неизвестных слов (progress → 90)

**Процессор:** [UnknownWordProcessor](../src/markup-engine/unknown-word/unknown-word.processor.ts)

Слова, которые не нашли никем, заносятся/обновляются в таблице `UnknownWord`:
- новые — `createMany` с `seenCount = count(в этом тексте)`,
- существующие — массовый `UPDATE` инкрементом `seenCount`, обновлением `lastSeen` и `lastTextId`.

Также есть `recordFromLookup(normalized, tokenId?, textId?)` — для записи неизвестных слов при ручном lookup из ридера.

Если опция `useMorphAnalysis = false` — шаги 3–6 целиком пропускаются и progress сразу переводится на 90.

### Шаг 7: Vocabulary index (progress → 100)

В `TextVocabulary` записываются все уникальные `normalized` слова версии. Затем:
- `text_token.vocabId` заполняется raw-SQL-апдейтом (по `(versionId, normalized)`),
- для каждой строки `TextVocabulary` подтягиваются `lemmaId` и `translation` из primary-анализа токенов (используется первая `headword` леммы).

### Шаг 8: Финализация

- `TextProcessingVersion`: `status = COMPLETED`, `progress = 100`, `isCurrent = true`, `durationMs = …`.
- Все остальные версии этого текста получают `isCurrent = false`.
- `Text.processingStatus = COMPLETED`, `processingProgress = 100`, `processingError = null`.
- SSE-событие `status_change` с `COMPLETED`.

При исключении в любой точке — версия переводится в `status = ERROR` (`errorMessage` сохраняется), текст — в `processingStatus = ERROR`, эмитится событие `ERROR`. Логи буферизуются и пишутся в `TextVersionLog` пакетом.

### Морфологический анализ (отдельная утилита)

[MorphologyService.analyze](../src/markup-engine/morphology/morphology.service.ts) используется отдельно (например, при ручном lookup) и пробует:

1. прямой поиск в `MorphForm` по нормализованной форме и языку,
2. снятие падежных суффиксов (`MorphologyRuleEngine.stripSuffix`),
3. определение множественного числа (`detectPlural`),
4. определение глагольной формы (`detectVerb`).

Возвращает `MorphForm | Lemma | null`.

---

## Формат TipTap JSON

Контент страниц хранится в формате TipTap — это JSON структура rich-text редактора. Пример:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Со " },
        { "type": "text", "marks": [{ "type": "bold" }], "text": "бусулба нохчи" },
        { "type": "text", "text": " ву." }
      ]
    }
  ]
}
```

Валидация на бэкенде — кастомный декоратор [IsTiptapDoc](../src/text/dto/tiptap-doc.validator.ts):
- корневой узел `{ type: "doc", content?: [] }`,
- глубина дерева ≤ 30,
- текстовые узлы: `{ type: "text", text: string, marks?: [] }`.

Параллельно с `contentRich` в каждой странице хранится `contentRaw` — сырой текст без разметки, который использует токенизатор.

---

## Версионирование обработки

Каждый раз когда текст переобрабатывается (например, улучшились правила морфологии), создаётся новая запись `TextProcessingVersion`. Это позволяет:
- Отслеживать историю обработки и метрики (`durationMs`, `progress`, `status`, `errorMessage`).
- Не трогать токены прежних версий: новые токены пишутся под новый `versionId`.
- Откатываться на любую завершённую версию через `POST /api/admin/texts/:id/versions/:versionId/restore`.
- Перезапускать упавшие версии через `POST /api/admin/texts/:id/versions/:versionId/retry`.

Активная версия маркируется флагом `isCurrent = true`; во всех публичных эндпоинтах `wordCount` и токены берутся из последней версии (`order by version desc`).

---

## Admin endpoints (кратко)

Полный CRUD по текстам — в [admin-texts.controller.ts](../src/admin/text/admin-texts.controller.ts). Все ручки требуют `PermissionCode.CAN_EDIT_TEXTS`.

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/texts/stats` | Статистика библиотеки: `totalCount`, `publishedCount`, `draftCount`, `archivedCount`, `processingCount`, `errorCount`, рост за месяц |
| GET | `/api/admin/texts` | Список с фильтрами `search/level/tagId/status/sortBy/sortOrder/page/limit` |
| POST | `/api/admin/texts` | Создать текст (страницы + теги + флаги обработки) |
| GET | `/api/admin/texts/:id` | Карточка с pages, tags, tokenCount, latestVersion |
| PATCH | `/api/admin/texts/:id` | Частичное обновление (включая страницы и `status: draft/published/archived`) |
| DELETE | `/api/admin/texts/:id` | Удаление (cascade) |
| POST | `/api/admin/texts/bulk/publish` | Массовая публикация по `ids[]` |
| POST | `/api/admin/texts/bulk/unpublish` | Массовый перевод в черновики |
| POST | `/api/admin/texts/bulk/tokenize` | Массовый запуск токенизации |
| POST | `/api/admin/texts/bulk/delete` | Массовое удаление |
| POST | `/api/admin/texts/bulk-import` | Импорт массива текстов из JSON (per-item статусы) |
| GET | `/api/admin/texts/:id/versions` | История версий обработки (`?status=...`) |
| GET | `/api/admin/texts/:id/versions/:versionId` | Детали версии + per-page stats + журнал |
| POST | `/api/admin/texts/:id/versions/:versionId/restore` | Сделать версию активной (`isCurrent`) |
| POST | `/api/admin/texts/:id/versions/:versionId/retry` | Перезапуск с настройками версии |
| GET | `/api/admin/texts/:id/versions/:versionId/download` | Дамп версии (metadata + pages + tokens) JSON-файлом |
| GET | `/api/admin/texts/:id/unknown-words` | Неизвестные слова последней версии (`{ word, count }[]`) |
| POST | `/api/admin/texts/:id/process` | Запустить новую обработку (`useNormalization`, `useMorphAnalysis`) |
| Sse | `/api/admin/texts/:id/process/stream` | SSE-поток статуса последней версии (тик ~1.5 c) |
| POST | `/api/admin/texts/:id/publish` | Алиас `status: published` |
| POST | `/api/admin/texts/:id/unpublish` | Алиас `status: draft` |
| POST | `/api/admin/texts/:id/tokenize` | Перетокенизация |
| POST | `/api/admin/texts/:id/cover` | Загрузка обложки (multipart, jpg/png/webp, ≤ 2 МБ) |

---

## Файлы модуля

### Public

| Файл | Описание |
|------|---------|
| [src/text/text.controller.ts](../src/text/text.controller.ts) | HTTP эндпоинты `/api/texts/*` |
| [src/text/text.service.ts](../src/text/text.service.ts) | Бизнес-логика: getTexts, getContinueReading, getBookmarks, getPage, getTextById, getRelatedTexts, toggleBookmark, resetProgress, reportText, getAllTags |
| [src/text/text.module.ts](../src/text/text.module.ts) | Подключает `AuthModule`, `TokenizerModule`, `WordProgressModule` |
| [src/text/dto/get-texts-response.dto.ts](../src/text/dto/get-texts-response.dto.ts) | Swagger DTO ответа `GET /api/texts` |
| [src/text/dto/report-text.dto.ts](../src/text/dto/report-text.dto.ts) | DTO жалобы (`reason`, `comment`) |
| [src/text/dto/tiptap-doc.validator.ts](../src/text/dto/tiptap-doc.validator.ts) | Валидатор `@IsTiptapDoc()` |

### Admin

| Файл | Описание |
|------|---------|
| [src/admin/text/admin-texts.controller.ts](../src/admin/text/admin-texts.controller.ts) | Admin HTTP контроллер `/api/admin/texts/*` |
| [src/admin/text/admin-text.service.ts](../src/admin/text/admin-text.service.ts) | Создание/редактирование/удаление, версии, импорт, обложка |
| [src/admin/text/dto/create.dto.ts](../src/admin/text/dto/create.dto.ts) | DTO создания текста |
| [src/admin/text/dto/update.dto.ts](../src/admin/text/dto/update.dto.ts) | DTO patch + enum `TextStatusUpdate` |
| [src/admin/text/dto/list-query.dto.ts](../src/admin/text/dto/list-query.dto.ts) | Фильтры списка для админки |
| [src/admin/text/dto/process.dto.ts](../src/admin/text/dto/process.dto.ts) | DTO опций обработки |
| [src/admin/text/dto/bulk.dto.ts](../src/admin/text/dto/bulk.dto.ts) | DTO массовых операций (`ids[]`) |
| [src/admin/text/dto/bulk-import.dto.ts](../src/admin/text/dto/bulk-import.dto.ts) | DTO массового импорта |
| [src/admin/text/dto/versions-query.dto.ts](../src/admin/text/dto/versions-query.dto.ts) | DTO фильтра версий |
| [src/admin/tags/admin-tags.controller.ts](../src/admin/tags/admin-tags.controller.ts) | CRUD тегов |
| [src/admin/tags/admin-tags.service.ts](../src/admin/tags/admin-tags.service.ts) | Логика тегов |
| [src/admin/tags/dto/tag.dto.ts](../src/admin/tags/dto/tag.dto.ts) | DTO `CreateTagDto`, `RenameTagDto` |

### Markup engine

| Файл | Описание |
|------|---------|
| [src/markup-engine/tokenizer/tokenizer.service.ts](../src/markup-engine/tokenizer/tokenizer.service.ts) | Регэксп-токенизация со смещениями |
| [src/markup-engine/tokenizer/tokenizer.processor.ts](../src/markup-engine/tokenizer/tokenizer.processor.ts) | Главный конвейер: версии, шаги, журнал, SSE |
| [src/markup-engine/tokenizer/tokenizer.utils.ts](../src/markup-engine/tokenizer/tokenizer.utils.ts) | `normalizeToken()` |
| [src/markup-engine/normalizer/normalizer.service.ts](../src/markup-engine/normalizer/normalizer.service.ts) | Шаг нормализации в БД |
| [src/markup-engine/dictionary/dictionary.service.ts](../src/markup-engine/dictionary/dictionary.service.ts) | Поиск в admin-словаре |
| [src/markup-engine/dictionary/dictionary.processor.ts](../src/markup-engine/dictionary/dictionary.processor.ts) | Применение admin-словаря к версии |
| [src/markup-engine/dictionary-cache/dictionary-cache.service.ts](../src/markup-engine/dictionary-cache/dictionary-cache.service.ts) | API кеша |
| [src/markup-engine/dictionary-cache/dictionary-cache.processor.ts](../src/markup-engine/dictionary-cache/dictionary-cache.processor.ts) | Применение кеша к версии |
| [src/markup-engine/online-dictionary/online-dictionary.service.ts](../src/markup-engine/online-dictionary/online-dictionary.service.ts) | HTTP-клиент внешнего словаря |
| [src/markup-engine/online-dictionary/online-dictionary.processor.ts](../src/markup-engine/online-dictionary/online-dictionary.processor.ts) | Online-lookup и кеширование |
| [src/markup-engine/online-dictionary/translation-parser.ts](../src/markup-engine/online-dictionary/translation-parser.ts) | Парсер перевода |
| [src/markup-engine/morphology/morphology.service.ts](../src/markup-engine/morphology/morphology.service.ts) | Морфо-анализ одного слова |
| [src/markup-engine/morphology/rule-engine.service.ts](../src/markup-engine/morphology/rule-engine.service.ts) | Суффиксы / число / глаголы |
| [src/markup-engine/morphology/morphology-importer.service.ts](../src/markup-engine/morphology/morphology-importer.service.ts) | Импорт правил из админки |
| [src/markup-engine/morphology/morphology-cleaner.service.ts](../src/markup-engine/morphology/morphology-cleaner.service.ts) | Чистка/дедуп правил |
| [src/markup-engine/unknown-word/unknown-word.processor.ts](../src/markup-engine/unknown-word/unknown-word.processor.ts) | Учёт неизвестных слов |
