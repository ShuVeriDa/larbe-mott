# База данных

Используется **PostgreSQL** через **Prisma ORM**.
Схема: [prisma/schema.prisma](../prisma/schema.prisma)

---

## Перечисления (Enums)

| Enum | Значения | Описание |
|------|---------|---------|
| `RoleName` | LEARNER, SUPPORT, CONTENT, LINGUIST, ADMIN, SUPERADMIN | Роли пользователей |
| `PermissionCode` | CAN_EDIT_TEXTS, CAN_EDIT_DICTIONARY, CAN_MANAGE_USERS, и др. | Коды разрешений |
| `PlanType` | FREE, BASIC, PRO, PREMIUM, LIFETIME | Тарифные планы |
| `SubscriptionStatus` | TRIALING, ACTIVE, CANCELED, EXPIRED | Статус подписки |
| `PaymentProvider` | STRIPE, PAYPAL, PADDLE, LEMONSQUEEZY, MANUAL | Провайдеры оплаты |
| `Language` | CHE, RU | Языки |
| `Level` | A1, A2, B1, B2, C1, C2 | Уровни CEFR |
| `WordStatus` | NEW, LEARNING, KNOWN | Статус слова у пользователя |
| `TokenStatus` | ANALYZED, AMBIGUOUS, NOT_FOUND | Статус анализа токена |
| `UserStatus` | ACTIVE, BLOCKED, FROZEN, DELETED | Статус аккаунта |
| `FeedbackType` | QUESTION, BUG, IDEA, COMPLAINT | Тип обращения |
| `DeckType` | NEW, OLD, RETIRED, NUMBERED | Тип колоды карточек |

---

## Группы моделей

### Пользователи и сессии

| Модель | Описание |
|--------|---------|
| `User` | Аккаунт пользователя. Поля: email, password (хеш), имя, статус, аватар |
| `UserSession` | Сессия входа. Хранит IP, user-agent, refresh токен |
| `UserFeatureFlag` | Персональные переключатели фич для конкретного пользователя |
| `FeatureFlag` | Глобальные переключатели фич (вкл/выкл функционал) |

### Роли и разрешения (RBAC)

| Модель | Описание |
|--------|---------|
| `Role` | Роль: LEARNER, ADMIN, SUPERADMIN и т.д. |
| `Permission` | Разрешение: конкретный код действия |
| `RolePermission` | Связь роль → разрешения |
| `UserRoleAssignment` | Какие роли назначены пользователю, с датами |

### Биллинг

| Модель | Описание |
|--------|---------|
| `Plan` | Тарифный план: название, цена, лимиты, описание |
| `Subscription` | Подписка пользователя: какой план, статус, даты |
| `Payment` | Запись платежа: сумма, провайдер, статус |
| `Coupon` | Промокод: скидка, срок действия, макс. использований |
| `CouponRedemption` | Кто и когда применил промокод |

### Словарь и лексика

| Модель | Описание |
|--------|---------|
| `DictionaryEntry` | Словарная статья, добавленная администратором |
| `DictionaryCache` | Кеш нормализованных слов для быстрого поиска |
| `Headword` | Заглавное слово (форма написания) в словарной статье |
| `Lemma` | Лемма (базовая форма слова). Содержит: POS (часть речи), частотность |
| `MorphForm` | Морфологическая форма леммы (падеж, число, время и т.д.) |
| `Sense` | Значение/перевод леммы |
| `Example` | Пример использования слова |
| `UserDictionaryEntry` | Слово в личном словаре пользователя |
| `UserDictionaryFolder` | Папка для организации личного словаря |

### Тексты

| Модель | Описание |
|--------|---------|
| `Text` | Учебный текст: заголовок, описание, уровень, язык, статус публикации |
| `TextPage` | Страница текста в формате TipTap JSON (rich text) |
| `TextToken` | Токен (слово) из текста с результатом анализа и позицией |
| `TextVocabulary` | Список словаря для конкретной версии текста |
| `TextProcessingVersion` | Версия обработки текста (для повторной обработки) |

### Морфология

| Модель | Описание |
|--------|---------|
| `MorphologyRule` | Правило морфологического анализа (суффиксы, паттерны) |
| `TokenAnalysis` | Результат анализа: связь токен → лемма |

### Прогресс обучения

| Модель | Описание |
|--------|---------|
| `UserWordProgress` | Прогресс пользователя по слову: статус (NEW/LEARNING/KNOWN), SM-2 параметры |
| `UserTextProgress` | Процент прочитанности текста |
| `WordContext` | Контекст использования слова в текстах пользователя |
| `UserDeckCard` | Карточка в колоде для повторения |
| `UserDeckState` | Текущее состояние колоды пользователя |
| `UserEvent` | Событие обучения для аналитики (просмотр слова, повторение и т.д.) |

### Обратная связь

| Модель | Описание |
|--------|---------|
| `FeedbackThread` | Тред обращения: тип (баг/вопрос/идея), статус |
| `FeedbackMessage` | Сообщение в треде (от пользователя или администратора) |
| `FeedbackReaction` | Быстрая реакция на слово/контент |

### Неизвестные слова

| Модель | Описание |
|--------|---------|
| `UnknownWord` | Слово, которое система не смогла распознать при обработке текста |

---

## Ключевые связи

```
User
 ├── UserSession          (входы в систему)
 ├── UserRoleAssignment   (назначенные роли)
 ├── Subscription         (подписка)
 ├── UserWordProgress     (прогресс по словам)
 ├── UserTextProgress     (прогресс по текстам)
 ├── UserDictionaryEntry  (личный словарь)
 ├── FeedbackThread       (обращения в поддержку)
 └── UserDeckState        (состояние колоды)

Text
 ├── TextPage             (страницы)
 └── TextToken            (токены/слова с анализом)
      └── TokenAnalysis   (связь с леммой)
           └── Lemma
                ├── MorphForm   (формы слова)
                ├── Sense       (значения/переводы)
                └── Example     (примеры)

Plan
 └── Subscription         (подписки пользователей)
      └── Payment         (платежи)
```

---

## Команды Prisma

```bash
# Открыть GUI для просмотра данных
npm run prisma:studio

# Создать миграцию после изменения схемы
npm run migrate:dev

# Применить миграции (production)
npm run migrate:deploy

# Применить схему без миграции (только dev!)
npm run prisma:push

# Заполнить начальными данными
npm run seed
```
