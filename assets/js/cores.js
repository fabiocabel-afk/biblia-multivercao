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
};

const RodaDeCores = {
  /**
   * Monta o seletor dentro de um elemento.
   * @param {HTMLElement} caixa  onde desenhar
   * @param {string} corInicial  hex de partida
   * @param {(hex:string)=>void} aoMudar  chamado a cada movimento
   */
  montar(caixa, corInicial, aoMudar) {
    const inicio = Cores.hexParaHsl(corInicial);
    const estado = { h: inicio.h, s: Math.max(inicio.s, 12), l: inicio.l };

    caixa.innerHTML = `
      <div class="roda-linha">
        <div class="roda" tabindex="0" role="slider" aria-label="Matiz e saturação">
          <div class="roda-alvo"></div>
        </div>
        <div class="roda-lado">
          <div class="roda-amostra"></div>
          <div class="roda-hex"></div>
        </div>
      </div>
      <div class="roda-barra" tabindex="0" role="slider" aria-label="Tonalidade">
        <div class="roda-alvo barra-alvo"></div>
      </div>
      <div class="roda-legenda"><span>mais escuro</span><span>mais claro</span></div>`;

    const roda    = caixa.querySelector('.roda');
    const alvo    = caixa.querySelector('.roda .roda-alvo');
    const barra   = caixa.querySelector('.roda-barra');
    const alvoB   = caixa.querySelector('.barra-alvo');
    const amostra = caixa.querySelector('.roda-amostra');
    const rotulo  = caixa.querySelector('.roda-hex');

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

      amostra.style.background = hex;
      rotulo.textContent = hex.toUpperCase();
      if (avisar) aoMudar(hex);
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

    desenhar(false);
  },
};
