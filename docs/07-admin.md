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
| GET | `/api/admin/texts` | Все тексты (включая черновики) |
| POST | `/api/admin/texts` | Создать новый текст |
| PATCH | `/api/admin/texts/:id` | Обновить текст |
| DELETE | `/api/admin/texts/:id` | Удалить текст |
| POST | `/api/admin/texts/:id/publish` | Опубликовать текст |
| POST | `/api/admin/texts/:id/process` | Запустить обработку текста (токенизация) |

**Требуемое разрешение:** `CAN_EDIT_TEXTS`

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
