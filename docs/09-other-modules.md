# Прочие модули: аналитика, статистика, обратная связь, деки, разговорник, настройки и инфраструктура

---

## Аналитика

Модуль: [src/analytics/](../src/analytics/)

Компактный набор метрик «дашборд-уровня» для главной страницы (`/dashboard/me`) и статус-карточек. **Требует Premium** (`@RequiresPremium()`).

### API Endpoints

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/analytics/me` | Личная статистика: слова, due-today, текстовый прогресс, streak, 30-дневный график активности |

### Что возвращает GET /api/analytics/me

```json
{
  "words":        { "total": 432, "new": 50, "learning": 200, "known": 182 },
  "dueToday":     { "total": 12,  "new": 3,  "learning": 9 },
  "texts":        { "opened": 7,  "avgProgress": 42 },
  "streak":       5,
  "streakRecord": 18,
  "streakDays":   [/* 7 объектов Пн-Вс, см. ниже */],
  "activity":     [/* 30 объектов { date, count } */]
}
```

| Поле | Описание |
|------|---------|
| `words` | Общее число слов в `UserWordProgress` + разбивка по `WordStatus` |
| `dueToday` | Слова, требующие повторения (`nextReview <= now` или `null`), кроме `KNOWN` |
| `texts` | Сколько текстов открыто и среднее `progressPercent` |
| `streak` | Текущая серия дней (по `UserEvent`) |
| `streakRecord` | Максимальная серия за всё время (cap — последние 2 года) |
| `streakDays` | Массив 7 объектов: текущая неделя Пн–Вс |
| `activity` | Кол-во событий `CLICK_WORD` + `ADD_TO_DICTIONARY` за каждый из последних 30 дней |

### streakDays — разбивка недели

Массив из 7 объектов (Пн–Вс текущей недели в часовом поясе пользователя):

```json
[
  { "date": "2026-04-27", "label": "Пн", "active": true,  "isToday": false },
  { "date": "2026-04-28", "label": "Вт", "active": true,  "isToday": false },
  { "date": "2026-04-29", "label": "Ср", "active": false, "isToday": true  },
  { "date": "2026-04-30", "label": "Чт", "active": false, "isToday": false },
  { "date": "2026-05-01", "label": "Пт", "active": false, "isToday": false },
  { "date": "2026-05-02", "label": "Сб", "active": false, "isToday": false },
  { "date": "2026-05-03", "label": "Вс", "active": false, "isToday": false }
]
```

| Поле | Описание |
|------|---------|
| `date` | ISO-дата дня |
| `label` | Сокращение дня: Пн, Вт, Ср, Чт, Пт, Сб, Вс |
| `active` | `true` если в этот день было хоть одно `UserEvent` |
| `isToday` | `true` для сегодняшнего дня |

**Логика отрисовки на фронте:**
- `active && !isToday` → `done` (выполнено)
- `isToday` → `today` (сегодня, независимо от `active`)
- `!active && !isToday` → `empty` (пропущено / ещё не наступил)

### Часовой пояс пользователя

`AnalyticsService` читает `UserNotificationPreferences.timezone` (IANA-формат, но парсится только UTC-смещение типа `UTC+3`). По умолчанию — UTC.

---

## Статистика

Модуль: [src/statistics/](../src/statistics/)

Полноценная страница `/statistics` со всеми срезами: header, streak, year heatmap, donut, words-per-day, прогресс по текстам, accuracy и recent activity. Также сюда логируются reading-сессии и итоги review-сессий.

### API Endpoints

| Метод | URL | Доступ | Описание |
|-------|-----|--------|---------|
| GET | `/api/statistics/me/profile-summary` | Free + Premium | Компакт-набор для карточки на `/profile` (words, textsRead, streak, 70-дневный heatmap) |
| GET | `/api/statistics/me?period=&activityLimit=` | Premium | Полная статистика. `period`: `week` \| `month` \| `year` \| `all` (по умолчанию `month`); `activityLimit`: 1–50 (по умолчанию 15) |
| POST | `/api/statistics/reading-time` | Premium | Залогировать reading-сессию: `{ textId, durationSeconds }` |
| POST | `/api/statistics/review-session` | Premium | Залогировать итог review-сессии: `{ correct, wrong }` |

### Ответ GET /api/statistics/me

```json
{
  "period":         "month",
  "header":         { /* ключевые цифры */ },
  "streak":         { "current": 5, "record": 18, "weekDays": [...] },
  "heatmap":        [ { "date": "2026-04-29", "level": 2, "count": 12 }, ... ],
  "words":          { /* donut: total / new / learning / known */ },
  "wordsPerDay":    [ /* график */ ],
  "texts":          [ /* список с avgProgress */ ],
  "accuracy":       { /* % правильных в review */ },
  "recentActivity": [ /* до activityLimit последних событий */ ]
}
```

### Ответ GET /api/statistics/me/profile-summary

```json
{
  "words":     { "total": 432, "new": 50, "learning": 200, "known": 182 },
  "textsRead": 7,
  "streak":    { "current": 5, "record": 18 },
  "heatmap":   [ { "date": "2026-02-19", "level": 0, "count": 0 }, ... 70 элементов ]
}
```

`level` агрегируется по `count` (0..4) для интенсивности заливки клетки.

---

## Дашборд

Модуль: [src/dashboard/](../src/dashboard/)

Агрегатор данных для главной (`/`) — собирает в один ответ метрики, список «продолжить читать» и снапшот плана для бейджа в сайдбаре. **Доступен всем авторизованным** (без Premium-gate).

### API Endpoints

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/dashboard/me` | Все данные главной за один запрос |

### Ответ GET /api/dashboard/me

```json
{
  "stats": {
    "textsRead":         7,
    "wordsInDictionary": 432,
    "streak":            5,
    "streakRecord":      18,
    "streakDays":        [/* Пн-Вс, как в analytics */],
    "dueToday":          { "total": 12, "new": 3, "learning": 9 },
    "words":             { "total": 432, "new": 50, "learning": 200, "known": 182 }
  },
  "continueReading": [ /* последние открытые тексты */ ],
  "plan": {
    "code": "premium-monthly",
    "name": "Premium",
    "type": "PREMIUM",
    "status": "ACTIVE",
    "isPremium": true,
    "translationsToday": 12,
    "translationsLimit": null
  }
}
```

`plan` нужен для верхнего бейджа («Free / Premium / Trial»), счётчика переводов и условной отрисовки upsell-CTA.

---

## Обратная связь и поддержка

Модуль: [src/feedback/](../src/feedback/)

Мини-чат между пользователем и службой поддержки + быстрые реакции на контент.

### Типы обращений (`FeedbackType`)

| Тип | Описание |
|-----|---------|
| `QUESTION` | Вопрос |
| `BUG` | Сообщение об ошибке |
| `IDEA` | Предложение/идея |
| `COMPLAINT` | Жалоба |

### Контекст обращения (`FeedbackContextType`)

К треду можно прикрепить контекст: словарную карточку (`contextLemmaId`), фрагмент текста (`contextTextId` + `contextSentence` + `contextPosition`), произвольное действие (`contextAction`). Все поля опциональны.

### API Endpoints (пользователь)

| Метод | URL | Описание |
|-------|-----|---------|
| POST | `/api/feedback` | Создать тред с первым сообщением (`type`, `title?`, `body`, `context*?`) |
| GET | `/api/feedback?type=&status=&page=&limit=` | Мои треды (пагинация 1–50, по умолчанию 20) |
| GET | `/api/feedback/unread-count` | Суммарное число непрочитанных admin-ответов |
| GET | `/api/feedback/:threadId` | Конкретный тред со всеми сообщениями |
| PATCH | `/api/feedback/:threadId/read` | Пометить все admin-сообщения треда как прочитанные |
| POST | `/api/feedback/:threadId/messages` | Отправить новое сообщение в тред (`body`, до 2000 символов) |
| POST | `/api/feedback/reactions` | Создать быструю реакцию (`type`, `lemmaId?`, `textId?`) |
| DELETE | `/api/feedback/reactions/:reactionId` | Удалить свою реакцию |

### Быстрые реакции (`FeedbackReaction`)

`ReactionType` (см. Prisma) — короткие реакции на слово или текст без создания полноценного треда. Используются для сбора пассивного фидбэка («полезно / не полезно / сложно»).

### Жизненный цикл треда

```
1. Пользователь создаёт обращение (тип + body + опц. контекст)
      |
      v
2. Создаётся FeedbackThread + первое FeedbackMessage (isAdmin=false)
      |
      v
3. Поддержка видит обращение в /api/admin/feedback
      |
      v
4. Поддержка отвечает -> новое FeedbackMessage (isAdmin=true)
      |
      v
5. Пользователь видит unread-count > 0, открывает тред
      |
      v
6. PATCH /:threadId/read обнуляет счётчик; диалог продолжается
```

---

## Деки — ShuVeriDenig (авторская система заучивания)

Модуль: [src/deck/](../src/deck/)

Авторская система структурированного повторения слов. **Независима от SM-2** — это две отдельные системы без общей логики.

### Типы дек и лимиты

| Тип | Описание | Лимит |
|-----|---------|-------|
| `NEW` | Только что добавленные слова | настраивается (`deckMaxSize`, по умолч. 90) |
| `OLD` | Переполнение из NEW (самые старые) | то же |
| `RETIRED` | Переполнение из OLD | то же |
| `NUMBERED` (1, 2, 3…) | Архивные деки, ротируются раз в день | то же |

### Настройки пользователя

Хранятся в `UserDeckState`:

| Поле | По умолчанию | Описание |
|------|-------------|---------|
| `isEnabled` | `false` | Включён ли метод дек у пользователя |
| `dailyWordCount` | 5 | Сколько слов предлагать добавить в деку каждый день (3 / 5 / 10) |
| `deckMaxSize` | 90 | Максимальный размер каждой деки (10–500) |
| `currentNumberedDeck` | 1 | Активная нумерованная дека |
| `lastRotatedAt` | — | Время последней ротации нумерованных дек |

> Поле `enableDecks` в `UserPreferences` — это user-facing-флажок «использовать деки». При установке в `true` сервис настроек проверяет активную Premium-подписку.

### Авторебалансировка

При добавлении нового слова система автоматически проверяет лимиты и сдвигает самые старые карточки:

```
Добавить слово -> NEW (до deckMaxSize)
      | если NEW > deckMaxSize: самые старые -> OLD
      v
   OLD (до deckMaxSize)
      | если OLD > deckMaxSize: самые старые -> RETIRED
      v
   RETIRED (до deckMaxSize)
      | если RETIRED > deckMaxSize: самые старые -> NUMBERED (1, 2, 3…)
      v
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

`GET /api/deck/daily` возвращает N слов из словаря пользователя (`UserDictionaryEntry`), которые ещё не добавлены в деки. N = `dailyWordCount`. Пользователь решает — добавить слово в NEW (`POST /api/deck/add/:lemmaId`) или пропустить.

### Ежедневная ротация нумерованных дек

При каждом запросе `GET /api/deck/due` система проверяет дату — если день сменился, активная нумерованная дека переключается на следующую по номеру. Состояние хранится в `UserDeckState.currentNumberedDeck` + `lastRotatedAt`.

### API Endpoints

Все эндпоинты требуют **Premium** подписку (`@RequiresPremium()`).

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/deck/settings` | Текущие настройки (`isEnabled`, `dailyWordCount`, `deckMaxSize`) |
| PATCH | `/api/deck/settings` | Обновить настройки (любое подмножество полей) |
| GET | `/api/deck/daily` | N слов из словаря, ещё не в деках |
| POST | `/api/deck/add/:lemmaId` | Добавить слово в NEW (с авторебалансировкой) |
| DELETE | `/api/deck/remove/:lemmaId` | Убрать слово из всех дек |
| POST | `/api/deck/rate/:lemmaId` | Оценить карточку (`{ result: "know" | "again" }`) |
| GET | `/api/deck/due` | Карточки на сегодня: NEW + OLD + RETIRED + текущая NUMBERED |
| GET | `/api/deck/stats` | Статистика по декам + настройки |

### Ответ GET /api/deck/stats

```json
{
  "new":        12,
  "old":        90,
  "retired":    90,
  "numbered":   [ { "deckNumber": 1, "count": 90 }, { "deckNumber": 2, "count": 45 } ],
  "total":      327,
  "currentNumberedDeck": 1,
  "maxNumberedDeck":     2,
  "deckMaxSize":         90,
  "dailyWordCount":      5
}
```

---

## Разговорник (Phrasebook)

Модуль: [src/phrasebook/](../src/phrasebook/) (публичный) + [src/admin/phrasebook/](../src/admin/phrasebook/) (CRUD)

Готовые фразы на чеченском (и других поддерживаемых) языках, организованные по категориям. Контент создаётся администраторами; пользователи могут сохранять фразы и предлагать новые.

### Модели данных

| Модель | Назначение |
|--------|-----------|
| `PhrasebookCategory` | Категория (emoji, name, sortOrder) |
| `PhrasebookPhrase` | Фраза (`original`, `transliteration`, `translation`, `lang`) |
| `PhrasebookPhraseWord` | Разбор фразы по словам (`original`, `translation`, `position`) |
| `PhrasebookPhraseExample` | Пример использования (`phrase`, `translation`, `context?`) |
| `UserPhrasebookSave` | Сохранённые фразы пользователя |
| `PhrasebookSuggestion` | Предложения фраз от пользователей |

### API Endpoints (пользователь)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/phrasebook/stats` | `{ totalPhrases, totalCategories, savedCount }` |
| GET | `/api/phrasebook/categories` | Все категории с количеством фраз |
| GET | `/api/phrasebook/phrases` | Фразы с фильтрами (см. ниже) |
| POST | `/api/phrasebook/suggestions` | Предложить фразу |
| POST | `/api/phrasebook/saves/:phraseId` | Toggle сохранения фразы → `{ saved: boolean }` |

### GET /api/phrasebook/phrases — query-параметры

| Параметр | Описание |
|----------|---------|
| `categoryId` | UUID категории |
| `lang` | Язык: `CHE`, `RU` (значения `Language` из Prisma) |
| `saved` | `"true"` — только сохранённые пользователем |
| `search` | Поиск по `original` / `translation` / `transliteration` |

### Ответ GET /api/phrasebook/phrases

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
    "words":    [ { "id": "uuid", "original": "Салам", "translation": "привет", "position": 0 } ],
    "examples": [ { "id": "uuid", "phrase": "...", "translation": "...", "context": "..." } ]
  }
]
```

### POST /api/phrasebook/suggestions — тело

```json
{
  "original": "Салам!",
  "translation": "Привет!",
  "lang": "CHE",
  "context": "при встрече",
  "categoryId": "uuid-опционально"
}
```

### API Endpoints (admin)

См. [src/admin/phrasebook/](../src/admin/phrasebook/) — все требуют разрешение `CAN_EDIT_TEXTS`:

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/phrasebook/categories` | Список категорий с кол-вом фраз |
| POST | `/api/admin/phrasebook/categories` | Создать категорию |
| PATCH | `/api/admin/phrasebook/categories/:id` | Обновить категорию |
| DELETE | `/api/admin/phrasebook/categories/:id` | Удалить категорию (и все её фразы) |
| GET | `/api/admin/phrasebook/phrases?categoryId=` | Список фраз |
| POST | `/api/admin/phrasebook/phrases` | Создать фразу (с `words` и `examples`) |
| PATCH | `/api/admin/phrasebook/phrases/:id` | Обновить фразу (`words` / `examples` заменяются целиком) |
| DELETE | `/api/admin/phrasebook/phrases/:id` | Удалить фразу |
| GET | `/api/admin/phrasebook/suggestions` | Предложения от пользователей |
| DELETE | `/api/admin/phrasebook/suggestions/:id` | Удалить предложение |

---

## Настройки пользователя

Модуль: [src/settings/](../src/settings/)

Объединённое API для трёх блоков настроек: внешний вид/ридер (`UserPreferences`), цели обучения (`UserGoals`), email-уведомления (`UserNotificationPreferences`). Плюс экспорт данных и сброс прогресса.

### Модели данных

| Модель | Назначение |
|--------|-----------|
| `UserPreferences` | Тема, язык UI, fontSize, popupMode, флаги ридера/словаря, `enableDecks` |
| `UserGoals` | `dailyWords`, `dailyMinutes`, `vocabularyGoal` |
| `UserNotificationPreferences` | Email-флаги (`repeatReminder`, `weeklyReport`, …), `reminderTime`, `timezone` (IANA) |

Каждая модель — `1:1` с `User`, ключ `userId`, удаление каскадно.

### API Endpoints (8 эндпоинтов)

| # | Метод | URL | Описание |
|---|-------|-----|---------|
| 1 | GET | `/api/settings` | Все три блока разом: `{ preferences, goals, notifications }`. При первом обращении создаются дефолтные записи (upsert). |
| 2 | PATCH | `/api/settings/preferences` | Обновить `UserPreferences` (любое подмножество полей DTO) |
| 3 | PATCH | `/api/settings/goals` | Обновить `UserGoals` |
| 4 | PATCH | `/api/settings/notifications` | Обновить `UserNotificationPreferences` |
| 5 | GET | `/api/settings/export/vocabulary?format=json\|csv` | Экспорт словаря (по умолч. JSON; CSV отдаёт `text/csv` + `Content-Disposition: attachment`) |
| 6 | GET | `/api/settings/export/progress` | Экспорт прогресса: `{ textProgress, wordProgress, reviewLogs }` |
| 7 | GET | `/api/settings/export/archive` | Полный архив: `{ vocabulary, textProgress, wordProgress, reviewLogs }` |
| 8 | POST | `/api/settings/reset/progress` | Удаляет все `UserTextProgress` пользователя → `{ success: true }` |
| 8a | POST | `/api/settings/reset/vocabulary` | Удаляет `UserDictionaryEntry` + `UserDictionaryFolder` (в одной транзакции) → `{ success: true }` |

> Эндпоинтов фактически 9 (`reset/vocabulary` отдельный), но семантически это два «сброса» — вместе с тремя PATCH-ями, GET-ом и тремя экспортами получается каноничное «8 + reset» из спецификации.

### Поля UpdatePreferencesDto

| Поле | Тип / значения |
|------|---------------|
| `theme` | `LIGHT` \| `DARK` \| `SYSTEM` |
| `uiLanguage` | `RU` \| `EN` |
| `fontSize` | int 12–24 |
| `popupMode` | `POPUP` \| `SIDEBAR` \| `BOTH` |
| `highlightKnown`, `showProgress`, `autoNextPage` | boolean (флаги ридера) |
| `autoAddOnClick`, `showGrammar`, `showExamples` | boolean (поведение словаря в ридере) |
| `translationLanguage` | `RU` \| `EN` \| `AR` |
| `showReviewReminder` | boolean — баннер «нужно повторить» на главной |
| `enableDecks` | boolean — Premium-фича. При `true` сервис проверяет активную Premium-подписку (`SUBSCRIPTION_REQUIRED` / `SUBSCRIPTION_EXPIRED`); ADMIN/SUPERADMIN всегда разрешено. |

### Поля UpdateGoalsDto

| Поле | Допустимые значения |
|------|--------------------|
| `dailyWords` | 5 \| 10 \| 20 \| 30 \| 50 |
| `dailyMinutes` | 5 \| 15 \| 30 \| 60 |
| `vocabularyGoal` | int 50–100000 (default 800; используется в donut на `/statistics`) |

### Поля UpdateNotificationsDto

| Поле | Описание |
|------|---------|
| `repeatReminder`, `weeklyReport`, `newTexts`, `supportReplies`, `marketing` | boolean — отдельные email-канали |
| `reminderTime` | строка `HH:MM` (24-часовой формат) |
| `timezone` | IANA (например `Europe/Moscow`, `Asia/Tashkent`) — нужен крон-планировщику email-напоминаний |

### Premium-проверка для enableDecks

```
PATCH /api/settings/preferences  { enableDecks: true }
        |
        v
  SettingsService.assertPremium(userId)
        |
        +-- роль ADMIN/SUPERADMIN -> OK
        +-- активная Premium subscription (ACTIVE | TRIALING) -> OK
        +-- CANCELED | EXPIRED -> 403 SUBSCRIPTION_EXPIRED
        +-- иначе              -> 403 SUBSCRIPTION_REQUIRED
```

---

## Пользовательский модуль (User)

Модуль: [src/user/](../src/user/)

### API Endpoints

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/users/me` | Профиль текущего пользователя (без необходимости знать `id`) |
| GET | `/api/users/:id` | Профиль по идентификатору. Доступен либо самому себе, либо администратору с `CAN_MANAGE_USERS` |
| PATCH | `/api/users` | Обновить поля профиля (см. DTO ниже). Возвращает `201`. |
| DELETE | `/api/users` | Запланировать удаление аккаунта (мягкое + 30-дневный grace period) |

### Что можно менять через PATCH /api/users (UpdateUserDto)

| Поле | Ограничения |
|------|-------------|
| `username` | string 2–16 |
| `name` | string 2–32 |
| `surname` | string 2–32 |
| `phone` | валидный международный номер |
| `avatar` | URL (`require_protocol`); пустая строка → сброс на инициалы |
| `language` | enum `Language` — изучаемый язык |
| `level` | enum `Level` — CEFR-уровень |

> `email` и `password` намеренно не входят сюда. Email меняется через `POST /auth/email-change/request` → `/confirm`, password — через `POST /auth/password/change` (требует current). Это закрывает тривиальный угон аккаунта при компрометации access-токена.

### Удаление аккаунта (DELETE /api/users)

Тело: `{ "confirmEmail": "user@example.com" }` — должен совпадать с email текущего аккаунта (явное подтверждение).

```
DELETE /api/users
      |
      v
status -> DELETED, deletedAt = now()
все активные сессии отзываются
      |
      v (через 30 дней)
AccountCleanupService удаляет данные безвозвратно
```

См. также `account-cleanup.service.ts` — фоновый job, добивающий аккаунты с истёкшим grace-периодом.

---

## Юридические страницы (Legal)

Модуль: [src/legal/](../src/legal/) — публичный (без авторизации).

Хранилище публикуемых документов (Privacy, Terms, Contact и т. п.). Документы хранятся **по парам** `(slug, lang)`; при отсутствии запрошенного языка происходит фолбэк на `ru`.

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/legal/:slug?lang=ru\|che\|en\|ar` | Получить опубликованный документ. По умолчанию `lang=ru`. Черновики (`isPublished=false`) не возвращаются. |

Ответ:

```json
{
  "slug":        "privacy",
  "lang":        "ru",
  "title":       "Политика конфиденциальности",
  "content":     "# Markdown-...",
  "version":     3,
  "publishedAt": "2026-04-12T10:00:00Z",
  "updatedAt":   "2026-04-12T10:00:00Z"
}
```

Управление документами — в `/api/admin/legal/...` (см. модуль admin).

---

## Health-чеки и метрики

Модуль: [src/health/](../src/health/) — публичный, без авторизации. Используется liveness/readiness-пробами k8s и мониторингом.

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/health/live` | Liveness: `{ status: "ok", timestamp, uptimeSeconds }` |
| GET | `/api/health/ready` | Readiness: проверяет PostgreSQL (`SELECT 1`) и Redis (`PING`). При деградации → `503 ServiceUnavailable` |
| GET | `/api/health/metrics` | Базовые метрики процесса + HTTP-снапшот `ObservabilityService` |

Пример `/api/health/ready`:

```json
{
  "status":    "ok",
  "timestamp": "2026-04-29T12:00:00Z",
  "checks":    { "db": true, "redis": true }
}
```

Пример `/api/health/metrics`:

```json
{
  "timestamp": "2026-04-29T12:00:00Z",
  "process": {
    "uptimeSeconds": 12345,
    "memory": { "rssBytes": 0, "heapUsedBytes": 0, "heapTotalBytes": 0 }
  },
  "http": { /* observability snapshot */ }
}
```

---

## Mail-сервис

Модуль: [src/mail/](../src/mail/)

Транзакционные письма. Контроллера нет — это внутренний сервис, дёргаемый из `auth/`, `billing/` и т. д.

### Поддерживаемые письма

| Метод сервиса | Шаблон |
|---------------|--------|
| `sendPasswordResetEmail` | Ссылка на сброс пароля |
| `sendPasswordChangedEmail` | Уведомление о смене пароля |
| `sendEmailChangeConfirmEmail` | Подтверждение смены email |
| `sendEmailChangedNoticeEmail` | Уведомление о смене email на старый ящик |
| `sendPaymentReceiptEmail` | Чек/квитанция об оплате подписки |

### Провайдеры

| `MAIL_PROVIDER` | Поведение |
|-----------------|-----------|
| `log` (по умолч.) | Письма не отправляются, пишется лог-запись (dev/CI) |
| `resend` | Реальная отправка через Resend API (`RESEND_API_KEY`, `MAIL_FROM`, опц. `MAIL_REPLY_TO`) |

При ошибках от Resend сервис **не пробрасывает** исключение — иначе по различиям в ответах можно перебирать существующие email-ы. Вместо этого ошибка логируется, наружу всегда уходит `200`.

---

## Feature flags (публичный сервис)

Модуль: [src/feature-flags/](../src/feature-flags/)

Только сервис (`FeatureFlagsService`), без публичного контроллера — флаги читаются другими модулями. Управление флагами — в `/api/admin/feature-flags/...`.

### Алгоритм `isFeatureEnabled(userId, key)`

```
1. UserFeatureFlag (override per-user) -> возвращаем его isEnabled
2. FeatureFlag по key:
     - не найден / soft-deleted              -> false
     - текущее окружение нет в environments  -> false
     - isEnabled=false                       -> false
     - rolloutPercent >= 100                 -> true
     - rolloutPercent <= 0                   -> false
3. Иначе: stable hash от `${userId}:${key}` -> bucket 0..99
   - bucket < rolloutPercent -> true
   - иначе                   -> false
```

Окружение определяется по `APP_ENV` или `NODE_ENV` → `DEV` / `STAGE` / `PROD`. Хеш-бакет стабилен для пары (user, flag), что гарантирует консистентность раскатки.

---

## Redis-модуль

Модуль: [src/redis/](../src/redis/)

`RedisService extends IORedis` — единственный клиент Redis на всё приложение. Подключение через `REDIS_URL`.

### Поведение

| Аспект | Реализация |
|--------|-----------|
| Reconnect | `retryStrategy: times => min(times*1000, 30000)` мс |
| Логирование ошибок | Первая ошибка пишется warn-ом; повторные подавляются до восстановления соединения |
| Восстановление | На событие `connect` пишется лог «Redis подключён», флаг сбрасывается |
| Shutdown | `OnModuleDestroy` → `quit()` |

### Где используется

- **Rate limiting** (`ThrottlerModule`) — троттлинг публичных эндпоинтов
- **TokenInfoCache** — кеш данных о словах в ридере
- **DictionaryCache** — кеш по словарю
- **PremiumGuard** — кеш статуса подписки между запросами

---
