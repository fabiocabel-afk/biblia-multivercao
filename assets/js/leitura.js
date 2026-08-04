/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
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

  aplicarModoNotas(mostrar) {
    document.documentElement.dataset.notas = mostrar ? 'sim' : 'nao';
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
    // A capitular (o numero grande do capitulo) aparece nos dois modos, igual.
    // No corrido ela substitui o numero do primeiro versiculo; no "um por linha"
    // o numero do primeiro continua, porque ali cada linha comeca pelo numero.
    const porLinha = Prefs.get('versiculoPorLinha');
    const versificacao = Dados.versificacaoDe(versaoCode);
    const ehInter = Dados.ehInterlinear(versaoCode);   // desenha em blocos palavra-a-palavra
    // versiculos que tem anotacao neste capitulo, para o sinalzinho na tela
    const comNota = Anotacoes.noCapitulo(versificacao, livro.code, capitulo.number);
    const partes = [];
    let lacunas = 0;

    capitulo.verses.forEach((v, i) => {
      const faixas = Marcadores.faixas(versificacao, livro.code, capitulo.number, v.number);
      const ehPonto = Ponto.eh(versificacao, livro.code, capitulo.number, v.number);

      // no interlinear o áudio não pode ler o alfabeto original: guardamos a
      // transliteração inteira no data-fala, e é ela que a voz e a cópia usam
      // tem dados palavra a palavra? (interlinear empilhado OU original corrido)
      const temPalavras = Array.isArray(v.palavras) && v.palavras.length;
      // original tocável: versão de língua original SEM ser interlinear (HEB-GRE)
      // — o texto flui como de costume, mas cada palavra é tocável para o estudo
      const corrido = temPalavras && !ehInter;
      const fala = temPalavras
        ? ` data-fala="${this.escaparAttr(v.palavras.map(p => p.t).filter(Boolean).join(' '))}"`
        : '';
      // hebraico corre da direita para a esquerda; grego, da esquerda para a
      // direita — como na Bíblia interlinear impressa
      const rtl = temPalavras && livro.lang === 'he';
      const dir = rtl ? ' dir="rtl"' : '';

      const attrs = [
        `class="v${(v.text || temPalavras) ? '' : ' vazio'}${temPalavras ? ' interlinear' : ''}${rtl ? ' il-rtl' : ''}${corrido ? ' il-corr' : ''}${ehPonto ? ' ponto' : ''}"`,
        `data-vers="${v.number}"${fala}${dir}`,
      ].join(' ');

      const ehAbertura = comCapitular && i === 0;
      const capitular = ehAbertura
        ? `<span class="capitular">${capitulo.number}</span>`
        : '';

      // o numero do primeiro versiculo so sai no corrido; no "um por linha" fica
      const numero = (ehAbertura && !porLinha) ? '' : `<span class="n">${v.number}</span>`;

      let texto;
      if (temPalavras) {
        // o número entra no fluxo das palavras: vira cabeçalho da linha, na mesma
        // linha do início do texto (à direita no hebraico, à esquerda no grego)
        texto = this.interlinear(v.palavras, livro.lang, numero, corrido);
      } else if (v.text) {
        texto = this.comMarcas(v.text, faixas);
      } else {
        lacunas++;
        texto = '(este versículo não veio no texto de origem)';
      }

      const nota = comNota.has(v.number) ? this.marcaNotaHTML(v.number) : '';
      // com palavras, o número já foi injetado no fluxo; fora disso, vai antes
      const numeroFora = temPalavras ? '' : numero;
      const verso = `<span ${attrs}>${numeroFora}${nota}${texto}</span>`;

      // No "um por linha" a capitular vai numa coluna própria à esquerda, fora da
      // caixa do versiculo — assim a marcacao (e o "onde parei") pegam so o texto,
      // nunca o numero do capitulo. No corrido, segue flutuando como sempre.
      if (ehAbertura && porLinha) {
        partes.push(`<div class="linha-abertura">${capitular}${verso}</div>`);
      } else {
        partes.push(`${capitular}${verso} `);
      }
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
  /** O sinalzinho discreto de "tem anotação aqui", logo após o número. */
  marcaNotaHTML(vers) {
    return `<span class="marca-nota" role="button" tabindex="0" data-nota-vers="${vers}"`
      + ` aria-label="Ver anotações" title="Anotações"><svg><use href="#i-nota"/></svg></span>`;
  },

  pintarMarca(vers, texto, faixas) {
    document.querySelectorAll(`#folha .v[data-vers="${vers}"]`).forEach(el => {
      // no interlinear o versículo são blocos empilhados; repintar por dentro
      // apagaria as palavras. A marcação de cor não se aplica a esse modo.
      if (el.classList.contains('interlinear')) return;
      const n = el.querySelector('.n');
      const nota = el.querySelector('.marca-nota');   // preserva o sinal ao repintar
      const capitular = el.previousElementSibling;
      el.innerHTML = (n ? n.outerHTML : '') + (nota ? nota.outerHTML : '')
        + this.comMarcas(texto, faixas);
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

  escaparAttr(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },

  /* --------------------------------------------------------- interlinear
   *
   * Cada palavra vira um bloco empilhado: original em cima, transliteração e
   * português embaixo. Os blocos fluem na ordem de leitura do original e quebram
   * linha como palavras num paragrafo. A transliteração e o português somem/
   * aparecem por CSS conforme os data-atributos da raiz (o pop-up "Exibir").
   *
   * O português sai do léxico Strong (já carregado antes de desenhar). Quando
   * ainda não há português para aquele Strong, cai no gloss inglês da palavra,
   * para o bloco nunca ficar vazio. */
  interlinear(palavras, lang, numeroHTML = '', corrido = false) {
    const arr = palavras.map(p => {
      const pt = (Dados.significado(lang, p.s) || p.g || '').trim();
      const strong = p.s ? ` data-strong="${this.escaparAttr(p.s)}"` : '';
      // bloco de morfologia: Strong, código gramatical e lema empilhados; é a
      // camada "informativa" que alterna com o português (nunca os dois juntos)
      const morfo = this.morfologia(p);
      return `<span class="il-p"${strong}>`
        + `<span class="il-o">${this.escapar(p.o || '')}</span>`
        + `<span class="il-t">${this.escapar(p.t || '')}</span>`
        + `<span class="il-g"><span class="il-txt">${this.escapar(pt)}</span></span>`
        + `<span class="il-m">${morfo}</span>`
        + `</span>`;
    });
    // corrido = original tocável fluindo como texto: as palavras são separadas por
    // um espaço real, que dá o ponto de quebra de linha (cada palavra é nowrap).
    // Empilhado = blocos colados (o flex cuida do espaçamento e da quebra).
    const blocos = corrido ? arr.join(' ') : arr.join('');
    const sep = corrido && numeroHTML ? ' ' : '';
    const cls = corrido ? 'il-palavras il-corrido' : 'il-palavras';
    return `<span class="${cls}">${numeroHTML}${sep}${blocos}</span>`;
  },

  /* Monta a caixinha de morfologia de uma palavra: número de Strong em cima,
     o código gramatical decodificado no meio e o lema (forma de dicionário)
     embaixo. Cada linha só sai se existir, para não ficar buraco. */
  morfologia(p) {
    const linhas = [];
    if (p.s) linhas.push(`<span class="il-m-s">${this.escapar(p.s)}</span>`);
    if (p.m) {
      const curto = MorfologiaCodigo.compacto(p.m);
      const longo = MorfologiaCodigo.completo(p.m);
      const titulo = longo ? ` title="${this.escaparAttr(longo)}"` : '';
      linhas.push(`<span class="il-m-c"${titulo}><span class="il-txt">${this.escapar(curto || p.m)}</span></span>`);
    }
    if (p.l) linhas.push(`<span class="il-m-l">${this.escapar(p.l)}</span>`);
    return linhas.join('');
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

    this.ligarSiglasTirinha(alvo);
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

    // nome por extenso guardado na própria sigla; ao tocar, a caixinha se
    // expande e a abreviação dá lugar ao nome, ali mesmo (orienta quem não
    // conhece a sigla). Um por vez; tocar de novo recolhe.
    const vinfo = Dados.versao(code);
    const nomeCompleto = vinfo && vinfo.name ? vinfo.name : '';

    return `<div class="${classe}">
      <div class="cabeca">
        <button class="sigla${nomeCompleto ? ' sigla-toque' : ''}" data-sigla="${code}"
          ${nomeCompleto ? `data-abrir-nome="${code}" data-nome="${this.escapar(nomeCompleto)}"
          aria-expanded="false" title="Ver o nome da versão"` : ''}>${code}</button>
        ${ref ? `<span class="ref-fita">${ref}</span>` : ''}
        ${selo}
      </div>
      ${corpo}
      ${nota}
    </div>`;
  },

  /* Toque na sigla da tirinha: a caixinha se expande e a abreviação vira o nome
   * completo no mesmo lugar (largura animada). Abre uma por vez; tocar na mesma
   * recolhe. Reabrir a tirinha remonta tudo, então volta fechado por padrão. */
  ligarSiglasTirinha(alvo) {
    const medir = (btn, texto) => {           // largura que a caixinha teria com esse texto
      const antes = btn.textContent, larguraInline = btn.style.width;
      btn.textContent = texto;
      btn.style.width = 'auto';
      const w = btn.offsetWidth;
      btn.textContent = antes;
      btn.style.width = larguraInline;
      return w;
    };

    const abrir = btn => {
      const w0 = btn.offsetWidth;
      const w1 = medir(btn, btn.dataset.nome);
      btn.textContent = btn.dataset.nome;
      btn.classList.add('aberto');
      btn.setAttribute('aria-expanded', 'true');
      btn.style.width = w0 + 'px';
      void btn.offsetWidth;                   // reflow para a transição pegar
      btn.style.width = w1 + 'px';
      const fim = () => { btn.style.width = 'auto'; btn.removeEventListener('transitionend', fim); };
      btn.addEventListener('transitionend', fim);
    };

    const fechar = (btn, instantaneo) => {
      const code = btn.dataset.sigla;
      btn.classList.remove('aberto');
      btn.setAttribute('aria-expanded', 'false');
      if (instantaneo) { btn.textContent = code; btn.style.width = ''; return; }
      const w0 = btn.offsetWidth;             // largura atual (nome)
      const wCode = medir(btn, code);
      btn.style.width = w0 + 'px';            // mantém o nome e encolhe, clipando
      void btn.offsetWidth;
      btn.style.width = wCode + 'px';
      const fim = () => { btn.textContent = code; btn.style.width = ''; btn.removeEventListener('transitionend', fim); };
      btn.addEventListener('transitionend', fim);
    };

    alvo.querySelectorAll('[data-abrir-nome]').forEach(btn => {
      btn.onclick = () => {
        const estaAberto = btn.classList.contains('aberto');
        alvo.querySelectorAll('.sigla-toque.aberto').forEach(b => { if (b !== btn) fechar(b, true); });
        if (estaAberto) fechar(btn, false); else abrir(btn);
      };
    });
  },
};
