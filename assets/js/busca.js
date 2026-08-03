/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* busca.js — procura no texto bíblico.
 *
 * O escopo (funil) reaproveita a árvore de navegação: Toda a Bíblia >
 * Testamento > Categoria > Livro. O índice é normalizado (minúsculas, sem
 * acento) para que "coracao" encontre "coração" — mas o texto exibido nunca é
 * alterado. A busca com uma palavra é por pedaço (substring); com várias, é por
 * PROXIMIDADE: as palavras podem estar espalhadas, desde que caibam perto umas
 * das outras (até ~5 palavras entre vizinhas) no mesmo versículo.
 */

const Busca = {
  escopo: { tipo: 'tudo', id: null, nome: 'Toda a Bíblia' },
  _indice: new Map(),   // "ACF/GEN" -> [{cap, vers, texto, normal}]
  _geracao: 0,          // cada busca ganha um número; só a mais recente vale
  GAP: 5,               // palavras de folga permitidas entre termos vizinhos

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
  alcance(versaoCode, escopo = this.escopo) {
    const livros = Dados.livros(versaoCode);
    const e = escopo;
    if (e.tipo === 'livro') return livros.filter(b => b.code === e.id);
    if (e.tipo === 'categoria') return livros.filter(b => b.category === e.id);
    if (e.tipo === 'testamento') return livros.filter(b => b.testament === e.id);
    return livros;
  },

  /* ---------------------------------------------------------- termos e casa */

  /** Quebra o que a pessoa digitou em palavras normalizadas (sem acento/pontuação). */
  termos(texto) {
    return normalizar((texto || '').trim()).split(/[^a-z0-9]+/).filter(Boolean);
  },

  /** Uma linha (já normalizada) casa com os termos? Um termo: pedaço; vários:
   *  proximidade — todas presentes e agrupadas dentro de uma janela curta. */
  casa(normal, termos) {
    if (termos.length === 0) return false;
    if (termos.length === 1) return normal.includes(termos[0]);

    const palavras = normal.split(/[^a-z0-9]+/).filter(Boolean);
    const grupos = termos.map(t => {
      const pos = [];
      for (let i = 0; i < palavras.length; i++) if (palavras[i].includes(t)) pos.push(i);
      return pos;
    });
    if (grupos.some(g => g.length === 0)) return false;

    // janela permitida: cada par de vizinhos pode ter até GAP palavras entre si
    const spanMax = (termos.length - 1) * (this.GAP + 1);
    return this._janelaCabe(grupos, spanMax);
  },

  /** Existe uma escolha de uma posição por grupo em que o intervalo (maior −
   *  menor) caiba em spanMax? (janela mínima que contém todos os grupos) */
  _janelaCabe(grupos, spanMax) {
    const pts = [];
    grupos.forEach((ps, g) => ps.forEach(p => pts.push([p, g])));
    pts.sort((a, b) => a[0] - b[0]);

    const precisa = grupos.length;
    const conta = new Array(precisa).fill(0);
    let temos = 0, esq = 0, melhor = Infinity;

    for (let dir = 0; dir < pts.length; dir++) {
      if (conta[pts[dir][1]]++ === 0) temos++;
      while (temos === precisa) {
        melhor = Math.min(melhor, pts[dir][0] - pts[esq][0]);
        if (--conta[pts[esq][1]] === 0) temos--;
        esq++;
      }
    }
    return melhor <= spanMax;
  },

  /* --------------------------------------------------------------- procurar */

  /**
   * Procura na versão dada e vai entregando os resultados aos poucos, para a
   * tela não travar enquanto abre livro por livro.
   */
  async procurar(versaoCode, termo, aoProgredir, aoAchar) {
    const minha = ++this._geracao;
    const termos = this.termos(termo);
    if (!termos.length || termos.join('').length < 2) return { total: 0, cancelado: false };

    const livros = this.alcance(versaoCode);
    let total = 0;

    for (let i = 0; i < livros.length; i++) {
      if (minha !== this._geracao) return { total, cancelado: true };
      const b = livros[i];
      if (aoProgredir) aoProgredir(i + 1, livros.length, b.name);

      let linhas;
      try {
        linhas = await this.indexar(versaoCode, b.code);
      } catch {
        continue;
      }
      if (minha !== this._geracao) return { total, cancelado: true };

      const achados = [];
      for (const l of linhas) {
        if (this.casa(l.normal, termos)) {
          achados.push({ code: b.code, nome: b.name, cap: l.cap, vers: l.vers, texto: l.texto });
          total++;
        }
      }
      if (achados.length && aoAchar) aoAchar(achados, termos);
    }

    return { total, cancelado: false };
  },

  /** Conta as ocorrências numa versão (respeitando o escopo atual). Usado no
   *  aviso "achei em outras versões". Devolve número, ou null se cancelado. */
  async contarEmVersao(versaoCode, termos, minha) {
    let total = 0;
    const livros = this.alcance(versaoCode);
    for (const b of livros) {
      if (minha !== this._geracao) return null;
      let linhas;
      try { linhas = await this.indexar(versaoCode, b.code); } catch { continue; }
      if (minha !== this._geracao) return null;
      for (const l of linhas) if (this.casa(l.normal, termos)) total++;
    }
    return total;
  },

  /** Varre as demais versões e devolve [{code, name, total}] (só as com >0),
   *  da maior para a menor contagem. Devolve null se uma nova busca cancelou. */
  async contarNasOutras(versaoAtiva, termos, aoProgredir) {
    const minha = this._geracao;   // amarrada à busca corrente (não incrementa)
    if (!termos.length || termos.join('').length < 2) return [];
    const outras = (Dados.versoes || []).filter(v => v.code !== versaoAtiva);
    const achados = [];
    for (let i = 0; i < outras.length; i++) {
      const v = outras[i];
      if (aoProgredir) aoProgredir(i + 1, outras.length, v.code);
      const total = await this.contarEmVersao(v.code, termos, minha);
      if (total === null) return null;         // cancelado por nova digitação
      if (total > 0) achados.push({ code: v.code, name: v.name, total });
    }
    achados.sort((a, b) => b.total - a.total);
    return achados;
  },

  cancelar() {
    this._geracao++;
  },

  /* --------------------------------------------------------------- realce */

  /** Normaliza mantendo, para cada caractere do resultado, o índice de origem
   *  no texto real — assim o realce cai no lugar certo mesmo com acentos. */
  _mapaNormal(texto) {
    let normal = '';
    const mapa = [];
    for (let i = 0; i < texto.length; i++) {
      const n = texto[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (let k = 0; k < n.length; k++) { normal += n[k]; mapa.push(i); }
    }
    mapa.push(texto.length);   // sentinela para o fim
    return { normal, mapa };
  },

  /** Realça todas as palavras buscadas no trecho, cortando uma janela ao redor
   *  da primeira ocorrência para caber em uma ou duas linhas. */
  realcar(texto, termos) {
    if (!Array.isArray(termos)) termos = this.termos(termos);
    const { normal, mapa } = this._mapaNormal(texto);

    const faixas = [];
    for (const t of termos) {
      if (!t) continue;
      let i = normal.indexOf(t);
      while (i >= 0) {
        faixas.push([mapa[i], mapa[i + t.length]]);
        i = normal.indexOf(t, i + t.length);
      }
    }
    if (!faixas.length) return Leitura.escapar(texto);

    faixas.sort((a, b) => a[0] - b[0]);
    const juntas = [faixas[0].slice()];
    for (let k = 1; k < faixas.length; k++) {
      const ult = juntas[juntas.length - 1];
      if (faixas[k][0] <= ult[1]) ult[1] = Math.max(ult[1], faixas[k][1]);
      else juntas.push(faixas[k].slice());
    }

    const inicio = juntas[0][0];
    const fim = juntas[juntas.length - 1][1];
    const de = Math.max(0, inicio - 55);
    const ate = Math.min(texto.length, Math.max(fim + 85, inicio + 120));

    let saida = de > 0 ? '… ' : '';
    let cursor = de;
    for (const [s, e] of juntas) {
      if (e <= de || s >= ate) continue;
      const s2 = Math.max(s, de), e2 = Math.min(e, ate);
      if (s2 > cursor) saida += Leitura.escapar(texto.slice(cursor, s2));
      saida += '<mark>' + Leitura.escapar(texto.slice(s2, e2)) + '</mark>';
      cursor = e2;
    }
    if (cursor < ate) saida += Leitura.escapar(texto.slice(cursor, ate));
    if (ate < texto.length) saida += ' …';
    return saida;
  },
};
