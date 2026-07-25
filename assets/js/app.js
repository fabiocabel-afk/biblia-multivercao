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
  destaqueComparacao: null,
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
    this.aplicarRefsFixas(p.refsFixas);

    // retoma sempre do último lugar visitado — é onde a pessoa parou de fato.
    // Os fixados são atalhos que ela aciona quando quiser, não o ponto de abertura.
    const ultimo = Historico.lista()[0];
    if (ultimo && Dados.versao(ultimo.versao)) {
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
    // navegar por conta própria descarta a volta rápida; só o pulo para a
    // referência (que ativa a flag) a preserva, para poder voltar depois
    if (!this._pulandoDeReferencia && this.origemDaReferencia) {
      this.esconderVoltarOrigem();
    }

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

    folha.innerHTML = `<p class="titulo-livro ${cap === 1 ? 'abertura' : ''}">${Leitura.escapar(r.livro.name)}</p>`
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

    // ao abrir um capítulo, as referências fixas (se ligadas) mostram as dele
    if (Prefs.get('refsFixas')) {
      this.destaque = vers || null;
      this.atualizarRefsFixas(vers || null);
    }
  },

  atualizarBarra() {
    this.atualizarAtalhoFixado();
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
    const t = document.getElementById('tirinha');
    t.classList.remove('aberta', 'alta');
    t.setAttribute('aria-hidden', 'true');
    // restaura o título original, tirando a contagem de referências que fica ao lado
    const cab = document.getElementById('tirinha-ref');
    if (cab.dataset.base) { cab.textContent = cab.dataset.base; delete cab.dataset.base; }
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
      el.onclick = () => this.desenharVersiculosDoSeletor(code, +el.dataset.cap);
    });
  },

  /* Depois do capítulo, a escolha do versículo de partida. Serve para registrar
   * de onde a pessoa começa — muitos capítulos têm dezenas de versículos, e
   * quase sempre ela já tem um em mente. O primeiro toque leva até lá (com o
   * efeito de "parei aqui") e abre o registro; os toques seguintes ESTENDEM o
   * registro até o maior versículo tocado. Ex.: toca 5, depois 6, pula 7, toca
   * 13 → o registro fica de 5 a 13. */
  async desenharVersiculosDoSeletor(code, cap) {
    const corpo = document.getElementById('corpo-arvore');
    corpo.innerHTML = '<div class="estado">Carregando…</div>';

    const info = Dados.infoLivro(this.versao, code);
    const nome = info ? info.name : code;
    let total = 0;
    try {
      const r = await Dados.capitulo(this.versao, code, cap);
      total = r ? r.capitulo.verses.length : 0;
    } catch { total = 0; }

    // estado da seleção que estende: início fixo, fim acompanha o maior tocado
    this.selVers = null;

    const grade = [];
    for (let v = 1; v <= total; v++) {
      grade.push(`<button class="cel-num" data-v="${v}">${v}</button>`);
    }

    document.getElementById('titulo-arvore').textContent = `${nome} ${cap}`;
    corpo.innerHTML = `
      <button class="linha" id="voltar-caps" style="margin-bottom:12px">
        ← Capítulos de ${nome}</button>
      <div class="grupo"><h3>${nome} ${cap} — de onde começar?</h3>
      <p class="contagem" style="margin-bottom:10px">Toque no versículo de
      partida. Tocando em outros abaixo, o registro se estende até o último.</p>
      <div class="grade-num">${grade.join('')}</div></div>`;

    document.getElementById('voltar-caps').onclick = () => this.desenharCapitulos(code);

    corpo.querySelectorAll('[data-v]').forEach(el => {
      el.onclick = () => {
        const v = +el.dataset.v;
        if (this.selVers === null) {
          // primeiro toque: vai até lá e abre o registro
          this.selVers = { ini: v, fim: v };
          this.fecharPaineis();
          this.ir(code, cap, v);
        } else {
          // toques seguintes: estende o registro até o maior versículo tocado
          this.selVers.fim = Math.max(this.selVers.fim, v);
          el.classList.add('ativa');
          for (let k = this.selVers.ini; k <= this.selVers.fim; k++) {
            const c = corpo.querySelector(`[data-v="${k}"]`);
            if (c) c.classList.add('no-trecho');
          }
          // atualiza o registro no histórico com o intervalo estendido
          Historico.registrar({
            versao: this.versao, code, cap, vers: this.selVers.ini,
            trecho: `${this.selVers.ini}–${this.selVers.fim}`,
          });
        }
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

  /* O atalho no topo leva ao primeiro fixado. Só aparece quando você está em
   * OUTRO livro — não faz sentido oferecer "voltar" se você já está nele. */
  atualizarAtalhoFixado() {
    const btn = document.getElementById('btn-atalho-fixado');
    if (!btn) return;
    const primeiro = Historico.primeiroFixado();
    const mostrar = primeiro && primeiro.code !== this.code;
    btn.hidden = !mostrar;
  },

  irParaPrimeiroFixado() {
    const f = Historico.primeiroFixado();
    if (!f) return;
    if (f.versao !== this.versao) { this.versao = f.versao; Prefs.set('versao', f.versao); }
    this.ir(f.code, f.cap || 1, f.vers);
  },

  /* Ao pular para uma referência, guarda de onde a pessoa veio e mostra embaixo
   * um botão de volta rápida. É temporário: some assim que ela usa, ou quando
   * navega para qualquer outro lugar por conta própria. */
  origemDaReferencia: null,
  _pulandoDeReferencia: false,

  pularParaReferencia(code, cap, vers) {
    this.origemDaReferencia = {
      versao: this.versao, code: this.code, cap: this.cap, vers: this.destaque || null,
    };
    this._pulandoDeReferencia = true;   // este ir() não deve limpar a origem
    if (this.versao) this.ir(code, cap, vers);
    this._pulandoDeReferencia = false;
    this.mostrarVoltarOrigem();
  },

  mostrarVoltarOrigem() {
    const o = this.origemDaReferencia;
    const btn = document.getElementById('voltar-origem');
    if (!o) { btn.hidden = true; return; }
    const ref = `${Dados.nomeCurto(o.versao, o.code)} ${o.cap}` + (o.vers ? ':' + o.vers : '');
    document.getElementById('voltar-origem-texto').textContent = `Voltar para ${ref}`;
    btn.hidden = false;
  },

  esconderVoltarOrigem() {
    this.origemDaReferencia = null;
    document.getElementById('voltar-origem').hidden = true;
  },

  voltarParaOrigem() {
    const o = this.origemDaReferencia;
    if (!o) return;
    this.esconderVoltarOrigem();   // limpa antes, para o ir() não guardar de novo
    if (o.versao !== this.versao) { this.versao = o.versao; Prefs.set('versao', o.versao); }
    this.ir(o.code, o.cap, o.vers);
  },

  desenharHistorico() {
    const corpo = document.getElementById('corpo-historico');
    const lista = Historico.lista();
    const fixados = Historico.fixados();

    const partes = [];

    // ---- os livros fixados (vários, na ordem escolhida)
    if (fixados.length) {
      const linhas = fixados.map((f, i) => {
        const ref = `${Dados.nomeCurto(f.versao, f.code)} ${f.cap || 1}` +
          (f.vers ? ':' + f.vers : '');
        return `<div class="fixado-linha">
          <div class="ordem-fixado">
            <button class="mini-seta" data-sobe="${f.code}" ${i === 0 ? 'disabled' : ''}
              aria-label="Subir">▲</button>
            <button class="mini-seta" data-desce="${f.code}" ${i === fixados.length - 1 ? 'disabled' : ''}
              aria-label="Descer">▼</button>
          </div>
          <button class="linha ativa ir-fixado" data-ir-fixado="${f.code}" style="flex:1">
            <svg class="icone" style="width:16px;height:16px;stroke:var(--rubrica)"><use href="#i-fixar"/></svg>
            <span>${ref}</span>
            <span class="sub">${f.versao}</span>
          </button>
          <button class="xis" data-desfixar="${f.code}" aria-label="Desafixar" title="Desafixar">
            <svg class="icone"><use href="#i-fechar"/></svg></button>
        </div>`;
      }).join('');
      partes.push(`<div class="grupo">
        <h3>Fixados</h3>
        ${linhas}
        <p class="contagem">Cada fixado retoma de onde você parou naquele livro.
        Use as setas para reordenar; o atalho no topo leva ao primeiro.</p>
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
        const fixavel = !Historico.ehFixado(it.code);
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

    corpo.querySelectorAll('[data-ir-fixado]').forEach(el => {
      el.onclick = () => {
        const f = Historico.fixados().find(x => x.code === el.dataset.irFixado);
        this.fecharPaineis();
        if (f.versao !== this.versao) { this.versao = f.versao; Prefs.set('versao', f.versao); }
        this.ir(f.code, f.cap || 1, f.vers);
      };
    });

    corpo.querySelectorAll('[data-desfixar]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        Historico.desfixar(el.dataset.desfixar);
        this.desenharHistorico();
        this.atualizarAtalhoFixado();
      };
    });

    corpo.querySelectorAll('[data-sobe]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        Historico.moverFixado(el.dataset.sobe, -1);
        this.desenharHistorico();
        this.atualizarAtalhoFixado();
      };
    });

    corpo.querySelectorAll('[data-desce]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        Historico.moverFixado(el.dataset.desce, 1);
        this.desenharHistorico();
        this.atualizarAtalhoFixado();
      };
    });

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
        this.atualizarAtalhoFixado();
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

  /* Ao tocar em "Salvar estudo", abre um painel próprio — mesma largura e fundo
   * claro dos outros — com a opção de estudo novo e a lista dos que já existem.
   * A seleção fica guardada enquanto a pessoa escolhe. */
  abrirSalvarEstudo() {
    if (!this.selecao) return;
    this.selecaoGuardada = this.selecao;
    document.getElementById('barra-selecao').classList.remove('aberta');
    document.body.classList.remove('selecionando');

    // primeiro escolhe até onde vai o trecho; só depois decide onde salvar
    this.estudoParcial = {
      versao: this.versao,
      code: this.code,
      capInicio: this.cap,
      versInicio: this.selecaoGuardada.pedacos[0].vers,
      capFim: this.cap,
      versFim: this.selecaoGuardada.pedacos[this.selecaoGuardada.pedacos.length - 1].vers,
    };

    this.escolherFimCapitulo();
    this.abrir('painel-salvar-estudo');
  },

  /* Escolha do capítulo final, em grade, mostrando só os capítulos que o livro
   * realmente tem. Começa no capítulo de início — não há como terminar antes de
   * onde a seleção começou. */
  escolherFimCapitulo() {
    const corpo = document.getElementById('corpo-salvar-estudo');
    document.getElementById('titulo-salvar').textContent = 'Até que capítulo?';

    const e = this.estudoParcial;
    const info = Dados.infoLivro(e.versao, e.code);
    const total = info ? info.chapters : e.capInicio;
    const nome = Dados.nomeCurto(e.versao, e.code);

    const grade = [];
    for (let c = e.capInicio; c <= total; c++) {
      grade.push(`<button class="cel-num ${c === e.capFim ? 'ativa' : ''}"
        data-cap="${c}">${c}</button>`);
    }

    corpo.innerHTML = `
      <p class="contagem" style="margin-bottom:14px">O trecho começa em
        <strong>${nome} ${e.capInicio}:${e.versInicio}</strong>.
        Até que capítulo ele vai?</p>
      <div class="grade-num">${grade.join('')}</div>`;

    corpo.querySelectorAll('[data-cap]').forEach(el => {
      el.onclick = () => {
        e.capFim = +el.dataset.cap;
        // se mudou de capítulo, o versículo final precisa ser reescolhido
        this.escolherFimVersiculo();
      };
    });
  },

  /* Escolha do versículo final, mostrando só os versículos que o capítulo tem.
   * Se o fim é o mesmo capítulo do início, não deixa escolher antes do começo. */
  async escolherFimVersiculo() {
    const corpo = document.getElementById('corpo-salvar-estudo');
    document.getElementById('titulo-salvar').textContent = 'Até que versículo?';
    corpo.innerHTML = '<div class="estado">Carregando…</div>';

    const e = this.estudoParcial;
    const nome = Dados.nomeCurto(e.versao, e.code);

    let totalVers = 0;
    try {
      const r = await Dados.capitulo(e.versao, e.code, e.capFim);
      totalVers = r ? r.capitulo.verses.length : 0;
    } catch { totalVers = 0; }

    const minimo = e.capFim === e.capInicio ? e.versInicio : 1;
    if (e.versFim < minimo || e.versFim > totalVers) e.versFim = Math.min(minimo, totalVers) || minimo;

    const grade = [];
    for (let v = minimo; v <= totalVers; v++) {
      grade.push(`<button class="cel-num ${v === e.versFim ? 'ativa' : ''}"
        data-vers="${v}">${v}</button>`);
    }

    corpo.innerHTML = `
      <button class="voltar-etapa" id="voltar-cap">← Trocar o capítulo (${e.capFim})</button>
      <p class="contagem" style="margin:10px 0 14px">Termina em
        <strong>${nome} ${e.capFim}</strong>, versículo:</p>
      <div class="grade-num">${grade.join('')}</div>`;

    document.getElementById('voltar-cap').onclick = () => this.escolherFimCapitulo();

    corpo.querySelectorAll('[data-vers]').forEach(el => {
      el.onclick = () => {
        e.versFim = +el.dataset.vers;
        this.desenharSalvarEstudo();   // agora sim: onde salvar
      };
    });
  },

  desenharSalvarEstudo() {
    const corpo = document.getElementById('corpo-salvar-estudo');
    document.getElementById('titulo-salvar').textContent = 'Salvar estudo';
    const anteriores = Estudos.todos();
    const e = this.estudoParcial;
    const refTrecho = Estudos.refDoTrecho(e);

    corpo.innerHTML = `
      <button class="voltar-etapa" id="voltar-vers">← Trocar até onde vai</button>
      <p class="contagem" style="margin:10px 0 14px">Guardando
        <strong>${refTrecho}</strong> · ${e.versao}</p>

      <button class="opcao-estudo-grande novo" id="estudo-novo">
        <span class="mais">+</span>
        <span><strong>Novo estudo</strong>
          <span class="sub">Começar um estudo com este trecho</span></span>
      </button>

      ${anteriores.length ? `<div class="grupo"><h3>Ou juntar a um estudo</h3>
        ${anteriores.map(est => {
          const n = Estudos.trechosDe(est).length;
          return `<button class="opcao-estudo-grande" data-juntar="${est.id}">
            <span><strong>${Leitura.escapar(Estudos.nomeDe(est))}</strong>
              <span class="sub">${Estudos.refDe(est)}</span></span>
            <span class="conta-trechos">${n} trecho${n > 1 ? 's' : ''}</span>
          </button>`;
        }).join('')}
      </div>` : ''}`;

    document.getElementById('voltar-vers').onclick = () => this.escolherFimVersiculo();

    document.getElementById('estudo-novo').onclick = () => {
      const nome = prompt('Nome do novo estudo (opcional):', '');
      if (nome === null) return;
      Estudos.criar({ nome: nome.trim(), trecho: { ...e } });
      this.fecharPaineis();
      this.fecharSelecao();
      this.avisoRapido('Estudo criado');
    };

    corpo.querySelectorAll('[data-juntar]').forEach(el => {
      el.onclick = () => {
        Estudos.acrescentar(el.dataset.juntar, { ...e });
        this.fecharPaineis();
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

  dobraA: null,

  secao(id, titulo, conteudo) {
    const aberta = this.dobraA === id;
    return `<button class="dobra secao ${aberta ? 'aberta' : ''}" data-s="${id}" aria-expanded="${aberta}">
        <span class="seta">▶</span>
        <span>${titulo}</span>
      </button>
      <div class="dentro ${aberta ? '' : 'fechada'}">${conteudo}</div>`;
  },

  /* O app é um site — dá para instalar e compartilhar por um link. Aqui ficam o
   * QR code (que se adapta ao tema, por herdar a cor do texto) e o endereço,
   * com atalhos para copiar ou usar o compartilhamento do próprio aparelho. */
  LINK_APP: 'https://fabiocabel-afk.github.io/biblia-multivercao/',

  async desenharCompartilhar() {
    const corpo = document.getElementById('corpo-compartilhar');
    const link = this.LINK_APP;

    let qr = '';
    try {
      qr = await fetch('assets/img/qrcode.svg').then(r => r.ok ? r.text() : '');
    } catch { qr = ''; }

    corpo.innerHTML = `
      <p class="contagem" style="margin-bottom:16px">Aponte a câmera para o código
      ou compartilhe o link. O app abre no navegador e pode ser instalado como
      um aplicativo.</p>

      <div class="qr-caixa">${qr || '<div class="estado">Código indisponível</div>'}</div>

      <div class="link-caixa">
        <span class="link-texto" id="link-app">${link}</span>
      </div>

      <div class="acoes-compartilhar">
        <button class="botao secundario" id="copiar-link">Copiar link</button>
        <button class="botao" id="enviar-link">Compartilhar…</button>
      </div>`;

    document.getElementById('copiar-link').onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        this.avisoRapido('Link copiado');
      } catch {
        this.avisoRapido('Não foi possível copiar');
      }
    };

    const enviar = document.getElementById('enviar-link');
    // o botão de compartilhar nativo só faz sentido onde o aparelho o oferece
    if (navigator.share) {
      enviar.onclick = async () => {
        try {
          await navigator.share({
            title: 'Bíblia multiversão',
            text: 'Bíblia para leitura e estudo, com várias versões e referências cruzadas.',
            url: link,
          });
        } catch { /* a pessoa cancelou; sem problema */ }
      };
    } else {
      // sem compartilhamento nativo, o botão vira um "copiar" também
      enviar.textContent = 'Copiar link';
      enviar.onclick = () => document.getElementById('copiar-link').click();
    }
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
      <div class="escolha-radio">
        <label class="opcao-radio">
          <input type="radio" name="modo-versiculo" value="corrido" ${p.versiculoPorLinha ? '' : 'checked'}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Corrido</strong><span>Como numa Bíblia impressa</span></span>
        </label>
        <label class="opcao-radio">
          <input type="radio" name="modo-versiculo" value="linha" ${p.versiculoPorLinha ? 'checked' : ''}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Um por linha</strong><span>Número abrindo a linha</span></span>
        </label>
      </div>

      <label class="interruptor" style="margin-top:20px"><span>Referências fixas na tela</span>
        <input type="checkbox" id="ctrl-refs-fixas" ${p.refsFixas ? 'checked' : ''}></label>
      <p class="contagem">Divide a tela: o texto em cima, as referências cruzadas
      embaixo. Sem versículo selecionado, mostra as do capítulo todo; ao tocar
      num versículo, filtra pelas dele.</p>

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
      this.secao('folha', 'Página', folha) +
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

    corpo.querySelectorAll('input[name="modo-versiculo"]').forEach(el => {
      el.onchange = () => {
        const porLinha = el.value === 'linha';
        Prefs.set('versiculoPorLinha', porLinha);
        Leitura.aplicarModoVersiculo(porLinha);
        this.ir(this.code, this.cap, null, { registrar: false });
      };
    });

    const refsFixas = achar('ctrl-refs-fixas');
    if (refsFixas) refsFixas.onchange = e => {
      Prefs.set('refsFixas', e.target.checked);
      this.aplicarRefsFixas(e.target.checked);
    };

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
    // ele atualiza o histórico e acompanha a posição no livro fixado
    const ultimoVers = sel.pedacos[sel.pedacos.length - 1].vers;
    Historico.acompanharFixado({ code: this.code, cap: this.cap, vers: ultimoVers });

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
    if (!caixa.classList.contains('fechada')) {
      caixa.classList.add('fechada');
      return;
    }

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

    // Tocar num versículo de qualquer metade realça o MESMO número nas duas,
    // para a pessoa não perder de vista qual versículo está comparando.
    const realcar = vers => {
      [a, b].forEach(metade => {
        metade.querySelectorAll('.v.foco-par').forEach(x => x.classList.remove('foco-par'));
        if (vers != null) metade.querySelectorAll(`.v[data-vers="${vers}"]`)
          .forEach(x => x.classList.add('foco-par'));
      });
      this.destaqueComparacao = vers;
    };

    [a, b].forEach(metade => {
      metade.onclick = e => {
        const v = e.target.closest('.v');
        if (!v) return;
        const vers = +v.dataset.vers;
        realcar(this.destaqueComparacao === vers ? null : vers);
      };
    });

    // se já havia um versículo em foco, mantém ao redesenhar (troca de versão)
    if (this.destaqueComparacao != null) realcar(this.destaqueComparacao);

    this.sincronizarRolagem(a, b);
  },

  /* A rolagem das duas metades anda junto. O jeito por proporção de altura era
   * bem fluido, mas perdia o versículo quando as versões tinham tamanhos
   * diferentes. O alinhamento por versículo acertava o alvo, mas "saltava" a
   * cada evento — ficava robotizado.
   *
   * Aqui os dois se combinam: a metade espelhada segue o MESMO deslocamento em
   * pixels da que a pessoa move (movimento idêntico, natural, sem salto), e só
   * quando o desalinhamento entre os versículos do topo passa de um limite é que
   * um empurrãozinho suave corrige o rumo. No uso normal, desliza liso; a
   * correção só aparece se as alturas divergirem demais. */
  sincronizarRolagem(a, b) {
    let travado = false;
    const anterior = new WeakMap();
    anterior.set(a, a.scrollTop);
    anterior.set(b, b.scrollTop);

    const marcaDe = painel => painel.getBoundingClientRect().top + 8;

    const versNoTopo = painel => {
      const marca = marcaDe(painel);
      let melhor = null, menor = Infinity;
      for (const v of painel.querySelectorAll('.v')) {
        const r = v.getBoundingClientRect();
        if (r.bottom < marca - 60) continue;
        if (r.top > marca + 60) break;
        const d = Math.abs(r.top - marca);
        if (d < menor) { menor = d; melhor = v; }
      }
      return melhor;
    };

    const liga = (de, para) => {
      de.addEventListener('scroll', () => {
        if (travado) return;
        travado = true;

        // 1) espelha o deslocamento exato — é o que dá o deslize natural
        const delta = de.scrollTop - (anterior.get(de) ?? de.scrollTop);
        para.scrollTop += delta;

        // 2) correção rumo ao versículo certo. Em gestos normais o erro é
        // pequeno e a correção é quase imperceptível; num reposicionamento
        // brusco (troca de versão, salto), o erro é grande e ela puxa mais
        // firme para reencontrar o versículo, sem nunca dar um salto seco.
        const vDe = versNoTopo(de);
        if (vDe) {
          const alvo = para.querySelector(`.v[data-vers="${vDe.dataset.vers}"]`);
          if (alvo) {
            const erro = (alvo.getBoundingClientRect().top - marcaDe(para))
              - (vDe.getBoundingClientRect().top - marcaDe(de));
            const abs = Math.abs(erro);
            // fator cresce com o erro: 0.12 para desvios pequenos, até 0.6 nos grandes
            const fator = abs > 120 ? 0.6 : abs > 40 ? 0.25 : abs > 12 ? 0.12 : 0;
            para.scrollTop += erro * fator;
          }
        }

        anterior.set(de, de.scrollTop);
        anterior.set(para, para.scrollTop);
        requestAnimationFrame(() => { travado = false; });
      }, { passive: true });
    };

    liga(a, b);
    liga(b, a);
  },

  /* ============================================================== eventos */

  ligarEventos() {
    const q = id => document.getElementById(id);

    q('btn-arvore').onclick = () => { this.desenharArvore(); this.abrir('painel-arvore'); };
    q('btn-ref').onclick = () => { this.desenharCapitulos(this.code); this.abrir('painel-arvore'); };
    q('btn-versao').onclick = () => { this.alvoVersao = 'principal'; this.desenharVersoes(); this.abrir('painel-versao'); };
    q('btn-comparar').onclick = () => this.alternarComparacao();
    q('btn-antes').onclick = () => this.passo(-1);
    q('btn-depois').onclick = () => this.passo(1);

    /* O menu do canto reúne os painéis que não cabiam na barra. Abre por baixo
     * do botão e fecha ao escolher um item ou ao tocar fora. */
    const menu = q('menu-flutuante');
    const abrirItem = {
      busca: () => { this.desenharFiltros(); this.abrir('painel-busca');
                     setTimeout(() => q('campo-busca').focus(), 220); },
      historico: () => { this.desenharHistorico(); this.abrir('painel-historico'); },
      marcadores: () => { this.desenharMarcadores(); this.abrir('painel-marcadores'); },
      estudos: () => { this.desenharEstudos(); this.abrir('painel-estudos'); },
      ajustes: () => { this.desenharAjustes(); this.abrir('painel-ajustes'); },
      compartilhar: () => { this.desenharCompartilhar(); this.abrir('painel-compartilhar'); },
    };

    const fecharMenu = () => {
      menu.classList.remove('aberto');
      menu.setAttribute('aria-hidden', 'true');
    };

    q('btn-menu').onclick = e => {
      e.stopPropagation();
      const aberto = menu.classList.toggle('aberto');
      menu.setAttribute('aria-hidden', aberto ? 'false' : 'true');
    };

    q('btn-atalho-fixado').onclick = () => this.irParaPrimeiroFixado();
    q('fechar-comparar').onclick = () => this.alternarComparacao();
    q('voltar-origem').onclick = () => this.voltarParaOrigem();

    menu.querySelectorAll('[data-menu]').forEach(el => {
      el.onclick = () => { fecharMenu(); abrirItem[el.dataset.menu](); };
    });

    // tocar fora do menu o fecha
    document.addEventListener('click', e => {
      if (menu.classList.contains('aberto') && !menu.contains(e.target)
          && e.target.id !== 'btn-menu') fecharMenu();
    });

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
    document.querySelectorAll('.aba-tirinha').forEach(el => {
      el.onclick = () => this.mostrarAbaTirinha(el.dataset.aba);
    });

    document.onkeydown = e => {
      if (e.target.matches('input, select, textarea')) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === 'Escape') this.fecharPaineis();
      if (e.key === 'ArrowLeft') this.passo(-1);
      if (e.key === 'ArrowRight') this.passo(1);
      if (e.key === '/') {
        e.preventDefault();
        this.desenharFiltros();
        this.abrir('painel-busca');
        setTimeout(() => document.getElementById('campo-busca').focus(), 220);
      }
    };
  },

  /* =========================================================== marcadores */

  /** Toque simples: poe ou tira o ponto de leitura, na hora. */
  marcarPonto(vers) {
    // o realce (foco) que a tirinha deixa ao abrir por toque duplo precisa sair
    // quando a pessoa toca noutro versiculo — senao fica preso na tela
    document.querySelectorAll('#folha .v.foco').forEach(x => x.classList.remove('foco'));
    this.destaque = null;

    const versificacao = Dados.versificacaoDe(this.versao);
    const posto = Ponto.alternar(versificacao, this.code, this.cap, vers);
    Leitura.pintarPonto(vers, posto);

    // com as referências fixas ligadas, tocar num versículo filtra as dele;
    // tocar de novo no mesmo (tirando o ponto) volta às do capítulo todo
    if (Prefs.get('refsFixas')) {
      this.destaque = posto ? vers : null;
      this.atualizarRefsFixas(this.destaque);
    }
  },

  /* ==================================================== referências fixas
   *
   * Quando ligada nos Ajustes, esta faixa divide a tela: o texto em cima
   * (maior) e as referências cruzadas embaixo. Sem versículo selecionado, mostra
   * as do capítulo inteiro; ao tocar num versículo, filtra pelas dele. Tocar
   * numa referência abre o texto dela embaixo, com volta — sem sair do livro.
   */
  aplicarRefsFixas(ligado) {
    document.body.classList.toggle('com-refs-fixas', ligado);
    const painel = document.getElementById('painel-refs-fixas');
    painel.setAttribute('aria-hidden', ligado ? 'false' : 'true');
    if (ligado) this.atualizarRefsFixas();
  },

  async atualizarRefsFixas(vers = null) {
    if (!Prefs.get('refsFixas')) return;
    const corpo = document.getElementById('corpo-refs-fixas');
    const titulo = document.getElementById('titulo-refs-fixas');
    const nome = Dados.nomeCurto(this.versao, this.code);

    if (vers) {
      titulo.textContent = `Referências de ${nome} ${this.cap}:${vers}`;
      corpo.innerHTML = '<div class="estado">Buscando…</div>';
      const refs = await Dados.referenciasDe(this.versao, this.code, this.cap, vers);
      this.pintarRefsFixas(corpo, refs);
    } else {
      // capítulo todo: reúne as referências de cada versículo, marcando a origem
      titulo.textContent = `Referências de ${nome} ${this.cap}`;
      corpo.innerHTML = '<div class="estado">Buscando…</div>';
      const dados = await Dados.carregarRefs(this.code);
      if (!dados) { corpo.innerHTML = '<div class="estado">Sem referências para este livro.</div>'; return; }

      let capProt = this.cap;
      if (Dados.versificacaoDe(this.versao) === 'vulgata') {
        capProt = Dados.converter(this.code, this.cap, 'vulgata', 'hebraica').capitulo;
      }
      const doCap = dados[String(capProt)] || {};
      const lista = [];
      for (const v of Object.keys(doCap).sort((a, b) => +a - +b)) {
        for (const r of doCap[v]) lista.push({ ...r, origem: +v });
      }
      this.pintarRefsFixas(corpo, lista, true);
    }
  },

  pintarRefsFixas(corpo, refs, comOrigem = false) {
    if (!refs.length) {
      corpo.innerHTML = '<div class="estado">Nenhuma referência aqui.</div>';
      return;
    }
    const linha = r => {
      const ate = r.vFim !== r.vIni ? `-${r.vFim}` : '';
      const nome = Dados.nomeCurto(this.versao, r.code);
      const origem = comOrigem ? `<span class="ref-origem">v.${r.origem}</span>` : '';
      const contestada = r.votos < 0 ? ' contestada' : '';
      return `<button class="ref-linha${contestada}"
          data-ref="${r.code}|${r.cap}|${r.vIni}|${r.vFim}">
        <span class="ref-cabeca">
          <span class="ref-alvo">${origem}${nome} ${r.cap}:${r.vIni}${ate}</span>
          <span class="ref-votos">${r.votos}</span>
        </span>
        <span class="ref-trecho" data-trecho="${r.code}|${r.cap}|${r.vIni}">…</span>
      </button>`;
    };
    corpo.innerHTML = `<div class="lista-refs-linhas">${refs.map(linha).join('')}</div>`;
    corpo.querySelectorAll('[data-ref]').forEach(el => {
      el.onclick = () => {
        const [code, cap, vIni, vFim] = el.dataset.ref.split('|');
        this.abrirTextoRefFixa(code, +cap, +vIni, +vFim);
      };
    });
    // preenche o começo do texto de cada linha, como na tirinha
    this.preencherTrechosRefs(corpo);
  },

  async abrirTextoRefFixa(code, cap, vIni, vFim) {
    const corpo = document.getElementById('corpo-refs-fixas');
    corpo.innerHTML = '<div class="estado">Abrindo…</div>';

    let capLocal = cap;
    if (Dados.versificacaoDe(this.versao) === 'vulgata') {
      capLocal = Dados.converter(code, cap, 'hebraica', 'vulgata').capitulo;
    }

    let versos = [], nomeLivro = Dados.nomeCurto(this.versao, code);
    try {
      const r = await Dados.capitulo(this.versao, code, capLocal);
      if (r) {
        nomeLivro = r.livro.name;
        versos = r.capitulo.verses.filter(v => v.number >= vIni && v.number <= vFim + 6);
      }
    } catch { /* ausente */ }

    const ref = `${nomeLivro} ${capLocal}:${vIni}` + (vFim !== vIni ? `-${vFim}` : '');
    const texto = versos.length
      ? versos.map(v => {
          const foco = v.number >= vIni && v.number <= vFim ? ' em-foco' : '';
          return `<p class="verso-ref${foco}"><span class="n">${v.number}</span>${Leitura.escapar(v.text || '')}</p>`;
        }).join('')
      : '<div class="estado">Texto não disponível nesta versão.</div>';

    corpo.innerHTML = `
      <div class="cabeca-ref-texto">
        <button class="voltar-etapa" id="voltar-refs-fixas">← Referências</button>
        <strong>${ref}</strong>
      </div>
      <div class="texto-ref">${texto}</div>
      <button class="botao" id="ir-ref-fixa" style="width:100%;margin-top:10px">
        Ir para ${nomeLivro} ${capLocal}</button>`;

    document.getElementById('voltar-refs-fixas').onclick = () =>
      this.atualizarRefsFixas(this.destaque);
    document.getElementById('ir-ref-fixa').onclick = () => this.pularParaReferencia(code, capLocal, vIni);
  },

  abrirTirinha(vers) {
    this.destaque = vers;
    this.abaTirinha = 'versoes';
    document.querySelectorAll('.v.foco').forEach(x => x.classList.remove('foco'));
    document.querySelectorAll(`#folha .v[data-vers="${vers}"]`)
      .forEach(x => x.classList.add('foco'));
    this.mostrarAbaTirinha('versoes');
    const t = document.getElementById('tirinha');
    t.classList.add('aberta');
    t.setAttribute('aria-hidden', 'false');
  },

  mostrarAbaTirinha(aba) {
    this.abaTirinha = aba;
    document.querySelectorAll('.aba-tirinha').forEach(el =>
      el.classList.toggle('ativa', el.dataset.aba === aba));
    // "Marcar" só vale para o versículo em si (aba Versões)
    document.getElementById('tirinha-marcar').style.display =
      aba === 'versoes' ? '' : 'none';
    if (aba === 'versoes') {
      const t = document.getElementById('tirinha');
      t.classList.remove('alta');
      const cab = document.getElementById('tirinha-ref');
      if (cab.dataset.base) { cab.textContent = cab.dataset.base; delete cab.dataset.base; }
      Leitura.tirinha(this.code, this.cap, this.destaque, this.versao);
    } else {
      this.desenharReferencias();
    }
  },

  /* As passagens relacionadas ao versiculo, vindas do Treasury of Scripture
   * Knowledge. Vem ordenadas por voto, da conexão mais forte para a mais
   * fraca. */
  async desenharReferencias() {
    const corpo = document.getElementById('tirinha-corpo');
    const cabecalho = document.getElementById('tirinha-ref');
    corpo.innerHTML = '<div class="estado">Buscando referências…</div>';

    // a tirinha volta à altura normal quando mostra a lista
    document.getElementById('tirinha').classList.remove('alta');

    const todas = await Dados.referenciasDe(this.versao, this.code, this.cap, this.destaque);

    if (!todas.length) {
      corpo.innerHTML = `<div class="estado">Nenhuma referência cruzada para
        este versículo.<br><span class="sub">Elas vêm do Treasury of Scripture
        Knowledge; nem todo versículo tem.</span></div>`;
      return;
    }

    // a quantidade aparece ao lado do título, no cabeçalho da tirinha
    const refOriginal = cabecalho.dataset.base || cabecalho.textContent;
    cabecalho.dataset.base = refOriginal;
    cabecalho.innerHTML = `${refOriginal} <span class="conta-refs">${todas.length} referência${todas.length > 1 ? 's' : ''}</span>`;

    const linha = r => {
      const ate = r.vFim !== r.vIni ? `-${r.vFim}` : '';
      const nome = Dados.nomeCurto(this.versao, r.code);
      const contestada = r.votos < 0 ? ' contestada' : '';
      return `<button class="ref-linha${contestada}"
          data-ref="${r.code}|${r.cap}|${r.vIni}|${r.vFim}">
        <span class="ref-cabeca">
          <span class="ref-alvo">${nome} ${r.cap}:${r.vIni}${ate}</span>
          <span class="ref-votos">${r.votos}</span>
        </span>
        <span class="ref-trecho" data-trecho="${r.code}|${r.cap}|${r.vIni}">…</span>
      </button>`;
    };

    corpo.innerHTML = `<div class="lista-refs-linhas">${todas.map(linha).join('')}</div>`;

    corpo.querySelectorAll('[data-ref]').forEach(el => {
      el.onclick = () => {
        const [code, cap, vIni, vFim] = el.dataset.ref.split('|');
        this.abrirTextoDaReferencia(code, +cap, +vIni, +vFim);
      };
    });

    // preenche os trechos aos poucos, sem travar a lista
    this.preencherTrechosRefs(corpo);
  },

  /* Busca o começo do texto de cada referência e preenche a linha. Em paralelo,
   * mas agrupado por capítulo para não recarregar o mesmo várias vezes. */
  async preencherTrechosRefs(corpo) {
    const alvos = [...corpo.querySelectorAll('[data-trecho]')];
    const porCapitulo = new Map();
    for (const el of alvos) {
      const [code, cap] = el.dataset.trecho.split('|');
      const chave = `${code}|${cap}`;
      if (!porCapitulo.has(chave)) porCapitulo.set(chave, []);
      porCapitulo.get(chave).push(el);
    }

    for (const [chave, els] of porCapitulo) {
      const [code, capProt] = chave.split('|');
      let capLocal = +capProt;
      if (Dados.versificacaoDe(this.versao) === 'vulgata') {
        capLocal = Dados.converter(code, +capProt, 'hebraica', 'vulgata').capitulo;
      }
      try {
        const r = await Dados.capitulo(this.versao, code, capLocal);
        if (!r) { els.forEach(e => e.textContent = ''); continue; }
        for (const el of els) {
          const vers = +el.dataset.trecho.split('|')[2];
          const v = r.capitulo.verses.find(x => x.number === vers);
          const t = v && v.text ? v.text : '';
          el.textContent = t.length > 90 ? t.slice(0, 90) + '…' : t;
        }
      } catch {
        els.forEach(e => e.textContent = '');
      }
    }
  },

  /* Ao tocar numa referência, o texto dela aparece aqui mesmo, sem sair do
   * livro principal. A pessoa lê, rola, e volta — ou pula de vez para aquele
   * capítulo, se quiser. */
  async abrirTextoDaReferencia(code, cap, vIni, vFim) {
    const corpo = document.getElementById('tirinha-corpo');
    corpo.innerHTML = '<div class="estado">Abrindo o texto…</div>';

    // ao abrir o texto, a tirinha cresce para caber a leitura (cerca de 75%)
    document.getElementById('tirinha').classList.add('alta');

    let capLocal = cap;
    if (Dados.versificacaoDe(this.versao) === 'vulgata') {
      capLocal = Dados.converter(code, cap, 'hebraica', 'vulgata').capitulo;
    }

    let versos = [];
    let nomeLivro = Dados.nomeCurto(this.versao, code);
    try {
      const r = await Dados.capitulo(this.versao, code, capLocal);
      if (r) {
        nomeLivro = r.livro.name;
        const ate = vFim + 8;
        versos = r.capitulo.verses.filter(v => v.number >= vIni && v.number <= ate);
      }
    } catch { /* livro ausente nesta versão */ }

    const ref = `${nomeLivro} ${capLocal}:${vIni}` + (vFim !== vIni ? `-${vFim}` : '');

    const corpoTexto = versos.length
      ? versos.map(v => {
          const destaque = v.number >= vIni && v.number <= vFim ? ' em-foco' : '';
          return `<p class="verso-ref${destaque}"><span class="n">${v.number}</span>${Leitura.escapar(v.text || '')}</p>`;
        }).join('')
      : '<div class="estado">Texto não disponível nesta versão.</div>';

    // botões lado a lado; o "ir" usa nome curto, que cabe em livros de nome longo
    const nomeCurto = Dados.nomeCurto(this.versao, code);
    corpo.innerHTML = `
      <div class="cabeca-ref-texto"><strong>${ref}</strong></div>
      <div class="texto-ref">${corpoTexto}</div>
      <div class="acoes-ref">
        <button class="botao secundario" id="voltar-refs">← Voltar</button>
        <button class="botao" id="ir-ref-cap">Ir para ${nomeCurto} ${capLocal}</button>
      </div>`;

    document.getElementById('voltar-refs').onclick = () => this.desenharReferencias();
    document.getElementById('ir-ref-cap').onclick = () => {
      this.fecharTirinha();
      this.pularParaReferencia(code, capLocal, vIni);
    };
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
