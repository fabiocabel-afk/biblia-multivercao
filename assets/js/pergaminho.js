/* ============================================================== pergaminho
 *
 * O estilo "Histórico": uma folha de pergaminho gerada por código, atrás de
 * tudo. Ela corre contínua de cima a baixo, atravessando as barras (que ficam
 * transparentes), e só as LATERAIS ficam queimadas — o miolo permanece claro,
 * porque a leitura vem antes de qualquer enfeite.
 *
 * Tudo é desenhado com gradientes (o âmbar, o brilho central, a queima das
 * bordas) mais uma fina camada de ruído (o grão do papel). Como é código, dois
 * parâmetros bastam:
 *   - idade (0..100): um controle só, que envelhece o material inteiro junto —
 *     o âmbar aprofunda, as laterais queimam mais largas e escuras, o grão cresce.
 *   - semente: derivada do capítulo aberto, para que cada capítulo tenha a sua
 *     cara e permaneça a mesma quando a pessoa volta a ele, sem ficar monótono.
 *
 * O padrão antigo (estilo "Tradicional", com a temperatura do papel) fica
 * intacto: o Histórico só entra quando escolhido.
 */
const Pergaminho = {
  _seed: 1,
  _idade: 45,
  _ativo: false,

  // as variaveis inline que a temperatura grava no documentElement; ao entrar
  // no Historico elas precisam sair para as cores do pergaminho valerem
  _varsTemp: ['--papel', '--tinta', '--tinta-fraca', '--tinta-numero',
    '--cromo', '--cromo-alto', '--cromo-texto', '--cromo-fraco'],

  /* ----------------------------------------------------------- utilitarios */
  _mix(a, b, t) { return a.map((x, i) => Math.round(x + (b[i] - x) * t)); },
  _rgb(c) { return `rgb(${c[0]} ${c[1]} ${c[2]})`; },
  _rgba(c, al) { return `rgba(${c[0]},${c[1]},${c[2]},${al})`; },

  /* string -> inteiro pequeno e estavel (FNV-1a). Mesmo capitulo, mesma folha. */
  semente(texto) {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 997;
  },

  /* uma folha de ruido fractal em SVG: o grao e as manchas do papel, tingidos
   * de marrom. O seed muda o desenho a cada capitulo; a frequencia cresce um
   * pouco com a idade. Fica em opacidade baixa, so um veu. */
  _grao(seed, freq, alfa) {
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'>"
      + "<filter id='f' x='0' y='0' width='100%' height='100%'>"
      + `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='4' seed='${seed}' stitchTiles='stitch'/>`
      + `<feColorMatrix type='matrix' values='0 0 0 0 0.40  0 0 0 0 0.27  0 0 0 0 0.15  0 0 0 ${alfa} 0'/>`
      + "</filter>"
      + "<rect width='320' height='320' filter='url(#f)'/></svg>";
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  },

  /* garante a camada fixa atras de tudo */
  _camada() {
    let el = document.getElementById('perg-fundo');
    if (!el) {
      el = document.createElement('div');
      el.id = 'perg-fundo';
      el.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  },

  /* ------------------------------------------------------------- pintura */
  _pintar() {
    if (!this._ativo) return;
    const el = this._camada();
    const a = Math.max(0, Math.min(100, this._idade)) / 100;

    // cores do ambar: idade 0 = folha NOVA "para a epoca" (creme claro, quase sem
    // queima) -> idade 100 = muito envelhecida (ambar profundo, bordas escuras).
    // Os extremos "novos" ficam bem mais claros que antes.
    const centro = this._mix([247, 241, 219], [214, 178, 120], a);   // miolo
    const meio   = this._mix([242, 232, 200], [196, 150, 88],  a);
    const meioEsc = this._mix([232, 218, 182], [168, 124, 74], a);
    const burnt  = this._mix([200, 165, 110], [58, 33, 16],    a);   // queima das bordas

    // a semente move de leve o centro do brilho e a largura das queimas, para
    // que cada capitulo tenha um jeito proprio sem sair da familia
    const jx = 50 + ((this._seed % 9) - 4) * 0.7;   // 46.5% .. 53.5%
    const jy = 45 + ((this._seed % 7) - 3) * 0.6;
    const largE = 6 + 22 * a + ((this._seed % 5) - 2) * 0.6;    // % lateral esquerda
    const largD = 6 + 22 * a + ((this._seed % 4) - 1.5) * 0.6;  // % lateral direita
    const forca = 0.06 + 0.82 * a;   // idade 0 = quase sem queima; 100 = bem carbonizada
    const alfaGrao = 0.03 + 0.08 * a;
    const freq = (0.014 + 0.006 * a).toFixed(3);

    const glow = `radial-gradient(ellipse 66% 82% at ${jx.toFixed(1)}% ${jy.toFixed(1)}%, `
      + `${this._rgb(centro)} 0%, ${this._rgb(meio)} 66%, ${this._rgb(meioEsc)} 100%)`;

    const b0 = this._rgba(burnt, forca.toFixed(2));
    const bT = this._rgba(burnt, 0);
    const burn = `linear-gradient(90deg, ${b0} 0%, ${bT} ${largE.toFixed(1)}%, `
      + `${bT} ${(100 - largD).toFixed(1)}%, ${b0} 100%)`;

    el.style.backgroundColor = this._rgb(meio);
    el.style.backgroundImage = `${this._grao(this._seed, freq, alfaGrao.toFixed(3))}, ${burn}, ${glow}`;
    el.style.backgroundSize = '320px 320px, 100% 100%, 100% 100%';
    el.style.backgroundRepeat = 'repeat, no-repeat, no-repeat';
    el.style.backgroundBlendMode = 'multiply, normal, normal';

    // a barra do sistema acompanha o topo do pergaminho
    const hex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', hex(meioEsc));
  },

  /* ------------------------------------------------------------- controles */

  /* liga/desliga o estilo. Ao entrar, tira as variaveis inline da temperatura
   * (para as cores do pergaminho valerem); ao sair, manda o app repor o
   * tradicional (temperatura + escuro). */
  aplicarEstilo(estilo) {
    const historico = estilo === 'historico';
    this._ativo = historico;
    document.documentElement.dataset.estilo = historico ? 'historico' : 'tradicional';

    if (historico) {
      const s = document.documentElement.style;
      this._varsTemp.forEach(v => s.removeProperty(v));
      this._camada();
      this._pintar();
    } else {
      const el = document.getElementById('perg-fundo');
      if (el) el.style.backgroundImage = 'none';
      // repor o visual tradicional (quem chama passa as prefs atuais)
      if (typeof Leitura !== 'undefined') {
        Leitura.aplicarEscuro(Prefs.get('escuro'));
        if (!Prefs.get('escuro')) Leitura.aplicarTemperatura(Prefs.get('temperatura'));
      }
    }
  },

  /* o controle unico: envelhece a folha inteira */
  aplicarTema(tema) {
    document.documentElement.dataset.tema = tema || 'marrom';
  },

  aplicarIdade(idade) {
    this._idade = idade;
    if (this._ativo) this._pintar();
  },

  /* cada capitulo tem a sua folha; volta ao mesmo capitulo => mesma folha */
  folha(code, cap) {
    this._seed = this.semente(`${code}:${cap}`);
    if (this._ativo) this._pintar();
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Pergaminho };
