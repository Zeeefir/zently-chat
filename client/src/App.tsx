import { CallPanel } from '@/CallPanel'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Pusher from 'pusher-js'
import { LogOut, MessageCircle, RefreshCw, Search, Send, Wifi } from 'lucide-react'
import { api, errorText } from '@/api'
import type { Conversation, Message, MessagePage, User } from '@/api'

export default function App() {
  const cache = useQueryClient()
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try { return (await api.get<{ user: User }>('/auth/me')).data.user }
      catch (error) {
        if ((error as { response?: { status: number } }).response?.status === 401) return null
        throw error
      }
    },
  })

  useEffect(() => {
    const interceptor = api.interceptors.response.use(undefined, (error) => {
      if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
        cache.clear()
        cache.setQueryData(['session'], null)
      }
      return Promise.reject(error)
    })
    return () => api.interceptors.response.eject(interceptor)
  }, [cache])

  return <div className="mx-auto max-w-7xl p-4 sm:p-8">
    <header className="mb-7 flex items-center gap-3">
      <div className="rounded-2xl bg-teal-400/10 p-3 text-teal-300"><MessageCircle /></div>
      <div><h1 className="text-xl font-bold">newsChat <span className="ml-2 text-xs font-normal text-slate-500">проверка API</span></h1>
        <p className="mt-1 text-sm text-slate-400">Go · PostgreSQL · Pusher Channels</p></div>
    </header>
    {session.isPending ? <p role="status">Проверяем сессию…</p>
      : session.isError ? <div className="notice">{errorText(session.error)} <button className="underline" onClick={() => void session.refetch()}>Повторить</button></div>
      : session.data ? <Chat key={session.data.id} user={session.data} /> : <Auth />}
  </div>
}

function Auth() {
  const cache = useQueryClient()
  const [register, setRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const auth = useMutation({
    mutationFn: async () => {
      if (register) await api.post('/auth/register', { name, email, password })
      return (await api.post<{ user: User }>('/auth/login', { email, password })).data.user
    },
    onSuccess: (user) => { cache.clear(); cache.setQueryData(['session'], user) },
  })
  return <section className="mx-auto mt-12 max-w-md rounded-3xl border border-slate-800 bg-slate-900/40 p-7">
    <h2 className="text-2xl font-semibold">{register ? 'Создать аккаунт' : 'Войти в чат'}</h2>
    <p className="mb-6 mt-2 text-sm text-slate-400">Для проверки создайте два аккаунта в разных браузерах.</p>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); auth.mutate() }}>
      {register && <label className="block text-sm">Имя<input className="mt-2" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
      <label className="block text-sm">Почта<input className="mt-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="block text-sm">Пароль<input className="mt-2" type="password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={register ? 'new-password' : 'current-password'} /></label>
      <p className="text-xs text-slate-500">От 12 до 72 байт. Для теста используйте 12–72 латинских символа.</p>
      {auth.isError && <p className="notice" role="alert">{errorText(auth.error)}{register && ' Если аккаунт уже создался, переключитесь на вход.'}</p>}
      <button className="primary w-full" disabled={auth.isPending}>{auth.isPending ? 'Подождите…' : register ? 'Зарегистрироваться и войти' : 'Войти'}</button>
    </form>
    <button className="mt-5 text-sm text-teal-300" onClick={() => { setRegister(!register); auth.reset() }}>{register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button>
  </section>
}

function Chat({ user }: { user: User }) {
  const cache = useQueryClient()
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const dialogs = useInfiniteQuery({
    queryKey: ['conversations'], initialPageParam: '',
    queryFn: async ({ pageParam }) => (await api.get<{ conversations: Conversation[]; next_cursor: string }>('/conversations', { params: { limit: 30, before: pageParam || undefined } })).data,
    getNextPageParam: (page) => page.next_cursor || undefined,
  })
  const users = useQuery({
    queryKey: ['users', query], enabled: query.length >= 2,
    queryFn: async () => (await api.get<{ users: User[] }>('/users', { params: { query } })).data.users,
  })
  const create = useMutation({
    mutationFn: async (id: string) => (await api.post<{ conversation: Conversation }>('/conversations', { user_id: id })).data.conversation,
    onSuccess: (dialog) => { setSelected(dialog); setQuery(''); setSearch(''); void cache.invalidateQueries({ queryKey: ['conversations'] }) },
  })
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout', {}),
    onSuccess: () => { cache.clear(); cache.setQueryData(['session'], null) },
  })

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-400">Вы вошли как <strong className="text-white">{user.name}</strong></p>
      <button className="secondary" disabled={logout.isPending} onClick={() => logout.mutate()}><LogOut size={16} />Выйти</button>
    </div>
    {logout.isError && <p className="notice mb-4">{errorText(logout.error)}</p>}
    <CallPanel user={user} selected={selected} />
    <div className="grid min-h-[65vh] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/30 md:grid-cols-[300px_1fr]">
      <aside className="border-b border-slate-800 p-5 md:border-b-0 md:border-r">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()) }}>
          <input aria-label="Поиск пользователя" placeholder="Имя или точная почта" value={search} onChange={(e) => setSearch(e.target.value)} minLength={2} maxLength={100} required />
          <button className="secondary" aria-label="Найти"><Search size={18} /></button>
        </form>
        {users.isFetching && <p className="mt-3 text-sm text-slate-400">Поиск…</p>}
        {users.isError && <p className="notice mt-3">{errorText(users.error)}</p>}
        {query && users.data?.length === 0 && <p className="mt-3 text-sm text-slate-400">Никого не найдено.</p>}
        {users.data && query && <div className="mt-3 space-y-2">{users.data.map((peer) => <button key={peer.id} disabled={create.isPending} onClick={() => create.mutate(peer.id)} className="secondary w-full justify-between">{peer.name}<span className="text-xs text-teal-300">Написать</span></button>)}</div>}
        {create.isError && <p className="notice mt-3">{errorText(create.error)}</p>}
        <div className="mb-3 mt-7 flex items-center justify-between"><h2 className="font-semibold">Переписки</h2><button className="text-slate-400" aria-label="Обновить переписки" onClick={() => void dialogs.refetch()}><RefreshCw size={16} /></button></div>
        {dialogs.isError && <p className="notice">{errorText(dialogs.error)}</p>}
        {dialogs.isPending && <p className="text-sm text-slate-400">Загрузка…</p>}
        {dialogs.data?.pages.flatMap((page) => page.conversations).map((dialog) => <button key={dialog.id} onClick={() => setSelected(dialog)} className={'mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-4 text-left text-sm ' + (selected?.id === dialog.id ? 'bg-teal-400/10 text-teal-200' : 'hover:bg-slate-800')}>
          <MessageCircle size={18} />{dialog.participant.name}</button>)}
        {dialogs.data?.pages[0].conversations.length === 0 && <p className="text-sm text-slate-500">Найдите собеседника, чтобы начать.</p>}
        {dialogs.hasNextPage && <button className="secondary w-full" disabled={dialogs.isFetchingNextPage} onClick={() => void dialogs.fetchNextPage()}>Ещё переписки</button>}
      </aside>
      {selected ? <Messages key={selected.id} conversation={selected} user={user} /> : <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center text-slate-500"><MessageCircle size={40} /><p>Выберите переписку или найдите собеседника.</p><p className="max-w-sm text-xs">Выберите диалог, чтобы отправить сообщение или позвонить.</p></div>}
    </div>
  </>
}

function Messages({ conversation, user }: { conversation: Conversation; user: User }) {
  const cache = useQueryClient()
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('Подключаемся…')
  const [events, setEvents] = useState(0)
  const [live, setLive] = useState<Record<string, Message>>({})
  const [delivery, setDelivery] = useState('')
  const pending = useRef<{ body: string; id: string } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const history = useInfiniteQuery({
    queryKey: ['messages', conversation.id], initialPageParam: '',
    queryFn: async ({ pageParam }) => (await api.get<MessagePage>(`/conversations/${conversation.id}/messages`, { params: { before: pageParam || undefined, limit: 50 } })).data,
    getNextPageParam: (page) => page.next_cursor || undefined,
  })

  useEffect(() => {
    let disposed = false
    const connection: { client?: Pusher } = {}
    void (async () => {
      try {
        const { data: config } = await api.get<{ enabled: boolean; key: string; cluster: string }>('/realtime/config')
        if (disposed) return
        if (!config.enabled) { setStatus('Pusher отключён: заполните .env'); return }
        const pusher = new Pusher(config.key, {
          cluster: config.cluster, forceTLS: true,
          channelAuthorization: {
            customHandler: ({ socketId, channelName }, callback) => {
              void api.post('/pusher/auth', { socket_id: socketId, channel_name: channelName })
                .then(({ data }) => { if (!disposed) callback(null, data) })
                .catch((error: unknown) => { if (!disposed) callback(new Error(errorText(error)), null) })
            },
          },
        })
        connection.client = pusher
        pusher.connection.bind('state_change', ({ current }: { current: string }) => {
          if (!disposed && current !== 'connected') setStatus(`Соединение: ${current}`)
        })
        pusher.connection.bind('error', () => { if (!disposed) setStatus('Ошибка соединения с Pusher') })
        const channel = pusher.subscribe(`private-conversation-${conversation.id}`)
        channel.bind('pusher:subscription_succeeded', () => {
          if (disposed) return
          setStatus('Pusher: подписка активна')
          // Re-fetch all loaded pages after each subscription/reconnection.
          void cache.invalidateQueries({ queryKey: ['messages', conversation.id] })
        })
        channel.bind('pusher:subscription_error', () => { if (!disposed) setStatus('Ошибка авторизации канала Pusher') })
        channel.bind('message.created', ({ message }: { message: Message }) => {
          if (disposed || message.conversation_id !== conversation.id) return
          setLive((old) => ({ ...old, [message.id]: message }))
          setEvents((count) => count + 1)
        })
      } catch (error) { if (!disposed) setStatus(errorText(error)) }
    })()
    return () => { disposed = true; connection.client?.disconnect() }
  }, [cache, conversation.id])

  const send = useMutation({
    mutationFn: async (text: string) => {
      if (pending.current?.body !== text) pending.current = { body: text, id: crypto.randomUUID() }
      return (await api.post<{ message: Message; realtime: string }>(`/conversations/${conversation.id}/messages`, {
        body: text, client_message_id: pending.current.id,
      })).data
    },
    onSuccess: (result) => {
      setLive((old) => ({ ...old, [result.message.id]: result.message }))
      setBody(''); pending.current = null
      setDelivery(result.realtime === 'published' ? 'Сохранено, событие принято Pusher.' : result.realtime === 'failed' ? 'Сохранено в БД, но Pusher не принял событие. Собеседнику нужно обновить историю.' : 'Сохранено в БД. Pusher отключён.')
    },
  })
  const merged = new Map<string, Message>()
  history.data?.pages.forEach((page) => page.messages.forEach((message) => merged.set(message.id, message)))
  Object.values(live).forEach((message) => merged.set(message.id, message))
  const messages = [...merged.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)
  const latest = messages.at(-1)?.id
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [latest])
  function submit(event: FormEvent) { event.preventDefault(); if (body.trim() && !send.isPending) send.mutate(body.trim()) }

  return <section className="flex min-w-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
      <div><h2 className="font-semibold">{conversation.participant.name}</h2><p className="mt-1 flex items-center gap-2 text-xs text-slate-400"><Wifi size={13} />{status}</p></div>
      <button className="secondary" onClick={() => void history.refetch()} disabled={history.isFetching}><RefreshCw size={15} />История</button>
    </div>
    <p className="border-b border-slate-800 px-5 py-2 text-xs text-slate-500" aria-live="polite">Получено событий Pusher: {events}. Автоопрос сообщений выключен.</p>
    <div className="h-[45vh] min-h-72 overflow-y-auto p-5">
      {history.hasNextPage && <button className="secondary mb-5 w-full" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>Более ранние сообщения</button>}
      {history.isPending && <p className="text-sm text-slate-400">Загружаем историю…</p>}
      {history.isError && <p className="notice">{errorText(history.error)}</p>}
      {!history.isPending && !history.isError && messages.length === 0 && <p className="py-12 text-center text-sm text-slate-500">Напишите первое сообщение.</p>}
      {messages.map((message) => <div key={message.id} className={'mb-3 flex ' + (message.sender_id === user.id ? 'justify-end' : 'justify-start')}>
        <div className={'max-w-[85%] rounded-2xl px-4 py-3 ' + (message.sender_id === user.id ? 'bg-teal-400/15 text-teal-50' : 'bg-slate-800')}>
          <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{message.body}</p>
          <p className="mt-1 text-right text-[10px] text-slate-500">{new Date(message.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
        </div></div>)}
      <div ref={bottom} />
    </div>
    <form className="mt-auto space-y-3 border-t border-slate-800 p-5" onSubmit={submit}>
      {send.isError && <p className="notice" role="alert">{errorText(send.error)} Повторите отправку: прежний идентификатор сохранён.</p>}
      <div className="flex items-end gap-3"><textarea aria-label="Сообщение" placeholder="Напишите сообщение…" rows={2} maxLength={1000} value={body} disabled={send.isPending} onChange={(e) => setBody(e.target.value)} /><button className="primary shrink-0" aria-label="Отправить сообщение" disabled={!body.trim() || send.isPending}><Send size={18} /></button></div>
      <p className="text-xs text-slate-500" role="status">{send.isPending ? 'Отправляем…' : delivery || 'До 1000 символов. Отправка кнопкой со стрелкой.'}</p>
    </form>
  </section>
}


