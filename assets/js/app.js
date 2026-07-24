/* app.js — junta tudo.
 *
 * Estado minimo: qual versao, qual livro, qual capitulo. Toda passagem aberta
 * entra no historico sozinha; o botao Salvar so serve para dizer que uma
 * pregacao terminou.
 */

const App = {
  versao: 'ACF',
  code: 'GEN',
  cap: 1,
  destaque: null,
  comparando: false,

  /* ================================================================ inicio */

  async iniciar() {
    try {
      await Dados.iniciar();
    } catch (e) {
      await this.explicarFalha();
      return;
    }

    const p = Prefs.todas();
    this.versao = Dados.versao(p.versao) ? p.versao : Dados.versoes[0].code;
    Leitura.aplicarEscuro(p.escuro);
    Leitura.aplicarTemperatura(p.temperatura);
    Leitura.aplicarFonte(p.fonte);

    // retoma de onde parou
    const s = Sessoes.atual();
    const ultimo = s.itens[s.itens.length - 1];
    if (ultimo && Dados.versao(ultimo.versao)) {
      this.versao = ultimo.versao;
      this.code = ultimo.code;
      this.cap = ultimo.cap;
    }

    this.ligarEventos();
    // registra tambem a abertura: o historico nao pode ter buracos. Reabrir no
    // mesmo capitulo nao duplica, porque Sessoes.registrar ignora repetido.
    await this.ir(this.code, this.cap, null);
    this.registrarServico();
  },

  /* Quando os dados nao abrem, o app precisa dizer QUAL foi o problema.
   * Sao causas diferentes com solucoes diferentes, e uma mensagem generica
   * faz a pessoa tentar a correcao errada. */
  async explicarFalha() {
    const folha = document.getElementById('folha');
    const arquivos = [
      'data/meta/versoes.json',
      'data/meta/estrutura.json',
      'data/meta/numeracao.json',
    ];

    // Causa 1: aberto por duplo clique. O navegador bloqueia ler arquivos
    // vizinhos por seguranca, e nenhum ajuste de pasta resolve.
    if (location.protocol === 'file:') {
      folha.innerHTML = `<div class="estado" style="text-align:left;max-width:34rem;margin:0 auto">
        <p><strong>O aplicativo foi aberto por duplo clique.</strong></p>
        <p>Nesse modo o navegador se recusa a ler os arquivos da Bíblia, por
        segurança. Não é problema de pasta — precisa de um servidor.</p>
        <p>Abra o terminal <em>na pasta onde está o index.html</em> e rode:</p>
        <p><code>python -m http.server 8000</code></p>
        <p>Depois acesse <code>http://localhost:8000</code> no navegador.</p>
        <p style="color:var(--tinta-fraca)">Endereço atual: <code>${location.href}</code></p>
      </div>`;
      return;
    }

    // Causa 2: servidor de pe, mas a pasta data nao esta ao lado do index.html
    const situacao = await Promise.all(arquivos.map(async caminho => {
      try {
        const r = await fetch(caminho);
        if (!r.ok) return { caminho, estado: r.status === 404 ? 'não encontrado' : 'erro ' + r.status };
        await r.json();
        return { caminho, estado: 'ok' };
      } catch {
        return { caminho, estado: 'conteúdo inválido' };
      }
    }));

    const faltando = situacao.filter(s => s.estado !== 'ok');
    const raiz = location.href.replace(/[^/]*$/, '');

    folha.innerHTML = `<div class="estado" style="text-align:left;max-width:34rem;margin:0 auto">
      <p><strong>O servidor está funcionando, mas a pasta <code>data</code> não
      está onde o aplicativo procura.</strong></p>
      <p>O <code>data</code> precisa ficar na mesma pasta do <code>index.html</code>:</p>
      <p><code>index.html</code><br><code>assets/</code><br><code>data/meta/versoes.json</code></p>
      <p>Situação de cada arquivo:</p>
      <ul style="padding-left:18px;margin:6px 0">
        ${situacao.map(s => `<li><code>${s.caminho}</code> — ${s.estado}</li>`).join('')}
      </ul>
      ${faltando.length === arquivos.length
        ? `<p>Nenhum foi encontrado. O mais provável é que você tenha subido o
           servidor de uma pasta acima ou abaixo. Ele precisa ser aberto
           exatamente onde está o <code>index.html</code>.</p>`
        : `<p>Alguns abriram e outros não — confira os nomes dos arquivos que
           faltam, dentro de <code>data/meta</code>.</p>`}
      <p style="color:var(--tinta-fraca)">O aplicativo está procurando a partir de
      <code>${raiz}</code></p>
    </div>`;
  },

  /* ============================================================== navegar */

  async ir(code, cap, vers, { registrar = true } = {}) {
    const folha = document.getElementById('folha');
    folha.innerHTML = '<div class="estado">Abrindo…</div>';

    let r;
    try {
      r = await Dados.capitulo(this.versao, code, cap);
    } catch {
      folha.innerHTML = `<div class="estado">
        Não foi possível abrir ${Dados.nomeCurto(this.versao, code)} ${cap}.</div>`;
      return;
    }
    if (!r) {
      folha.innerHTML = `<div class="estado">
        ${Dados.nomeCurto(this.versao, code)} não tem capítulo ${cap} nesta versão.</div>`;
      return;
    }

    this.code = code;
    this.cap = cap;
    this.destaque = vers || null;

    folha.innerHTML = `<p class="titulo-livro">${Leitura.escapar(r.livro.name)}</p>`
      + Leitura.html(this.versao, r.livro, r.capitulo);

    this.atualizarBarra();
    window.scrollTo(0, 0);

    if (vers) {
      const alvo = folha.querySelector(`.v[data-vers="${vers}"]`);
      if (alvo) {
        alvo.classList.add('foco');
        alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    if (registrar) {
      const primeiro = r.capitulo.verses.find(v => v.text);
      Sessoes.registrar({
        versao: this.versao,
        code, cap, vers: vers || null,
        trecho: (primeiro ? primeiro.text : '').slice(0, 90),
      });
    }

    if (this.comparando) this.desenharComparacao();
  },

  atualizarBarra() {
    document.getElementById('btn-ref').textContent =
      Dados.referencia(this.versao, this.code, this.cap);
    document.getElementById('sigla-versao').textContent = this.versao;

    const info = Dados.infoLivro(this.versao, this.code);
    const temAntes = this.cap > 1 || Dados.vizinho(this.versao, this.code, -1);
    const temDepois = (info && this.cap < info.chapters) || Dados.vizinho(this.versao, this.code, 1);
    document.getElementById('btn-antes').disabled = !temAntes;
    document.getElementById('btn-depois').disabled = !temDepois;
  },

  async passo(dir) {
    const info = Dados.infoLivro(this.versao, this.code);
    let cap = this.cap + dir;

    if (info && cap >= 1 && cap <= info.chapters) return this.ir(this.code, cap);

    const vizinho = Dados.vizinho(this.versao, this.code, dir);
    if (!vizinho) return;
    const infoV = Dados.infoLivro(this.versao, vizinho);
    return this.ir(vizinho, dir > 0 ? 1 : (infoV ? infoV.chapters : 1));
  },

  async trocarVersao(code) {
    const de = this.versao;
    const conv = Dados.referenciaEm(this.code, this.cap, de, code);

    // um filtro de busca preso numa categoria que a versao nova nao tem
    // devolveria zero resultados sem explicar por que
    if (Dados.canoneDe(de) !== Dados.canoneDe(code)) {
      Busca.escopo = { tipo: 'tudo', id: null, nome: 'Toda a Bíblia' };
    }

    if (!Dados.temLivro(code, this.code)) {
      this.versao = code;
      Prefs.set('versao', code);
      this.fecharPaineis();
      return this.ir('GEN', 1);
    }

    this.versao = code;
    Prefs.set('versao', code);
    this.fecharPaineis();
    await this.ir(this.code, conv.capitulo);

    if (!conv.exato) {
      this.avisar(`As duas numerações não batem aqui. ${conv.nota || ''}`);
    }
  },

  avisar(texto) {
    const folha = document.getElementById('folha');
    const p = document.createElement('p');
    p.className = 'aviso-lacuna';
    p.textContent = texto;
    folha.insertBefore(p, folha.children[1] || null);
  },

  /* ============================================================== painéis */

  abrir(id) {
    this.fecharPaineis();
    document.getElementById(id).classList.add('aberto');
    document.getElementById(id).setAttribute('aria-hidden', 'false');
    document.getElementById('veu').classList.add('aberto');
  },

  fecharPaineis() {
    document.querySelectorAll('.painel').forEach(p => {
      p.classList.remove('aberto');
      p.setAttribute('aria-hidden', 'true');
    });
    document.getElementById('veu').classList.remove('aberto');
    this.fecharTirinha();
  },

  fecharTirinha() {
    document.getElementById('tirinha').classList.remove('aberta');
    document.getElementById('tirinha').setAttribute('aria-hidden', 'true');
  },

  /* =============================================================== árvore */

  desenharArvore() {
    const corpo = document.getElementById('corpo-arvore');
    const arv = Dados.arvore(this.versao);
    const partes = [];

    for (const t of arv.testaments) {
      partes.push(`<div class="grupo"><h3>${t.name}</h3>`);
      for (const c of t.categories) {
        partes.push(`<div class="grupo" style="margin-bottom:14px"><h3
          style="opacity:.8">${c.name}</h3>`);
        for (const b of c.books) {
          const selo = b.deuterocanonical
            ? '<span class="selo">Deutero</span>'
            : (b.deutero_sections ? '<span class="selo">Cap. extras</span>' : '');
          partes.push(`<button class="linha ${b.code === this.code ? 'ativa' : ''}"
            data-livro="${b.code}">
            <span>${b.name}</span>${selo}
            <span class="sub">${b.chapters || ''}</span>
          </button>`);
        }
        partes.push('</div>');
      }
      partes.push('</div>');
    }

    corpo.innerHTML = partes.join('');
    document.getElementById('titulo-arvore').textContent = 'Livros';

    corpo.querySelectorAll('[data-livro]').forEach(el => {
      el.onclick = () => this.desenharCapitulos(el.dataset.livro);
    });
  },

  desenharCapitulos(code) {
    const corpo = document.getElementById('corpo-arvore');
    const info = Dados.infoLivro(this.versao, code);
    const n = info ? info.chapters : 0;
    const deutero = info && info.deutero_sections ? info.deutero_sections.chapters : null;

    const botoes = [];
    for (let i = 1; i <= n; i++) {
      const ehDeutero = deutero && i >= deutero[0] && i <= deutero[1];
      botoes.push(`<button data-cap="${i}"
        class="${i === this.cap && code === this.code ? 'ativa' : ''} ${ehDeutero ? 'deutero' : ''}"
        ${ehDeutero ? 'title="Capítulo deuterocanônico"' : ''}>${i}</button>`);
    }

    const nota = deutero
      ? `<p class="contagem" style="margin-top:14px">Os capítulos com contorno
         tracejado são deuterocanônicos: ${info.deutero_sections.nota}.
         Não existem nas versões protestantes.</p>`
      : '';

    corpo.innerHTML = `
      <button class="linha" id="voltar-livros" style="margin-bottom:12px">
        ← Todos os livros</button>
      <div class="grupo"><h3>${info ? info.name : code}</h3>
      <div class="grade">${botoes.join('')}</div>${nota}</div>`;

    document.getElementById('titulo-arvore').textContent = info ? info.name : code;
    document.getElementById('voltar-livros').onclick = () => this.desenharArvore();
    corpo.querySelectorAll('[data-cap]').forEach(el => {
      el.onclick = () => {
        this.fecharPaineis();
        this.ir(code, +el.dataset.cap);
      };
    });
  },

  /* ============================================================== versões */

  desenharVersoes() {
    const corpo = document.getElementById('corpo-versao');
    const porCanone = { protestant: [], catholic: [] };
    Dados.versoes.forEach(v => porCanone[v.canon].push(v));

    const bloco = (titulo, lista) => lista.length ? `<div class="grupo">
      <h3>${titulo}</h3>
      ${lista.map(v => `<button class="linha ${v.code === this.versao ? 'ativa' : ''}"
        data-versao="${v.code}">
        <span class="sigla" style="border-color:currentColor">${v.code}</span>
        <span>${v.name}</span>
        <span class="sub">${v.year || ''}</span>
      </button>`).join('')}
    </div>` : '';

    corpo.innerHTML =
      bloco('Protestantes', porCanone.protestant) +
      bloco('Católica', porCanone.catholic);

    corpo.querySelectorAll('[data-versao]').forEach(el => {
      el.onclick = () => this.trocarVersao(el.dataset.versao);
    });
  },

  /* ================================================================ busca */

  desenharFiltros() {
    const alvo = document.getElementById('filtros-busca');
    const arv = Dados.arvore(this.versao);
    const opcoes = [{ tipo: 'tudo', id: null, nome: 'Toda a Bíblia' }];

    arv.testaments.forEach(t => {
      opcoes.push({ tipo: 'testamento', id: t.id, nome: t.name });
      t.categories.forEach(c => opcoes.push({ tipo: 'categoria', id: c.id, nome: c.name }));
    });
    opcoes.push({ tipo: 'livro', id: this.code, nome: Dados.nomeCurto(this.versao, this.code) });

    alvo.innerHTML = opcoes.map((o, i) => `<button class="pilula
      ${o.tipo === Busca.escopo.tipo && o.id === Busca.escopo.id ? 'ativa' : ''}"
      data-i="${i}">${o.nome}</button>`).join('');

    alvo.querySelectorAll('[data-i]').forEach(el => {
      el.onclick = () => {
        Busca.escopo = opcoes[+el.dataset.i];
        this.desenharFiltros();
        this.rodarBusca();
      };
    });
  },

  async rodarBusca() {
    const termo = document.getElementById('campo-busca').value;
    const alvo = document.getElementById('resultados-busca');
    Busca.cancelar();

    if (termo.trim().length < 2) {
      alvo.innerHTML = `<div class="estado">Digite ao menos duas letras.</div>`;
      return;
    }

    
    alvo.innerHTML = '<div class="contagem" id="progresso-busca">Procurando…</div>'
      + '<div id="lista-resultados"></div>';
    const lista = document.getElementById('lista-resultados');
    const prog = document.getElementById('progresso-busca');

    const r = await Busca.procurar(this.versao, termo,
      (i, n, nome) => { prog.textContent = `Procurando em ${nome} — ${i} de ${n}`; },
      (achados, alvoNorm) => {
        lista.insertAdjacentHTML('beforeend', achados.map(a => `
          <button class="resultado" data-code="${a.code}" data-cap="${a.cap}" data-vers="${a.vers}">
            <span class="ref-res">${Leitura.escapar(a.nome)} ${a.cap}:${a.vers}</span>
            <span class="trecho">${Busca.realcar(a.texto, alvoNorm)}</span>
          </button>`).join(''));
      });

    if (r.cancelado) return;
    prog.textContent = r.total
      ? `${r.total} ocorrência${r.total > 1 ? 's' : ''} em ${Busca.escopo.nome}`
      : '';
    if (!r.total) {
      lista.innerHTML = `<div class="estado">Nada encontrado em
        ${Busca.escopo.nome}.<br>Tente outra palavra ou amplie o filtro.</div>`;
    }

    lista.querySelectorAll('.resultado').forEach(el => {
      el.onclick = () => {
        this.fecharPaineis();
        this.ir(el.dataset.code, +el.dataset.cap, +el.dataset.vers);
      };
    });
  },

  /* ============================================================ histórico */

  desenharHistorico() {
    const corpo = document.getElementById('corpo-historico');
    const sessoes = Sessoes.todas().slice().reverse();

    const cabecalho = `
      <button class="botao" id="btn-salvar-sessao" style="width:100%">
        Salvar esta pregação e começar outra</button>
      <p class="contagem" style="margin-top:8px">O histórico grava sozinho e
      nunca apaga nada. Salvar apenas fecha a pregação atual e abre uma folha limpa.</p>`;

    const blocos = sessoes.map(s => {
      if (!s.itens.length && !s.aberta) return '';
      const itens = s.itens.slice().reverse().map((it, i) => {
        const hora = new Date(it.hora).toLocaleTimeString('pt-BR',
          { hour: '2-digit', minute: '2-digit' });
        const ref = `${Dados.nomeCurto(it.versao, it.code)} ${it.cap}${it.vers ? ':' + it.vers : ''}`;
        return `<button class="item-hist" data-s="${s.id}" data-i="${s.itens.length - 1 - i}">
          <span class="hora">${hora}</span>
          <span class="ref-hist">${ref}</span>
          <span class="sigla" style="font-size:10px;padding:1px 4px">${it.versao}</span>
          <span class="trecho-hist">${Leitura.escapar(it.trecho || '')}</span>
        </button>`;
      }).join('');

      return `<div class="sessao-cabeca">
          <h3>${Leitura.escapar(Sessoes.nomeDe(s))}</h3>
          ${s.aberta ? '<span class="marca-aberta">Em andamento</span>' : ''}
          <button class="pilula" data-renomear="${s.id}" style="font-size:11px">Renomear</button>
        </div>
        ${itens || '<p class="contagem">Nenhuma passagem ainda.</p>'}`;
    }).join('');

    corpo.innerHTML = cabecalho + blocos;

    document.getElementById('btn-salvar-sessao').onclick = () => {
      const nome = prompt('Nome desta pregação (opcional):', '');
      if (nome === null) return;
      Sessoes.salvar(nome.trim());
      this.desenharHistorico();
    };

    corpo.querySelectorAll('[data-renomear]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const id = el.dataset.renomear;
        const s = Sessoes.todas().find(x => x.id === id);
        const nome = prompt('Nome desta pregação:', s ? s.nome : '');
        if (nome === null) return;
        Sessoes.renomear(id, nome.trim());
        this.desenharHistorico();
      };
    });

    corpo.querySelectorAll('.item-hist').forEach(el => {
      el.onclick = () => {
        const s = Sessoes.todas().find(x => x.id === el.dataset.s);
        const it = s.itens[+el.dataset.i];
        this.fecharPaineis();
        if (it.versao !== this.versao) {
          this.versao = it.versao;
          Prefs.set('versao', it.versao);
        }
        this.ir(it.code, it.cap, it.vers);
      };
    });
  },

  /* ============================================================== ajustes */

  desenharAjustes() {
    const corpo = document.getElementById('corpo-ajustes');
    const p = Prefs.todas();

    corpo.innerHTML = `
      <div class="grupo">
        <h3>Folha</h3>
        <div class="rotulo-controle"><span>Temperatura do papel</span>
          <span id="rot-temp">${p.temperatura}</span></div>
        <input class="deslizador" type="range" id="ctrl-temp" min="0" max="100" value="${p.temperatura}">
        <div class="amostra-folha" id="amostra">No princípio, Deus criou o céu e a terra.</div>

        <div class="rotulo-controle" style="margin-top:20px"><span>Tamanho da letra</span>
          <span id="rot-fonte">${p.fonte}px</span></div>
        <input class="deslizador" type="range" id="ctrl-fonte" min="15" max="34" value="${p.fonte}">

        <label class="interruptor"><span>Modo escuro</span>
          <input type="checkbox" id="ctrl-escuro" ${p.escuro ? 'checked' : ''}></label>
        ${p.escuro ? '<p class="contagem">A temperatura do papel só vale no modo claro.</p>' : ''}
      </div>

      <div class="grupo">
        <h3>Comparar</h3>
        <p class="contagem">Versão que aparece na metade de baixo.</p>
        <select class="campo" id="ctrl-comparar">
          ${Dados.versoes.map(v => `<option value="${v.code}"
            ${v.code === p.versaoComparar ? 'selected' : ''}>${Dados.rotulo(v.code)}</option>`).join('')}
        </select>
      </div>

      <div class="grupo">
        <h3>Versões da tirinha</h3>
        <p class="contagem">Ao tocar num versículo, ele aparece empilhado nestas versões.</p>
        ${Dados.versoes.map(v => `<label class="interruptor">
          <span><span class="sigla">${v.code}</span> ${v.name}</span>
          <input type="checkbox" data-tirinha="${v.code}"
            ${p.versoesTirinha.includes(v.code) ? 'checked' : ''}></label>`).join('')}
      </div>

      <div class="grupo">
        <h3>Marcadores</h3>
        <p class="contagem">Trocar a cor aqui recolore de uma vez todos os
        versículos ligados àquele marcador.</p>
        ${Marcadores.lista().map(m => `<div class="item-marcador">
          <input type="color" value="${m.cor}" data-cor="${m.id}">
          <input type="text" class="campo" value="${Leitura.escapar(m.nome)}" data-nome="${m.id}">
          <span class="sub">${Marcadores.porMarcador(m.id).length}</span>
        </div>`).join('')}
      </div>

      <div class="grupo">
        <h3>Armazenamento</h3>
        <p class="contagem">${Guarda.persistente()
          ? 'O histórico e os marcadores estão sendo gravados neste dispositivo.'
          : 'Atenção: este navegador não está permitindo gravar. O histórico vai durar só até fechar o aplicativo.'}</p>
      </div>`;

    const temp = document.getElementById('ctrl-temp');
    const amostra = document.getElementById('amostra');
    const pintarAmostra = () => {
      amostra.style.background = getComputedStyle(document.documentElement).getPropertyValue('--papel');
      amostra.style.color = getComputedStyle(document.documentElement).getPropertyValue('--tinta');
    };
    pintarAmostra();

    temp.oninput = () => {
      document.getElementById('rot-temp').textContent = temp.value;
      Leitura.aplicarTemperatura(+temp.value);
      pintarAmostra();
    };
    temp.onchange = () => Prefs.set('temperatura', +temp.value);

    const fonte = document.getElementById('ctrl-fonte');
    fonte.oninput = () => {
      document.getElementById('rot-fonte').textContent = fonte.value + 'px';
      Leitura.aplicarFonte(+fonte.value);
    };
    fonte.onchange = () => Prefs.set('fonte', +fonte.value);

    document.getElementById('ctrl-escuro').onchange = e => {
      Prefs.set('escuro', e.target.checked);
      Leitura.aplicarEscuro(e.target.checked);
      this.desenharAjustes();
    };

    document.getElementById('ctrl-comparar').onchange = e => {
      Prefs.set('versaoComparar', e.target.value);
      if (this.comparando) this.desenharComparacao();
    };

    corpo.querySelectorAll('[data-tirinha]').forEach(el => {
      el.onchange = () => {
        const atuais = Prefs.get('versoesTirinha');
        const code = el.dataset.tirinha;
        const novo = el.checked
          ? [...new Set([...atuais, code])]
          : atuais.filter(c => c !== code);
        Prefs.set('versoesTirinha', novo);
      };
    });

    corpo.querySelectorAll('[data-cor]').forEach(el => {
      el.onchange = () => {
        Marcadores.atualizar(+el.dataset.cor, { cor: el.value });
        this.ir(this.code, this.cap, this.destaque, { registrar: false });
      };
    });

    corpo.querySelectorAll('[data-nome]').forEach(el => {
      el.onchange = () => Marcadores.atualizar(+el.dataset.nome, { nome: el.value });
    });
  },

  /* =========================================================== comparação */

  async alternarComparacao() {
    this.comparando = !this.comparando;
    document.body.classList.toggle('comparando', this.comparando);
    if (this.comparando) await this.desenharComparacao();
  },

  async desenharComparacao() {
    const a = document.getElementById('metade-a');
    const b = document.getElementById('metade-b');
    const outra = Prefs.get('versaoComparar');

    a.innerHTML = '<div class="estado">Abrindo…</div>';
    b.innerHTML = '<div class="estado">Abrindo…</div>';

    const montar = async (alvo, versaoCode, capitulo, nota) => {
      if (!Dados.temLivro(versaoCode, this.code)) {
        alvo.innerHTML = `<div class="cabeca-metade"><span class="sigla">${versaoCode}</span></div>
          <div class="estado">${Dados.nomeCurto(this.versao, this.code)} não existe nesta versão.</div>`;
        return;
      }
      const r = await Dados.capitulo(versaoCode, this.code, capitulo);
      if (!r) {
        alvo.innerHTML = `<div class="cabeca-metade"><span class="sigla">${versaoCode}</span></div>
          <div class="estado">Capítulo não encontrado.</div>`;
        return;
      }
      alvo.innerHTML = `<div class="cabeca-metade">
          <span class="sigla">${versaoCode}</span>
          <span>${Leitura.escapar(r.livro.name)} ${capitulo}</span>
          ${nota ? `<span style="color:var(--rubrica)">${nota}</span>` : ''}
        </div>` + Leitura.html(versaoCode, r.livro, r.capitulo, { comCapitular: false });
    };

    const conv = Dados.referenciaEm(this.code, this.cap, this.versao, outra);
    await montar(a, this.versao, this.cap, null);
    await montar(b, outra, conv.capitulo,
      conv.exato ? null : 'numeração diferente');

    this.sincronizarRolagem(a, b);
  },

  sincronizarRolagem(a, b) {
    let travado = false;
    const liga = (de, para) => {
      de.onscroll = () => {
        if (travado) return;
        travado = true;
        const max = de.scrollHeight - de.clientHeight;
        const prop = max > 0 ? de.scrollTop / max : 0;
        para.scrollTop = prop * (para.scrollHeight - para.clientHeight);
        requestAnimationFrame(() => { travado = false; });
      };
    };
    liga(a, b);
    liga(b, a);
  },

  /* ============================================================== eventos */

  ligarEventos() {
    const q = id => document.getElementById(id);

    q('btn-arvore').onclick = () => { this.desenharArvore(); this.abrir('painel-arvore'); };
    q('btn-ref').onclick = () => { this.desenharCapitulos(this.code); this.abrir('painel-arvore'); };
    q('btn-versao').onclick = () => { this.desenharVersoes(); this.abrir('painel-versao'); };
    q('btn-historico').onclick = () => { this.desenharHistorico(); this.abrir('painel-historico'); };
    q('btn-ajustes').onclick = () => { this.desenharAjustes(); this.abrir('painel-ajustes'); };
    q('btn-comparar').onclick = () => this.alternarComparacao();
    q('btn-antes').onclick = () => this.passo(-1);
    q('btn-depois').onclick = () => this.passo(1);

    q('btn-busca').onclick = () => {
      this.desenharFiltros();
      this.abrir('painel-busca');
      setTimeout(() => q('campo-busca').focus(), 220);
    };

    let atraso;
    q('campo-busca').oninput = () => {
      clearTimeout(atraso);
      Busca.cancelar();
      atraso = setTimeout(() => this.rodarBusca(), 320);
    };

    q('veu').onclick = () => this.fecharPaineis();
    document.querySelectorAll('[data-fechar]').forEach(el => {
      el.onclick = () => this.fecharPaineis();
    });
    document.querySelector('[data-fechar-tirinha]').onclick = () => this.fecharTirinha();

    // tocar num versículo abre a tirinha
    q('folha').onclick = e => {
      const v = e.target.closest('.v');
      if (!v) return;
      const vers = +v.dataset.vers;
      this.destaque = vers;
      q('folha').querySelectorAll('.v.foco').forEach(x => x.classList.remove('foco'));
      v.classList.add('foco');
      Leitura.tirinha(this.code, this.cap, vers, this.versao);
      q('tirinha').classList.add('aberta');
      q('tirinha').setAttribute('aria-hidden', 'false');
    };

    q('tirinha-marcar').onclick = () => this.escolherMarcador();

    document.onkeydown = e => {
      if (e.target.matches('input, select, textarea')) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === 'Escape') this.fecharPaineis();
      if (e.key === 'ArrowLeft') this.passo(-1);
      if (e.key === 'ArrowRight') this.passo(1);
      if (e.key === '/') { e.preventDefault(); q('btn-busca').click(); }
    };
  },

  /* =========================================================== marcadores */

  escolherMarcador() {
    const corpo = document.getElementById('tirinha-corpo');
    const versificacao = Dados.versificacaoDe(this.versao);
    const atual = Marcadores.do(versificacao, this.code, this.cap, this.destaque);

    corpo.innerHTML = `<div class="grupo" style="padding-top:8px">
      <h3>Marcar este versículo</h3>
      <div class="faixa-marcadores">
        ${Marcadores.lista().map(m => `<button data-m="${m.id}"
          class="${m.id === atual ? 'ativa' : ''}"
          style="background:${m.cor}" title="${Leitura.escapar(m.nome)}"></button>`).join('')}
      </div>
      <p class="contagem" style="margin-top:12px">Um marcador por versículo.
      Tocar no mesmo marcador de novo remove a marca.</p>
      <button class="botao secundario" id="voltar-tirinha" style="width:100%;margin-top:8px">
        Voltar às versões</button>
    </div>`;

    corpo.querySelectorAll('[data-m]').forEach(el => {
      el.onclick = () => {
        Marcadores.alternar(versificacao, this.code, this.cap, this.destaque, +el.dataset.m);
        this.ir(this.code, this.cap, this.destaque, { registrar: false });
        this.fecharTirinha();
      };
    });

    document.getElementById('voltar-tirinha').onclick = () =>
      Leitura.tirinha(this.code, this.cap, this.destaque, this.versao);
  },

  /* ================================================================== PWA */

  registrarServico() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.iniciar());
