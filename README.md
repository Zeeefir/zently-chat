# newsChat

Переписки, маршруты и подключение Pusher описаны в [api/CHAT.md](api/CHAT.md).
Серверная часть звонков и инструкция для фронтенда — [api/CALLS.md](api/CALLS.md).

## Swagger

Интерактивная документация: http://localhost:9090/swagger/.
Спецификация OpenAPI: http://localhost:9090/swagger/openapi.json.
В Swagger выполните register, затем login, me и logout через Execute.
Cookie сохраняется браузером автоматически. UI загружает JS/CSS Swagger UI 5.31.0
из unpkg; для отображения документации нужен доступ к этому CDN.
При добавлении новых маршрутов обновляйте api/internal/httpapi/docs/openapi.json.

## Запуск сайта, API и PostgreSQL в Docker

Требуется запущенный Docker Desktop с Linux containers.
Все команды выполняются из корня репозитория.

Если .env ещё нет, создайте его по примеру (существующий не перезаписывайте):

```powershell
Copy-Item .env.example .env
```

```powershell
docker compose up -d --build --wait
docker compose ps
```

Сайт доступен на http://localhost:3000. API также доступен напрямую на http://localhost:9090 (внешний порт API задаётся PORT в .env).

```powershell
Invoke-RestMethod http://localhost:9090/api/health
Invoke-RestMethod http://localhost:9090/api/ready
```

Ожидается status=ok и, для ready, database=ok.

## Как это устроено

- Dockerfile собирает Go-приложение из api/cmd/api и копирует только бинарный файл в контейнер запуска. Приложение работает от непривилегированного пользователя.
- compose.yaml запускает три контейнера: client, api и db. API ждёт готовности PostgreSQL, клиент — готовности API.
- client/Dockerfile собирает React, затем Nginx раздаёт готовую страницу и передаёт запросы /api в Go API. npm run dev для Docker не требуется.
- Внутри Docker база доступна как db:5432, API слушает 8080. Снаружи порт API по умолчанию 9090.
- Compose формирует DATABASE_URL для API из POSTGRES_PASSWORD. DATABASE_URL в .env нужен только для запуска Go на компьютере без контейнера.
- Для текущего формата URL используйте пароль из латинских букв, цифр, дефисов и подчёркиваний. Пароли со спецсимволами требуют URL-кодирования.
- .env не попадает в Git и контекст сборки Docker.
- PostgreSQL хранит данные в именованном томе postgres_data. Пароль из POSTGRES_PASSWORD применяется только при первой инициализации пустого тома.

## Логи, остановка и обновление

```powershell
docker compose logs -f api
docker compose logs -f db
docker compose down
```

down сохраняет данные. Не добавляйте -v, если базу нужно сохранить.
После изменения Go-кода или клиента повторите docker compose up -d --build --wait.
Если раньше API был запущен через go run, остановите его через Ctrl+C, чтобы освободить порт.

Это локальная конфигурация разработки: порты доступны только на этом компьютере.
Запуск Go без Docker описан в api/README.md.

## Запуск кнопкой в Docker Desktop

Один раз выполните из корня: docker compose up -d --build --wait.
После этого в Docker Desktop → Containers появится группа newschat с тремя сервисами.
Кнопка Stop у группы останавливает весь проект, кнопка Start запускает его снова.
Откройте http://localhost:3000 после запуска.

Start использует уже собранные образы. После изменения кода или .env повторите
docker compose up -d --build --wait, чтобы пересобрать/пересоздать контейнеры.
Не используйте docker compose down, если хотите сохранить группу для запуска кнопкой:
down удаляет контейнеры (данные базы в томе сохраняются).
Pusher требует доступа к интернету и заполненных PUSHER_* в корневом .env.

## Размещение в интернете

Подготовка Neon, Render и Vercel описана в [DEPLOY.md](DEPLOY.md).
