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
    mostrarNotas: true,        // sinalzinho no versículo quando há anotação no caderno
    vozURI: null,              // voz escolhida para a leitura em voz alta (null = automática)
    vozVel: 1,                 // velocidade da leitura em voz (1 = normal)
    flutuanteAltura: 70,       // % da altura da tela ocupada pela janela flutuante (40–90)
    flutuanteX: null,          // posição do botão-esfera (px); null = canto padrão
    flutuanteY: null,
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

  /** Registra uma visita. `vers` vem da selecao ou da passagem aberta.
   *
   * Uma entrada por CAPITULO, nao por versiculo: ler o mesmo capitulo e ir
   * avancando nao enche o historico de linhas repetidas — a mesma entrada sobe
   * para o topo e passa a mostrar o ultimo versiculo lido ("onde parei").
   *
   * Quando a visita vem sem versiculo (so reabriu o capitulo, virou a pagina),
   * a posicao ja registrada e preservada — nao se perde onde a pessoa parou. */
  registrar({ versao, code, cap, vers, trecho }) {
    let lista = this.lista();
    const antiga = lista.find(it => it.code === code && it.cap === cap);
    const versFinal   = vers || (antiga ? antiga.vers : null);
    const trechoFinal = (vers || !antiga) ? (trecho || '').slice(0, 90) : antiga.trecho;

    lista = lista.filter(it => !(it.code === code && it.cap === cap));
    lista.unshift({ versao, code, cap, vers: versFinal || null,
      trecho: trechoFinal || '', hora: new Date().toISOString() });
    if (lista.length > this.LIMITE) lista = lista.slice(0, this.LIMITE);
    Guarda.gravar('historico', lista);
    this.acompanharFixado({ code, cap, vers });
  },

  remover(indice) {
    const lista = this.lista();
    lista.splice(indice, 1);
    Guarda.gravar('historico', lista);
  },

  limpar() {
    Guarda.gravar('historico', []);
  },

  /* ------------------------------------------------------ livros fixados
   *
   * Alfinetes nos livros que a pessoa esta pregando ou estudando a fundo. Ao
   * contrario do historico (que envelhece com os 120), eles ficam ate a pessoa
   * tira-los. Pode haver varios — o estudo costuma cruzar livros — e a ordem e
   * livre: o novo entra no fim, e a pessoa reordena como quiser.
   *
   * Cada fixado ACOMPANHA a ultima posicao lida naquele livro. Se voce fixou
   * Genesis 5, leu ate Genesis 29 e saiu, ao voltar pelo atalho cai em Genesis
   * 29 — de onde parou, nao de onde fixou. Vale para qualquer forma de navegar:
   * tocar num versiculo, arrastar, "proxima pagina".
   */
  fixados() {
    const bruto = Guarda.ler('fixados', null);
    if (bruto) return bruto;
    // migra do formato antigo (um so fixado) se existir
    const velho = Guarda.ler('fixado', null);
    if (velho) {
      const lista = [{ ...velho, id: 'f' + Date.now() }];
      Guarda.gravar('fixados', lista);
      return lista;
    }
    return [];
  },

  ehFixado(code) {
    return this.fixados().some(f => f.code === code);
  },

  fixar(versao, code, cap, vers) {
    const lista = this.fixados();
    if (lista.some(f => f.code === code)) return;   // um por livro
    lista.push({ id: 'f' + Date.now(), versao, code, cap: cap || 1, vers: vers || null });
    Guarda.gravar('fixados', lista);
  },

  desfixar(code) {
    Guarda.gravar('fixados', this.fixados().filter(f => f.code !== code));
  },

  /** Move um fixado para outra posicao (reordenar). */
  moverFixado(code, direcao) {
    const lista = this.fixados();
    const i = lista.findIndex(f => f.code === code);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    Guarda.gravar('fixados', lista);
  },

  /** O primeiro fixado — alvo do atalho no topo. */
  primeiroFixado() {
    return this.fixados()[0] || null;
  },

  /* Acompanha a posicao dentro de cada livro fixado. Diferente do antigo, este
     SEGUE onde a pessoa esta — inclusive recuando, se ela voltou para reler.
     A ideia e "onde parei neste livro", para retomar de la. */
  acompanharFixado({ code, cap, vers }) {
    const lista = this.fixados();
    const f = lista.find(x => x.code === code);
    if (!f) return;
    // Mudou de capitulo: a posicao passa a ser o novo capitulo, do inicio,
    // ate a pessoa tocar num versiculo. Mesmo capitulo com versiculo: segue o
    // toque. Mesmo capitulo sem versiculo (so reabriu): preserva onde parou.
    if (f.cap !== cap) {
      f.cap = cap;
      f.vers = vers || null;
    } else if (vers) {
      f.vers = vers;
    }
    Guarda.gravar('fixados', lista);
  },
};

/* ================================================================= estudos
 *
 * O estudo e deliberado, ao contrario do historico. A pessoa segura um
 * versiculo, escolhe "Salvar estudo", da um nome e diz ate onde vai o trecho —
 * inclusive avancando para o proximo capitulo, desde que no mesmo livro. Dai em
 * diante o estudo pode ser renomeado, copiado e compartilhado.
 */

/* Lista de numeros de versiculo -> faixas compactas.
 * [1,2,3,5,6,7] vira "1-3,5-7". Numeros repetidos e fora de ordem sao
 * normalizados. Usado nas referencias de Estudos e Anotacoes. */
const compactarVersiculos = (nums) => {
  const vs = [...new Set(nums)].filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!vs.length) return '';
  const faixas = [];
  let ini = vs[0], ant = vs[0];
  for (let k = 1; k < vs.length; k++) {
    if (vs[k] === ant + 1) { ant = vs[k]; continue; }
    faixas.push([ini, ant]); ini = ant = vs[k];
  }
  faixas.push([ini, ant]);
  return faixas.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
};

const Estudos = {
  todos() {
    return Guarda.ler('estudos', []);
  },

  /* Um estudo reune um ou mais trechos. Cada trecho e um recorte de um capitulo:
   * {code, versao, cap, versiculos:[...]} — a lista de versiculos pode pular
   * numeros (ex.: [1,2,3,5,6,7]). Guardar uma lista de trechos permite juntar
   * passagens de lugares diferentes sob o mesmo estudo.
   *
   * Formatos antigos ainda sao lidos: o intervalo continuo
   * {capInicio,versInicio,capFim,versFim} e o estudo de trecho unico com esses
   * campos soltos. `trechosDe` normaliza tudo; ninguem perde o que ja tinha. */
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
    // formato novo: capitulo + lista de versiculos (pode pular numeros)
    if (Array.isArray(t.versiculos)) {
      return `${nome} ${t.cap}:${compactarVersiculos(t.versiculos)}`;
    }
    // formato antigo: intervalo continuo, as vezes cruzando capitulos
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
        if (Array.isArray(t.versiculos)) {
          // formato novo: um capítulo, só os versículos escolhidos (pode pular)
          const alvo = new Set(t.versiculos);
          const r = await Dados.capitulo(t.versao, t.code, t.cap);
          if (r) {
            for (const v of r.capitulo.verses) {
              if (alvo.has(v.number) && v.text) linhas.push(`${v.number}  ${v.text}`);
            }
          }
        } else {
          // formato antigo: intervalo contínuo. Quando cruza capítulos, um marco
          // "Capítulo N" separa a virada, para não haver dois versículos com o
          // mesmo número seguidos sem contexto.
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

/* Comeca enxuto: tres marcadores. Quem usa mais adiciona os que quiser pelo
 * botao "Novo marcador" nos Ajustes; quem usa menos deixa como esta. */
const MARCADORES_PADRAO = [
  { id: 1, nome: 'Marcador 1', cor: '#F2C94C' },
  { id: 2, nome: 'Marcador 2', cor: '#F2994A' },
  { id: 3, nome: 'Marcador 3', cor: '#EB5757' },
];

/* Cores sugeridas para marcadores novos. Cada novo nasce com uma cor ainda
 * nao usada na lista; a pessoa troca depois se quiser. */
const PALETA_MARCADORES = [
  '#F2C94C', '#F2994A', '#EB5757', '#E58FB0', '#BB6BD9', '#7B61FF',
  '#2D9CDB', '#56CCF2', '#27AE60', '#6FCF97', '#A68B5B', '#828282',
];

/* Teto de marcadores: 66, um para cada livro da Biblia, se a pessoa quiser. */
const MAX_MARCADORES = 66;

const Marcadores = {
  lista() {
    const salvos = Guarda.ler('marcadores', null);
    if (!salvos || !salvos.length) return MARCADORES_PADRAO.map(m => ({ ...m }));
    // a lista salva e a verdadeira: inclui os marcadores adicionados depois
    return salvos.map(m => ({ ...m }));
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

  /** Cria um marcador novo no fim da lista, ja com uma cor distinta das em uso.
   * A pessoa pode trocar a cor e o nome logo em seguida. */
  limite() { return MAX_MARCADORES; },
  podeAdicionar() { return this.lista().length < MAX_MARCADORES; },

  adicionar() {
    const lista = this.lista();
    if (lista.length >= MAX_MARCADORES) return null;   // teto de 66
    const usadas = new Set(lista.map(m => (m.cor || '').toUpperCase()));
    const cor = PALETA_MARCADORES.find(c => !usadas.has(c.toUpperCase()))
      || PALETA_MARCADORES[lista.length % PALETA_MARCADORES.length];
    const id = lista.reduce((mx, m) => Math.max(mx, m.id), 0) + 1;
    const novo = { id, nome: `Marcador ${id}`, cor };
    lista.push(novo);
    Guarda.gravar('marcadores', lista);
    return novo;
  },

  /** Exclui um marcador e apaga as marcas que o usavam. Mantem ao menos um,
   * para o sistema de marcacao nunca ficar sem opcao. */
  remover(id) {
    const lista = this.lista();
    if (lista.length <= 1) return false;              // nao deixa ficar sem nenhum
    const nova = lista.filter(m => m.id !== id);
    if (nova.length === lista.length) return false;   // id inexistente
    Guarda.gravar('marcadores', nova);

    // tira as faixas que apontavam para este marcador
    const todos = this.marcados();
    let mudou = false;
    for (const k of Object.keys(todos)) {
      const antes = this.normalizar(todos[k]);
      const depois = antes.filter(fx => fx.m !== id);
      if (depois.length === antes.length) continue;
      mudou = true;
      if (depois.length) todos[k] = depois; else delete todos[k];
    }
    if (mudou) Guarda.gravar('marcados', todos);
    return true;
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

/* ------------------------------------------------------- caderno de anotações
 *
 * Uma anotacao e um texto livre preso a uma passagem — livro, capitulo e
 * versiculo. Varias podem se acumular no mesmo versiculo. O corpo e HTML rico
 * (negrito, cor, fundo...), sempre passado pela peneira `limpar` antes de
 * gravar ou de exibir, para nunca guardar nada perigoso — o que importa quando,
 * mais adiante, a pessoa importar anotacoes de outra.
 *
 * A chave usa a versificacao (como os marcadores), e nao a sigla da versao: uma
 * nota feita lendo ACF acompanha as demais versoes da mesma familia.
 */

const Anotacoes = {
  todas() {
    return Guarda.ler('anotacoes', []);
  },

  /* Numeros dos versiculos que tem nota num capitulo — para o sinal na tela.
   * Uma nota pode cobrir varios versiculos (formato novo `versiculos`); o sinal
   * aparece em cada um deles. Notas antigas tem so `vers`. */
  noCapitulo(versificacao, code, cap) {
    const s = new Set();
    for (const a of this.todas()) {
      if (a.versificacao === versificacao && a.code === code && a.cap === cap) {
        const vs = Array.isArray(a.versiculos) ? a.versiculos : [a.vers];
        vs.forEach(v => s.add(v));
      }
    }
    return s;
  },

  /* Notas que cobrem um versiculo — tocar em qualquer versiculo do conjunto
   * abre a mesma nota. */
  daPassagem(versificacao, code, cap, vers) {
    return this.todas().filter(a => {
      if (!(a.versificacao === versificacao && a.code === code && a.cap === cap)) return false;
      const vs = Array.isArray(a.versiculos) ? a.versiculos : [a.vers];
      return vs.includes(vers);
    });
  },

  criar({ versificacao, code, cap, vers, versiculos, versao, corpo }) {
    const lista = this.todas();
    const agora = new Date().toISOString();
    const vs = (Array.isArray(versiculos) && versiculos.length)
      ? [...new Set(versiculos)].filter(n => Number.isFinite(n)).sort((a, b) => a - b)
      : [vers];
    const a = {
      id: 'a' + Date.now(),
      versificacao, code, cap,
      vers: vs[0],          // versiculo-ancora: mantem compatibilidade
      versiculos: vs,       // conjunto completo (pode pular numeros)
      versao: versao || '',
      corpo: this.limpar(corpo),
      criado: agora,
      modificado: agora,
    };
    lista.unshift(a);
    Guarda.gravar('anotacoes', lista);
    return a;
  },

  atualizar(id, corpo) {
    const lista = this.todas();
    const a = lista.find(x => x.id === id);
    if (!a) return;
    a.corpo = this.limpar(corpo);
    a.modificado = new Date().toISOString();
    Guarda.gravar('anotacoes', lista);
  },

  remover(id) {
    Guarda.gravar('anotacoes', this.todas().filter(a => a.id !== id));
  },

  achar(id) {
    return this.todas().find(a => a.id === id) || null;
  },

  refDe(a) {
    const nome = Dados.nomeCurto(a.versao || Prefs.get('versao'), a.code);
    const vs = Array.isArray(a.versiculos) ? a.versiculos : [a.vers];
    return `${nome} ${a.cap}:${compactarVersiculos(vs)}`;
  },

  quandoDe(a) {
    const d = new Date(a.modificado || a.criado);
    return d.toLocaleDateString('pt-BR') + ' às '
      + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  /** Texto puro para a prévia na lista (sem nenhuma marcação). */
  resumo(a, limite = 120) {
    const cx = document.createElement('div');
    cx.innerHTML = this.limpar(a.corpo);
    const txt = (cx.textContent || '').replace(/\s+/g, ' ').trim();
    return txt.length > limite ? txt.slice(0, limite) + '…' : txt;
  },

  vazia(a) {
    return this.resumo(a, 5).length === 0;
  },

  /* A peneira: deixa passar só um punhado de tags e um punhado de propriedades
   * de estilo. Qualquer tag estranha e desembrulhada (o texto fica, a tag some);
   * qualquer atributo que não seja um estilo seguro é descartado. É o que nos
   * protege de guardar <script>, onclick, javascript: e afins — inclusive em
   * conteúdo que venha a ser importado de outra pessoa. */
  limpar(html) {
    const permitidas = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
      'SPAN', 'FONT', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI']);
    const props = ['color', 'background-color', 'background', 'font-weight',
      'font-style', 'text-decoration', 'text-decoration-line', 'font-family'];

    const raiz = document.createElement('div');
    raiz.innerHTML = html || '';

    const estiloSeguro = el => {
      const saida = [];
      for (const p of props) {
        const v = el.style.getPropertyValue(p);
        if (v && !/url\(|expression|javascript:/i.test(v)) saida.push(`${p}: ${v}`);
      }
      return saida.join('; ');
    };

    const passar = no => {
      [...no.childNodes].forEach(f => {
        if (f.nodeType === 3) return;                 // texto: fica
        if (f.nodeType !== 1) { f.remove(); return; } // comentário etc: sai

        if (!permitidas.has(f.tagName)) {             // tag estranha: desembrulha
          passar(f);
          while (f.firstChild) no.insertBefore(f.firstChild, f);
          f.remove();
          return;
        }

        if (f.tagName === 'FONT') {                   // <font color/face> vira estilo
          if (f.getAttribute('color')) f.style.color = f.getAttribute('color');
          if (f.getAttribute('face')) f.style.fontFamily = f.getAttribute('face');
        }

        const est = estiloSeguro(f);
        [...f.attributes].forEach(a => f.removeAttribute(a.name));
        if (est) f.setAttribute('style', est);
        passar(f);
      });
    };

    passar(raiz);
    return raiz.innerHTML;
  },
};
