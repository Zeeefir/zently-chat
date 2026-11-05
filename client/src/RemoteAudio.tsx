import { useEffect, useRef, useState } from 'react'

export function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState('Ожидаем аудиодорожку…')
  const [error, setError] = useState('')

  function enable() {
    const audio = ref.current
    if (!audio) return
    setError('')
    setStatus('Включаем звук…')
    audio.muted = false
    audio.volume = 1
    void audio.play().then(() => {
      setPlaying(!audio.paused)
      setStatus('Воспроизведение включено. Если тихо, проверьте громкость устройства и микрофон собеседника.')
    }).catch((reason: unknown) => {
      setPlaying(false)
      setError(reason instanceof Error ? reason.name + ': ' + reason.message : 'Не удалось включить звук')
      setStatus('Воспроизведение заблокировано')
    })
  }

  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    const lifecycle = { disposed: false }
    const output = new MediaStream()
    const tracks = new Set<MediaStreamTrack>()
    const update = () => {
      if (lifecycle.disposed) return
      for (const track of stream?.getAudioTracks() ?? []) {
        if (tracks.has(track)) continue
        tracks.add(track)
        output.addTrack(track)
        track.addEventListener('unmute', retry)
        track.addEventListener('mute', update)
        track.addEventListener('ended', update)
      }
      for (const track of output.getAudioTracks()) {
        if (track.readyState === 'ended' || !stream?.getTracks().includes(track)) output.removeTrack(track)
      }
      if (!output.getAudioTracks().length) setStatus('Ожидаем аудиодорожку…')
      else if (output.getAudioTracks().every((track) => track.muted)) setStatus('Аудиодорожка есть, ожидаем данные')
    }
    const retry = () => {
      update()
      if (!output.getAudioTracks().length) return
      void audio.play().catch(() => { if (!lifecycle.disposed) setStatus('Нажмите «Включить звук»') })
    }
    const onPlaying = () => { setPlaying(true); setStatus('Воспроизведение звука включено') }
    const onPause = () => setPlaying(false)
    // A dedicated audio-only stream avoids coupling sound to video playback.
    audio.srcObject = output
    audio.muted = false
    audio.volume = 1
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    stream?.addEventListener('addtrack', retry)
    stream?.addEventListener('removetrack', update)
    retry()
    return () => {
      lifecycle.disposed = true
      stream?.removeEventListener('addtrack', retry)
      stream?.removeEventListener('removetrack', update)
      for (const track of tracks) {
        track.removeEventListener('unmute', retry)
        track.removeEventListener('mute', update)
        track.removeEventListener('ended', update)
      }
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.pause()
      audio.srcObject = null
      // Received tracks belong to the call controller; do not stop them here.
    }
  }, [stream])

  return <div className="space-y-2 bg-slate-900 p-3">
    <audio ref={ref} autoPlay controls className="w-full" aria-label="Звук собеседника" />
    <button type="button" className="secondary w-full" onClick={enable}>
      {playing ? 'Звук включён — включить повторно' : 'Включить звук'}
    </button>
    <p className="text-xs text-slate-400" role="status">{status}</p>
    {error && <p className="text-xs text-amber-300" role="alert">{error}</p>}
  </div>
}
