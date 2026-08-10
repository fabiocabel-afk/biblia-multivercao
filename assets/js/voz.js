/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* voz.js — leitura em voz alta usando as vozes do próprio aparelho
 * (Web Speech API, que já vem no navegador — não precisa de internet nem de
 * servidor). A leitura é feita versículo a versículo: quando um termina, o
 * app avança para o próximo. É isso que dá o acompanhamento visual de graça —
 * cada fim de fala ilumina e rola até a linha seguinte. */
const Locutor = {

  /** O navegador oferece leitura em voz? (Alguns navegadores antigos, não.) */
  disponivel() {
    return typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && typeof window.SpeechSynthesisUtterance !== 'undefined';
  },

  _vozes: [],
  _ouvintes: [],

  /* As vozes chegam de forma assíncrona no Chrome: na primeira leitura a lista
   * costuma vir vazia e só depois o navegador dispara "voiceschanged". Aqui a
   * gente guarda a lista e avisa quem estava esperando (a tela de Ajustes). */
  preparar() {
    if (!this.disponivel()) return;
    const puxar = () => {
      this._vozes = window.speechSynthesis.getVoices() || [];
      if (this._vozes.length && this._ouvintes.length) {
        const fila = this._ouvintes.splice(0);
        fila.forEach(cb => { try { cb(); } catch (e) {} });
      }
    };
    puxar();
    window.speechSynthesis.onvoiceschanged = puxar;
  },

  /** Chame de novo quando as vozes carregarem (para redesenhar a lista). */
  aoCarregarVozes(cb) {
    if (this.vozes().length) { cb(); return; }
    this._ouvintes.push(cb);
  },

  /* Só as vozes em português — que é o que serve aqui. Se o aparelho não tiver
   * nenhuma em português, devolve todas, para a pessoa ainda poder escolher. */
  vozes() {
    const todas = (this._vozes && this._vozes.length)
      ? this._vozes
      : (this.disponivel() ? (window.speechSynthesis.getVoices() || []) : []);
    const pt = todas.filter(v => /^pt(-|_|$)/i.test(v.lang || ''));
    return pt.length ? pt : todas;
  },

  /* A voz que vai falar: a escolhida nos Ajustes, se ainda existir; senão uma
   * pt-BR; senão qualquer português; senão a primeira que houver. */
  vozPreferida() {
    const lista = this.vozes();
    if (!lista.length) return null;
    const uri = Prefs.get('vozURI');
    const escolhida = uri && lista.find(v => v.voiceURI === uri);
    if (escolhida) return escolhida;
    return lista.find(v => /pt[-_]br/i.test(v.lang || ''))
        || lista.find(v => /^pt/i.test(v.lang || ''))
        || lista[0];
  },

  /* Fala um texto. `aoFim` é chamado quando termina de falar; `aoErro`, se
   * algo der errado. A velocidade sai dos Ajustes. */
  falar(texto, { aoFim, aoErro } = {}) {
    if (!this.disponivel()) { if (aoErro) aoErro(); return null; }
    const u = new SpeechSynthesisUtterance(texto);
    const voz = this.vozPreferida();
    if (voz) { u.voice = voz; u.lang = voz.lang; } else { u.lang = 'pt-BR'; }
    const vel = +Prefs.get('vozVel') || 1;
    u.rate = Math.max(0.5, Math.min(2, vel));
    const fim = () => { this._pararKeepAlive(); if (aoFim) aoFim(); };
    const erro = () => { this._pararKeepAlive(); if (aoErro) aoErro(); };
    u.onend = fim;
    u.onerror = erro;
    window.speechSynthesis.speak(u);
    this._manterVivo();   // segura a fala viva mesmo com a tela apagada
    return u;
  },

  /* Com a tela bloqueada (Chrome/Android principalmente) o motor de voz costuma
   * ENTRAR em pausa sozinho no meio da fala. Um resume() periódico enquanto há
   * algo falando mantém o áudio correndo — mas o próprio timer só continua a
   * rodar se a página não for congelada. É por isso que existe a sessão de
   * áudio silenciosa (manterSessao): ela segura a página acordada. */
  _manterVivo() {
    if (this._keep) return;
    this._keep = setInterval(() => {
      try {
        const s = window.speechSynthesis;
        if (s.speaking || s.pending) {
          // Só religa se o motor caiu em pausa sozinho (tela apagada). Um
          // resume() INCONDICIONAL pode fazer o motor RE-FALAR o trecho atual
          // em alguns aparelhos (Android/Chrome) — é a origem da "repetição
          // fantasma" que aparece depois de horas/ciclos de segundo plano.
          if (s.paused) s.resume();
        } else {
          this._pararKeepAlive();
        }
      } catch (e) { this._pararKeepAlive(); }
    }, 4000);
  },

  _pararKeepAlive() {
    if (this._keep) { clearInterval(this._keep); this._keep = null; }
  },

  /* ---------------------------------------------- sessão de áudio de fundo ---
   * A voz sintetizada, sozinha, não toca com a tela bloqueada: o navegador
   * congela a página. O contorno que os apps de áudio usam é manter um
   * elemento <audio> REALMENTE tocando (aqui, um silêncio em loop). Com uma
   * sessão de áudio ativa, o sistema mantém a página viva em segundo plano e a
   * fala continua. Precisa ser iniciado dentro de um toque do usuário (política
   * de autoplay), por isso é chamado no momento em que a pessoa manda ouvir. */
  manterSessao() {
    try {
      if (!this._audio) {
        this._audio = new Audio(this._uriSilencio());
        this._audio.loop = true;
        this._audio.preload = 'auto';
        this._audio.setAttribute('playsinline', '');
      }
      const p = this._audio.play();
      if (p && p.catch) p.catch(() => {});
      if ('mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
      }
    } catch (e) {}
  },

  encerrarSessao() {
    try { if (this._audio) { this._audio.pause(); this._audio.currentTime = 0; } } catch (e) {}
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
    }
  },

  /** Constrói (uma vez) um WAV de 1s de silêncio como data URI, para o loop. */
  _uriSilencio() {
    if (this._silencio) return this._silencio;
    const sr = 8000, n = sr; // 1 segundo, mono, 16-bit
    const buf = new ArrayBuffer(44 + n * 2);
    const dv = new DataView(buf);
    const escrever = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    escrever(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); escrever(8, 'WAVE');
    escrever(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    escrever(36, 'data'); dv.setUint32(40, n * 2, true);
    // amostras já são zero = silêncio
    let bin = '';
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    this._silencio = 'data:audio/wav;base64,' + btoa(bin);
    return this._silencio;
  },

  /** Interrompe qualquer fala em andamento. */
  parar() {
    this._pararKeepAlive();
    if (!this.disponivel()) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Locutor };
