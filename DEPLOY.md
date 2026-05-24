# Deploy checklist

## После каждого деплоя

### 1. Переменные окружения

Скопировать `.env` на сервер и заполнить все значения. Обязательные:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `FRONTEND_URL`

### 2. Миграции Prisma

```bash
npx prisma migrate deploy
```

---

## Разовые действия (первый деплой или при необходимости)

### GeoIP база данных

Необходима для отображения страны/города посетителей на странице `/admin/tracking/geography`.
Без неё сайт работает нормально — просто колонки страна/город будут пустыми.

**Скачать:**
```
https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb
```
(зеркало MaxMind GeoLite2, обновляется автоматически еженедельно)

**Установить на сервер:**
```bash
mkdir -p /data/geoip
# скопировать файл на сервер через scp или wget:
wget -O /data/geoip/GeoLite2-City.mmdb \
  https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb
```

**Или задать кастомный путь в `.env`:**
```
GEOIP_MMDB_PATH=/your/path/GeoLite2-City.mmdb
```

После установки файла — перезапустить backend. База загружается автоматически при старте.

**Обновление базы** — раз в месяц-два повторить `wget` команду выше и перезапустить backend.
