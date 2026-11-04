# Локальный запуск API

Требуются Go и запущенный Docker Desktop (Linux containers).

Из корня проекта, один раз (не перезаписывайте существующий .env):

```powershell
Copy-Item .env.example .env
```

В .env находятся настройки локальной учебной базы и API. Compose читает .env автоматически;
Go загружает ../.env при запуске из api через godotenv.
Для другого пути задайте ENV_FILE. Переменные терминала имеют приоритет над файлом.
Если меняете пароль, измените его и в DATABASE_URL (спецсимволы в URL нужно кодировать).

```powershell
docker compose config --quiet
docker compose up -d --wait db
docker compose exec -T db psql -U chat -d chat -c "SELECT 1;"
cd api
go get github.com/jackc/pgx/v5/pgxpool@v5.12.0
go mod tidy
go fmt ./cmd/api ./internal/...
go vet ./cmd/api ./internal/...
go test ./cmd/api ./internal/...
go run ./cmd/api
```

Сохраните обновлённые go.mod и go.sum в Git. Старый api/main.go не является точкой
запуска нового сервера: используйте именно go run ./cmd/api.

В другом терминале:

```powershell
Invoke-RestMethod http://localhost:9090/api/health
Invoke-RestMethod http://localhost:9090/api/ready
```

Ожидается: health — status=ok; ready — status=ok, database=ok.
Проверка отказа: из корня выполните docker compose stop db; ready должен вернуть
HTTP 503, health остаётся HTTP 200. Затем docker compose up -d --wait db;
ready снова должен вернуть HTTP 200.

Данные лежат в томе postgres_data. docker compose down сохраняет том.
Не используйте down -v, если данные нужно сохранить.
Переменные POSTGRES_* создают пользователя и базу только при первом запуске
с пустым томом; изменение .env не меняет пароль уже созданного пользователя.

Это конфигурация локальной разработки. Таблицы и миграции ещё не созданы.
