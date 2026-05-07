# Словарь

Модули: [src/dictionary/](../src/dictionary/), [src/words/](../src/words/), [src/token/](../src/token/), [src/cache/](../src/cache/), [src/markup-engine/dictionary/](../src/markup-engine/dictionary/), [src/markup-engine/dictionary-cache/](../src/markup-engine/dictionary-cache/), [src/markup-engine/online-dictionary/](../src/markup-engine/online-dictionary/)

---

## Три уровня словарной системы

```
1. Системный (админский) словарь
   └── DictionaryEntry → Headword → Lemma
                                      ├── MorphForm[]   (формы слова)
                                      ├── Sense[]       (значения)
                                      │     └── Example[] (примеры)
                                      └── WordRelation[] (синонимы / антонимы / однокоренные)
   └── Ведётся администраторами, содержит транслитерацию, аудио, частотность, CEFR-уровень

2. Кэш онлайн-словаря (DictionaryCache)
   └── Уникальный ключ — normalized
   └── Кэширует ответы внешнего онлайн-словаря по нормализованной форме
   └── Может содержать lemmaId, если ответ удалось привязать к существующей лемме

3. Личный словарь пользователя
   └── UserDictionaryEntry  (слова пользователя, опционально привязаны к Lemma)
   └── UserDictionaryFolder (папки — Premium функция)
   └── WordContext          (последние реальные контексты употребления у пользователя)
```

Дополнительно: `TokenInfoCache` (Redis) ускоряет повторные клики по токенам.

---

## Как пользователь взаимодействует со словарём

### Клик на слово в тексте

```
Клик на токен (tokenId)
        |
        v
POST /api/words/lookup  { tokenId }
        |
        v  TokenService.getTokenInfo
  Redis cache (token-info:id) ── hit ──> result
        |  miss
        v
  Redis cache (token-info:vn) ── hit ──> result
        |  miss
        v
  Prisma: TextToken + TokenAnalysis + Lemma + Headword(rawTranslate)
        |
        v
  WordsService обогащает: examples, userStatus, inDictionary
```

Если у токена нет данных, `WordsService` падает в цепочку `WordLookupByWordService`.

### Поиск по введённому слову

```
POST /api/words/lookup-by-word  { normalized }
        |
        v  WordLookupByWordService.lookup
  1. Админский словарь (Lemma по normalized)
  2. DictionaryCache
  3. Онлайн-словарь (HTTP)
  4. Морфология (MorphForm → Lemma)
        |
        v
  { translation, tranAlt, grammar, baseForm }
```

Если ничего не найдено — слово тихо записывается в `UnknownWord`, а у пользователя
создаётся `UserEvent { type: FAIL_LOOKUP }`.

---

## API Endpoints

### Слова и токены

| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| POST | `/api/words/lookup` | Optional | Перевод по `tokenId` — основной API клика по слову в тексте |
| POST | `/api/words/lookup-by-word` | Bearer | Перевод по строке слова через цепочку источников |
| GET  | `/api/words/:lemmaId/examples` | Bearer | Корпусные примеры (до 10 сниппетов из разных текстов) |
| GET  | `/api/words/:lemmaId/related` | Bearer | Связанные слова (синонимы / антонимы / однокоренные) |
| POST | `/api/words/parts-of-speech/analyze` | Optional | Разбор частей речи в чеченском тексте |
| GET  | `/api/tokens/:id` | Optional | То же, что `/words/lookup`, но через GET по id токена |

### Личный словарь

| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| GET    | `/api/dictionary` | Bearer | Список записей с фильтрами и пагинацией |
| GET    | `/api/dictionary/stats` | Bearer | Сводная статистика словаря |
| GET    | `/api/dictionary/due` | Bearer | Слова к повторению по SM-2 |
| GET    | `/api/dictionary/:id` | Bearer | Полная карточка записи (lemma, senses, related, SM-2, история) |
| GET    | `/api/dictionary/:id/neighbors` | Bearer | Соседние записи (prev/next) в текущем фильтре |
| POST   | `/api/dictionary` | Bearer | Добавить слово в словарь |
| PATCH  | `/api/dictionary/:id` | Bearer | Обновить запись (статус, уровень, папка, repetitionCount) |
| DELETE | `/api/dictionary/:id` | Bearer | Удалить запись |

### Папки словаря

| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| GET    | `/api/dictionary/folders` | Bearer | Папки пользователя со статистикой |
| GET    | `/api/dictionary/folders/summary` | Bearer | Сводка для страницы папок |
| GET    | `/api/dictionary/folders/:id` | Bearer | Одна папка с разбивкой по статусам |
| POST   | `/api/dictionary/folders` | Premium | Создать папку |
| PATCH  | `/api/dictionary/folders/:id` | Premium | Обновить папку (имя, описание, цвет, иконка, sortOrder) |
| PATCH  | `/api/dictionary/folders/reorder` | Premium | Переупорядочить все папки |
| PATCH  | `/api/dictionary/entries/bulk-assign` | Premium | Массовая привязка записей к папкам |
| DELETE | `/api/dictionary/folders/:id` | Premium | Удалить папку |

Чтение папок открыто всем авторизованным пользователям; создание/изменение/удаление
требуют Premium и проверяются по `plan.limits.maxFolders` (`-1` — безлимит, `0` —
запрещено).

---

## POST /api/words/lookup

**Тело запроса:**
```json
{ "tokenId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Ответ:**
```json
{
  "lemmaId": "uuid",
  "translation": "язык",
  "tranAlt": "речь, наречие",
  "grammar": "существительное",
  "baseForm": "мотт",
  "forms": ["мотт", "моттан", "моттана"],
  "tags": ["существительное", "именительный"],
  "examples": [
    { "text": "Нохчийн мотт", "translation": "Чеченский язык" }
  ],
  "userStatus": "LEARNING",
  "inDictionary": true,
  "dictionaryEntryId": "entry-uuid"
}
```

| Поле | Описание |
|------|---------|
| `lemmaId` | ID леммы или `null` |
| `translation` | Основной перевод (после `parseTranslation` извлечения main) |
| `tranAlt` | Альтернативный перевод / уточнение |
| `grammar` | Часть речи леммы |
| `baseForm` | Базовая форма |
| `forms` | Все морфологические формы леммы из БД |
| `tags` | `[partOfSpeech, grammarTag]` — POS леммы и тег формы текущего токена |
| `examples` | До 10 примеров из `Sense.examples` |
| `userStatus` | `NEW`, `LEARNING`, `KNOWN` или `null` (из `UserWordProgress`) |
| `inDictionary` | `true`, если слово уже добавлено в личный словарь |
| `dictionaryEntryId` | ID записи в личном словаре (для удаления), или `null` |

При первом обращении токен сохраняется в Redis по двум ключам:
`token-info:id:<tokenId>` и `token-info:vn:<versionId>:<normalized>` (TTL 24 ч).
Параллельно (fire-and-forget): `WordProgressService.registerClick`,
`UserEvent { CLICK_WORD }`, `WordProgressService.saveContext` (создаёт `WordContext`).

Лимит `translationsPerDay` берётся из `plan.limits.translationsPerDay`
(дефолт 50, `-1` — безлимит). Превышение → `403 Forbidden`.

---

## POST /api/words/lookup-by-word

**Тело запроса:**
```json
{ "normalized": "моттана" }
```

**Ответ:**
```json
{
  "translation": "языку",
  "tranAlt": "речи",
  "grammar": "существительное",
  "baseForm": "мотт"
}
```

Цепочка источников: `admin → cache → online → morphology`. Источник записывается
в `UserEvent.metadata.source` как `lookup_by_word:<source>`. Лимит `translationsPerDay`
действует так же, как в `/lookup`.

---

## GET /api/words/:lemmaId/examples — ответ

```json
[
  {
    "word": "мотт",
    "snippet": "...нохчийн мотт — тхайн ненан мотт...",
    "text": { "id": "text-uuid", "title": "Нохчийн мотт", "language": "CHE" }
  }
]
```

Берутся `TokenAnalysis` (где `isPrimary = true`) для леммы, у каждого токена
извлекается окно ±6 токенов из `TextToken`. Дедупликация — один пример на текст,
максимум 10.

---

## GET /api/words/:lemmaId/related — ответ

```json
[
  {
    "type": "SYNONYM",
    "lemmaId": "uuid",
    "baseForm": "къамел",
    "transliteration": "qamel",
    "level": "A2",
    "partOfSpeech": "существительное",
    "translation": "речь"
  }
]
```

Поиск симметричный: проверяются обе стороны `WordRelation` (по `lemmaId` и
`relatedLemmaId`), результаты дедуплицируются по `(relatedLemmaId, type)`.
Перевод подтягивается из `DictionaryEntry.rawTranslate` через `Headword.isPrimary`.

---

## POST /api/words/parts-of-speech/analyze

**Тело запроса:**
```json
{ "text": "Со тахана дешар доьшу." }
```

**Ответ:**
```json
{
  "text": "Со тахана дешар доьшу.",
  "totalTokens": 5,
  "analyzedWords": 4,
  "tokens": [
    {
      "token": "Со",
      "normalized": "со",
      "isWord": true,
      "primaryPartOfSpeech": "PRONOUN",
      "primaryPartOfSpeechChechen": "Ц1ерметдош",
      "grammaticalClass": null,
      "grammaticalClassForm": null,
      "grammaticalNumber": "SG",
      "grammaticalNumberChechen": "цхьаллин терахь",
      "candidates": [
        { "code": "PRONOUN", "chechenName": "Ц1ерметдош", "score": 0.92, "source": "rule", "reasons": ["..."] }
      ]
    }
  ]
}
```

Источники кандидатов: словарь (`Lemma`, `MorphForm`) и набор эвристик
(префиксы, суффиксы, классные показатели «ву/ду/ю/йу/бу», списки местоимений,
числительных, наречий).

---

## GET /api/dictionary — query-параметры

| Параметр | Тип | Описание |
|----------|-----|---------|
| `status` | `WordStatus` | `NEW` / `LEARNING` / `KNOWN` |
| `cefrLevel` | `Level` | `A1` / `A2` / `B1` / `B2` |
| `folderId` | UUID | Только записи указанной папки |
| `noFolder` | bool | Только записи без папки (приоритетнее `folderId`) |
| `sort` | enum | `added` (default) / `alpha` / `review` / `status` |
| `search` | string | Подстрока по `word`, `translation`, `normalized` |
| `page` | int | Номер страницы, ≥ 1 |
| `limit` | int | Размер страницы (1..50, default 20) |

**Ответ:**
```json
{
  "items": [
    {
      "id": "entry-uuid",
      "word": "мотт",
      "normalized": "мотт",
      "translation": "язык",
      "addedAt": "2026-03-01T10:00:00Z",
      "updatedAt": "2026-03-15T10:00:00Z",
      "learningLevel": "LEARNING",
      "cefrLevel": "A1",
      "repetitionCount": 3,
      "folderId": "folder-uuid",
      "lemmaId": "lemma-uuid",
      "userId": "user-uuid",
      "folder": { "id": "folder-uuid", "name": "Базовый A1" },
      "lemma": {
        "id": "lemma-uuid",
        "baseForm": "мотт",
        "partOfSpeech": "существительное",
        "morphForms": [
          { "form": "мотт", "grammarTag": "именительный" },
          { "form": "моттан", "grammarTag": "родительный" }
        ],
        "headwords": [
          {
            "entry": {
              "senses": [
                {
                  "definition": "язык, речь",
                  "examples": [
                    { "text": "Нохчийн мотт", "translation": "Чеченский язык" }
                  ]
                }
              ]
            }
          }
        ],
        "wordContexts": [
          {
            "textId": "text-uuid",
            "snippet": "...Нохчийн мотт — тхайн халкъан мотт...",
            "text": { "title": "Нохчийн мотт — мечан историй" }
          }
        ]
      },
      "nextReview": "2026-03-28T10:00:00Z",
      "wordProgressStatus": "LEARNING",
      "progressPercent": 40
    }
  ],
  "total": 149,
  "page": 1,
  "limit": 20
}
```

| Поле | Описание |
|------|---------|
| `nextReview` | Из `UserWordProgress.nextReview` (или `null`) |
| `wordProgressStatus` | Статус из SM-2 (может отличаться от `learningLevel`) |
| `progressPercent` | 0..100, рассчитан как `min(100, round(interval/21*100))`, KNOWN = 100 |
| `lemma.morphForms` | Все формы с `grammarTag` |
| `lemma.headwords[].entry.senses` | Первые 3 значения, по 2 примера в каждом |
| `lemma.wordContexts` | Последний контекст пользователя |

Сортировка `review` и `status` выполняется на JS уже после выборки страницы.

---

## GET /api/dictionary/:id — карточка записи

```json
{
  "id": "entry-uuid",
  "word": "мотт",
  "normalized": "мотт",
  "translation": "язык",
  "learningLevel": "LEARNING",
  "cefrLevel": "A1",
  "addedAt": "2026-03-01T10:00:00Z",
  "folder": { "id": "folder-uuid", "name": "Базовый A1", "color": "#2254d3" },
  "lemma": {
    "id": "lemma-uuid",
    "baseForm": "мотт",
    "partOfSpeech": "существительное",
    "frequency": 1250,
    "transliteration": "mott",
    "audioUrl": "https://.../mott.mp3",
    "declensionClass": "B-class",
    "morphForms": [
      {
        "form": "моттан",
        "grammarTag": "родительный",
        "translation": "языка",
        "gramCase": "GEN",
        "gramNumber": "SG",
        "caseLabel": "Родительный"
      }
    ],
    "wordContexts": [
      {
        "id": "ctx-uuid",
        "snippet": "...нохчийн мотт...",
        "seenAt": "2026-04-20T08:00:00Z",
        "text": { "id": "text-uuid", "title": "Нохчийн мотт", "level": "A1" }
      }
    ]
  },
  "senses": [
    {
      "id": "sense-uuid",
      "definition": "язык, речь",
      "notes": null,
      "examples": [
        {
          "id": "ex-uuid",
          "text": "Нохчийн мотт",
          "translation": "Чеченский язык",
          "origin": "Нохчийн мотт — мечан историй",
          "sourceTextId": "text-uuid"
        }
      ]
    }
  ],
  "related": [
    {
      "type": "SYNONYM",
      "lemmaId": "uuid",
      "baseForm": "къамел",
      "transliteration": "qamel",
      "level": "A2"
    }
  ],
  "sm2": {
    "status": "LEARNING",
    "seenCount": 12,
    "repetitions": 2,
    "lastSeen": "2026-04-25T10:00:00Z",
    "nextReview": "2026-04-30T10:00:00Z",
    "easeFactor": 2.5,
    "interval": 6,
    "targetRepetitions": 4
  },
  "progressPercent": 28,
  "reviewHistory": {
    "totalReviews": 5,
    "successCount": 4,
    "logs": [
      {
        "id": "log-uuid",
        "quality": 4,
        "correct": true,
        "intervalBefore": 1,
        "intervalAfter": 6,
        "intervalDelta": 5,
        "createdAt": "2026-04-25T10:00:00Z"
      }
    ]
  }
}
```

`senses` собираются из всех `Headword.entry.senses`, дедуплицируются по id. Поле
`origin` — это `Example.source.title` или свободная подпись `Example.sourceText`.

---

## GET /api/dictionary/:id/neighbors — ответ

```json
{
  "prev": { "id": "uuid", "word": "лам" },
  "next": { "id": "uuid", "word": "нана" },
  "position": 12,
  "total": 149
}
```

Принимает те же query-параметры, что `GET /api/dictionary`, чтобы вычислить
prev/next в текущем фильтре.

---

## GET /api/dictionary/stats — ответ

```json
{
  "total": 149,
  "byLevel": { "NEW": 18, "LEARNING": 19, "KNOWN": 112 },
  "totalRepetitions": 340,
  "dueCount": 14,
  "masteryPercent": 75
}
```

| Поле | Описание |
|------|---------|
| `total` | Всего слов в словаре |
| `byLevel` | Разбивка по `learningLevel` |
| `totalRepetitions` | Сумма `repetitionCount` |
| `dueCount` | Записей `UserWordProgress` со `status != KNOWN` и `nextReview <= now` (или `null`) |
| `masteryPercent` | `round(KNOWN / total * 100)` |

---

## GET /api/dictionary/due — ответ

```json
{
  "count": 14,
  "nextScheduledAt": "2026-04-30T18:00:00Z",
  "words": [
    {
      "lemmaId": "lemma-uuid",
      "nextReview": "2026-04-29T10:00:00Z",
      "status": "LEARNING",
      "baseForm": "лам",
      "partOfSpeech": "существительное",
      "dictionaryEntry": {
        "id": "entry-uuid",
        "word": "лам",
        "translation": "гора",
        "learningLevel": "LEARNING",
        "cefrLevel": "A2",
        "folderId": "folder-uuid"
      }
    }
  ]
}
```

| Поле | Описание |
|------|---------|
| `count` | Слов к повторению прямо сейчас |
| `nextScheduledAt` | Ближайший `nextReview > now` |
| `words[].dictionaryEntry` | Запись из личного словаря (`null`, если слово не добавлено) |

---

## POST /api/dictionary — тело запроса

```json
{
  "tokenId": "uuid",
  "word": "машина",
  "translation": "car",
  "folderId": "folder-uuid",
  "cefrLevel": "A1"
}
```

Логика:
- Если передан `tokenId`, `word` / `translation` берутся из `TokenService.getTokenInfo`,
  плюс автоматически проставляются `lemmaId` и `textId`.
- Если `tokenId` не передан, обязательны и `word`, и `translation`.
- Перед созданием проверяется `plan.limits.wordsInDictionary` (дефолт 500, `-1` — безлимит).
- При совпадении `(userId, normalized)` возвращается `409 Conflict`.
- В фоне создаётся `UserEvent { type: ADD_TO_DICTIONARY }` с метаданными `entryId`, `lemmaId`, `textId`.

---

## PATCH /api/dictionary/:id — тело запроса

```json
{
  "learningLevel": "KNOWN",
  "cefrLevel": "A1",
  "folderId": "folder-uuid",
  "repetitionCount": 5
}
```

`folderId: null` отвязывает запись от папки. При смене `learningLevel` сервис
вызывает `WordProgressService.setWordStatus`, чтобы синхронизировать SM-2 расписание.

---

## GET /api/dictionary/folders — ответ

```json
[
  {
    "id": "folder-uuid",
    "userId": "user-uuid",
    "name": "Базовый A1",
    "description": "Слова для уровня A1",
    "color": "#2254d3",
    "icon": "book",
    "sortOrder": 0,
    "updatedAt": "2026-04-25T10:00:00Z",
    "wordCounts": { "NEW": 5, "LEARNING": 12, "KNOWN": 37 },
    "total": 54,
    "progress": 68,
    "lastModified": "2026-04-25T10:00:00Z"
  }
]
```

`progress` — процент `KNOWN` от всех слов в папке. `lastModified` — максимум
`addedAt`/`updatedAt` среди слов папки.

---

## GET /api/dictionary/folders/summary — ответ

```json
{
  "foldersCount": 4,
  "wordsInFolders": 86,
  "knownWords": 112,
  "wordsWithoutFolder": 63,
  "maxFolders": -1
}
```

`maxFolders` берётся из `plan.limits.maxFolders` (или, как fallback, выводится из
булевого `dictionaryFolders`). `-1` — безлимит, `0` — папки запрещены.

---

## POST /api/dictionary/folders — тело запроса

```json
{
  "name": "Транспорт",
  "description": "Слова на тему транспорта",
  "color": "#2254d3",
  "icon": "car"
}
```

Имя должно быть уникальным в пределах пользователя. Превышение `maxFolders` →
`403 Forbidden`.

---

## PATCH /api/dictionary/folders/reorder — тело запроса

```json
{
  "orderedIds": ["folder-1", "folder-2", "folder-3"]
}
```

Должен содержать ровно все папки пользователя без дубликатов. Индекс в массиве
становится новым `sortOrder`.

---

## PATCH /api/dictionary/entries/bulk-assign — тело запроса

```json
{
  "assignments": [
    { "id": "entry-1", "folderId": "folder-uuid" },
    { "id": "entry-2", "folderId": null }
  ]
}
```

Все записи и папки проверяются на принадлежность пользователю, операция
выполняется одной транзакцией. Используется кнопкой «Распределить все» на странице
папок.

---

## Структура словарной статьи

```
DictionaryEntry (словарная статья)
 ├── rawWord, rawWordAlt, rawTranslate, notes, source
 ├── Headword[] (заглавные слова — разные написания, isPrimary)
 │     └── Lemma  (опционально)
 ├── Sense[] (значения)
 │     └── Example[] (text, translation, sourceText|sourceTextId)
 └── MorphForm[] (формы, могут принадлежать конкретной DictionaryEntry)

Lemma (отдельная сущность, может существовать без DictionaryEntry)
 ├── baseForm, normalized, language, partOfSpeech, frequency
 ├── transliteration, audioUrl, declensionClass, level, domain
 ├── headwords (обратная связь)
 ├── morphForms[] (form, normalized, grammarTag, translation, gramCase, gramNumber)
 ├── relations / inverseRelations (WordRelation: SYNONYM | ANTONYM | DERIVED | FAMILY)
 ├── userDictionaryEntries[]
 ├── wordProgress[] (UserWordProgress)
 ├── wordContexts[] (WordContext)
 ├── tokenAnalyses[] (TokenAnalysis)
 ├── deckCards[], reviewLogs[]
 └── feedbackThreads[], feedbackReactions[]
```

### Пример

```
DictionaryEntry: rawWord="мотт", rawTranslate="язык, речь"
  Headword: text="мотт", isPrimary=true → Lemma "мотт"
  Lemma "мотт"
    partOfSpeech: существительное
    frequency:    1250
    MorphForm:    мотт (NOM/SG), моттан (GEN/SG), моттана (DAT/SG), ...
    Sense[0]:     "язык (часть тела)"
      Example:    "Цуьнан мотт лазабелла" — "У него болит язык"
    Sense[1]:     "язык, речь, наречие"
      Example:    "Нохчийн мотт"          — "Чеченский язык"
    WordRelation: SYNONYM → "къамел", FAMILY → "моттаниг"
```

---

## Личный словарь пользователя

Возможности:
1. Добавить слово в словарь (вручную или через `tokenId` из текста).
2. Указать CEFR-уровень `A1` / `A2` / `B1` / `B2`.
3. Организовать слова по папкам (создание/редактирование — Premium).
4. Менять статус: `NEW` / `LEARNING` / `KNOWN` (синхронизируется с SM-2).
5. Слова из личного словаря участвуют в SM-2 повторении (`UserWordProgress`,
   `UserReviewLog`).

Ограничения берутся из активной подписки (`Subscription.plan.limits`):
`wordsInDictionary`, `maxFolders` / `dictionaryFolders`, `translationsPerDay`.

---

## Кэширование

- **TokenInfoCache** ([src/cache/token-info-cache.service.ts](../src/cache/token-info-cache.service.ts)) — Redis-кэш ответов
  `TokenService.getTokenInfo`. Два ключа на запись: `token-info:id:<tokenId>` и
  `token-info:vn:<versionId>:<normalized>`, TTL 24 часа. Инвалидация — при
  правках токена в админке.
- **DictionaryCache** (модель Prisma + [src/markup-engine/dictionary-cache/](../src/markup-engine/dictionary-cache/)) —
  персистентный кэш ответов онлайн-словаря, ключ — `normalized`.

---

## Файлы модуля

### Публичный API

| Файл | Описание |
|------|---------|
| [src/dictionary/dictionary.controller.ts](../src/dictionary/dictionary.controller.ts) | Контроллер `/api/dictionary` (записи + папки) |
| [src/dictionary/dictionary.service.ts](../src/dictionary/dictionary.service.ts) | Логика личного словаря, SM-2 синхронизация, статистика, due |
| [src/dictionary/folders.service.ts](../src/dictionary/folders.service.ts) | CRUD папок, reorder, summary, лимиты Premium |
| [src/dictionary/dictionary.module.ts](../src/dictionary/dictionary.module.ts) | Модуль |
| [src/dictionary/dto/](../src/dictionary/dto/) | DTO: get/create/update entries, folders, reorder, bulk-assign |

### Слова и токены

| Файл | Описание |
|------|---------|
| [src/words/words.controller.ts](../src/words/words.controller.ts) | `/api/words/lookup`, `/lookup-by-word`, `/:lemmaId/examples`, `/:lemmaId/related`, `/parts-of-speech/analyze` |
| [src/words/words.service.ts](../src/words/words.service.ts) | Сборка ответа lookup, related |
| [src/words/word-lookup-by-word.service.ts](../src/words/word-lookup-by-word.service.ts) | Цепочка admin → cache → online → morphology |
| [src/words/word-examples.service.ts](../src/words/word-examples.service.ts) | Корпусные примеры (TokenAnalysis + TextToken) |
| [src/words/word-pos.service.ts](../src/words/word-pos.service.ts) | Анализ частей речи (словарь + эвристики) |
| [src/words/dto/](../src/words/dto/) | `lookup.dto`, `lookup-by-word.dto`, `analyze-pos.dto` |
| [src/token/token.controller.ts](../src/token/token.controller.ts) | `/api/tokens/:id` |
| [src/token/token.service.ts](../src/token/token.service.ts) | Поиск по `tokenId`, два уровня Redis-кэша, SM-2 хуки |
| [src/cache/token-info-cache.service.ts](../src/cache/token-info-cache.service.ts) | Redis-кэш ответов `getTokenInfo` |

### Markup-engine (внутренние сервисы словаря)

| Файл | Описание |
|------|---------|
| [src/markup-engine/dictionary/dictionary.service.ts](../src/markup-engine/dictionary/dictionary.service.ts) | Поиск по админскому словарю (Lemma) |
| [src/markup-engine/dictionary/dictionary.processor.ts](../src/markup-engine/dictionary/dictionary.processor.ts) | Обработчик стадии разметки |
| [src/markup-engine/dictionary-cache/dictionary-cache.service.ts](../src/markup-engine/dictionary-cache/dictionary-cache.service.ts) | Работа с `DictionaryCache` |
| [src/markup-engine/dictionary-cache/dictionary-cache.processor.ts](../src/markup-engine/dictionary-cache/dictionary-cache.processor.ts) | Обработчик стадии разметки |
| [src/markup-engine/online-dictionary/online-dictionary.service.ts](../src/markup-engine/online-dictionary/online-dictionary.service.ts) | HTTP-клиент онлайн-словаря |
| [src/markup-engine/online-dictionary/translation-parser.ts](../src/markup-engine/online-dictionary/translation-parser.ts) | Парсер перевода в `{ main, alt }` |
| [src/markup-engine/online-dictionary/online-dictionary.processor.ts](../src/markup-engine/online-dictionary/online-dictionary.processor.ts) | Обработчик стадии разметки |

### Prisma-модели

| Модель | Описание |
|--------|---------|
| `DictionaryEntry` | Системная словарная статья |
| `Headword` | Заглавные слова статьи, привязка к `Lemma` |
| `Lemma` | Лемма с грамматикой, частотностью, аудио, транслитерацией |
| `MorphForm` | Морфологические формы леммы (gramCase, gramNumber, grammarTag) |
| `Sense` / `Example` | Значения и примеры словарной статьи |
| `WordRelation` | Связи между леммами (SYNONYM / ANTONYM / DERIVED / FAMILY) |
| `DictionaryCache` | Кэш ответов онлайн-словаря по `normalized` |
| `UserDictionaryEntry` | Запись личного словаря пользователя |
| `UserDictionaryFolder` | Папка личного словаря (Premium) |
| `WordContext` | Реальный контекст употребления леммы у пользователя |
