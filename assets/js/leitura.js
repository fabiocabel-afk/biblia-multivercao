/* leitura.js — desenha o texto na folha.
 *
 * Capitular grande com o numero do capitulo, numeros de versiculo pequenos
 * sobrescritos no corpo, e a tirinha: o mesmo versiculo empilhado em varias
 * versoes de uma vez.
 */

const Leitura = {

  /* ------------------------------------------------------ temperatura */

  /* A folha vai do branco ao sepia e a tinta acompanha, do preto ao marrom.
     Interpola os dois extremos de uma Biblia nova e de uma envelhecida. */
  aplicarTemperatura(valor) {
    const t = Math.max(0, Math.min(100, valor)) / 100;
    const mistura = (a, b) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
    const rgb = c => `rgb(${c[0]} ${c[1]} ${c[2]})`;

    const escuro = document.documentElement.dataset.escuro === 'true';
    if (escuro) return; // no modo escuro a temperatura nao se aplica

    const papel = mistura([255, 255, 255], [240, 224, 190]);
    const tinta = mistura([23, 20, 15], [74, 58, 36]);
    const fraca = mistura([109, 100, 89], [138, 116, 86]);

    const r = document.documentElement.style;
    r.setProperty('--papel', rgb(papel));
    r.setProperty('--tinta', rgb(tinta));
    r.setProperty('--tinta-fraca', rgb(fraca));
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#201d19');
  },

  aplicarFonte(px) {
    document.documentElement.style.setProperty('--corpo', px + 'px');
  },

  aplicarEscuro(ligado) {
    document.documentElement.dataset.escuro = ligado ? 'true' : 'false';
    if (!ligado) this.aplicarTemperatura(Prefs.get('temperatura'));
    else ['--papel', '--tinta', '--tinta-fraca']
      .forEach(p => document.documentElement.style.removeProperty(p));
  },

  /* ---------------------------------------------------------- desenhar */

  /** Monta o HTML de um capitulo inteiro. */
  html(versaoCode, livro, capitulo, { comCapitular = true } = {}) {
    const versificacao = Dados.versificacaoDe(versaoCode);
    const partes = [];
    let lacunas = 0;

    capitulo.verses.forEach((v, i) => {
      const marcadorId = Marcadores.do(versificacao, livro.code, capitulo.number, v.number);
      const marcador = marcadorId ? Marcadores.de(marcadorId) : null;

      const attrs = [
        `class="v${v.text ? '' : ' vazio'}"`,
        `data-vers="${v.number}"`,
        marcador ? `data-marcador="${marcadorId}"` : '',
        marcador ? `style="--marca:${this.corMarca(marcador.cor)}"` : '',
      ].filter(Boolean).join(' ');

      const capitular = comCapitular && i === 0
        ? `<span class="capitular">${capitulo.number}</span>`
        : '';

      const numero = (comCapitular && i === 0) ? '' : `<span class="n">${v.number}</span>`;

      if (!v.text) lacunas++;
      const texto = v.text
        ? this.escapar(v.text)
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

    const habilitadas = Prefs.get('versoesTirinha');
    const lista = [...new Set([versaoAtual, ...habilitadas])]
      .filter(c => Dados.versao(c))
      .sort();

    alvo.innerHTML = '<div class="estado">Reunindo as versões…</div>';

    const fitas = await Promise.all(lista.map(async code => {
      if (!Dados.temLivro(code, bookCode)) {
        return this.fita(code, null, `${Dados.nomeCurto(versaoAtual, bookCode)} não existe nesta versão.`, null);
      }
      const conv = Dados.referenciaEm(bookCode, capitulo, versaoAtual, code);
      try {
        const r = await Dados.capitulo(code, bookCode, conv.capitulo);
        if (!r) return this.fita(code, null, 'Capítulo não encontrado.', null);
        const v = r.capitulo.verses.find(x => x.number === versiculo);
        const refLocal = Dados.referencia(code, bookCode, conv.capitulo, versiculo);
        if (!v) return this.fita(code, refLocal, 'Versículo não encontrado.', conv);
        return this.fita(code, refLocal, v.text || '(sem texto na origem)', conv);
      } catch {
        return this.fita(code, null, 'Não foi possível abrir.', null);
      }
    }));

    alvo.innerHTML = fitas.join('');
  },

  fita(versaoCode, ref, texto, conv) {
    const nota = conv && !conv.exato
      ? `<div class="nota-numeracao">Numeração diferente: esta versão traz a
           passagem em ${ref}. ${this.escapar(conv.nota || '')}</div>`
      : '';
    return `<div class="fita">
      <div class="cabeca">
        <span class="sigla">${versaoCode}</span>
        ${ref ? `<span class="ref-fita">${ref}</span>` : ''}
      </div>
      <p>${this.escapar(texto)}</p>
      ${nota}
    </div>`;
  },
};
