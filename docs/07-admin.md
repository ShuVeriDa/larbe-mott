# Административные функции

Модуль: [src/admin/](../src/admin/)

Все маршруты начинаются с `/api/admin/`.
Доступ контролируется RBAC: каждая ручка защищена декоратором `@AdminPermission(PermissionCode.X)`.
Чтобы вызвать ручку, у пользователя должна быть роль, в матрице которой есть требуемое разрешение
(см. [prisma/helpers/rbacHelper.ts](../prisma/helpers/rbacHelper.ts)).

---

## Подмодули администратора

### 1. Управление пользователями (`/api/admin/users`)

**Файл:** [src/admin/users/](../src/admin/users/)

| Метод | URL | Описание | Разрешение |
|-------|-----|----------|------------|
| GET | `/api/admin/users/stats` | KPI: total, active, blocked, frozen, deleted, newThisMonth, withPaidSubscription | `CAN_MANAGE_USERS` |
| GET | `/api/admin/users/export` | Экспорт списка пользователей (`?format=csv` для CSV) | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/bulk/freeze` | Bulk-заморозка активных пользователей | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/bulk/block` | Bulk-блокировка пользователей | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/bulk/reset-roles` | Снять все роли у выбранных пользователей | `CAN_MANAGE_USERS` |
| GET | `/api/admin/users` | Список с фильтрами и поиском | `CAN_MANAGE_USERS` |
| GET | `/api/admin/users/:id` | Профиль пользователя (роли, активная подписка, статистика) | `CAN_MANAGE_USERS` |
| GET | `/api/admin/users/:id/events` | События пользователя (с фильтрами) | `CAN_VIEW_ANALYTICS` |
| GET | `/api/admin/users/:id/events/summary` | Агрегаты по событиям + topFailLookups/topClicks | `CAN_VIEW_ANALYTICS` |
| GET | `/api/admin/users/:id/roles` | Роли пользователя | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/:id/roles` | Назначить роль | `CAN_MANAGE_USERS` |
| DELETE | `/api/admin/users/:id/roles/:roleId` | Снять роль | `CAN_MANAGE_USERS` |
| GET | `/api/admin/users/:id/sessions` | До 50 последних сессий | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/:id/logout-all` | Завершить все сессии | `CAN_MANAGE_USERS` |
| GET | `/api/admin/users/:id/subscription` | Текущая подписка + история платежей (20) | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/:id/subscriptions/:subId/cancel` | Отменить подписку | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/:id/subscriptions/:subId/extend` | Продлить подписку на N дней | `CAN_MANAGE_USERS` |
| GET | `/api/admin/users/:id/feature-flags` | Глобальные флаги, смерженные с overrides пользователя | `CAN_MANAGE_FEATURE_FLAGS` |
| PUT | `/api/admin/users/:id/feature-flags/:flagId` | Установить override флага для пользователя | `CAN_MANAGE_FEATURE_FLAGS` |
| DELETE | `/api/admin/users/:id/feature-flags/:flagId` | Снять override (вернуться к глобальному значению) | `CAN_MANAGE_FEATURE_FLAGS` |
| POST | `/api/admin/users/:id/apply-coupon` | Вручную применить промокод | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/:id/block` | Заблокировать (`status=BLOCKED`) | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/:id/unblock` | Разблокировать (`status=ACTIVE`) | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/:id/freeze` | Заморозить (`status=FROZEN`) | `CAN_MANAGE_USERS` |
| POST | `/api/admin/users/:id/unfreeze` | Разморозить (`status=ACTIVE`) | `CAN_MANAGE_USERS` |
| DELETE | `/api/admin/users/:id` | Soft-удаление (`status=DELETED`) | `CAN_MANAGE_USERS` |

---

### 2. Управление текстами (`/api/admin/texts`)

**Файл:** [src/admin/text/](../src/admin/text/)

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/texts/stats` | KPI: totalCount, publishedCount, draftCount, archivedCount, processingCount, errorCount |
| GET | `/api/admin/texts` | Список с фильтрами/сортировкой/пагинацией |
| POST | `/api/admin/texts` | Создать текст (как черновик) |
| POST | `/api/admin/texts/bulk/publish` | Bulk-публикация |
| POST | `/api/admin/texts/bulk/unpublish` | Bulk-снятие с публикации |
| POST | `/api/admin/texts/bulk/tokenize` | Bulk-токенизация |
| POST | `/api/admin/texts/bulk/delete` | Bulk-удаление |
| POST | `/api/admin/texts/bulk-import` | Импорт массива JSON-объектов с поэлементной валидацией |
| GET | `/api/admin/texts/:id/versions` | История версий обработки |
| GET | `/api/admin/texts/:id/versions/:versionId` | Детали версии (мета, постраничные статы, лог) |
| POST | `/api/admin/texts/:id/versions/:versionId/restore` | Сделать версию текущей |
| POST | `/api/admin/texts/:id/versions/:versionId/retry` | Перезапуск обработки с теми же настройками |
| GET | `/api/admin/texts/:id/versions/:versionId/download` | Скачать дамп версии (JSON) |
| GET | `/api/admin/texts/:id/unknown-words` | Неизвестные слова текущей версии |
| POST | `/api/admin/texts/:id/process` | Запустить новую версию обработки |
| GET (SSE) | `/api/admin/texts/:id/process/stream` | Поток статуса последней версии |
| POST | `/api/admin/texts/:id/publish` | Опубликовать (alias `PATCH { status: 'published' }`) |
| POST | `/api/admin/texts/:id/unpublish` | Снять с публикации |
| POST | `/api/admin/texts/:id/tokenize` | Перезапустить токенизацию |
| POST | `/api/admin/texts/:id/cover` | Загрузить обложку (`multipart/form-data`, jpg/png/webp ≤ 2 МБ) |
| GET | `/api/admin/texts/:id` | Получить текст (страницы, теги, latestVersion) |
| PATCH | `/api/admin/texts/:id` | Частичное обновление |
| DELETE | `/api/admin/texts/:id` | Удалить текст и связанные данные |

#### POST /api/admin/texts — пример тела

```json
{
  "title": "Нохчийн туьйра",
  "language": "CHE",
  "level": "A2",
  "author": "Авторов А.А.",
  "source": "Сборник рассказов, 2020",
  "tagIds": ["uuid-тега-1", "uuid-тега-2"],
  "pages": [
    {
      "pageNumber": 1,
      "contentRich": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [{ "type": "text", "text": "Со бусулба нохчи ву." }]
          }
        ]
      }
    }
  ]
}
```

> Текст создаётся как **черновик** (`publishedAt: null`). Для публикации — `PATCH` с `"publishedAt": "2026-03-26T00:00:00.000Z"` или `POST /:id/publish`.

---

### 3. Управление тегами (`/api/admin/tags`)

**Файл:** [src/admin/tags/](../src/admin/tags/)

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/tags` | Список тегов с количеством текстов |
| POST | `/api/admin/tags` | Создать тег |
| PATCH | `/api/admin/tags/:id` | Переименовать тег |
| DELETE | `/api/admin/tags/:id` | Удалить тег (снимается со всех текстов) |

#### Пример ответа GET

```json
[
  {
    "id": "uuid-1",
    "name": "Литература",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "_count": { "texts": 5 }
  }
]
```

> Имя тега уникально. Повторное создание → `409 Conflict`.

---

### 4. Управление словарём (`/api/admin/dictionary`)

**Файл:** [src/admin/dictionary/](../src/admin/dictionary/)

**Требуемое разрешение:** `CAN_EDIT_DICTIONARY`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/dictionary/stats` | totalEntries, totalLemmas, totalSenses, totalMorphForms, entriesWithoutSenses, unknownWordsCount |
| GET | `/api/admin/dictionary/lookup?normalized=...` | Поиск записи по нормализованной форме (deep-link) |
| GET | `/api/admin/dictionary` | Список с фильтрами (q, pos, level, tab, sort) |
| GET | `/api/admin/dictionary/export?ids[]=...` | JSON-экспорт |
| GET | `/api/admin/dictionary/:id` | Карточка по lemmaId |
| POST | `/api/admin/dictionary` | Создать запись |
| PATCH | `/api/admin/dictionary/:id` | Обновить запись |
| DELETE | `/api/admin/dictionary/:id` | Удалить (cascade) |
| DELETE | `/api/admin/dictionary` | Bulk-удаление (тело: `{ ids[] }`) |
| POST | `/api/admin/dictionary/import` | Импорт из JSON-файла |
| POST | `/api/admin/dictionary/:id/senses` | Добавить значение |
| PATCH | `/api/admin/dictionary/senses/:senseId` | Обновить значение |
| DELETE | `/api/admin/dictionary/senses/:senseId` | Удалить значение |
| POST | `/api/admin/dictionary/senses/:senseId/examples` | Добавить пример к значению |
| POST | `/api/admin/dictionary/:id/examples` | Добавить пример в первое значение |
| PATCH | `/api/admin/dictionary/examples/:exampleId` | Обновить пример |
| DELETE | `/api/admin/dictionary/examples/:exampleId` | Удалить пример |
| POST | `/api/admin/dictionary/:id/headwords` | Добавить заголовочное слово |
| PATCH | `/api/admin/dictionary/headwords/:hwId` | Обновить headword |
| DELETE | `/api/admin/dictionary/headwords/:hwId` | Удалить headword |
| POST | `/api/admin/dictionary/:id/forms` | Добавить морфоформу |
| PATCH | `/api/admin/dictionary/forms/:formId` | Обновить морфоформу |
| DELETE | `/api/admin/dictionary/forms/:formId` | Удалить морфоформу |
| GET | `/api/admin/dictionary/:id/next` | Следующая запись по алфавиту |
| GET | `/api/admin/dictionary/:id/prev` | Предыдущая запись по алфавиту |
| GET | `/api/admin/dictionary/:id/related-lemmas` | Сиблинговые леммы внутри одного DictionaryEntry |
| GET | `/api/admin/dictionary/:id/frequency-stats` | Частотность, ранг, покрытие корпуса |
| POST | `/api/admin/dictionary/entries/:entryId/lemmas` | Прикрепить новую лемму к существующему DictionaryEntry |
| GET | `/api/admin/dictionary/:id/user-stats` | Сколько пользователей сохранило слово (по статусам) |
| GET | `/api/admin/dictionary/:id/contexts` | Контексты слова из корпуса |

---

### 5. Управление морфологией (`/api/admin/morphology`)

**Файл:** [src/admin/morphology/](../src/admin/morphology/)

**Требуемое разрешение:** `CAN_EDIT_MORPHOLOGY`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/morphology/lemmas` | Леммы с пагинацией и количеством форм |
| GET | `/api/admin/morphology/lemmas/:id` | Лемма + все морфоформы |
| POST | `/api/admin/morphology/lemmas` | Создать лемму |
| PATCH | `/api/admin/morphology/lemmas/:id` | Обновить лемму |
| DELETE | `/api/admin/morphology/lemmas/:id` | Удалить лемму (cascade форм) |
| POST | `/api/admin/morphology/lemmas/:id/forms` | Добавить морфоформу |
| PATCH | `/api/admin/morphology/forms/:id` | Обновить морфоформу |
| DELETE | `/api/admin/morphology/forms/:id` | Удалить морфоформу |
| GET | `/api/admin/morphology/rules/stats` | total, active, inactive, regexCount, totalMatches, coveragePct |
| GET | `/api/admin/morphology/rules` | Список правил с фильтрами |
| POST | `/api/admin/morphology/rules` | Создать правило |
| PATCH | `/api/admin/morphology/rules/:id` | Обновить правило |
| DELETE | `/api/admin/morphology/rules/:id` | Удалить правило |
| POST | `/api/admin/morphology/rules/bulk/activate` | Bulk-активация |
| POST | `/api/admin/morphology/rules/bulk/deactivate` | Bulk-деактивация |
| DELETE | `/api/admin/morphology/rules/bulk` | Bulk-удаление (тело: `{ ids[] }`) |
| POST | `/api/admin/morphology/rules/import` | Импорт CSV/JSON (`?overwrite=true`) |
| POST | `/api/admin/morphology/analyze` | Тест: прогон слова через пайплайн |

---

### 6. Биллинг (`/api/admin/...`)

**Файл:** [src/admin/billing/](../src/admin/billing/)

**Требуемое разрешение:** `CAN_MANAGE_BILLING`

> Маршруты этого подмодуля смонтированы на корне `/api/admin` (не на `/api/admin/billing`).

#### Общая статистика и доход

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/billing/stats` | KPI: paying, MRR, ARR, conversion, churn + дельты за 30 дней |
| GET | `/api/admin/billing/revenue` | Доход с разбивкой по планам (для графика) |

#### Тарифные планы

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/plans` | Список планов с subscriberCount (фильтры: onlyActive, type, groupCode) |
| POST | `/api/admin/plans` | Создать план |
| PATCH | `/api/admin/plans/:id` | Обновить план |
| PATCH | `/api/admin/plans/:id/limits` | Частичный merge JSON-лимитов (`replace=true` для полной замены) |
| POST | `/api/admin/plans/:id/deactivate` | `isActive=false` |
| DELETE | `/api/admin/plans/:id` | Полное удаление (409, если есть подписки) |

#### Подписки

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/subscriptions/stats` | KPI: active/trialing/canceled/expired + дельты, истекающие триалы |
| GET | `/api/admin/subscriptions` | Список подписок с фильтрами |
| GET | `/api/admin/subscriptions/export` | Экспорт (`?format=csv`) |
| POST | `/api/admin/subscriptions` | Создать ручную подписку (по userId или email) |
| GET | `/api/admin/subscriptions/:id` | Детали подписки + последние платежи + лог событий |
| GET | `/api/admin/users/:id/subscriptions` | Все подписки пользователя |
| POST | `/api/admin/users/:id/subscriptions` | Назначить план пользователю (trial/lifetime) |
| POST | `/api/admin/subscriptions/:id/cancel` | Отменить подписку |
| POST | `/api/admin/subscriptions/:id/extend` | Продлить на N дней |

#### Платежи

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/payments/stats` | KPI текущего месяца + MoM-дельты |
| GET | `/api/admin/payments/chart?dateFrom=&dateTo=` | Доход по дням |
| GET | `/api/admin/payments/by-provider` | Разбивка по провайдерам |
| GET | `/api/admin/payments` | Список платежей с фильтрами |
| GET | `/api/admin/payments/export.csv` | CSV-экспорт |
| GET | `/api/admin/payments/:id` | Детали платежа + другие платежи пользователя |
| POST | `/api/admin/payments/:id/refund` | Возврат (полный/частичный) |
| POST | `/api/admin/payments/:id/send-receipt` | Отправить чек на email |

#### Промокоды

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/coupons/stats` | active, totalCreated, totalRedemptions, usageGrowth |
| GET | `/api/admin/coupons` | Список с computedStatus (active/expired/exhausted/disabled) |
| GET | `/api/admin/coupons/export` | CSV |
| GET | `/api/admin/coupons/:id` | Детали + последние 10 redemptions |
| POST | `/api/admin/coupons` | Создать |
| PATCH | `/api/admin/coupons/:id` | Обновить |
| POST | `/api/admin/coupons/:id/deactivate` | `isActive=false` |
| POST | `/api/admin/coupons/:id/activate` | `isActive=true` |
| DELETE | `/api/admin/coupons/:id` | Удалить (если не использовался) |
| POST | `/api/admin/coupons/:code/redeem?userId=&paymentId=` | Тестовое погашение |

---

### 7. Аналитика (`/api/admin/analytics`)

**Файл:** [src/admin/analytics/](../src/admin/analytics/)

**Требуемое разрешение:** `CAN_VIEW_ANALYTICS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/analytics` | Полный payload: KPI, levels, heatmap, events, funnel, SM-2 |
| GET | `/api/admin/analytics/export` | Экспорт (`?format=json|csv`) |
| GET | `/api/admin/analytics/difficult-texts` | Сложные тексты (FAIL / unknown / abandon) |
| GET | `/api/admin/analytics/popular-texts` | Популярные тексты (opens / completions / saved words) |
| GET | `/api/admin/analytics/texts/complexity` | Тексты, отсортированные по числу FAIL_LOOKUP |
| GET | `/api/admin/analytics/levels/popular` | OPEN_TEXT по уровням |

---

### 8. Дашборд (`/api/admin/dashboard`)

**Файл:** [src/admin/dashboard/](../src/admin/dashboard/)

**Требуемое разрешение:** `CAN_VIEW_ANALYTICS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/dashboard` | KPI-карточки, график регистраций, контент, последние пользователи, активность, summary support/billing. Параметры: `period=week\|month\|year\|all` или `dateFrom`/`dateTo` |
| GET | `/api/admin/dashboard/export?format=json\|csv` | Экспорт снапшота |

---

### 9. Обратная связь (`/api/admin/feedback`)

**Файл:** [src/admin/feedback/](../src/admin/feedback/)

**Требуемое разрешение:** `CAN_MANAGE_FEEDBACK`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/feedback/stats` | total, by status, by type |
| GET | `/api/admin/feedback/assignees` | Админы, которым можно назначить тред (SUPPORT/ADMIN/SUPERADMIN) |
| GET | `/api/admin/feedback/export?format=csv\|json` | Экспорт тредов |
| GET | `/api/admin/feedback` | Список тредов с фильтрами |
| GET | `/api/admin/feedback/:threadId` | Тред с сообщениями и контекстом |
| PATCH | `/api/admin/feedback/:threadId/status` | Изменить статус |
| PATCH | `/api/admin/feedback/:threadId/priority` | Изменить приоритет |
| PATCH | `/api/admin/feedback/:threadId/assignee` | Назначить/снять исполнителя |
| PATCH | `/api/admin/feedback/:threadId/read` | Отметить сообщения пользователя как прочитанные |
| POST | `/api/admin/feedback/:threadId/messages` | Ответить пользователю или внутренняя заметка |
| POST | `/api/admin/feedback/:threadId/transfer` | Передать другому админу |
| DELETE | `/api/admin/feedback/:threadId` | Полное удаление треда |

---

### 10. Feature Flags (`/api/admin/feature-flags`)

**Файл:** [src/admin/feature-flags/](../src/admin/feature-flags/)

**Требуемое разрешение:** `CAN_MANAGE_FEATURE_FLAGS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/feature-flags/stats` | Дашборд-статистика |
| GET | `/api/admin/feature-flags/overrides` | Список per-user override'ов |
| POST | `/api/admin/feature-flags/overrides` | Создать/обновить override по payload |
| DELETE | `/api/admin/feature-flags/overrides/:overrideId` | Удалить override |
| GET | `/api/admin/feature-flags/keys` | Лёгкий список флагов (id/key/category/isEnabled) |
| GET | `/api/admin/feature-flags/history/actors` | Уникальные авторы изменений (для фильтра) |
| GET | `/api/admin/feature-flags/history` | Лента истории изменений |
| POST | `/api/admin/feature-flags/import` | Импорт из JSON-payload |
| GET | `/api/admin/feature-flags` | Список флагов |
| POST | `/api/admin/feature-flags` | Создать флаг |
| PATCH | `/api/admin/feature-flags/:id` | Обновить флаг |
| PATCH | `/api/admin/feature-flags/:id/toggle` | Включить/выключить глобально |
| POST | `/api/admin/feature-flags/:id/duplicate` | Дублировать с новым ключом |
| GET | `/api/admin/feature-flags/:id/history` | Таймлайн одного флага |
| DELETE | `/api/admin/feature-flags/:id` | Soft-delete |
| POST | `/api/admin/feature-flags/:id/users` | Установить override для пользователя |
| DELETE | `/api/admin/feature-flags/:id/users/:userId` | Удалить override пользователя |

---

### 11. Неизвестные слова (`/api/admin/unknown-words`)

**Файл:** [src/admin/unknown-words/](../src/admin/unknown-words/)

Слова, которые система не смогла проанализировать при обработке текстов. Администратор разбирает очередь.

**Требуемое разрешение:** `CAN_EDIT_DICTIONARY`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/unknown-words/stats` | Счётчики (pending, addedToDictionary, linkedToLemma, encounteredToday, ...) |
| GET | `/api/admin/unknown-words` | Список с фильтрами и табами (all/frequent/rare) |
| GET | `/api/admin/unknown-words/export?format=csv\|json` | Экспорт PENDING |
| DELETE | `/api/admin/unknown-words` | Soft-удаление всех PENDING |
| POST | `/api/admin/unknown-words/bulk/delete` | Bulk soft-удаление по `ids` |
| POST | `/api/admin/unknown-words/:id/add-to-dictionary` | Создать lemma и пометить ADDED_TO_DICTIONARY |
| POST | `/api/admin/unknown-words/:id/link` | Прикрепить к существующей лемме как MorphForm |
| GET | `/api/admin/unknown-words/:id/contexts` | Все контексты с фрагментами текста |
| GET | `/api/admin/unknown-words/:id` | Получить запись с массивом текстов |
| DELETE | `/api/admin/unknown-words/:id` | Soft-удаление |

---

### 12. Управление токенами (`/api/admin/tokens`)

**Файл:** [src/admin/token/](../src/admin/token/)

Ручная корректировка результатов анализа.

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/tokens/:id` | Полные детали токена для редактирования |
| PATCH | `/api/admin/tokens/bulk` | Bulk-обновление токенов |
| PATCH | `/api/admin/tokens/:id` | Обновить original/normalized/vocabId |

---

### 13. Токенизация (`/api/admin/tokenization`)

**Файл:** [src/admin/tokenization/](../src/admin/tokenization/)

Управление пайплайном обработки текстов на платформе.

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET (SSE) | `/api/admin/tokenization/events` | Поток событий (progress, status_change, queue_changed) |
| GET | `/api/admin/tokenization/stats` | Сводная статистика по токенам |
| GET | `/api/admin/tokenization/distribution` | Donut: total/analyzed/ambiguous/notFound + sources |
| GET | `/api/admin/tokenization/texts` | Список текстов с данными токенизации |
| GET | `/api/admin/tokenization/queue` | Очередь обработки (RUNNING) |
| GET | `/api/admin/tokenization/settings` | Глобальные настройки пайплайна |
| PATCH | `/api/admin/tokenization/settings` | Частичное обновление настроек |
| POST | `/api/admin/tokenization/run` | Запустить пакетную обработку (`scope: pending\|errors\|all`) |
| POST | `/api/admin/tokenization/bulk/run` | Запуск для выбранных текстов |
| POST | `/api/admin/tokenization/bulk/reset` | Сброс токенов выбранных текстов |
| GET | `/api/admin/tokenization/texts/:textId` | Детализация текста |
| GET | `/api/admin/tokenization/texts/:textId/tokens` | Проблемные токены (NOT_FOUND, AMBIGUOUS) |
| POST | `/api/admin/tokenization/texts/:textId/run` | (Пере-)обработать текст |
| DELETE | `/api/admin/tokenization/texts/:textId/run` | Отмена обработки (статус IDLE) |
| DELETE | `/api/admin/tokenization/texts/:textId/tokens` | Сброс всех TextProcessingVersion |

---

### 14. Системные логи (`/api/admin/logs`)

**Файл:** [src/admin/system-logs/](../src/admin/system-logs/)

**Требуемое разрешение:** `CAN_VIEW_LOGS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/logs` | Список логов с пагинацией, поиском, фильтрами по service/level и табами |
| GET | `/api/admin/logs/stats` | KPI: total events, errors, warnings, avg response, error rate |
| GET | `/api/admin/logs/live?since=` | Свежие логи для live-режима |
| GET | `/api/admin/logs/export?format=csv\|json` | Экспорт |
| GET | `/api/admin/logs/services` | Статический список доступных сервисов |
| GET | `/api/admin/logs/:id` | Полные детали записи лога |

---

### 15. Разговорник (`/api/admin/phrasebook`)

**Файл:** [src/admin/phrasebook/](../src/admin/phrasebook/)

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/phrasebook/categories` | Категории + количество фраз |
| POST | `/api/admin/phrasebook/categories` | Создать категорию |
| PATCH | `/api/admin/phrasebook/categories/:id` | Обновить категорию |
| DELETE | `/api/admin/phrasebook/categories/:id` | Удалить категорию (с её фразами) |
| GET | `/api/admin/phrasebook/phrases?categoryId=` | Список фраз |
| POST | `/api/admin/phrasebook/phrases` | Создать фразу (со словами и примерами) |
| PATCH | `/api/admin/phrasebook/phrases/:id` | Обновить фразу (массивы words/examples заменяются целиком) |
| DELETE | `/api/admin/phrasebook/phrases/:id` | Удалить фразу |
| GET | `/api/admin/phrasebook/suggestions` | Предложения от пользователей |
| DELETE | `/api/admin/phrasebook/suggestions/:id` | Удалить предложение |

---

### 16. Юридические документы (`/api/admin/legal`)

**Файл:** [src/admin/legal/](../src/admin/legal/)

**Требуемое разрешение:** `CAN_MANAGE_LEGAL`

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/admin/legal` | Список (фильтры: slug, lang, isPublished) |
| GET | `/api/admin/legal/:id` | Документ по UUID |
| POST | `/api/admin/legal` | Создать документ (slug+lang уникальны) |
| PATCH | `/api/admin/legal/:id` | Обновить title/content (изменение content инкрементит version) |
| POST | `/api/admin/legal/:id/publish` | Опубликовать |
| POST | `/api/admin/legal/:id/unpublish` | Снять с публикации |
| DELETE | `/api/admin/legal/:id` | Удалить документ |

---

### 17. Загрузки (`/api/admin/uploads`)

**Файл:** [src/admin/uploads/](../src/admin/uploads/)

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/admin/uploads/cover` | Pre-upload обложки до создания текста. `multipart/form-data`, jpg/png/webp ≤ 2 МБ. Возвращает `{ imageUrl }` для последующей подстановки в `CreateTextDto.imageUrl` |

---

## Структура прав доступа

Источник истины: `ROLE_MATRIX` в [prisma/helpers/rbacHelper.ts](../prisma/helpers/rbacHelper.ts).

### Все коды разрешений (`PermissionCode`)

```
CAN_EDIT_TEXTS
CAN_EDIT_DICTIONARY
CAN_EDIT_MORPHOLOGY
CAN_MANAGE_USERS
CAN_MANAGE_BILLING
CAN_VIEW_ANALYTICS
CAN_VIEW_LOGS
CAN_MANAGE_FEATURE_FLAGS
CAN_MANAGE_FEEDBACK
CAN_MANAGE_LEGAL
```

### Матрица ролей

| Роль        | Разрешения |
|-------------|------------|
| LEARNER     | (нет — обычный пользователь) |
| SUPPORT     | CAN_VIEW_ANALYTICS, CAN_VIEW_LOGS, CAN_MANAGE_FEEDBACK |
| CONTENT     | CAN_EDIT_TEXTS |
| LINGUIST    | CAN_EDIT_DICTIONARY, CAN_EDIT_MORPHOLOGY |
| ADMIN       | CAN_EDIT_TEXTS, CAN_EDIT_DICTIONARY, CAN_MANAGE_USERS, CAN_VIEW_ANALYTICS, CAN_VIEW_LOGS, CAN_MANAGE_FEEDBACK, CAN_MANAGE_LEGAL |
| SUPERADMIN  | CAN_EDIT_TEXTS, CAN_EDIT_DICTIONARY, CAN_EDIT_MORPHOLOGY, CAN_MANAGE_USERS, CAN_MANAGE_BILLING, CAN_VIEW_ANALYTICS, CAN_VIEW_LOGS, CAN_MANAGE_FEATURE_FLAGS, CAN_MANAGE_FEEDBACK, CAN_MANAGE_LEGAL |

### Иерархия (схематично)

```
SUPERADMIN ─ полный доступ, единственная роль с CAN_MANAGE_BILLING и CAN_MANAGE_FEATURE_FLAGS
   │
ADMIN ─────── всё кроме биллинга, feature-flags и морфологии
   │
   ├── CONTENT   → CAN_EDIT_TEXTS
   ├── LINGUIST  → CAN_EDIT_DICTIONARY + CAN_EDIT_MORPHOLOGY
   └── SUPPORT   → CAN_VIEW_ANALYTICS + CAN_VIEW_LOGS + CAN_MANAGE_FEEDBACK
                                 │
                              LEARNER  (без admin-разрешений)
```

> Пользователь может иметь несколько ролей — итоговый набор прав вычисляется как объединение
> разрешений всех его ролей. Проверка выполняется в `AdminPermissionGuard` по декоратору
> `@AdminPermission(PermissionCode.X)` на каждом обработчике.
