# Прогресс обучения и алгоритм SM-2

Модуль: [src/progress/](../src/progress/)

---

## Что отслеживается

1. **Прогресс по словам** — статус (NEW/LEARNING/KNOWN), параметры SM-2, история повторений
2. **Прогресс по текстам** — процент усвоения (доля KNOWN-лемм текста) и позиция чтения
3. **Контексты слов** — снимки фраз из реальных текстов, где встречалось слово
4. **Календарь повторений** — что было сделано / запланировано по конкретному слову
5. **События активности** — `UserEvent` (используется аналитикой для streak и графиков)

Прогресс по словам и текстам связан: при переходе слова в `KNOWN` (или обратно) пересчитывается `progressPercent` всех текстов, в которых встречается лемма (`syncTextProgressForLemma`).

---

## Статусы слов (`WordStatus`)

| Статус | Описание |
|--------|---------|
| `NEW` | Слово появилось у пользователя (пассивная встреча через `registerSeenWords`), SM-2 ещё не запущен |
| `LEARNING` | Слово в процессе изучения, участвует в очереди повторений |
| `KNOWN` | Слово усвоено, выбывает из очереди (следующее повторение через 21 день) |

Перевод в `KNOWN` происходит автоматически, когда SM-2-интервал становится `>= 21` дня, либо вручную через `PATCH /api/progress/words/:lemmaId/status`.

---

## Модель `UserWordProgress`

| Поле | Тип | Описание |
|------|-----|---------|
| `userId` | String | Владелец прогресса |
| `lemmaId` | String | Лемма (нормализованная форма слова) |
| `status` | `WordStatus` | NEW / LEARNING / KNOWN, по умолчанию NEW |
| `seenCount` | Int | Сколько раз слово было встречено пассивно (при открытии страниц текста) |
| `repetitions` | Int | Подряд успешных повторений в SM-2 |
| `lastSeen` | DateTime? | Последняя пассивная или активная встреча |
| `nextReview` | DateTime? | Дата следующего повторения (null = ещё не активировано) |
| `easeFactor` | Float | Коэффициент лёгкости SM-2, по умолчанию 2.5, минимум 1.3 |
| `interval` | Int | Текущий интервал в днях (0 = ещё не оценивалось) |

Уникальность: `(userId, lemmaId)`. Индексы: `(userId, nextReview)` для быстрой выборки due-слов.

---

## Алгоритм SM-2 (интервальное повторение)

SM-2 определяет, через сколько дней повторить слово, чтобы не забыть.

### Оценка (Quality)

Передаётся в `POST /api/progress/review/:lemmaId` полем `quality`.

| Оценка | Описание |
|--------|---------|
| 0 | Полный провал, не вспомнил |
| 1 | Неправильно, но вспомнил подсказку |
| 2 | Неправильно, но ответ был близким |
| 3 | Правильно с трудом |
| 4 | Правильно после лёгкого раздумья |
| 5 | Идеально, без раздумий |

`correct = quality >= 3`. Эта же граница записывается в `UserReviewLog.correct`.

### Базовая формула (применяется в `applySM2`)

```
quality >= 3 (вспомнил):
  если repetitions == 0 → interval = 1
  иначе если repetitions == 1 → interval = 6
  иначе → interval = round(interval * easeFactor)
  repetitions += 1
  easeFactor = max(1.3, easeFactor + 0.1 - (5-q)*(0.08 + (5-q)*0.02))

quality < 3 (забыл):
  repetitions = 0
  interval = 1
  easeFactor = max(1.3, easeFactor - 0.2)

nextReview = today + interval (UTC)
```

### Эффект частоты (`applyFrequencyEffect`)

После SM-2 интервал дополнительно сжимается, если слово встречалось в нескольких уникальных текстах (по числу записей `WordContext`):

| Уникальных текстов | Множитель интервала |
|--------------------|--------------------|
| 1 | × 1.0 |
| 2 | × 0.9 |
| ≥ 3 | × 0.8 |

Минимальное значение интервала после сжатия — 1 день. После сжатия `nextReview` пересчитывается заново.

### Переход в KNOWN

После расчёта SM-2 итоговый статус выбирается так:

```
quality < 3              → LEARNING
interval >= 21 (KNOWN_INTERVAL) → KNOWN
иначе                    → LEARNING
```

Параллельно с обновлением `UserWordProgress` создаётся запись `UserReviewLog` (quality, correct, intervalBefore, intervalAfter) и зеркалится `learningLevel` в `UserDictionaryEntry`, чтобы карточка словаря не расходилась с SM-2.

---

## API Endpoints

Все маршруты требуют `Auth()` (Bearer-токен). `/words/:lemmaId/contexts` и `/words/:lemmaId/calendar` дополнительно помечены `@RequiresPremium()`.

### Прогресс по тексту

| Метод | URL | Описание |
|-------|-----|---------|
| GET   | `/api/progress/text/:id` | Текущий процент усвоения текста (0..100) |
| PATCH | `/api/progress/text/:id/position` | Сохранить страницу чтения (монотонно вперёд) |

`GET /api/progress/text/:id` пересчитывает прогресс на лету (`calculateProgress`) и одновременно фиксирует его в `UserTextProgress` (`persistProgress`), чтобы кеш для статистики и листингов не отставал.

Ответ:

```json
{ "progress": 42.5 }
```

`PATCH /api/progress/text/:id/position` — body:

```json
{ "pageNumber": 5 }
```

Ответ:

```json
{ "lastPageNumber": 5, "totalPages": 12 }
```

`pageNumber` валидируется как целое в `[1, totalPages]`. Поле `lastPageNumber` двигается только вперёд: возврат на более ранние страницы не сбрасывает позицию (используется фичей «продолжить чтение»).

### Очередь повторения SM-2

| Метод | URL | Описание |
|-------|-----|---------|
| GET   | `/api/progress/review/stats` | Сводка для intro-экрана повторений |
| GET   | `/api/progress/review/due`   | Слова к повторению на сегодня |
| POST  | `/api/progress/review/:lemmaId` | Записать результат повторения (quality 0–5) |

`GET /api/progress/review/stats` — ответ:

```json
{
  "dueCount": 12,
  "learningCount": 48,
  "streak": 7
}
```

| Поле | Источник |
|------|---------|
| `dueCount` | `UserWordProgress.count` где `status != KNOWN` и (`nextReview IS NULL` или `nextReview <= now`) |
| `learningCount` | `UserWordProgress.count` где `status = LEARNING` |
| `streak` | `AnalyticsService.getStreakDetails(userId).current` (по `UserEvent`) |

`GET /api/progress/review/due?limit=20` — слова, у которых пора делать повторение. К каждой карточке подмешивается последний `WordContext` через `attachLatestContexts` (snippet, sourceTitle, sourceTextId, seenAt). Включает леммы с переводами (`headwords` × 3) и морфоформами (× 8). Сортировка: `nextReview asc, seenCount desc`. Параметр `limit` — целое > 0, по умолчанию 20.

`POST /api/progress/review/:lemmaId` — body:

```json
{ "quality": 4 }
```

Ответ — обновлённая запись `UserWordProgress`. Дополнительно: создаётся `UserReviewLog`, зеркалится `UserDictionaryEntry.learningLevel`, пересчитываются `progressPercent` затронутых текстов.

### Управление словом и контексты

| Метод | URL | Описание |
|-------|-----|---------|
| PATCH | `/api/progress/words/:lemmaId/status` | Ручное переключение статуса (NEW / LEARNING / KNOWN) |
| GET   | `/api/progress/words/:lemmaId/contexts` | Контексты встречи слова (Premium) |
| GET   | `/api/progress/words/:lemmaId/calendar` | Календарь повторений за N дней (Premium) |

`PATCH /api/progress/words/:lemmaId/status` — body:

```json
{ "status": "KNOWN" }
```

Семантика:

| status | Что делает |
|--------|-----------|
| `NEW` | Сбрасывает SM-2: `repetitions = 0`, `interval = 0`, `easeFactor = 2.5`, `nextReview = null` |
| `LEARNING` | Сбрасывает SM-2 и ставит `nextReview = сегодня (UTC midnight)` — слово сразу в очереди |
| `KNOWN` | `interval = 21`, `nextReview = today + 21d`, выбывает из очереди |

После любого из переходов триггерится `syncTextProgressForLemma` (пересчёт `progressPercent` для всех текстов, где встречается эта лемма).

`GET /api/progress/words/:lemmaId/contexts` — query: `page` (≥1, по умолчанию 1), `limit` (1..100, по умолчанию 20), `level` (A1..C2, фильтр по уровню текста).

```json
{
  "items": [
    {
      "id": "ctx_...",
      "word": "кобура",
      "snippet": "достал из кобуры старый револьвер",
      "seenAt": "2026-04-28T10:11:12.000Z",
      "text": { "id": "...", "title": "Каштанка", "language": "ru", "level": "B1" }
    }
  ],
  "total": 7,
  "page": 1,
  "limit": 20
}
```

`GET /api/progress/words/:lemmaId/calendar?days=7` — `days` ограничен 1..30 (по умолчанию 7). Отдаёт массив дней:

```json
[
  { "date": "2026-04-23", "status": "done" },
  { "date": "2026-04-24", "status": "empty" },
  { "date": "2026-04-25", "status": "done" },
  { "date": "2026-04-26", "status": "empty" },
  { "date": "2026-04-27", "status": "empty" },
  { "date": "2026-04-28", "status": "empty" },
  { "date": "2026-04-29", "status": "today" }
]
```

Статусы дня:

| status | Условие |
|--------|---------|
| `done` | За день есть запись в `UserReviewLog` (любая попытка) |
| `today` | Сегодня и нет лога |
| `next` | На этот день стоит `nextReview`, но день не сегодня и не done |
| `empty` | Ничего не было запланировано |

---

## Внутренние операции (вызываются другими модулями)

Эти методы экспортируются через `WordProgressService` и `TextProgressService`, но не имеют HTTP-эндпоинтов.

| Метод | Где вызывается | Что делает |
|-------|----------------|-----------|
| `WordProgressService.registerClick(userId, lemmaId)` | Reader (клик по слову) | Создаёт/обновляет запись с `status = LEARNING`, ставит `nextReview = сегодня` |
| `WordProgressService.registerSeenWords(userId, lemmaIds)` | Reader (открытие страницы) | Массово создаёт записи (status NEW по умолчанию), увеличивает `seenCount` |
| `WordProgressService.saveContext(userId, lemmaId, textId, word, tokenId?)` | Reader (клик по слову) | Сохраняет `WordContext` со snippet ±6 токенов вокруг кликнутого |
| `WordProgressService.syncTextProgressForLemma` | Внутренний | Пересчитывает `progressPercent` всех текстов с этой леммой |
| `TextProgressService.calculateProgress(userId, textId)` | Контроллер, статистика | `% = (KNOWN-леммы текста) / (все леммы текста)` по последней `TextProcessingVersion` |
| `TextProgressService.persistProgress(userId, textId, percent)` | Контроллер | Кеширует `progressPercent` в `UserTextProgress`, проставляет `completedAt` при первом достижении 100% |

---

## Контексты слова (`WordContext`)

`WordContext` — снимок встречи слова в тексте пользователя.

| Поле | Описание |
|------|---------|
| `userId`, `lemmaId`, `textId` | Где и у кого встречалось |
| `word` | Оригинальная словоформа (как в тексте) |
| `snippet` | Окно из ±6 соседних токенов вокруг кликнутого (через `TextToken.position`) |
| `seenAt` | Момент сохранения |

Уникальность: `(userId, lemmaId, textId)` — на пару «пользователь–слово–текст» хранится один контекст.

Используется в двух местах:
- `attachLatestContexts` подмешивает последний контекст к каждой карточке `due`-слова (показывает реальное предложение, чтобы вспоминалось легче).
- `GET /progress/words/:lemmaId/contexts` отдаёт пагинированный список контекстов конкретной леммы (Premium).

Эффект частоты SM-2 тоже считается по `WordContext`: чем больше уникальных текстов, тем короче интервал.

---

## Пользовательский флоу повторений

```
1. Открыта страница текста
       │  Reader → WordProgressService.registerSeenWords
       ▼
2. UserWordProgress.seenCount++ для каждой встреченной леммы
       │
       ▼
3. Клик по незнакомому слову в ридере
       │  Reader → registerClick + saveContext
       ▼
4. status = LEARNING, nextReview = сегодня, WordContext сохранён
       │
       ▼
5. Пользователь идёт в раздел повторения
       │  GET /api/progress/review/stats   → dueCount/learningCount/streak
       │  GET /api/progress/review/due     → карточки + latestContext
       ▼
6. Для каждой карточки: вспоминает → оценивает 0–5
       │  POST /api/progress/review/:lemmaId  { quality }
       ▼
7. SM-2 пересчитывает interval/EF/repetitions, фиксируется UserReviewLog,
   зеркалится UserDictionaryEntry, пересчитывается прогресс текстов
       │
       ▼
8. Слово уходит до nextReview. Когда interval ≥ 21 → status = KNOWN
```

---

## Связь с другими модулями

| Модуль | Связь |
|--------|------|
| `src/analytics/` | Поставляет `streak` для `/review/stats`, читает `UserEvent` |
| `src/statistics/` | Использует `UserTextProgress.completedAt` и `UserReviewLog` для агрегатов за период |
| `src/dashboard/` | Сводка по `dueCount` / `learningCount` / процентам текстов на главный экран |
| `src/dictionary/` | Зеркало `learningLevel` в `UserDictionaryEntry` синхронизируется при каждом SM-2-апдейте |
| `src/reader/` | Источник `registerClick`, `registerSeenWords`, `saveContext` |
| `src/deck/` | Использует `attachLatestContexts` через тот же helper для собственного `/deck/due` |

---

## Файлы модуля

| Файл | Назначение |
|------|-----------|
| [progress.module.ts](../src/progress/progress.module.ts) | Сборка модуля, импорт `WordProgressModule`, `TextProgressModule`, `AnalyticsModule` |
| [progress.controller.ts](../src/progress/progress.controller.ts) | HTTP-эндпоинты `/api/progress/*` |
| [progress.service.ts](../src/progress/progress.service.ts) | Пустой плейсхолдер (исторический), экспортируется модулем |
| [latest-context.helper.ts](../src/progress/latest-context.helper.ts) | `attachLatestContexts` — подмешивает последний `WordContext` к карточкам due |
| [word-progress/word-progress.module.ts](../src/progress/word-progress/word-progress.module.ts) | Подмодуль слов |
| [word-progress/word-progress.service.ts](../src/progress/word-progress/word-progress.service.ts) | SM-2, эффект частоты, статусы, контексты, календарь, синхронизация текстов |
| [word-progress/word-progress.service.spec.ts](../src/progress/word-progress/word-progress.service.spec.ts) | Юнит-тесты SM-2 |
| [text-progress/text-progress.module.ts](../src/progress/text-progress/text-progress.module.ts) | Подмодуль текстов |
| [text-progress/text-progress.service.ts](../src/progress/text-progress/text-progress.service.ts) | `calculateProgress`, `persistProgress`, `setPosition` |
| [text-progress/text-progress.service.spec.ts](../src/progress/text-progress/text-progress.service.spec.ts) | Юнит-тесты прогресса текстов |
| [dto/submit-review.dto.ts](../src/progress/dto/submit-review.dto.ts) | `quality: 0..5` |
| [dto/set-word-status.dto.ts](../src/progress/dto/set-word-status.dto.ts) | `status: NEW \| LEARNING \| KNOWN` |
| [dto/set-text-position.dto.ts](../src/progress/dto/set-text-position.dto.ts) | `pageNumber: int >= 1` |
