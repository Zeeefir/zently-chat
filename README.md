# Chat API

## Запуск API и PostgreSQL в Docker

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

API доступен на http://localhost:9090 (внешний порт задаётся PORT в .env).

```powershell
Invoke-RestMethod http://localhost:9090/api/health
Invoke-RestMethod http://localhost:9090/api/ready
```

Ожидается status=ok и, для ready, database=ok.

## Как это устроено

- Dockerfile собирает Go-приложение из api/cmd/api и копирует только бинарный файл в контейнер запуска. Приложение работает от непривилегированного пользователя.
- compose.yaml запускает два контейнера: api и db. API стартует после успешной проверки PostgreSQL.
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
После изменения Go-кода повторите docker compose up -d --build --wait.
Если раньше API был запущен через go run, остановите его через Ctrl+C, чтобы освободить порт.

Это локальная конфигурация разработки: порты доступны только на этом компьютере.
Запуск Go без Docker описан в api/README.md.
