# База данных

Используется **PostgreSQL** через **Prisma ORM**.
Схема: [prisma/schema.prisma](../prisma/schema.prisma)

---

## Перечисления (Enums)

| Enum | Значения | Описание |
|------|---------|---------|
| `RoleName` | LEARNER, SUPPORT, CONTENT, LINGUIST, ADMIN, SUPERADMIN | Роли пользователей |
| `PermissionCode` | CAN_EDIT_TEXTS, CAN_EDIT_DICTIONARY, CAN_EDIT_MORPHOLOGY, CAN_MANAGE_USERS, CAN_MANAGE_BILLING, CAN_VIEW_ANALYTICS, CAN_VIEW_LOGS, CAN_MANAGE_FEATURE_FLAGS, CAN_MANAGE_FEEDBACK, CAN_MANAGE_LEGAL | Коды разрешений |
| `FeatureFlagCategory` | FUNCTIONAL, EXPERIMENTS, TECHNICAL, MONETIZATION | Категории фича-флагов |
| `FeatureFlagEnvironment` | PROD, STAGE, DEV | Среды применения фича-флага |
| `FeatureFlagHistoryEventType` | FLAG_CREATED, FLAG_UPDATED, FLAG_DELETED, GLOBAL_ENABLED, GLOBAL_DISABLED, ROLLOUT_CHANGED, ENVIRONMENTS_CHANGED, OVERRIDE_ADDED, OVERRIDE_UPDATED, OVERRIDE_REMOVED, FLAG_DUPLICATED, FLAGS_IMPORTED | Типы событий в истории фича-флагов |
| `PlanType` | FREE, BASIC, PRO, PREMIUM, LIFETIME | Тарифные планы |
| `SubscriptionStatus` | TRIALING, ACTIVE, CANCELED, EXPIRED | Статус подписки |
| `PaymentProvider` | STRIPE, PAYPAL, PADDLE, LEMONSQUEEZY, MANUAL | Провайдеры оплаты |
| `PaymentStatus` | PENDING, SUCCEEDED, FAILED, REFUNDED | Статус платежа |
| `CouponType` | PERCENT, FIXED | Тип промокода |
| `SubscriptionEventType` | SUBSCRIBED, RENEWED, UPGRADED, DOWNGRADED, CANCELED, REFUNDED, TRIAL_STARTED, TRIAL_ENDED, EXTENDED, PLAN_CHANGED | События жизненного цикла подписки |
| `Language` | CHE, RU, AR, EN | Языки контента |
| `GrammaticalCase` | NOM, GEN, DAT, ERG, INS, LOC, ALL | Грамматические падежи |
| `GrammaticalNumber` | SG, PL | Грамматическое число |
| `Level` | A1, A2, B1, B2, C1, C2 | Уровни CEFR |
| `WordStatus` | NEW, LEARNING, KNOWN | Статус слова у пользователя |
| `UnknownWordStatus` | PENDING, ADDED_TO_DICTIONARY, LINKED_TO_LEMMA, DELETED | Статус неизвестного слова |
| `DeckType` | NEW, OLD, RETIRED, NUMBERED | Тип колоды карточек |
| `WordRelationType` | SYNONYM, ANTONYM, DERIVED, FAMILY | Тип семантической связи между леммами |
| `TokenStatus` | ANALYZED, AMBIGUOUS, NOT_FOUND | Статус анализа токена |
| `AnalysisSource` | ADMIN, CACHE, ONLINE, MORPHOLOGY | Источник анализа токена |
| `MorphRuleType` | NOUN_CASE, PLURAL, VERB_PAST, SUFFIX, ENDING, PREFIX, REGEX | Тип морфологического правила |
| `DictionarySource` | ADMIN, IMPORT, ONLINE, CACHE | Источник словарной статьи |
| `UserStatus` | ACTIVE, BLOCKED, FROZEN, DELETED | Статус аккаунта |
| `ProcessingStatus` | IDLE, RUNNING, COMPLETED, ERROR | Статус обработки текста |
| `ProcessingTrigger` | MANUAL, AUTO_ON_SAVE, AUTO_ON_CREATE | Триггер запуска обработки |
| `LogLevel` | INFO, OK, WARN, ERROR | Уровень лога |
| `JobStatus` | PENDING, RUNNING, COMPLETED, FAILED, CANCELLED | Статус задачи в очереди |
| `UserEventType` | START_SESSION, OPEN_TEXT, CLICK_WORD, ADD_TO_DICTIONARY, FAIL_LOOKUP, READ_SESSION, REVIEW_SESSION, PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED, PASSWORD_CHANGED, EMAIL_CHANGE_REQUESTED, EMAIL_CHANGE_COMPLETED | Типы пользовательских событий для аналитики |
| `FeedbackType` | QUESTION, BUG, IDEA, COMPLAINT | Тип обращения |
| `FeedbackStatus` | NEW, IN_PROGRESS, ANSWERED, RESOLVED | Статус обращения |
| `FeedbackPriority` | LOW, MEDIUM, HIGH, CRITICAL | Приоритет обращения |
| `FeedbackContextType` | WORD, SENTENCE, TEXT | Тип контекста обращения |
| `ReactionType` | HELPFUL, NOT_HELPFUL, DIFFICULT | Тип быстрой реакции |
| `FeedbackAuthorType` | USER, ADMIN | Тип автора сообщения |
| `FeedbackMessageType` | PUBLIC_REPLY, INTERNAL_NOTE | Тип сообщения в треде |

---

## Группы моделей

### Пользователи и сессии

| Модель | Описание |
|--------|---------|
| `User` | Аккаунт пользователя. Поля: email, password (хеш), username, name, surname, phone, avatar, status, language, level, signupAt, lastActiveAt |
| `UserSession` | Сессия входа. Хранит IP, user-agent, даты активности и отзыва |
| `PasswordResetToken` | Токен сброса пароля (argon2-хеш) с аудитом IP/UA |
| `EmailChangeToken` | Токен подтверждения смены email (argon2-хеш) с аудитом |

### Роли и разрешения (RBAC)

| Модель | Описание |
|--------|---------|
| `Role` | Роль: LEARNER, ADMIN, SUPERADMIN и т.д. |
| `Permission` | Разрешение: конкретный код действия |
| `RolePermission` | Связь роль → разрешения |
| `UserRoleAssignment` | Назначение роли пользователю с датами и автором |

### Фича-флаги

| Модель | Описание |
|--------|---------|
| `FeatureFlag` | Глобальный переключатель: ключ, категория, среды, процент раскатки |
| `UserFeatureFlag` | Персональный override фича-флага для конкретного пользователя |
| `FeatureFlagHistory` | История изменений фича-флагов (аудит действий админов) |

### Биллинг

| Модель | Описание |
|--------|---------|
| `Plan` | Тарифный план: код, тип, цена, валюта, интервал, лимиты, витринные поля (цвет/иконка/буллеты), trialDays |
| `Subscription` | Подписка пользователя: план, статус, даты, провайдер, isLifetime |
| `SubscriptionEvent` | События жизненного цикла подписки (продление, апгрейд, отмена и т.д.) |
| `Payment` | Платёж: сумма, валюта, провайдер, статус, refundedCents |
| `Coupon` | Промокод: тип (percent/fixed), скидка, лимиты, срок, ограничения |
| `CouponRedemption` | Применение промокода пользователем |

### Словарь и лексика

| Модель | Описание |
|--------|---------|
| `DictionaryEntry` | Словарная статья: rawWord, rawTranslate, заметки, источник |
| `DictionaryCache` | Кеш нормализованных слов для быстрого поиска и оффлайн-фолбэка |
| `Headword` | Заглавное слово (форма написания) в словарной статье |
| `Lemma` | Лемма (базовая форма): POS, частотность, транслитерация, аудио, класс склонения, домен |
| `MorphForm` | Морфологическая форма леммы (падеж, число, тег, перевод) |
| `Sense` | Значение/перевод словарной статьи |
| `Example` | Пример использования (с привязкой к Text или свободной подписью) |
| `WordRelation` | Связь между леммами: синоним/антоним/производное/семья |
| `UserDictionaryEntry` | Слово в личном словаре пользователя (с уровнем обучения, CEFR) |
| `UserDictionaryFolder` | Папка для организации личного словаря (цвет/иконка/порядок) |

### Тексты

| Модель | Описание |
|--------|---------|
| `Text` | Учебный текст: заголовок, описание, уровень, язык, автор, источник, статус публикации, флаги обработки |
| `TextPage` | Страница текста: TipTap JSON (contentRich) и plain (contentRaw) |
| `Tag` | Тег для категоризации текстов |
| `TextTag` | Связь текст ↔ тег |
| `UserTextBookmark` | Закладка пользователя на текст |

### Обработка текстов и токенизация

| Модель | Описание |
|--------|---------|
| `TextProcessingVersion` | Версия обработки текста (повторная токенизация, флаги, инициатор) |
| `TextVersionLog` | Лог-сообщения версии обработки (INFO/OK/WARN/ERROR) |
| `TextToken` | Токен (слово) из страницы: позиция, оффсеты, статус анализа |
| `TextVocabulary` | Словарь конкретной версии текста (нормализованное слово → лемма/перевод) |
| `TokenAnalysis` | Результат анализа токена: связь токен → лемма с источником и вероятностью |
| `TokenizationSettings` | Singleton-настройки автотокенизации (id=1) |
| `TokenizationJob` | Задача очереди токенизации текста (PENDING/RUNNING/...) |

### Морфология

| Модель | Описание |
|--------|---------|
| `MorphologyRule` | Правило морфологического анализа: суффикс, тип, язык, приоритет, регулярка |

### Прогресс обучения и повторение

| Модель | Описание |
|--------|---------|
| `UserWordProgress` | Прогресс по слову: статус (NEW/LEARNING/KNOWN), SM-2 параметры (easeFactor, interval, nextReview) |
| `UserTextProgress` | Прогресс по тексту: процент, последняя страница, дата завершения |
| `WordContext` | Контекст использования слова в тексте (snippet) |
| `UserReviewLog` | Лог ответов SRS: quality 0–5, correct, intervalBefore/After |
| `UserDeckCard` | Карточка слова в авторской деке (NEW/OLD/RETIRED/NUMBERED) |
| `UserDeckState` | Состояние деки пользователя: текущий пронумерованный дек, лимиты в день, размер дека |

### Пользовательские события

| Модель | Описание |
|--------|---------|
| `UserEvent` | Событие пользователя для аналитики (тип + JSON metadata) |

### Разговорник (Phrasebook)

| Модель | Описание |
|--------|---------|
| `PhrasebookCategory` | Категория разговорника: emoji, название, порядок |
| `PhrasebookPhrase` | Фраза: оригинал, транслитерация, перевод, язык |
| `PhrasebookPhraseWord` | Пословный разбор фразы (оригинал/перевод/позиция) |
| `PhrasebookPhraseExample` | Пример употребления фразы с контекстом |
| `PhrasebookSuggestion` | Предложение фразы от пользователя (модерируется) |
| `UserPhrasebookSave` | Сохранённая пользователем фраза (избранное) |

### Настройки пользователя

| Модель | Описание |
|--------|---------|
| `UserPreferences` | Внешний вид (тема, UI-язык), ридер (шрифт, popupMode, highlightKnown), словарь (autoAdd, showGrammar, переводный язык), reviewReminder, enableDecks |
| `UserGoals` | Цели обучения: dailyWords, dailyMinutes, vocabularyGoal |
| `UserNotificationPreferences` | Email-уведомления (repeatReminder, weeklyReport, newTexts, supportReplies, marketing), reminderTime, timezone |

### Обратная связь

| Модель | Описание |
|--------|---------|
| `FeedbackThread` | Тред обращения: тип, статус, приоритет, ассайни, контекст (слово/предложение/текст) |
| `FeedbackMessage` | Сообщение в треде: автор (USER/ADMIN), тип (публичный/внутренняя заметка), флаги прочтения |
| `FeedbackReaction` | Быстрая реакция (полезно / не полезно / сложно) на лемму или текст |

### Неизвестные слова

| Модель | Описание |
|--------|---------|
| `UnknownWord` | Слово, не распознанное при обработке текста: счётчик встреч, статус разрешения |

### Юридические документы

| Модель | Описание |
|--------|---------|
| `LegalDocument` | Per-language страницы Privacy/Terms/Contact: slug+lang, версия, статус публикации |

---

## Ключевые связи

```
User
 ├── UserSession                  (входы/устройства)
 ├── UserRoleAssignment           (роли)
 ├── PasswordResetToken           (сброс пароля)
 ├── EmailChangeToken             (смена email)
 ├── UserFeatureFlag              (персональные оверрайды флагов)
 ├── Subscription                 (подписки)
 │    ├── Payment                 (платежи)
 │    └── SubscriptionEvent       (события подписки)
 ├── Payment                      (платежи)
 ├── CouponRedemption             (использованные промокоды)
 ├── UserDictionaryFolder         (папки личного словаря)
 │    └── UserDictionaryEntry     (слова в папке)
 ├── UserWordProgress             (SRS-прогресс по словам)
 ├── UserTextProgress             (прогресс по текстам)
 ├── UserTextBookmark             (закладки)
 ├── WordContext                  (контексты слов)
 ├── UserReviewLog                (лог SRS-ответов)
 ├── UserDeckCard                 (карточки в деках)
 ├── UserDeckState                (состояние деки)
 ├── UserEvent                    (события для аналитики)
 ├── FeedbackThread               (обращения)
 │    └── FeedbackMessage         (сообщения треда)
 ├── FeedbackReaction             (реакции)
 ├── UserPhrasebookSave           (сохранённые фразы)
 ├── PhrasebookSuggestion         (предложенные фразы)
 ├── UserPreferences              (настройки UI/ридера/словаря)
 ├── UserGoals                    (цели обучения)
 └── UserNotificationPreferences  (email-уведомления)

Plan
 └── Subscription
      ├── Payment
      │    └── CouponRedemption
      └── SubscriptionEvent

Coupon
 └── CouponRedemption

Role
 └── RolePermission ── Permission
Role ── UserRoleAssignment ── User

FeatureFlag
 ├── UserFeatureFlag        (персональные оверрайды)
 └── FeatureFlagHistory     (аудит изменений)

Text
 ├── TextPage                          (страницы, TipTap JSON)
 │    └── TextToken                    (токены страницы)
 ├── TextTag ── Tag
 ├── UserTextBookmark
 ├── UserTextProgress
 ├── WordContext
 ├── TokenizationJob                   (очередь токенизации)
 ├── TextProcessingVersion             (версии обработки)
 │    ├── TextVersionLog               (логи версии)
 │    ├── TextToken                    (токены версии)
 │    │    └── TokenAnalysis ── Lemma
 │    └── TextVocabulary ── Lemma
 ├── FeedbackThread (контекст)
 ├── FeedbackReaction
 └── Example (sourceTextId)

DictionaryEntry
 ├── Headword ── Lemma
 ├── Sense
 │    └── Example
 └── MorphForm ── Lemma

Lemma
 ├── Headword
 ├── MorphForm
 ├── TokenAnalysis
 ├── TextVocabulary
 ├── UserDictionaryEntry
 ├── UserWordProgress
 ├── UserReviewLog
 ├── WordContext
 ├── UserDeckCard
 ├── WordRelation (lemma ↔ related)
 ├── FeedbackThread (по контекстной лемме)
 └── FeedbackReaction

PhrasebookCategory
 ├── PhrasebookPhrase
 │    ├── PhrasebookPhraseWord       (пословный разбор)
 │    ├── PhrasebookPhraseExample    (примеры)
 │    └── UserPhrasebookSave         (сохранения)
 └── PhrasebookSuggestion            (предложения от юзеров)
```

---

## Команды Prisma

```bash
# Сгенерировать Prisma Client
npm run prisma:generate

# Открыть GUI для просмотра данных
npm run prisma:studio

# Форматировать schema.prisma
npm run prisma:format

# Валидировать schema.prisma
npm run prisma:validate

# Создать миграцию после изменения схемы
npm run migrate:dev

# Применить миграции (production)
npm run migrate:deploy

# Проверить статус миграций
npm run migrate:status

# Применить схему без миграции (только dev!)
npm run prisma:push

# Заполнить начальными данными
npm run seed

# Дополнительные сиды
npm run seed2
npm run seed:clear-texts
npm run seed:fake-users
```
