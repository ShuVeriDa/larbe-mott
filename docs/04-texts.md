# Тексты и обработка

Модули: [src/text/](../src/text/), [src/markup-engine/](../src/markup-engine/)

---

## Что такое "текст" в платформе

Текст — это учебный материал на чеченском или русском языке. Каждый текст:
- Разбит на **страницы** (для постраничного чтения)
- Хранится в формате **TipTap JSON** (rich text редактор)
- Имеет уровень сложности (A1–C2) и язык
- Может иметь **теги** (один или несколько) для категоризации
- После загрузки проходит **конвейер обработки** — каждое слово анализируется

---

## Модель данных

```
Text (title, level, language, author, source, imageUrl)
 ├── TextTag[] → Tag (теги текста)
 └── TextPage[] (страницы в формате TipTap JSON)
      └── TextToken[] (каждое слово с результатом анализа)
           └── TokenAnalysis[] (связь слово → лемма)

Tag (id, name) — глобальный справочник тегов
```

### Поля модели Text

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | UUID | Уникальный идентификатор |
| `title` | string | Название текста |
| `language` | `CHE` \| `RU` \| `AR` \| `EN` | Язык текста |
| `level` | `A1`–`C2` | Уровень сложности (опционально) |
| `author` | string | Автор текста |
| `source` | string? | Источник (опционально) |
| `imageUrl` | string? | URL обложки текста (опционально) |
| `publishedAt` | DateTime? | Дата публикации; `null` = черновик |
| `tags` | Tag[] | Теги текста |

---

## API Endpoints (публичные)

### Обзор

| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| GET | `/api/texts/tags` | Optional | Список всех тегов (для построения фильтров) |
| GET | `/api/texts` | Optional | Список опубликованных текстов с фильтрацией, сортировкой и прогрессом |
| GET | `/api/texts/continue-reading` | Bearer | Тексты в процессе чтения (0 < progress < 100) |
| GET | `/api/texts/:id` | Optional | Текст со всеми страницами и тегами |
| GET | `/api/texts/:id/pages/:pageNumber` | Optional | Одна страница + токены + прогресс |

---

### GET /api/texts/tags

Возвращает список всех тегов. Используется фронтом для построения фильтров в библиотеке.

**Auth:** не требуется.

**Ответ:**
```json
[
  { "id": "uuid-1", "name": "Литература" },
  { "id": "uuid-2", "name": "История" },
  { "id": "uuid-3", "name": "Сказки" }
]
```

---

### GET /api/texts

Возвращает список опубликованных текстов. Поддерживает фильтрацию, сортировку, поиск и прогресс пользователя.

**Auth:** Optional. Прогресс (`progressPercent`, `progressStatus`, `lastOpened`) возвращается только при авторизации.

**Query-параметры:**

| Параметр | Значения | Обязательный | Описание |
|----------|---------|-------------|---------|
| `language` | `CHE` \| `RU` \| `AR` \| `EN` | Нет | Один или несколько (повторить параметр). Без параметра — все языки. |
| `level` | `A1`–`C2` | Нет | Один или несколько (повторить параметр). Без параметра — все уровни. |
| `tagId` | UUID | Нет | Один или несколько тегов (повторить параметр). Возвращает тексты у которых есть хотя бы один из указанных тегов. |
| `status` | `NEW` \| `IN_PROGRESS` \| `COMPLETED` | Нет | Фильтр по статусу прогресса. Работает только с авторизацией. |
| `orderBy` | `newest` \| `oldest` \| `alpha` \| `progress` \| `length` \| `level` | Нет | Сортировка. По умолчанию: `newest`. |
| `search` | string | Нет | Поиск по названию и автору (case-insensitive). |

**Значения `orderBy`:**

| Значение | Описание |
|----------|---------|
| `newest` | Сначала новые (по дате создания) — по умолчанию |
| `oldest` | Сначала старые |
| `alpha` | По алфавиту (A → Я) |
| `progress` | По убыванию прогресса (требует авторизации) |
| `length` | По убыванию количества слов |
| `level` | По уровню сложности (A1 → C2) |

**Значения `status`:**

| Значение | Условие |
|----------|---------|
| `NEW` | `progressPercent === 0` — не начат |
| `IN_PROGRESS` | `0 < progressPercent < 100` — читается |
| `COMPLETED` | `progressPercent >= 100` — завершён |

**Примеры:**
```
GET /api/texts
→ Все тексты, сортировка по дате (новые первые)

GET /api/texts?language=CHE&language=RU
→ Чеченские и русские тексты

GET /api/texts?level=A1&level=A2&orderBy=alpha
→ Тексты уровней A1 и A2, по алфавиту

GET /api/texts?tagId=uuid-1&tagId=uuid-2
→ Тексты с тегом "Литература" или "История"

GET /api/texts?status=IN_PROGRESS&orderBy=progress
→ Тексты в процессе чтения, отсортированные по убыванию прогресса

GET /api/texts?language=RU&level=B1&search=рассказ&orderBy=length
→ Русские тексты B1, содержащие "рассказ", от длинных к коротким
```

**Ответ:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Название текста",
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
      "isNew": false
    }
  ],
  "counts": {
    "total": 12,
    "new": 5,
    "inProgress": 4,
    "completed": 3
  }
}
```

> `readingTime` — примерное время чтения в минутах (`ceil(wordCount / 200)`), минимум 1.
> `counts` отражает статистику по **текущей выборке** (с учётом фильтров language/level/tag/search, но без фильтра status).
> `progressPercent`, `progressStatus`, `lastOpened` — только при авторизации. Без токена: `0`, `"NEW"`, `null`.
> `isNew: true` — если текст опубликован менее 30 дней назад. Возвращается всегда (не требует авторизации).

---

### GET /api/texts/continue-reading

Возвращает тексты, которые пользователь начал, но не дочитал (`0 < progressPercent < 100`). Отсортированы по `lastOpened` — последние открытые первые.

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

> `currentPage` = `ceil(progressPercent / 100 * totalPages)`.

---

### GET /api/texts/:id

Возвращает полный текст со всеми страницами и тегами.

**Auth:** Optional.

**Ответ:**
```json
{
  "id": "uuid",
  "title": "Название текста",
  "level": "B1",
  "language": "RU",
  "author": "Автор",
  "tags": [{ "id": "uuid-1", "name": "Литература" }],
  "pages": [...],
  "progress": 35.5
}
```

---

### GET /api/texts/:id/pages/:pageNumber

Возвращает одну страницу текста с токенами. Используется в ридере: 1 страница = 1 запрос.

**Auth:** Optional. При авторизации обновляет прогресс и логирует событие `OPEN_TEXT`.

**Ответ:**
```json
{
  "id": "uuid",
  "title": "Название текста",
  "level": "B1",
  "language": "RU",
  "contentRich": { "type": "doc", "content": [...] },
  "tokens": [
    { "id": "uuid", "position": 0, "original": "Со", "normalized": "со", "status": "ANALYZED", "vocabId": "uuid" }
  ],
  "progress": 35.5,
  "page": {
    "id": "uuid",
    "pageNumber": 1,
    "contentRich": { "type": "doc", "content": [...] },
    "contentRaw": "Со бусулба нохчи ву."
  }
}
```

---

## Теги

### Что такое тег

Тег — это метка для категоризации текстов. Примеры: «Литература», «Сказки», «История», «Природа».

- Теги создаются администратором через `/api/admin/tags` (глобальный справочник)
- Тексту можно назначить один или несколько тегов
- Теги задаются при **создании текста** и при **редактировании** через `tagIds`
- Удаление тега снимает его со всех текстов автоматически

### Workflow работы с тегами

```
1. Создать теги:  POST /api/admin/tags  { "name": "Литература" }
2. Получить ID:   GET  /api/admin/tags
3. Создать текст: POST /api/admin/texts { ..., "tagIds": ["uuid-1", "uuid-2"] }
4. Изменить теги: PATCH /api/admin/texts/:id { "tagIds": ["uuid-3"] }
5. Фронт фильтрует: GET /api/texts?tagId=uuid-1&tagId=uuid-2
```

---

## Конвейер обработки текста

Когда текст добавляется или обновляется, каждое слово проходит анализ:

### Шаг 1: Токенизация
**Модуль:** [src/markup-engine/tokenizer/](../src/markup-engine/tokenizer/)

Текст разбивается на токены (слова). Для каждого токена сохраняется:
- Позиция в тексте
- Оригинальное написание
- Статус: `ANALYZED` / `AMBIGUOUS` / `NOT_FOUND`

### Шаг 2: Нормализация
**Модуль:** [src/markup-engine/normalizer/](../src/markup-engine/normalizer/)

Слово приводится к нормальной форме для поиска в словаре:
- Приводится к нижнему регистру
- Убираются знаки препинания
- Специальная обработка чеченских символов

### Шаг 3: Поиск в словаре (3 источника, по порядку)
**Модуль:** [src/markup-engine/dictionary/](../src/markup-engine/dictionary/)

```
1. Admin Dictionary    — статьи, добавленные вручную администратором
        │ не нашли
        ▼
2. Dictionary Cache    — кешированные результаты предыдущих поисков
        │ не нашли
        ▼
3. Online Dictionary   — внешний API словаря (HTTP запрос)
```

Если нашли на любом шаге — сохраняем результат в кеш, выходим.

### Шаг 4: Морфологический анализ
**Модуль:** [src/markup-engine/morphology/](../src/markup-engine/morphology/)

Если словарь не дал результата, пробуем морфологию:

```
Слово "книги"
    │
    ▼ Суффиксный анализ
    │
    ├── Падежный анализ (окончания существительных)
    ├── Анализ числа (единственное/множественное)
    ├── Глагольные формы (время, лицо)
    └── Правила из MorphologyRule в БД
    │
    ▼
  Лемма "книга" + форма "родительный падеж"
```

### Шаг 5: Неизвестное слово
**Модуль:** [src/markup-engine/unknown-word/](../src/markup-engine/unknown-word/)

Если ни один метод не дал результата — слово сохраняется в `UnknownWord`.
Администраторы могут просматривать эти слова и добавлять их в словарь.

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
        { "type": "text", "text": "Нохчийн мотт" }
      ]
    }
  ]
}
```

---

## Версионирование обработки

Каждый раз когда текст переобрабатывается (например, улучшились правила морфологии), создаётся новая запись `TextProcessingVersion`. Это позволяет:
- Отслеживать историю обработки
- Не трогать уже обработанные данные

---

## Файлы модуля

| Файл | Описание |
|------|---------|
| [text.service.ts](../src/text/text.service.ts) | Логика работы с текстами (getTexts, getContinueReading, getAllTags) |
| [text.controller.ts](../src/text/text.controller.ts) | HTTP эндпоинты |
| [admin/text/admin-text.service.ts](../src/admin/text/admin-text.service.ts) | Создание, редактирование, удаление текстов (admin) |
| [admin/tags/admin-tags.service.ts](../src/admin/tags/admin-tags.service.ts) | CRUD тегов (admin) |
| [markup-engine/tokenizer/](../src/markup-engine/tokenizer/) | Токенизация |
| [markup-engine/normalizer/](../src/markup-engine/normalizer/) | Нормализация |
| [markup-engine/dictionary/](../src/markup-engine/dictionary/) | Поиск в словаре |
| [markup-engine/morphology/morphology.service.ts](../src/markup-engine/morphology/morphology.service.ts) | Морфологический анализ |
| [markup-engine/unknown-word/](../src/markup-engine/unknown-word/) | Неизвестные слова |
