/* busca.js — procura no texto da versao aberta.
 *
 * O funil reaproveita a arvore de navegacao: Toda a Biblia > Testamento >
 * Categoria > Livro. O indice e normalizado (minusculas, sem acento) para que
 * "coracao" encontre "coração" — mas o texto exibido nunca e alterado.
 */

const Busca = {
  escopo: { tipo: 'tudo', id: null, nome: 'Toda a Bíblia' },
  _indice: new Map(),   // "ACF/GEN" -> [{cap, vers, texto, normal}]
  _geracao: 0,          // cada busca ganha um numero; so a mais recente vale

  async indexar(versaoCode, bookCode) {
    const chave = `${versaoCode}/${bookCode}`;
    if (this._indice.has(chave)) return this._indice.get(chave);

    const livro = await Dados.livro(versaoCode, bookCode);
    const linhas = [];
    for (const cap of livro.chapters) {
      for (const v of cap.verses) {
        if (!v.text) continue;
        linhas.push({ cap: cap.number, vers: v.number, texto: v.text, normal: normalizar(v.text) });
      }
    }
    this._indice.set(chave, linhas);
    return linhas;
  },

  /** Livros que entram na busca, conforme o funil escolhido. */
  alcance(versaoCode) {
    const livros = Dados.livros(versaoCode);
    const e = this.escopo;
    if (e.tipo === 'livro') return livros.filter(b => b.code === e.id);
    if (e.tipo === 'categoria') return livros.filter(b => b.category === e.id);
    if (e.tipo === 'testamento') return livros.filter(b => b.testament === e.id);
    return livros;
  },

  /**
   * Procura e vai entregando os resultados aos poucos, para a tela nao travar
   * enquanto abre livro por livro.
   */
  async procurar(versaoCode, termo, aoProgredir, aoAchar) {
    const minha = ++this._geracao;
    const alvo = normalizar(termo.trim());
    if (alvo.length < 2) return { total: 0, cancelado: false };

    const livros = this.alcance(versaoCode);
    let total = 0;

    for (let i = 0; i < livros.length; i++) {
      if (minha !== this._geracao) return { total, cancelado: true };
      const b = livros[i];
      aoProgredir(i + 1, livros.length, b.name);

      let linhas;
      try {
        linhas = await this.indexar(versaoCode, b.code);
      } catch {
        continue;
      }
      // abrir o livro leva tempo; confere de novo se ainda somos a busca atual
      if (minha !== this._geracao) return { total, cancelado: true };

      const achados = [];
      for (const l of linhas) {
        if (l.normal.includes(alvo)) {
          achados.push({ code: b.code, nome: b.name, ...l });
          total++;
        }
      }
      if (achados.length) aoAchar(achados, alvo);
    }

    return { total, cancelado: false };
  },

  cancelar() {
    this._geracao++;
  },

  /** Realca o termo no trecho, respeitando os acentos do texto original. */
  realcar(texto, alvoNormalizado) {
    const normal = normalizar(texto);
    const i = normal.indexOf(alvoNormalizado);
    if (i < 0) return Leitura.escapar(texto);

    const fim = i + alvoNormalizado.length;
    // corta um trecho ao redor, para o resultado caber numa linha ou duas
    const de = Math.max(0, i - 60);
    const ate = Math.min(texto.length, fim + 90);
    const prefixo = de > 0 ? '… ' : '';
    const sufixo = ate < texto.length ? ' …' : '';

    return prefixo
      + Leitura.escapar(texto.slice(de, i))
      + '<mark>' + Leitura.escapar(texto.slice(i, fim)) + '</mark>'
      + Leitura.escapar(texto.slice(fim, ate))
      + sufixo;
  },
};
