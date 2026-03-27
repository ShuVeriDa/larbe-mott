# Словарь

Модули: [src/dictionary/](../src/dictionary/), [src/words/](../src/words/), [src/token/](../src/token/)

---

## Три уровня словарной системы

```
1. Системный словарь (DictionaryEntry, Lemma, Sense)
   └── Ведётся администраторами
   └── Содержит переводы, примеры, грамматику

2. Кеш словаря (DictionaryCache)
   └── Автоматический кеш запросов к внешнему API
   └── Ускоряет повторные поиски

3. Личный словарь пользователя (UserDictionaryEntry)
   └── Пользователь добавляет слова сам
   └── Организуется по папкам
```

---

## Как пользователь взаимодействует со словарём

### Клик на слово в тексте

Пользователь читает текст и кликает на незнакомое слово:

```
Клик на токен (tokenId)
        │
        ▼
POST /api/words/lookup  { tokenId }
        │
        ▼ (TokenService ищет по цепочке)
  Admin Dict → Cache → Online → Morphology
        │
        ▼
Результат: лемма + переводы + грамматика + статус в словаре
```

### Поиск по введённому слову

```
POST /api/words/lookup-by-word  { normalized }
        │
        ▼
WordLookupByWordService: Admin → Cache → Online → Morphology
        │
        ▼
Лемма + значения + примеры использования
```

---

## API Endpoints

### Слова (клик по слову в тексте)
| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| POST | `/api/words/lookup` | Optional | Перевод по `tokenId` — основной API клика по слову |
| POST | `/api/words/lookup-by-word` | Bearer | Перевод по строке слова (normalized) |
| GET | `/api/words/:lemmaId/examples` | Bearer | Корпусные примеры употребления леммы (до 10 сниппетов) |

**POST /api/words/lookup — тело запроса:**
```json
{ "tokenId": "uuid" }
```

**POST /api/words/lookup — ответ:**
```json
{
  "lemmaId": "uuid",
  "translation": "язык",
  "tranAlt": "речь, наречие",
  "grammar": "существительное",
  "baseForm": "мотт",
  "forms": ["мотт", "моттан", "моттана"],
  "tags": ["существительное", "родительный падеж"],
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
| `translation` | Основной перевод |
| `tranAlt` | Дополнительный перевод / уточнение (или `null`) |
| `grammar` | Часть речи (или `null`) |
| `baseForm` | Базовая форма слова (или `null`) |
| `forms` | Все морфологические формы из БД |
| `tags` | Теги: часть речи + грамматический тег формы |
| `examples` | Примеры из словарных статей (до 10) |
| `userStatus` | Статус слова у пользователя: `NEW`, `LEARNING`, `KNOWN`, или `null` |
| `inDictionary` | `true` если слово уже добавлено в личный словарь |
| `dictionaryEntryId` | ID записи в личном словаре (для удаления), или `null` |

### Личный словарь
| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| GET | `/api/dictionary` | Bearer | Все слова с расширенными данными |
| GET | `/api/dictionary/stats` | Bearer | Статистика словаря |
| GET | `/api/dictionary/due` | Bearer | Слова ожидающие повторения |
| POST | `/api/dictionary` | Bearer | Добавить слово в словарь |
| PATCH | `/api/dictionary/:id` | Bearer | Обновить запись (статус, уровень, папка) |
| DELETE | `/api/dictionary/:id` | Bearer | Удалить из словаря |
| DELETE | `/api/dictionary` | Bearer | Удалить все слова |
| GET | `/api/dictionary/folders` | Premium | Мои папки (с количеством слов) |
| POST | `/api/dictionary/folders` | Premium | Создать папку |
| PATCH | `/api/dictionary/folders/:id` | Premium | Переименовать папку |
| DELETE | `/api/dictionary/folders/:id` | Premium | Удалить папку |

---

## GET /api/dictionary — ответ

Каждое слово содержит расширенные данные:

```json
{
  "id": "entry-uuid",
  "word": "мотт",
  "normalized": "мотт",
  "translation": "язык",
  "addedAt": "2026-03-01T10:00:00Z",
  "learningLevel": "LEARNING",
  "cefrLevel": "A1",
  "repetitionCount": 3,
  "folderId": "folder-uuid",
  "lemmaId": "lemma-uuid",
  "nextReview": "2026-03-28T10:00:00Z",
  "wordProgressStatus": "LEARNING",
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
        "snippet": "...Нохчийн мотт — тан халкъан мотт...",
        "text": { "title": "Нохчийн мотт — мечан историй" }
      }
    ]
  }
}
```

| Поле | Описание |
|------|---------|
| `cefrLevel` | Уровень слова: `A1`, `A2`, `B1`, `B2` (или `null`) |
| `nextReview` | Дата следующего повторения из SM-2 (или `null`) |
| `wordProgressStatus` | Статус в системе повторения (может отличаться от `learningLevel`) |
| `folder` | Папка с `id` и `name` |
| `lemma.morphForms` | Морфологические формы с грамматическими тегами |
| `lemma.headwords[].entry.senses` | До 3 значений с примерами |
| `lemma.wordContexts` | Последний реальный контекст — текст где встречалось слово |

---

## GET /api/dictionary/stats — ответ

```json
{
  "total": 149,
  "byLevel": {
    "NEW": 18,
    "LEARNING": 19,
    "KNOWN": 112
  },
  "totalRepetitions": 340,
  "dueCount": 14,
  "masteryPercent": 75
}
```

| Поле | Описание |
|------|---------|
| `total` | Всего слов в словаре |
| `byLevel.NEW` | Новые слова |
| `byLevel.LEARNING` | Слова в процессе изучения |
| `byLevel.KNOWN` | Знаемые слова |
| `dueCount` | Слов ожидают повторения прямо сейчас |
| `masteryPercent` | Процент знаемых слов от всего словаря |

---

## GET /api/dictionary/due — ответ

Слова у которых `nextReview <= now` (по SM-2 расписанию).

```json
{
  "count": 14,
  "nextScheduledAt": "2026-03-28T18:00:00Z",
  "words": [
    {
      "lemmaId": "lemma-uuid",
      "nextReview": "2026-03-27T10:00:00Z",
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
| `count` | Количество слов к повторению сейчас |
| `nextScheduledAt` | Когда следующее запланированное повторение (после текущих) |
| `words[].dictionaryEntry` | Запись из личного словаря (`null` если слово не добавлено в словарь) |

---

## GET /api/dictionary/folders — ответ

```json
[
  {
    "id": "folder-uuid",
    "name": "Базовый A1",
    "sortOrder": 0,
    "_count": { "entries": 54 }
  }
]
```

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

Поле `folderId: null` удаляет слово из папки.

---

## Структура словарной статьи

```
DictionaryEntry (словарная статья)
 └── Headword[] (заглавные слова — разные написания)
      └── Lemma (лемма — базовая форма)
           ├── part_of_speech (существительное, глагол и т.д.)
           ├── frequency (частотность в корпусе)
           ├── MorphForm[] (все морфологические формы)
           ├── Sense[] (значения/переводы)
           │    └── Example[] (примеры с переводом)
           └── WordContext[] (реальные контексты из текстов)
```

### Пример:
```
Статья: "мотт" (язык)
  Headword: "мотт"
  Lemma: "мотт"
    POS: существительное
    Frequency: 1250
    MorphForms: мотт, моттан, моттана, моттах ...
    Senses:
      - язык (часть тела)
      - язык (речь, наречие)
    Examples:
      - "Нохчийн мотт" — Чеченский язык
```

---

## Личный словарь пользователя

Пользователь может:
1. Добавить любое слово в личный словарь
2. Указать уровень CEFR: `A1`, `A2`, `B1`, `B2`
3. Организовать слова по папкам (Premium)
4. Задать статус: `NEW` / `LEARNING` / `KNOWN`
5. Слова из личного словаря участвуют в системе повторения (SM-2)

---

## Кеширование

**TokenInfoCache** ([src/cache/](../src/cache/)) — кешируем в Redis результат поиска по токену. Это важно, потому что один и тот же токен может встречаться в тексте много раз.

**DictionaryCache** — кешируем ответы от Online Dictionary API, чтобы не делать лишних HTTP запросов.

---

## Файлы модуля

| Файл | Описание |
|------|---------|
| [token.service.ts](../src/token/token.service.ts) | Поиск по tokenId с цепочкой источников |
| [words.service.ts](../src/words/words.service.ts) | Поиск слов по строке |
| [word-examples.service.ts](../src/words/word-examples.service.ts) | Получение примеров |
| [word-lookup-by-word.service.ts](../src/words/word-lookup-by-word.service.ts) | Поиск по слову |
| [dictionary.service.ts](../src/dictionary/dictionary.service.ts) | Личный словарь |
| [folders.service.ts](../src/dictionary/folders.service.ts) | Папки словаря |
| [dictionary-cache/](../src/markup-engine/dictionary-cache/) | Кеш-слой словаря |
| [online-dictionary/](../src/markup-engine/online-dictionary/) | Внешний API словаря |
