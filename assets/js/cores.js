/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* cores.js — a roda de cores dos marcadores.
 *
 * O seletor do proprio navegador e desconfortavel no celular: abre uma janela
 * do sistema, com abas e campos de numero. Aqui a escolha e direta — o dedo
 * anda pela roda e a cor sai na hora.
 *
 * Sao dois controles:
 *   a roda   escolhe o matiz (o angulo) e a saturacao (a distancia do centro)
 *   a barra  escolhe a tonalidade, do escuro ao claro
 *
 * O meio da barra e sempre a cor cheia, do jeito que saiu da roda. Andar para
 * a esquerda escurece, para a direita clareia.
 */

const Cores = {
  /* ------------------------------------------------------------ conversoes */

  hslParaRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] =
      h <  60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
      h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r, g, b].map(v => Math.round((v + m) * 255));
  },

  hslParaHex(h, s, l) {
    return '#' + this.hslParaRgb(h, s, l)
      .map(v => v.toString(16).padStart(2, '0')).join('');
  },

  hexParaHsl(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
    if (!m) return { h: 0, s: 70, l: 50 };
    const [r, g, b] = m.slice(1).map(v => parseInt(v, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
  },

  /* luminância relativa (0 preto … 1 branco), fórmula sRGB */
  luminancia(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec((hex || '').trim());
    if (!m) return 0;
    const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const [r, g, b] = m.slice(1).map(v => lin(parseInt(v, 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  },

  /* devolve preto ou branco — o que enxergar melhor SOBRE a cor dada.
   * Usado em qualquer texto que fique em cima de uma cor (o "Aplicar", o "A"
   * do fundo…), para nunca sumir numa cor muito clara ou muito escura. */
  contraste(hex) {
    const L = this.luminancia(hex);
    const contraBranco = 1.05 / (L + 0.05);
    const contraPreto = (L + 0.05) / 0.05;
    return contraPreto >= contraBranco ? '#000000' : '#ffffff';
  },
};

/* Memória global das últimas cores que a pessoa criou — a mesma para todas as
 * rodas do app (marcadores, notas, estudo…). Guarda até MAX cores, sempre a
 * mais recente na frente; ao encher, a mais antiga cai fora. Branco e preto
 * puros ficam SEMPRE presentes (e fixos), porque acertá-los na roda é chato e
 * eles são muito usados. Enquanto a pessoa não criou nada, mostramos uma paleta
 * colorida de partida — que vai sendo empurrada para fora conforme ela escolhe. */
const CoresRecentes = {
  CHAVE: 'cores-recentes',
  MAX: 30,
  // cores fixas, sempre presentes e imutáveis: branco, preto e as mais usadas no
  // app — marrom (tinta), bege (papel/fundo), vermelho (vinho) e âmbar (realce)
  FIXAS: ['#ffffff', '#000000', '#3a2a1a', '#efe3c6', '#8c2f39', '#f2c94c'],

  padrao: (() => {
    const hues = [0, 30, 50, 95, 140, 175, 200, 225, 265, 305];
    const lums = [44, 60, 74];
    const out = [];
    for (const l of lums) for (const h of hues) out.push(Cores.hslParaHex(h, 70, l));
    return out.slice(0, 30);
  })(),

  ehFixa(hex) { return this.FIXAS.includes((hex || '').toLowerCase()); },

  lista() {
    const salvas = Guarda.ler(this.CHAVE, null);
    return Array.isArray(salvas) && salvas.length ? salvas : this.padrao.slice();
  },

  registrar(hex) {
    hex = (hex || '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex) || this.ehFixa(hex)) return;   // ignora inválidas e as fixas
    let lista = this.lista().filter(c => c.toLowerCase() !== hex);  // tira duplicata
    lista.unshift(hex);                                            // a nova vai para a frente
    if (lista.length > this.MAX) lista = lista.slice(0, this.MAX); // a mais antiga cai
    Guarda.gravar(this.CHAVE, lista);
  },
};

const RodaDeCores = {
  /**
   * Monta o seletor dentro de um elemento.
   * @param {HTMLElement} caixa  onde desenhar
   * @param {string} corInicial  hex de partida
   * @param {(hex:string)=>void} aoMudar  chamado a cada movimento
   */
  montar(caixa, corInicial, aoMudar, opts = {}) {
    const inicio = Cores.hexParaHsl(corInicial);
    const estado = { h: inicio.h, s: Math.max(inicio.s, 12), l: inicio.l };
    const semAplicar = !!opts.semAplicar;   // no popup, quem aplica é o "Salvar"

    caixa.innerHTML = `
      <div class="roda-linha">
        <div class="roda" tabindex="0" role="slider" aria-label="Matiz e saturação">
          <div class="roda-alvo"></div>
        </div>
        <div class="roda-paleta" role="group" aria-label="Cores recentes"></div>
      </div>
      <div class="roda-barra" tabindex="0" role="slider" aria-label="Tonalidade">
        <div class="roda-alvo barra-alvo"></div>
      </div>
      <div class="roda-legenda"><span>mais escuro</span><span>mais claro</span></div>
      <div class="roda-rodape">
        <input class="roda-hex" type="text" spellcheck="false" autocomplete="off"
          maxlength="7" aria-label="Código hexadecimal da cor">
        ${semAplicar ? '' : '<button type="button" class="roda-aplicar">Aplicar</button>'}
      </div>`;

    const roda    = caixa.querySelector('.roda');
    const alvo    = caixa.querySelector('.roda .roda-alvo');
    const barra   = caixa.querySelector('.roda-barra');
    const alvoB   = caixa.querySelector('.barra-alvo');
    const aplicar = caixa.querySelector('.roda-aplicar');
    const rotulo  = caixa.querySelector('.roda-hex');
    const paleta  = caixa.querySelector('.roda-paleta');

    // desenha os quadradinhos: primeiro as FIXAS, uma divisória, e as recentes
    const pintarPaleta = () => {
      const chip = c => `<button type="button" class="roda-chip" data-cor="${c}"
           title="${c.toUpperCase()}" style="background:${c}"></button>`;
      const fixas = CoresRecentes.FIXAS.map(chip).join('');
      const recentes = CoresRecentes.lista().map(chip).join('');
      paleta.innerHTML = fixas
        + '<span class="roda-div" aria-hidden="true"></span>'
        + recentes;
    };

    const desenhar = (avisar = true) => {
      const hex = Cores.hslParaHex(estado.h, estado.s, estado.l);

      // alvo na roda: angulo = matiz, distancia do centro = saturacao
      const rad = (estado.h - 90) * Math.PI / 180;
      const raio = (estado.s / 100) * 50;
      alvo.style.left = `${50 + Math.cos(rad) * raio}%`;
      alvo.style.top  = `${50 + Math.sin(rad) * raio}%`;
      alvo.style.background = Cores.hslParaHex(estado.h, estado.s, 50);

      // a barra mostra esta cor do escuro ao claro, com a cor cheia no meio
      barra.style.background = `linear-gradient(to right,
        ${Cores.hslParaHex(estado.h, estado.s, 4)},
        ${Cores.hslParaHex(estado.h, estado.s, 50)},
        ${Cores.hslParaHex(estado.h, estado.s, 96)})`;
      alvoB.style.left = `${estado.l}%`;
      alvoB.style.background = hex;

      // o próprio botão "Aplicar" mostra a cor escolhida, com o texto sempre
      // contrastando; nada é aplicado ainda — só quando a pessoa apertar.
      if (aplicar) {
        aplicar.style.background = hex;
        aplicar.style.color = Cores.contraste(hex);
      }
      if (document.activeElement !== rotulo) rotulo.value = hex.toUpperCase();
      if (opts.vivo) opts.vivo(hex);   // no popup, o "Salvar" lê essa cor viva
    };

    /* --------------------------------------------------------- o arrastar */

    const pegar = (el, mover) => {
      const agir = evento => {
        evento.preventDefault();
        const t = evento.touches ? evento.touches[0] : evento;
        mover(el.getBoundingClientRect(), t.clientX, t.clientY);
        desenhar();
      };
      const soltar = () => {
        window.removeEventListener('pointermove', agir);
        window.removeEventListener('pointerup', soltar);
      };
      el.addEventListener('pointerdown', evento => {
        agir(evento);
        window.addEventListener('pointermove', agir);
        window.addEventListener('pointerup', soltar);
      });
    };

    pegar(roda, (r, x, y) => {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      let ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      if (ang < 0) ang += 360;
      estado.h = ang;
      const dist = Math.hypot(dx, dy) / (r.width / 2);
      estado.s = Math.round(Math.min(1, dist) * 100);
    });

    pegar(barra, (r, x) => {
      estado.l = Math.round(Math.max(2, Math.min(98, ((x - r.left) / r.width) * 100)));
    });

    // teclado, para quem estiver no computador
    roda.addEventListener('keydown', e => {
      const passo = e.shiftKey ? 15 : 4;
      if (e.key === 'ArrowRight') estado.h += passo;
      else if (e.key === 'ArrowLeft') estado.h -= passo;
      else if (e.key === 'ArrowUp') estado.s = Math.min(100, estado.s + passo);
      else if (e.key === 'ArrowDown') estado.s = Math.max(0, estado.s - passo);
      else return;
      e.preventDefault();
      desenhar();
    });

    barra.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') estado.l = Math.min(98, estado.l + 3);
      else if (e.key === 'ArrowLeft') estado.l = Math.max(2, estado.l - 3);
      else return;
      e.preventDefault();
      desenhar();
    });

    /* ---------- a paleta de recentes: tocar num quadradinho pré-visualiza --- */
    paleta.addEventListener('click', e => {
      const chip = e.target.closest('[data-cor]');
      if (!chip) return;
      const { h, s, l } = Cores.hexParaHsl(chip.dataset.cor);
      estado.h = h; estado.s = s; estado.l = l;   // fixas (0% sat) entram exatas
      desenhar();                                  // só carrega a cor na roda; aplicar é no botão
    });

    /* ---------- o hex digitável: escrever o código move a cor em tudo ------- */
    const lerHexDigitado = () => {
      let v = rotulo.value.trim().replace(/^#/, '');
      if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map(c => c + c).join('');  // atalho de 3 dígitos
      if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
      return '#' + v.toLowerCase();
    };
    rotulo.addEventListener('input', () => {
      const hex = lerHexDigitado();
      if (!hex) return;                            // ainda incompleto: espera terminar
      const { h, s, l } = Cores.hexParaHsl(hex);
      estado.h = h; estado.s = s; estado.l = l;
      desenhar();                                  // sobe na roda, na barra e no botão
    });
    // ao confirmar (Enter/sair) só arruma o texto do campo; não aplica nem guarda
    rotulo.addEventListener('change', () => {
      rotulo.value = Cores.hslParaHex(estado.h, estado.s, estado.l).toUpperCase();
    });
    rotulo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); rotulo.blur(); } });

    /* ---------- APLICAR: o único lugar que aplica a cor e a guarda ---------- */
    if (aplicar) {
      aplicar.addEventListener('click', () => {
        const hex = Cores.hslParaHex(estado.h, estado.s, estado.l);
        aoMudar(hex);                    // aplica no alvo (texto, marcador, fundo…)
        CoresRecentes.registrar(hex);    // só agora entra nos recentes
        pintarPaleta();
      });
    }

    pintarPaleta();
    desenhar(false);

    // controlador para quem monta em popup: lê a cor viva e força um redesenho
    return {
      corAtual: () => Cores.hslParaHex(estado.h, estado.s, estado.l),
      redesenhar: () => desenhar(false),
    };
  },
};
