# Тексты и обработка

Модули: [src/text/](../src/text/), [src/markup-engine/](../src/markup-engine/)

---

## Что такое "текст" в платформе

Текст — это учебный материал на чеченском языке. Каждый текст:
- Разбит на **страницы** (для постраничного чтения)
- Хранится в формате **TipTap JSON** (rich text редактор)
- Имеет уровень сложности (A1–C2)
- После загрузки проходит **конвейер обработки** — каждое слово анализируется

---

## API Endpoints

### Тексты (OptionalAuth — работают с токеном и без)

| Метод | URL | Auth | Описание |
|-------|-----|------|---------|
| GET | `/api/texts` | Optional | Список опубликованных текстов с фильтрацией, поиском и прогрессом |
| GET | `/api/texts/continue-reading` | Bearer | Тексты в процессе чтения (0 < progress < 100) |
| GET | `/api/texts/:id` | Optional | Текст со всеми страницами |
| GET | `/api/texts/:id/pages/:pageNumber` | Optional | Одна страница + токены + прогресс |

---

### GET /api/texts — подробно

Возвращает список опубликованных текстов. Поддерживает мультиселект по языку и уровню, поиск и прогресс пользователя (если авторизован).

**Query-параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|---------|
| `language` | `CHE` \| `RU` \| `AR` \| `EN` | Нет | Один или несколько языков (повторить параметр). Если не указан — все языки. |
| `level` | `A1` \| `A2` \| `B1` \| `B2` \| `C1` \| `C2` | Нет | Один или несколько уровней (повторить параметр). Если не указан — все уровни. |
| `search` | string | Нет | Поиск по названию и автору (case-insensitive). |

**Примеры запросов:**

```
GET /api/texts
→ Все тексты

GET /api/texts?language=CHE
→ Только чеченские тексты

GET /api/texts?language=CHE&language=RU
→ Чеченские и русские тексты

GET /api/texts?level=A1&level=B1
→ Тексты уровней A1 и B1

GET /api/texts?language=RU&level=B1&search=рассказ
→ Русские тексты уровня B1, в названии или авторе которых есть «рассказ»
```

**Ответ (массив объектов):**

```json
[
  {
    "id": "uuid",
    "title": "Название текста",
    "level": "B1",
    "language": "RU",
    "author": "Автор",
    "source": null,
    "imageUrl": null,
    "publishedAt": "2026-01-01T00:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "wordCount": 420,
    "progressPercent": 35.5,
    "lastOpened": "2026-03-20T10:00:00.000Z"
  }
]
```

> `progressPercent` и `lastOpened` возвращаются только если запрос авторизован (Bearer token). Иначе `progressPercent: 0`, `lastOpened: null`.

---

### GET /api/texts/continue-reading — подробно

Возвращает тексты, которые пользователь начал читать, но не дочитал (0 < progressPercent < 100). Отсортированы по `lastOpened` (последние открытые — первые).

**Требует авторизации (Bearer).**

**Query-параметры:** отсутствуют.

**Ответ (массив объектов):**

```json
[
  {
    "id": "uuid",
    "title": "Название текста",
    "level": "B1",
    "language": "RU",
    "author": "Автор",
    "imageUrl": null,
    "wordCount": 420,
    "progressPercent": 35.5,
    "lastOpened": "2026-03-20T10:00:00.000Z",
    "currentPage": 3,
    "totalPages": 8
  }
]
```

> `currentPage` вычисляется как `ceil(progressPercent / 100 * totalPages)`.

---

### Зачем постраничная загрузка?
Тексты могут быть большими. Загружать по одной странице — быстрее и не грузит сеть.

---

## Структура текста в БД

```
Text (заголовок, описание, уровень, язык)
 └── TextPage[] (страницы в формате TipTap JSON)
      └── TextToken[] (каждое слово с результатом анализа)
           └── TokenAnalysis[] (связь слово → лемма)
```

---

## Конвейер обработки текста

Когда текст добавляется или обновляется, каждое слово проходит анализ:

### Шаг 1: Токенизация
**Модуль:** [src/markup-engine/tokenizer/](../src/markup-engine/tokenizer/)

Текст разбивается на токены (слова). Для каждого токена сохраняется:
- Позиция в тексте
- Оригинальное написание
- Статус: `ANALYZED` / `AMBIGUOUS` / `NOT_FOUND`

### Шаг 2: Нормализация
**Модуль:** [src/markup-engine/normalizer/](../src/markup-engine/normalizer/)

Слово приводится к нормальной форме для поиска в словаре:
- Приводится к нижнему регистру
- Убираются знаки препинания
- Специальная обработка чеченских символов

### Шаг 3: Поиск в словаре (3 источника, по порядку)
**Модуль:** [src/markup-engine/dictionary/](../src/markup-engine/dictionary/)

```
1. Admin Dictionary    — статьи, добавленные вручную администратором
        │ не нашли
        ▼
2. Dictionary Cache    — кешированные результаты предыдущих поисков
        │ не нашли
        ▼
3. Online Dictionary   — внешний API словаря (HTTP запрос)
```

Если нашли на любом шаге — сохраняем результат в кеш, выходим.

### Шаг 4: Морфологический анализ
**Модуль:** [src/markup-engine/morphology/](../src/markup-engine/morphology/)

Если словарь не дал результата, пробуем морфологию:

```
Слово "книги"
    │
    ▼ Суффиксный анализ
    │
    ├── Падежный анализ (окончания существительных)
    ├── Анализ числа (единственное/множественное)
    ├── Глагольные формы (время, лицо)
    └── Правила из MorphologyRule в БД
    │
    ▼
  Лемма "книга" + форма "родительный падеж"
```

Морфологические правила хранятся в БД (`MorphologyRule`) и могут обновляться администратором.

### Шаг 5: Неизвестное слово
**Модуль:** [src/markup-engine/unknown-word/](../src/markup-engine/unknown-word/)

Если ни один метод не дал результата — слово сохраняется в `UnknownWord`.
Администраторы могут просматривать эти слова и добавлять их в словарь.

---

## Формат TipTap JSON

Контент страниц хранится в формате TipTap — это JSON структура rich-text редактора. Пример:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Нохчийн мотт" }
      ]
    }
  ]
}
```

---

## Версионирование обработки

Каждый раз когда текст переобрабатывается (например, улучшились правила морфологии), создаётся новая запись `TextProcessingVersion`. Это позволяет:
- Отслеживать историю обработки
- Не трогать уже обработанные данные

---

## Файлы модуля

| Файл | Описание |
|------|---------|
| [text.service.ts](../src/text/text.service.ts) | Логика работы с текстами |
| [text.controller.ts](../src/text/text.controller.ts) | HTTP эндпоинты |
| [markup-engine/tokenizer/](../src/markup-engine/tokenizer/) | Токенизация |
| [markup-engine/normalizer/](../src/markup-engine/normalizer/) | Нормализация |
| [markup-engine/dictionary/](../src/markup-engine/dictionary/) | Поиск в словаре |
| [markup-engine/morphology/morphology.service.ts](../src/markup-engine/morphology/morphology.service.ts) | Морфологический анализ |
| [markup-engine/morphology/rule-engine.service.ts](../src/markup-engine/morphology/rule-engine.service.ts) | Движок правил |
| [markup-engine/unknown-word/](../src/markup-engine/unknown-word/) | Неизвестные слова |
