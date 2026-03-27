# Аналитика, обратная связь и деки

---

## Аналитика

Модуль: [src/analytics/](../src/analytics/)

Статистика обучения пользователя. **Требует активную подписку** (`@Premium()`).

### API Endpoints

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/analytics/stats` | Личная статистика: слова, прогресс |
| GET | `/api/analytics/due-today` | Сколько слов нужно повторить сегодня |
| GET | `/api/analytics/activity` | График активности за 30 дней |
| GET | `/api/analytics/texts` | Прогресс по всем текстам |

### Что показывает статистика
- Общее количество слов в изучении
- Слова по статусам: NEW / LEARNING / KNOWN
- Серия дней подряд (streak) + рекорд серии (streakRecord)
- Разбивка текущей недели по дням (streakDays)
- Количество слов, требующих повторения сегодня
- Тепловая карта активности (heatmap) за последние 30 дней

### streakDays — разбивка недели

Массив из 7 объектов (Пн–Вс текущей недели):

```json
[
  { "date": "2026-03-23", "label": "Пн", "active": true,  "isToday": false },
  { "date": "2026-03-24", "label": "Вт", "active": true,  "isToday": false },
  { "date": "2026-03-25", "label": "Ср", "active": true,  "isToday": false },
  { "date": "2026-03-26", "label": "Чт", "active": false, "isToday": true  },
  { "date": "2026-03-27", "label": "Пт", "active": false, "isToday": false },
  { "date": "2026-03-28", "label": "Сб", "active": false, "isToday": false },
  { "date": "2026-03-29", "label": "Вс", "active": false, "isToday": false }
]
```

| Поле | Описание |
|------|---------|
| `date` | ISO-дата дня |
| `label` | Сокращение дня: Пн, Вт, Ср, Чт, Пт, Сб, Вс |
| `active` | `true` если в этот день было хоть одно событие пользователя |
| `isToday` | `true` для сегодняшнего дня |

**Логика отрисовки на фронте:**
- `active && !isToday` → `done` (выполнено)
- `isToday` → `today` (сегодня, независимо от active)
- `!active && !isToday` → `empty` (пропущено/ещё не наступил)

### streakRecord

Максимальная непрерывная серия дней за всё время. Вычисляется по всем `UserEvent` пользователя.

---

## Обратная связь и поддержка

Модуль: [src/feedback/](../src/feedback/)

Мини-чат между пользователем и поддержкой.

### Типы обращений

| Тип | Описание |
|-----|---------|
| `QUESTION` | Вопрос |
| `BUG` | Сообщение об ошибке |
| `IDEA` | Предложение/идея |
| `COMPLAINT` | Жалоба |

### API Endpoints (пользователь)

| Метод | URL | Описание |
|-------|-----|---------|
| POST | `/api/feedback` | Создать новое обращение |
| GET | `/api/feedback` | Мои обращения |
| GET | `/api/feedback/:threadId` | Конкретный тред |
| POST | `/api/feedback/:threadId/messages` | Отправить сообщение в тред |
| POST | `/api/feedback/reactions` | Оставить быструю реакцию |

### Быстрые реакции (`FeedbackReaction`)

Пользователь может оставить реакцию на слово или контент:
- "Полезно"
- "Не полезно"
- "Сложно"

Это помогает собирать обратную связь без создания полного тредa.

### Как работает тред

```
1. Пользователь создаёт обращение (тип + текст)
      │
      ▼
2. Создаётся FeedbackThread + первое FeedbackMessage
      │
      ▼
3. Поддержка видит обращение в /api/admin/feedback
      │
      ▼
4. Поддержка отвечает → новое FeedbackMessage (isAdmin: true)
      │
      ▼
5. Пользователь видит ответ и может продолжить диалог
```

---

## Деки — ShuVeriDenig (авторская система заучивания)

Модуль: [src/deck/](../src/deck/)

Авторская система структурированного повторения слов. **Независима от SM-2** — это две отдельные системы без общей логики.

### Типы дек и лимиты

| Тип | Описание | Лимит |
|-----|---------|-------|
| `NEW` | Только добавленные слова | настраивается (`deckMaxSize`, по умолч. 90) |
| `OLD` | Переполнение из NEW (самые старые) | то же |
| `RETIRED` | Переполнение из OLD | то же |
| `NUMBERED` (1, 2, 3…) | Архивные деки, ротируются раз в день | то же |

### Настройки пользователя

Хранятся в `UserDeckState`:

| Поле | По умолчанию | Описание |
|------|-------------|---------|
| `dailyWordCount` | 5 | Сколько слов предлагать добавить в деку каждый день (3 / 5 / 10) |
| `deckMaxSize` | 90 | Максимальный размер каждой деки (10–500) |

### Авторебалансировка

При добавлении нового слова система автоматически проверяет лимиты и сдвигает самые старые карточки:

```
Добавить слово → NEW (до deckMaxSize)
      │ если NEW > deckMaxSize: самые старые → OLD
      ▼
   OLD (до deckMaxSize)
      │ если OLD > deckMaxSize: самые старые → RETIRED
      ▼
   RETIRED (до deckMaxSize)
      │ если RETIRED > deckMaxSize: самые старые → NUMBERED (1, 2, 3…)
      ▼
   Нумерованные деки (по deckMaxSize)
```

### Оценка карточки

При повторении пользователь оценивает каждую карточку:

| Оценка | Действие |
|--------|---------|
| `know` | Слово знаю — `movedAt` обновляется (карточка уходит в конец FIFO) |
| `again` | Не вспомнил — карточка остаётся на месте |

Карточка уходит из деки только при переполнении (авторебалансировка).

### Ежедневные слова

`GET /api/deck/daily` — возвращает N слов из словаря пользователя (`UserDictionaryEntry`), которые ещё не добавлены в деки. N = `dailyWordCount`. Пользователь решает — добавить слово в NEW (`POST /api/deck/add/:lemmaId`) или пропустить.

### Ежедневная ротация нумерованных дек

Состояние хранится в `UserDeckState` (`currentNumberedDeck`, `lastRotatedAt`).
При каждом запросе `GET /api/deck/due` система проверяет дату — если день сменился, активная дека переключается на следующую по номеру.

### API Endpoints

Все эндпоинты требуют **Premium** подписку.

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/deck/settings` | Текущие настройки (dailyWordCount, deckMaxSize) |
| PATCH | `/api/deck/settings` | Обновить настройки |
| GET | `/api/deck/daily` | N слов из словаря, ещё не в деках |
| POST | `/api/deck/add/:lemmaId` | Добавить слово в NEW (с авторебалансировкой) |
| DELETE | `/api/deck/remove/:lemmaId` | Убрать слово из всех дек |
| POST | `/api/deck/rate/:lemmaId` | Оценить карточку (`know` / `again`) |
| GET | `/api/deck/due` | Карточки на сегодня: NEW + OLD + RETIRED + текущая NUMBERED |
| GET | `/api/deck/stats` | Статистика: кол-во карточек в каждой деке + настройки |

### Что возвращает GET /api/deck/due

```json
{
  "new": [...],
  "old": [...],
  "retired": [...],
  "numbered": [...],
  "currentNumberedDeck": 3,
  "maxNumberedDeck": 7
}
```

---

## Пользовательский модуль

Модуль: [src/user/](../src/user/)

### API Endpoints

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/user/profile` | Мой профиль |
| PATCH | `/api/user/profile` | Обновить профиль |
| DELETE | `/api/user` | Удалить аккаунт (мягкое удаление) |

Удаление — **мягкое**: статус меняется на `DELETED`, данные сохраняются.

---

---

## Разговорник (Phrasebook)

Модуль: [src/phrasebook/](../src/phrasebook/)

Готовые фразы на чеченском языке, организованные по категориям. Контент создаётся администраторами, пользователи могут сохранять фразы и предлагать новые.

### Модели данных

| Модель | Описание |
|--------|---------|
| `PhrasebookCategory` | Категория (emoji, name, sortOrder) |
| `PhrasebookPhrase` | Фраза (original, transliteration, translation, lang) |
| `PhrasebookPhraseWord` | Разбор фразы по словам (original, translation, position) |
| `PhrasebookPhraseExample` | Пример использования фразы (phrase, translation, context?) |
| `UserPhrasebookSave` | Сохранённые фразы пользователя |
| `PhrasebookSuggestion` | Предложения фраз от пользователей |

### API Endpoints (пользователь)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/phrasebook/stats` | Статистика: totalPhrases, totalCategories, savedCount |
| GET | `/api/phrasebook/categories` | Список категорий с кол-вом фраз |
| GET | `/api/phrasebook/phrases` | Фразы с фильтрами (см. ниже) |
| POST | `/api/phrasebook/suggestions` | Предложить фразу |
| POST | `/api/phrasebook/saves/:phraseId` | Toggle сохранения фразы |

**GET /api/phrasebook/phrases — query-параметры:**

| Параметр | Описание |
|----------|---------|
| `categoryId` | ID категории |
| `lang` | Язык: `CHE`, `RU` |
| `saved` | `true` — только сохранённые |
| `search` | Поиск по original / translation / transliteration |

**Ответ GET /api/phrasebook/phrases:**
```json
[
  {
    "id": "uuid",
    "categoryId": "uuid",
    "original": "Салам!",
    "transliteration": "Salam!",
    "translation": "Привет!",
    "lang": "CHE",
    "saved": false,
    "words": [{ "id": "uuid", "original": "Салам", "translation": "привет", "position": 0 }],
    "examples": [{ "id": "uuid", "phrase": "...", "translation": "...", "context": "..." }]
  }
]
```

### API Endpoints (admin)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/phrasebook/categories` | Список категорий с кол-вом фраз |
| POST | `/api/admin/phrasebook/categories` | Создать категорию |
| PATCH | `/api/admin/phrasebook/categories/:id` | Обновить категорию |
| DELETE | `/api/admin/phrasebook/categories/:id` | Удалить категорию (и все фразы) |
| GET | `/api/admin/phrasebook/phrases?categoryId=` | Список фраз |
| POST | `/api/admin/phrasebook/phrases` | Создать фразу (с words и examples) |
| PATCH | `/api/admin/phrasebook/phrases/:id` | Обновить фразу (words/examples заменяются целиком) |
| DELETE | `/api/admin/phrasebook/phrases/:id` | Удалить фразу |
| GET | `/api/admin/phrasebook/suggestions` | Предложения от пользователей |
| DELETE | `/api/admin/phrasebook/suggestions/:id` | Удалить предложение |

Все admin-эндпоинты требуют разрешение `CAN_EDIT_TEXTS`.

---

## Redis модуль

Модуль: [src/redis/](../src/redis/)

Центральный сервис для работы с Redis. Используется:
- Rate limiting (ThrottlerModule)
- Кеш токенов (TokenInfoCache)
- Кеш словаря (DictionaryCache)

Настройка подключения через `REDIS_URL` в `.env`.
