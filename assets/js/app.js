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

  /* Sanfona no histórico: cada leitura abre uma por vez. Com muitas sessões,
   * a lista corrida virava um paredão sem fim. */
  dobraH: undefined,

  desenharHistorico() {
    const corpo = document.getElementById('corpo-historico');
    const sessoes = Sessoes.todas().slice().reverse().filter(s => s.itens.length || s.aberta);

    if (this.dobraH === undefined) {
      const aberta = sessoes.find(s => s.aberta);
      this.dobraH = aberta ? aberta.id : (sessoes[0] ? sessoes[0].id : null);
    }

    const cabecalho = `
      <button class="botao" id="btn-salvar-sessao" style="width:100%">
        Salvar esta leitura e iniciar outra</button>
      <p class="contagem" style="margin-top:8px">O histórico grava sozinho e
      nunca apaga nada. Salvar apenas fecha a leitura atual e abre uma folha limpa.</p>`;

    const blocos = sessoes.map(s => {
      const aberto = this.dobraH === s.id;

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

      return `<button class="dobra sessao" data-h="${s.id}" aria-expanded="${aberto}">
          <span class="seta">▶</span>
          <span class="nome-sessao">
            <strong>${Leitura.escapar(Sessoes.nomeDe(s))}</strong>
            <span class="quando">${Sessoes.quandoDe(s)}</span>
          </span>
          ${s.aberta ? '<span class="marca-aberta">Em andamento</span>' : ''}
          <span class="soma">${s.itens.length}</span>
        </button>
        <div class="dentro ${aberto ? '' : 'fechada'}">
          <div class="acoes-sessao">
            <button class="pilula" data-renomear="${s.id}">Renomear</button>
            <button class="pilula" data-partilhar="${s.id}">Compartilhar</button>
            <button class="pilula" data-copiar-sessao="${s.id}">Copiar</button>
          </div>
          ${itens || '<p class="contagem">Nenhuma passagem ainda.</p>'}
        </div>`;
    }).join('');

    corpo.innerHTML = cabecalho + (blocos || '<div class="estado">Nada no histórico ainda.</div>');

    document.getElementById('btn-salvar-sessao').onclick = () => {
      const nome = prompt('Nome desta leitura (opcional):', '');
      if (nome === null) return;
      Sessoes.salvar(nome.trim());
      this.dobraH = undefined;
      this.desenharHistorico();
    };

    corpo.querySelectorAll('[data-h]').forEach(el => {
      el.onclick = () => {
        this.dobraH = this.dobraH === el.dataset.h ? null : el.dataset.h;
        this.desenharHistorico();
      };
    });

    const achar = id => Sessoes.todas().find(x => x.id === id);

    corpo.querySelectorAll('[data-renomear]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const s = achar(el.dataset.renomear);
        const nome = prompt('Nome desta leitura:', s ? s.nome : '');
        if (nome === null) return;
        Sessoes.renomear(el.dataset.renomear, nome.trim());
        this.desenharHistorico();
      };
    });

    corpo.querySelectorAll('[data-partilhar]').forEach(el => {
      el.onclick = async e => {
        e.stopPropagation();
        const s = achar(el.dataset.partilhar);
        if (!s) return;
        const texto = Sessoes.comoTexto(s);
        if (navigator.share) {
          try { await navigator.share({ title: Sessoes.nomeDe(s), text: texto }); }
          catch { /* desistiu: não é erro */ }
        } else {
          await this.paraAreaDeTransferencia(texto);
          this.avisoRapido('Copiado — cole onde quiser');
        }
      };
    });

    corpo.querySelectorAll('[data-copiar-sessao]').forEach(el => {
      el.onclick = async e => {
        e.stopPropagation();
        const s = achar(el.dataset.copiarSessao);
        if (!s) return;
        await this.paraAreaDeTransferencia(Sessoes.comoTexto(s));
        this.avisoRapido('Leitura copiada');
      };
    });

    corpo.querySelectorAll('.item-hist').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const s = achar(el.dataset.s);
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
    q('btn-marcadores').onclick = () => { this.desenharMarcadores(); this.abrir('painel-marcadores'); };
    q('btn-historico').onclick = () => { this.desenharHistorico(); this.abrir('painel-historico'); };
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
        // mostra o pedaço que foi marcado, não o versículo todo
        const fim = it.f == null ? inteiro.length : it.f;
        texto = inteiro.slice(it.i || 0, fim).trim();
        parcial = (it.i || 0) > 0 || fim < inteiro.length;
      } catch { /* livro ausente nesta versão: mostra só a referência */ }
      return { ...it, capLocal: conv.capitulo, exato: conv.exato, texto, parcial };
    }));

    // ordem de leitura da Bíblia, não a ordem em que foram marcados
    lidos.sort((a, b) => {
      const d = ordem.indexOf(a.code) - ordem.indexOf(b.code);
      return d !== 0 ? d : (a.capLocal - b.capLocal || a.vers - b.vers);
    });

    corpo.innerHTML = voltar
      + `<p class="contagem" style="margin-bottom:10px">${lidos.length}
         versículo${lidos.length > 1 ? 's' : ''} neste marcador.</p>`
      + lidos.map((it, i) => `<button class="item-marcado" data-i="${i}"
          style="--marca-cor:${m.cor}">
          <span class="ref-marcado">${Leitura.escapar(Dados.nomeCurto(this.versao, it.code))}
            ${it.capLocal}:${it.vers}</span>
          ${it.exato ? '' : '<span class="sub">numeração diferente</span>'}
          <span class="trecho-marcado">${it.texto
            ? (it.parcial ? '…' : '')
              + Leitura.escapar(it.texto.slice(0, 120))
              + (it.texto.length > 120 || it.parcial ? '…' : '')
            : '(texto não disponível nesta versão)'}</span>
        </button>`).join('');

    document.getElementById('voltar-marcadores').onclick = () => this.desenharMarcadores();

    corpo.querySelectorAll('.item-marcado').forEach(el => {
      el.onclick = () => {
        const it = lidos[+el.dataset.i];
        this.fecharPaineis();
        this.ir(it.code, it.capLocal, it.vers);
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
