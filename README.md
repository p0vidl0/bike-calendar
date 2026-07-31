# Календарь велосоревнований

Статическая веб-страница календаря на чистом HTML/CSS/JS с генерацией готового HTML из YAML.

## Структура

- `index.template.html` - шаблон страницы для сборки (карточки и таблица в одном файле)
- `styles.css` - стили
- `build.mjs` - сборщик (читает YAML и генерирует HTML)
- `assets/` - изображения и статические ресурсы
- `data/races.yaml` - список мероприятий
- `dist/index.html` - собранная страница календаря
- `dist/table.html` - редирект на `index.html` (для старых ссылок)

## Формат данных

Каждая запись в `data/races.yaml` содержит:

- `name` - название
- `organizer` - организатор
- `type` - дисциплина: `road`, `mtb`, `gravel` (независимо от формата)
- `level` - уровень: `official`, `amateur`
- `mode` - формат проведения: `online`, `offline` (независимо от дисциплины)
- `resultsUrl` - ссылка на результаты или `null`
- `datePrecision`:
  - `exact` - точная дата
  - `range` - диапазон
  - `approx` - приблизительная дата
- `date`:
  - для `exact`: строка `YYYY-MM-DD`
  - для `range`/`approx`: объект `start` и `end` в формате `YYYY-MM-DD`
- `dateText` (опционально) - человекочитаемый текст даты, полезно для `approx`
- `startTime` (опционально) - точное время старта в формате `HH:MM` (только для `exact`; если не указано, countdown использует 10:00 по Омску)
- `image` (опционально) - путь к изображению внутри `assets/`, например `races/prudki.webp`; для `mtb` без своего изображения используется `assets/races/mtb.jpg`
- `eventUrl`, `organizerUrl` (опционально) - ссылки на страницу старта и организатора

## Как добавить новое мероприятие

1. Откройте `data/races.yaml`.
2. Добавьте новый элемент в массив `races` по образцу существующих.
3. Если гонка уже прошла и есть протокол, заполните `resultsUrl`.
4. Обновите страницу в браузере.

## Сборка

```bash
npm install
npm run build
```

После этого откройте `dist/index.html`. На desktop доступны виды **Карточки / Таблица / Сетка**, на mobile — **Список / Сетка**. Фильтры по месяцу, дисциплине, формату (онлайн/офлайн), статусу, уровню и организатору работают на клиенте. Тема **Авто / Тёмная / Светлая** сохраняется в `localStorage`.

## Локальный запуск через Parcel

```bash
npm install
npm run dev
```

Команда собирает проект и поднимает статический сервер для каталога `dist/` (без Parcel), чтобы корректно отдавались `./assets/**`, в том числе изображения гонок.

## Docker

Статика собирается в образе, в runtime — только nginx:

```bash
docker build -t omsk-bike:local .
```

Контейнер раздаёт содержимое `dist/` с корня (то же, что после `pnpm run build`).

## Деплой (GitHub Actions → Ubuntu / Docker / Traefik)

При push в ветку `master` workflow [.github/workflows/deploy-vps.yml](.github/workflows/deploy-vps.yml) собирает образ, публикует его в **GHCR** и по SSH обновляет стек на сервере (`docker-compose pull` и `up -d`; на сервере ожидается классический `docker-compose` v1 и файл `.env` в каталоге деплоя) в каталоге из секрета.

На сервере один раз должны быть установлены Docker и Compose, сеть Traefik (в примере по умолчанию имя сети — `theta-brige`, см. `docker-compose.yaml`). Для приватного пакета GHCR выполните на сервере `docker login ghcr.io` с PAT (`read:packages`). Для публичного образа логин не нужен.

Секреты репозитория:

- `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SSH_PATH` — доступ по SSH и каталог с `docker-compose.yaml`
- `OMSK_BIKE_DOMAIN` — хост для правила Traefik `Host(...)` и TLS
- `SSH_KNOWN_HOSTS` (рекомендуется) — содержимое `known_hosts` для хоста; если не задано, в CI используется `ssh-keyscan`
- опционально: `TRAEFIK_NETWORK` — имя внешней сети Traefik (по умолчанию `theta-brige`), `TRAEFIK_CERT_RESOLVER` — имя resolver в Traefik (по умолчанию `myresolver`)

После первого деплоя в настройках пакета GHCR можно связать образ с репозиторием и при необходимости сделать пакет публичным.
