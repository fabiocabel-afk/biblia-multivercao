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
   * algo falando mantém o áudio correndo — é o truque que faz ouvir de bolso,
   * pelo fone, funcionar. Para sozinho quando não há mais nada falando. */
  _manterVivo() {
    if (this._keep) return;
    this._keep = setInterval(() => {
      try {
        const s = window.speechSynthesis;
        if (s.speaking || s.pending) { if (s.paused) s.resume(); s.resume(); }
        else this._pararKeepAlive();
      } catch (e) { this._pararKeepAlive(); }
    }, 8000);
  },

  _pararKeepAlive() {
    if (this._keep) { clearInterval(this._keep); this._keep = null; }
  },

  /** Interrompe qualquer fala em andamento. */
  parar() {
    this._pararKeepAlive();
    if (!this.disponivel()) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Locutor };
