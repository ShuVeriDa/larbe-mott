# Архитектура проекта

## Общая картина

MottLarbe — это REST API для платформы изучения чеченского языка. Фронтенд (отдельный репозиторий) общается с бэкендом по HTTP через `/api`.

```
Фронтенд (Next.js)
      │
      ▼ HTTP /api
┌─────────────────────────────────────────┐
│            NestJS Backend               │
│                                         │
│  [Guards] → [Controllers] → [Services]  │
│                  │                      │
│          [Prisma ORM]   [Redis]         │
└──────────────────┬──────────────────────┘
                   │
            ┌──────┴──────┐
            ▼             ▼
       PostgreSQL        Redis
```

## Слои приложения

### 1. Контроллеры (Controllers)
Принимают HTTP запросы, валидируют DTO, возвращают ответы.
Файлы: `src/*/**.controller.ts`

### 2. Сервисы (Services)
Вся бизнес-логика. Контроллеры вызывают сервисы.
Файлы: `src/*/**.service.ts`

### 3. Гварды (Guards)
Проверяют права доступа до того, как запрос попадёт в контроллер.

| Guard | Файл | Что делает |
|-------|------|-----------|
| `JwtAuthGuard` | `src/auth/guards/` | Проверяет JWT access токен |
| `PremiumGuard` | `src/auth/guards/` | Проверяет наличие активной подписки |
| `ThrottlerGuard` | глобально | Rate limiting (100 запросов/60 сек) |

### 4. Декораторы
Удобные обёртки для использования в контроллерах.

| Декоратор | Что делает |
|-----------|-----------|
| `@Auth()` | Требует JWT авторизацию |
| `@Admin()` | Требует роль ADMIN или SUPERADMIN |
| `@Premium()` | Требует активную подписку |
| `@Permission('CODE')` | Требует конкретное разрешение |
| `@User()` | Достаёт текущего пользователя из запроса |

### 5. Интерцепторы и фильтры
- **LoggingInterceptor** — логирует каждый запрос и ответ
- **AllExceptionsFilter** — перехватывает все ошибки, возвращает единый формат

---

## Конфигурация приложения

### Точка входа: `src/main.ts`

```
Порт:        9555 (или PORT из .env)
Префикс API: /api
CORS:        разрешён с FRONTEND_URL
Swagger:     /api/docs (только в non-production)
Cookies:     для refresh токена
Helmet:      HTTP security заголовки
```

### Корневой модуль: `src/app.module.ts`

Регистрирует все модули приложения:
- ConfigModule — переменные окружения
- WinstonModule — логирование
- RedisModule — подключение к Redis
- ThrottlerModule — rate limiting через Redis
- + все feature-модули (Auth, User, Text, ...)

---

## Redis — для чего используется

| Назначение | Описание |
|-----------|---------|
| Rate limiting | Хранит счётчики запросов per-IP |
| Кеш токенов | Кеширует результат поиска по токену (слову) |
| Кеш словаря | Кеширует ответы от online dictionary API |

---

## Конвейер обработки текста

Когда текст загружается для изучения, он проходит такой конвейер:

```
Сырой текст (TipTap JSON)
        │
        ▼
  Tokenizer       — разбивает текст на слова с позициями
        │
        ▼
  Normalizer      — приводит слово к нормальной форме
        │
        ▼
  Dictionary      — ищет перевод/значение слова
  (3 источника):
    1. Admin Dict  — слова, добавленные администратором
    2. Cache       — кешированные результаты
    3. Online Dict — внешний словарный API
        │
        ▼ (если не нашли)
  Morphology      — морфологический анализ (суффиксы, формы)
        │
        ▼ (если всё равно не нашли)
  UnknownWord     — сохраняем слово как "неизвестное"
        │
        ▼
  TextToken       — сохраняем результат в БД
```

---

## Логирование

Используется **Winston** с ротацией файлов:
- `logs/error.log` — только ошибки
- `logs/combined.log` — всё
- В development: красивый вывод в консоль
- В production: JSON формат

Настройка: [src/logger/logger.config.ts](../src/logger/logger.config.ts)

---

## Переменные окружения

| Переменная | Описание |
|-----------|---------|
| `DATABASE_URL` | Строка подключения к PostgreSQL |
| `REDIS_URL` | Строка подключения к Redis |
| `PORT` | Порт сервера (по умолчанию 9555) |
| `NODE_ENV` | Окружение: development / production |
| `FRONTEND_URL` | URL фронтенда для CORS |
| `JWT_ACCESS_SECRET` | Секрет для access токенов |
| `JWT_REFRESH_SECRET` | Секрет для refresh токенов |
| `ACCESS_TOKEN_EXPIRES_IN` | Время жизни access токена (1h) |
| `REFRESH_TOKEN_EXPIRES_IN` | Время жизни refresh токена (7d) |
| `REFRESH_TOKEN_NAME` | Имя cookie для refresh токена |
| `DOMAIN` | Домен для cookie |
