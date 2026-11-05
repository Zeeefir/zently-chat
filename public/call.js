import { avatar, icon, escape as e, logo } from "./icons.js";
import { CallSounds } from "./call-sounds.js";
export class Calls {
  constructor({ api, toast, onClose }) {
    Object.assign(this, { api, toast, onClose });
    this.sounds = new CallSounds({
      enabled: localStorage.getItem("call-sounds") !== "0",
    });
    const unlock = () => {
      this.sounds.unlock();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    this.root = document.querySelector("#call-root");
    this.root.addEventListener("click", (ev) => {
      const a = ev.target.closest("[data-call]")?.dataset.call;
      if (a) this.action(a).catch((err) => this.error(err.message));
    });
  }
  async start(peer, video = true) {
    if (this.peer || this.incoming) return;
    clearTimeout(this.previewTimer);
    this.peer = peer;
    this.video = video;
    this.id = crypto.randomUUID();
    this.preview = !!peer.demo;
    this.queue = [];
    this.connected = false;
    this.answered = false;
    const callId = this.id;
    this.draw();
    if (this.preview) return;
    this.sounds.unlock();
    try {
      await this.prepare();
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.signal("offer", { sdp: this.pc.localDescription, video });
      if (this.id !== callId || this.answered || this.connected) return;
      this.sounds.play("outgoing");
      this.root.querySelector(".call-time").textContent = "Вызов…";
      this.timeout = setTimeout(() => {
        if (this.id !== callId || this.answered || this.connected) return;
        this.sounds.stop();
        this.end().then(() =>
          this.toast("Нет ответа. Попробуй позвонить позже."),
        );
      }, 30000);
    } catch (err) {
      if (this.id !== callId) return;
      this.sounds.stop();
      this.error(err.message);
    }
  }
  draw() {
    document.querySelector("#app").inert = true;
    this.returnFocus = document.activeElement;
    this.root.innerHTML = `<section class="call-screen" aria-label="${this.video ? "Видеозвонок" : "Аудиозвонок"}"><aside class="call-rail">${logo()}<button class="icon-button active" aria-label="Текущий вызов">${icon(this.video ? "video" : "phone")}</button><button class="icon-button" data-call="end" aria-label="Вернуться к чатам">${icon("chat")}</button></aside><div class="call-stage">${this.preview && this.video ? '<img class="call-photo" src="/assets/remote.jpg" alt="Демонстрация видеозвонка">' : '<video class="remote-video" autoplay playsinline></video>'}<div class="video-shade"></div><header class="call-top">${avatar(this.peer)}<div><strong>${e(this.peer.name)}</strong><div class="call-time">${this.preview ? "Демо-просмотр · собеседник не подключён" : "Соединяем…"}</div></div><button class="icon-button" data-call="fullscreen" aria-label="Полный экран">${icon("fullscreen")}</button></header>${!this.video ? `<div class="call-placeholder">${avatar(this.peer, "large")}<h2>${e(this.peer.name)}</h2></div>` : ""}<p class="call-error" role="status"></p><div class="self-video-box">${this.preview ? '<img src="/assets/self.jpg" alt="Демонстрационное видео">' : ""}${this.preview ? "" : "<video muted autoplay playsinline></video>"}<span class="call-mode">${this.preview ? "Пример · не твоя камера" : "Вы"}</span></div><div class="call-controls"><button class="icon-button" data-call="screen" aria-label="Поделиться экраном">${icon("screen")}</button><button class="icon-button" data-call="camera" aria-label="Камера" aria-pressed="false">${icon("video")}</button><button class="icon-button" data-call="mic" aria-label="Микрофон" aria-pressed="false">${icon("mic")}</button><button class="icon-button end-call" data-call="end" aria-label="Завершить звонок">${icon("phone")}</button></div></div></section>`;
    this.root.querySelector('[data-call="end"]')?.focus();
  }
  error(text) {
    const el = this.root.querySelector(".call-error");
    if (el) el.textContent = text;
    else this.toast(text);
  }
  async prepare() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error(
        "Камера недоступна. Открой сайт на localhost или через HTTPS.",
      );
    const id = this.id;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.video,
    });
    if (id !== this.id) {
      stream.getTracks().forEach((t) => t.stop());
      throw Error("Вызов завершён.");
    }
    this.stream = stream;
    this.root.querySelector(".self-video-box video").srcObject = stream;
    this.pc = new RTCPeerConnection({ iceServers: [] });
    stream.getTracks().forEach((t) => this.pc.addTrack(t, stream));
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate)
        this.signal("ice", ev.candidate).catch((err) =>
          this.error(err.message),
        );
    };
    this.pc.ontrack = (ev) => {
      const v = this.root.querySelector(".remote-video");
      if (v) v.srcObject = ev.streams[0];
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === "connected") {
        this.sounds.stop();
        clearTimeout(this.timeout);
        this.connected = true;
        this.started ||= Date.now();
        clearInterval(this.timer);
        this.timer = setInterval(() => this.status(), 1000);
        this.status();
      }
      if (["failed", "disconnected"].includes(this.pc?.connectionState)) {
        this.sounds.stop();
        this.error(
          "Соединение прервано. Для разных сетей потребуется TURN-сервер.",
        );
      }
    };
  }
  status() {
    const t = this.root.querySelector(".call-time");
    if (t)
      t.textContent = new Date(Date.now() - this.started)
        .toISOString()
        .slice(14, 19);
  }
  signal(kind, payload = {}) {
    return this.api("/signal", {
      to: this.peer.id,
      kind,
      payload,
      callId: this.id,
    });
  }
  async receive(v) {
    if (
      ["end", "decline"].includes(v.kind) &&
      this.incoming?.callId === v.callId
    ) {
      this.incoming = null;
      this.sounds?.stop();
      clearTimeout(this.incomingTimeout);
      this.incomingIce = [];
      const d = document.querySelector("#dialog");
      d.oncancel = null;
      d.close();
      d.classList?.remove("incoming-call-dialog");
      this.toast("Вызов отменён");
      return;
    }
    if (v.kind === "ice" && this.incoming?.callId === v.callId) {
      this.incomingIce.push(v.payload);
      return;
    }
    if (v.kind === "offer" && (this.peer || this.incoming)) {
      await this.api("/signal", {
        to: v.from.id,
        kind: "decline",
        callId: v.callId,
      }).catch(() => {});
      return;
    }
    if (v.kind === "offer" && !this.peer) {
      clearTimeout(this.previewTimer);
      this.incoming = v;
      this.incomingIce = [];
      const audible = this.sounds.play("incoming");
      const d = document.querySelector("#dialog");
      d.classList.add("incoming-call-dialog");
      d.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">Входящий ${v.payload.video ? "видеозвонок" : "звонок"}</h2></div><div class="profile-hero">${avatar(v.from, "large")}<h3>${e(v.from.name)}</h3><p>@${e(v.from.username)}</p></div>${!audible && this.sounds.enabled ? '<button type="button" class="secondary enable-ring" id="enable-ring">Включить мелодию звонка</button>' : ""}<div class="dialog-actions"><button class="secondary" id="decline">${icon("close")} Отклонить</button><button class="primary" id="accept">${icon("phone")} Ответить</button></div>`;
      d.showModal();
      const decline = () => {
        this.sounds.stop();
        clearTimeout(this.incomingTimeout);
        this.incoming = null;
        this.incomingIce = [];
        this.api("/signal", {
          to: v.from.id,
          kind: "decline",
          callId: v.callId,
        }).catch(() => {});
        d.oncancel = null;
        d.close();
        d.classList.remove("incoming-call-dialog");
      };
      this.incomingTimeout = setTimeout(decline, 30000);
      const enable = d.querySelector("#enable-ring");
      if (enable)
        enable.onclick = async () => {
          if (await this.sounds.unlock()) {
            this.sounds.play("incoming");
            enable.remove();
          }
        };
      d.querySelector("#decline").onclick = decline;
      d.oncancel = decline;
      d.querySelector("#accept").onclick = async () => {
        if (!this.incoming || this.incoming.callId !== v.callId) return;
        this.sounds.stop();
        clearTimeout(this.incomingTimeout);
        d.classList.remove("incoming-call-dialog");
        d.oncancel = null;
        d.close();
        Object.assign(this, {
          peer: v.from,
          id: v.callId,
          video: !!v.payload.video,
          preview: false,
          queue: this.incomingIce || [],
          connected: false,
        });
        this.incoming = null;
        this.draw();
        try {
          await this.prepare();
          await this.pc.setRemoteDescription(v.payload.sdp);
          for (const c of this.queue) await this.pc.addIceCandidate(c);
          this.queue = [];
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          await this.signal("answer", { sdp: this.pc.localDescription });
        } catch (err) {
          await this.signal("decline").catch(() => {});
          this.error(err.message);
        }
      };
      return;
    }
    if (v.callId !== this.id) return;
    try {
      if (v.kind === "answer") {
        this.answered = true;
        this.sounds.stop();
        clearTimeout(this.timeout);
        this.root.querySelector(".call-time").textContent = "Подключаем…";
        await this.pc.setRemoteDescription(v.payload.sdp);
        for (const c of this.queue) await this.pc.addIceCandidate(c);
        this.queue = [];
      }
      if (v.kind === "ice") {
        if (this.pc?.remoteDescription)
          await this.pc.addIceCandidate(v.payload);
        else (this.queue ??= []).push(v.payload);
      }
      if (v.kind === "end" || v.kind === "decline") {
        await this.end(false);
        this.toast(
          v.kind === "decline"
            ? "Собеседник отклонил звонок"
            : "Вызов завершён",
        );
      }
    } catch (err) {
      this.error(err.message);
    }
  }
  async action(a) {
    if (a === "end") return this.end();
    if (a === "fullscreen") {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.root.querySelector(".call-stage").requestFullscreen();
      return;
    }
    if (this.preview) {
      this.error(
        "Это демонстрация интерфейса. Для настоящего звонка выбери зарегистрированного пользователя.",
      );
      return;
    }
    if (a === "mic" || a === "camera") {
      const tracks =
        a === "mic"
          ? this.stream?.getAudioTracks()
          : this.stream?.getVideoTracks();
      if (!tracks?.length) {
        this.error(
          "Устройство не подключено. Заверши вызов и начни заново, разрешив доступ.",
        );
        return;
      }
      tracks.forEach((t) => (t.enabled = !t.enabled));
      this.root
        .querySelector(`[data-call="${a}"]`)
        .setAttribute("aria-pressed", String(!tracks[0].enabled));
    }
    if (a === "screen") {
      if (!this.pc || !this.connected)
        throw Error("Сначала дождись соединения.");
      const share = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const sender = this.pc
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (!sender) {
        share.getTracks().forEach((t) => t.stop());
        throw Error("Демонстрация экрана доступна в видеозвонке.");
      }
      await sender.replaceTrack(share.getVideoTracks()[0]);
      this.share = share;
      share.getVideoTracks()[0].onended = () =>
        sender.replaceTrack(this.stream.getVideoTracks()[0]);
    }
  }
  async previewRingtone() {
    if (this.peer || this.incoming) return;
    if (!this.sounds.enabled) {
      this.toast("Сначала включи звуки звонков.");
      return;
    }
    if (!(await this.sounds.unlock())) {
      this.toast("Браузер пока не разрешил звук. Попробуй ещё раз.");
      return;
    }
    clearTimeout(this.previewTimer);
    this.sounds.play("incoming");
    this.previewTimer = setTimeout(() => this.sounds.stop(), 2800);
  }
  async end(notify = true) {
    this.sounds?.stop();
    if (!this.peer) return;
    const peer = this.peer,
      id = this.id,
      preview = this.preview,
      video = this.video,
      duration = this.started
        ? Math.round((Date.now() - this.started) / 1000)
        : 0;
    if (notify && !preview) this.signal("end").catch(() => {});
    clearTimeout(this.timeout);
    clearInterval(this.timer);
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.share?.getTracks().forEach((t) => t.stop());
    this.peer = null;
    this.id = null;
    this.pc = null;
    this.stream = null;
    this.started = null;
    this.root.innerHTML = "";
    document.querySelector("#app").inert = false;
    this.returnFocus?.focus();
    await this.api("/calls/log", {
      peerId: peer.id,
      video,
      preview,
      duration,
    }).catch(() => {});
    await this.onClose();
  }
}
