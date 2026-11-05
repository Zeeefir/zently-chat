# Личные переписки и Pusher

## Как сообщение проходит по проекту

Браузер отправляет POST /api/conversations/{id}/messages с cookie входа.
router.go выбирает обработчик из httpapi/chat.go. signedIn проверяет сессию.
chat.Store проверяет участие в переписке и сохраняет текст в PostgreSQL.
После сохранения realtime/pusher.go отправляет message.created через Pusher.
Браузеры участников слушают private-conversation-<id>.

## API

Все маршруты требуют входа. Для POST нужен application/json.

| Метод | Адрес | Назначение |
|---|---|---|
| GET | /api/users?query=... | До 20 пользователей: часть имени или точная почта; без своей записи |
| POST | /api/conversations | Создать/получить диалог: {"user_id":"UUID собеседника"} |
| GET | /api/conversations | Список своих диалогов, последние созданные сначала |
| POST | /api/conversations/{id}/messages | Отправить {"client_message_id":"UUID","body":"Привет"} |
| GET | /api/conversations/{id}/messages | История: новые сообщения сначала |
| GET | /api/realtime/config | enabled и публичные key/cluster, без secret |
| POST | /api/pusher/auth | Подпись приватного канала для участника диалога |

В списках диалогов и истории: limit от 1 до 100 (по умолчанию 20).
Ответ содержит next_cursor: передайте его как before для следующей страницы.
Пустая строка next_cursor означает конец списка. Сообщения возвращаются от новых
к старым; на экране фронтенд разворачивает порядок каждой страницы.
Числовые идентификаторы сообщений и курсоры — строки, чтобы JavaScript не терял точность.
Возвращаем только публичные ID и имя собеседника, без его почты.
Чужая и несуществующая переписка одинаково возвращают 404.

Текст: 1–1000 символов после удаления крайних пробелов, без NUL.
client_message_id создаётся фронтендом через crypto.randomUUID() один раз.
При сетевом повторе используйте прежние ID и текст. Новый запрос возвращает 201,
повтор — 200 с тем же message.id. Изменение текста/диалога при том же ID — 409.
Для одной пары пользователей всегда существует один диалог, даже при одновременном создании.

## Подключение pusher.com

1. Зарегистрироваться на https://dashboard.pusher.com/ и создать приложение Channels.
2. В App Keys скопировать значения в корневой .env:

```dotenv
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=
```

Все четыре значения обязательны для включения Pusher. Без них HTTP-чат работает,
GET /api/realtime/config возвращает enabled=false, авторизация канала — 503.
Частично заполненная конфигурация останавливает запуск с понятной ошибкой.
Secret хранится только на сервере; не передавайте его другу для фронтенда и не коммитьте .env.
Клиенту достаточно публичных key и cluster.

3. Пересоздать API: docker compose up -d --build --wait.
4. Проверить GET /api/realtime/config после входа.
5. Подключить клиент и проверить message.created в Pusher Debug Console.

Настоящая доставка через pusher.com требует вашего приложения и ключей.
Автотесты проверяют подписанный запрос официального SDK через локальный HTTP-сервер,
подпись приватного канала, права участника и сохранение сообщения при ошибке публикации.

## Пример для разработчика React

Установить pusher-js в репозитории фронтенда. Все запросы к нашему API отправлять
с credentials: 'include'. Пример выполняется после login и создания диалога:

```javascript
import Pusher from 'pusher-js'

const api = 'http://localhost:9090'
const configResponse = await fetch(`${api}/api/realtime/config`, { credentials: 'include' })
if (!configResponse.ok) throw new Error('Не удалось получить настройки Pusher')
const config = await configResponse.json()
if (!config.enabled) throw new Error('Заполните настройки Pusher на сервере')

const pusher = new Pusher(config.key, {
  cluster: config.cluster,
  forceTLS: true,
  channelAuthorization: {
    customHandler: async ({ socketId, channelName }, callback) => {
      try {
        const response = await fetch(`${api}/api/pusher/auth`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ socket_id: socketId, channel_name: channelName }),
        })
        if (!response.ok) throw new Error(`Подписка запрещена: ${response.status}`)
        callback(null, await response.json())
      } catch (error) {
        callback(error, null)
      }
    },
  },
})

const channel = pusher.subscribe(`private-conversation-${conversationId}`)
channel.bind('message.created', ({ message }) => {
  // Добавьте сообщение, если message.id ещё нет в состоянии интерфейса.
})

const clientMessageId = crypto.randomUUID()
const response = await fetch(`${api}/api/conversations/${conversationId}/messages`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_message_id: clientMessageId, body: 'Привет!' }),
})
if (!response.ok) throw new Error(`Отправка не удалась: ${response.status}`)
const result = await response.json()
// Покажите result.message; событие Pusher может прийти раньше или позже ответа.
// При повторе этого запроса используйте прежний clientMessageId.

// При выходе из аккаунта/размонтировании общего подключения:
// pusher.disconnect()
```

Подпишитесь на канал, дождитесь pusher:subscription_succeeded и затем загрузите
историю. Объединяйте историю и события по message.id, чтобы не потерять сообщения
между запросом истории и подпиской. После восстановления соединения загрузите
историю снова; при необходимости пройдите страницы до уже известного сообщения.
В списке сортируйте ID как BigInt, а не как обычные строки.
Не передавайте JavaScript-токен авторизации: cookie отправляется браузером автоматически.
При выходе отключайте Pusher и очищайте состояние переписки.

## Результат доставки

POST сообщения возвращает realtime:
- published — Pusher принял запрос публикации; получение каждым браузером не гарантируется;
- disabled — ключи ещё не настроены;
- failed — сообщение сохранено, но событие не отправлено.

Повтор с прежним client_message_id снова публикует событие, не дублируя запись в БД.
Автоматической фоновой очереди повторов пока нет: при сбое история остаётся источником истины.
События могут дублироваться или приходить не по порядку — объединяйте их по ID.
Для списка диалогов пока нет отдельных push-уведомлений: обновляйте его HTTP-запросом.
Лимит POST чата — 120 запросов/минуту на IP одного процесса.
