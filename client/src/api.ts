import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

export type User = { id: string; name: string }
export type Conversation = { id: string; participant: User }
export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}
export type MessagePage = { messages: Message[]; next_cursor: string }

export function errorText(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.error
    const labels: Record<string, string> = {
      invalid_credentials: 'Неверная почта или пароль.',
      email_already_registered: 'Эта почта уже зарегистрирована.',
      unauthorized: 'Сессия закончилась. Войдите снова.',
      rate_limit_exceeded: 'Слишком много запросов. Подождите минуту.',
    }
    return labels[code] ?? error.response?.data?.message ?? code ?? 'API недоступна. Проверьте Docker и порт 9090.'
  }
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}
