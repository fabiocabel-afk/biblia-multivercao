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

  /** Devolve o id do marcador daquele versiculo, ou null. */
  do(versificacao, code, cap, vers) {
    const todos = this.marcados();
    const direto = todos[this.chave(versificacao, code, cap, vers)];
    if (direto) return direto;

    // marcado noutra numeracao? converte o capitulo e tenta de novo
    const outra = versificacao === 'vulgata' ? 'hebraica' : 'vulgata';
    const conv = Dados.converter(code, cap, versificacao, outra);
    return todos[this.chave(outra, code, conv.capitulo, vers)] || null;
  },

  /** Um marcador por versiculo — marcar de novo com o mesmo id desmarca. */
  alternar(versificacao, code, cap, vers, marcadorId) {
    const todos = this.marcados();
    const k = this.chave(versificacao, code, cap, vers);
    if (todos[k] === marcadorId) delete todos[k];
    else todos[k] = marcadorId;
    Guarda.gravar('marcados', todos);
    return todos[k] || null;
  },

  /** Todos os versiculos de um marcador, para a tela de marcadores. */
  porMarcador(marcadorId) {
    const todos = this.marcados();
    return Object.keys(todos)
      .filter(k => todos[k] === marcadorId)
      .map(k => {
        const [versificacao, code, cap, vers] = k.split('|');
        return { versificacao, code, cap: +cap, vers: +vers };
      });
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
