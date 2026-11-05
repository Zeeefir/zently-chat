import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react'
import { CallController } from '@/calls'
import type { CallView } from '@/calls'
import type { Conversation, User } from '@/api'

function VideoStream({ stream, muted = false, label }: { stream: MediaStream | null; muted?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [blocked, setBlocked] = useState(false)
  const [audioStatus, setAudioStatus] = useState('Ожидаем аудиодорожку…')
  const [playError, setPlayError] = useState('')

  function enableSound() {
    const video = ref.current
    if (!video || !stream) return
    video.muted = false
    video.volume = 1
    // Run directly in the click handler to retain browser user activation.
    void video.play().then(() => { setBlocked(false); setPlayError('') })
      .catch(() => { setBlocked(true); setPlayError('Браузер не разрешил воспроизведение. Проверьте звук и разрешения сайта.') })
  }

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const lifecycle = { disposed: false }
    const observed = new Set<MediaStreamTrack>()
    video.muted = muted
    video.volume = 1
    video.srcObject = stream
    const updateAudio = () => {
      const tracks = stream?.getAudioTracks() ?? []
      setAudioStatus(!tracks.length ? 'Ожидаем аудиодорожку…'
        : tracks.every((track) => track.readyState === 'ended') ? 'Аудиодорожка завершена'
        : tracks.some((track) => track.muted) ? 'Аудиодорожка есть, ожидаем данные'
        : 'Аудиодорожка подключена')
      for (const track of tracks) {
        if (observed.has(track)) continue
        observed.add(track)
        track.addEventListener('mute', updateAudio)
        track.addEventListener('unmute', updateAudio)
        track.addEventListener('ended', updateAudio)
      }
    }
    const play = () => {
      updateAudio()
      if (!stream) return
      void video.play().then(() => { if (!lifecycle.disposed) setBlocked(false) })
        .catch(() => { if (!lifecycle.disposed) setBlocked(true) })
    }
    play()
    stream?.addEventListener('addtrack', play)
    stream?.addEventListener('removetrack', updateAudio)
    video.addEventListener('loadedmetadata', play)
    return () => {
      lifecycle.disposed = true
      stream?.removeEventListener('addtrack', play)
      stream?.removeEventListener('removetrack', updateAudio)
      video.removeEventListener('loadedmetadata', play)
      for (const track of observed) {
        track.removeEventListener('mute', updateAudio)
        track.removeEventListener('unmute', updateAudio)
        track.removeEventListener('ended', updateAudio)
      }
      video.srcObject = null
    }
  }, [stream, muted])

  return <div className="overflow-hidden rounded-2xl border border-slate-700 bg-black">
    <div className="relative">
      <video ref={ref} autoPlay playsInline muted={muted} controls={!muted} className="aspect-video w-full object-contain" />
      <span className="absolute left-3 top-2 rounded bg-black/60 px-2 py-1 text-xs">{label}</span>
    </div>
    {!muted && <div className="space-y-2 bg-slate-900 p-3">
      <button className="secondary w-full" disabled={!stream} onClick={enableSound}>
        {blocked ? 'Разрешить звук и воспроизведение' : 'Включить звук собеседника'}
      </button>
      <p className="text-xs text-slate-400" role="status">{audioStatus}</p>
      {playError && <p className="text-xs text-amber-300" role="alert">{playError}</p>}
    </div>}
  </div>
}
export function CallPanel({ user, selected }: { user: User; selected: Conversation | null }) {
  const controller = useRef<CallController | null>(null)
  const [view, setView] = useState<CallView>({ call: null, local: null, remote: null, connection: 'Подключаем звонки…', error: '', busy: false })
  useEffect(() => {
    const client = new CallController(user.id, setView)
    controller.current = client
    void client.connect()
    const close = () => client.dispose()
    window.addEventListener('pagehide', close)
    return () => { window.removeEventListener('pagehide', close); client.dispose(); controller.current = null }
  }, [user.id])
  const call = view.call
  const ongoing = call?.status === 'ringing' || call?.status === 'accepted'
  const incoming = call?.callee_id === user.id
  const names: Record<string, string> = { ringing: incoming ? 'Входящий видеозвонок' : 'Вызываем собеседника…', accepted: 'Видеозвонок', ended: 'Звонок завершён', cancelled: 'Вызов отменён', rejected: 'Вызов отклонён', expired: 'Время звонка истекло' }
  return <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold">{call ? names[call.status] ?? call.status : 'Видеозвонки'}</p>
        <p className="mt-1 text-xs text-slate-400" role="status">{view.connection}</p></div>
      {!ongoing && <button className="primary" disabled={!selected || view.busy} onClick={() => selected && void controller.current?.start(selected.id)}><Video size={17} />{view.busy ? 'Подождите…' : selected ? 'Позвонить: ' + selected.participant.name : 'Сначала выберите диалог'}</button>}
      {ongoing && <div className="flex gap-2">
        {incoming && call.status === 'ringing' && <button className="primary" disabled={view.busy} onClick={() => void controller.current?.action('accept')}><Phone size={17} />Принять</button>}
        <button className="secondary border-red-800 text-red-300" disabled={view.busy} onClick={() => void controller.current?.finish()}><PhoneOff size={17} />{call.status === 'accepted' ? 'Завершить' : incoming ? 'Отклонить' : 'Отменить'}</button>
      </div>}
    </div>
    {view.error && <p className="notice mt-3" role="alert">{view.error}</p>}
    {ongoing && <div className="mt-3">
      {call.status === 'accepted' && !view.local && <p className="notice">Медиа соединение не восстановлено после перезагрузки. Завершите звонок и позвоните заново.</p>}
      {(view.local || view.remote) && <div className="grid gap-3 sm:grid-cols-2">
        <VideoStream stream={view.local} muted label="Вы (звук выключен только в предпросмотре)" />
        <VideoStream stream={view.remote} label="Собеседник" />
      </div>}
      {view.local && <div className="mt-3 flex flex-wrap gap-2">
        <button className="secondary" onClick={() => controller.current?.toggle('audio')}>{view.local.getAudioTracks()[0]?.enabled ? <Mic size={16} /> : <MicOff size={16} />}{view.local.getAudioTracks()[0]?.enabled ? 'Микрофон включён' : 'Микрофон выключен'}</button>
        <button className="secondary" onClick={() => controller.current?.toggle('video')}>{view.local.getVideoTracks()[0]?.enabled ? <Video size={16} /> : <VideoOff size={16} />}Камера</button>
      </div>}
    </div>}
    <p className="mt-3 text-xs text-slate-500">Для проверки разрешите камеру и микрофон. Между разными сетями может понадобиться TURN, он пока не настроен.</p>
  </section>
}


