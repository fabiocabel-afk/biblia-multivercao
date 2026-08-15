/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* dados.js — carregador unificado.
 *
 * O resto do app nunca precisa saber qual versao esta aberta, nem que a
 * Ave-Maria usa a numeracao da Vulgata. Tudo passa por aqui.
 */

const Dados = {
  versoes: [],
  estrutura: null,
  numeracao: null,
  _cache: new Map(),
  _carregando: new Map(),

  async iniciar() {
    const [versoes, estrutura, numeracao] = await Promise.all([
      fetch('data/meta/versoes.json').then(r => r.json()),
      fetch('data/meta/estrutura.json').then(r => r.json()),
      fetch('data/meta/numeracao.json').then(r => r.json()),
    ]);
    this.versoes = versoes;
    this.estrutura = estrutura;
    this.numeracao = numeracao;
  },

  /* ---------------------------------------------------------------- versoes */

  versao(code) {
    return this.versoes.find(v => v.code === code) || null;
  },

  /* ---------------------------------------------------- interlinear + léxico
   * Uma versão interlinear traz, em cada versículo, o array `palavras` (original,
   * transliteração, Strong, morfologia). O significado em português vem à parte,
   * do léxico Strong, carregado sob demanda e indexado por número (H430, G2316). */
  lexico: { he: null, gr: null },

  ehInterlinear(versaoCode) {
    return !!(this.versao(versaoCode) && this.versao(versaoCode).interlinear);
  },

  /** Versão em língua original (hebraico/grego): o grupo "original" cobre tanto
   *  o texto puro quanto o interlinear. Usado, p.ex., para desligar o áudio —
   *  a voz do navegador não pronuncia esses alfabetos. */
  ehOriginal(versaoCode) {
    const v = this.versao(versaoCode);
    return !!(v && (v.group === 'original' || v.interlinear));
  },

  async carregarLexico(lang) {
    if (lang !== 'he' && lang !== 'gr') return {};
    if (this.lexico[lang]) return this.lexico[lang];
    try {
      const d = await fetch(`data/lexico/strong-${lang}.json`).then(r => r.ok ? r.json() : {});
      this.lexico[lang] = d;
      return d;
    } catch {
      this.lexico[lang] = {};
      return {};
    }
  },

  /** Significado de um Strong: português do léxico; se faltar, o inglês. */
  significado(lang, strong) {
    const dic = this.lexico[lang];
    if (!dic || !strong) return '';
    const e = dic[strong];
    if (!e) return '';
    return e.pt || e.en || '';
  },

  canoneDe(versaoCode) {
    const v = this.versao(versaoCode);
    return v ? v.canon : 'protestant';
  },

  versificacaoDe(versaoCode) {
    const v = this.versao(versaoCode);
    return v ? v.versification : 'hebraica';
  },

  /** Rotulo curto para listas: "ACF — Almeida Corrigida e Fiel (1994)" */
  rotulo(versaoCode) {
    const v = this.versao(versaoCode);
    if (!v) return versaoCode;
    return v.year ? `${v.code} — ${v.name} (${v.year})` : `${v.code} — ${v.name}`;
  },

  /* ---------------------------------------------------------------- arvore */

  arvore(versaoCode) {
    return this.estrutura.canons[this.canoneDe(versaoCode)];
  },

  /** Lista plana de livros na ordem de leitura daquele canone. */
  livros(versaoCode) {
    const arv = this.arvore(versaoCode);
    const saida = [];
    for (const t of arv.testaments) {
      for (const c of t.categories) {
        for (const b of c.books) {
          saida.push({ ...b, testament: t.id, category: c.id, categoryName: c.name });
        }
      }
    }
    return saida;
  },

  infoLivro(versaoCode, bookCode) {
    return this.livros(versaoCode).find(b => b.code === bookCode) || null;
  },

  /** Livro anterior / seguinte na ordem de leitura do canone. */
  vizinho(versaoCode, bookCode, passo) {
    const ordem = this.arvore(versaoCode).reading_order;
    const i = ordem.indexOf(bookCode);
    if (i < 0) return null;
    return ordem[i + passo] || null;
  },

  /* ------------------------------------------------------------- carregar */

  async livro(versaoCode, bookCode) {
    const chave = `${versaoCode}/${bookCode}`;
    if (this._cache.has(chave)) return this._cache.get(chave);
    if (this._carregando.has(chave)) return this._carregando.get(chave);

    const v = this.versao(versaoCode);
    if (!v) throw new Error(`Versão desconhecida: ${versaoCode}`);

    const p = fetch(`data/biblias/${v.folder}/${bookCode}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`${bookCode} não existe em ${versaoCode}`);
        return r.json();
      })
      .then(livro => {
        this._cache.set(chave, livro);
        this._carregando.delete(chave);
        return livro;
      })
      .catch(err => {
        this._carregando.delete(chave);
        throw err;
      });

    this._carregando.set(chave, p);
    return p;
  },

  async capitulo(versaoCode, bookCode, numero) {
    const livro = await this.livro(versaoCode, bookCode);
    const cap = livro.chapters.find(c => c.number === numero);
    return cap ? { livro, capitulo: cap } : null;
  },

  /** Existe este livro nesta versao? (deuterocanonicos so no canone catolico) */
  temLivro(versaoCode, bookCode) {
    return this.arvore(versaoCode).reading_order.includes(bookCode);
  },

  /* ----------------------------------------------------------- numeracao
   * Traduz o numero do capitulo entre a numeracao da Vulgata (Ave-Maria) e a
   * hebraica (as 18 protestantes). Devolve tambem se o alinhamento e exato
   * ou aproximado, porque em alguns Salmos a Vulgata funde ou parte capitulos.
   */

  converter(bookCode, capitulo, de, para) {
    if (de === para) return { capitulo, exato: true, nota: null };

    const regras = this.numeracao[bookCode];
    if (!regras) return { capitulo, exato: true, nota: null };

    const origem = de === 'vulgata' ? 'vulgata' : 'hebraico';
    const destino = para === 'vulgata' ? 'vulgata' : 'hebraico';

    for (const r of regras.regras) {
      const faixa = r[origem];
      if (!faixa || capitulo < faixa[0] || capitulo > faixa[1]) continue;

      // deslocamento fixo: alinhamento exato, so muda o numero
      if (typeof r.deslocamento === 'number') {
        const delta = origem === 'vulgata' ? r.deslocamento : -r.deslocamento;
        return { capitulo: capitulo + delta, exato: true, nota: null };
      }

      // fusao ou divisao de capitulos: alinhamento aproximado
      return {
        capitulo: r[destino][0],
        exato: false,
        nota: r.nota || regras.aviso || 'As duas numerações não se alinham exatamente aqui.',
        faixaVersiculos: r.faixa_versiculos || null,
      };
    }

    return { capitulo, exato: true, nota: null };
  },

  /** Converte uma referencia da versao A para a versao B. */
  referenciaEm(bookCode, capitulo, deVersao, paraVersao) {
    return this.converter(
      bookCode,
      capitulo,
      this.versificacaoDe(deVersao),
      this.versificacaoDe(paraVersao)
    );
  },

  /* --------------------------------------------------------------- textos */

  /** Nome do livro como aquela versao o chama (a Ave-Maria diz "São Mateus"). */
  async nomeLivro(versaoCode, bookCode) {
    try {
      const livro = await this.livro(versaoCode, bookCode);
      return livro.name;
    } catch {
      const info = this.infoLivro(versaoCode, bookCode);
      return info ? info.name : bookCode;
    }
  },

  nomeCurto(versaoCode, bookCode) {
    const info = this.infoLivro(versaoCode, bookCode);
    return info ? info.name : bookCode;
  },

  abrev(versaoCode, bookCode) {
    const info = this.infoLivro(versaoCode, bookCode);
    return info ? info.abbrev : bookCode;
  },

  referencia(versaoCode, bookCode, cap, vers) {
    const base = `${this.nomeCurto(versaoCode, bookCode)} ${cap}`;
    return vers ? `${base}:${vers}` : base;
  },

  /* ------------------------------------------------- referencias cruzadas
   *
   * O arquivo de cada livro (data/refs/<CODE>.json) traz, por capitulo e
   * versiculo, as passagens relacionadas — o Treasury of Scripture Knowledge.
   * Carregado sob demanda e guardado em cache, igual aos textos.
   *
   * A numeracao do arquivo e a hebraica/protestante. Ao consultar a partir de
   * uma versao Vulgata (Ave-Maria), convertemos o capitulo de entrada; os
   * alvos ficam na numeracao protestante, que e a referencia neutra.
   */
  _refsCache: new Map(),

  async carregarRefs(bookCode) {
    if (this._refsCache.has(bookCode)) return this._refsCache.get(bookCode);
    try {
      const dados = await fetch(`data/refs/${bookCode}.json`).then(r =>
        r.ok ? r.json() : null);
      this._refsCache.set(bookCode, dados);
      return dados;
    } catch {
      this._refsCache.set(bookCode, null);
      return null;
    }
  },

  /**
   * Referencias de um versiculo, ja ordenadas por voto (as mais fortes
   * primeiro). `versaoCode` diz de qual numeracao vem o pedido, para converter
   * quando a versao for Vulgata.
   * Devolve [] se o livro nao tiver arquivo de referencias ou o versiculo nada.
   */
  async referenciasDe(versaoCode, bookCode, cap, vers) {
    const dados = await this.carregarRefs(bookCode);
    if (!dados) return [];

    // o arquivo esta em numeracao protestante; converte o capitulo se preciso
    const versificacao = this.versificacaoDe(versaoCode);
    let capProt = cap;
    if (versificacao === 'vulgata') {
      const conv = this.converter(bookCode, cap, 'vulgata', 'hebraica');
      capProt = conv.capitulo;
    }

    const doCap = dados[String(capProt)];
    if (!doCap) return [];
    return doCap[String(vers)] || [];
  },

  /* ============================================================ SEÇÕES =======
   * Divisões temáticas (títulos como "O Verbo se faz carne") de cada capítulo.
   * Arquivo por versão em data/secoes/<versao>.json, no formato enxuto:
   *   { versao, nome_versao, dados: { CODE: { "1": [ {t,i,f}, ... ] } } }
   *   t = título · i = versículo inicial · f = versículo final
   * Só os capítulos COM seções entram no arquivo. Carregado sob demanda e
   * guardado em cache, igual às referências cruzadas. Nem toda versão tem o
   * arquivo — quando falta, devolvemos vazio sem quebrar nada. */
  _secoesCache: new Map(),      // versao -> dados (ou null se não existe)
  _secoesCarregando: new Map(), // versao -> promise em voo

  /** Carrega (uma vez) o arquivo de seções de uma versão. Devolve o objeto
   *  `dados` (CODE -> capítulos) ou null se a versão não tiver arquivo. */
  async carregarSecoes(versaoCode) {
    if (this._secoesCache.has(versaoCode)) return this._secoesCache.get(versaoCode);
    if (this._secoesCarregando.has(versaoCode)) return this._secoesCarregando.get(versaoCode);

    const p = fetch(`data/secoes/${versaoCode}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(arq => {
        const dados = arq && arq.dados ? arq.dados : null;
        this._secoesCache.set(versaoCode, dados);
        this._secoesCarregando.delete(versaoCode);
        return dados;
      })
      .catch(() => {
        this._secoesCache.set(versaoCode, null);
        this._secoesCarregando.delete(versaoCode);
        return null;
      });

    this._secoesCarregando.set(versaoCode, p);
    return p;
  },

  /** Esta versão tem arquivo de seções? (depois de já ter sido carregada.) */
  async temSecoes(versaoCode) {
    const d = await this.carregarSecoes(versaoCode);
    return !!(d && Object.keys(d).length);
  },

  /** Seções de UM capítulo. Devolve um array [{titulo, inicio, fim}, ...] já
   *  ordenado pelo versículo inicial, ou [] se não houver. */
  async secoes(versaoCode, bookCode, capitulo) {
    const d = await this.carregarSecoes(versaoCode);
    if (!d) return [];
    const livro = d[bookCode];
    if (!livro) return [];
    const lista = livro[String(capitulo)];
    if (!lista || !lista.length) return [];
    return lista
      .map(s => ({ titulo: s.t, inicio: s.i, fim: s.f }))
      .sort((a, b) => a.inicio - b.inicio);
  },

  /* Versões que possuem arquivo de subtítulos, na ordem em que aparecem no menu
   * de favorito. Conforme novas extrações entram em data/secoes/, acrescente
   * o código aqui. */
  SUBTITULOS_DISPONIVEIS: ['ACF', 'ARA', 'NVI'],
  /* Paráfrases cujos versículos não casam com os das demais — nunca recebem
   * subtítulo de outra versão. A Mensagem entra aqui; o código exato pode
   * ser ajustado quando entrar no app. */
  SUBTITULOS_SEM: ['MSG', 'TM', 'BM'],

  /** Lista para o menu de favorito: [{code, rotulo}] das versões com subtítulo. */
  subtitulosDisponiveis() {
    return this.SUBTITULOS_DISPONIVEIS.map(code => ({
      code,
      rotulo: (this.versao(code) && this.versao(code).name) || code,
    }));
  },

  /* Seções de uma FONTE aplicadas à versão ATIVA. As nativas já vêm na
   * numeração da própria versão, então entram direto; uma fonte diferente só
   * entra quando numera igual à versão ativa (a conversão das de numeração
   * diferente, como as católicas, vem na fase seguinte). */
  async _secoesDeFonte(fonte, versaoAtiva, bookCode, capitulo) {
    if (fonte !== versaoAtiva &&
        this.versificacaoDe(versaoAtiva) !== this.versificacaoDe(fonte)) return [];
    return this.secoes(fonte, bookCode, capitulo);
  },

  /** Os subtítulos que a leitura deve mostrar para a versão ATIVA, conforme o
   *  modo escolhido nos ajustes:
   *   'nativo'          — só os da própria versão; sem completar.
   *   'nativo-favorito' — os da própria versão; onde o capítulo não tiver,
   *                       completa com os do favorito.
   *   'favorito'        — sempre os do favorito, em qualquer versão.
   *   'nenhum'          — não mostra nada.
   *  Paráfrases (A Mensagem) nunca recebem subtítulo de outra versão. */
  async secoesParaLeitura(versaoAtiva, bookCode, capitulo) {
    const modo = (typeof Prefs !== 'undefined') ? Prefs.get('subtituloModo') : 'nativo-favorito';
    if (modo === 'nenhum') return [];
    if (this.SUBTITULOS_SEM.includes(versaoAtiva)) return [];
    const favorito = ((typeof Prefs !== 'undefined') ? Prefs.get('subtituloFavorito') : '') || 'ACF';

    if (modo === 'favorito') {
      return this._secoesDeFonte(favorito, versaoAtiva, bookCode, capitulo);
    }

    // as próprias da versão ativa (numeração própria, entram direto)
    const proprias = await this.secoes(versaoAtiva, bookCode, capitulo);
    if (modo === 'nativo') return proprias;

    // 'nativo-favorito': usa as próprias; se este capítulo não tem nenhuma,
    // completa com as do favorito
    if (proprias.length) return proprias;
    if (favorito === versaoAtiva) return [];
    return this._secoesDeFonte(favorito, versaoAtiva, bookCode, capitulo);
  },

  /** Todas as seções de um LIVRO inteiro, achatadas e em ordem de leitura, para
   *  a lista do modo Seções. Cada item traz o capítulo a que pertence.
   *  Devolve [{capitulo, titulo, inicio, fim}, ...] ou [] se o livro não tiver. */
  async secoesDoLivro(versaoCode, bookCode) {
    const d = await this.carregarSecoes(versaoCode);
    if (!d) return [];
    const livro = d[bookCode];
    if (!livro) return [];
    const saida = [];
    const capsOrdenados = Object.keys(livro)
      .map(Number)
      .sort((a, b) => a - b);
    for (const cap of capsOrdenados) {
      for (const s of livro[String(cap)]) {
        saida.push({ capitulo: cap, titulo: s.t, inicio: s.i, fim: s.f });
      }
    }
    return saida;
  },
};

/** Minusculas e sem acento. So para o indice de busca, nunca para exibir. */
function normalizar(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
