/* armazenamento.js — tudo que precisa sobreviver a fechar o app.
 *
 * O historico e o coracao do app: ele nunca apaga nada. Grava sozinho a cada
 * passagem aberta (rascunho), e o botao Salvar serve so para ORGANIZAR — para
 * declarar que uma pregacao terminou e comecar folha limpa.
 */

const Guarda = (() => {
  const PREFIXO = 'biblia:';
  let memoria = {};
  let temLocalStorage = true;

  try {
    localStorage.setItem(PREFIXO + 'teste', '1');
    localStorage.removeItem(PREFIXO + 'teste');
  } catch {
    temLocalStorage = false;
  }

  function ler(chave, padrao) {
    try {
      const bruto = temLocalStorage
        ? localStorage.getItem(PREFIXO + chave)
        : memoria[chave];
      return bruto ? JSON.parse(bruto) : padrao;
    } catch {
      return padrao;
    }
  }

  function gravar(chave, valor) {
    const bruto = JSON.stringify(valor);
    try {
      if (temLocalStorage) localStorage.setItem(PREFIXO + chave, bruto);
      else memoria[chave] = bruto;
    } catch {
      memoria[chave] = bruto;
    }
  }

  return { ler, gravar, persistente: () => temLocalStorage };
})();

/* ------------------------------------------------------------ preferencias */

const Prefs = {
  padrao: {
    versao: 'ACF',
    temperatura: 50,      // 0 = papel branco, 100 = sepia carregado; começa no meio
    fonte: 20,            // px do corpo do texto
    escuro: false,
    versoesTirinha: ['ACF', 'NVI', 'NTLH'],
    versaoComparar: 'NVI',
    mostrarCategorias: true,   // painel de livros: com ou sem a camada do meio
    versiculoPorLinha: false,  // false = texto corrido; true = um versiculo por linha
    refsFixas: false,          // painel de referências dividindo a tela; desligado por padrão
  },

  todas() {
    return { ...this.padrao, ...Guarda.ler('prefs', {}) };
  },

  get(chave) {
    return this.todas()[chave];
  },

  set(chave, valor) {
    const p = this.todas();
    p[chave] = valor;
    Guarda.gravar('prefs', p);
  },
};

/* ---------------------------------------------------------------- sessoes */

/* ================================================================ histórico
 *
 * O historico e so uma trilha de migalhas: os ultimos lugares onde a pessoa
 * esteve, para voltar num toque. Guarda no maximo os 120 mais recentes; abrir
 * um lugar que ja esta na lista apenas o traz para o topo, sem duplicar.
 *
 * Separado disto ha o livro fixado: um alfinete no livro que a pessoa esta
 * pregando ou estudando a fundo. Ele nao envelhece com os 120 — fica ali,
 * mostrando sempre o ponto mais avancado alcancado naquele livro, ate a pessoa
 * mover o alfinete ou tira-lo.
 */

const Historico = {
  LIMITE: 120,

  lista() {
    return Guarda.ler('historico', []);
  },

  /** Registra uma visita. `vers` vem da selecao ou da passagem aberta. */
  registrar({ versao, code, cap, vers, trecho }) {
    let lista = this.lista();
    // tira qualquer visita anterior ao mesmo versiculo/capitulo, para reinserir no topo
    lista = lista.filter(it => !(it.code === code && it.cap === cap && it.vers === vers));
    lista.unshift({ versao, code, cap, vers: vers || null,
      trecho: (trecho || '').slice(0, 90), hora: new Date().toISOString() });
    if (lista.length > this.LIMITE) lista = lista.slice(0, this.LIMITE);
    Guarda.gravar('historico', lista);
    this.avancarFixado({ code, cap, vers });
  },

  remover(indice) {
    const lista = this.lista();
    lista.splice(indice, 1);
    Guarda.gravar('historico', lista);
  },

  limpar() {
    Guarda.gravar('historico', []);
  },

  /* ------------------------------------------------------ livro fixado */

  fixado() {
    return Guarda.ler('fixado', null);
  },

  fixar(versao, code, cap, vers) {
    Guarda.gravar('fixado', { versao, code, cap: cap || 1, vers: vers || null });
  },

  desfixar() {
    Guarda.gravar('fixado', null);
  },

  /* O alfinete acompanha o avanco no livro: ao progredir, guarda o ponto mais
     adiantado ja alcancado. Nunca recua sozinho — se a pessoa volta atras para
     reler, o alfinete continua marcando onde ela tinha chegado. O avanco se
     baseia no versiculo selecionado, nao apenas no capitulo aberto. */
  avancarFixado({ code, cap, vers }) {
    const f = this.fixado();
    if (!f || f.code !== code) return;
    const capAtual = f.cap || 0;
    const versAtual = f.vers || 0;
    if (cap > capAtual || (cap === capAtual && (vers || 0) > versAtual)) {
      f.cap = cap;
      f.vers = vers || f.vers;
      Guarda.gravar('fixado', f);
    }
  },
};

/* ================================================================= estudos
 *
 * O estudo e deliberado, ao contrario do historico. A pessoa segura um
 * versiculo, escolhe "Salvar estudo", da um nome e diz ate onde vai o trecho —
 * inclusive avancando para o proximo capitulo, desde que no mesmo livro. Dai em
 * diante o estudo pode ser renomeado, copiado e compartilhado.
 */

const Estudos = {
  todos() {
    return Guarda.ler('estudos', []);
  },

  /* Um estudo reune um ou mais trechos. Cada trecho e um intervalo de um livro:
   * {code, capInicio, versInicio, capFim, versFim}. Guardar uma lista permite
   * juntar passagens de lugares diferentes sob o mesmo estudo — por exemplo,
   * reunir todos os versiculos sobre um tema.
   *
   * O formato antigo tinha os campos do intervalo direto no estudo. `trechosDe`
   * le os dois: se houver a lista nova, usa; senao, monta uma a partir dos
   * campos soltos. Ninguem perde o que ja tinha. */
  trechosDe(e) {
    if (Array.isArray(e.trechos)) return e.trechos;
    return [{
      code: e.code, versao: e.versao,
      capInicio: e.capInicio, versInicio: e.versInicio,
      capFim: e.capFim, versFim: e.versFim,
    }];
  },

  criar({ nome, trecho }) {
    const lista = this.todos();
    const estudo = {
      id: 'e' + Date.now(),
      nome: nome || '',
      trechos: [trecho],
      criado: new Date().toISOString(),
    };
    lista.unshift(estudo);
    Guarda.gravar('estudos', lista);
    return estudo;
  },

  /** Acrescenta um trecho a um estudo que ja existe. */
  acrescentar(id, trecho) {
    const lista = this.todos();
    const e = lista.find(x => x.id === id);
    if (!e) return;
    const trechos = this.trechosDe(e);
    trechos.push(trecho);
    e.trechos = trechos;
    delete e.code; delete e.versao;       // some com o formato antigo
    delete e.capInicio; delete e.versInicio;
    delete e.capFim; delete e.versFim;
    Guarda.gravar('estudos', lista);
  },

  removerTrecho(id, indice) {
    const lista = this.todos();
    const e = lista.find(x => x.id === id);
    if (!e) return;
    const trechos = this.trechosDe(e);
    trechos.splice(indice, 1);
    if (!trechos.length) {               // estudo vazio se apaga
      this.remover(id);
      return;
    }
    e.trechos = trechos;
    Guarda.gravar('estudos', lista);
  },

  remover(id) {
    Guarda.gravar('estudos', this.todos().filter(e => e.id !== id));
  },

  renomear(id, nome) {
    const lista = this.todos();
    const e = lista.find(x => x.id === id);
    if (e) { e.nome = nome; Guarda.gravar('estudos', lista); }
  },

  /** Referencia de um trecho isolado. */
  refDoTrecho(t) {
    const nome = Dados.nomeCurto(t.versao, t.code);
    const inicio = `${t.capInicio}:${t.versInicio}`;
    if (t.capInicio === t.capFim) {
      return t.versInicio === t.versFim
        ? `${nome} ${inicio}`
        : `${nome} ${inicio}-${t.versFim}`;
    }
    return `${nome} ${inicio} — ${t.capFim}:${t.versFim}`;
  },

  /** Referencia do estudo: o primeiro trecho, com "e mais N" se houver outros. */
  refDe(e) {
    const trechos = this.trechosDe(e);
    const primeiro = this.refDoTrecho(trechos[0]);
    return trechos.length > 1 ? `${primeiro} e mais ${trechos.length - 1}` : primeiro;
  },

  nomeDe(e) {
    return e.nome || this.refDe(e);
  },

  quandoDe(e) {
    const d = new Date(e.criado);
    return d.toLocaleDateString('pt-BR') + ' às '
      + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  /** Junta o texto de todos os trechos do estudo, para copiar/partilhar. */
  async comoTexto(e) {
    const linhas = [this.nomeDe(e), this.quandoDe(e), ''];
    const trechos = this.trechosDe(e);
    try {
      for (const t of trechos) {
        if (trechos.length > 1) linhas.push(`— ${this.refDoTrecho(t)} (${t.versao}) —`);
        else linhas.push(`${this.refDoTrecho(t)} (${t.versao})`, '');

        // o livro e o capítulo já aparecem no cabeçalho do trecho, então cada
        // linha leva só o número do versículo — sem repetir "cap:vers".
        // Quando o trecho cruza capítulos, um marco "Capítulo N" separa a virada,
        // para não haver dois versículos com o mesmo número seguidos sem contexto.
        const varios = t.capInicio !== t.capFim;
        for (let cap = t.capInicio; cap <= t.capFim; cap++) {
          const r = await Dados.capitulo(t.versao, t.code, cap);
          if (!r) continue;
          if (varios) linhas.push(`[Capítulo ${cap}]`);
          for (const v of r.capitulo.verses) {
            if (cap === t.capInicio && v.number < t.versInicio) continue;
            if (cap === t.capFim && v.number > t.versFim) continue;
            if (v.text) linhas.push(`${v.number}  ${v.text}`);
          }
        }
        if (trechos.length > 1) linhas.push('');
      }
    } catch {
      linhas.push('(não foi possível carregar o texto)');
    }
    return linhas.join('\n');
  },
};

/* ------------------------------------------------ ponto de leitura ("parei aqui")
 *
 * Diferente dos marcadores: e um so, nao tem cor propria e nao serve para
 * guardar nada. E o dedo entre as paginas — a gente comeca a ler e esquece
 * onde parou. Toque simples poe; toque simples no mesmo tira.
 */

const Ponto = {
  atual() {
    return Guarda.ler('ponto', null);
  },

  /** Este versiculo e o ponto? Confere tambem pela outra numeracao. */
  eh(versificacao, code, cap, vers) {
    const p = this.atual();
    if (!p || p.code !== code || p.vers !== vers) return false;
    if (p.versificacao === versificacao) return p.cap === cap;
    const conv = Dados.converter(code, p.cap, p.versificacao, versificacao);
    return conv.capitulo === cap;
  },

  /** Poe o ponto aqui. Se ja estava aqui, tira. Devolve true se ficou posto. */
  alternar(versificacao, code, cap, vers) {
    if (this.eh(versificacao, code, cap, vers)) {
      Guarda.gravar('ponto', null);
      return false;
    }
    Guarda.gravar('ponto', {
      versificacao, code, cap, vers,
      hora: new Date().toISOString(),
    });
    return true;
  },
};

/* ------------------------------------------------------------- marcadores */

const MARCADORES_PADRAO = [
  { id: 1,  nome: 'Marcador 1',  cor: '#F2C94C' },
  { id: 2,  nome: 'Marcador 2',  cor: '#F2994A' },
  { id: 3,  nome: 'Marcador 3',  cor: '#EB5757' },
  { id: 4,  nome: 'Marcador 4',  cor: '#E58FB0' },
  { id: 5,  nome: 'Marcador 5',  cor: '#BB6BD9' },
  { id: 6,  nome: 'Marcador 6',  cor: '#7B61FF' },
  { id: 7,  nome: 'Marcador 7',  cor: '#2D9CDB' },
  { id: 8,  nome: 'Marcador 8',  cor: '#56CCF2' },
  { id: 9,  nome: 'Marcador 9',  cor: '#27AE60' },
  { id: 10, nome: 'Marcador 10', cor: '#6FCF97' },
  { id: 11, nome: 'Marcador 11', cor: '#A68B5B' },
  { id: 12, nome: 'Marcador 12', cor: '#828282' },
];

const Marcadores = {
  lista() {
    const salvos = Guarda.ler('marcadores', null);
    if (!salvos) return MARCADORES_PADRAO.map(m => ({ ...m }));
    return MARCADORES_PADRAO.map(p => {
      const s = salvos.find(x => x.id === p.id);
      return s ? { ...p, ...s } : { ...p };
    });
  },

  de(id) {
    return this.lista().find(m => m.id === id) || null;
  },

  /** Trocar a cor aqui recolore de uma vez todos os versiculos vinculados. */
  atualizar(id, campos) {
    const lista = this.lista();
    const m = lista.find(x => x.id === id);
    if (m) Object.assign(m, campos);
    Guarda.gravar('marcadores', lista);
  },

  /* Chave da marcacao: guarda a versificacao de origem, para que a marca
   * apareca certa mesmo abrindo o versiculo em outra versao. */
  chave(versificacao, code, cap, vers) {
    return `${versificacao}|${code}|${cap}|${vers}`;
  },

  marcados() {
    return Guarda.ler('marcados', {});
  },

  /* Marcar deixou de ser "o versiculo inteiro ou nada". A marca cobre
   * exatamente o trecho que foi selecionado, e um mesmo versiculo pode ter
   * pedacos de cores diferentes.
   *
   * O que fica gravado e uma lista de faixas: {m: marcador, i: onde comeca,
   * f: onde termina} contando as letras do versiculo. Um versiculo inteiro e
   * so uma faixa de 0 ate o fim (f nulo).
   *
   * O formato antigo — um numero solto — continua valendo e e lido como uma
   * faixa que cobre tudo. Ninguem perde o que ja tinha marcado. */
  normalizar(valor) {
    if (valor == null) return [];
    if (typeof valor === 'number') return [{ m: valor, i: 0, f: null }];
    return Array.isArray(valor) ? valor : [];
  },

  /** As faixas daquele versiculo, ja considerando a outra numeracao. */
  faixas(versificacao, code, cap, vers) {
    const todos = this.marcados();
    const direto = todos[this.chave(versificacao, code, cap, vers)];
    if (direto != null) return this.normalizar(direto);

    const outra = versificacao === 'vulgata' ? 'hebraica' : 'vulgata';
    const conv = Dados.converter(code, cap, versificacao, outra);
    return this.normalizar(todos[this.chave(outra, code, conv.capitulo, vers)]);
  },

  /** Compatibilidade: o marcador do versiculo, se ele estiver todo de uma cor. */
  do(versificacao, code, cap, vers) {
    const fx = this.faixas(versificacao, code, cap, vers);
    return fx.length ? fx[0].m : null;
  },

  gravarFaixas(versificacao, code, cap, vers, faixas) {
    const todos = this.marcados();
    const k = this.chave(versificacao, code, cap, vers);
    if (!faixas || !faixas.length) delete todos[k];
    else todos[k] = faixas;
    Guarda.gravar('marcados', todos);
  },

  /** Marca de `i` a `f`. O trecho novo manda: apaga a cor antiga onde encostar. */
  marcarTrecho(versificacao, code, cap, vers, i, f, marcadorId) {
    const antigas = this.faixas(versificacao, code, cap, vers);
    const fim = x => (x == null ? Infinity : x);
    const novas = [];

    for (const fx of antigas) {
      const a = fx.i, b = fim(fx.f);
      if (b <= i || a >= fim(f)) { novas.push(fx); continue; } // nao encosta
      if (a < i) novas.push({ m: fx.m, i: a, f: i });          // sobra a esquerda
      if (b > fim(f)) novas.push({ m: fx.m, i: f, f: fx.f });  // sobra a direita
    }

    novas.push({ m: marcadorId, i, f });
    novas.sort((a, b) => a.i - b.i);
    this.gravarFaixas(versificacao, code, cap, vers, novas);
    return novas;
  },

  /** Tira a cor de um trecho. Sem i/f, limpa o versiculo inteiro. */
  limparTrecho(versificacao, code, cap, vers, i = null, f = null) {
    if (i == null) {
      this.gravarFaixas(versificacao, code, cap, vers, []);
      return [];
    }
    const fim = x => (x == null ? Infinity : x);
    const novas = [];
    for (const fx of this.faixas(versificacao, code, cap, vers)) {
      const a = fx.i, b = fim(fx.f);
      if (b <= i || a >= fim(f)) { novas.push(fx); continue; }
      if (a < i) novas.push({ m: fx.m, i: a, f: i });
      if (b > fim(f)) novas.push({ m: fx.m, i: f, f: fx.f });
    }
    this.gravarFaixas(versificacao, code, cap, vers, novas);
    return novas;
  },

  /** Marca o versiculo inteiro; com o mesmo marcador de novo, desmarca. */
  alternar(versificacao, code, cap, vers, marcadorId) {
    const fx = this.faixas(versificacao, code, cap, vers);
    const inteiro = fx.length === 1 && fx[0].i === 0 && fx[0].f == null;
    if (inteiro && fx[0].m === marcadorId) {
      this.gravarFaixas(versificacao, code, cap, vers, []);
      return null;
    }
    this.gravarFaixas(versificacao, code, cap, vers, [{ m: marcadorId, i: 0, f: null }]);
    return marcadorId;
  },

  /** Todos os trechos de um marcador, para a tela de marcadores. */
  porMarcador(marcadorId) {
    const todos = this.marcados();
    const saida = [];
    for (const k of Object.keys(todos)) {
      const [versificacao, code, cap, vers] = k.split('|');
      for (const fx of this.normalizar(todos[k])) {
        if (fx.m !== marcadorId) continue;
        saida.push({ versificacao, code, cap: +cap, vers: +vers, i: fx.i, f: fx.f });
      }
    }
    return saida;
  },
};

/* ------------------------------------------------- referencias pessoais */

const RefsPessoais = {
  todas() {
    return Guarda.ler('refs', {});
  },

  chave(code, cap, vers) {
    return `${code}|${cap}|${vers}`;
  },

  de(code, cap, vers) {
    return this.todas()[this.chave(code, cap, vers)] || [];
  },

  adicionar(code, cap, vers, alvo) {
    const todas = this.todas();
    const k = this.chave(code, cap, vers);
    todas[k] = todas[k] || [];
    todas[k].push(alvo);
    Guarda.gravar('refs', todas);
  },

  remover(code, cap, vers, indice) {
    const todas = this.todas();
    const k = this.chave(code, cap, vers);
    if (todas[k]) {
      todas[k].splice(indice, 1);
      if (!todas[k].length) delete todas[k];
      Guarda.gravar('refs', todas);
    }
  },
};
