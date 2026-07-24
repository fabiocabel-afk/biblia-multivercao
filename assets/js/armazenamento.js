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
    temperatura: 18,      // 0 = papel branco, 100 = sepia carregado
    fonte: 20,            // px do corpo do texto
    escuro: false,
    versoesTirinha: ['ACF', 'NVI', 'NTLH'],
    versaoComparar: 'NVI',
    mostrarCategorias: true,   // painel de livros: com ou sem a camada do meio
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

const Sessoes = {
  todas() {
    return Guarda.ler('sessoes', []);
  },

  atual() {
    const lista = this.todas();
    let s = lista.find(x => x.aberta);
    if (!s) {
      s = this._nova();
      lista.push(s);
      Guarda.gravar('sessoes', lista);
    }
    return s;
  },

  _nova() {
    const agora = new Date();
    return {
      id: 's' + agora.getTime(),
      nome: '',
      inicio: agora.toISOString(),
      fim: null,
      aberta: true,
      itens: [],
    };
  },

  /** Nome automatico quando o usuario nao deu um: "Terça-feira — 23/07/2026" */
  nomeDe(sessao) {
    if (sessao.nome) return sessao.nome;
    const d = new Date(sessao.inicio);
    const dia = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    return dia.charAt(0).toUpperCase() + dia.slice(1) + ' — ' + d.toLocaleDateString('pt-BR');
  },

  /** Rascunho automatico: chamado a cada passagem aberta. Nunca apaga. */
  registrar(item) {
    const lista = this.todas();
    let s = lista.find(x => x.aberta);
    if (!s) {
      s = this._nova();
      lista.push(s);
    }
    const ultimo = s.itens[s.itens.length - 1];
    if (ultimo && ultimo.versao === item.versao && ultimo.code === item.code
        && ultimo.cap === item.cap && ultimo.vers === item.vers) {
      return; // mesma passagem seguida, nao duplica
    }
    s.itens.push({ ...item, hora: new Date().toISOString() });
    Guarda.gravar('sessoes', lista);
  },

  /** Salvar = fechar a pregacao e abrir folha limpa. Nada e descartado. */
  salvar(nome) {
    const lista = this.todas();
    const s = lista.find(x => x.aberta);
    if (s) {
      if (nome) s.nome = nome;
      s.fim = new Date().toISOString();
      s.aberta = false;
    }
    lista.push(this._nova());
    Guarda.gravar('sessoes', lista);
  },

  renomear(id, nome) {
    const lista = this.todas();
    const s = lista.find(x => x.id === id);
    if (s) { s.nome = nome; Guarda.gravar('sessoes', lista); }
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
