# Словарь

Модули: [src/dictionary/](../src/dictionary/), [src/words/](../src/words/), [src/token/](../src/token/)

---

## Три уровня словарной системы

```
1. Системный словарь (DictionaryEntry, Lemma, Sense)
   └── Ведётся администраторами
   └── Содержит переводы, примеры, грамматику

2. Кеш словаря (DictionaryCache)
   └── Автоматический кеш запросов к внешнему API
   └── Ускоряет повторные поиски

3. Личный словарь пользователя (UserDictionaryEntry)
   └── Пользователь добавляет слова сам
   └── Организуется по папкам
```

---

## Как пользователь взаимодействует со словарём

### Клик на слово в тексте

Пользователь читает текст и кликает на незнакомое слово:

```
Клик на токен (tokenId)
        │
        ▼
GET /api/token/:tokenId
        │
        ▼ (TokenService ищет по цепочке)
  Admin Dict → Cache → Online → Morphology
        │
        ▼
Результат: лемма + переводы + грамматика
```

### Поиск по введённому слову

```
GET /api/words/lookup?word=нохчийн
        │
        ▼
WordsService: поиск по строке слова
        │
        ▼
Лемма + значения + примеры использования
```

---

## API Endpoints

### Токены (клик на слово)
| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/token/:tokenId` | Информация по токену из текста |

### Слова
| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/words/lookup` | Поиск слова по строке |
| GET | `/api/words/:lemmaId/examples` | Примеры использования леммы |

### Личный словарь
| Метод | URL | Описание |
|-------|-----|---------|
| GET | `/api/dictionary` | Мой словарь (все слова) |
| POST | `/api/dictionary` | Добавить слово в словарь |
| PATCH | `/api/dictionary/:id` | Обновить запись |
| DELETE | `/api/dictionary/:id` | Удалить из словаря |
| GET | `/api/dictionary/folders` | Мои папки |
| POST | `/api/dictionary/folders` | Создать папку |
| PATCH | `/api/dictionary/folders/:id` | Переименовать папку |
| DELETE | `/api/dictionary/folders/:id` | Удалить папку |

---

## Структура словарной статьи

```
DictionaryEntry (словарная статья)
 └── Headword[] (заглавные слова — разные написания)
      └── Lemma (лемма — базовая форма)
           ├── part_of_speech (существительное, глагол и т.д.)
           ├── frequency (частотность в корпусе)
           ├── MorphForm[] (все морфологические формы)
           ├── Sense[] (значения/переводы)
           │    └── Example[] (примеры с переводом)
           └── WordContext[] (реальные контексты из текстов)
```

### Пример:
```
Статья: "мотт" (язык)
  Headword: "мотт"
  Lemma: "мотт"
    POS: существительное
    Frequency: 1250
    MorphForms: мотт, моттан, моттана, моттах ...
    Senses:
      - язык (часть тела)
      - язык (речь, наречие)
    Examples:
      - "Нохчийн мотт" — Чеченский язык
```

---

## Личный словарь пользователя

Пользователь может:
1. Добавить любое слово в личный словарь
2. Организовать слова по папкам
3. Задать статус: `NEW` / `LEARNING` / `KNOWN`
4. Слова из личного словаря участвуют в системе повторения (SM-2)

---

## Кеширование

**TokenInfoCache** ([src/cache/](../src/cache/)) — кешируем в Redis результат поиска по токену. Это важно, потому что один и тот же токен может встречаться в тексте много раз.

**DictionaryCache** — кешируем ответы от Online Dictionary API, чтобы не делать лишних HTTP запросов.

---

## Файлы модуля

| Файл | Описание |
|------|---------|
| [token.service.ts](../src/token/token.service.ts) | Поиск по tokenId с цепочкой источников |
| [words.service.ts](../src/words/words.service.ts) | Поиск слов по строке |
| [word-examples.service.ts](../src/words/word-examples.service.ts) | Получение примеров |
| [word-lookup-by-word.service.ts](../src/words/word-lookup-by-word.service.ts) | Поиск по слову |
| [dictionary.service.ts](../src/dictionary/dictionary.service.ts) | Личный словарь |
| [folders.service.ts](../src/dictionary/folders.service.ts) | Папки словаря |
| [dictionary-cache/](../src/markup-engine/dictionary-cache/) | Кеш-слой словаря |
| [online-dictionary/](../src/markup-engine/online-dictionary/) | Внешний API словаря |
