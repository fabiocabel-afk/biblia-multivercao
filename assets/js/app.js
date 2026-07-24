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
    Leitura.aplicarModoVersiculo(p.versiculoPorLinha);

    // retoma de onde parou: o livro fixado tem prioridade; senão, o último
    // lugar visitado no histórico
    const fix = Historico.fixado();
    const ultimo = Historico.lista()[0];
    if (fix && Dados.versao(fix.versao) && Dados.temLivro(fix.versao, fix.code)) {
      this.versao = fix.versao;
      this.code = fix.code;
      this.cap = fix.cap || 1;
    } else if (ultimo && Dados.versao(ultimo.versao)) {
      this.versao = ultimo.versao;
      this.code = ultimo.code;
      this.cap = ultimo.cap;
    }

    this.ligarEventos();
    // registra também a abertura: reabrir no mesmo lugar não duplica, porque o
    // Histórico traz a visita repetida para o topo em vez de acrescentar outra.
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
      Historico.registrar({
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

  /* Sanfona: abre um por vez, para a lista nao virar um paredao de 66 livros.
   * Guarda qual testamento e qual categoria estao abertos. */
  dobraT: undefined,   // undefined = nunca abriu; null = a pessoa fechou
  dobraC: null,

  /** Quantos capitulos tem um conjunto de livros. Fica visivel sempre. */
  somaCapitulos(livros) {
    return livros.reduce((n, b) => n + (b.chapters || 0), 0);
  },

  rotuloSoma(n) {
    return `${n} cap.`;
  },

  linhaLivro(b) {
    const selo = b.deuterocanonical
      ? '<span class="selo">Deutero</span>'
      : (b.deutero_sections ? '<span class="selo">Cap. extras</span>' : '');
    return `<button class="linha ${b.code === this.code ? 'ativa' : ''}"
      data-livro="${b.code}">
      <span>${b.name}</span>${selo}
      <span class="sub">${b.chapters || ''}</span>
    </button>`;
  },

  desenharArvore() {
    const corpo = document.getElementById('corpo-arvore');
    const arv = Dados.arvore(this.versao);
    const comCategorias = Prefs.get('mostrarCategorias');

    // so na primeirissima vez o app escancara onde o leitor esta agora.
    // Depois disso, fechado e fechado — se a pessoa recolheu o Testamento, e
    // porque queria o outro subindo para perto do dedo.
    if (this.dobraT === undefined) {
      const atual = Dados.infoLivro(this.versao, this.code);
      this.dobraT = atual ? atual.testament : arv.testaments[0].id;
      this.dobraC = atual ? atual.category : null;
    }

    const partes = [];

    for (const t of arv.testaments) {
      const livrosT = t.categories.flatMap(c => c.books);
      const abertoT = this.dobraT === t.id;

      partes.push(`<button class="dobra testamento" data-t="${t.id}"
        aria-expanded="${abertoT}">
        <span class="seta">▶</span>
        <span>${t.name}</span>
        <span class="soma">${this.rotuloSoma(this.somaCapitulos(livrosT))}</span>
      </button>`);

      partes.push(`<div class="dentro ${abertoT ? '' : 'fechada'}">`);

      for (const c of t.categories) {
        if (comCategorias) {
          const somaC = this.rotuloSoma(this.somaCapitulos(c.books));
          const abertoC = abertoT && this.dobraC === c.id;
          partes.push(`<button class="dobra categoria" data-c="${c.id}"
            aria-expanded="${abertoC}">
            <span class="seta">▶</span>
            <span>${c.name}</span>
            <span class="soma">${somaC}</span>
          </button>`);
          partes.push(`<div class="dentro ${abertoC ? '' : 'fechada'}">`);
          partes.push(c.books.map(b => this.linhaLivro(b)).join(''));
          partes.push('</div>');
        } else {
          // flag desligado: os livros vem direto, sem nomenclatura nenhuma
          partes.push(c.books.map(b => this.linhaLivro(b)).join(''));
        }
      }

      partes.push('</div>');
    }

    corpo.innerHTML = partes.join('');
    document.getElementById('titulo-arvore').textContent = 'Livros';

    corpo.querySelectorAll('[data-t]').forEach(el => {
      el.onclick = () => {
        // abrir um fecha o outro
        this.dobraT = this.dobraT === el.dataset.t ? null : el.dataset.t;
        this.dobraC = null;
        this.desenharArvore();
      };
    });

    corpo.querySelectorAll('[data-c]').forEach(el => {
      el.onclick = () => {
        this.dobraC = this.dobraC === el.dataset.c ? null : el.dataset.c;
        this.desenharArvore();
      };
    });

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

  /* A mesma lista de versões serve em três lugares: o painel principal, os
   * Ajustes e a troca direta dentro da comparação. Uma só aparência, para a
   * pessoa reconhecer na hora onde quer que ela apareça. */
  htmlListaVersoes(selecionada, atributo = 'data-versao') {
    const porCanone = { protestant: [], catholic: [] };
    Dados.versoes.forEach(v => porCanone[v.canon].push(v));

    const bloco = (titulo, lista) => lista.length ? `<div class="grupo">
      <h3>${titulo}</h3>
      ${lista.map(v => `<button class="linha ${v.code === selecionada ? 'ativa' : ''}"
        ${atributo}="${v.code}">
        <span class="sigla" style="border-color:currentColor">${v.code}</span>
        <span>${v.name}</span>
        <span class="sub">${v.year || ''}</span>
      </button>`).join('')}
    </div>` : '';

    return bloco('Protestantes', porCanone.protestant)
         + bloco('Católica', porCanone.catholic);
  },

  desenharVersoes() {
    const corpo = document.getElementById('corpo-versao');
    const alvo = this.alvoVersao || 'principal';

    document.getElementById('titulo-versao').textContent =
      alvo === 'comparar' ? 'Versão de baixo' : 'Versões';

    corpo.innerHTML = this.htmlListaVersoes(
      alvo === 'comparar' ? Prefs.get('versaoComparar') : this.versao);

    corpo.querySelectorAll('[data-versao]').forEach(el => {
      el.onclick = () => {
        const code = el.dataset.versao;
        if (alvo === 'comparar') {
          // atalho: troca só a metade de baixo, sem sair da comparação
          Prefs.set('versaoComparar', code);
          this.alvoVersao = 'principal';
          this.fecharPaineis();
          if (this.comparando) this.desenharComparacao();
        } else {
          this.trocarVersao(code);
        }
      };
    });
  },

  /* ================================================================ busca */

  /* O funil de busca era uma tira comprida de pílulas — todas as categorias,
   * todos os testamentos, tudo à mostra o tempo todo, comendo a tela que os
   * resultados precisavam. Agora são três dobras: Toda a Bíblia, Por categoria
   * e Por livro. Abre uma por vez, e quando tudo está fechado sobra só uma
   * linha dizendo onde a busca vai acontecer. */
  dobraF: null,

  desenharFiltros() {
    const alvo = document.getElementById('filtros-busca');
    const arv = Dados.arvore(this.versao);
    const e = Busca.escopo;

    const marcado = (tipo, id) => e.tipo === tipo && e.id === id ? 'ativa' : '';

    const dobra = (id, titulo, dentro) => {
      const aberta = this.dobraF === id;
      return `<button class="dobra funil" data-f="${id}" aria-expanded="${aberta}">
          <span class="seta">▶</span><span>${titulo}</span>
        </button>
        <div class="dentro ${aberta ? '' : 'fechada'}">${dentro}</div>`;
    };

    const testamentos = `
      <button class="linha ${marcado('tudo', null)}" data-e="tudo|">
        <span>Toda a Bíblia</span></button>
      ${arv.testaments.map(t => `<button class="linha ${marcado('testamento', t.id)}"
        data-e="testamento|${t.id}"><span>${t.name}</span></button>`).join('')}`;

    const categorias = arv.testaments.flatMap(t => t.categories).map(c =>
      `<button class="linha ${marcado('categoria', c.id)}" data-e="categoria|${c.id}">
        <span>${c.name}</span></button>`).join('');

    const livros = Dados.livros(this.versao).map(b =>
      `<button class="linha ${marcado('livro', b.code)}" data-e="livro|${b.code}">
        <span>${b.name}</span><span class="sub">${b.chapters || ''}</span>
      </button>`).join('');

    alvo.innerHTML = `
      <button class="escopo-atual" id="abrir-funil">
        <span class="etiqueta">Buscar em</span>
        <span class="valor">${Leitura.escapar(e.nome)}</span>
        <span class="seta">${this.dobraF ? '▲' : '▼'}</span>
      </button>
      <div class="caixa-funil ${this.dobraF ? '' : 'fechada'}">
        ${dobra('tudo', 'Toda a Bíblia e Testamentos', testamentos)}
        ${dobra('categoria', 'Por categoria', categorias)}
        ${dobra('livro', 'Por livro', livros)}
      </div>`;

    document.getElementById('abrir-funil').onclick = () => {
      this.dobraF = this.dobraF ? null : 'tudo';
      this.desenharFiltros();
    };

    alvo.querySelectorAll('[data-f]').forEach(el => {
      el.onclick = () => {
        this.dobraF = this.dobraF === el.dataset.f ? null : el.dataset.f;
        this.desenharFiltros();
      };
    });

    alvo.querySelectorAll('[data-e]').forEach(el => {
      el.onclick = () => {
        const [tipo, id] = el.dataset.e.split('|');
        const nome = el.querySelector('span').textContent;
        Busca.escopo = { tipo, id: id || null, nome };
        this.dobraF = null;   // escolheu: recolhe e devolve a tela aos resultados
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
  /* ============================================================ histórico
   *
   * Trilha de migalhas: os últimos lugares visitados, o mais recente no topo.
   * Cada item leva de volta num toque e traz um xis para tirar da lista. No
   * alto fica o livro fixado, quando há um — o alfinete que acompanha o avanço.
   */

  desenharHistorico() {
    const corpo = document.getElementById('corpo-historico');
    const lista = Historico.lista();
    const fix = Historico.fixado();

    const partes = [];

    // ---- o livro fixado
    if (fix) {
      const ref = `${Dados.nomeCurto(fix.versao, fix.code)} ${fix.cap || 1}` +
        (fix.vers ? ':' + fix.vers : '');
      partes.push(`<div class="grupo">
        <h3>Livro fixado</h3>
        <div class="fixado-linha">
          <button class="linha ativa" id="ir-fixado" style="flex:1">
            <svg class="icone" style="width:16px;height:16px;stroke:var(--rubrica)"><use href="#i-fixar"/></svg>
            <span>${ref}</span>
            <span class="sub">${fix.versao}</span>
          </button>
          <button class="xis" id="desfixar" aria-label="Desafixar" title="Desafixar">
            <svg class="icone"><use href="#i-fechar"/></svg></button>
        </div>
        <p class="contagem">O ponto avança conforme você lê — sempre o versículo
        mais adiantado que você alcançou neste livro.</p>
      </div>`);
    }

    // ---- os últimos acessos
    partes.push('<div class="grupo"><h3>Últimos acessos</h3>');
    if (!lista.length) {
      partes.push('<p class="contagem">Nada ainda. Os lugares por onde você passar aparecem aqui.</p>');
    } else {
      partes.push(lista.map((it, i) => {
        const ref = `${Dados.nomeCurto(it.versao, it.code)} ${it.cap}` +
          (it.vers ? ':' + it.vers : '');
        const fixavel = !fix || fix.code !== it.code;
        return `<div class="hist-linha">
          <button class="item-hist" data-i="${i}">
            <span class="ref-hist">${ref}</span>
            <span class="sigla" style="font-size:10px;padding:1px 4px">${it.versao}</span>
            <span class="trecho-hist">${Leitura.escapar(it.trecho || '')}</span>
          </button>
          ${fixavel ? `<button class="xis fixar-item" data-fixar="${i}"
            aria-label="Fixar este livro" title="Fixar este livro">
            <svg class="icone"><use href="#i-fixar"/></svg></button>` : ''}
          <button class="xis remover-item" data-rem="${i}"
            aria-label="Remover" title="Remover">
            <svg class="icone"><use href="#i-fechar"/></svg></button>
        </div>`;
      }).join(''));
    }
    partes.push('</div>');

    corpo.innerHTML = partes.join('');

    const irFix = document.getElementById('ir-fixado');
    if (irFix) irFix.onclick = () => {
      this.fecharPaineis();
      if (fix.versao !== this.versao) { this.versao = fix.versao; Prefs.set('versao', fix.versao); }
      this.ir(fix.code, fix.cap || 1, fix.vers);
    };

    const desf = document.getElementById('desfixar');
    if (desf) desf.onclick = () => { Historico.desfixar(); this.desenharHistorico(); };

    corpo.querySelectorAll('[data-i]').forEach(el => {
      el.onclick = () => {
        const it = Historico.lista()[+el.dataset.i];
        this.fecharPaineis();
        if (it.versao !== this.versao) { this.versao = it.versao; Prefs.set('versao', it.versao); }
        this.ir(it.code, it.cap, it.vers);
      };
    });

    corpo.querySelectorAll('[data-rem]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        Historico.remover(+el.dataset.rem);
        this.desenharHistorico();
      };
    });

    corpo.querySelectorAll('[data-fixar]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const it = Historico.lista()[+el.dataset.fixar];
        Historico.fixar(it.versao, it.code, it.cap, it.vers);
        this.desenharHistorico();
      };
    });
  },

  /* ============================================================= estudos
   *
   * Trechos guardados de propósito, com nome. Nascem ao segurar um versículo e
   * escolher "Salvar estudo". Podem ser renomeados, copiados e compartilhados.
   */

  desenharEstudos() {
    const corpo = document.getElementById('corpo-estudos');
    const estudos = Estudos.todos();

    if (!estudos.length) {
      corpo.innerHTML = `<div class="estado">Nenhum estudo ainda.<br>
        Selecione um ou mais versículos e toque em <strong>Salvar estudo</strong>
        para guardar um trecho com nome.</div>`;
      return;
    }

    corpo.innerHTML = estudos.map(e => {
      const trechos = Estudos.trechosDe(e);
      const listaTrechos = trechos.map((t, i) => `<div class="trecho-estudo">
          <button class="ir-trecho" data-est="${e.id}" data-tr="${i}">
            <span class="est-ref">${Estudos.refDoTrecho(t)}</span>
            <span class="sigla" style="font-size:10px;padding:1px 4px">${t.versao}</span>
          </button>
          <button class="xis remover-trecho" data-est-rem="${e.id}" data-tr-rem="${i}"
            aria-label="Remover trecho" title="Remover trecho">
            <svg class="icone"><use href="#i-fechar"/></svg></button>
        </div>`).join('');

      return `<div class="cartao-estudo">
        <div class="estudo-cabeca">
          <strong>${Leitura.escapar(Estudos.nomeDe(e))}</strong>
          <span class="quando">${Estudos.quandoDe(e)}</span>
        </div>
        <div class="trechos-lista">${listaTrechos}</div>
        <div class="acoes-sessao">
          <button class="pilula" data-renomear="${e.id}">Renomear</button>
          <button class="pilula" data-partilhar="${e.id}">Compartilhar</button>
          <button class="pilula" data-copiar="${e.id}">Copiar</button>
          <button class="pilula perigo" data-remover="${e.id}">Excluir</button>
        </div>
      </div>`;
    }).join('');

    const achar = id => Estudos.todos().find(e => e.id === id);

    corpo.querySelectorAll('[data-est]').forEach(el => {
      el.onclick = () => {
        const e = achar(el.dataset.est);
        const t = Estudos.trechosDe(e)[+el.dataset.tr];
        this.fecharPaineis();
        if (t.versao !== this.versao) { this.versao = t.versao; Prefs.set('versao', t.versao); }
        this.ir(t.code, t.capInicio, t.versInicio);
      };
    });

    corpo.querySelectorAll('[data-est-rem]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        Estudos.removerTrecho(el.dataset.estRem, +el.dataset.trRem);
        this.desenharEstudos();
      };
    });

    corpo.querySelectorAll('[data-renomear]').forEach(el => {
      el.onclick = () => {
        const e = achar(el.dataset.renomear);
        const nome = prompt('Nome do estudo:', e ? Estudos.nomeDe(e) : '');
        if (nome === null) return;
        Estudos.renomear(el.dataset.renomear, nome.trim());
        this.desenharEstudos();
      };
    });

    corpo.querySelectorAll('[data-partilhar]').forEach(el => {
      el.onclick = async () => {
        const e = achar(el.dataset.partilhar);
        if (!e) return;
        const texto = await Estudos.comoTexto(e);
        if (navigator.share) {
          try { await navigator.share({ title: Estudos.nomeDe(e), text: texto }); }
          catch { /* desistiu */ }
        } else {
          await this.paraAreaDeTransferencia(texto);
          this.avisoRapido('Copiado — cole onde quiser');
        }
      };
    });

    corpo.querySelectorAll('[data-copiar]').forEach(el => {
      el.onclick = async () => {
        const e = achar(el.dataset.copiar);
        if (!e) return;
        await this.paraAreaDeTransferencia(await Estudos.comoTexto(e));
        this.avisoRapido('Estudo copiado');
      };
    });

    corpo.querySelectorAll('[data-remover]').forEach(el => {
      el.onclick = () => {
        const e = achar(el.dataset.remover);
        if (!confirm(`Excluir o estudo "${Estudos.nomeDe(e)}"?`)) return;
        Estudos.remover(el.dataset.remover);
        this.desenharEstudos();
      };
    });
  },

  /* Monta o trecho a partir da seleção, perguntando até onde vai. Devolve o
   * trecho pronto, ou null se a pessoa cancelou ou errou o formato. */
  montarTrechoDaSelecao() {
    const pedacos = this.selecao.pedacos;
    const capInicio = this.cap;
    const versInicio = pedacos[0].vers;

    const sugestao = `${this.cap}:${pedacos[pedacos.length - 1].vers}`;
    const ate = prompt(
      'Até onde vai o estudo? Use capítulo:versículo.\n' +
      'Pode avançar para o próximo capítulo, desde que no mesmo livro.',
      sugestao);
    if (ate === null) return null;

    const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(ate);
    if (!m) { this.avisoRapido('Formato inválido — use capítulo:versículo'); return null; }
    const capFim = +m[1], versFim = +m[2];

    const info = Dados.infoLivro(this.versao, this.code);
    const totalCaps = info ? info.chapters : capInicio;
    if (capFim < capInicio || capFim > totalCaps ||
        (capFim === capInicio && versFim < versInicio)) {
      this.avisoRapido('O fim precisa vir depois do início, no mesmo livro');
      return null;
    }

    return { versao: this.versao, code: this.code,
      capInicio, versInicio, capFim, versFim };
  },

  /* Ao tocar em "Salvar estudo", abre a escolha: um estudo novo, ou juntar a um
   * que já existe. Mostra a lista dos estudos anteriores logo ali na barra. */
  abrirSalvarEstudo() {
    if (!this.selecao) return;
    const caixa = document.getElementById('sel-cores');

    // se já estava aberto mostrando isto, recolhe
    if (!caixa.classList.contains('fechada') && caixa.dataset.modo === 'estudo') {
      caixa.classList.add('fechada');
      return;
    }

    const anteriores = Estudos.todos();
    caixa.dataset.modo = 'estudo';
    caixa.innerHTML = `
      <button class="opcao-estudo novo" data-novo="1">
        <span class="mais">+</span><span>Novo estudo</span>
      </button>
      ${anteriores.length ? '<div class="sep-estudos">ou juntar a um estudo</div>' : ''}
      ${anteriores.map(e => `<button class="opcao-estudo" data-juntar="${e.id}">
        <strong>${Leitura.escapar(Estudos.nomeDe(e))}</strong>
        <span class="est-ref">${Estudos.refDe(e)}</span>
      </button>`).join('')}`;

    caixa.classList.remove('fechada');

    caixa.querySelector('[data-novo]').onclick = () => {
      const trecho = this.montarTrechoDaSelecao();
      if (!trecho) return;
      const nome = prompt('Nome do novo estudo (opcional):', '');
      if (nome === null) return;
      Estudos.criar({ nome: nome.trim(), trecho });
      this.fecharSelecao();
      this.avisoRapido('Estudo criado');
    };

    caixa.querySelectorAll('[data-juntar]').forEach(el => {
      el.onclick = () => {
        const trecho = this.montarTrechoDaSelecao();
        if (!trecho) return;
        Estudos.acrescentar(el.dataset.juntar, trecho);
        this.fecharSelecao();
        this.avisoRapido('Adicionado ao estudo');
      };
    });
  },

  /* ============================================================== ajustes
   *
   * O painel ficou comprido demais para rolar. Agora cada assunto e uma dobra:
   * abre um por vez, e o resto fica recolhido.
   */

  dobraA: 'folha',

  secao(id, titulo, conteudo) {
    const aberta = this.dobraA === id;
    return `<button class="dobra secao" data-s="${id}" aria-expanded="${aberta}">
        <span class="seta">▶</span>
        <span>${titulo}</span>
      </button>
      <div class="dentro ${aberta ? '' : 'fechada'}">${conteudo}</div>`;
  },

  desenharAjustes() {
    const corpo = document.getElementById('corpo-ajustes');
    const p = Prefs.todas();

    const folha = `
      <div class="rotulo-controle"><span>Temperatura do papel</span>
        <span id="rot-temp">${p.temperatura}</span></div>
      <input class="deslizador" type="range" id="ctrl-temp" min="0" max="100" value="${p.temperatura}">
      <div class="amostra-folha" id="amostra">No princípio, Deus criou o céu e a terra.</div>

      <div class="rotulo-controle" style="margin-top:20px"><span>Tamanho da letra</span>
        <span id="rot-fonte">${p.fonte}px</span></div>
      <input class="deslizador" type="range" id="ctrl-fonte" min="15" max="34" value="${p.fonte}">

      <div class="rotulo-controle" style="margin-top:22px"><span>Exibição do versículo</span></div>
      <div class="escolha-dupla">
        <button data-modo="corrido" class="${p.versiculoPorLinha ? '' : 'ativa'}">
          <strong>Corrido</strong><span>Como numa Bíblia impressa</span></button>
        <button data-modo="linha" class="${p.versiculoPorLinha ? 'ativa' : ''}">
          <strong>Um por linha</strong><span>Número como cabeçalho</span></button>
      </div>

      <label class="interruptor"><span>Modo escuro</span>
        <input type="checkbox" id="ctrl-escuro" ${p.escuro ? 'checked' : ''}></label>
      ${p.escuro ? '<p class="contagem">A temperatura do papel só vale no modo claro.</p>' : ''}`;

    const livros = `
      <label class="interruptor"><span>Mostrar categorias</span>
        <input type="checkbox" id="ctrl-categorias" ${p.mostrarCategorias ? 'checked' : ''}></label>
      <p class="contagem">Ligado, o painel abre em três camadas: Testamento,
      categoria e livro — uma de cada vez. Desligado, os livros vêm direto sob
      cada Testamento, sem nomes de categoria.</p>`;

    const comparar = `
      <p class="contagem">Versão que aparece na metade de baixo. Dentro da
      comparação, tocar na sigla de cada metade também troca por ali mesmo.</p>
      ${this.htmlListaVersoes(p.versaoComparar, 'data-comparar')}`;

    const tirinha = `
      <p class="contagem">Ao abrir um versículo, ele aparece empilhado nestas versões.</p>
      ${Dados.versoes.map(v => `<label class="interruptor">
        <span><span class="sigla">${v.code}</span> ${v.name}</span>
        <input type="checkbox" data-tirinha="${v.code}"
          ${p.versoesTirinha.includes(v.code) ? 'checked' : ''}></label>`).join('')}`;

    const marcadores = `
      <p class="contagem">Trocar a cor aqui recolore de uma vez todos os
      trechos ligados àquele marcador.</p>
      ${Marcadores.lista().map(m => `<div class="item-marcador" data-item="${m.id}">
        <button class="bolha-cor" data-abrir-cor="${m.id}"
          style="background:${m.cor}" title="Escolher a cor"></button>
        <input type="text" class="campo" value="${Leitura.escapar(m.nome)}" data-nome="${m.id}">
        <span class="sub">${Marcadores.porMarcador(m.id).length}</span>
      </div>
      <div class="caixa-cor fechada" data-caixa="${m.id}"></div>`).join('')}`;

    const guarda = `<p class="contagem">${Guarda.persistente()
      ? 'O histórico e os marcadores estão sendo gravados neste dispositivo.'
      : 'Atenção: este navegador não está permitindo gravar. O histórico vai durar só até fechar o aplicativo.'}</p>`;

    corpo.innerHTML =
      this.secao('folha', 'Folha', folha) +
      this.secao('livros', 'Painel de livros', livros) +
      this.secao('comparar', 'Comparar', comparar) +
      this.secao('tirinha', 'Versões empilhadas', tirinha) +
      this.secao('marcadores', 'Marcadores', marcadores) +
      this.secao('guarda', 'Armazenamento', guarda);

    corpo.querySelectorAll('[data-s]').forEach(el => {
      el.onclick = () => {
        this.dobraA = this.dobraA === el.dataset.s ? null : el.dataset.s;
        this.desenharAjustes();
      };
    });

    this.ligarAjustes();
  },

  ligarAjustes() {
    const corpo = document.getElementById('corpo-ajustes');
    const achar = id => document.getElementById(id);

    const temp = achar('ctrl-temp');
    if (temp) {
      const amostra = achar('amostra');
      const pintar = () => {
        const s = getComputedStyle(document.documentElement);
        amostra.style.background = s.getPropertyValue('--papel');
        amostra.style.color = s.getPropertyValue('--tinta');
      };
      pintar();
      temp.oninput = () => {
        achar('rot-temp').textContent = temp.value;
        Leitura.aplicarTemperatura(+temp.value);
        pintar();
      };
      temp.onchange = () => Prefs.set('temperatura', +temp.value);
    }

    const fonte = achar('ctrl-fonte');
    if (fonte) {
      fonte.oninput = () => {
        achar('rot-fonte').textContent = fonte.value + 'px';
        Leitura.aplicarFonte(+fonte.value);
      };
      fonte.onchange = () => Prefs.set('fonte', +fonte.value);
    }

    corpo.querySelectorAll('[data-modo]').forEach(el => {
      el.onclick = () => {
        const porLinha = el.dataset.modo === 'linha';
        Prefs.set('versiculoPorLinha', porLinha);
        Leitura.aplicarModoVersiculo(porLinha);
        this.desenharAjustes();
        this.ir(this.code, this.cap, null, { registrar: false });
      };
    });

    const escuro = achar('ctrl-escuro');
    if (escuro) escuro.onchange = e => {
      Prefs.set('escuro', e.target.checked);
      Leitura.aplicarEscuro(e.target.checked);
      this.desenharAjustes();
    };

    const cats = achar('ctrl-categorias');
    if (cats) cats.onchange = e => {
      Prefs.set('mostrarCategorias', e.target.checked);
      this.dobraC = null;
    };

    corpo.querySelectorAll('[data-comparar]').forEach(el => {
      el.onclick = () => {
        Prefs.set('versaoComparar', el.dataset.comparar);
        this.desenharAjustes();
        if (this.comparando) this.desenharComparacao();
      };
    });

    corpo.querySelectorAll('[data-tirinha]').forEach(el => {
      el.onchange = () => {
        const atuais = Prefs.get('versoesTirinha');
        const code = el.dataset.tirinha;
        Prefs.set('versoesTirinha', el.checked
          ? [...new Set([...atuais, code])]
          : atuais.filter(c => c !== code));
      };
    });

    corpo.querySelectorAll('[data-nome]').forEach(el => {
      el.onchange = () => Marcadores.atualizar(+el.dataset.nome, { nome: el.value });
    });

    // roda de cores: abre embaixo do marcador que foi tocado
    corpo.querySelectorAll('[data-abrir-cor]').forEach(el => {
      el.onclick = () => {
        const id = +el.dataset.abrirCor;
        const caixa = corpo.querySelector(`[data-caixa="${id}"]`);
        const abrindo = caixa.classList.contains('fechada');

        corpo.querySelectorAll('.caixa-cor').forEach(c => {
          c.classList.add('fechada');
          c.innerHTML = '';
        });

        if (!abrindo) return;
        caixa.classList.remove('fechada');
        RodaDeCores.montar(caixa, Marcadores.de(id).cor, cor => {
          Marcadores.atualizar(id, { cor });
          el.style.background = cor;
          document.querySelectorAll(`.v [data-marcador="${id}"], .v[data-marcador="${id}"]`)
            .forEach(v => v.style.setProperty('--marca', Leitura.corMarca(cor)));
        });
      };
    });
  },


  /* ============================================== seleção de trecho
   *
   * A seleção é a do próprio navegador — o toque longo e o arrastar que o dedo
   * já conhece de qualquer texto. O app só escuta o resultado e oferece o que
   * fazer com ele: copiar, compartilhar ou marcar.
   *
   * A marca cobre exatamente o que foi selecionado, e não o versículo inteiro.
   */

  selecao: null,

  /** O texto do versículo como está na tela, sem o número que o antecede. */
  textoDoVersiculo(el) {
    const n = el.querySelector('.n');
    const inteiro = el.textContent;
    return n ? inteiro.slice(n.textContent.length) : inteiro;
  },

  /** Onde, dentro do texto do versículo, cai um ponto da seleção. */
  posicaoNoVersiculo(el, no, deslocamento) {
    const r = document.createRange();
    r.selectNodeContents(el);
    try { r.setEnd(no, deslocamento); } catch { return 0; }
    const n = el.querySelector('.n');
    const desconto = n ? n.textContent.length : 0;
    return Math.max(0, r.toString().length - desconto);
  },

  lerSelecao() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;

    const r = s.getRangeAt(0);
    const folha = document.getElementById('folha');
    if (!folha.contains(r.commonAncestorContainer)) return null;

    const versiculos = [...folha.querySelectorAll('.v')]
      .filter(el => r.intersectsNode(el));
    if (!versiculos.length) return null;

    const pedacos = versiculos.map(el => {
      const texto = this.textoDoVersiculo(el);

      // a selecao envolve o versiculo inteiro, ou comeca/termina no meio dele?
      const rEl = document.createRange();
      rEl.selectNodeContents(el);
      const comecaAntes = r.compareBoundaryPoints(Range.START_TO_START, rEl) <= 0;
      const terminaDepois = r.compareBoundaryPoints(Range.END_TO_END, rEl) >= 0;

      const i = comecaAntes ? 0
        : this.posicaoNoVersiculo(el, r.startContainer, r.startOffset);
      const f = terminaDepois ? texto.length
        : this.posicaoNoVersiculo(el, r.endContainer, r.endOffset);

      return {
        vers: +el.dataset.vers,
        i: Math.min(i, f),
        f: Math.max(i, f),
        texto,
      };
    }).filter(p => p.f > p.i);

    return pedacos.length ? { pedacos, bruto: s.toString() } : null;
  },

  /** "Salmos 23:1-4" ou "Salmos 23:4" */
  referenciaDaSelecao(pedacos) {
    const nome = Dados.nomeCurto(this.versao, this.code);
    const a = pedacos[0].vers;
    const b = pedacos[pedacos.length - 1].vers;
    return `${nome} ${this.cap}:${a}${b !== a ? '-' + b : ''}`;
  },

  /** O texto pronto para copiar ou compartilhar, com a referência no fim. */
  textoParaCitar() {
    if (!this.selecao) return '';
    const { pedacos } = this.selecao;
    const corpo = pedacos.length === 1
      ? pedacos[0].texto.slice(pedacos[0].i, pedacos[0].f)
      : pedacos.map(p => `${p.vers} ${p.texto.slice(p.i, p.f)}`).join(' ');
    return `"${corpo.trim()}"\n${this.referenciaDaSelecao(pedacos)} (${this.versao})`;
  },

  mostrarBarraSelecao() {
    const sel = this.lerSelecao();
    const barra = document.getElementById('barra-selecao');

    if (!sel) {
      barra.classList.remove('aberta');
      barra.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('selecionando');
      document.getElementById('sel-cores').classList.add('fechada');
      this.selecao = null;
      return;
    }

    this.selecao = sel;
    const n = sel.pedacos.length;
    document.getElementById('sel-ref').innerHTML =
      `${this.referenciaDaSelecao(sel.pedacos)}
       <span class="sel-conta">${n} versículo${n > 1 ? 's' : ''}</span>`;

    // o ponto onde a pessoa está de fato lendo é o versículo que ela seleciona;
    // é ele que atualiza o histórico e faz o alfinete avançar no livro fixado
    const ultimoVers = sel.pedacos[sel.pedacos.length - 1].vers;
    Historico.avancarFixado({ code: this.code, cap: this.cap, vers: ultimoVers });

    barra.classList.add('aberta');
    barra.setAttribute('aria-hidden', 'false');
    document.body.classList.add('selecionando');
  },

  fecharSelecao() {
    window.getSelection()?.removeAllRanges();
    this.mostrarBarraSelecao();
  },

  avisoRapido(texto) {
    const antigo = document.querySelector('.aviso-rapido');
    if (antigo) antigo.remove();
    const el = document.createElement('div');
    el.className = 'aviso-rapido';
    el.textContent = texto;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  },

  /** Copia texto, com o caminho antigo de reserva para navegadores restritos. */
  async paraAreaDeTransferencia(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      const campo = document.createElement('textarea');
      campo.value = texto;
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      let deu = false;
      try { deu = document.execCommand('copy'); } catch { deu = false; }
      campo.remove();
      return deu;
    }
  },

  async copiarSelecao() {
    const texto = this.textoParaCitar();
    if (!texto) return;
    this.avisoRapido(await this.paraAreaDeTransferencia(texto)
      ? 'Copiado' : 'Não foi possível copiar');
    this.fecharSelecao();
  },

  async compartilharSelecao() {
    const texto = this.textoParaCitar();
    if (!texto) return;
    const titulo = this.referenciaDaSelecao(this.selecao.pedacos);

    if (navigator.share) {
      try { await navigator.share({ title: titulo, text: texto }); }
      catch { /* a pessoa desistiu: não é erro */ }
      this.fecharSelecao();
      return;
    }
    // no computador quase nunca existe compartilhamento do sistema
    await this.copiarSelecao();
    this.avisoRapido('Copiado — cole onde quiser');
  },

  abrirCoresDaSelecao() {
    const caixa = document.getElementById('sel-cores');
    // se já estava mostrando as cores, recolhe; se estava no modo estudo,
    // troca para as cores
    if (!caixa.classList.contains('fechada') && caixa.dataset.modo === 'marcar') {
      caixa.classList.add('fechada');
      return;
    }
    caixa.dataset.modo = 'marcar';

    // qual marcador já está posto no trecho selecionado (se houver um só)
    const versificacao = Dados.versificacaoDe(this.versao);
    const postos = new Set();
    for (const p of this.selecao ? this.selecao.pedacos : []) {
      for (const fx of Marcadores.faixas(versificacao, this.code, this.cap, p.vers)) {
        postos.add(fx.m);
      }
    }
    const atual = postos.size === 1 ? [...postos][0] : null;

    caixa.innerHTML = Marcadores.lista().map(m => `<button data-sm="${m.id}"
        class="opcao-marcador ${m.id === atual ? 'ativa' : ''}">
        <span class="bolha ${m.id === atual ? 'com-x' : ''}"
          style="background:${m.cor}"></span>
        <span>${Leitura.escapar(m.nome)}</span>
      </button>`).join('')
      + (postos.size ? `<button data-sm="0" class="opcao-marcador tirar">
          <span class="bolha vazia com-x"></span><span>Tirar a marca</span></button>` : '');

    caixa.classList.remove('fechada');

    caixa.querySelectorAll('[data-sm]').forEach(el => {
      el.onclick = () => {
        const id = +el.dataset.sm;
        this.marcarSelecao(id === atual ? 0 : id);
      };
    });
  },

  marcarSelecao(marcadorId) {
    if (!this.selecao) return;
    const versificacao = Dados.versificacaoDe(this.versao);

    for (const p of this.selecao.pedacos) {
      const inteiro = p.i === 0 && p.f >= p.texto.length;
      const fim = inteiro ? null : p.f;

      const faixas = marcadorId === 0
        ? Marcadores.limparTrecho(versificacao, this.code, this.cap, p.vers,
            inteiro ? null : p.i, fim)
        : Marcadores.marcarTrecho(versificacao, this.code, this.cap, p.vers,
            p.i, fim, marcadorId);

      Leitura.pintarMarca(p.vers, p.texto, faixas);
    }

    this.avisoRapido(marcadorId === 0 ? 'Marca removida' : 'Marcado');
    this.fecharSelecao();
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

    /* A sigla ao lado do livro e um botao: tocar nela troca a versao daquela
     * metade sem sair da comparacao. Serve de atalho para comparar duas
     * traducoes em sequencia, sem ir e voltar nos Ajustes. */
    const sigla = (versaoCode, qual) =>
      `<button class="sigla trocavel" data-trocar="${qual}"
        title="Trocar a versão desta metade">${versaoCode}</button>`;

    const montar = async (alvo, versaoCode, capitulo, nota, qual) => {
      if (!Dados.temLivro(versaoCode, this.code)) {
        alvo.innerHTML = `<div class="cabeca-metade">${sigla(versaoCode, qual)}</div>
          <div class="estado">${Dados.nomeCurto(this.versao, this.code)} não existe nesta versão.</div>`;
        return;
      }

      /* Se o arquivo do livro faltar nesta versão, a metade avisa e segue. Antes
       * a falha subia e derrubava a comparação inteira: nem a outra metade
       * aparecia, nem os botões de trocar respondiam. */
      let r = null;
      try {
        r = await Dados.capitulo(versaoCode, this.code, capitulo);
      } catch {
        alvo.innerHTML = `<div class="cabeca-metade">${sigla(versaoCode, qual)}</div>
          <div class="estado">Não foi possível abrir este livro na versão
          ${versaoCode}. Confira se os arquivos dela estão completos.</div>`;
        return;
      }

      if (!r) {
        alvo.innerHTML = `<div class="cabeca-metade">${sigla(versaoCode, qual)}</div>
          <div class="estado">Capítulo não encontrado.</div>`;
        return;
      }
      alvo.innerHTML = `<div class="cabeca-metade">
          ${sigla(versaoCode, qual)}
          <span>${Leitura.escapar(r.livro.name)} ${capitulo}</span>
          ${nota ? `<span style="color:var(--rubrica)">${nota}</span>` : ''}
        </div>` + Leitura.html(versaoCode, r.livro, r.capitulo, { comCapitular: false });
    };

    const conv = Dados.referenciaEm(this.code, this.cap, this.versao, outra);
    await Promise.all([
      montar(a, this.versao, this.cap, null, 'cima'),
      montar(b, outra, conv.capitulo, conv.exato ? null : 'numeração diferente', 'baixo'),
    ]);

    document.querySelectorAll('[data-trocar]').forEach(el => {
      el.onclick = ev => {
        ev.stopPropagation();
        this.alvoVersao = el.dataset.trocar === 'baixo' ? 'comparar' : 'principal';
        this.desenharVersoes();
        this.abrir('painel-versao');
      };
    });

    this.sincronizarRolagem(a, b);
  },

  /* A rolagem das duas metades anda junto. A versao antiga casava por
   * proporcao de altura — mas quando as versoes tem tamanhos de texto
   * diferentes (e mais ainda ao trocar uma delas), o mesmo versiculo caia em
   * alturas diferentes e o sincronismo se perdia. Agora o alinhamento e por
   * versiculo: ao rolar uma metade, a outra vai para o mesmo versiculo. */
  sincronizarRolagem(a, b) {
    let travado = false;

    // o versículo "de referência" é aquele cujo topo está mais perto da marca
    // (um pouco abaixo do topo do painel). Pegar o primeiro que cruza a marca
    // erra por até um versículo; medir a distância e escolher o menor não erra.
    const marcaDe = painel => painel.getBoundingClientRect().top + 8;

    const versAncora = painel => {
      const marca = marcaDe(painel);
      let melhor = null, menor = Infinity;
      for (const v of painel.querySelectorAll('.v')) {
        const r = v.getBoundingClientRect();
        if (r.bottom < marca - 40) continue;        // já passou bem acima
        if (r.top > marca + painel.clientHeight) break; // ainda muito abaixo
        const dist = Math.abs(r.top - marca);
        if (dist < menor) { menor = dist; melhor = v; }
      }
      return melhor ? melhor.dataset.vers : null;
    };

    const liga = (de, para) => {
      de.onscroll = () => {
        if (travado) return;
        travado = true;
        const vers = versAncora(de);
        const alvo = vers && para.querySelector(`.v[data-vers="${vers}"]`);
        if (alvo) {
          para.scrollTop += alvo.getBoundingClientRect().top - marcaDe(para);
        }
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
    q('btn-marcadores').onclick = () => { this.desenharMarcadores(); this.abrir('painel-marcadores'); };
    q('btn-historico').onclick = () => { this.desenharHistorico(); this.abrir('painel-historico'); };
    q('btn-estudos').onclick = () => { this.desenharEstudos(); this.abrir('painel-estudos'); };
    q('btn-ajustes').onclick = () => { this.desenharAjustes(); this.abrir('painel-ajustes'); };
    q('btn-comparar').onclick = () => this.alternarComparacao();
    q('btn-antes').onclick = () => this.passo(-1);
    q('btn-depois').onclick = () => this.passo(1);

    /* A barra de ações aparece sozinha quando há um trecho selecionado.
     * O atraso curto deixa o navegador terminar de ajustar as alças da seleção
     * antes de a gente ler o resultado. */
    let relogioSel = null;
    document.addEventListener('selectionchange', () => {
      clearTimeout(relogioSel);
      relogioSel = setTimeout(() => this.mostrarBarraSelecao(), 180);
    });

    q('sel-copiar').onclick = () => this.copiarSelecao();
    q('sel-compartilhar').onclick = () => this.compartilharSelecao();
    q('sel-marcar').onclick = () => this.abrirCoresDaSelecao();
    q('sel-estudo').onclick = () => this.abrirSalvarEstudo();
    q('sel-limpar').onclick = () => this.fecharSelecao();

    /* Arrastar para os lados vira a pagina, como num livro de verdade.
     *
     * Tres cuidados para nao atrapalhar o resto: se o dedo andou mais na
     * vertical, e rolagem e nao virada; se ha texto selecionado, a pessoa esta
     * escolhendo um trecho e nao quer trocar de capitulo; e o gesto precisa ser
     * decidido — curto demais ou demorado demais nao conta. */
    const folha = q('folha');
    let toque = null;

    folha.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) { toque = null; return; }
      const t = e.touches[0];
      toque = { x: t.clientX, y: t.clientY, hora: Date.now() };
    }, { passive: true });

    folha.addEventListener('touchend', e => {
      if (!toque) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - toque.x;
      const dy = t.clientY - toque.y;
      const tempo = Date.now() - toque.hora;
      toque = null;

      if (tempo > 700) return;                       // demorado: nao e virada
      if (Math.abs(dx) < 70) return;                 // curto: nao e virada
      if (Math.abs(dx) < Math.abs(dy) * 1.6) return; // mais vertical: e rolagem
      if (!window.getSelection().isCollapsed) return; // esta selecionando texto

      this.passo(dx < 0 ? 1 : -1);
    }, { passive: true });

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

    /* Toque simples deixa o ponto de leitura — o "parei aqui". Toque duplo,
     * que exige intencao, e que abre as versoes e os marcadores. Sao dois
     * gestos com pesos diferentes para duas coisas com pesos diferentes. */
    let espera = null;

    q('folha').onclick = e => {
      const v = e.target.closest('.v');
      if (!v) return;
      if (espera) { clearTimeout(espera); espera = null; return; } // e duplo
      const vers = +v.dataset.vers;
      espera = setTimeout(() => {
        espera = null;
        this.marcarPonto(vers);
      }, 230);
    };

    q('folha').ondblclick = e => {
      clearTimeout(espera);
      espera = null;
      const v = e.target.closest('.v');
      if (!v) return;
      this.abrirTirinha(+v.dataset.vers);
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

  /** Toque simples: poe ou tira o ponto de leitura, na hora. */
  marcarPonto(vers) {
    const versificacao = Dados.versificacaoDe(this.versao);
    const posto = Ponto.alternar(versificacao, this.code, this.cap, vers);
    Leitura.pintarPonto(vers, posto);
  },

  abrirTirinha(vers) {
    this.destaque = vers;
    document.querySelectorAll('.v.foco').forEach(x => x.classList.remove('foco'));
    document.querySelectorAll(`#folha .v[data-vers="${vers}"]`)
      .forEach(x => x.classList.add('foco'));
    Leitura.tirinha(this.code, this.cap, vers, this.versao);
    const t = document.getElementById('tirinha');
    t.classList.add('aberta');
    t.setAttribute('aria-hidden', 'false');
  },

  escolherMarcador() {
    const corpo = document.getElementById('tirinha-corpo');
    const versificacao = Dados.versificacaoDe(this.versao);
    const atual = Marcadores.do(versificacao, this.code, this.cap, this.destaque);

    corpo.innerHTML = `<div class="grupo" style="padding-top:8px">
      <h3>Marcar este versículo</h3>
      <div class="lista-marcadores">
        ${Marcadores.lista().map(m => `<button data-m="${m.id}"
          class="opcao-marcador ${m.id === atual ? 'ativa' : ''}">
          <span class="bolha ${m.id === atual ? 'com-x' : ''}"
            style="background:${m.cor}"></span>
          <span>${Leitura.escapar(m.nome)}</span>
        </button>`).join('')}
      </div>
      <p class="contagem" style="margin-top:12px">${atual
        ? 'O marcador com o xis é o que está posto — toque nele para tirar.'
        : 'Escolha um marcador para este versículo.'}</p>
      <button class="botao secundario" id="voltar-tirinha" style="width:100%;margin-top:8px">
        Voltar às versões</button>
    </div>`;

    corpo.querySelectorAll('[data-m]').forEach(el => {
      el.onclick = () => {
        const id = +el.dataset.m;

        // pela tirinha a marca cobre o versículo inteiro; para pintar só um
        // pedaço, a pessoa seleciona o trecho direto no texto.
        // Tocar no marcador que já está posto (o do xis) tira a marca.
        if (id === atual) Marcadores.limparTrecho(versificacao, this.code, this.cap, this.destaque);
        else Marcadores.alternar(versificacao, this.code, this.cap, this.destaque, id);

        const el2 = document.querySelector(`#folha .v[data-vers="${this.destaque}"]`);
        if (el2) {
          const faixas = Marcadores.faixas(versificacao, this.code, this.cap, this.destaque);
          Leitura.pintarMarca(this.destaque, this.textoDoVersiculo(el2), faixas);
        }
        this.escolherMarcador();
      };
    });

    document.getElementById('voltar-tirinha').onclick = () =>
      Leitura.tirinha(this.code, this.cap, this.destaque, this.versao);
  },

  /* ================================================== painel de marcadores */

  /** Lista os doze grupos, com nome, cor e quantos versículos cada um tem. */
  desenharMarcadores() {
    const corpo = document.getElementById('corpo-marcadores');
    document.getElementById('titulo-marcadores').textContent = 'Marcadores';

    const p = Ponto.atual();
    const bloco = [];

    if (p) {
      const conv = Dados.converter(p.code, p.cap,
        p.versificacao, Dados.versificacaoDe(this.versao));
      bloco.push(`<div class="grupo">
        <h3>Onde parei</h3>
        <button class="linha" id="ir-ponto">
          <span>${Leitura.escapar(Dados.nomeCurto(this.versao, p.code))}
            ${conv.capitulo}:${p.vers}</span>
          <span class="sub">${new Date(p.hora).toLocaleDateString('pt-BR')}</span>
        </button>
        <p class="contagem">Toque simples num versículo move este ponto.</p>
      </div>`);
    } else {
      bloco.push(`<div class="grupo">
        <h3>Onde parei</h3>
        <p class="contagem">Nenhum ponto ainda. Um toque simples em qualquer
        versículo deixa a marca de onde você parou.</p>
      </div>`);
    }

    bloco.push('<div class="grupo"><h3>Grupos</h3>');
    Marcadores.lista().forEach(m => {
      const n = Marcadores.porMarcador(m.id).length;
      bloco.push(`<button class="grupo-marcador ${n ? '' : 'vazio'}" data-g="${m.id}">
        <span class="bolha" style="background:${m.cor}"></span>
        <span>${Leitura.escapar(m.nome)}</span>
        <span class="conta">${n}</span>
      </button>`);
    });
    bloco.push(`<p class="contagem">Os nomes e as cores se mudam nos Ajustes.
      Trocar a cor de um grupo recolore todos os versículos dele.</p></div>`);

    corpo.innerHTML = bloco.join('');

    const irPonto = document.getElementById('ir-ponto');
    if (irPonto) irPonto.onclick = () => {
      const conv = Dados.converter(p.code, p.cap,
        p.versificacao, Dados.versificacaoDe(this.versao));
      this.fecharPaineis();
      this.ir(p.code, conv.capitulo, p.vers);
    };

    corpo.querySelectorAll('[data-g]').forEach(el => {
      el.onclick = () => this.desenharGrupo(+el.dataset.g);
    });
  },

  /** Todos os versículos de um grupo: referência e um trecho para reconhecer. */
  async desenharGrupo(id) {
    const corpo = document.getElementById('corpo-marcadores');
    const m = Marcadores.de(id);
    const itens = Marcadores.porMarcador(id);
    document.getElementById('titulo-marcadores').textContent = m.nome;

    const voltar = `<button class="linha" id="voltar-marcadores" style="margin-bottom:12px">
      ← Todos os marcadores</button>`;

    if (!itens.length) {
      corpo.innerHTML = voltar + `<div class="estado">Nenhum versículo com o
        marcador <strong>${Leitura.escapar(m.nome)}</strong> ainda.</div>`;
      document.getElementById('voltar-marcadores').onclick = () => this.desenharMarcadores();
      return;
    }

    corpo.innerHTML = voltar + '<div class="estado">Reunindo os versículos…</div>';

    const minha = Dados.versificacaoDe(this.versao);
    const ordem = Dados.arvore(this.versao).reading_order;

    const lidos = await Promise.all(itens.map(async it => {
      const conv = Dados.converter(it.code, it.cap, it.versificacao, minha);
      let texto = '', parcial = false;
      try {
        const r = await Dados.capitulo(this.versao, it.code, conv.capitulo);
        const v = r && r.capitulo.verses.find(x => x.number === it.vers);
        const inteiro = v && v.text ? v.text : '';
        const fim = it.f == null ? inteiro.length : it.f;
        texto = inteiro.slice(it.i || 0, fim).trim();
        parcial = (it.i || 0) > 0 || fim < inteiro.length;
      } catch { /* livro ausente nesta versão: mostra só a referência */ }
      return { ...it, capLocal: conv.capitulo, exato: conv.exato, texto, parcial };
    }));

    lidos.sort((a, b) => {
      const d = ordem.indexOf(a.code) - ordem.indexOf(b.code);
      return d !== 0 ? d : (a.capLocal - b.capLocal || a.vers - b.vers);
    });

    /* Agrupa versículos em sequência: em vez de três linhas para Gênesis 1:1,
     * 1:2 e 1:3, uma só, "Gênesis 1:1-3". Só junta o que é seguido, do mesmo
     * livro e capítulo, e apenas versículos inteiros — um trecho parcial
     * (meio-versículo marcado) fica sozinho, porque a faixa é dele. */
    const grupos = [];
    for (const it of lidos) {
      const ult = grupos[grupos.length - 1];
      const inteiro = !it.parcial;
      if (ult && inteiro && ult.inteiro && ult.code === it.code
          && ult.capLocal === it.capLocal && it.vers === ult.versFim + 1) {
        ult.versFim = it.vers;
        ult.itens.push(it);
      } else {
        grupos.push({ code: it.code, capLocal: it.capLocal, versIni: it.vers,
          versFim: it.vers, inteiro, exato: it.exato, itens: [it] });
      }
    }

    const rotulo = g => {
      const nome = Dados.nomeCurto(this.versao, g.code);
      return g.versIni === g.versFim
        ? `${nome} ${g.capLocal}:${g.versIni}`
        : `${nome} ${g.capLocal}:${g.versIni}-${g.versFim}`;
    };

    const trecho = g => {
      if (g.itens.length > 1) {
        // agrupado: junta os textos dos versículos, cortando se ficar longo
        const junto = g.itens.map(x => x.texto).filter(Boolean).join(' ');
        return Leitura.escapar(junto.slice(0, 130)) + (junto.length > 130 ? '…' : '');
      }
      const it = g.itens[0];
      if (!it.texto) return '(texto não disponível nesta versão)';
      return (it.parcial ? '…' : '') + Leitura.escapar(it.texto.slice(0, 120))
        + (it.texto.length > 120 || it.parcial ? '…' : '');
    };

    corpo.innerHTML = voltar
      + `<p class="contagem" style="margin-bottom:10px">${lidos.length}
         versículo${lidos.length > 1 ? 's' : ''} neste marcador.</p>`
      + grupos.map((g, i) => `<div class="marcado-linha" style="--marca-cor:${m.cor}">
          <button class="item-marcado" data-g="${i}">
            <span class="ref-marcado">${rotulo(g)}</span>
            ${g.exato ? '' : '<span class="sub">numeração diferente</span>'}
            <span class="trecho-marcado">${trecho(g)}</span>
          </button>
          <button class="xis remover-marca" data-remg="${i}"
            aria-label="Remover marca" title="Remover marca">
            <svg class="icone"><use href="#i-fechar"/></svg></button>
        </div>`).join('');

    document.getElementById('voltar-marcadores').onclick = () => this.desenharMarcadores();

    corpo.querySelectorAll('[data-g]').forEach(el => {
      el.onclick = () => {
        const g = grupos[+el.dataset.g];
        this.fecharPaineis();
        this.ir(g.code, g.capLocal, g.versIni);
      };
    });

    corpo.querySelectorAll('[data-remg]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const g = grupos[+el.dataset.remg];
        // tira a marca de todos os versículos do grupo
        for (const it of g.itens) {
          Marcadores.limparTrecho(it.versificacao, it.code, it.cap,
            it.vers, it.i, it.f);
        }
        this.desenharGrupo(id);
      };
    });
  },

  /* ================================================================== PWA */

  registrarServico() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.iniciar());
