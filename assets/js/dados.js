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
};

/** Minusculas e sem acento. So para o indice de busca, nunca para exibir. */
function normalizar(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
