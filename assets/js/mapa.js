/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* ================================================================== Mapa =====
 * Atlas bíblico. Carrega data/meta/localidades.json sob demanda (na 1ª abertura)
 * e desenha um mapa Leaflet com as ~1.351 localidades. A tela tem três seções
 * empilhadas que competem pelo espaço — Mapa, Cidades e Versículos — cada uma
 * com cabeçalho e seta para recolher/expandir.
 *
 * Engata no que já existe: App.abrir/fecharPaineis/pularParaReferencia para a
 * navegação, Dados.infoLivro/nomeCurto para os nomes de livro na versão atual,
 * e o Seletor (que troca <select> nativo pelo do tema) para os dois menus.
 *
 * Marcadores são vetoriais (L.circleMarker): não dependem de imagem de pino.
 * Os tiles do mapa (fundo) precisam de internet; sem sinal, os pontos ainda
 * aparecem sobre um fundo liso e um aviso discreto é mostrado.
 *
 * LIÇÃO do projeto: latitude/longitude são sempre coeridas com Number() antes
 * de qualquer conta de limites — foi o bug do parseFloat que travava a escala. */
const Mapa = {
  _pronto: false,
  _carregando: false,
  _locais: [],
  _map: null,
  _grupo: null,
  _marcadores: new Map(),     // id -> circleMarker
  _cidadeAtual: null,
  _livro: '',
  _termo: '',
  _modo: 'cidade',            // busca: 'cidade' | 'vers'
  _multi: false,             // seleção múltipla de cidades
  _selecao: [],              // ids selecionados, na ordem do clique
  _versFiltro: null,         // {code,cap,vers} quando um versículo filtra as cidades
  _versKey: null,            // chave do índice de versículos atual (evita redesenho)
  _bookByCode: null,

  /* Canone padrão: ordem de leitura, nome e abreviação de reserva + testamento.
   * O nome exibido é sempre o da VERSÃO ATUAL quando o app souber (Dados);
   * esta máscara garante ordem/abreviação/agrupamento mesmo offline. */
  BOOKS: [
    { c: 'GEN', pt: 'Gênesis', s: 'Gn', o: 1, t: 'Antigo Testamento' },
    { c: 'EXO', pt: 'Êxodo', s: 'Êx', o: 2, t: 'Antigo Testamento' },
    { c: 'LEV', pt: 'Levítico', s: 'Lv', o: 3, t: 'Antigo Testamento' },
    { c: 'NUM', pt: 'Números', s: 'Nm', o: 4, t: 'Antigo Testamento' },
    { c: 'DEU', pt: 'Deuteronômio', s: 'Dt', o: 5, t: 'Antigo Testamento' },
    { c: 'JOS', pt: 'Josué', s: 'Js', o: 6, t: 'Antigo Testamento' },
    { c: 'JDG', pt: 'Juízes', s: 'Jz', o: 7, t: 'Antigo Testamento' },
    { c: 'RUT', pt: 'Rute', s: 'Rt', o: 8, t: 'Antigo Testamento' },
    { c: '1SA', pt: '1 Samuel', s: '1Sm', o: 9, t: 'Antigo Testamento' },
    { c: '2SA', pt: '2 Samuel', s: '2Sm', o: 10, t: 'Antigo Testamento' },
    { c: '1KI', pt: '1 Reis', s: '1Rs', o: 11, t: 'Antigo Testamento' },
    { c: '2KI', pt: '2 Reis', s: '2Rs', o: 12, t: 'Antigo Testamento' },
    { c: '1CH', pt: '1 Crônicas', s: '1Cr', o: 13, t: 'Antigo Testamento' },
    { c: '2CH', pt: '2 Crônicas', s: '2Cr', o: 14, t: 'Antigo Testamento' },
    { c: 'EZR', pt: 'Esdras', s: 'Ed', o: 15, t: 'Antigo Testamento' },
    { c: 'NEH', pt: 'Neemias', s: 'Ne', o: 16, t: 'Antigo Testamento' },
    { c: 'EST', pt: 'Ester', s: 'Et', o: 17, t: 'Antigo Testamento' },
    { c: 'JOB', pt: 'Jó', s: 'Jó', o: 18, t: 'Antigo Testamento' },
    { c: 'PSA', pt: 'Salmos', s: 'Sl', o: 19, t: 'Antigo Testamento' },
    { c: 'PRO', pt: 'Provérbios', s: 'Pv', o: 20, t: 'Antigo Testamento' },
    { c: 'ECC', pt: 'Eclesiastes', s: 'Ec', o: 21, t: 'Antigo Testamento' },
    { c: 'SNG', pt: 'Cântico dos Cânticos', s: 'Ct', o: 22, t: 'Antigo Testamento' },
    { c: 'ISA', pt: 'Isaías', s: 'Is', o: 23, t: 'Antigo Testamento' },
    { c: 'JER', pt: 'Jeremias', s: 'Jr', o: 24, t: 'Antigo Testamento' },
    { c: 'LAM', pt: 'Lamentações', s: 'Lm', o: 25, t: 'Antigo Testamento' },
    { c: 'EZK', pt: 'Ezequiel', s: 'Ez', o: 26, t: 'Antigo Testamento' },
    { c: 'DAN', pt: 'Daniel', s: 'Dn', o: 27, t: 'Antigo Testamento' },
    { c: 'HOS', pt: 'Oseias', s: 'Os', o: 28, t: 'Antigo Testamento' },
    { c: 'JOL', pt: 'Joel', s: 'Jl', o: 29, t: 'Antigo Testamento' },
    { c: 'AMO', pt: 'Amós', s: 'Am', o: 30, t: 'Antigo Testamento' },
    { c: 'OBA', pt: 'Obadias', s: 'Ob', o: 31, t: 'Antigo Testamento' },
    { c: 'JON', pt: 'Jonas', s: 'Jn', o: 32, t: 'Antigo Testamento' },
    { c: 'MIC', pt: 'Miqueias', s: 'Mq', o: 33, t: 'Antigo Testamento' },
    { c: 'NAM', pt: 'Naum', s: 'Na', o: 34, t: 'Antigo Testamento' },
    { c: 'NAH', pt: 'Naum', s: 'Na', o: 34, t: 'Antigo Testamento' },
    { c: 'HAB', pt: 'Habacuque', s: 'Hc', o: 35, t: 'Antigo Testamento' },
    { c: 'ZEP', pt: 'Sofonias', s: 'Sf', o: 36, t: 'Antigo Testamento' },
    { c: 'HAG', pt: 'Ageu', s: 'Ag', o: 37, t: 'Antigo Testamento' },
    { c: 'ZEC', pt: 'Zacarias', s: 'Zc', o: 38, t: 'Antigo Testamento' },
    { c: 'MAL', pt: 'Malaquias', s: 'Ml', o: 39, t: 'Antigo Testamento' },
    { c: 'TOB', pt: 'Tobias', s: 'Tb', o: 40, t: 'Deuterocanônicos' },
    { c: 'JDT', pt: 'Judite', s: 'Jdt', o: 41, t: 'Deuterocanônicos' },
    { c: 'BAR', pt: 'Baruque', s: 'Br', o: 42, t: 'Deuterocanônicos' },
    { c: '1MA', pt: '1 Macabeus', s: '1Mc', o: 43, t: 'Deuterocanônicos' },
    { c: '2MA', pt: '2 Macabeus', s: '2Mc', o: 44, t: 'Deuterocanônicos' },
    { c: 'WIS', pt: 'Sabedoria', s: 'Sb', o: 45, t: 'Deuterocanônicos' },
    { c: 'SIR', pt: 'Eclesiástico', s: 'Eclo', o: 46, t: 'Deuterocanônicos' },
    { c: 'MAT', pt: 'Mateus', s: 'Mt', o: 47, t: 'Novo Testamento' },
    { c: 'MRK', pt: 'Marcos', s: 'Mc', o: 48, t: 'Novo Testamento' },
    { c: 'LUK', pt: 'Lucas', s: 'Lc', o: 49, t: 'Novo Testamento' },
    { c: 'JHN', pt: 'João', s: 'Jo', o: 50, t: 'Novo Testamento' },
    { c: 'ACT', pt: 'Atos', s: 'At', o: 51, t: 'Novo Testamento' },
    { c: 'ROM', pt: 'Romanos', s: 'Rm', o: 52, t: 'Novo Testamento' },
    { c: '1CO', pt: '1 Coríntios', s: '1Co', o: 53, t: 'Novo Testamento' },
    { c: '2CO', pt: '2 Coríntios', s: '2Co', o: 54, t: 'Novo Testamento' },
    { c: 'GAL', pt: 'Gálatas', s: 'Gl', o: 55, t: 'Novo Testamento' },
    { c: 'EPH', pt: 'Efésios', s: 'Ef', o: 56, t: 'Novo Testamento' },
    { c: 'PHP', pt: 'Filipenses', s: 'Fp', o: 57, t: 'Novo Testamento' },
    { c: 'COL', pt: 'Colossenses', s: 'Cl', o: 58, t: 'Novo Testamento' },
    { c: '1TH', pt: '1 Tessalonicenses', s: '1Ts', o: 59, t: 'Novo Testamento' },
    { c: '2TH', pt: '2 Tessalonicenses', s: '2Ts', o: 60, t: 'Novo Testamento' },
    { c: '1TI', pt: '1 Timóteo', s: '1Tm', o: 61, t: 'Novo Testamento' },
    { c: '2TI', pt: '2 Timóteo', s: '2Tm', o: 62, t: 'Novo Testamento' },
    { c: 'TIT', pt: 'Tito', s: 'Tt', o: 63, t: 'Novo Testamento' },
    { c: 'PHM', pt: 'Filemom', s: 'Fm', o: 64, t: 'Novo Testamento' },
    { c: 'HEB', pt: 'Hebreus', s: 'Hb', o: 65, t: 'Novo Testamento' },
    { c: 'JAM', pt: 'Tiago', s: 'Tg', o: 66, t: 'Novo Testamento' },
    { c: 'JAS', pt: 'Tiago', s: 'Tg', o: 66, t: 'Novo Testamento' },
    { c: '1PE', pt: '1 Pedro', s: '1Pe', o: 67, t: 'Novo Testamento' },
    { c: '2PE', pt: '2 Pedro', s: '2Pe', o: 68, t: 'Novo Testamento' },
    { c: '1JO', pt: '1 João', s: '1Jo', o: 69, t: 'Novo Testamento' },
    { c: '2JO', pt: '2 João', s: '2Jo', o: 70, t: 'Novo Testamento' },
    { c: '3JO', pt: '3 João', s: '3Jo', o: 71, t: 'Novo Testamento' },
    { c: 'JUD', pt: 'Judas', s: 'Jd', o: 72, t: 'Novo Testamento' },
    { c: 'REV', pt: 'Apocalipse', s: 'Ap', o: 73, t: 'Novo Testamento' },
  ],

  /* -------------------------------------------------------------- utilidades */
  _norm(t) {
    return (t || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  },

  _bookInfo(code) {
    if (!this._bookByCode) {
      this._bookByCode = new Map();
      for (const b of this.BOOKS) if (!this._bookByCode.has(b.c)) this._bookByCode.set(b.c, b);
    }
    return this._bookByCode.get(code) || null;
  },

  /* Nome completo do livro na versão atual (cai na máscara se o app não souber). */
  _nomeLivro(code) {
    try {
      const info = Dados.infoLivro(App.versao, code);
      if (info && info.name) return info.name;
    } catch (e) { /* sem versão carregada */ }
    const b = this._bookInfo(code);
    return b ? b.pt : code;
  },

  /* Abreviação do livro (para os chips de versículo). */
  _abrevLivro(code) {
    try {
      const curto = Dados.nomeCurto && Dados.nomeCurto(App.versao, code);
      if (curto) return curto;
    } catch (e) { /* idem */ }
    const b = this._bookInfo(code);
    return b ? b.s : code;
  },

  _ordemLivro(code) {
    const b = this._bookInfo(code);
    return b ? b.o : 999;
  },

  /* "2KI 5:12" -> { code:'2KI', cap:5, vers:12 } (ou null se não casar). */
  _parseRef(ref) {
    const m = /^\s*([1-3]?[A-Z]{2,4})\s+(\d+):(\d+)/.exec(ref || '');
    if (!m) return null;
    return { code: m[1], cap: parseInt(m[2], 10), vers: parseInt(m[3], 10) };
  },

  /* Como _parseRef, mas anexa _t: texto normalizado (código + nome + abreviação
   * + cap:vers) para a busca por versículo casar "Jonas", "Jn", "JON 1:2"… */
  _prepRef(ref) {
    const p = this._parseRef(ref);
    if (!p) return null;
    const b = this._bookInfo(p.code);
    p._t = this._norm(`${p.code} ${b ? b.pt : ''} ${b ? b.s : ''} ${p.cap}:${p.vers}`);
    return p;
  },

  /* =============================================================== abertura */
  abrir() {
    App.abrir('painel-mapa');
    this._garantir();
  },

  async _garantir() {
    if (this._pronto) {
      // painel reaberto: o Leaflet precisa remedir o container que voltou a existir
      this._remedir();
      return;
    }
    if (this._carregando) return;
    this._carregando = true;
    try {
      const resp = await fetch('data/meta/localidades.json', { cache: 'force-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const dados = await resp.json();
      this._locais = (dados.locais || []).map(l => {
        const refs = (l.r || []).map(r => this._prepRef(r)).filter(Boolean);
        return {
          ...l,
          lat: Number(l.lat),
          lon: Number(l.lon),
          _busca: this._norm([l.n, ...(l.v || [])].join(' ')),
          _refs: refs,
          _livros: new Set(refs.map(r => r.code)),
        };
      });
      this._montarControles();
      this._iniciarMapa();
      this._render();
      this._pronto = true;
    } catch (e) {
      const lista = document.getElementById('mapa-lista-cidades');
      if (lista) lista.innerHTML = '<div class="mapa-vazio">Não foi possível carregar as localidades. Verifique a conexão e reabra o Mapa.</div>';
    } finally {
      this._carregando = false;
    }
  },

  /* ------------------------------------------------------- controles da barra */
  _montarControles() {
    const busca = document.getElementById('mapa-busca-campo');
    const limpar = document.getElementById('mapa-busca-limpar');
    const selLivro = document.getElementById('mapa-livro');
    const selRaio = document.getElementById('mapa-raio');

    // seções retráteis
    document.querySelectorAll('#painel-mapa .mapa-cab[data-secao]').forEach(cab => {
      cab.addEventListener('click', () => this._alternarSecao(cab.dataset.secao));
    });

    // busca (com atraso curto para não redesenhar a cada tecla)
    let t = null;
    busca.addEventListener('input', () => {
      limpar.hidden = !busca.value;
      clearTimeout(t);
      t = setTimeout(() => { this._termo = busca.value; this._cidadeAtual = null; this._render(); }, 160);
    });
    limpar.addEventListener('click', () => {
      busca.value = ''; limpar.hidden = true; this._termo = ''; this._cidadeAtual = null; this._render(); busca.focus();
    });

    // alternador Cidade / Versículo
    document.querySelectorAll('#painel-mapa .mapa-modo-bt').forEach(bt => {
      bt.addEventListener('click', () => {
        if (this._modo === bt.dataset.modo) return;
        this._modo = bt.dataset.modo;
        document.querySelectorAll('#painel-mapa .mapa-modo-bt').forEach(x =>
          x.classList.toggle('ativo', x.dataset.modo === this._modo));
        busca.placeholder = this._modo === 'vers'
          ? 'Buscar por livro/versículo, ex.: Jonas 1'
          : 'Buscar cidade…';
        this._cidadeAtual = null;
        this._render();
      });
    });

    // filtro de livros: Todos + separadores por testamento + livros presentes
    const presentes = new Set();
    for (const l of this._locais) for (const c of l._livros) presentes.add(c);
    const ordenados = [...presentes].sort((a, b) => this._ordemLivro(a) - this._ordemLivro(b));
    const porTest = {};
    for (const c of ordenados) {
      const b = this._bookInfo(c);
      const t2 = b ? b.t : 'Outros';
      (porTest[t2] = porTest[t2] || []).push(c);
    }
    let html = '<option value="">Todos os livros</option>';
    for (const test of ['Antigo Testamento', 'Deuterocanônicos', 'Novo Testamento', 'Outros']) {
      const cods = porTest[test];
      if (!cods || !cods.length) continue;
      html += `<option value="__" disabled>— ${test} —</option>`;
      for (const c of cods) html += `<option value="${c}">${this._nomeLivro(c)}</option>`;
    }
    selLivro.innerHTML = html;
    if (selLivro._sincronizarTema) selLivro._sincronizarTema();
    selLivro.addEventListener('change', () => {
      if (selLivro.value === '__') { selLivro.value = this._livro; if (selLivro._sincronizarTema) selLivro._sincronizarTema(); return; }
      this._livro = selLivro.value;
      this._cidadeAtual = null;
      this._render();
    });

    selRaio.addEventListener('change', () => {
      if (this._selecao.length === 1) {
        const c = this._locais.find(x => x.id === this._selecao[0]);
        if (c) this._centralizar(c);
      }
    });

    // seleção múltipla (checkbox na barra do mapa, à esquerda da seta)
    const chkMulti = document.getElementById('mapa-multi-chk');
    if (chkMulti) {
      const rotulo = chkMulti.closest('.mapa-multi');
      if (rotulo) rotulo.addEventListener('click', e => e.stopPropagation()); // não recolhe a seção
      chkMulti.addEventListener('change', () => {
        this._multi = chkMulti.checked;
        if (!this._multi && this._cidadeAtual) {
          // volta para seleção única: mantém só a cidade em foco
          this._selecao = [this._cidadeAtual.id];
          this._desenharMarcadores(this._cidadesFiltradas());
          this._marcarListaAtiva();
          this._desenharCapsulas();
        }
      });
    }
  },

  /* --------------------------------------------------------- seções retráteis */
  _alternarSecao(qual) {
    const sec = document.getElementById('mapa-sec-' + qual);
    if (!sec) return;
    sec.classList.toggle('recolhida');
    const cab = sec.querySelector('.mapa-cab');
    if (cab) cab.setAttribute('aria-expanded', sec.classList.contains('recolhida') ? 'false' : 'true');
    // o mapa mudou de tamanho: remedir depois da transição
    if (qual === 'mapa' || document.getElementById('mapa-sec-mapa')) this._remedir(280);
  },

  /* ------------------------------------------------------------- o mapa (Leaflet) */
  _iniciarMapa() {
    const el = document.getElementById('mapa-canvas');
    if (!el || this._map) return;
    this._map = L.map(el, {
      center: [31.5, 35.2],       // Terra Santa
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, attribution: 'Tiles © Esri' }
    ).addTo(this._map);
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(this._map);
    this._grupo = L.layerGroup().addTo(this._map);

    // aviso de internet: os tiles precisam de rede
    const aviso = document.getElementById('mapa-aviso-net');
    if (aviso) {
      const mostrar = () => { aviso.hidden = false; };
      if (!navigator.onLine) mostrar();
      this._map.on('tileerror', mostrar);
      window.addEventListener('online', () => { aviso.hidden = true; });
    }

    // remede sozinho quando o container muda de tamanho (recolher/expandir seções)
    if (typeof ResizeObserver !== 'undefined') {
      let r = null;
      const ro = new ResizeObserver(() => {
        clearTimeout(r);
        r = setTimeout(() => { if (this._map) this._map.invalidateSize(); }, 120);
      });
      ro.observe(el);
    }
    this._remedir(60);
  },

  _remedir(atraso) {
    if (!this._map) return;
    setTimeout(() => { if (this._map) this._map.invalidateSize(); }, atraso || 0);
  },

  _marcadorDe(loc) {
    let m = this._marcadores.get(loc.id);
    if (m) return m;
    m = L.circleMarker([loc.lat, loc.lon], {
      radius: 5, color: '#ffffff', weight: 1.4,
      fillColor: '#8c2f39', fillOpacity: .85,
    });
    m.bindTooltip(loc.n, { direction: 'top', offset: [0, -6], className: 'mapa-rotulo' });
    m.on('click', () => this._clicarCidade(loc));
    this._marcadores.set(loc.id, m);
    return m;
  },

  /* ------------------------------------------------------- filtragem + render */
  _cidadesFiltradas() {
    let out = this._locais;
    if (this._livro) out = out.filter(l => l._livros.has(this._livro));
    if (this._versFiltro) {
      const f = this._versFiltro;
      out = out.filter(l => l._refs.some(r => r.code === f.code && r.cap === f.cap && r.vers === f.vers));
    }
    const termo = this._norm(this._termo);
    if (termo) {
      if (this._modo === 'vers') out = out.filter(l => l._refs.some(r => r._t.includes(termo)));
      else out = out.filter(l => l._busca.includes(termo));
    }
    // ordem alfabética estável pelo nome de exibição
    return out.slice().sort((a, b) => a.n.localeCompare(b.n, 'pt'));
  },

  _render() {
    const lista = this._cidadesFiltradas();
    this._desenharMarcadores(lista);
    this._desenharLista(lista);
    this._ajustarVista(lista);
    this._renderVersiculos();
    // conta no cabeçalho
    const conta = document.getElementById('mapa-conta-cidades');
    if (conta) { conta.textContent = lista.length; conta.hidden = false; }
    this._desenharCapsulas();
  },

  _desenharMarcadores(lista) {
    if (!this._grupo) return;
    this._grupo.clearLayers();
    for (const loc of lista) {
      const m = this._marcadorDe(loc);
      const sel = this._selecao.includes(loc.id);
      const foco = this._cidadeAtual && this._cidadeAtual.id === loc.id;
      m.setStyle({
        radius: foco ? 9 : (sel ? 8 : 5),
        fillColor: sel ? '#c2621a' : '#8c2f39',
        fillOpacity: sel ? 1 : .85,
        weight: sel ? 2 : 1.4,
      });
      this._grupo.addLayer(m);
      if (sel) m.bringToFront();
    }
  },

  _desenharLista(lista) {
    const ul = document.getElementById('mapa-lista-cidades');
    if (!ul) return;
    if (!lista.length) {
      ul.innerHTML = '<div class="mapa-vazio">Nenhuma localidade encontrada.</div>';
      return;
    }
    const partes = new Array(lista.length);
    for (let i = 0; i < lista.length; i++) {
      const l = lista[i];
      const outros = (l.v || []).filter(n => n !== l.n).slice(0, 4).join(' · ');
      const ativo = this._selecao.includes(l.id) ? ' ativo' : '';
      const conta = (l.r && l.r.length) ? `<span class="mapa-item-conta">${l.r.length}</span>` : '';
      partes[i] = `<li><button type="button" class="mapa-item${ativo}" data-id="${l.id}">
        <span class="mapa-item-nome">${this._esc(l.n)}${outros ? `<span class="mapa-item-sub">${this._esc(outros)}</span>` : ''}</span>
        ${conta}
      </button></li>`;
    }
    ul.innerHTML = partes.join('');
    if (!ul._ligado) {
      ul._ligado = true;
      ul.addEventListener('click', (e) => {
        const btn = e.target.closest('.mapa-item');
        if (!btn) return;
        const loc = this._locais.find(x => String(x.id) === btn.dataset.id);
        if (loc) this._clicarCidade(loc);
      });
    }
  },

  _esc(t) {
    return (t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },

  /* Enquadra a vista: uma cidade única usa o raio; várias usam fitBounds. */
  /* Vista natural do conjunto filtrado (sem seleção): enquadra todas as cidades. */
  _ajustarVista(lista) {
    if (!this._map || !lista.length) return;
    if (this._selecao.length) return;   // com seleção, a vista segue o foco
    if (lista.length === 1) { this._map.setView([Number(lista[0].lat), Number(lista[0].lon)], 9); return; }
    const pts = lista.map(l => [Number(l.lat), Number(l.lon)]).filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (pts.length) this._map.fitBounds(L.latLngBounds(pts).pad(0.15));
  },

  /* Vista conforme a seleção: 1 cidade -> raio escolhido; várias -> enquadra as
   * selecionadas; nenhuma -> volta ao natural do filtro externo (nunca congela). */
  _ajustarVistaSelecao() {
    if (!this._map) return;
    if (this._selecao.length === 0) { this._ajustarVista(this._cidadesFiltradas()); return; }
    if (this._selecao.length === 1) {
      const c = this._locais.find(x => x.id === this._selecao[0]);
      if (c) this._centralizar(c);
      return;
    }
    const pts = this._selecao.map(id => this._locais.find(x => x.id === id)).filter(Boolean)
      .map(l => [Number(l.lat), Number(l.lon)]).filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (pts.length) this._map.fitBounds(L.latLngBounds(pts).pad(0.2));
  },

  /* ------------------------------------------------ seleção (toggle) de cidade */
  /* Clicar seleciona e centraliza; clicar de novo na mesma desmarca. Em modo
   * único, a nova escolha substitui a anterior; em múltiplo, acumula. */
  _clicarCidade(loc) {
    const i = this._selecao.indexOf(loc.id);
    if (i >= 0) {
      // desmarcar
      this._selecao.splice(i, 1);
      if (this._cidadeAtual && this._cidadeAtual.id === loc.id) {
        const ult = this._selecao[this._selecao.length - 1];
        this._cidadeAtual = (ult != null) ? this._locais.find(x => x.id === ult) : null;
      }
    } else {
      if (!this._multi) this._selecao = [];   // seleção única substitui
      this._selecao.push(loc.id);
      this._cidadeAtual = loc;
    }
    this._ajustarVistaSelecao();
    this._desenharMarcadores(this._cidadesFiltradas());
    this._renderVersiculos();
    this._marcarListaAtiva();
    this._desenharCapsulas();
  },

  /* Enquadra a vista numa cidade pelo raio escolhido (Number — lição parseFloat). */
  _centralizar(loc) {
    if (!this._map) return;
    const raio = parseInt((document.getElementById('mapa-raio') || {}).value, 10) || 200;
    const lat = Number(loc.lat), lon = Number(loc.lon);
    if (!isFinite(lat) || !isFinite(lon)) return;
    const R = 6371;
    const dLat = (raio / R) * (180 / Math.PI);
    const dLon = (raio / (R * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI);
    this._map.fitBounds([[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]]);
    const m = this._marcadores.get(loc.id);
    if (m && m.openTooltip) m.openTooltip();
  },

  _marcarListaAtiva() {
    const ul = document.getElementById('mapa-lista-cidades');
    if (!ul) return;
    ul.querySelectorAll('.mapa-item').forEach(btn => {
      btn.classList.toggle('ativo', this._selecao.includes(parseInt(btn.dataset.id, 10)));
    });
    if (this._cidadeAtual) {
      const b = ul.querySelector(`.mapa-item[data-id="${this._cidadeAtual.id}"]`);
      if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    }
  },

  /* Cápsulas das cidades selecionadas: centralizadas no rodapé do mapa; ao
   * encher a largura, quebram para cima (o rodapé fica ancorado). Clicar numa
   * cápsula desmarca aquela cidade. */
  _desenharCapsulas() {
    const box = document.getElementById('mapa-capsulas');
    if (!box) return;
    if (!this._selecao.length) { box.innerHTML = ''; return; }
    box.innerHTML = this._selecao.map(id => {
      const l = this._locais.find(x => x.id === id);
      if (!l) return '';
      return `<button type="button" class="mapa-capsula" data-id="${id}">
        <span>${this._esc(l.n)}</span>
        <svg class="mapa-capsula-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
      </button>`;
    }).join('');
    if (!box._ligado) {
      box._ligado = true;
      box.addEventListener('click', (e) => {
        const b = e.target.closest('.mapa-capsula');
        if (!b) return;
        const loc = this._locais.find(x => String(x.id) === b.dataset.id);
        if (loc) this._clicarCidade(loc);   // toggle -> desmarca
      });
    }
  },

  /* ------------------------------------------------------ versículos (painel) */
  /* Sempre visível — os versículos também são filtro. Cidade em foco -> os dela
   * (e clicar abre a leitura); sem cidade -> índice (livro, busca ou TODOS) e
   * clicar num versículo filtra as cidades acima. Cacheia a chave do índice
   * porque redesenhar milhares de chips a cada tecla travaria. */
  _renderVersiculos() {
    let key, montar;
    if (this._cidadeAtual) {
      const c = this._cidadeAtual;
      key = 'c:' + c.id;
      montar = () => this._pintarVersiculos(c.n, (c.v || []).filter(n => n !== c.n).join('; '), c._refs);
    } else {
      const termo = this._norm(this._termo);
      if (this._modo === 'vers' && termo) {
        key = 's:' + termo;
        montar = () => this._pintarVersiculos('Resultados', 'toque num versículo para filtrar as cidades',
          this._reunirRefs(l => l._refs.filter(r => r._t.includes(termo))));
      } else if (this._livro) {
        key = 'b:' + this._livro;
        montar = () => this._pintarVersiculos(this._nomeLivro(this._livro), 'toque num versículo para filtrar as cidades',
          this._reunirRefs(l => (l._livros.has(this._livro) ? l._refs.filter(r => r.code === this._livro) : [])));
      } else {
        key = 'all';
        montar = () => this._pintarVersiculos('Todos os versículos', 'toque num versículo para filtrar as cidades',
          this._reunirRefs(l => l._refs));
      }
    }
    if (key !== this._versKey) { this._versKey = key; montar(); }
    this._marcarVersAtivo();
  },

  /* Reúne referências (sem repetição) de todas as localidades por um seletor. */
  _reunirRefs(sel) {
    const vistos = new Set();
    const out = [];
    for (const l of this._locais) {
      for (const r of sel(l)) {
        const k = r.code + ' ' + r.cap + ':' + r.vers;
        if (vistos.has(k)) continue;
        vistos.add(k); out.push(r);
      }
    }
    return out;
  },

  /* Marca o versículo que está filtrando as cidades (sem redesenhar o índice). */
  _marcarVersAtivo() {
    const box = document.getElementById('mapa-vers-corpo');
    if (!box) return;
    const f = this._versFiltro;
    box.querySelectorAll('.mapa-vers-chip').forEach(ch => {
      const on = f && ch.dataset.code === f.code && +ch.dataset.cap === f.cap && +ch.dataset.vers === f.vers;
      ch.classList.toggle('ativo', !!on);
    });
  },

  /* Liga/desliga o filtro por um versículo (mostra as cidades daquela passagem). */
  _togglarFiltroVersiculo(code, cap, vers) {
    const f = this._versFiltro;
    if (f && f.code === code && f.cap === cap && f.vers === vers) this._versFiltro = null;
    else this._versFiltro = { code, cap, vers };
    this._selecao = [];        // o filtro por versículo age no estado sem cidade
    this._cidadeAtual = null;
    this._render();
  },

  /* Desenha um título + os versículos agrupados por livro (ordem canônica). */
  _pintarVersiculos(titulo, sub, refs) {
    const box = document.getElementById('mapa-vers-corpo');
    if (!box) return;
    let html = `<div class="mapa-vers-cidade">${this._esc(titulo)}` +
      (sub ? `<small>${this._esc(sub)}</small>` : '') + `</div>`;
    if (!refs || !refs.length) {
      html += '<div class="mapa-vazio">Nenhuma passagem para mostrar.</div>';
      box.innerHTML = html;
      return;
    }
    const LIMITE = 8000;
    const usar = refs.length > LIMITE ? refs.slice(0, LIMITE) : refs;
    const porLivro = new Map();
    for (const r of usar) {
      if (!porLivro.has(r.code)) porLivro.set(r.code, []);
      porLivro.get(r.code).push(r);
    }
    const codes = [...porLivro.keys()].sort((a, b) => this._ordemLivro(a) - this._ordemLivro(b));
    for (const code of codes) {
      const lst = porLivro.get(code).sort((a, b) => a.cap - b.cap || a.vers - b.vers);
      const chips = lst.map(r =>
        `<button type="button" class="mapa-vers-chip" data-code="${code}" data-cap="${r.cap}" data-vers="${r.vers}">${r.cap}:${r.vers}</button>`
      ).join('');
      html += `<div class="mapa-vers-grupo">
        <h4 class="mapa-vers-livro">${this._esc(this._nomeLivro(code))}</h4>
        <div class="mapa-vers-chips">${chips}</div>
      </div>`;
    }
    box.innerHTML = html;

    if (!box._ligado) {
      box._ligado = true;
      box.addEventListener('click', (e) => {
        const chip = e.target.closest('.mapa-vers-chip');
        if (!chip) return;
        const code = chip.dataset.code, cap = parseInt(chip.dataset.cap, 10), vers = parseInt(chip.dataset.vers, 10);
        if (this._cidadeAtual) this._irParaVersiculo(code, cap, vers);   // lendo cidade -> abre a leitura
        else this._togglarFiltroVersiculo(code, cap, vers);             // índice -> filtra as cidades
      });
    }
  },

  /* Abre o capítulo e destaca o versículo — reaproveita a navegação do app. */
  _irParaVersiculo(code, cap, vers) {
    if (!code || !cap) return;
    App.fecharPaineis();
    App.pularParaReferencia(code, cap, vers);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Mapa };
