/* leitura.js — desenha o texto na folha.
 *
 * Capitular grande com o numero do capitulo, numeros de versiculo pequenos
 * sobrescritos no corpo, e a tirinha: o mesmo versiculo empilhado em varias
 * versoes de uma vez.
 */

const Leitura = {

  /* ------------------------------------------------------ temperatura */

  /* A folha vai do branco ao sepia e a tinta acompanha, do preto ao marrom.
     Interpola os dois extremos de uma Biblia nova e de uma envelhecida.

     As barras do topo e do rodape andam junto: com a folha branca elas ficam
     quase pretas, e vao amarronzando conforme a folha esquenta. Se ficassem
     presas no preto, brigariam com a folha sepia. */
  aplicarTemperatura(valor) {
    const t = Math.max(0, Math.min(100, valor)) / 100;
    const mistura = (a, b) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
    const rgb = c => `rgb(${c[0]} ${c[1]} ${c[2]})`;

    const escuro = document.documentElement.dataset.escuro === 'true';
    if (escuro) return; // no modo escuro a temperatura nao se aplica

    const papel = mistura([255, 255, 255], [240, 224, 190]);
    const tinta = mistura([23, 20, 15], [74, 58, 36]);
    const fraca = mistura([109, 100, 89], [138, 116, 86]);

    // o numero do versiculo tem cor propria: mais clara e mais amarronzada que
    // a tinta, para se destacar do texto sem competir com a leitura
    const numero = mistura([150, 112, 74], [166, 126, 76]);

    // as barras: preto quase neutro -> marrom escuro de couro
    const cromo      = mistura([32, 29, 25],    [58, 43, 27]);
    const cromoAlto  = mistura([43, 39, 33],    [76, 58, 38]);
    const cromoTexto = mistura([232, 226, 214], [243, 231, 205]);
    const cromoFraco = mistura([154, 145, 134], [180, 159, 128]);

    const r = document.documentElement.style;
    r.setProperty('--papel', rgb(papel));
    r.setProperty('--tinta', rgb(tinta));
    r.setProperty('--tinta-fraca', rgb(fraca));
    r.setProperty('--tinta-numero', rgb(numero));
    r.setProperty('--cromo', rgb(cromo));
    r.setProperty('--cromo-alto', rgb(cromoAlto));
    r.setProperty('--cromo-texto', rgb(cromoTexto));
    r.setProperty('--cromo-fraco', rgb(cromoFraco));

    // a barra do sistema operacional tambem acompanha
    const hex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', hex(cromo));
  },

  /* Duas formas de ler: o texto corrido, como numa Biblia impressa, ou um
   * versiculo por linha, com o numero servindo de cabecalho. A segunda ajuda
   * quem esta acompanhando uma pregacao versiculo a versiculo. */
  aplicarModoVersiculo(porLinha) {
    document.documentElement.dataset.modoVersiculo = porLinha ? 'linha' : 'corrido';
  },

  aplicarFonte(px) {
    document.documentElement.style.setProperty('--corpo', px + 'px');
  },

  aplicarEscuro(ligado) {
    document.documentElement.dataset.escuro = ligado ? 'true' : 'false';
    if (!ligado) this.aplicarTemperatura(Prefs.get('temperatura'));
    else {
      ['--papel', '--tinta', '--tinta-fraca', '--tinta-numero',
       '--cromo', '--cromo-alto', '--cromo-texto', '--cromo-fraco']
        .forEach(p => document.documentElement.style.removeProperty(p));
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#0e0f11');
    }
  },

  /* ---------------------------------------------------------- desenhar */

  /** Monta o HTML de um capitulo inteiro. */
  html(versaoCode, livro, capitulo, { comCapitular = true } = {}) {
    // no modo "um por linha" o numero e o cabecalho de cada versiculo, entao a
    // capitular sai: ela roubaria o lugar do numero do primeiro
    if (Prefs.get('versiculoPorLinha')) comCapitular = false;
    const versificacao = Dados.versificacaoDe(versaoCode);
    const partes = [];
    let lacunas = 0;

    capitulo.verses.forEach((v, i) => {
      const faixas = Marcadores.faixas(versificacao, livro.code, capitulo.number, v.number);
      const ehPonto = Ponto.eh(versificacao, livro.code, capitulo.number, v.number);

      const attrs = [
        `class="v${v.text ? '' : ' vazio'}${ehPonto ? ' ponto' : ''}"`,
        `data-vers="${v.number}"`,
      ].join(' ');

      const capitular = comCapitular && i === 0
        ? `<span class="capitular">${capitulo.number}</span>`
        : '';

      const numero = (comCapitular && i === 0) ? '' : `<span class="n">${v.number}</span>`;

      if (!v.text) lacunas++;
      const texto = v.text
        ? this.comMarcas(v.text, faixas)
        : '(este versículo não veio no texto de origem)';

      partes.push(`${capitular}<span ${attrs}>${numero}${texto}</span> `);
    });

    let saida = partes.join('');

    if (lacunas) {
      saida += `<p class="aviso-lacuna">Faltam ${lacunas} versículo${lacunas > 1 ? 's' : ''}
        neste capítulo. A lacuna vem da fonte do texto, não do aplicativo —
        confira numa edição impressa antes de citar.</p>`;
    }

    return saida;
  },

  /* ------------------------------------------------------- marcas no texto
   *
   * O texto do versiculo e cortado nos limites das faixas. Cada pedaco marcado
   * vira um <span> proprio com a cor daquele marcador; o que sobra fica solto.
   * Assim um mesmo versiculo pode ter dois trechos de cores diferentes, e a
   * marca acompanha exatamente o que foi selecionado.
   */
  comMarcas(texto, faixas) {
    if (!faixas || !faixas.length) return this.escapar(texto);

    const fim = x => (x == null ? texto.length : Math.min(x, texto.length));
    const ordenadas = faixas
      .map(f => ({ m: f.m, i: Math.max(0, f.i), f: fim(f.f) }))
      .filter(f => f.f > f.i)
      .sort((a, b) => a.i - b.i);

    if (!ordenadas.length) return this.escapar(texto);

    const partes = [];
    let cursor = 0;

    for (const fx of ordenadas) {
      if (fx.i < cursor) continue;                       // sobreposto: ignora
      if (fx.i > cursor) partes.push(this.escapar(texto.slice(cursor, fx.i)));

      const marcador = Marcadores.de(fx.m);
      const cor = marcador ? this.corMarca(marcador.cor) : 'transparent';
      partes.push(`<span class="marca" data-marcador="${fx.m}"
        data-i="${fx.i}" data-f="${fx.f}"
        style="--marca:${cor}">${this.escapar(texto.slice(fx.i, fx.f))}</span>`);
      cursor = fx.f;
    }

    if (cursor < texto.length) partes.push(this.escapar(texto.slice(cursor)));
    return partes.join('');
  },

  /* --------------------------------------------------- repintura na hora
   *
   * Trocar a cor de um versiculo nao pode depender de redesenhar o capitulo
   * inteiro: o redesenho e assincrono e a cor so aparecia depois, quando outra
   * coisa forcava a tela a se refazer. Aqui a marca entra no exato instante do
   * toque, direto no elemento que ja esta na tela.
   */
  pintarMarca(vers, texto, faixas) {
    document.querySelectorAll(`#folha .v[data-vers="${vers}"]`).forEach(el => {
      const n = el.querySelector('.n');
      const capitular = el.previousElementSibling;
      el.innerHTML = (n ? n.outerHTML : '') + this.comMarcas(texto, faixas);
      void capitular; // a capitular fica fora do versiculo, nao se mexe nela
    });
  },

  /** Idem para o ponto de leitura: entra e sai na hora do toque. */
  pintarPonto(vers, posto) {
    document.querySelectorAll('.v.ponto').forEach(el => el.classList.remove('ponto'));
    if (!posto) return;
    document.querySelectorAll(`.v[data-vers="${vers}"]`)
      .forEach(el => el.classList.add('ponto'));
  },

  /** Teto de transparencia: a marca colore sem nunca apagar a leitura. */
  corMarca(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, 0.42)`;
  },

  escapar(t) {
    return t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  },

  /* ----------------------------------------------------------- tirinha */

  /* Toca num versiculo e ve aquele versiculo em todas as versoes habilitadas,
     empilhadas: sigla em cima, texto embaixo. */
  async tirinha(bookCode, capitulo, versiculo, versaoAtual) {
    const alvo = document.getElementById('tirinha-corpo');
    const ref = Dados.referencia(versaoAtual, bookCode, capitulo, versiculo);
    document.getElementById('tirinha-ref').textContent = ref;

    // a versão principal ativa vem SEMPRE primeiro; as demais em seguida, em
    // ordem, sem repetir a principal
    const habilitadas = Prefs.get('versoesTirinha').filter(c => c !== versaoAtual);
    const lista = [versaoAtual, ...[...new Set(habilitadas)].filter(c => Dados.versao(c)).sort()];

    alvo.innerHTML = '<div class="estado">Reunindo as versões…</div>';

    // primeiro busca todos os textos, depois compara cada um com o principal
    const dados = await Promise.all(lista.map(async code => {
      if (!Dados.temLivro(code, bookCode)) {
        return { code, texto: null, erro: `${Dados.nomeCurto(versaoAtual, bookCode)} não existe nesta versão.` };
      }
      const conv = Dados.referenciaEm(bookCode, capitulo, versaoAtual, code);
      try {
        const r = await Dados.capitulo(code, bookCode, conv.capitulo);
        if (!r) return { code, texto: null, erro: 'Capítulo não encontrado.', conv };
        const v = r.capitulo.verses.find(x => x.number === versiculo);
        const refLocal = Dados.referencia(code, bookCode, conv.capitulo, versiculo);
        if (!v) return { code, texto: null, erro: 'Versículo não encontrado.', conv, ref: refLocal };
        return { code, texto: v.text || '', conv, ref: refLocal };
      } catch {
        return { code, texto: null, erro: 'Não foi possível abrir.' };
      }
    }));

    const principal = dados[0].texto || '';
    const chave = s => normalizar((s || '').replace(/\s+/g, ' ').trim());
    const chavePrincipal = chave(principal);

    alvo.innerHTML = dados.map((d, i) => {
      const ehPrincipal = i === 0;
      // igual ao principal? só faz sentido comparar quando há texto dos dois
      const igual = !ehPrincipal && d.texto != null && chave(d.texto) === chavePrincipal;
      return this.fita(d, ehPrincipal, igual);
    }).join('');
  },

  fita(dado, ehPrincipal, igual) {
    const { code, texto, erro, conv, ref } = dado;

    const nota = conv && !conv.exato
      ? `<div class="nota-numeracao">Numeração diferente: esta versão traz a
           passagem em ${ref}. ${this.escapar(conv.nota || '')}</div>`
      : '';

    // o selo à direita: a principal não compara consigo mesma; as outras
    // mostram = quando o texto é idêntico e ≠ quando difere
    let selo = '';
    if (ehPrincipal) {
      selo = '<span class="selo-cmp principal">principal</span>';
    } else if (texto != null) {
      selo = igual
        ? '<span class="selo-cmp igual">=</span>'
        : '<span class="selo-cmp difere">≠</span>';
    }

    // classe da fita governa o destaque do texto: o que é igual ao principal
    // recua para segundo plano; o que difere ganha peso, para o olho pegar na hora
    const classe = ehPrincipal ? 'fita principal'
      : texto == null ? 'fita'
      : igual ? 'fita igual' : 'fita difere';

    const corpo = texto != null
      ? `<p>${this.escapar(texto)}</p>`
      : `<p class="fita-erro">${this.escapar(erro || '')}</p>`;

    return `<div class="${classe}">
      <div class="cabeca">
        <span class="sigla">${code}</span>
        ${ref ? `<span class="ref-fita">${ref}</span>` : ''}
        ${selo}
      </div>
      ${corpo}
      ${nota}
    </div>`;
  },
};
