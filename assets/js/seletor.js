/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* ============================================================== Seletor =====
 * A lista suspensa nativa do <select> é desenhada pelo sistema operacional e
 * não aceita o nosso tema — fica com cara de navegador. Este módulo desenha,
 * por cima de cada <select>, um botão e uma lista no visual do app.
 *
 * O <select> real continua ali por baixo (escondido, mas vivo): é ele quem
 * guarda o valor e dispara o evento "change" que o resto do código escuta.
 * Nós só refletimos o que ele diz e devolvemos a escolha para ele. Assim
 * nenhuma lógica existente precisa mudar. */
const Seletor = {
  _obs: null,
  _aberta: null,
  _casca: null,

  /** Enfeita tudo que já existe e passa a vigiar o que nascer depois. */
  iniciar() {
    if (typeof document === 'undefined' || !document.body) return;
    this.aplicarEm(document);
    if (this._obs) return;
    this._obs = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(no => {
          if (no.nodeType !== 1) return;
          if (no.tagName === 'SELECT') this.enfeitar(no);
          else if (no.querySelectorAll) no.querySelectorAll('select').forEach(s => this.enfeitar(s));
        });
      }
    });
    this._obs.observe(document.body, { childList: true, subtree: true });
  },

  aplicarEm(raiz) {
    if (raiz && raiz.querySelectorAll) raiz.querySelectorAll('select').forEach(s => this.enfeitar(s));
  },

  /** Desenha a casca (botão) ao lado de um <select> e o mantém sincronizado. */
  enfeitar(sel) {
    if (!sel || sel.dataset.enfeitado === '1') return;
    sel.dataset.enfeitado = '1';
    sel.classList.add('sel-nativo');            // some da vista, sem sumir do DOM

    const casca = document.createElement('button');
    casca.type = 'button';
    // herda as classes do select (campo-sel, fmt-fonte…) para manter o tamanho
    // certo em cada contexto; a aparência de lista é normalizada no CSS.
    casca.className = ('sel-tema ' + sel.className.replace('sel-nativo', '')).trim();
    casca.setAttribute('aria-haspopup', 'listbox');
    const rotulo = document.createElement('span');
    rotulo.className = 'sel-tema-txt';
    const seta = document.createElement('span');
    seta.className = 'sel-tema-seta';
    seta.setAttribute('aria-hidden', 'true');
    casca.append(rotulo, seta);
    sel.after(casca);

    const sincronizar = () => {
      const op = sel.options[sel.selectedIndex];
      rotulo.textContent = op ? op.textContent : '';
      casca.disabled = sel.disabled;
    };
    sincronizar();
    sel._sincronizarTema = sincronizar;

    casca.addEventListener('click', () => { if (!sel.disabled) this.abrir(sel, casca); });
    sel.addEventListener('change', sincronizar);
    // se o app trocar as <option> por baixo (cascata de filtros, nova versão…),
    // o rótulo acompanha
    new MutationObserver(sincronizar).observe(sel, {
      childList: true, attributes: true, attributeFilter: ['disabled'],
    });
  },

  /** Abre a lista no tema, ancorada logo abaixo (ou acima) da casca. */
  abrir(sel, casca) {
    this.fechar();
    const lista = document.createElement('div');
    lista.className = 'sel-lista';
    lista.setAttribute('role', 'listbox');

    Array.from(sel.options).forEach((op, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sel-opcao'
        + (i === sel.selectedIndex ? ' marcada' : '')
        + (op.disabled ? ' inerte' : '');
      item.textContent = op.textContent;
      item.setAttribute('role', 'option');
      if (!op.disabled) {
        item.addEventListener('click', () => {
          if (sel.selectedIndex !== i) {
            sel.selectedIndex = i;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (sel._sincronizarTema) sel._sincronizarTema();
          this.fechar();
        });
      }
      lista.appendChild(item);
    });

    document.body.appendChild(lista);
    this._aberta = lista;
    this._casca = casca;
    casca.classList.add('aberta');
    this._posicionar(lista, casca);

    const marcada = lista.querySelector('.marcada');
    if (marcada && marcada.scrollIntoView) marcada.scrollIntoView({ block: 'nearest' });

    this._fora = e => {
      if (!lista.contains(e.target) && e.target !== casca && !casca.contains(e.target)) this.fechar();
    };
    this._tecla = e => { if (e.key === 'Escape') this.fechar(); };
    setTimeout(() => {
      document.addEventListener('pointerdown', this._fora, true);
      document.addEventListener('keydown', this._tecla, true);
      window.addEventListener('resize', Seletor._fecharLig, true);
      window.addEventListener('scroll', Seletor._fecharLig, true);
    }, 0);
  },

  _posicionar(lista, casca) {
    const r = casca.getBoundingClientRect();
    const vh = window.innerHeight || 600;
    lista.style.position = 'fixed';
    lista.style.left = r.left + 'px';
    lista.style.width = r.width + 'px';
    const abaixo = vh - r.bottom;
    const alturaMax = Math.max(abaixo, r.top) - 14;
    lista.style.maxHeight = Math.min(320, Math.max(120, alturaMax)) + 'px';
    if (abaixo >= 180 || abaixo >= r.top) {          // cabe (ou sobra mais) embaixo
      lista.style.top = (r.bottom + 4) + 'px';
      lista.style.bottom = 'auto';
    } else {                                          // vira para cima
      lista.style.bottom = (vh - r.top + 4) + 'px';
      lista.style.top = 'auto';
    }
  },

  fechar() {
    if (this._casca) this._casca.classList.remove('aberta');
    if (this._aberta && this._aberta.remove) this._aberta.remove();
    this._aberta = null;
    this._casca = null;
    document.removeEventListener('pointerdown', this._fora, true);
    document.removeEventListener('keydown', this._tecla, true);
    window.removeEventListener('resize', Seletor._fecharLig, true);
    window.removeEventListener('scroll', Seletor._fecharLig, true);
  },
};
Seletor._fecharLig = () => Seletor.fechar();

if (typeof module !== 'undefined' && module.exports) module.exports = { Seletor };
