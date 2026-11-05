# Авторизация

POST /api/auth/register принимает name, email, password и возвращает 201 с {"user":...}.
После регистрации нужен отдельный вход.
POST /api/auth/login принимает email, password и возвращает 200 с {"user":...} и cookie.
GET /api/auth/me возвращает 200 с {"user":...} или 401, если сессии нет или она истекла.
POST /api/auth/logout удаляет текущую сессию и cookie, возвращает 204 без тела.
На всех POST обязателен Content-Type: application/json, для logout передайте {}.

Имя: 1–100 символов после удаления крайних пробелов. Почта приводится к нижнему регистру.
Пароль: 12–72 байта UTF-8 (у кириллицы и эмодзи символ может занимать несколько байтов).
Пароль не обрезается и не изменяется. Ошибки имеют вид {"error":"code"}.
Неверные данные — 400, неверные реквизиты входа — 401, занятая почта — 409,
неподдерживаемый Content-Type — 415, слишком большой JSON — 413, лимит — 429.

## Проверка PowerShell

Сначала из корня: docker compose up -d --build --wait.

```powershell
$base = "http://localhost:9090"
$email = "test-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.com"
$registration = @{name="Test"; email=$email; password="test-password-12345"} | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/register" -Method Post -ContentType "application/json" -Body $registration
$login = @{email=$email; password="test-password-12345"} | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType "application/json" -Body $login -SessionVariable chatSession
Invoke-RestMethod "$base/api/auth/me" -WebSession $chatSession
Invoke-RestMethod "$base/api/auth/logout" -Method Post -ContentType "application/json" -Body '{}' -WebSession $chatSession
Invoke-RestMethod "$base/api/auth/me" -WebSession $chatSession
```

Последний запрос должен вернуть 401. WebSession сохраняет cookie между запросами.

## Для разработчика фронтенда

```javascript
await fetch('http://localhost:9090/api/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
```

credentials: 'include' нужен и для me/logout. Токен в localStorage не хранить:
браузер сам передаёт HttpOnly-cookie. Ответы не содержат хеша пароля или токена.
Локально используйте localhost для фронтенда и API, не смешивайте с 127.0.0.1.
ALLOWED_ORIGINS — разрешённые адреса фронтенда через запятую без конечного слеша.
После изменения .env пересоздайте контейнеры через docker compose up -d.
Для публикации под HTTPS задайте COOKIE_SECURE=true. Текущая SameSite=Lax cookie
предполагает размещение клиента и API на одном сайте; разные сайты требуют отдельной настройки.

## Реализация и ограничения

- bcrypt хеширует пароли с DefaultCost; SHA-256 применяется только к случайным токенам.
- Сессии действуют 7 дней; срок проверяется в PostgreSQL на каждом запросе me.
- Выход отзывает одну сессию. Истёкшие записи пока автоматически не очищаются.
- Ограничитель: 20 POST-запросов в минуту на IP, в памяти одного процесса;
  при перезапуске сбрасывается. За reverse proxy нужна отдельная настройка доверенных IP.
- Проверяются Origin, JSON Content-Type; запрещены неизвестные JSON-поля и несколько JSON-объектов.
- Для будущих маршрутов чата нужно также проверять сессию и участие в переписке.
- Подтверждение почты и восстановление пароля ещё не реализованы.

## Автотесты

Docker-сборка запускает модульные тесты. Локально из api:

```powershell
go mod tidy
go fmt ./...
go vet ./...
go test ./...
```

Интеграционный TestSessionLifecycle запускается только при заданном TEST_DATABASE_URL.
Используйте отдельную тестовую базу: тест применяет миграции, создаёт пользователя,
проверяет повторную почту, неверный пароль, вход, выход и истечение сессии,
затем удаляет своего пользователя. Без переменной этот тест пропускается.
