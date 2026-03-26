# Административные функции

Модуль: [src/admin/](../src/admin/)

Все маршруты начинаются с `/api/admin/`.
Требуют роль `ADMIN` или `SUPERADMIN`, или конкретное разрешение.

---

## Подмодули администратора

### 1. Управление пользователями (`/api/admin/users`)
**Файл:** [src/admin/users/](../src/admin/users/)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/users` | Список всех пользователей |
| GET | `/api/admin/users/:id` | Профиль пользователя |
| PATCH | `/api/admin/users/:id/status` | Заблокировать / разморозить / удалить |
| POST | `/api/admin/users/:id/roles` | Назначить роль пользователю |
| DELETE | `/api/admin/users/:id/roles/:role` | Снять роль |

**Требуемое разрешение:** `CAN_MANAGE_USERS`

---

### 2. Управление текстами (`/api/admin/texts`)
**Файл:** [src/admin/text/](../src/admin/text/)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/texts` | Все тексты (включая черновики), с `wordCount` и `tags` |
| POST | `/api/admin/texts` | Создать новый текст (с тегами через `tagIds`) |
| PATCH | `/api/admin/texts/:id` | Обновить текст (любые поля включая `tagIds`) |
| DELETE | `/api/admin/texts/:id` | Удалить текст и все связанные данные |

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

#### POST /api/admin/texts — тело запроса

Все поля кроме `tagIds` и `pages` заполняются сразу при создании.

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

| Поле | Тип | Обязательный | Описание |
|------|-----|-------------|---------|
| `title` | string (2–50 симв.) | Да | Название текста |
| `language` | `CHE` \| `RU` \| `AR` \| `EN` | Да | Язык текста |
| `level` | `A1`–`C2` | Нет | Уровень сложности |
| `author` | string (2–50 симв.) | Да | Автор |
| `source` | string | Нет | Источник |
| `tagIds` | UUID[] | Нет | Массив ID тегов. Теги должны существовать в `/api/admin/tags` |
| `pages` | Page[] | Да (мин. 1) | Страницы в формате TipTap JSON |

> Текст создаётся как **черновик** (`publishedAt: null`). Для публикации — `PATCH` с `"publishedAt": "2026-03-26T00:00:00.000Z"`.

#### PATCH /api/admin/texts/:id — тело запроса

Все поля опциональны — отправляй только то, что нужно изменить.

```json
{
  "title": "Новое название",
  "level": "B1",
  "tagIds": ["uuid-нового-тега"],
  "publishedAt": "2026-03-26T00:00:00.000Z"
}
```

| Поле | Описание |
|------|---------|
| `title` | Новое название |
| `language` | Новый язык |
| `level` | Новый уровень |
| `author` | Новый автор |
| `source` | Новый источник |
| `publishedAt` | ISO-дата — публикует; `null` — снимает с публикации; отсутствие — не меняет |
| `tagIds` | Полностью заменяет теги текста. `[]` — снять все теги |
| `pages` | Полностью заменяет все страницы. Запускает переобработку токенов |

---

### 3. Управление тегами (`/api/admin/tags`)
**Файл:** [src/admin/tags/](../src/admin/tags/)

Теги — глобальный справочник меток для категоризации текстов. Сначала создай теги, затем назначай их текстам через `tagIds`.

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/tags` | Список всех тегов с количеством текстов |
| POST | `/api/admin/tags` | Создать тег |
| PATCH | `/api/admin/tags/:id` | Переименовать тег |
| DELETE | `/api/admin/tags/:id` | Удалить тег (снимается со всех текстов) |

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

#### GET /api/admin/tags — ответ

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

#### POST /api/admin/tags — тело

```json
{ "name": "Литература" }
```

> Имя тега уникально. Повторное создание → `409 Conflict`.

#### PATCH /api/admin/tags/:id — тело

```json
{ "name": "Новое название" }
```

#### DELETE /api/admin/tags/:id

Ответ `204 No Content`. Тег удаляется из всех текстов автоматически (cascade).

---

### 3. Управление словарём (`/api/admin/dictionary`)
**Файл:** [src/admin/dictionary/](../src/admin/dictionary/)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/dictionary` | Список всех словарных статей |
| POST | `/api/admin/dictionary` | Создать статью |
| PATCH | `/api/admin/dictionary/:id` | Обновить статью |
| DELETE | `/api/admin/dictionary/:id` | Удалить статью |
| POST | `/api/admin/dictionary/:id/senses` | Добавить значение |
| POST | `/api/admin/dictionary/:id/examples` | Добавить пример |

**Требуемое разрешение:** `CAN_EDIT_DICTIONARY`

---

### 4. Управление морфологией (`/api/admin/morphology`)
**Файл:** [src/admin/morphology/](../src/admin/morphology/)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/morphology/rules` | Список правил |
| POST | `/api/admin/morphology/rules` | Добавить правило |
| PATCH | `/api/admin/morphology/rules/:id` | Изменить правило |
| DELETE | `/api/admin/morphology/rules/:id` | Удалить правило |
| POST | `/api/admin/morphology/import` | Импортировать правила из файла |

Морфологические правила — это паттерны суффиксов и окончаний чеченских слов. Чем больше правил — тем лучше анализ текстов.

**Требуемое разрешение:** `CAN_MANAGE_MORPHOLOGY`

---

### 5. Биллинг (`/api/admin/billing`)
**Файл:** [src/admin/billing/](../src/admin/billing/)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/billing/plans` | Список тарифных планов |
| POST | `/api/admin/billing/plans` | Создать план |
| PATCH | `/api/admin/billing/plans/:id` | Обновить план |
| GET | `/api/admin/billing/subscriptions` | Все подписки |
| PATCH | `/api/admin/billing/subscriptions/:id` | Изменить подписку |
| GET | `/api/admin/billing/payments` | История платежей |
| POST | `/api/admin/billing/payments/:id/refund` | Возврат платежа |
| GET | `/api/admin/billing/coupons` | Промокоды |
| POST | `/api/admin/billing/coupons` | Создать промокод |
| DELETE | `/api/admin/billing/coupons/:id` | Удалить промокод |

**Требуемое разрешение:** `CAN_MANAGE_BILLING`

---

### 6. Аналитика (`/api/admin/analytics`)
**Файл:** [src/admin/analytics/](../src/admin/analytics/)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/analytics/overview` | Общая статистика платформы |
| GET | `/api/admin/analytics/users` | Активность пользователей |
| GET | `/api/admin/analytics/learning` | Метрики обучения |

**Требуемое разрешение:** `CAN_VIEW_ANALYTICS`

---

### 7. Обратная связь (`/api/admin/feedback`)
**Файл:** [src/admin/feedback/](../src/admin/feedback/)

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/feedback` | Все обращения пользователей |
| GET | `/api/admin/feedback/:threadId` | Конкретный тред |
| POST | `/api/admin/feedback/:threadId/reply` | Ответить пользователю |
| PATCH | `/api/admin/feedback/:threadId/status` | Изменить статус обращения |

**Требуемое разрешение:** `CAN_MANAGE_FEEDBACK`

---

### 8. Feature Flags (`/api/admin/feature-flags`)
**Файл:** [src/admin/feature-flags/](../src/admin/feature-flags/)

Feature flags — это переключатели, которые включают/выключают функциональность без деплоя.

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/feature-flags` | Список всех флагов |
| POST | `/api/admin/feature-flags` | Создать флаг |
| PATCH | `/api/admin/feature-flags/:id` | Включить/выключить глобально |
| POST | `/api/admin/feature-flags/:id/users` | Включить для конкретного пользователя |
| DELETE | `/api/admin/feature-flags/:id/users/:userId` | Убрать персональный флаг |

**Требуемое разрешение:** `CAN_MANAGE_FLAGS`

---

### 9. Неизвестные слова (`/api/admin/unknown-words`)
**Файл:** [src/admin/unknown-words/](../src/admin/unknown-words/)

Слова, которые система не смогла проанализировать при обработке текстов.
Администратор может просматривать их и добавлять в словарь.

| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/admin/unknown-words` | Список неизвестных слов |
| DELETE | `/api/admin/unknown-words/:id` | Удалить (если не нужно) |

---

### 10. Управление токенами (`/api/admin/tokens`)
**Файл:** [src/admin/token/](../src/admin/token/)

Управление проанализированными токенами (словами) в текстах.
Позволяет вручную корректировать результаты анализа.

---

## Структура прав доступа

```
SUPERADMIN → все разрешения
ADMIN      → все разрешения кроме управления другими ADMIN/SUPERADMIN
LINGUIST   → CAN_EDIT_DICTIONARY + CAN_MANAGE_MORPHOLOGY
CONTENT    → CAN_EDIT_TEXTS
SUPPORT    → CAN_MANAGE_FEEDBACK
```
