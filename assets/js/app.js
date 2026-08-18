/* Bíblia — aplicativo de leitura e estudo bíblico (PWA)
 * Copyright © 2026 Fabio
 *
 * Distribuído sob a licença Creative Commons
 * Atribuição-NãoComercial-CompartilhaIgual 4.0 Internacional (CC BY-NC-SA 4.0).
 * https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br
 *
 * Uso livre e gratuito, sem qualquer fim comercial. Feito para promover a fé
 * e servir às pessoas — não para ser vendido. Veja o arquivo LICENSE.
 */

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
    Pergaminho.aplicarIdade(p.pergaminhoIdade);
    Pergaminho.aplicarTema(p.historicoTema);
    Pergaminho.aplicarEstilo(p.estilo);
    Leitura.aplicarFonte(p.fonte);
    Leitura.aplicarModoVersiculo(p.versiculoPorLinha);
    Leitura.aplicarModoNotas(p.mostrarNotas);
    Leitura.aplicarSubtituloEstilo(p.subtituloEstilo);
    Leitura.aplicarSubtituloCor(p.subtituloCor);
    Leitura.aplicarSubtituloAlinhamento(p.subtituloAlinhamento);
    this.aplicarInterlinear(p.interlinearTranslit, p.interlinearInfo, p.interlinearAbrev);
    this.aplicarRefsFixas(p.refsFixas);

    // retoma sempre do último lugar visitado — é onde a pessoa parou de fato.
    // Os fixados são atalhos que ela aciona quando quiser, não o ponto de abertura.
    const ultimo = Historico.lista()[0];
    if (ultimo && Dados.versao(ultimo.versao)) {
      this.versao = ultimo.versao;
      this.code = ultimo.code;
      this.cap = ultimo.cap;
    }

    Locutor.preparar();   // já pede a lista de vozes do aparelho (chega assíncrona)
    Seletor.iniciar();    // troca as listas suspensas nativas pelas do tema
    this.ligarEventos();
    this.atualizarBotaoRecentes();   // mostra o relógio se já houver navegações
    // registra também a abertura: reabrir no mesmo lugar não duplica, porque o
    // Histórico traz a visita repetida para o topo em vez de acrescentar outra.
    await this.ir(this.code, this.cap, null);
    this.registrarServico();
    this.talvezBoasVindas();   // saudação de abertura, só na primeira visita
  },

  /* Saudação de boas-vindas: aparece uma única vez, na primeira abertura do
   * app. Explica o propósito — recurso gratuito, sem fim comercial — e some
   * para sempre depois de a pessoa confirmar. Marca a visita ANTES de mostrar,
   * para não reaparecer se a página recarregar com o aviso ainda aberto. */
  async talvezBoasVindas() {
    if (Guarda.ler('boasVindas', false)) return;   // já foi vista antes
    Guarda.gravar('boasVindas', true);
    await this.avisar({
      titulo: 'Bem-vindo à Bíblia',
      html:
        'Este aplicativo foi criado para <strong>promover a fé</strong> e o ' +
        'estudo da Palavra — um recurso <strong>gratuito</strong>, feito para ' +
        'servir às pessoas.<br><br>' +
        'Use e compartilhe à vontade. O único pedido é que ele ' +
        '<strong>nunca seja usado para lucro</strong>: foi feito com propósito, ' +
        'não para ser vendido.<br><br>' +
        '<span style="color:var(--tinta-fraca)">Distribuído sob a licença ' +
        'Creative Commons BY-NC-SA 4.0.</span>',
    });
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

  async ir(code, cap, vers, { registrar = true, desliza = 0, alvoTitulo = false } = {}) {
    if (Prefs.get('paginaModo') === 'continuo') return this._abrirContinuo(code, cap, vers, desliza, alvoTitulo);
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

    // trocar de capítulo zera a seleção de vários versículos e o botão "+"
    this.resetarMulti();
    this.pontoAtual = null;
    this.esconderMais();
    this.selecao = null;
    this.renderBarraSelecao();

    // versão de língua original (interlinear ou texto puro): o significado em
    // português vem do léxico Strong, que precisa estar carregado ANTES de
    // desenhar (a montagem é síncrona) — e alimenta o pop-up de estudo da palavra
    if (Dados.ehOriginal(this.versao)) {
      try { await Dados.carregarLexico(r.livro.lang); } catch {}
    }

    // divisoes tematicas deste capitulo (se ligadas): a montagem e sincrona,
    // entao carregamos antes e passamos prontas, igual ao lexico
    let secs = [];
    try { secs = await Dados.secoesParaLeitura(this.versao, r.livro.code, r.capitulo.number); } catch {}

    folha.innerHTML = `<p class="titulo-livro ${cap === 1 ? 'abertura' : ''}">${Leitura.escapar(r.livro.name)}</p>`
      + Leitura.html(this.versao, r.livro, r.capitulo, { secoes: secs });

    this.atualizarBarra();
    this._montarBotaoOuvirFolha();
    Pergaminho.folha(code, cap);   // cada capítulo tem a sua folha no estilo Histórico
    this._aplicarDeslize(folha, desliza);   // transição lateral ao trocar de capítulo
    window.scrollTo(0, 0);
    this._marcarCortados();   // no modo abreviar, marca as palavras que cortaram

    if (vers) {
      // no modo Subtitulos, a mira e o proprio cabecalho da secao (topo);
      // nos demais casos, o versiculo (centralizado, com destaque)
      const titulo = alvoTitulo && folha.querySelector(`.secao-titulo[data-inicio="${vers}"]`);
      if (titulo) {
        titulo.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else {
        const alvo = folha.querySelector(`.v[data-vers="${vers}"]`);
        if (alvo) {
          alvo.classList.add('foco');
          alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }

    // NAVEGAR não mexe no histórico nem no alfinete. Virar página, abrir um
    // capítulo ou pular para uma referência não registra nada: o que conta como
    // "estive aqui" é TOCAR num versículo (marcarPonto). Assim o alfinete não
    // "escorrega" de capítulo sozinho ao folhear, e a lista não enche de linhas
    // que a pessoa só passou por cima. (registrar fica só por compatibilidade
    // com chamadas antigas; o registro de verdade nasce do toque no versículo.)

    if (this.comparando) this.desenharComparacao();

    // ao abrir um capítulo, as referências fixas (se ligadas) mostram as dele
    if (Prefs.get('refsFixas')) {
      this.destaque = vers || null;
      this.atualizarRefsFixas(vers || null);
    }

    this._prefetchVizinhos();   // deixa anterior/próximo prontos para o arrasto
  },

  /* Modo Contínuo: empilha TODOS os capítulos do livro numa folha só, para rolar
   * um debaixo do outro. O nome do livro aparece uma vez no topo; cada capítulo
   * começa pela sua capitular (o número grande). O deslize lateral troca de livro
   * (ver passo/_alvoPasso). A edição de versículo fica no modo com quebra (3b). */
  async _abrirContinuo(code, capAlvo, vers, desliza = 0, alvoTitulo = false) {
    if (!this._pulandoDeReferencia && this.origemDaReferencia) this.esconderVoltarOrigem();
    const folha = document.getElementById('folha');
    folha.innerHTML = '<div class="estado">Abrindo…</div>';

    const info = Dados.infoLivro(this.versao, code);
    const total = info ? info.chapters : 1;
    let primeiro = null;
    const blocos = [];
    for (let n = 1; n <= total; n++) {
      let r;
      try { r = await Dados.capitulo(this.versao, code, n); } catch { r = null; }
      if (!r) continue;
      if (!primeiro) {
        primeiro = r;
        if (Dados.ehOriginal(this.versao)) { try { await Dados.carregarLexico(r.livro.lang); } catch {} }
      }
      let secsC = [];
      try { secsC = await Dados.secoesParaLeitura(this.versao, r.livro.code, r.capitulo.number); } catch {}
      blocos.push(`<section class="cap-bloco" data-cap="${n}">`
        + Leitura.html(this.versao, r.livro, r.capitulo, { secoes: secsC }) + `</section>`);
    }
    if (!primeiro) {
      folha.innerHTML = `<div class="estado">Não foi possível abrir ${Dados.nomeCurto(this.versao, code)}.</div>`;
      return;
    }

    this.code = code;
    this.cap = capAlvo || 1;
    this.destaque = vers || null;
    this._blocoAtivo = null;
    this.resetarMulti();
    this.pontoAtual = null;
    this.esconderMais();
    this.selecao = null;
    this.renderBarraSelecao();

    folha.innerHTML = `<p class="titulo-livro abertura">${Leitura.escapar(primeiro.livro.name)}</p>`
      + blocos.join('');
    this.atualizarBarra();
    this._montarBotaoOuvirFolha();
    Pergaminho.folha(code, this.cap);
    this._aplicarDeslize(folha, desliza);

    // rola até o capítulo alvo (topo logo abaixo da barra)
    const alvoBloco = folha.querySelector(`.cap-bloco[data-cap="${this.cap}"]`);
    const topoBarra = (document.querySelector('.topo') && document.querySelector('.topo').offsetHeight) || 52;
    if (this.cap > 1 && alvoBloco) {
      const y = alvoBloco.getBoundingClientRect().top + window.scrollY - topoBarra - 8;
      window.scrollTo(0, Math.max(0, y));
    } else {
      window.scrollTo(0, 0);
    }
    if (vers && alvoBloco) {
      const titulo = alvoTitulo && alvoBloco.querySelector(`.secao-titulo[data-inicio="${vers}"]`);
      if (titulo) {
        const y = titulo.getBoundingClientRect().top + window.scrollY - topoBarra - 8;
        window.scrollTo(0, Math.max(0, y));
      } else {
        const alvo = alvoBloco.querySelector(`.v[data-vers="${vers}"]`);
        if (alvo) { alvo.classList.add('foco'); alvo.scrollIntoView({ block: 'center' }); }
      }
    }
    this._marcarCortados();
    this._prefetchVizinhos();
  },

  /* Rolando no Contínuo, atualiza a referência do topo e o capítulo atual para o
   * capítulo que está no alto da tela. No modo com quebra é um no-op. */
  _spyCapitulo() {
    if (Prefs.get('paginaModo') !== 'continuo') return;
    const blocos = document.querySelectorAll('#folha .cap-bloco');
    if (!blocos.length) return;
    const topoBarra = (document.querySelector('.topo') && document.querySelector('.topo').offsetHeight) || 52;
    let atual = blocos[0];
    for (const bl of blocos) {
      if (bl.getBoundingClientRect().top <= topoBarra + 12) atual = bl; else break;
    }
    const cap = +atual.dataset.cap;
    if (cap !== this.cap) {
      this.cap = cap;
      const ref = document.getElementById('btn-ref');
      if (ref) ref.textContent = Dados.referencia(this.versao, this.code, cap);
    }
  },

  /* Onde os versículos "atuais" vivem: no modo com quebra é a folha inteira; no
   * Contínuo é o bloco do capítulo com que a pessoa está interagindo (definido no
   * toque e pela rolagem). Assim seleção/marcação/anotação endereçam o versículo
   * certo mesmo com vários capítulos empilhados. */
  _blocoAtivo: null,
  _escopoVersos() {
    if (Prefs.get('paginaModo') === 'continuo' && this._blocoAtivo && this._blocoAtivo.isConnected)
      return this._blocoAtivo;
    return document.getElementById('folha');
  },
  _qv(vers) { return this._escopoVersos().querySelector(`.v[data-vers="${vers}"]`); },

  atualizarBarra() {
    this.atualizarAtalhoFixado();
    document.getElementById('btn-ref').textContent =
      Dados.referencia(this.versao, this.code, this.cap);
    document.getElementById('sigla-versao').textContent = this.versao;
    // a engrenagem "Exibir" (dentro do quadradinho da versão) só no interlinear
    const ehInter = Dados.ehInterlinear(this.versao);
    const engrenagem = document.getElementById('btn-il-exibir');
    if (engrenagem) engrenagem.hidden = !ehInter;
    const caixa = document.getElementById('versao-box');
    if (caixa) caixa.classList.toggle('com-engrenagem', ehInter);

    const info = Dados.infoLivro(this.versao, this.code);
    const continuo = Prefs.get('paginaModo') === 'continuo';
    const temAntes = continuo ? Dados.vizinho(this.versao, this.code, -1)
                              : (this.cap > 1 || Dados.vizinho(this.versao, this.code, -1));
    const temDepois = continuo ? Dados.vizinho(this.versao, this.code, 1)
                               : ((info && this.cap < info.chapters) || Dados.vizinho(this.versao, this.code, 1));
    document.getElementById('btn-antes').disabled = !temAntes;
    document.getElementById('btn-depois').disabled = !temDepois;
  },

  /* transição de deslize ao trocar de capítulo: a página nova entra já pronta de
   * um lado. Próximo (dir>0) entra pela esquerda; anterior (dir<0), pela direita.
   * Respeita quem prefere menos animação. Vale para os botões E para o gesto —
   * ambos passam por passo(). */
  /* Para onde passo(dir) iria, SEM navegar — usado para pré-carregar o vizinho
   * e para o arrasto saber o destino. Retorna {code, cap} ou null (sem vizinho). */
  _alvoPasso(dir) {
    if (Prefs.get('paginaModo') === 'continuo') {
      const viz = Dados.vizinho(this.versao, this.code, dir);
      return viz ? { code: viz, cap: 1 } : null;
    }
    const info = Dados.infoLivro(this.versao, this.code);
    const cap = this.cap + dir;
    if (info && cap >= 1 && cap <= info.chapters) return { code: this.code, cap };
    const viz = Dados.vizinho(this.versao, this.code, dir);
    if (!viz) return null;
    const infoV = Dados.infoLivro(this.versao, viz);
    return { code: viz, cap: dir > 0 ? 1 : (infoV ? infoV.chapters : 1) };
  },

  /* Monta o HTML de um capítulo a partir dos dados já carregados (mesma forma
   * que ir() usa), para desenhar a folha vizinha durante o arrasto. */
  _htmlCapitulo(r, cap) {
    return `<p class="titulo-livro ${cap === 1 ? 'abertura' : ''}">${Leitura.escapar(r.livro.name)}</p>`
      + Leitura.html(this.versao, r.livro, r.capitulo, { secoes: r._secoes || [] });
  },

  /* Pré-carrega os dados dos capítulos anterior e próximo, para o arrasto poder
   * revelar a página vizinha instantaneamente. Guarda por versão|livro|capítulo. */
  _vizCache: {},
  async _prefetchVizinhos() {
    const alvos = [this._alvoPasso(-1), this._alvoPasso(1)].filter(Boolean);
    for (const a of alvos) {
      const k = `${this.versao}|${a.code}|${a.cap}`;
      if (this._vizCache[k]) continue;
      try {
        const r = await Dados.capitulo(this.versao, a.code, a.cap);
        if (r) {
          // ja deixa as divisoes tematicas prontas: o desenho do vizinho no
          // arrasto e sincrono e nao poderia esperar o arquivo carregar
          try { r._secoes = await Dados.secoesParaLeitura(this.versao, r.livro.code, r.capitulo.number); }
          catch { r._secoes = []; }
          this._vizCache[k] = r;
        }
      } catch {}
    }
  },

  /* Regra de "encaixar ou voltar" ao soltar: passou de ~30% da largura, ou foi
   * um lance rápido e decidido. Pura, para poder testar. */
  _decidirCommit(dx, larg, dt) {
    if (Math.abs(dx) > larg * 0.30) return true;
    if (dt < 300 && Math.abs(dx) > 60) return true;
    return false;
  },

  _aplicarDeslize(folha, desliza) {
    if (!desliza || !folha) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    folha.classList.remove('desliza-prox', 'desliza-ant');
    void folha.offsetWidth;                         // reinicia a animação
    folha.classList.add(desliza > 0 ? 'desliza-prox' : 'desliza-ant');
  },

  /* Virar a página pelo ARRASTO nunca mira um versículo: deve começar no topo.
   * Algo (reflow tardio de fonte/fundo, ou a restauração de rolagem do próprio
   * navegador) empurra a página de volta à posição antiga ALGUNS instantes
   * depois — os reforços de poucos quadros não alcançam. Então reafirmamos o
   * topo numa janela maior (até ~350ms) e também quando as fontes terminam de
   * carregar. Logo após soltar o dedo a pessoa não está rolando, então prender
   * o topo por esse tempinho não atrapalha. */
  _irAoTopoPaginaVirada() {
    const topo = () => {
      try { window.scrollTo(0, 0); } catch (e) {}
      const se = document.scrollingElement || document.documentElement;
      if (se) se.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };
    topo();
    requestAnimationFrame(() => { topo(); requestAnimationFrame(topo); });
    [60, 160, 350].forEach(ms => setTimeout(topo, ms));
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(topo).catch(() => {});
    }
  },

  async passo(dir) {
    if (Prefs.get('paginaModo') === 'continuo') {         // horizontal troca de LIVRO
      const viz = Dados.vizinho(this.versao, this.code, dir);
      if (!viz) return;
      return this.ir(viz, 1, undefined, { desliza: dir });
    }
    const info = Dados.infoLivro(this.versao, this.code);
    let cap = this.cap + dir;

    if (info && cap >= 1 && cap <= info.chapters) return this.ir(this.code, cap, undefined, { desliza: dir });

    const vizinho = Dados.vizinho(this.versao, this.code, dir);
    if (!vizinho) return;
    const infoV = Dados.infoLivro(this.versao, vizinho);
    return this.ir(vizinho, dir > 0 ? 1 : (infoV ? infoV.chapters : 1), undefined, { desliza: dir });
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

  /* ========================================================== interlinear */

  /* Botão de engrenagem "Exibir em cada palavra". Fica ao lado do seletor de
   * versão (no topo e, na comparação, no cabeçalho de cada metade). Só aparece
   * em versão interlinear; abre o pop-up que controla transliteração, português/
   * morfologia e abreviar. */
  htmlEngrenagemIl() {
    return `<button class="btn-il-exibir" type="button" title="Exibir em cada palavra"
      aria-label="Exibir em cada palavra" aria-haspopup="dialog">
      <svg class="icone"><use href="#i-ajustes"/></svg>
    </button>`;
  },

  /* Liga/desliga as camadas do interlinear por data-atributo na raiz; o CSS
   * cuida do resto. A transliteração (.il-t) é independente. O português (.il-g)
   * e a morfologia (.il-m) se excluem: 'info' vale 'pt', 'morfo' ou 'nada'. O
   * abreviar corta o começo do texto para alinhar as colunas. */
  aplicarInterlinear(translit, info, abrev) {
    const r = document.documentElement;
    r.dataset.ilTranslit = translit ? 'sim' : 'nao';
    r.dataset.ilInfo = (info === 'morfo' || info === 'nada') ? info : 'pt';
    r.dataset.ilAbrev = abrev ? 'sim' : 'nao';
    this._marcarCortados();
  },

  /* No modo abreviar, marca com "+" só as palavras cujo texto realmente foi
   * cortado (mede o transbordo do span interno). Fora do modo, limpa as marcas.
   * Roda depois de desenhar o capítulo e a cada troca no pop-up "Exibir". */
  _marcarCortados() {
    const abrev = document.documentElement.dataset.ilAbrev === 'sim';
    if (!abrev) {
      document.querySelectorAll('.il-cortado').forEach(e => e.classList.remove('il-cortado'));
      return;
    }
    // deixa o layout assentar antes de medir (evita medir com largura 0)
    requestAnimationFrame(() => {
      document.querySelectorAll('#folha .il-g, #folha .il-m-c').forEach(cont => {
        const txt = cont.querySelector('.il-txt');
        if (!txt) return;
        // elementos escondidos (modo oposto) medem 0 e nunca ganham "+"
        const cortou = txt.scrollWidth > txt.clientWidth + 1;
        cont.classList.toggle('il-cortado', cortou);
      });
    });
  },

  abrirExibirInterlinear() {
    const cx = document.getElementById('il-translit');
    if (cx) cx.checked = Prefs.get('interlinearTranslit');
    const ca = document.getElementById('il-abrev');
    if (ca) ca.checked = Prefs.get('interlinearAbrev');
    // marca o rádio certo (português / morfologia / nenhum)
    const info = Prefs.get('interlinearInfo') || 'pt';
    const alvo = document.getElementById(
      info === 'morfo' ? 'il-morfo' : info === 'nada' ? 'il-nada' : 'il-pt');
    if (alvo) alvo.checked = true;
    this._atualizarAbrevDisponivel();     // "Abreviar" inativo quando "Nenhum"
    document.getElementById('il-veu').classList.add('aberto');
    document.getElementById('il-veu').setAttribute('aria-hidden', 'false');
  },

  /* "Abreviar" pertence à informação de baixo: só faz sentido com português ou
   * morfologia ativos. Com "Nenhum", fica inativo (esmaecido e sem clique). */
  _atualizarAbrevDisponivel() {
    const info = Prefs.get('interlinearInfo') || 'pt';
    const vale = info === 'pt' || info === 'morfo';
    const cx = document.getElementById('il-abrev');
    const opc = document.getElementById('il-abrev-opcao');
    if (cx) cx.disabled = !vale;
    if (opc) opc.classList.toggle('inativa', !vale);
  },

  fecharExibirInterlinear() {
    const veu = document.getElementById('il-veu');
    if (!veu) return;
    veu.classList.remove('aberto');
    veu.setAttribute('aria-hidden', 'true');
  },

  alternarInterlinear(qual, valor) {
    if (qual === 'translit') Prefs.set('interlinearTranslit', valor);
    else if (qual === 'abrev') Prefs.set('interlinearAbrev', valor);
    else Prefs.set('interlinearInfo', valor);   // 'pt' | 'morfo' | 'nada'
    this.aplicarInterlinear(
      Prefs.get('interlinearTranslit'), Prefs.get('interlinearInfo'), Prefs.get('interlinearAbrev'));
    if (qual === 'info') this._atualizarAbrevDisponivel();   // "Nenhum" inativa o abreviar
  },

  /* Abre o estudo de uma palavra do interlinear a partir do bloco `.il-p`
   * tocado. Lê os dados que já estão no DOM (original, transliteração, português
   * do léxico, morfologia decodificada por extenso, Strong e lema) — assim serve
   * tanto à leitura normal quanto às duas metades da comparação, sem depender de
   * qual versão está em cada lado. */
  abrirPalavraInterlinear(palavraEl) {
    if (!palavraEl) return;
    const q = id => document.getElementById(id);
    const txt = sel => { const e = palavraEl.querySelector(sel); return e ? e.textContent.trim() : ''; };

    const o = txt('.il-o');
    const t = txt('.il-t');
    const g = (palavraEl.querySelector('.il-g .il-txt') || {}).textContent || '';
    const mc = palavraEl.querySelector('.il-m-c');
    // no bloco de morfologia guardamos a forma por extenso no title; se faltar,
    // cai no código compacto que está visível
    const m = mc ? (mc.getAttribute('title') || mc.textContent || '').trim() : '';
    const s = (palavraEl.dataset.strong || txt('.il-m-s') || '').trim();
    const l = txt('.il-m-l');
    const rtl = !!palavraEl.closest('.il-rtl');

    const linha = (idLinha, idVal, valor, comDir) => {
      const box = q(idLinha);
      if (!box) return;
      if (!valor) { box.hidden = true; return; }
      box.hidden = false;
      const val = q(idVal);
      val.textContent = valor;
      val.dir = comDir && rtl ? 'rtl' : '';
    };

    const alvoO = q('pe-o');
    alvoO.textContent = o;
    alvoO.dir = rtl ? 'rtl' : '';
    linha('pe-linha-t', 'pe-t', t, false);
    linha('pe-linha-g', 'pe-g', g.trim(), false);
    linha('pe-linha-m', 'pe-m', m, false);
    linha('pe-linha-s', 'pe-s', s, false);
    linha('pe-linha-l', 'pe-l', l, true);   // lema é letra original

    const veu = q('palavra-veu');
    veu.classList.add('aberto');
    veu.setAttribute('aria-hidden', 'false');
  },

  fecharPalavraInterlinear() {
    const veu = document.getElementById('palavra-veu');
    if (!veu) return;
    veu.classList.remove('aberto');
    veu.setAttribute('aria-hidden', 'true');
  },

  /* ============================================================== painéis */

  abrir(id) {
    this.fecharPaineis();
    document.getElementById(id).classList.add('aberto');
    document.getElementById(id).setAttribute('aria-hidden', 'false');
    document.getElementById('veu').classList.add('aberto');
    // por padrão, "voltar" de um painel recém-aberto = fechar (voltar à Bíblia).
    // Cada tela que tem um passo anterior real sobrescreve isto depois de abrir.
    this._volta = null;
  },

  /* O "voltar" (seta à esquerda no cabeçalho): vai para a tela anterior desta,
   * definida por quem abriu. Sem anterior, fecha e volta à leitura. */
  voltar() {
    const anterior = this._volta;
    if (anterior) anterior();
    else this.fecharPaineis();
  },

  /* Reabre o menu flutuante do canto (o "menu anterior" de quem foi aberto por
   * ele), fechando o painel atual. */
  abrirMenuFlutuante() {
    this.fecharPaineis();
    const menu = document.getElementById('menu-flutuante');
    if (!menu) return;
    menu.classList.add('aberto');
    menu.setAttribute('aria-hidden', 'false');
  },

  /* Abre a lista de estudos e marca que, dali, voltar = menu. */
  _abrirEstudosLista() {
    this.desenharEstudos();
    this.abrir('painel-estudos');
    this._volta = () => this.abrirMenuFlutuante();
  },

  fecharPaineis() {
    document.querySelectorAll('.painel').forEach(p => {
      p.classList.remove('aberto');
      p.setAttribute('aria-hidden', 'true');
    });
    const visor = document.getElementById('visor-nota');
    if (visor) {
      visor.classList.remove('aberto');
      visor.setAttribute('aria-hidden', 'true');
    }
    document.getElementById('veu').classList.remove('aberto');
    this.fecharTirinha();
  },

  /* O botão de fixar no cabeçalho da tirinha é um interruptor: reflete o mesmo
   * estado das "Referências fixas na tela" dos Ajustes. Ligado, mostra o ícone
   * de desfixar; um toque aqui ou lá desliga, e os dois lados acompanham. */
  sincronizarBotaoFixarTirinha() {
    const btn = document.getElementById('tirinha-fixar');
    if (!btn) return;
    const ligado = !!Prefs.get('refsFixas');
    btn.classList.toggle('ativo', ligado);
    btn.setAttribute('aria-pressed', ligado ? 'true' : 'false');
    const rotulo = ligado ? 'Desfixar referências da tela' : 'Fixar referências na tela';
    btn.setAttribute('aria-label', rotulo);
    btn.title = rotulo;
  },

  alternarFixarPelaTirinha() {
    const ligar = !Prefs.get('refsFixas');
    Prefs.set('refsFixas', ligar);
    this.aplicarRefsFixas(ligar);
    this.sincronizarBotaoFixarTirinha();
    // reflete no interruptor dos Ajustes, se estiver aberto
    const ctrl = document.getElementById('ctrl-refs-fixas');
    if (ctrl) ctrl.checked = ligar;
    if (ligar) {
      // fixa as referências do versículo em foco e fecha a tirinha,
      // dando a impressão de que ela "desceu" e virou o painel fixo
      this.atualizarRefsFixas(this.destaque || null);
      this.fecharTirinha();
    }
  },

  /* Desfixa direto pelo painel fixo (o X/alfinete ao lado do título). Desliga
   * as referências fixas e mantém a tirinha e os Ajustes em sincronia. */
  desligarRefsFixas() {
    Prefs.set('refsFixas', false);
    this.aplicarRefsFixas(false);
    this.sincronizarBotaoFixarTirinha();
    const ctrl = document.getElementById('ctrl-refs-fixas');
    if (ctrl) ctrl.checked = false;
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
    const capsVisiveis = Prefs.get('mostrarCapitulos');
    const sub = capsVisiveis ? `<span class="sub">${b.chapters || ''}</span>` : '';
    return `<button class="linha ${b.code === this.code ? 'ativa' : ''}"
      data-livro="${b.code}">
      <span>${b.name}</span>${selo}
      ${sub}
    </button>`;
  },

  // Redesenha o painel de livros só se ele estiver aberto na tela. Usado pelos
  // controles do popup contextual, pra a mudança aparecer ao vivo por trás do
  // cartão (trocar Lista/Estante, ligar categorias, etc.).
  _redesenharArvoreSeAberta() {
    const painel = document.getElementById('painel-arvore');
    if (painel && painel.classList.contains('aberto')) this.desenharArvore();
  },

  desenharArvore() {
    if (Prefs.get('painelLayout') === 'estante') return this._desenharEstante();
    const corpo = document.getElementById('corpo-arvore');
    const arv = Dados.arvore(this.versao);
    const comCategorias = Prefs.get('mostrarCategorias');
    const comCapitulos = Prefs.get('mostrarCapitulos');

    // Filtro do campo suspenso: 'tudo' (Toda a Bíblia) ou um Testamento. Na
    // primeira vez reflete o cenário atual — o Testamento aberto na Estante ou,
    // na falta dele, o do livro que está sendo lido. Depois respeita a escolha.
    if (this.listaFiltro == null) {
      const atual = Dados.infoLivro(this.versao, this.code);
      this.listaFiltro = this.estanteT || (atual ? atual.testament : 'tudo');
    }
    // se o Testamento guardado não existe neste cânone, cai em "Toda a Bíblia"
    if (this.listaFiltro !== 'tudo' && !arv.testaments.some(t => t.id === this.listaFiltro)) {
      this.listaFiltro = 'tudo';
    }

    const opcoes = [{ id: 'tudo', nome: 'Toda a Bíblia' }]
      .concat(arv.testaments.map(t => ({ id: t.id, nome: t.name })));
    const nomeAtual = (opcoes.find(o => o.id === this.listaFiltro) || opcoes[0]).nome;

    // quais Testamentos entram na lista, conforme o filtro
    const mostrarT = this.listaFiltro === 'tudo'
      ? arv.testaments
      : arv.testaments.filter(t => t.id === this.listaFiltro);

    // corpo: livros em lista corrida; categorias viram divisória fixa (não retrátil)
    const linhas = [];
    for (const t of mostrarT) {
      for (const c of t.categories) {
        if (comCategorias) linhas.push(`<div class="estante-divisor"><span>${c.name}</span></div>`);
        linhas.push(c.books.map(b => this.linhaLivro(b)).join(''));
      }
    }

    corpo.innerHTML = `
      <div class="lista-seletor">
        <div class="lista-campo-wrap">
          <button class="lista-campo" type="button" aria-haspopup="listbox" aria-expanded="false">
            <span class="lista-campo-nome">${nomeAtual}</span>
            <span class="lista-campo-seta">▾</span>
          </button>
          <div class="lista-opcoes" role="listbox" hidden>
            ${opcoes.map(o => `<button class="lista-opcao${o.id === this.listaFiltro ? ' sel' : ''}" type="button" role="option" data-f="${o.id}">${o.nome}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="lista-corpo">${linhas.join('')}</div>`;
    corpo.classList.add('modo-lista');
    corpo.classList.remove('modo-estante');
    document.getElementById('titulo-arvore').textContent = 'Livros';

    // abrir/fechar o campo suspenso
    const campo = corpo.querySelector('.lista-campo');
    const menu = corpo.querySelector('.lista-opcoes');
    campo.onclick = (e) => {
      e.stopPropagation();
      const abrir = menu.hidden;
      menu.hidden = !abrir;
      campo.setAttribute('aria-expanded', String(abrir));
    };
    // escolher uma opção
    corpo.querySelectorAll('.lista-opcao').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.listaFiltro = el.dataset.f;
        // mantém a Estante em sincronia: um Testamento vale nos dois modos
        // ("Toda a Bíblia" é exclusivo da Lista e não altera a Estante).
        if (this.listaFiltro !== 'tudo') this.estanteT = this.listaFiltro;
        this.desenharArvore();
      };
    });
    // um clique fora do campo fecha o menu (registrado uma única vez)
    this._ligarFechaMenuLista();

    corpo.querySelectorAll('[data-livro]').forEach(el => {
      el.onclick = () => this.desenharCapitulos(el.dataset.livro);
    });
  },

  /* Fecha o menu do campo suspenso da Lista ao clicar fora dele. O clique no
   * próprio campo/opções faz stopPropagation, então este handler só dispara
   * para cliques de fora. Registrado uma única vez. */
  _ligarFechaMenuLista() {
    if (this._fechaMenuListaLigado) return;
    this._fechaMenuListaLigado = true;
    document.addEventListener('click', () => {
      const menu = document.querySelector('#corpo-arvore .lista-opcoes');
      if (!menu || menu.hidden) return;
      menu.hidden = true;
      const campo = document.querySelector('#corpo-arvore .lista-campo');
      if (campo) campo.setAttribute('aria-expanded', 'false');
    });
  },

  /* Modo Estante: a grade de livros, no máximo dois por linha, com um seletor
   * de Testamentos no alto (as "capas") e divisórias de categoria entre os
   * livros. A capa não selecionada mostra a cor da encadernação; a selecionada
   * "abre" na cor da página. */
  estanteT: null,   // qual Testamento está aberto na estante

  _desenharEstante() {
    const corpo = document.getElementById('corpo-arvore');
    const arv = Dados.arvore(this.versao);
    const comCategorias = Prefs.get('mostrarCategorias');
    const comCapitulos = Prefs.get('mostrarCapitulos');

    // na primeira vez, abre no Testamento do livro atual; depois respeita a
    // escolha. Se o Testamento guardado não existe neste cânone, cai no 1º.
    if (this.estanteT == null) {
      const atual = Dados.infoLivro(this.versao, this.code);
      this.estanteT = atual ? atual.testament : (arv.testaments[0] && arv.testaments[0].id);
    }
    if (!arv.testaments.some(t => t.id === this.estanteT))
      this.estanteT = arv.testaments[0] && arv.testaments[0].id;

    const capas = arv.testaments.map(t => {
      let totalCaps = 0;
      for (const c of (t.categories || [])) {
        for (const b of (c.books || [])) {
          totalCaps += b.chapters || 0;
        }
      }
      const caps = comCapitulos && totalCaps
        ? `<span class="lc-caps lc-caps-test">${totalCaps} cap.</span>` : '';
      // quebra de linha SEMPRE garantida no nome do Testamento (destaque de título):
      // cada palavra em sua própria linha, em qualquer tela, pros dois ficarem simétricos.
      const nomeQuebrado = this._nomeTestamentoQuebrado(t.name);
      return `<button class="estante-capa ${t.id === this.estanteT ? 'sel' : ''}" data-est-t="${t.id}">
        <span class="lc-nome lc-nome-test">${nomeQuebrado}</span>
        ${caps}
      </button>`;
    }).join('');

    const t = arv.testaments.find(x => x.id === this.estanteT);
    const celulas = [];
    for (const c of (t ? t.categories : [])) {
      if (comCategorias)
        celulas.push(`<div class="estante-divisor"><span>${c.name}</span></div>`);
      for (const b of c.books) celulas.push(this._cartaoLivro(b, comCapitulos));
    }

    corpo.innerHTML =
      `<div class="estante">
        <div class="estante-seletor">
          <div class="estante-rotulo estante-rotulo-test">Testamentos</div>
          <div class="estante-capas-linha">${capas}</div>
        </div>
        <div class="estante-rotulo estante-rotulo-livros">Livros</div>
        <div class="estante-grade">${celulas.join('')}</div>
      </div>`;
    corpo.classList.add('modo-estante');
    corpo.classList.remove('modo-lista');

    document.getElementById('titulo-arvore').textContent = 'Livros';

    corpo.querySelectorAll('[data-est-t]').forEach(el => {
      el.onclick = () => {
        this.estanteT = el.dataset.estT;
        this.listaFiltro = this.estanteT;   // Lista acompanha o Testamento da Estante
        this._desenharEstante();
      };
    });
    corpo.querySelectorAll('[data-livro]').forEach(el => {
      el.onclick = () => this.desenharCapitulos(el.dataset.livro);
    });

    // todos os cartões com a mesma altura (a do mais alto), como folhas iguais
    this._uniformizarEstante();

    // ao girar/redimensionar o aparelho, remede uma vez (só se a estante estiver na tela)
    if (!this._estanteResizeLigado) {
      this._estanteResizeLigado = true;
      window.addEventListener('resize', () => {
        if (document.querySelector('#corpo-arvore .estante-grade')) this._uniformizarEstante();
      });
    }

    // Aplicar background do pergaminho aos botões
    this._aplicarBackgroundPergaminho(corpo.querySelectorAll('.livro-cartao'));
    this._aplicarBackgroundPergaminho(corpo.querySelectorAll('.estante-capa.sel'));
  },

  // Quebra o nome do Testamento em linhas fixas — cada palavra numa linha —
  // pra garantir que "Antigo Testamento" e "Novo Testamento" quebrem SEMPRE do
  // mesmo jeito, em qualquer tela, e nunca fiquem um em 1 linha e outro em 2.
  _nomeTestamentoQuebrado(nome) {
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return String(nome).trim().split(/\s+/)
      .map(p => `<span class="lc-linha">${esc(p)}</span>`).join('');
  },

  _cartaoLivro(b, comCapitulos) {
    const selo = b.deuterocanonical
      ? '<span class="selo">Deutero</span>'
      : (b.deutero_sections ? '<span class="selo">Cap. extras</span>' : '');
    const caps = comCapitulos && b.chapters
      ? `<span class="lc-caps">${b.chapters} cap.</span>` : '';
    return `<button class="livro-cartao ${b.code === this.code ? 'ativa' : ''}" data-livro="${b.code}">
      <span class="lc-nome">${b.name.toUpperCase()}</span>
      ${caps}${selo}
    </button>`;
  },

  _uniformizarEstante() {
    const corpo = document.getElementById('corpo-arvore');
    const grade = document.querySelector('#corpo-arvore .estante-grade');
    if (!grade) return;
    const cartoes = [...grade.querySelectorAll('.livro-cartao')];
    if (!cartoes.length) return;
    cartoes.forEach(c => { c.style.minHeight = ''; });   // zera para medir no natural
    const capas = [...document.querySelectorAll('#corpo-arvore .estante-capa')];
    requestAnimationFrame(() => {
      let maxA = 0;
      cartoes.forEach(c => { maxA = Math.max(maxA, c.offsetHeight); });
      if (maxA > 0) {
        cartoes.forEach(c => { c.style.minHeight = maxA + 'px'; });
        // as capas (Testamentos) nunca podem ser mais baixas que um livro:
        // usam a altura do livro como piso; se o conteúdo for maior, crescem.
        if (corpo) corpo.style.setProperty('--alt-livro', maxA + 'px');
      }
    });
  },

  _aplicarBackgroundPergaminho(elementos) {
    const perg = document.getElementById('perg-fundo');
    if (!perg) return;
    // Copiar o background do pergaminho pra cada elemento
    elementos.forEach(el => {
      el.style.backgroundImage = perg.style.backgroundImage;
      el.style.backgroundSize = perg.style.backgroundSize;
      el.style.backgroundRepeat = perg.style.backgroundRepeat;
      el.style.backgroundBlendMode = perg.style.backgroundBlendMode;
      el.style.backgroundColor = perg.style.backgroundColor;
    });
  },

  desenharCapitulos(code, aba) {
    // aba: 'capitulos' (grade de números, padrão) ou 'subtitulos' (lista de
    // divisões temáticas do livro). Ao entrar num livro sempre começa em
    // 'capitulos'; o alternador troca sem sair da tela.
    this._abaLivro = aba || 'capitulos';
    const corpo = document.getElementById('corpo-arvore');
    const info = Dados.infoLivro(this.versao, code);
    const nome = info ? info.name : code;

    const abaSel = this._abaLivro;
    corpo.innerHTML = `
      <button class="linha" id="voltar-livros" style="margin-bottom:12px">
        ← Todos os livros</button>
      <div class="alt-livro">
        <button data-aba="capitulos" class="${abaSel === 'capitulos' ? 'ativa' : ''}">Capítulos</button>
        <button data-aba="subtitulos" class="${abaSel === 'subtitulos' ? 'ativa' : ''}">Subtítulos</button>
      </div>
      <div id="conteudo-livro"></div>`;

    document.getElementById('titulo-arvore').textContent = nome;
    document.getElementById('voltar-livros').onclick = () => this.desenharArvore();
    corpo.querySelectorAll('.alt-livro [data-aba]').forEach(el => {
      el.onclick = () => this.desenharCapitulos(code, el.dataset.aba);
    });

    if (abaSel === 'subtitulos') this._preencherSubtitulosDoLivro(code);
    else this._preencherCapitulosDoLivro(code);
  },

  /* A grade de números de capítulo (conteúdo da aba Capítulos). */
  _preencherCapitulosDoLivro(code) {
    const alvo = document.getElementById('conteudo-livro');
    if (!alvo) return;
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

    alvo.innerHTML = `<div class="grupo"><h3>${info ? info.name : code}</h3>
      <div class="grade">${botoes.join('')}</div>${nota}</div>`;

    alvo.querySelectorAll('[data-cap]').forEach(el => {
      el.onclick = () => this.desenharVersiculosDoSeletor(code, +el.dataset.cap);
    });
  },

  /* A lista de subtítulos do livro inteiro (conteúdo da aba Subtítulos): título
   * à esquerda, capítulo:versículos à direita. Tocar abre a leitura rolando até
   * o próprio cabeçalho da seção. */
  async _preencherSubtitulosDoLivro(code) {
    const alvo = document.getElementById('conteudo-livro');
    if (!alvo) return;
    const info = Dados.infoLivro(this.versao, code);
    const nome = info ? info.name : code;
    alvo.innerHTML = '<div class="estado">Carregando…</div>';

    let lista = [];
    try { lista = await Dados.secoesDoLivroParaNavegacao(this.versao, code); } catch {}

    if (!lista.length) {
      const ligado = (typeof Prefs !== 'undefined') ? Prefs.get('subtitulosLigado') : true;
      const msg = ligado
        ? `${nome} não tem subtítulos nesta versão. Experimente o modo “completar com o favorito”, nos ajustes.`
        : `Os subtítulos estão desligados. Ligue-os nos ajustes para navegar por eles.`;
      alvo.innerHTML = `<p class="contagem" style="margin-top:6px">${msg}</p>`;
      return;
    }

    const linhas = lista.map(s => {
      const ref = s.inicio === s.fim ? `${s.capitulo}:${s.inicio}` : `${s.capitulo}:${s.inicio}-${s.fim}`;
      return `<button class="linha-secao" data-cap="${s.capitulo}" data-ini="${s.inicio}" data-fim="${s.fim}" data-titulo="${Leitura.escapar(s.titulo)}">
        <span class="secao-nome">${Leitura.escapar(s.titulo)}</span>
        <span class="secao-ref">${ref}</span></button>`;
    });

    alvo.innerHTML = `<div class="grupo"><h3>${nome} — subtítulos</h3>
      <div class="lista-secoes">${linhas.join('')}</div></div>`;

    // Tocar num subtítulo AQUI (no painel de navegação) apenas leva à seção,
    // rolando até o cabeçalho dela — como sempre foi. A SELEÇÃO fica por conta
    // do toque no próprio cabeçalho da seção dentro da página (ver tocarTituloSecao).
    alvo.querySelectorAll('.linha-secao').forEach(el => {
      el.onclick = () => {
        const cap = +el.dataset.cap;
        const ini = +el.dataset.ini;
        HistoricoNavegacao.registrarSubtitulo({
          versao: this.versao, code, cap, ini,
          fim: +el.dataset.fim || ini, titulo: el.dataset.titulo || '',
        });
        this.atualizarBotaoRecentes();
        this.fecharPaineis();
        this.ir(code, cap, ini, { alvoTitulo: true });
      };
    });
  },

  /** Último versículo de um capítulo (o maior número presente). Usado para
   *  calcular onde uma seção que cruza capítulos termina. */
  async _ultimoVersoCap(code, cap) {
    try {
      const r = await Dados.capitulo(this.versao, code, cap);
      if (r && r.capitulo && Array.isArray(r.capitulo.verses) && r.capitulo.verses.length)
        return Math.max(...r.capitulo.verses.map(v => v.number));
    } catch {}
    return null;
  },

  /** Onde uma seção termina de verdade. Como os subtítulos "continuam" pelos
   *  capítulos seguintes até o próximo aparecer, o fim é o versículo logo antes
   *  da PRÓXIMA seção (que pode estar vários capítulos adiante). Devolve
   *  {cap, vers}. */
  async _fimRealSecao(code, capIni, proxCap, proxIni) {
    // sem próxima seção: a seção vai até o fim do livro
    if (proxCap == null) {
      const info = Dados.infoLivro(this.versao, code);
      const ultimoCap = info ? info.chapters : capIni;
      const v = await this._ultimoVersoCap(code, ultimoCap);
      return { cap: ultimoCap, vers: v || 1 };
    }
    // próxima seção no mesmo capítulo: termina um versículo antes dela
    if (proxCap === capIni) return { cap: capIni, vers: Math.max(1, proxIni - 1) };
    // próxima começa no início de outro capítulo: termina no fim do capítulo anterior
    if (proxIni <= 1) {
      const capFim = proxCap - 1;
      const v = await this._ultimoVersoCap(code, capFim);
      return { cap: capFim, vers: v || 1 };
    }
    // próxima começa no meio de outro capítulo: termina um versículo antes dela
    return { cap: proxCap, vers: proxIni - 1 };
  },

  /** Toque no cabeçalho de uma seção DENTRO da página de leitura (o subtítulo
   *  renderizado no meio do texto). Seleciona os versículos da seção — a parte
   *  visível, no capítulo aberto — e mostra o intervalo completo na barra,
   *  inclusive quando a seção continua em capítulos seguintes. */
  async tocarTituloSecao(el) {
    const bloco = el.closest('.cap-bloco');
    const cap = bloco ? +bloco.dataset.cap : this.cap;
    const ini = +el.dataset.inicio;
    if (!Number.isFinite(cap) || !Number.isFinite(ini)) return;
    // acha esta seção e a seguinte na tabela do livro, para saber o fim real
    let lista = [];
    try { lista = await Dados.secoesDoLivroParaNavegacao(this.versao, this.code); } catch {}
    const idx = lista.findIndex(s => s.capitulo === cap && s.inicio === ini);
    const prox = idx >= 0 ? lista[idx + 1] : null;
    const fim = await this._fimRealSecao(this.code, cap, prox ? prox.capitulo : null, prox ? prox.inicio : null);
    // faixa visível: se a seção cruza capítulos, seleciona até o fim do capítulo aberto
    const tetoVisivel = (fim && fim.cap === cap) ? fim.vers : Infinity;
    const selecionou = this.selecionarFaixaVersiculos(cap, ini, tetoVisivel);
    // no segundo toque (que limpa) não há nada a estender
    if (!selecionou) return;
    // seção que continua em capítulos seguintes: acrescenta esses versículos à
    // seleção (do DOM no contínuo, do Dados no quebra) para que TODAS as ações —
    // copiar, compartilhar, tocar, marcar, lista, estudo — cubram o span inteiro
    if (fim && fim.cap > cap) await this._estenderSelecaoParaSecao(cap, ini, fim);
  },

  /** Estende a seleção da seção para além do capítulo visível. Marca o capítulo
   *  em cada pedaço (visível e seguinte) e grava `selecao.faixa` — o intervalo
   *  contínuo capIni:versIni–capFim:versFim — que passa a reger a referência, o
   *  rótulo "seção" e o formato salvo em Lista/Estudo. Só é chamada quando a
   *  seção cruza capítulos; seleções normais e seções de um capítulo não têm
   *  faixa e seguem exatamente como antes. */
  async _estenderSelecaoParaSecao(capIni, versIni, fim) {
    if (!this.selecao || !this.selecao.pedacos) return;
    const capFim = fim.cap, versFim = fim.vers;
    // o trecho já selecionado é o pedaço visível de capIni; carimba o capítulo
    for (const p of this.selecao.pedacos) if (p.cap == null) p.cap = capIni;
    // acrescenta os versículos dos capítulos seguintes da seção
    for (let c = capIni + 1; c <= capFim; c++) {
      const teto = (c === capFim) ? versFim : Infinity;
      const bloco = document.querySelector(`#folha .cap-bloco[data-cap="${c}"]`);
      if (bloco) {
        // capítulo na tela (modo contínuo): lê o texto da tela e pinta o realce
        for (const el of bloco.querySelectorAll('.v[data-vers]')) {
          const n = +el.dataset.vers;
          if (!(n >= 1 && n <= teto)) continue;
          const texto = this.textoDoVersiculo(el);
          if (!texto) continue;
          this.selecao.pedacos.push({ cap: c, vers: n, i: 0, f: texto.length, texto });
          el.classList.add('multi-sel');
        }
      } else {
        // capítulo fora da tela (modo quebra): carrega o texto sem DOM
        let r = null;
        try { r = await Dados.capitulo(this.versao, this.code, c); } catch {}
        const verses = (r && r.capitulo && r.capitulo.verses) || [];
        for (const v of verses) {
          if (!(v.number >= 1 && v.number <= teto) || !v.text) continue;
          this.selecao.pedacos.push({ cap: c, vers: v.number, i: 0, f: v.text.length, texto: v.text });
        }
      }
    }
    this.selecao.pedacos.sort((a, b) => (a.cap - b.cap) || (a.vers - b.vers));
    this.selecao.bruto = this.selecao.pedacos.map(p => p.texto).join(' ');
    this.selecao.faixa = { capInicio: capIni, versInicio: versIni, capFim, versFim };
    this.renderBarraSelecao();
  },

  /** Seleciona um intervalo de versículos [ini..fim] de um capítulo, como se
   *  fosse a seleção do capítulo inteiro — mas restrita à faixa da seção. Usado
   *  ao tocar num subtítulo. Reaproveita a mesma maquinaria da multi-seleção
   *  (multiVers + atualizarSelecaoMulti), então abre a barra de ações igual. */
  selecionarFaixaVersiculos(cap, ini, fim) {
    // no Contínuo, o escopo da seleção é o bloco tocado; aponta-o para o
    // capítulo do subtítulo antes de pintar, senão pintaria no bloco errado
    if (Prefs.get('paginaModo') === 'continuo') {
      const bloco = document.querySelector(`#folha .cap-bloco[data-cap="${cap}"]`);
      if (bloco) this._blocoAtivo = bloco;
    }
    // seleciona apenas os versículos que REALMENTE existem na tela dentro da
    // faixa [ini..fim] — assim funciona mesmo se o fim passar do capítulo
    // (seções que continuam em capítulos seguintes) ou houver numeração com falhas
    const teto = Number.isFinite(fim) ? fim : Infinity;
    const piso = Number.isFinite(ini) ? ini : 1;
    const presentes = [...this._escopoVersos().querySelectorAll('.v[data-vers]')]
      .map(el => +el.dataset.vers)
      .filter(n => Number.isFinite(n) && n >= piso && n <= teto);
    if (!presentes.length) return false;
    // alterna igual ao número do capítulo: se a faixa JÁ está toda selecionada,
    // o toque limpa; se está parcial ou vazia, completa a seleção
    this.multiVers = this.multiVers || new Set();
    const jaTodos = this.multiVers.size === presentes.length
      && presentes.every(v => this.multiVers.has(v));
    if (jaTodos) {
      this.resetarMulti();
      this.selecao = null;
      this.renderBarraSelecao();
      return false;
    }
    window.getSelection()?.removeAllRanges();   // larga qualquer seleção de texto
    this.multiAtivo = true;                      // mantém o modo de vários para ajustes
    this.multiVers = new Set(presentes);
    this._capSelecao = Prefs.get('paginaModo') === 'continuo' ? cap : null;
    this.atualizarSelecaoMulti();
    return true;
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
      <div class="grade-num">${grade.join('')}</div></div>`;

    document.getElementById('voltar-caps').onclick = () => this.desenharCapitulos(code);

    corpo.querySelectorAll('[data-v]').forEach(el => {
      el.onclick = () => {
        const v = +el.dataset.v;
        if (this.selVers === null) {
          // primeiro toque: vai até lá e abre o registro
          this.selVers = { ini: v, fim: v };
          HistoricoNavegacao.registrarVersiculo({
            versao: this.versao, code, cap, vers: v, versFim: v,
          });
          this.atualizarBotaoRecentes();
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
          HistoricoNavegacao.registrarVersiculo({
            versao: this.versao, code, cap,
            vers: this.selVers.ini, versFim: this.selVers.fim,
          });
          this.atualizarBotaoRecentes();
        }
      };
    });
  },

  /* ============================================================== versões */

  /* A mesma lista de versões serve em três lugares: o painel principal, os
   * Ajustes e a troca direta dentro da comparação. Uma só aparência, para a
   * pessoa reconhecer na hora onde quer que ela apareça. */
  htmlListaVersoes(selecionada, atributo = 'data-versao') {
    // as versões vão para três grupos: as marcadas com group:"original" (hebraico
    // e grego) ficam num grupo próprio, "Textos Originais"; as demais seguem pelo
    // cânone (protestante / católica)
    const grupos = { protestant: [], catholic: [], original: [] };
    Dados.versoes.forEach(v => {
      const g = v.group === 'original' ? 'original' : (grupos[v.canon] ? v.canon : 'protestant');
      grupos[g].push(v);
    });

    const bloco = (titulo, lista) => lista.length ? `<div class="grupo">
      <h3>${titulo}</h3>
      ${lista.map(v => `<button class="linha ${v.code === selecionada ? 'ativa' : ''}"
        ${atributo}="${v.code}">
        <span class="sigla" style="border-color:currentColor">${v.code}</span>
        <span>${v.name}</span>
        <span class="sub">${v.year || ''}</span>
      </button>`).join('')}
    </div>` : '';

    return bloco('Protestantes', grupos.protestant)
         + bloco('Católica', grupos.catholic)
         + bloco('Textos Originais', grupos.original);
  },

  desenharVersoes() {
    const corpo = document.getElementById('corpo-versao');
    const alvo = this.alvoVersao || 'principal';

    document.getElementById('titulo-versao').textContent =
      alvo === 'comparar' ? 'Versão de baixo' : alvo === 'busca' ? 'Versão da busca' : 'Versões';

    corpo.innerHTML = this.htmlListaVersoes(
      alvo === 'comparar' ? Prefs.get('versaoComparar')
        : alvo === 'busca' ? (this.versaoBusca || this.versao)
        : this.versao);

    corpo.querySelectorAll('[data-versao]').forEach(el => {
      el.onclick = () => {
        const code = el.dataset.versao;
        if (alvo === 'comparar') {
          // atalho: troca só a metade de baixo, sem sair da comparação
          Prefs.set('versaoComparar', code);
          this.alvoVersao = 'principal';
          this.fecharPaineis();
          if (this.comparando) this.desenharComparacao();
        } else if (alvo === 'busca') {
          // troca a versão da busca e volta ao painel de busca
          this.trocarVersaoBusca(code);
        } else {
          this.trocarVersao(code);
        }
      };
    });
  },

  /* ================================================================ busca */

  /* O escopo é escolhido em dois campos dependentes: o primeiro diz o NÍVEL
   * (toda a Bíblia, por testamento, por categoria ou por livro) e o segundo,
   * que só aparece quando faz sentido, o DETALHE (qual testamento, categoria ou
   * livro). Selects nativos: nada fecha sozinho e o layout não pula. */

  desenharFiltros() {
    const alvo = document.getElementById('filtros-busca');
    this.versaoBusca = this.versaoBusca || this.versao;
    const arv = Dados.arvore(this.versaoBusca);
    const e = Busca.escopo;
    const nivel = e.tipo;   // 'tudo' | 'testamento' | 'categoria' | 'livro'

    const niveis = [
      ['tudo', 'Toda a Bíblia'],
      ['testamento', 'Por Testamento'],
      ['categoria', 'Por Categoria'],
      ['livro', 'Por Livro'],
    ];
    const detalhes = this._opcoesDetalhe(nivel, arv);
    const temDetalhe = nivel !== 'tudo';

    alvo.innerHTML = `
      <label class="campo-rotulo">
        <span>Buscar em</span>
        <select class="campo-sel" id="busca-nivel">
          ${niveis.map(([v, t]) => `<option value="${v}" ${v === nivel ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
      <label class="campo-rotulo ${temDetalhe ? '' : 'oculto'}" id="busca-detalhe-rot">
        <span>Onde</span>
        <select class="campo-sel" id="busca-detalhe">
          ${detalhes.map(o => `<option value="${o.id}" ${o.id === e.id ? 'selected' : ''}>${Leitura.escapar(o.nome)}</option>`).join('')}
        </select>
      </label>`;

    // Campo 1: muda o nível. "Toda a Bíblia" some com o Campo 2 e busca global.
    document.getElementById('busca-nivel').onchange = ev => {
      const nv = ev.target.value;
      if (nv === 'tudo') {
        Busca.escopo = { tipo: 'tudo', id: null, nome: 'Toda a Bíblia' };
      } else {
        const ops = this._opcoesDetalhe(nv, arv);
        const primeiro = ops[0] || { id: null, nome: '' };
        Busca.escopo = { tipo: nv, id: primeiro.id, nome: primeiro.nome };
      }
      this.desenharFiltros();
      this.rodarBusca();
    };

    // Campo 2: escolhe o detalhamento dentro do nível.
    const det = document.getElementById('busca-detalhe');
    if (det) det.onchange = ev => {
      const id = ev.target.value;
      const nome = ev.target.selectedOptions[0].textContent.trim();
      Busca.escopo = { tipo: nivel, id, nome };
      this.rodarBusca();
    };
  },

  /** As opções do segundo campo, conforme o nível escolhido no primeiro. */
  _opcoesDetalhe(nivel, arv) {
    arv = arv || Dados.arvore(this.versaoBusca || this.versao);
    if (nivel === 'testamento') return arv.testaments.map(t => ({ id: t.id, nome: t.name }));
    if (nivel === 'categoria') return arv.testaments.flatMap(t => t.categories).map(c => ({ id: c.id, nome: c.name }));
    if (nivel === 'livro') return Dados.livros(this.versaoBusca || this.versao).map(b => ({ id: b.code, nome: b.name }));
    return [];
  },

  /** A sigla da versão que a busca usa (botão à direita da barra). */
  atualizarBuscaVersao() {
    this.versaoBusca = this.versaoBusca || this.versao;
    const s = document.getElementById('busca-versao-sigla');
    if (s) s.textContent = this.versaoBusca;
  },

  /** Reabre o painel de busca (depois de trocar a versão pelo botão da busca). */
  _reabrirBusca() {
    this.desenharFiltros();
    this.atualizarBuscaVersao();
    this.abrir('painel-busca');
    this.rodarBusca();
    setTimeout(() => { const c = document.getElementById('campo-busca'); if (c) c.focus(); }, 180);
  },

  /** Troca só a versão da BUSCA e refaz a procura. Não mexe na página
   *  principal (nem na versão aberta, na sigla do topo ou no capítulo lido) —
   *  a busca é uma consulta à parte, não uma troca de leitura. */
  trocarVersaoBusca(code) {
    this.alvoVersao = 'principal';
    const anterior = this.versaoBusca || this.versao;
    if (code !== anterior) {
      // escopo preso num cânone que a nova versão não tem volta a global
      if (Dados.canoneDe(anterior) !== Dados.canoneDe(code)) {
        Busca.escopo = { tipo: 'tudo', id: null, nome: 'Toda a Bíblia' };
      }
      this.versaoBusca = code;
    }
    this._reabrirBusca();
  },

  async rodarBusca() {
    const termo = document.getElementById('campo-busca').value;
    const alvo = document.getElementById('resultados-busca');
    const mv = document.getElementById('busca-multiversao');
    this.versaoBusca = this.versaoBusca || this.versao;
    Busca.cancelar();
    if (mv) { mv.hidden = true; mv.innerHTML = ''; }

    if (termo.trim().length < 2) {
      alvo.innerHTML = `<div class="estado">Digite ao menos duas letras.</div>`;
      return;
    }

    alvo.innerHTML = '<div class="contagem" id="progresso-busca">Procurando…</div>'
      + '<div id="lista-resultados"></div>';
    const lista = document.getElementById('lista-resultados');
    const prog = document.getElementById('progresso-busca');

    const r = await Busca.procurar(this.versaoBusca, termo,
      (i, n, nome) => { prog.textContent = `Procurando em ${nome} — ${i} de ${n}`; },
      (achados, termos) => {
        lista.insertAdjacentHTML('beforeend', achados.map(a => `
          <button class="resultado" data-code="${a.code}" data-cap="${a.cap}" data-vers="${a.vers}">
            <span class="ref-res">${Leitura.escapar(a.nome)} ${a.cap}:${a.vers}</span>
            <span class="trecho">${Busca.realcar(a.texto, termos)}</span>
          </button>`).join(''));
      });

    if (r.cancelado) return;
    prog.textContent = r.total
      ? `${r.total} ocorrência${r.total > 1 ? 's' : ''} em ${Busca.escopo.nome}`
      : '';
    if (!r.total) {
      lista.innerHTML = `<div class="estado">Nada encontrado em
        ${Busca.escopo.nome} <strong>(${this.versaoBusca})</strong>.<br>Tente outra palavra ou amplie o filtro.</div>`;
      this._buscarNasOutras(termo);   // será que existe noutra versão?
    }

    lista.querySelectorAll('.resultado').forEach(el => {
      el.onclick = () => {
        this.fecharPaineis();
        this.abrirResultadoBusca(el.dataset.code, +el.dataset.cap, +el.dataset.vers);
      };
    });
  },

  /** Abre um resultado da busca. Se ele veio de uma versão de busca diferente
   *  da que está aberta na página, aí sim adota essa versão — porque agora é
   *  uma navegação explícita para LER o trecho, não mais só procurar. */
  abrirResultadoBusca(code, cap, vers) {
    if (this.versaoBusca && this.versaoBusca !== this.versao) {
      this.versao = this.versaoBusca;
      Prefs.set('versao', this.versao);
      const s = document.getElementById('sigla-versao');
      if (s) s.textContent = this.versao;
    }
    this.ir(code, cap, vers);
  },

  /** Zero resultados na versão da busca: procura nas demais e, se achar, mostra
   *  um marcador com o total por versão (sem o texto), que abre e deixa trocar. */
  async _buscarNasOutras(termo) {
    const mv = document.getElementById('busca-multiversao');
    if (!mv) return;
    const termos = Busca.termos(termo);
    const outras = (Dados.versoes || []).filter(v => v.code !== this.versaoBusca);
    if (!outras.length || !termos.length) return;

    mv.hidden = false;
    mv.innerHTML = '<div class="mv-buscando">Procurando em outras versões…</div>';

    const achados = await Busca.contarNasOutras(this.versaoBusca, termos, (i, n) => {
      const el = mv.querySelector('.mv-buscando');
      if (el) el.textContent = `Procurando em outras versões… (${i}/${n})`;
    });

    if (achados === null) return;                    // nova digitação cancelou
    if (!achados.length) { mv.hidden = true; mv.innerHTML = ''; return; }

    const totalV = achados.length;
    mv.innerHTML = `
      <button class="mv-cabec" id="mv-abrir" aria-expanded="false">
        <svg class="icone"><use href="#i-info"/></svg>
        <span class="mv-texto">Encontrado em ${totalV} outra${totalV > 1 ? 's' : ''} versõe${totalV > 1 ? 's' : ''}</span>
        <span class="mv-seta">▶</span>
      </button>
      <div class="mv-lista fechada" id="mv-lista">
        ${achados.map(a => `
          <button class="mv-item" data-mv="${a.code}">
            <span class="sigla">${a.code}</span>
            <span class="mv-nome">${Leitura.escapar(a.name)}</span>
            <span class="mv-conta">${a.total}</span>
          </button>`).join('')}
      </div>`;

    const cabec = document.getElementById('mv-abrir');
    const listaMv = document.getElementById('mv-lista');
    cabec.onclick = () => {
      const aberta = listaMv.classList.toggle('fechada');
      cabec.setAttribute('aria-expanded', String(!aberta));
      cabec.querySelector('.mv-seta').textContent = aberta ? '▶' : '▼';
    };
    mv.querySelectorAll('[data-mv]').forEach(el => {
      el.onclick = () => this.trocarVersaoBusca(el.dataset.mv);
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
    // o atalho abre a lista de fixados; aparece sempre que houver ao menos um
    const tem = Historico.fixados().length > 0;
    btn.hidden = !tem;
    if (!tem) this.fecharListaFixados();
  },

  irParaPrimeiroFixado() {
    const f = Historico.primeiroFixado();
    if (!f) return;
    if (f.versao !== this.versao) { this.versao = f.versao; Prefs.set('versao', f.versao); }
    this.ir(f.code, f.cap || 1, f.vers);
  },

  /* O atalho no topo não pula direto: abre uma lista discreta com TODOS os
   * fixados — livro capítulo:versículo e a versão de destino — para a pessoa
   * escolher para onde ir. Nenhuma outra ação além de abrir; serve só para ela
   * saber o destino antes (às vezes vê o alfinete e não lembra o que é). */
  alternarListaFixados() {
    const pop = document.getElementById('fixados-pop');
    if (pop && !pop.hidden) this.fecharListaFixados();
    else this.abrirListaFixados();
  },

  abrirListaFixados() {
    const pop = document.getElementById('fixados-pop');
    if (!pop) return;
    const fixados = Historico.fixados();
    if (!fixados.length) { this.fecharListaFixados(); return; }
    const itens = fixados.map((f, i) => {
      const ref = `${Dados.nomeCurto(f.versao, f.code)} ${f.cap || 1}` +
        (f.vers ? ':' + f.vers : '');
      return `<button class="fix-item" role="menuitem" data-fix-idx="${i}">
        <span class="fix-ref">${ref}</span>
        <span class="fix-versao">${f.versao}</span>
      </button>`;
    }).join('');
    pop.innerHTML = `<div class="fix-titulo">Fixados</div>${itens}`;
    pop.hidden = false;
    pop.setAttribute('aria-hidden', 'false');
    pop.querySelectorAll('[data-fix-idx]').forEach(el => {
      el.onclick = () => {
        const f = Historico.fixados()[+el.dataset.fixIdx];
        this.fecharListaFixados();
        if (!f) return;
        if (f.versao !== this.versao) { this.versao = f.versao; Prefs.set('versao', f.versao); }
        this.ir(f.code, f.cap || 1, f.vers);
      };
    });
    // um toque fora fecha a lista
    this._fecharFixadosFora = (ev) => {
      if (!pop.contains(ev.target)) this.fecharListaFixados();
    };
    document.addEventListener('click', this._fecharFixadosFora);
  },

  fecharListaFixados() {
    const pop = document.getElementById('fixados-pop');
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    pop.setAttribute('aria-hidden', 'true');
    if (this._fecharFixadosFora) {
      document.removeEventListener('click', this._fecharFixadosFora);
      this._fecharFixadosFora = null;
    }
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
        const fx = fixados.find(f => f.code === it.code);   // alfinete deste livro, se houver
        const ehAlfineteAtual = fx && (fx.cap || 1) === it.cap;

        // a linha que É a posição atual do alfinete aparece APAGADA e inerte,
        // com o selo "Fixado" — é a mesma coisa que já está lá em cima. Só uma
        // linha fica assim; se o alfinete mudar de capítulo, a antiga volta ao
        // normal e a nova é que passa a ser marcada.
        if (ehAlfineteAtual) {
          return `<div class="hist-linha fixado-inerte">
            <div class="item-hist" aria-disabled="true">
              <span class="ref-hist">${ref}</span>
              <span class="sigla" style="font-size:10px;padding:1px 4px">${it.versao}</span>
              <span class="trecho-hist">${Leitura.escapar(it.trecho || '')}</span>
            </div>
            <span class="selo-fixado" title="Este é o ponto fixado deste livro">Fixado</span>
          </div>`;
        }

        // demais linhas: clicáveis normalmente. O botão de fixar só aparece
        // quando o livro NÃO está fixado (o alfinete é um por livro — outros
        // capítulos de um livro já fixado não ganham um segundo alfinete).
        return `<div class="hist-linha">
          <button class="item-hist" data-i="${i}">
            <span class="ref-hist">${ref}</span>
            <span class="sigla" style="font-size:10px;padding:1px 4px">${it.versao}</span>
            <span class="trecho-hist">${Leitura.escapar(it.trecho || '')}</span>
          </button>
          ${fx ? '' : `<button class="xis fixar-item" data-fixar="${i}"
            aria-label="Fixar este livro" title="Fixar este livro">
            <svg class="icone"><use href="#i-fixar"/></svg></button>`}
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

    corpo.innerHTML = `<div class="estudos-topo">
        <button class="botao secundario" id="pdf-varios">
          <svg class="icone"><use href="#i-compartilhar"/></svg> Montar PDF de vários
        </button>
      </div>` + estudos.map(e => {
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
          <button class="estudo-titulo" data-ver="${e.id}">
            <strong>${Leitura.escapar(Estudos.nomeDe(e))}</strong>
            <svg class="icone estudo-titulo-seta"><use href="#i-depois"/></svg>
          </button>
          <span class="quando">${Estudos.quandoDe(e)}</span>
        </div>
        <div class="trechos-lista">${listaTrechos}</div>
        <div class="acoes-sessao">
          <button class="pilula" data-renomear="${e.id}">Renomear</button>
          <button class="pilula" data-partilhar="${e.id}">Compartilhar</button>
          <button class="pilula" data-copiar="${e.id}">Copiar</button>
          <button class="pilula" data-pdf="${e.id}">Exportar PDF</button>
          <button class="pilula perigo" data-remover="${e.id}">Excluir</button>
        </div>
      </div>`;
    }).join('');

    const achar = id => Estudos.todos().find(e => e.id === id);

    corpo.querySelectorAll('[data-ver]').forEach(el => {
      el.onclick = () => this.verEstudo(el.dataset.ver);
    });

    corpo.querySelectorAll('[data-est]').forEach(el => {
      el.onclick = () => {
        const e = achar(el.dataset.est);
        const t = Estudos.trechosDe(e)[+el.dataset.tr];
        this.fecharPaineis();
        if (t.versao !== this.versao) { this.versao = t.versao; Prefs.set('versao', t.versao); }
        // formato novo (cap + lista) ou antigo (intervalo contínuo)
        const cap = t.cap != null ? t.cap : t.capInicio;
        const vers = Array.isArray(t.versiculos) ? t.versiculos[0] : t.versInicio;
        this.ir(t.code, cap, vers);
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
      el.onclick = async () => {
        const e = achar(el.dataset.renomear);
        const nome = await this.pedirTexto({ titulo: 'Renomear estudo', valor: e ? Estudos.nomeDe(e) : '' });
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
      el.onclick = async () => {
        const e = achar(el.dataset.remover);
        const ok = await this.confirmar({
          titulo: 'Excluir estudo',
          mensagem: `Excluir o estudo "${Estudos.nomeDe(e)}"?`,
          confirmar: 'Excluir',
        });
        if (!ok) return;
        Estudos.remover(el.dataset.remover);
        this.desenharEstudos();
      };
    });

    corpo.querySelectorAll('[data-pdf]').forEach(el => {
      el.onclick = () => this.exportarPdf([el.dataset.pdf]);
    });
    const btVarios = document.getElementById('pdf-varios');
    if (btVarios) btVarios.onclick = () => this.montarPdfEstudos();
  },

  /* Montador "por fora": escolher vários estudos, ordenar e gerar um PDF só. */
  montarPdfEstudos() {
    const corpo = document.getElementById('corpo-estudos');
    const todos = Estudos.todos();
    const achar = id => todos.find(e => e.id === id);
    const ordem = [];   // ids selecionados, na ordem escolhida

    const render = () => {
      const sel = new Set(ordem);
      const selecionados = ordem.map((id, i) => `
        <div class="pdf-linha sel">
          <span class="pdf-ord">${i + 1}</span>
          <span class="pdf-nome">${Leitura.escapar(Estudos.nomeDe(achar(id)) || 'Estudo')}</span>
          <span class="pdf-move">
            <button class="xis" data-sobe="${id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">
              <svg class="icone"><use href="#i-tri-cima"/></svg></button>
            <button class="xis" data-desce="${id}" ${i === ordem.length - 1 ? 'disabled' : ''} aria-label="Descer">
              <svg class="icone"><use href="#i-tri-baixo"/></svg></button>
            <button class="xis" data-tira="${id}" aria-label="Tirar">
              <svg class="icone"><use href="#i-fechar"/></svg></button>
          </span>
        </div>`).join('');
      const disponiveis = todos.filter(e => !sel.has(e.id)).map(e => `
        <button class="pdf-add" data-add="${e.id}">
          <svg class="icone"><use href="#i-nota"/></svg>
          ${Leitura.escapar(Estudos.nomeDe(e) || 'Estudo')}</button>`).join('');

      corpo.innerHTML = `
        <div class="pdf-montar">
          <button class="botao secundario" id="pdf-voltar">
            <svg class="icone"><use href="#i-antes"/></svg> Voltar</button>
          <p class="pdf-ajuda">Escolha os estudos e ordene. Eles entram no PDF nessa ordem,
            cada um com o título grande no topo e o conteúdo em duas colunas.</p>
          <div class="pdf-secao-rot">Selecionados (na ordem)</div>
          <div class="pdf-selecionados">${selecionados || '<div class="estado peq">Nenhum selecionado ainda.</div>'}</div>
          <div class="pdf-secao-rot">Disponíveis</div>
          <div class="pdf-disponiveis">${disponiveis || '<div class="estado peq">— todos já escolhidos —</div>'}</div>
          <button class="botao pdf-gerar" id="pdf-gerar" ${ordem.length ? '' : 'disabled'}>
            Gerar PDF${ordem.length ? ` (${ordem.length})` : ''}</button>
        </div>`;

      corpo.querySelectorAll('[data-add]').forEach(el => el.onclick = () => { ordem.push(el.dataset.add); render(); });
      corpo.querySelectorAll('[data-tira]').forEach(el => el.onclick = () => { const i = ordem.indexOf(el.dataset.tira); if (i >= 0) ordem.splice(i, 1); render(); });
      corpo.querySelectorAll('[data-sobe]').forEach(el => el.onclick = () => { const i = ordem.indexOf(el.dataset.sobe); if (i > 0) { [ordem[i - 1], ordem[i]] = [ordem[i], ordem[i - 1]]; render(); } });
      corpo.querySelectorAll('[data-desce]').forEach(el => el.onclick = () => { const i = ordem.indexOf(el.dataset.desce); if (i >= 0 && i < ordem.length - 1) { [ordem[i + 1], ordem[i]] = [ordem[i], ordem[i + 1]]; render(); } });
      document.getElementById('pdf-voltar').onclick = () => this.desenharEstudos();
      const g = document.getElementById('pdf-gerar');
      if (g) g.onclick = () => { if (ordem.length) this.exportarPdf(ordem.slice(), ordem.length > 1 ? 'Estudos' : null); };
    };
    render();
  },

  /* ============================================ MODO VISÃO DO ESTUDO
   * Tocar no título do estudo abre esta tela: todo o conteúdo montado para
   * leitura. Os versículos aparecem em "containers" com cara de recorte de
   * bíblia impressa; os textos do usuário (quando existirem, na etapa de
   * edição) aparecem com um visual distinto de anotação. Um lápis embaixo
   * leva ao modo edição. */
  async verEstudo(id) {
    const e = Estudos.todos().find(x => x.id === id);
    if (!e) return;
    this._estudoAtual = id;

    document.getElementById('titulo-estudo-ver').textContent = Estudos.nomeDe(e) || 'Estudo';
    const corpo = document.getElementById('corpo-estudo-ver');
    corpo.classList.remove('editando');
    corpo.innerHTML = '<div class="estado peq">Montando o estudo…</div>';
    this.abrir('painel-estudo-ver');

    // daqui, voltar leva de volta à LISTA de estudos (e não à Bíblia)
    this._volta = () => this._abrirEstudosLista();
    document.getElementById('estudo-ver-voltar').onclick = () => this.voltar();

    // monta os blocos na ordem; um bloco de versículos pode render mais de um
    // container se o intervalo antigo cruzava capítulos
    const partes = [];
    for (const b of Estudos.blocosDe(e)) {
      if (b.tipo === 'texto') {
        const a = this._blocoTextoAttrs(b);
        partes.push(`<div class="estudo-bloco ${a.cls}"${a.sty}>${b.html || ''}</div>`);
        continue;
      }
      // um trecho é um lançamento único → sempre UM container, mesmo que cruze
      // capítulos (aí os capítulos viram separadores internos)
      partes.push(await this._containerVersos(b.trecho));
    }

    const conteudo = partes.join('') || '<div class="estado peq">Estudo vazio.</div>';
    corpo.innerHTML = `
      <div class="estudo-ver-conteudo">${conteudo}</div>
      <div class="estudo-ver-rodape">
        <button class="pilula-lapis pilula-tocar" id="estudo-ver-tocar">
          <svg class="icone"><use href="#i-play"/></svg> Ouvir
        </button>
        <button class="pilula-lapis" id="estudo-ver-editar">
          <svg class="icone"><use href="#i-lapis"/></svg> Editar
        </button>
      </div>`;
    document.getElementById('estudo-ver-editar').onclick = () => this.editarEstudo(id);
    document.getElementById('estudo-ver-tocar').onclick = () => this.tocarEstudoPorId(id);
  },

  /* Um trecho vira uma ou mais "fatias" — uma por capítulo — cada uma com os
   * números de versículo a mostrar. Cobre o formato novo (cap + lista) e o
   * antigo (intervalo contínuo, que pode cruzar capítulos). */
  _fatiasDoTrecho(t) {
    if (Array.isArray(t.versiculos)) {
      return [{ code: t.code, versao: t.versao, cap: t.cap, numeros: t.versiculos }];
    }
    const cI = t.capInicio, cF = t.capFim != null ? t.capFim : t.capInicio;
    const fatias = [];
    for (let c = cI; c <= cF; c++) {
      fatias.push({
        code: t.code, versao: t.versao, cap: c,
        inicio: c === cI ? t.versInicio : 1,
        fim: c === cF ? t.versFim : null,     // null = até o fim do capítulo
      });
    }
    return fatias;
  },

  async _containerVersos(trecho) {
    const fatias = this._fatiasDoTrecho(trecho);
    const nome = Dados.nomeCurto(trecho.versao, trecho.code);

    // resolve os versículos de cada capítulo (uma "seção" por capítulo)
    const secoes = [];
    for (const f of fatias) {
      let dado = null;
      try { dado = await Dados.capitulo(f.versao, f.code, f.cap); }
      catch { /* versão sem esse capítulo */ }
      const verses = (dado && dado.capitulo && dado.capitulo.verses) || [];
      const escolhidos = Array.isArray(f.numeros)
        ? verses.filter(v => f.numeros.includes(v.number))
        : verses.filter(v => v.number >= f.inicio && (f.fim == null || v.number <= f.fim));
      secoes.push({ cap: f.cap, escolhidos });
    }

    const multi = secoes.length > 1;   // cruza capítulos → separadores internos
    const corpo = secoes.map(s => {
      const passagem = s.escolhidos.map(v =>
        `<span class="ev"><span class="ev-n">${v.number}</span>${Leitura.escapar(v.text)}</span>`
      ).join(' ');
      const sep = multi ? `<div class="estudo-cap-sep">${nome} ${s.cap}</div>` : '';
      return sep + `<div class="estudo-passagem">${passagem
        || '<em class="estudo-vazio">Texto indisponível nesta versão.</em>'}</div>`;
    }).join('');

    // a etiqueta do topo traz a referência do trecho INTEIRO (um só lançamento)
    return `<div class="estudo-bloco estudo-versos">
      <div class="estudo-ref">${Estudos.refDoTrecho(trecho)}<span class="estudo-sigla">${trecho.versao}</span></div>
      ${corpo}
    </div>`;
  },

  /* ---- exportação para PDF (via "Salvar como PDF" do navegador) ---- */

  /* Devolve o título do estudo (que atravessa as colunas) seguido dos blocos.
   * Vários estudos entram no MESMO fluxo de colunas, um após o outro. */
  async _secaoPdf(e) {
    const partes = [`<h2 class="pdf-titulo">${Leitura.escapar(Estudos.nomeDe(e))}</h2>`];
    for (const b of Estudos.blocosDe(e)) {
      if (b.tipo === 'texto') {
        const a = this._blocoTextoAttrs(b);
        partes.push(`<div class="estudo-bloco ${a.cls}"${a.sty}>${b.html || ''}</div>`);
      } else {
        partes.push(await this._containerVersos(b.trecho));
      }
    }
    return partes.join('');
  },

  /* CSS de impressão ESSENCIAL, injetado na hora de exportar. Assim a folha sai
   * certa (sépia, título largo, duas colunas, containers) mesmo que o estilo.css
   * no cache do navegador esteja desatualizado. */
  _estiloPdfCritico() {
    return `
      /* esconde a interface inteira; mostra só a folha, sem barras de rolagem */
      html, body { background: #ffffff !important; overflow: visible !important;
        height: auto !important; margin: 0 !important; }
      body > *:not(#pdf-raiz) { display: none !important; }
      #pdf-raiz { display: block !important; color: #232a36;
        font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.52; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      @page { size: A4 portrait; margin: 17mm 15mm 18mm; }

      /* título do estudo: atravessa as colunas (largura inteira), com régua de
         acento dourado. break-after: avoid gruda o título ao início do texto —
         se não couber com um trecho na página, desce junto para a próxima. */
      .pdf-titulo {
        column-span: all;
        break-after: avoid; break-inside: avoid;
        margin: 0 0 5mm; padding: 0 0 2.6mm;
        font-family: 'EB Garamond', Georgia, serif; font-size: 21pt; font-weight: 600;
        line-height: 1.15; letter-spacing: .005em; color: #2a3550;
        border-bottom: 2pt solid #c8a24a;
      }
      .pdf-titulo:not(:first-child) { margin-top: 9mm; }
      /* o primeiro bloco depois do título não se separa dele */
      .pdf-titulo + * { break-before: avoid; }

      /* corpo em DUAS colunas que fluem */
      .pdf-colunas {
        column-count: 2; column-gap: 8.5mm; column-fill: balance;
        column-rule: 1px solid #e7e2d6; text-align: justify; hyphens: auto;
      }
      .pdf-colunas > * { break-inside: auto; }
      .pdf-colunas .estudo-bloco { margin: 0 0 3mm; }

      /* texto comum do usuário: prosa plana no branco (quebra entre colunas) */
      .pdf-colunas .estudo-texto {
        font-family: 'EB Garamond', Georgia, serif; font-size: 11pt; line-height: 1.52;
        color: #262f3d; background: none; border: 0; padding: 0; border-radius: 0;
      }
      .pdf-colunas .est-tam-g { font-size: 1.3em; font-weight: 600; color: #2a3550; }
      .pdf-colunas .est-tam-p { font-size: .84em; }

      /* preenchimento do usuário: container limpo. PODE quebrar entre colunas
         (borda clonada), pra não deixar buraco no fim da coluna anterior. */
      .pdf-colunas .estudo-texto.tem-fundo { padding: 3mm 3.6mm; border-radius: 2mm;
        break-inside: auto; box-decoration-break: clone; -webkit-box-decoration-break: clone; }

      /* marcadores e hierarquia em L */
      .pdf-colunas .estudo-texto.bloco-marcador { position: relative; padding-left: 1.4em; }
      .pdf-colunas .estudo-texto.bloco-marcador::before { content: ''; position: absolute;
        left: .45em; top: .62em; width: .32em; height: .32em; border-radius: 50%; background: #c8a24a; }
      .pdf-colunas .estudo-texto.nivel-1 { margin-left: 1.6em; }
      .pdf-colunas .estudo-texto.nivel-2 { margin-left: 3.2em; }
      .pdf-colunas .estudo-texto.nivel-3 { margin-left: 4.8em; }
      .pdf-colunas .estudo-texto.nivel-4 { margin-left: 6.4em; }

      /* VERSÍCULOS: pedaço de papiro — creme claro, fita de acento, sutil e moderno.
         PODE quebrar entre colunas/páginas (borda clonada em cada parte), para as
         colunas encherem meio a meio, sem buracos. */
      .pdf-colunas .estudo-versos {
        break-inside: auto;
        box-decoration-break: clone; -webkit-box-decoration-break: clone;
        background: #f7f1e2;
        border: 1px solid #e6dcc2;
        border-left: 3px solid #c8a24a;
        border-radius: 1.6mm;
        padding: 3mm 3.6mm;
        box-shadow: 0 1px 2px rgba(60,45,20,.06);
      }
      .pdf-colunas .estudo-ref {
        font-variant: small-caps; letter-spacing: .05em; font-weight: 600;
        color: #8a6d2f; font-size: .92em; margin-bottom: 1.4mm;
      }
      .pdf-colunas .estudo-sigla { color: #a98c4f; margin-left: .35em; font-variant: normal; }
      .pdf-colunas .estudo-cap-sep { color: #a98c4f; font-variant: small-caps; margin: 1.2mm 0 .6mm; }
      .pdf-colunas .estudo-passagem { color: #33302a; font-style: normal; }
      .pdf-colunas .estudo-passagem .ev-n { color: #a1301f; font-size: .68em; vertical-align: super;
        margin-right: .12em; font-weight: 600; }

      /* rodapé: só a data, embaixo à esquerda, repetido nas páginas */
      .pdf-rodape { position: fixed; left: 15mm; bottom: 8mm;
        font-size: 8.5pt; color: #8b8676; letter-spacing: .02em; }
    `;
  },

  /* Gera o PDF de um ou vários estudos (na ordem dada) e dispara o "Salvar como
   * PDF" do navegador. A folha vive em #pdf-raiz, que só aparece na impressão. */
  async exportarPdf(ids, nomeArquivo) {
    const raiz = document.getElementById('pdf-raiz');
    if (!raiz || !ids || !ids.length) return;
    const todos = Estudos.todos();
    const achar = id => todos.find(e => e.id === id);

    const secoes = [];
    for (const id of ids) {
      const e = achar(id);
      if (!e) continue;
      try { secoes.push(await this._secaoPdf(e)); }
      catch (err) { /* um estudo com problema não derruba os demais */ }
    }
    if (!secoes.length) { this.avisoRapido?.('Nada para exportar em PDF.'); return; }

    // data (só a data, sem hora) no rodapé: do estudo, quando é um só; senão, de hoje
    const soData = iso => { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return ''; } };
    const dataRodape = ids.length === 1 && achar(ids[0]) && achar(ids[0]).criado
      ? soData(achar(ids[0]).criado)
      : new Date().toLocaleDateString('pt-BR');

    // TODOS os estudos num único fluxo de duas colunas (os títulos atravessam);
    // o rodapé é fixo e se repete em todas as páginas.
    raiz.innerHTML =
      `<div class="pdf-colunas">${secoes.join('')}</div>` +
      `<div class="pdf-rodape"><span class="pdf-data">${dataRodape}</span></div>`;

    // injeta o CSS de impressão essencial (imune a estilo.css velho no cache)
    let estilo = document.getElementById('pdf-estilo-critico');
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.id = 'pdf-estilo-critico';
      estilo.media = 'print';
      document.head.appendChild(estilo);
    }
    estilo.textContent = this._estiloPdfCritico();

    const tituloAntes = document.title;
    document.title = nomeArquivo
      || (ids.length === 1 ? (Estudos.nomeDe(achar(ids[0])) || 'Estudo') : 'Estudos');

    const limpar = () => {
      raiz.innerHTML = '';
      document.title = tituloAntes;
      window.removeEventListener('afterprint', limpar);
      clearTimeout(this._pdfTimer);
    };
    window.addEventListener('afterprint', limpar);
    this._pdfTimer = setTimeout(limpar, 120000);   // rede de segurança

    // dois quadros para o layout/fontes assentarem, então imprime
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { window.print(); } catch (e) { limpar(); }
    }));
  },

  /* ============================================ MODO EDIÇÃO DO ESTUDO
   * Mostra a mesma sequência de blocos, mas: entre/antes/depois de cada bloco
   * há um "+ Inserir texto"; os blocos de texto viram editáveis, com a mesma
   * formatação das notas (negrito, itálico, sublinhado e a roda de cores). Uma
   * barra de formato única age sobre o bloco de texto que estiver em foco.
   * Tudo é guardado como e.blocos (a sequência ordenada). */
  /* Classes e estilo de um bloco de TEXTO do estudo (marcador, nível/hierarquia,
   * alinhamento e preenchimento). Usado igual na edição e na visão. */
  _blocoTextoAttrs(b) {
    const cls = ['estudo-texto'];
    if (b.marcador) cls.push('bloco-marcador');
    if (b.nivel) cls.push('nivel-' + Math.min(4, +b.nivel));
    if (b.alinhar) cls.push('al-' + b.alinhar);
    if (b.fundo) cls.push('tem-fundo');
    const sty = b.fundo ? ` style="background:${b.fundo}"` : '';
    return { cls: cls.join(' '), sty };
  },

  /* ---- formatação rica por manipulação DIRETA de DOM (sem execCommand) ----
   * No Android, tocar num botão apaga a seleção viva e o execCommand não pega —
   * por isso os botões "não faziam nada". Estas funções operam sobre o RANGE
   * guardado (um clone que continua válido no DOM), então funcionam igual no
   * celular e no desktop, sem depender de foco nem de seleção viva. Cada uma
   * devolve o range a reselecionar (para o trecho seguir marcado), ou null. */
  _ricoAncestralTag(no, tag, limite) {
    let el = no && (no.nodeType === 1 ? no : no.parentNode);
    while (el && el !== limite) {
      if (el.tagName && el.tagName.toLowerCase() === tag) return el;
      el = el.parentNode;
    }
    return null;
  },
  _ricoTextosNoRange(range) {
    const anc = range.commonAncestorContainer;
    const raiz = anc.nodeType === 1 ? anc : anc.parentNode;
    const out = [];
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { if (n.data && range.intersectsNode(n)) out.push(n); }
    if (!out.length && range.startContainer.nodeType === 3) out.push(range.startContainer);
    return out;
  },
  /* Liga/desliga uma tag inline (strong/em/u/s) no trecho. */
  _ricoAlternarTag(range, tag, editable) {
    const textos = this._ricoTextosNoRange(range);
    const jaTodos = textos.length && textos.every(t => this._ricoAncestralTag(t, tag, editable));
    if (jaTodos) {                              // desliga: desembrulha os <tag>
      const alvos = new Set();
      textos.forEach(t => { const el = this._ricoAncestralTag(t, tag, editable); if (el) alvos.add(el); });
      alvos.forEach(el => {
        const pai = el.parentNode; if (!pai) return;
        while (el.firstChild) pai.insertBefore(el.firstChild, el);
        pai.removeChild(el);
      });
      if (editable) editable.normalize();
      return null;
    }
    const el = document.createElement(tag);    // liga: envolve
    try { el.appendChild(range.extractContents()); range.insertNode(el); }
    catch (e) { return null; }
    if (editable) editable.normalize();
    const r = document.createRange(); r.selectNodeContents(el); return r;
  },
  /* Envolve o trecho num <span> com classe e/ou estilo, limpando a mesma
   * propriedade em spans internos para o novo valor valer de fato. */
  _ricoEnvolver(range, { classe = '', estilo = null, limparClasses = [], limparEstilo = '' } = {}) {
    const span = document.createElement('span');
    if (classe) span.className = classe;
    if (estilo) for (const k in estilo) span.style[k] = estilo[k];
    try {
      span.appendChild(range.extractContents());
      span.querySelectorAll('span').forEach(x => {
        limparClasses.forEach(c => x.classList.remove(c));
        if (limparEstilo && x.style) x.style[limparEstilo] = '';
      });
      range.insertNode(span);
    } catch (e) { return null; }
    const r = document.createRange(); r.selectNodeContents(span); return r;
  },
  /* Achata o trecho para texto puro (limpar formatação). */
  _ricoLimpar(range) {
    const texto = range.toString();
    try {
      range.deleteContents();
      const t = document.createTextNode(texto);
      range.insertNode(t);
      const r = document.createRange(); r.selectNode(t); return r;
    } catch (e) { return null; }
  },
  /* Cor real (color/backgroundColor) aplicada no trecho, subindo do 1º nó de
   * texto até o editável. Devolve o valor inline ou null (sem cor). */
  _ricoCorDoTrecho(range, prop, editable) {
    const t = this._ricoTextosNoRange(range)[0];
    if (!t) return null;
    let el = t.parentNode;
    while (el && el !== editable) {
      if (el.style && el.style[prop]) return el.style[prop];
      el = el.parentNode;
    }
    return null;
  },
  /* Remove uma propriedade de estilo (color / backgroundColor) do trecho —
   * usado pelo "Remover realce/cor". Tira a cor de qualquer span que TOQUE o
   * trecho (ancestral que o envolve ou descendente); spans que ficam sem estilo
   * nem classe são desfeitos. */
  _ricoLimparEstilo(range, prop, editable) {
    const alvos = new Set();
    // ancestrais: sobe de cada nó de texto do trecho até o editável
    this._ricoTextosNoRange(range).forEach(t => {
      let el = t.parentNode;
      while (el && el !== editable) {
        if (el.tagName === 'SPAN' && el.style && el.style[prop]) alvos.add(el);
        el = el.parentNode;
      }
    });
    // descendentes: spans dentro do trecho com a propriedade
    const anc = range.commonAncestorContainer;
    const raiz = anc.nodeType === 1 ? anc : anc.parentNode;
    if (raiz && raiz.querySelectorAll) {
      raiz.querySelectorAll('span').forEach(s => {
        if (s.style && s.style[prop] && range.intersectsNode(s)) alvos.add(s);
      });
    }
    alvos.forEach(s => {
      s.style[prop] = '';
      if (!s.getAttribute('style') && !s.className) {   // span esvaziado: desembrulha
        while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
        s.parentNode.removeChild(s);
      }
    });
    if (editable) editable.normalize();
    return null;
  },

  async editarEstudo(id) {
    const e = Estudos.todos().find(x => x.id === id);
    if (!e) return;
    this._estudoAtual = id;

    // cópia de trabalho da sequência
    const blocos = Estudos.blocosDe(e).map(b => b.tipo === 'texto'
      ? { tipo: 'texto', html: b.html || '', marcador: !!b.marcador,
          nivel: +b.nivel || 0, alinhar: b.alinhar || '', fundo: b.fundo || '' }
      : { tipo: 'versos', trecho: b.trecho });

    document.getElementById('titulo-estudo-ver').textContent = Estudos.nomeDe(e) || 'Estudo';
    const corpo = document.getElementById('corpo-estudo-ver');
    corpo.classList.add('editando');
    corpo.innerHTML = `
      <div class="estudo-edit-barra" id="estudo-edit-barra">
        <button class="fmt" data-cmd="bold" title="Negrito"><svg class="icone"><use href="#i-negrito"/></svg></button>
        <button class="fmt" data-cmd="italic" title="Itálico"><svg class="icone"><use href="#i-italico"/></svg></button>
        <button class="fmt" data-cmd="underline" title="Sublinhado"><svg class="icone"><use href="#i-sublinhado"/></svg></button>
        <button class="fmt fmt-cor" id="est-cor-letra" title="Cor da letra">
          <span class="rotulo-cor">A</span><span class="risco-cor" id="est-amostra-cor"></span></button>
        <button class="fmt fmt-fundo" id="est-cor-fundo" title="Cor de fundo">
          <span class="bloco-fundo" id="est-amostra-fundo">A</span></button>
        <span class="fmt-sep" aria-hidden="true"></span>
        <button class="fmt fmt-tam" data-size="g" title="Título (maior)"><span style="font-size:16px;font-weight:600">A</span></button>
        <button class="fmt fmt-tam" data-size="m" title="Texto normal"><span style="font-size:13px">A</span></button>
        <button class="fmt fmt-tam" data-size="p" title="Texto menor"><span style="font-size:10px">A</span></button>
        <span class="fmt-sep" aria-hidden="true"></span>
        <button class="fmt" id="est-marcador" title="Marcadores"><svg class="icone"><use href="#i-lista"/></svg></button>
        <button class="fmt" id="est-recuar-fora" title="Menos recuo"><svg class="icone"><use href="#i-antes"/></svg></button>
        <button class="fmt" id="est-recuar" title="Mais recuo (hierarquia)"><svg class="icone"><use href="#i-avancar"/></svg></button>
        <button class="fmt" id="est-alinhar" title="Alinhamento">
          <svg class="icone" viewBox="0 0 24 24"><g stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="15" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></g></svg>
        </button>
        <button class="fmt fmt-preencher" id="est-preencher" title="Preencher o bloco">
          <svg class="icone" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2.5" fill="currentColor"/></svg>
        </button>
        <span class="fmt-sep" aria-hidden="true"></span>
        <button class="fmt" data-cmd="removeFormat" title="Limpar formatação"><svg class="icone"><use href="#i-limpar-formato"/></svg></button>
      </div>
      <div class="caixa-cor fechada" id="caixa-cor-estudo"></div>
      <div class="estudo-edit-blocos" id="estudo-edit-blocos"></div>
      <div class="estudo-ver-rodape">
        <button class="pilula-lapis" id="estudo-edit-concluir">Concluir</button>
      </div>`;
    this.abrir('painel-estudo-ver');

    // daqui, voltar/concluir salvam e levam de volta à VISÃO do estudo
    this._volta = () => this.verEstudo(id);

    const area = document.getElementById('estudo-edit-blocos');
    const barra = document.getElementById('estudo-edit-barra');

    // ---- seleção ativa (robusta no celular) ------------------------------
    // Guarda o último trecho REAL selecionado dentro de um bloco. No celular a
    // seleção nasce de um toque (não de mouseup), então ouvimos 'selectionchange'.
    // Guardamos só seleções não-colapsadas: assim, quando o toque no botão
    // colapsa a seleção (comportamento do Android), o trecho bom não é perdido.
    let ativo = null, range = null;
    const editavelDe = no => {
      const el = no && (no.nodeType === 1 ? no : no.parentNode);
      return el && el.closest ? el.closest('.estudo-texto-edit') : null;
    };
    const salvarRange = () => {
      const s = window.getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) return;   // só seleções reais
      const ed = editavelDe(s.anchorNode);
      if (ed) { ativo = ed; range = s.getRangeAt(0).cloneRange(); }
    };
    // range de trabalho: a seleção viva (se real) ou o último guardado
    const pegarRange = () => {
      const s = window.getSelection();
      if (s && s.rangeCount && !s.isCollapsed) {
        const ed = editavelDe(s.anchorNode);
        if (ed) { ativo = ed; range = s.getRangeAt(0).cloneRange(); return range.cloneRange(); }
      }
      return (range && !range.collapsed) ? range.cloneRange() : null;
    };
    // aplica o resultado: reseleciona o trecho formatado (se possível) e salva
    const sincronizar = () => {
      if (ativo && ativo.dataset.edit != null) blocos[+ativo.dataset.edit].html = ativo.innerHTML;
    };
    const aplicarResultado = novo => {
      if (novo) {
        try { const s = window.getSelection(); s.removeAllRanges(); s.addRange(novo); range = novo.cloneRange(); }
        catch (e) {}
      }
      sincronizar();
    };
    const aoMudarSelecao = () => { if (corpo.classList.contains('editando')) salvarRange(); };
    document.addEventListener('selectionchange', aoMudarSelecao);

    const sairSalvando = () => {
      Estudos.salvarBlocos(id, blocos);
      corpo.classList.remove('editando');
      document.removeEventListener('selectionchange', aoMudarSelecao);
    };
    document.getElementById('estudo-ver-voltar').onclick = () => { sairSalvando(); this.voltar(); };
    document.getElementById('estudo-edit-concluir').onclick = () => { sairSalvando(); this.voltar(); };

    // tocar num botão da barra NÃO pode roubar o foco do texto (senão a seleção
    // some). No celular isso é pointer/touch — não basta o mousedown do desktop.
    // Ativa um botão da barra de forma robusta no toque: faz o trabalho no
    // 'pointerdown' e segura o padrão (preserva a seleção). Fazer no pointerdown
    // — e NÃO no 'click' — é o que conserta o Android: lá, segurar o toque
    // cancelava o clique e o botão "não fazia nada". O 'click' fica só para a
    // ativação por teclado, sem repetir o que o ponteiro já fez.
    const aoAtivar = (el, fn) => {
      let feitoPeloPonteiro = false;
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); feitoPeloPonteiro = true; fn();
      }, { passive: false });
      el.addEventListener('click', () => {
        if (feitoPeloPonteiro) { feitoPeloPonteiro = false; return; }
        fn();
      });
    };

    // ---- montar a lista de blocos com os slots de inserção ----
    const slot = i => `<button class="estudo-inserir" data-slot="${i}">
        <svg class="icone"><use href="#i-nota"/></svg> Inserir texto</button>`;

    const montar = async () => {
      const partes = [slot(0)];
      for (let i = 0; i < blocos.length; i++) {
        const b = blocos[i];
        if (b.tipo === 'texto') {
          const a = this._blocoTextoAttrs(b);
          partes.push(`<div class="estudo-bloco-edit">
            <div class="${a.cls} estudo-texto-edit" contenteditable="true"
              data-edit="${i}" data-ph="Escreva seu comentário…"${a.sty}>${b.html || ''}</div>
            <button class="estudo-remover-bloco" data-rem="${i}" aria-label="Remover este texto">
              <svg class="icone"><use href="#i-lixeira"/></svg></button>
          </div>`);
        } else {
          partes.push(`<div class="estudo-bloco-edit">${await this._containerVersos(b.trecho)}</div>`);
        }
        partes.push(slot(i + 1));
      }
      area.innerHTML = partes.join('');
      ligar();
    };

    const ligar = () => {
      area.querySelectorAll('[data-slot]').forEach(el => {
        el.onclick = async () => {
          const i = +el.dataset.slot;
          blocos.splice(i, 0, { tipo: 'texto', html: '' });
          Estudos.salvarBlocos(id, blocos);
          await montar();
          const novo = area.querySelector(`[data-edit="${i}"]`);
          if (novo) { novo.focus(); ativo = novo; }
        };
      });
      area.querySelectorAll('[data-rem]').forEach(el => {
        el.onclick = async () => {
          blocos.splice(+el.dataset.rem, 1);
          Estudos.salvarBlocos(id, blocos);
          if (ativo && ativo.dataset.edit === el.dataset.rem) { ativo = null; range = null; }
          await montar();
        };
      });
      area.querySelectorAll('[data-edit]').forEach(div => {
        const i = +div.dataset.edit;
        div.addEventListener('input', () => { blocos[i].html = div.innerHTML; });
        div.addEventListener('focus', () => { ativo = div; });
        div.addEventListener('keyup', salvarRange);
        div.addEventListener('mouseup', salvarRange);
        div.addEventListener('blur', () => { blocos[i].html = div.innerHTML; Estudos.salvarBlocos(id, blocos); });
      });
    };

    await montar();

    // ---- negrito / itálico / sublinhado / limpar (via DOM, sem execCommand) ----
    const TAG = { bold: 'strong', italic: 'em', underline: 'u' };
    barra.querySelectorAll('[data-cmd]').forEach(b => {
      aoAtivar(b, () => {
        const r = pegarRange(); if (!r) return;
        const novo = b.dataset.cmd === 'removeFormat'
          ? this._ricoLimpar(r)
          : this._ricoAlternarTag(r, TAG[b.dataset.cmd], ativo);
        aplicarResultado(novo);
      });
    });

    // ---- três tamanhos: Título (g) / Normal (m) / Menor (p) ----
    barra.querySelectorAll('[data-size]').forEach(b => {
      aoAtivar(b, () => {
        const r = pegarRange(); if (!r) return;
        const novo = this._ricoEnvolver(r, {
          classe: 'est-tam-' + b.dataset.size,
          limparClasses: ['est-tam-g', 'est-tam-m', 'est-tam-p'], limparEstilo: 'fontSize' });
        aplicarResultado(novo);
      });
    });

    // ---- formatação de BLOCO: marcador, recuo (hierarquia), alinhamento ----
    // Agem no bloco em foco (ativo) — não precisam de seleção.
    const blocoAtivo = () => (ativo && ativo.dataset.edit != null) ? blocos[+ativo.dataset.edit] : null;
    const reaplicarBloco = () => {
      const b = blocoAtivo(); if (!b || !ativo) return;
      const a = this._blocoTextoAttrs(b);
      ativo.className = a.cls + ' estudo-texto-edit';
      ativo.style.background = b.fundo || '';
      Estudos.salvarBlocos(id, blocos);
    };
    const btnMarc = document.getElementById('est-marcador');
    const btnRec = document.getElementById('est-recuar');
    const btnRecF = document.getElementById('est-recuar-fora');
    const btnAlin = document.getElementById('est-alinhar');
    const btnPreen = document.getElementById('est-preencher');
    aoAtivar(btnMarc, () => { const b = blocoAtivo(); if (!b) return; b.marcador = !b.marcador; reaplicarBloco(); });
    aoAtivar(btnRec, () => { const b = blocoAtivo(); if (!b) return; b.nivel = Math.min(4, (+b.nivel || 0) + 1); reaplicarBloco(); });
    aoAtivar(btnRecF, () => { const b = blocoAtivo(); if (!b) return; b.nivel = Math.max(0, (+b.nivel || 0) - 1); reaplicarBloco(); });
    const ALINHAS = ['', 'c', 'd', 'j'];   // esquerda → centro → direita → justificado
    aoAtivar(btnAlin, () => {
      const b = blocoAtivo(); if (!b) return;
      b.alinhar = ALINHAS[(ALINHAS.indexOf(b.alinhar || '') + 1) % ALINHAS.length];
      reaplicarBloco();
    });

    // ---- cor da letra e de fundo: a mesma roda de cores, com Aplicar ----
    const amostraCor = document.getElementById('est-amostra-cor');
    const amostraFundo = document.getElementById('est-amostra-fundo');
    const corAtual = { letra: '#8c2f39', fundo: '#f2c94c' };
    amostraCor.style.background = corAtual.letra;
    amostraFundo.style.background = corAtual.fundo;
    amostraFundo.style.color = Cores.contraste(corAtual.fundo);
    const btnLetra = document.getElementById('est-cor-letra');
    const btnFundo = document.getElementById('est-cor-fundo');

    const aplicarCor = (modo, cor) => {
      const r = pegarRange(); if (!r) return;
      const novo = this._ricoEnvolver(r, modo === 'letra'
        ? { estilo: { color: cor }, limparEstilo: 'color' }
        : { estilo: { backgroundColor: cor }, limparEstilo: 'backgroundColor' });
      aplicarResultado(novo);
    };
    const removerCor = modo => {
      const r = pegarRange(); if (!r) return;
      aplicarResultado(this._ricoLimparEstilo(r, modo === 'letra' ? 'color' : 'backgroundColor', ativo));
    };
    const abrirCaixaCor = modo => {
      const r0 = pegarRange();                      // fixa e lê o trecho
      const prop = modo === 'letra' ? 'color' : 'backgroundColor';
      const atualReal = r0 ? this._ricoCorDoTrecho(r0, prop, ativo) : null;
      if (ativo) ativo.blur();                       // fecha o teclado do celular
      try { window.getSelection().removeAllRanges(); } catch (e) {}   // dispensa a seleção visível
      this.escolherCor({
        cor: corAtual[modo],
        atual: atualReal,                            // null se o trecho não tem essa cor → mostra vazio
        comRemover: true,
        titulo: modo === 'letra' ? 'Cor da letra' : 'Cor de fundo',
      }).then(res => {
        if (!res) return;
        if (res.remover) { removerCor(modo); return; }
        const cor = res;
        corAtual[modo] = cor;
        if (modo === 'letra') amostraCor.style.background = cor;
        else { amostraFundo.style.background = cor; amostraFundo.style.color = Cores.contraste(cor); }
        aplicarCor(modo, cor);
      });
    };
    // A cor abre no CLIQUE (fim do toque), não no pointerdown — senão o "subir o
    // dedo" do mesmo toque cairia na paleta e a fecharia. O trecho é memorizado
    // já no pointerdown (antes de o foco sair), então a cor pega mesmo sem seleção.
    [btnLetra, btnFundo].forEach(b => b.addEventListener('pointerdown', () => pegarRange()));
    btnLetra.onclick = () => abrirCaixaCor('letra');
    btnFundo.onclick = () => abrirCaixaCor('fundo');

    // ---- preencher o bloco inteiro (vira um retângulo ao encostar no de baixo) ----
    const abrirPreencher = () => {
      const b = blocoAtivo(); if (!b) return;
      if (ativo) ativo.blur();
      try { window.getSelection().removeAllRanges(); } catch (e) {}
      this.escolherCor({
        cor: b.fundo || corAtual.fundo,
        atual: b.fundo || null,
        comRemover: true,
        titulo: 'Preencher o bloco',
      }).then(res => {
        if (!res) return;
        b.fundo = res.remover ? '' : res;
        reaplicarBloco();
      });
    };
    btnPreen.onclick = abrirPreencher;   // abre no clique (fim do toque), como as outras cores
  },

  /* Monta o trecho a partir da seleção, perguntando até onde vai. Devolve o
   * trecho pronto, ou null se a pessoa cancelou ou errou o formato. */

  /** Números dos versículos de uma seleção, sem repetir e em ordem.
   *  A seleção (simples ou do "+") é sempre dentro do capítulo aberto. */
  versiculosDaSelecao(selecao) {
    if (!selecao || !selecao.pedacos) return [];
    return [...new Set(selecao.pedacos.map(p => p.vers))].sort((a, b) => a - b);
  },

  /** Monta o trecho a guardar em Lista/Estudo a partir de uma seleção. Quando é
   *  uma seção que cruza capítulos (tem `faixa`), grava no formato de intervalo
   *  contínuo {capInicio,versInicio,capFim,versFim} — que o armazenamento já lê,
   *  exibe e toca de ponta a ponta. Seleção normal segue no formato de sempre
   *  {cap, versiculos:[...]}. */
  _trechoParaGuardar(selecao) {
    const fx = selecao && selecao.faixa;
    if (fx) {
      return { versao: this.versao, code: this.code,
        capInicio: fx.capInicio, versInicio: fx.versInicio,
        capFim: fx.capFim, versFim: fx.versFim };
    }
    return { versao: this.versao, code: this.code, cap: this.cap,
      versiculos: this.versiculosDaSelecao(selecao) };
  },

  /* Ao tocar em "Salvar estudo", abre um painel próprio — mesma largura e fundo
   * claro dos outros — com a opção de estudo novo e a lista dos que já existem.
   * O trecho é exatamente a seleção feita na tela (com o "+", pode pular
   * versículos), então não há mais etapa de "até que capítulo/versículo". */
  abrirSalvarEstudo() {
    if (!this.selecao) return;
    this.selecaoGuardada = this.selecao;
    document.getElementById('barra-selecao').classList.remove('aberta');
    document.body.classList.remove('selecionando');

    this.estudoParcial = this._trechoParaGuardar(this.selecaoGuardada);

    this.desenharSalvarEstudo();
    this.abrir('painel-salvar-estudo');
  },

  desenharSalvarEstudo() {
    const corpo = document.getElementById('corpo-salvar-estudo');
    document.getElementById('titulo-salvar').textContent = 'Salvar estudo';
    const anteriores = Estudos.todos();
    const e = this.estudoParcial;
    const refTrecho = Estudos.refDoTrecho(e);

    corpo.innerHTML = `
      <p class="contagem" style="margin:2px 0 14px">Guardando
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

    // preserva o formato: intervalo (faixa) fica intacto; lista de versículos é clonada
    const trechoAtual = () => Array.isArray(e.versiculos)
      ? { ...e, versiculos: [...e.versiculos] }
      : { ...e };

    document.getElementById('estudo-novo').onclick = async () => {
      const nome = await this.pedirTexto({ titulo: 'Novo estudo', placeholder: 'Nome do estudo (opcional)' });
      if (nome === null) return;
      Estudos.criar({ nome: nome.trim(), trecho: trechoAtual() });
      this.fecharPaineis();
      this.fecharSelecao();
      this.avisoRapido('Estudo criado');
    };

    corpo.querySelectorAll('[data-juntar]').forEach(el => {
      el.onclick = () => {
        Estudos.acrescentar(el.dataset.juntar, trechoAtual());
        this.fecharPaineis();
        this.fecharSelecao();
        this.avisoRapido('Adicionado ao estudo');
      };
    });
  },

  /* "Adicionar à lista" (barra de seleção): espelha o Salvar estudo, mas guarda
   * numa LISTA DE LEITURA — uma sequência de trechos para o modo ouvir tocar em
   * ordem. Criar nova (com nome) ou empilhar numa que já existe. */
  abrirAddLista() {
    if (!this.selecao) return;
    this.selecaoGuardada = this.selecao;
    document.getElementById('barra-selecao').classList.remove('aberta');
    document.body.classList.remove('selecionando');

    this.trechoParcialLista = this._trechoParaGuardar(this.selecaoGuardada);

    this.desenharAddLista();
    this.abrir('painel-add-lista');
  },

  desenharAddLista() {
    const corpo = document.getElementById('corpo-add-lista');
    document.getElementById('titulo-add-lista').textContent = 'Adicionar à lista';
    const anteriores = Listas.todos();
    const t = this.trechoParcialLista;
    const refTrecho = Listas.refDoTrecho(t);

    corpo.innerHTML = `
      <p class="contagem" style="margin:2px 0 14px">Guardando
        <strong>${refTrecho}</strong> · ${t.versao}</p>

      <button class="opcao-estudo-grande novo" id="lista-nova">
        <span class="mais">+</span>
        <span><strong>Nova lista</strong>
          <span class="sub">Começar uma lista de leitura com este trecho</span></span>
      </button>

      ${anteriores.length ? `<div class="grupo"><h3>Ou juntar a uma lista</h3>
        ${anteriores.map(l => {
          const n = Listas.trechosDe(l).length;
          return `<button class="opcao-estudo-grande" data-juntar-lista="${l.id}">
            <span><strong>${Leitura.escapar(Listas.nomeDe(l))}</strong>
              <span class="sub">${Listas.refDe(l)}</span></span>
            <span class="conta-trechos">${n} trecho${n > 1 ? 's' : ''}</span>
          </button>`;
        }).join('')}
      </div>` : ''}`;

    // preserva o formato: intervalo (faixa) fica intacto; lista de versículos é clonada
    const trechoAtual = () => Array.isArray(t.versiculos)
      ? { ...t, versiculos: [...t.versiculos] }
      : { ...t };

    document.getElementById('lista-nova').onclick = async () => {
      const nome = await this.pedirTexto({ titulo: 'Nova lista', placeholder: 'Nome da lista (opcional)' });
      if (nome === null) return;
      Listas.criar({ nome: nome.trim(), trecho: trechoAtual() });
      this.fecharPaineis();
      this.fecharSelecao();
      this.avisoRapido('Lista criada');
    };

    corpo.querySelectorAll('[data-juntar-lista]').forEach(el => {
      el.onclick = () => {
        Listas.acrescentar(el.dataset.juntarLista, trechoAtual());
        this.fecharPaineis();
        this.fecharSelecao();
        this.avisoRapido('Adicionado à lista');
      };
    });
  },

  /* ============================================== listas de leitura (painéis) */

  _abrirListas() {
    this.desenharListas();
    this.abrir('painel-listas');
    this._volta = () => this.abrirMenuFlutuante();
  },

  desenharListas() {
    const corpo = document.getElementById('corpo-listas');
    const listas = Listas.todos();

    if (!listas.length) {
      corpo.innerHTML = `<div class="estado peq">Você ainda não tem listas de leitura.<br>
        Selecione um trecho na Bíblia e toque em <strong>Adicionar à lista</strong>
        para começar a montar uma sequência.</div>`;
      return;
    }

    corpo.innerHTML = listas.map(l => {
      const n = Listas.trechosDe(l).length;
      return `<div class="lista-linha">
        <button class="lista-tocar" data-tocar="${l.id}" aria-label="Tocar lista" title="Tocar">
          <svg class="icone"><use href="#i-play"/></svg>
        </button>
        <button class="lista-abrir" data-abrir="${l.id}">
          <span class="lista-nome">${Leitura.escapar(Listas.nomeDe(l))}</span>
          <span class="lista-sub">${Listas.refDe(l)} · ${n} trecho${n > 1 ? 's' : ''}</span>
        </button>
        <svg class="icone lista-seta"><use href="#i-depois"/></svg>
      </div>`;
    }).join('');

    corpo.querySelectorAll('[data-tocar]').forEach(el => {
      el.onclick = () => this.tocarListaPorId(el.dataset.tocar);
    });
    corpo.querySelectorAll('[data-abrir]').forEach(el => {
      el.onclick = () => this.verLista(el.dataset.abrir);
    });
  },

  /** Gerência de uma lista: renomear, reordenar, remover trecho, tocar. */
  verLista(id) {
    const l = Listas.todos().find(x => x.id === id);
    if (!l) { this.desenharListas(); return; }

    document.getElementById('titulo-lista-ver').textContent = Listas.nomeDe(l);
    const corpo = document.getElementById('corpo-lista-ver');
    const trechos = Listas.trechosDe(l);

    corpo.innerHTML = `
      <div class="lista-topo">
        <button class="botao primario largo" id="lista-play-tudo">
          <svg class="icone"><use href="#i-play"/></svg> Tocar a lista
        </button>
        <div class="lista-topo-acoes">
          <button class="botao secundario" id="lista-renomear">Renomear</button>
          <button class="botao secundario perigo" id="lista-apagar">Apagar lista</button>
        </div>
      </div>
      <h3 class="lista-secao">Sequência (${trechos.length})</h3>
      <div class="lista-trechos" id="lista-trechos">
        ${trechos.map((t, i) => `
          <div class="lista-trecho" data-i="${i}">
            <span class="lista-trecho-num">${i + 1}</span>
            <span class="lista-trecho-ref">
              <strong>${Listas.refDoTrecho(t)}</strong>
              <span class="lista-trecho-versao">${t.versao || ''}</span>
            </span>
            <span class="lista-trecho-mover">
              <button data-subir="${i}" aria-label="Subir" title="Subir" ${i === 0 ? 'disabled' : ''}>
                <svg class="icone"><use href="#i-antes"/></svg></button>
              <button data-descer="${i}" aria-label="Descer" title="Descer" ${i === trechos.length - 1 ? 'disabled' : ''}>
                <svg class="icone"><use href="#i-depois"/></svg></button>
            </span>
            <button class="lista-trecho-x" data-remover="${i}" aria-label="Remover trecho" title="Remover">
              <svg class="icone"><use href="#i-lixeira"/></svg>
            </button>
          </div>`).join('')}
      </div>`;

    this.abrir('painel-lista-ver');
    this._volta = () => this._abrirListas();
    document.getElementById('lista-ver-voltar').onclick = () => this.voltar();

    const recarregar = () => this.verLista(id);

    document.getElementById('lista-play-tudo').onclick = () => this.tocarListaPorId(id);

    document.getElementById('lista-renomear').onclick = async () => {
      const nome = await this.pedirTexto({ titulo: 'Renomear lista', valor: Listas.nomeDe(l) });
      if (nome === null) return;
      Listas.renomear(id, nome.trim());
      recarregar();
    };

    document.getElementById('lista-apagar').onclick = async () => {
      const ok = await this.confirmar({
        titulo: 'Apagar lista',
        mensagem: `Apagar a lista "${Listas.nomeDe(l)}"? Isso não apaga nada da Bíblia, só a sequência.`,
        confirmar: 'Apagar', cancelar: 'Manter',
      });
      if (ok) { Listas.remover(id); this._abrirListas(); }
    };

    corpo.querySelectorAll('[data-subir]').forEach(el => {
      el.onclick = () => { const i = +el.dataset.subir; Listas.mover(id, i, i - 1); recarregar(); };
    });
    corpo.querySelectorAll('[data-descer]').forEach(el => {
      el.onclick = () => { const i = +el.dataset.descer; Listas.mover(id, i, i + 1); recarregar(); };
    });
    corpo.querySelectorAll('[data-remover]').forEach(el => {
      el.onclick = () => {
        const i = +el.dataset.remover;
        Listas.removerTrecho(id, i);
        // se esvaziou, a lista some — volta para a lista de listas
        if (!Listas.todos().find(x => x.id === id)) { this._abrirListas(); return; }
        recarregar();
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

  // Monta os blocos de conteúdo dos Ajustes e devolve um objeto indexado por id.
  // Fica separado do desenho pra que TANTO o painel de Ajustes completo QUANTO
  // os popups contextuais (engrenagem em cada painel) possam pegar o mesmo bloco,
  // sem duplicar código. A fiação dos controles é a mesma (ligarAjustes).
  _blocosAjustes() {
    const p = Prefs.todas();
    const historico = p.estilo === 'historico';
    const folha = `
      <div class="rotulo-controle"><span>Estilo da página</span></div>
      <div class="escolha-radio">
        <label class="opcao-radio">
          <input type="radio" name="estilo-folha" value="tradicional" ${historico ? '' : 'checked'}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Tradicional</strong><span>O papel de sempre, com a temperatura abaixo</span></span>
        </label>
        <label class="opcao-radio">
          <input type="radio" name="estilo-folha" value="historico" ${historico ? 'checked' : ''}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Histórico</strong><span>Pergaminho envelhecido, capitular em vermelho</span></span>
        </label>
      </div>
      ${historico ? `
      <div class="rotulo-controle" style="margin-top:18px"><span>Idade da folha</span>
        <span id="rot-idade">${p.pergaminhoIdade}</span></div>
      <input class="deslizador" type="range" id="ctrl-idade" min="0" max="100" value="${p.pergaminhoIdade}">
      <p class="contagem">Um controle só: envelhece a folha inteira de uma vez —
      as laterais queimam mais, o âmbar aprofunda. Cada capítulo tem a sua folha,
      e ela permanece a mesma quando você volta a ele.</p>

      <div class="rotulo-controle" style="margin-top:18px"><span>Cor da encadernação</span></div>
      <div class="escolha-radio">
        <label class="opcao-radio">
          <input type="radio" name="tema-historico" value="marrom" ${p.historicoTema === 'marrom' ? 'checked' : ''}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Marrom</strong><span>Couro escuro, combina com a folha</span></span>
        </label>
        <label class="opcao-radio">
          <input type="radio" name="tema-historico" value="vermelho" ${p.historicoTema === 'vermelho' ? 'checked' : ''}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Vermelho</strong><span>Capa antiga, detalhes em dourado</span></span>
        </label>
        <label class="opcao-radio">
          <input type="radio" name="tema-historico" value="classico" ${p.historicoTema === 'classico' ? 'checked' : ''}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Creme</strong><span>Barras claras, como na primeira versão</span></span>
        </label>
      </div>` : ''}

      ${!historico ? `
      <div class="rotulo-controle" style="margin-top:22px"><span>Temperatura do papel</span>
        <span id="rot-temp">${p.temperatura}</span></div>
      <input class="deslizador" type="range" id="ctrl-temp" min="0" max="100" value="${p.temperatura}">
      <div class="amostra-folha" id="amostra">No princípio, Deus criou o céu e a terra.</div>` : ''}

      <div class="rotulo-controle" style="margin-top:20px"><span>Tamanho da letra</span>
        <span id="rot-fonte">${p.fonte}px</span></div>
      <input class="deslizador" type="range" id="ctrl-fonte" min="15" max="34" value="${p.fonte}">

      <div class="rotulo-controle" style="margin-top:22px"><span>Modo de leitura</span></div>
      <div class="escolha-radio">
        <label class="opcao-radio">
          <input type="radio" name="pagina-modo" value="quebra" ${p.paginaModo !== 'continuo' ? 'checked' : ''}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Com quebra de capítulo</strong><span>Um capítulo por vez; deslizar troca de capítulo</span></span>
        </label>
        <label class="opcao-radio">
          <input type="radio" name="pagina-modo" value="continuo" ${p.paginaModo === 'continuo' ? 'checked' : ''}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Contínuo</strong><span>Capítulos do livro em sequência; deslizar troca de livro</span></span>
        </label>
      </div>

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

      <label class="interruptor"><span>Exibir anotação no versículo</span>
        <input type="checkbox" id="ctrl-notas" ${p.mostrarNotas ? 'checked' : ''}></label>
      <p class="contagem">Mostra um sinalzinho ao lado do número quando o
      versículo tem anotação no caderno. Toque nele para abrir as anotações.</p>

      <label class="interruptor"><span>Subtítulos</span>
        <input type="checkbox" id="ctrl-subtitulos" ${p.subtitulosLigado ? 'checked' : ''}></label>
      <p class="contagem">Os subtítulos temáticos (como “O Verbo se faz carne”)
      mostrados no meio do texto. Ligue para escolher como aparecem.</p>

      <div id="bloco-subtitulos" style="${p.subtitulosLigado ? '' : 'display:none'}">
        <div class="rotulo-controle" style="margin-top:14px"><span>Exibir subtítulos</span></div>
        <div class="escolha-radio">
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-modo" value="nativo" ${p.subtituloModo === 'nativo' ? 'checked' : ''}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>Só os da própria tradução</strong><span>Cada versão mostra os seus; onde não houver, fica sem</span></span>
          </label>
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-modo" value="nativo-favorito" ${p.subtituloModo === 'nativo' || p.subtituloModo === 'favorito' ? '' : 'checked'}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>Os da tradução e completar com o favorito</strong><span>Usa os próprios e preenche o resto com os do favorito</span></span>
          </label>
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-modo" value="favorito" ${p.subtituloModo === 'favorito' ? 'checked' : ''}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>Sempre os do favorito</strong><span>Os subtítulos do favorito aparecem em todas as traduções</span></span>
          </label>
        </div>

        <div id="bloco-subtitulo-favorito" style="margin-top:12px;${p.subtituloModo === 'nativo' ? 'display:none' : ''}">
          <div class="rotulo-controle"><span>Subtítulo favorito</span></div>
          <select id="ctrl-subtitulo-favorito">
            ${Dados.subtitulosDisponiveis().map(v => `<option value="${v.code}" ${p.subtituloFavorito === v.code ? 'selected' : ''}>${v.rotulo}</option>`).join('')}
          </select>
        </div>

        <div class="rotulo-controle" style="margin-top:14px"><span>Letra do subtítulo</span></div>
        <div class="escolha-radio">
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-estilo" value="classico" ${p.subtituloEstilo === 'rubricada' || p.subtituloEstilo === 'vermelho' ? '' : 'checked'}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>Clássica</strong><span>Em negrito e reta, como nas Bíblias impressas</span></span>
          </label>
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-estilo" value="rubricada" ${p.subtituloEstilo === 'rubricada' || p.subtituloEstilo === 'vermelho' ? 'checked' : ''}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>Rubricada</strong><span>Em itálico, com um traço mais decorado</span></span>
          </label>
        </div>

        <div class="rotulo-controle" style="margin-top:14px"><span>Cor do subtítulo</span></div>
        <div class="escolha-radio">
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-cor" value="texto" ${p.subtituloCor === 'vermelho' ? '' : 'checked'}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>Cor do texto</strong><span>Acompanha a tinta da Bíblia, do preto ao marrom</span></span>
          </label>
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-cor" value="vermelho" ${p.subtituloCor === 'vermelho' ? 'checked' : ''}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>Vermelho</strong><span>No tom da rubrica dos manuscritos</span></span>
          </label>
        </div>

        <div class="rotulo-controle" style="margin-top:14px"><span>Alinhamento do subtítulo</span></div>
        <div class="escolha-radio">
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-alinhamento" value="esquerda" ${p.subtituloAlinhamento === 'esquerda' ? 'checked' : ''}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>À esquerda</strong></span>
          </label>
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-alinhamento" value="centro" ${p.subtituloAlinhamento === 'esquerda' || p.subtituloAlinhamento === 'direita' ? '' : 'checked'}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>Centralizado</strong></span>
          </label>
          <label class="opcao-radio">
            <input type="radio" name="subtitulo-alinhamento" value="direita" ${p.subtituloAlinhamento === 'direita' ? 'checked' : ''}>
            <span class="marca-radio"></span>
            <span class="rotulo-radio"><strong>À direita</strong></span>
          </label>
        </div>

        <label class="interruptor" style="margin-top:16px"><span>Anunciar na leitura em voz</span>
          <input type="checkbox" id="ctrl-voz-subtitulos" ${p.vozSubtitulos ? 'checked' : ''}></label>
        <p class="contagem">Durante a leitura em voz alta, o subtítulo da seção é
        pronunciado uma vez, ao começar a seção, com uma pausa antes e depois.
        Vale enquanto os subtítulos estiverem sendo exibidos.</p>
      </div>

      <label class="interruptor"><span>Modo escuro</span>
        <input type="checkbox" id="ctrl-escuro" ${p.escuro ? 'checked' : ''}></label>
      ${p.escuro ? '<p class="contagem">A temperatura do papel só vale no modo claro.</p>' : ''}`;

    const livros = `
      <div class="rotulo-controle"><span>Layout do painel</span></div>
      <div class="escolha-radio">
        <label class="opcao-radio">
          <input type="radio" name="painel-layout" value="lista" ${p.painelLayout === 'estante' ? '' : 'checked'}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Lista</strong><span>Um campo no topo escolhe Toda a Bíblia, Antigo ou Novo; os livros vêm numa lista corrida</span></span>
        </label>
        <label class="opcao-radio">
          <input type="radio" name="painel-layout" value="estante" ${p.painelLayout === 'estante' ? 'checked' : ''}>
          <span class="marca-radio"></span>
          <span class="rotulo-radio"><strong>Estante</strong><span>Grade de livros, dois por linha, como uma estante</span></span>
        </label>
      </div>

      <label class="interruptor" style="margin-top:16px"><span>Mostrar categorias</span>
        <input type="checkbox" id="ctrl-categorias" ${p.mostrarCategorias ? 'checked' : ''}></label>
      <p class="contagem">Na Lista e na Estante, vira uma divisória com o nome da
      categoria entre os livros (sem recolher). Desligado, os livros vêm direto,
      sem categorias.</p>

      <label class="interruptor"><span>Mostrar capítulos</span>
        <input type="checkbox" id="ctrl-capitulos" ${p.mostrarCapitulos ? 'checked' : ''}></label>
      <p class="contagem">A quantidade de capítulos ao lado (ou abaixo, na Estante) de
      cada livro, e as somas por Testamento e categoria na Lista. Desligado, os nomes
      ficam sozinhos.</p>`;

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

    const listaMarc = Marcadores.lista();
    const podeExcluirMarc = listaMarc.length > 1;   // sempre resta ao menos um
    const marcadores = `
      <p class="contagem">Trocar a cor aqui recolore de uma vez todos os
      trechos ligados àquele marcador.</p>
      ${listaMarc.map(m => `<div class="item-marcador" data-item="${m.id}">
        <button class="bolha-cor" data-abrir-cor="${m.id}"
          style="background:${m.cor}" title="Escolher a cor"></button>
        <input type="text" class="campo" value="${Leitura.escapar(m.nome)}" data-nome="${m.id}">
        <span class="sub">${Marcadores.porMarcador(m.id).length}</span>
        ${podeExcluirMarc ? `<button class="excluir-marcador" data-excluir="${m.id}"
          aria-label="Excluir marcador" title="Excluir marcador">
          <svg class="icone"><use href="#i-lixeira"/></svg></button>` : ''}
      </div>
      <div class="caixa-cor fechada" data-caixa="${m.id}"></div>`).join('')}
      <button class="botao secundario add-marcador" id="add-marcador"
        ${Marcadores.podeAdicionar() ? '' : 'disabled'}>+ Novo marcador</button>
      ${Marcadores.podeAdicionar()
        ? ''
        : `<p class="contagem">Limite de ${Marcadores.limite()} marcadores atingido.</p>`}`;

    const vozes = Locutor.vozes();
    const ouvir = Locutor.disponivel() ? `
      <p class="contagem">Escolha a voz e a velocidade da leitura em voz alta.
      Toque em <strong>Ouvir a voz</strong> para experimentar. Para ouvir a
      Bíblia, use <strong>Ouvir</strong> no menu.</p>

      <div class="rotulo-controle"><span>Voz</span></div>
      <select class="campo" id="ctrl-voz">
        ${vozes.length
          ? vozes.map(v => `<option value="${Leitura.escapar(v.voiceURI)}"
              ${v.voiceURI === p.vozURI ? 'selected' : ''}>${Leitura.escapar(v.name)} — ${Leitura.escapar(v.lang)}</option>`).join('')
          : '<option value="">carregando as vozes do aparelho…</option>'}
      </select>

      <div class="rotulo-controle" style="margin-top:16px"><span>Velocidade</span>
        <span id="rot-vel">${(+p.vozVel || 1).toFixed(1)}×</span></div>
      <input class="deslizador" type="range" id="ctrl-vel" min="0.5" max="2" step="0.1" value="${+p.vozVel || 1}">

      <div class="rotulo-controle" style="margin-top:16px"><span>Modo repetição</span></div>
      <select class="campo" id="ctrl-repeticao">
        <option value="0" ${(+p.repeticaoLimite || 0) === 0 ? 'selected' : ''}>Infinito</option>
        ${[1,2,3,4,5,6,7,8,9,10].map(n =>
          `<option value="${n}" ${(+p.repeticaoLimite || 0) === n ? 'selected' : ''}>${n} ${n === 1 ? 'vez' : 'vezes'}</option>`).join('')}
      </select>
      <p class="contagem">Quantas vezes os modos <strong>Repetindo o capítulo</strong> e
      <strong>Repetindo o versículo</strong> repetem antes de encerrar. No botão de
      repetição aparece quantas faltam.</p>

      <button class="botao secundario" id="ouvir-amostra" style="margin-top:18px">Ouvir a voz</button>

      <button class="link-ajuda" id="voz-ajuda">
        <svg class="icone"><use href="#i-info"/></svg>
        <span>Trazer vozes novas para o aparelho</span>
      </button>`
      : `<p class="contagem">Este navegador não oferece leitura em voz. Tente
        pelo Chrome ou pelo aplicativo instalado na tela inicial.</p>`;

    const guarda = `<p class="contagem">${Guarda.persistente()
      ? 'O histórico e os marcadores estão sendo gravados neste dispositivo.'
      : 'Atenção: este navegador não está permitindo gravar. O histórico vai durar só até fechar o aplicativo.'}</p>`;


    return {
      folha:      { titulo: 'Página',            html: folha },
      livros:     { titulo: 'Painel de livros',  html: livros },
      comparar:   { titulo: 'Comparar',          html: comparar },
      tirinha:    { titulo: 'Versões empilhadas', html: tirinha },
      ouvir:      { titulo: 'Ouvir',             html: ouvir },
      marcadores: { titulo: 'Marcadores',        html: marcadores },
      guarda:     { titulo: 'Armazenamento',     html: guarda },
    };
  },

  desenharAjustes() {
    const corpo = document.getElementById('corpo-ajustes');
    const blocos = this._blocosAjustes();

    corpo.innerHTML =
      this.secao('folha', blocos.folha.titulo, blocos.folha.html) +
      this.secao('livros', blocos.livros.titulo, blocos.livros.html) +
      this.secao('comparar', blocos.comparar.titulo, blocos.comparar.html) +
      this.secao('tirinha', blocos.tirinha.titulo, blocos.tirinha.html) +
      this.secao('ouvir', blocos.ouvir.titulo, blocos.ouvir.html) +
      this.secao('marcadores', blocos.marcadores.titulo, blocos.marcadores.html) +
      this.secao('guarda', blocos.guarda.titulo, blocos.guarda.html);

    corpo.querySelectorAll('[data-s]').forEach(el => {
      el.onclick = () => {
        this.dobraA = this.dobraA === el.dataset.s ? null : el.dataset.s;
        this.desenharAjustes();
      };
    });

    this.ligarAjustes();
  },

  ligarAjustes(escopo) {
    // escopo: onde procurar os controles. Por padrão é o painel de Ajustes
    // completo (#corpo-ajustes); os popups contextuais passam o próprio container.
    // Assim a MESMA fiação serve os dois lugares, sem duplicar nada.
    const corpo = escopo || document.getElementById('corpo-ajustes');
    // busca por id restrita ao escopo (evita achar um controle de mesmo id no
    // painel completo quando o popup está aberto)
    const achar = id => corpo.querySelector('#' + id);

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

    corpo.querySelectorAll('input[name="estilo-folha"]').forEach(el => {
      el.onchange = () => {
        Prefs.set('estilo', el.value);
        // Se o usuário escolhe um estilo de propósito, o escuro deixa de ser uma
        // "visita": escolher Histórico desliga o escuro (que não vale lá);
        // escolher Tradicional só limpa a memória de retorno.
        if (el.value === 'historico' && Prefs.get('escuro')) {
          Prefs.set('escuro', false);
          Leitura.aplicarEscuro(false);
        }
        Prefs.set('estiloAntesEscuro', null);
        Pergaminho.aplicarIdade(Prefs.get('pergaminhoIdade'));
        Pergaminho.aplicarEstilo(el.value);
        if (el.value === 'historico') Pergaminho.folha(this.code, this.cap);
        this._redesenharAjustesContextual();   // mostra/esconde o controle de idade (no popup ou no painel)
      };
    });

    corpo.querySelectorAll('input[name="tema-historico"]').forEach(el => {
      el.onchange = () => {
        Prefs.set('historicoTema', el.value);
        Pergaminho.aplicarTema(el.value);
      };
    });

    const idade = achar('ctrl-idade');
    if (idade) {
      idade.oninput = () => {
        achar('rot-idade').textContent = idade.value;
        Pergaminho.aplicarIdade(+idade.value);
      };
      idade.onchange = () => Prefs.set('pergaminhoIdade', +idade.value);
    }

    const fonte = achar('ctrl-fonte');
    if (fonte) {
      fonte.oninput = () => {
        achar('rot-fonte').textContent = fonte.value + 'px';
        Leitura.aplicarFonte(+fonte.value);
      };
      fonte.onchange = () => Prefs.set('fonte', +fonte.value);
    }

    corpo.querySelectorAll('input[name="pagina-modo"]').forEach(el => {
      el.onchange = () => {
        Prefs.set('paginaModo', el.value);
        this.ir(this.code, this.cap, null, { registrar: false });   // re-renderiza mantendo a posição
      };
    });

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
      this.sincronizarBotaoFixarTirinha();
    };

    const notas = achar('ctrl-notas');
    if (notas) notas.onchange = e => {
      Prefs.set('mostrarNotas', e.target.checked);
      Leitura.aplicarModoNotas(e.target.checked);
    };

    // interruptor-chave dos subtítulos: liga/desliga o grupo inteiro. Desligado,
    // esconde todas as opções e a leitura fica sem subtítulos.
    const subtitulos = achar('ctrl-subtitulos');
    const blocoSub = corpo.querySelector('#bloco-subtitulos');
    if (subtitulos) subtitulos.onchange = e => {
      Prefs.set('subtitulosLigado', e.target.checked);
      if (blocoSub) blocoSub.style.display = e.target.checked ? '' : 'none';
      this._vizCache = {};
      this.ir(this.code, this.cap, null);
    };

    // anunciar o subtítulo na leitura em voz: só guarda a preferência; entra em
    // vigor na próxima montagem da fila (o portão de "exibido" já vem do próprio
    // subtitulosLigado, via Dados.secoesParaLeitura).
    const vozSub = achar('ctrl-voz-subtitulos');
    if (vozSub) vozSub.onchange = e => { Prefs.set('vozSubtitulos', e.target.checked); };

    // modo de exibição dos subtítulos (as três opções). Muda o conteúdo, então
    // limpa os vizinhos e redesenha a leitura. O menu de favorito só aparece nos
    // modos que recorrem a ele (todos menos "só os da própria tradução").
    const usaFavorito = m => m !== 'nativo';
    const blocoFav = corpo.querySelector('#bloco-subtitulo-favorito');
    corpo.querySelectorAll('input[name="subtitulo-modo"]').forEach(el => {
      el.onchange = ev => {
        if (!ev.target.checked) return;
        Prefs.set('subtituloModo', ev.target.value);
        if (blocoFav) blocoFav.style.display = usaFavorito(ev.target.value) ? '' : 'none';
        this._vizCache = {};
        this.ir(this.code, this.cap, null);
      };
    });

    const favorito = achar('ctrl-subtitulo-favorito');
    if (favorito) favorito.onchange = e => {
      Prefs.set('subtituloFavorito', e.target.value);
      this._vizCache = {};
      this.ir(this.code, this.cap, null);
    };

    // estilo e alinhamento do subtítulo: só trocam um atributo no raiz, então
    // o CSS reflete na hora, sem redesenhar o texto
    corpo.querySelectorAll('input[name="subtitulo-estilo"]').forEach(el => {
      el.onchange = ev => {
        if (!ev.target.checked) return;
        Prefs.set('subtituloEstilo', ev.target.value);
        Leitura.aplicarSubtituloEstilo(ev.target.value);
      };
    });
    corpo.querySelectorAll('input[name="subtitulo-cor"]').forEach(el => {
      el.onchange = ev => {
        if (!ev.target.checked) return;
        Prefs.set('subtituloCor', ev.target.value);
        Leitura.aplicarSubtituloCor(ev.target.value);
      };
    });
    corpo.querySelectorAll('input[name="subtitulo-alinhamento"]').forEach(el => {
      el.onchange = ev => {
        if (!ev.target.checked) return;
        Prefs.set('subtituloAlinhamento', ev.target.value);
        Leitura.aplicarSubtituloAlinhamento(ev.target.value);
      };
    });

    const escuro = achar('ctrl-escuro');
    if (escuro) escuro.onchange = e => {
      const ligar = e.target.checked;
      Prefs.set('escuro', ligar);

      // O modo escuro só tem efeito no estilo Tradicional (no Histórico, o
      // pergaminho impõe as próprias cores). Pra simplificar pro usuário, ligar
      // o escuro leva pro Tradicional automaticamente; desligar volta pro
      // Histórico de onde veio.
      if (ligar) {
        if (Prefs.get('estilo') === 'historico') {
          Prefs.set('estiloAntesEscuro', 'historico');   // lembra pra onde voltar
          Prefs.set('estilo', 'tradicional');
          Pergaminho.aplicarEstilo('tradicional');
        }
        Leitura.aplicarEscuro(true);
      } else {
        Leitura.aplicarEscuro(false);
        // volta pro estilo de onde veio (se o escuro tinha forçado o Tradicional)
        if (Prefs.get('estiloAntesEscuro') === 'historico') {
          Prefs.set('estilo', 'historico');
          Prefs.set('estiloAntesEscuro', null);
          Pergaminho.aplicarIdade(Prefs.get('pergaminhoIdade'));
          Pergaminho.aplicarEstilo('historico');
          Pergaminho.folha(this.code, this.cap);
        }
      }
      this._redesenharAjustesContextual();   // reflete estilo + aviso ao vivo
    };

    const voz = achar('ctrl-voz');
    if (voz) {
      voz.onchange = () => { Prefs.set('vozURI', voz.value || null); this.ouvirAmostra(); };
      // as vozes chegam depois no Chrome: quando chegarem, redesenha a lista
      if (!Locutor.vozes().length) Locutor.aoCarregarVozes(() => {
        if (document.getElementById('painel-ajustes').classList.contains('aberto')) this.desenharAjustes();
      });
    }

    const vel = achar('ctrl-vel');
    if (vel) {
      vel.oninput = () => { achar('rot-vel').textContent = (+vel.value).toFixed(1) + '×'; };
      vel.onchange = () => Prefs.set('vozVel', +vel.value);
    }

    const repeticao = achar('ctrl-repeticao');
    if (repeticao) repeticao.onchange = () => {
      Prefs.set('repeticaoLimite', +repeticao.value);
      // se já está ouvindo com um modo de repetição ligado, reinicia a contagem
      this._reiniciarContagemRepeticao();
      this._atualizarRepetirBotao();
    };

    const amostra = achar('ouvir-amostra');
    if (amostra) amostra.onclick = () => this.ouvirAmostra();

    const ajudaVoz = achar('voz-ajuda');
    if (ajudaVoz) ajudaVoz.onclick = () => this.ajudaVozes();

    const cats = achar('ctrl-categorias');
    if (cats) cats.onchange = e => {
      Prefs.set('mostrarCategorias', e.target.checked);
      this.dobraC = null;
      this._redesenharArvoreSeAberta();   // reflete ao vivo (popup contextual)
    };

    const caps = achar('ctrl-capitulos');
    if (caps) caps.onchange = e => {
      Prefs.set('mostrarCapitulos', e.target.checked);
      this._redesenharArvoreSeAberta();   // reflete ao vivo (popup contextual)
    };

    corpo.querySelectorAll('input[name="painel-layout"]').forEach(el => {
      el.onchange = () => {
        Prefs.set('painelLayout', el.value);
        this._redesenharArvoreSeAberta();   // reflete ao vivo (popup contextual)
      };
    });

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

    const addMarc = achar('add-marcador');
    if (addMarc) addMarc.onclick = () => {
      if (!Marcadores.adicionar()) return;   // no teto de 66, não faz nada
      this.desenharAjustes();   // redesenha; a seção Marcadores segue aberta
    };

    corpo.querySelectorAll('[data-excluir]').forEach(el => {
      el.onclick = async () => {
        const id = +el.dataset.excluir;
        const m = Marcadores.de(id);
        const n = Marcadores.porMarcador(id).length;
        const aviso = n
          ? ` Ele está em ${n} ${n === 1 ? 'trecho marcado' : 'trechos marcados'}; a cor será removida deles.`
          : '';
        const ok = await this.confirmar({
          titulo: 'Excluir marcador',
          mensagem: `Excluir \"${m ? m.nome : 'este marcador'}\"?${aviso}`,
          confirmar: 'Excluir',
        });
        if (!ok) return;
        Marcadores.remover(id);
        // se um versículo aberto usava a cor, repinta a folha para tirá-la
        this.desenharAjustes();
        if (typeof this.repintarMarcasVisiveis === 'function') this.repintarMarcasVisiveis();
      };
    });

    // roda de cores: abre no popup padrão
    corpo.querySelectorAll('[data-abrir-cor]').forEach(el => {
      el.onclick = () => {
        const id = +el.dataset.abrirCor;
        this.escolherCor({ cor: Marcadores.de(id).cor, titulo: 'Cor do marcador' }).then(cor => {
          if (!cor) return;
          Marcadores.atualizar(id, { cor });
          el.style.background = cor;
          document.querySelectorAll(`.v [data-marcador="${id}"], .v[data-marcador="${id}"]`)
            .forEach(v => v.style.setProperty('--marca', Leitura.corMarca(cor)));
        });
      };
    });
  },

  /* ============================================== popup contextual de ajuste
   *
   * Abre um cartão flutuante no centro da tela com APENAS o módulo de ajuste
   * pedido (ex.: 'livros', 'folha', 'ouvir'). Reaproveita o mesmo HTML de
   * _blocosAjustes() e a mesma fiação de ligarAjustes() — nada é recriado.
   * Como o cartão é pequeno e central, sobra tela em cima e embaixo, e a pessoa
   * vê a mudança acontecendo ao vivo no texto por trás. */
  abrirAjustePopup(id) {
    const blocos = this._blocosAjustes();
    const bloco = blocos[id];
    if (!bloco) return;

    // remove qualquer popup anterior (não empilha)
    this.fecharAjustePopup();
    this._popupAjusteId = id;   // lembra o módulo aberto, pra redesenhar ao vivo

    const fundo = document.createElement('div');
    fundo.className = 'ajuste-popup-fundo';
    fundo.id = 'ajuste-popup-fundo';

    const cartao = document.createElement('div');
    cartao.className = 'ajuste-popup';
    cartao.setAttribute('role', 'dialog');
    cartao.setAttribute('aria-modal', 'true');
    cartao.innerHTML = `
      <header class="ajuste-popup-cabeca">
        <h3>${bloco.titulo}</h3>
        <button class="ajuste-popup-x" aria-label="Fechar">
          <svg class="icone"><use href="#i-fechar"/></svg>
        </button>
      </header>
      <div class="ajuste-popup-corpo" id="ajuste-popup-corpo">${bloco.html}</div>`;

    fundo.appendChild(cartao);
    document.body.appendChild(fundo);

    // liga os controles usando o próprio corpo do popup como escopo —
    // a MESMA fiação do painel completo, mas restrita a este cartão
    const corpoPopup = cartao.querySelector('#ajuste-popup-corpo');
    this.ligarAjustes(corpoPopup);

    // fechar: no x, tocando no fundo (fora do cartão), ou Esc
    cartao.querySelector('.ajuste-popup-x').onclick = () => this.fecharAjustePopup();
    fundo.onclick = (e) => { if (e.target === fundo) this.fecharAjustePopup(); };
    this._escAjustePopup = (e) => { if (e.key === 'Escape') this.fecharAjustePopup(); };
    document.addEventListener('keydown', this._escAjustePopup);

    // entra com uma animaçãozinha
    requestAnimationFrame(() => fundo.classList.add('visivel'));
  },

  fecharAjustePopup() {
    this._popupAjusteId = null;
    const fundo = document.getElementById('ajuste-popup-fundo');
    if (fundo) fundo.remove();
    if (this._escAjustePopup) {
      document.removeEventListener('keydown', this._escAjustePopup);
      this._escAjustePopup = null;
    }
  },

  // Redesenha só o conteúdo do popup (sem fechar/reabrir), atualizando o HTML do
  // módulo e religando os controles. Usado quando um controle precisa mostrar ou
  // esconder outro ao vivo — ex.: no modo Histórico aparece o controle de idade.
  _redesenharPopupAjuste() {
    const corpoPopup = document.getElementById('ajuste-popup-corpo');
    if (!corpoPopup || !this._popupAjusteId) return;
    const blocos = this._blocosAjustes();
    const bloco = blocos[this._popupAjusteId];
    if (!bloco) return;
    const scroll = corpoPopup.scrollTop;   // preserva a posição de rolagem
    corpoPopup.innerHTML = bloco.html;
    this.ligarAjustes(corpoPopup);
    corpoPopup.scrollTop = scroll;
  },

  // Redesenha o contexto certo: se o popup está aberto, atualiza o popup;
  // senão, atualiza o painel de Ajustes completo. Substitui as chamadas diretas
  // a desenharAjustes() dentro da fiação, pra os controles funcionarem nos dois.
  _redesenharAjustesContextual() {
    if (this._popupAjusteId) this._redesenharPopupAjuste();
    else this.desenharAjustes();
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
    // interlinear: a voz nativa não pronuncia hebraico/grego, então lemos a
    // transliteração guardada em data-fala (também serve para copiar/compartilhar)
    if (el.dataset && el.dataset.fala) return el.dataset.fala;
    const n = el.querySelector('.n');
    const inteiro = el.textContent;
    return n ? inteiro.slice(n.textContent.length) : inteiro;
  },

  /* Repinta as marcas dos versículos que estão na tela, a partir do estado
   * atual. Usado após excluir um marcador: a cor some na hora, sem redesenhar
   * o capítulo inteiro nem pular o scroll. */
  repintarMarcasVisiveis() {
    const versificacao = Dados.versificacaoDe(this.versao);
    this._escopoVersos().querySelectorAll('.v').forEach(el => {
      const vers = +el.dataset.vers;
      const faixas = Marcadores.faixas(versificacao, this.code, this.cap, vers);
      Leitura.pintarMarca(vers, this.textoDoVersiculo(el), faixas);
    });
  },

  /* ============================================================ caderno
   *
   * Anotacoes presas a um versiculo. A tela do versiculo (`painel-anot`) serve
   * a dois papeis: a lista das notas daquele versiculo e o editor de uma nota.
   * O caderno (`painel-caderno`) e a visao geral, todas as notas agrupadas por
   * passagem.
   */

  /* Poe ou tira o sinalzinho dos versiculos na tela, sem redesenhar o capitulo
   * — assim a nota aparece/some na hora, sem pulo de rolagem. */
  repintarNotasVisiveis() {
    const versificacao = Dados.versificacaoDe(this.versao);
    const comNota = Anotacoes.noCapitulo(versificacao, this.code, this.cap);
    this._escopoVersos().querySelectorAll('.v').forEach(el => {
      const vers = +el.dataset.vers;
      const tem = el.querySelector('.marca-nota');
      if (comNota.has(vers) && !tem) {
        const n = el.querySelector('.n');
        const alvo = n || el.firstChild;
        if (n) n.insertAdjacentHTML('afterend', Leitura.marcaNotaHTML(vers));
        else el.insertAdjacentHTML('afterbegin', Leitura.marcaNotaHTML(vers));
        void alvo;
      } else if (!comNota.has(vers) && tem) {
        tem.remove();
      }
    });
  },

  /** Anotar pela barra de seleção. A nota se prende ao primeiro versículo, mas
   *  o título mostra a referência do agrupamento inteiro (ex.: João 3:16-18). */
  anotarSelecao() {
    if (!this.selecao) return;
    const pedacos = this.selecao.pedacos;
    const versiculos = this.versiculosDaSelecao(this.selecao);
    const vers = versiculos[0];
    const ref = this.referenciaDaSelecao(pedacos);
    // seleção simples: fecha a barra como antes. No modo de vários, mantém o
    // grupo na tela para a pessoa seguir usando depois de fechar a nota.
    if (!(this.multiAtivo || this.multiSelecao)) this.fecharSelecao();
    this.editarAnotacao(vers, null, ref, versiculos);
  },

  /** Leitura da anotação numa folha flutuante limpa — sem painel e sem barra.
   *  É o que abre ao tocar no sinal do versículo. A folha rola por dentro; o X
   *  (canto superior direito) e o lápis (canto inferior direito) ficam fixos. O
   *  lápis leva ao editor; a folha só mostra, nunca edita direto. */
  verAnotacoes(vers) {
    this.anotVers = vers;
    const versificacao = Dados.versificacaoDe(this.versao);
    const notas = Anotacoes.daPassagem(versificacao, this.code, this.cap, vers);

    // sem nota (p.ex. acabou de ser apagada): cai na lista de sempre
    if (!notas.length) return this.abrirAnotacoes(vers);

    const folhas = notas.map(a => `<article class="folha-anot">
        <div class="corpo-nota">${Anotacoes.limpar(a.corpo)}</div>
        <div class="quando-nota">${Anotacoes.quandoDe(a)}</div>
      </article>`).join('');
    document.getElementById('visor-rolo').innerHTML =
      `<div class="leitura-anot">${folhas}</div>`;

    // o lápis edita: uma nota só vai direto ao editor; várias abrem a lista
    document.getElementById('visor-editar').onclick = () => {
      this.fecharVisorNota();
      if (notas.length === 1) {
        this.editarAnotacao(vers, notas[0].id);
        this.abrir('painel-anot');
      } else {
        this.abrirAnotacoes(vers);
      }
    };
    document.getElementById('visor-fechar').onclick = () => this.fecharVisorNota();

    this.abrirVisorNota();
  },

  abrirVisorNota() {
    this.fecharPaineis();                       // fecha painéis/tirinha e reusa o véu
    document.getElementById('veu').classList.add('aberto');
    const v = document.getElementById('visor-nota');
    v.classList.add('aberto');
    v.setAttribute('aria-hidden', 'false');
    document.getElementById('visor-rolo').scrollTop = 0;
  },

  fecharVisorNota() {
    const v = document.getElementById('visor-nota');
    v.classList.remove('aberto');
    v.setAttribute('aria-hidden', 'true');
    document.getElementById('veu').classList.remove('aberto');
  },

  /** Leitura da anotação dentro do painel (aberta pelo menu Anotação): mesma
   *  folha branca, mas com o X no cabeçalho do painel e um botão "Editar"
   *  comum embaixo, para ficar padronizado com o restante do menu. */
  verAnotacaoPainel(vers) {
    this.anotVers = vers;
    const versificacao = Dados.versificacaoDe(this.versao);
    const notas = Anotacoes.daPassagem(versificacao, this.code, this.cap, vers);

    // sem nota (p.ex. acabou de ser apagada): cai na lista de sempre
    if (!notas.length) return this.abrirAnotacoes(vers);

    document.getElementById('titulo-anot').textContent = this.refDaPassagem(vers);
    const corpo = document.getElementById('corpo-anot');
    corpo.classList.remove('corpo-editor');

    const folhas = notas.map(a => `<article class="folha-anot">
        <div class="corpo-nota">${Anotacoes.limpar(a.corpo)}</div>
        <div class="quando-nota">${Anotacoes.quandoDe(a)}</div>
      </article>`).join('');

    corpo.innerHTML = `
      <div class="leitura-anot">${folhas}</div>
      <div class="acoes-anot">
        <button class="botao" id="editar-anot">Editar</button>
      </div>`;

    document.getElementById('editar-anot').onclick = () => this.abrirAnotacoes(vers);
    this.abrir('painel-anot');
  },

  /** Abre a lista de anotações de um versículo (com editar e excluir). */
  abrirAnotacoes(vers) {
    this.anotVers = vers;
    this.desenharListaAnotacoes(vers);
    this.abrir('painel-anot');
  },

  refDaPassagem(vers) {
    const nome = Dados.nomeCurto(this.versao, this.code);
    return `${nome} ${this.cap}:${vers}`;
  },

  desenharListaAnotacoes(vers) {
    const versificacao = Dados.versificacaoDe(this.versao);
    const notas = Anotacoes.daPassagem(versificacao, this.code, this.cap, vers);
    document.getElementById('titulo-anot').textContent = this.refDaPassagem(vers);
    const corpo = document.getElementById('corpo-anot');
    corpo.classList.remove('corpo-editor');

    const cartoes = notas.map(a => `<div class="cartao-anot">
        <button class="anot-corpo" data-editar="${a.id}">
          <div class="anot-ref">${Anotacoes.refDe(a)}</div>
          <div class="anot-previa">${Leitura.escapar(Anotacoes.resumo(a)) || '<em>(nota vazia)</em>'}</div>
          <div class="quando">${Anotacoes.quandoDe(a)}</div>
        </button>
        <button class="xis" data-excluir-anot="${a.id}" aria-label="Excluir anotação"
          title="Excluir anotação"><svg class="icone"><use href="#i-lixeira"/></svg></button>
      </div>`).join('');

    corpo.innerHTML = `
      <p class="contagem">Anotações ligadas a <strong>${this.refDaPassagem(vers)}</strong>.
      Elas acompanham esta passagem em todas as versões da mesma numeração.</p>
      ${cartoes || '<div class="estado">Nenhuma anotação aqui ainda.</div>'}
      <button class="botao nova-anot" id="nova-anot">+ Nova anotação</button>`;

    document.getElementById('nova-anot').onclick = () => this.editarAnotacao(vers, null);

    corpo.querySelectorAll('[data-editar]').forEach(el => {
      el.onclick = () => this.editarAnotacao(vers, el.dataset.editar);
    });

    corpo.querySelectorAll('[data-excluir-anot]').forEach(el => {
      el.onclick = async e => {
        e.stopPropagation();
        const ok = await this.confirmar({
          titulo: 'Excluir anotação',
          mensagem: 'Excluir esta anotação? Não dá para desfazer.',
          confirmar: 'Excluir',
        });
        if (!ok) return;
        Anotacoes.remover(el.dataset.excluirAnot);
        this.desenharListaAnotacoes(vers);
        this.repintarNotasVisiveis();
      };
    });
  },

  /* O editor de uma nota: barra de formatação em cima, área de escrita no meio,
   * salvar/cancelar embaixo. `id` nulo cria uma nota nova. */
  editarAnotacao(vers, id, refLabel, versiculos) {
    this.anotVers = vers;
    this.anotId = id;
    // conjunto de versículos da nota nova (do "+", pode pular). Ao editar uma
    // nota que já existe, o conjunto vem dela e não muda aqui.
    this.anotVersiculos = (versiculos && versiculos.length) ? versiculos.slice() : [vers];
    const a = id ? Anotacoes.achar(id) : null;
    document.getElementById('titulo-anot').textContent =
      refLabel || (a ? Anotacoes.refDe(a) : this.refDaPassagem(vers));
    const corpo = document.getElementById('corpo-anot');
    corpo.classList.add('corpo-editor');   // vira coluna: papel rola, botões fixos

    const botao = (cmd, icone, rotulo) =>
      `<button class="fmt" data-cmd="${cmd}" aria-label="${rotulo}" title="${rotulo}">
        <svg class="icone"><use href="#i-${icone}"/></svg></button>`;

    corpo.innerHTML = `
      <div class="barra-formato">
        ${botao('bold', 'negrito', 'Negrito')}
        ${botao('italic', 'italico', 'Itálico')}
        ${botao('underline', 'sublinhado', 'Sublinhado')}
        ${botao('strikeThrough', 'tachado', 'Tachado')}
        <button type="button" class="fmt fmt-cor" id="btn-cor-letra"
          title="Cor da letra" aria-label="Cor da letra">
          <span class="rotulo-cor">A</span>
          <span class="risco-cor" id="amostra-cor"></span>
        </button>
        <button type="button" class="fmt fmt-fundo" id="btn-cor-fundo"
          title="Cor de fundo" aria-label="Cor de fundo">
          <span class="bloco-fundo" id="amostra-fundo">A</span>
        </button>
        <select class="fmt-fonte" id="fmt-fonte" title="Tipo de letra">
          <option value="">Fonte</option>
          <option value="var(--fonte-texto)">Serifada</option>
          <option value="var(--fonte-ui)">Sem serifa</option>
          <option value="var(--fonte-sigla)">Monoespaçada</option>
        </select>
        ${botao('removeFormat', 'limpar-formato', 'Limpar formatação')}
      </div>
      <div class="caixa-cor fechada" id="caixa-cor-nota"></div>
      <div class="editor-nota" id="editor-nota" contenteditable="true"
        role="textbox" aria-multiline="true" data-vazio="Escreva sua anotação…">${a ? Anotacoes.limpar(a.corpo) : ''}</div>
      <div class="acoes-anot">
        <button class="botao secundario" id="cancelar-anot">Cancelar</button>
        <button class="botao" id="salvar-anot">Salvar</button>
      </div>`;

    this.ligarEditorAnotacao(vers, id);
    this.abrir('painel-anot');
  },

  ligarEditorAnotacao(vers, id) {
    const corpo = document.getElementById('corpo-anot');
    const editor = document.getElementById('editor-nota');

    // Guardamos o último trecho REAL selecionado dentro do editor (só seleções
    // não-colapsadas, para o toque no botão não apagar o trecho no Android).
    let rangeSalvo = null;
    const salvarRange = () => {
      const s = window.getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) return;
      if (editor.contains(s.anchorNode)) rangeSalvo = s.getRangeAt(0).cloneRange();
    };
    const pegarRange = () => {
      const s = window.getSelection();
      if (s && s.rangeCount && !s.isCollapsed && editor.contains(s.anchorNode)) {
        rangeSalvo = s.getRangeAt(0).cloneRange();
        return rangeSalvo.cloneRange();
      }
      return (rangeSalvo && !rangeSalvo.collapsed) ? rangeSalvo.cloneRange() : null;
    };
    const aplicarResultado = novo => {
      if (novo) {
        try { const s = window.getSelection(); s.removeAllRanges(); s.addRange(novo); rangeSalvo = novo.cloneRange(); }
        catch (e) {}
      }
    };
    // Ativa um botão fazendo o trabalho no 'pointerdown' (não no 'click', que o
    // Android cancela quando se segura o toque). O 'click' cobre o teclado.
    const aoAtivar = (el, fn) => {
      let feitoPeloPonteiro = false;
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); feitoPeloPonteiro = true; fn();
      }, { passive: false });
      el.addEventListener('click', () => {
        if (feitoPeloPonteiro) { feitoPeloPonteiro = false; return; }
        fn();
      });
    };
    editor.addEventListener('keyup', salvarRange);
    editor.addEventListener('mouseup', salvarRange);
    document.addEventListener('selectionchange', salvarRange);
    this._limparSelNota = () => document.removeEventListener('selectionchange', salvarRange);

    // Negrito/itálico/sublinhado/tachado e limpar — via manipulação de DOM sobre
    // o range guardado (funciona no Android, onde execCommand/seleção viva falham).
    const TAG = { bold: 'strong', italic: 'em', underline: 'u', strikeThrough: 's' };
    corpo.querySelectorAll('[data-cmd]').forEach(el => {
      aoAtivar(el, () => {
        const r = pegarRange(); if (!r) return;
        const novo = el.dataset.cmd === 'removeFormat'
          ? this._ricoLimpar(r)
          : this._ricoAlternarTag(r, TAG[el.dataset.cmd], editor);
        aplicarResultado(novo);
      });
    });

    // Cor da letra e cor de fundo usam a MESMA roda de cores dos marcadores — o
    // padrão de cor do app. Tocar no "A" abre a roda embaixo da barra; a cor só
    // entra na seleção quando a pessoa aperta "Aplicar" dentro da roda.
    const btnCorLetra = document.getElementById('btn-cor-letra');
    const btnCorFundo = document.getElementById('btn-cor-fundo');
    const amostraCor = document.getElementById('amostra-cor');
    const amostraFundo = document.getElementById('amostra-fundo');
    const caixaCor = document.getElementById('caixa-cor-nota');

    // guarda a última cor de cada tipo, para a roda reabrir de onde parou
    const corAtual = { letra: '#8c2f39', fundo: '#f2c94c' };
    amostraCor.style.background = corAtual.letra;
    amostraFundo.style.background = corAtual.fundo;
    amostraFundo.style.color = Cores.contraste(corAtual.fundo);   // o "A" contrasta com o fundo

    let modoCor = null;        // 'letra' | 'fundo' | null (fechada)

    const aplicarCor = (modo, cor) => {
      const r = pegarRange(); if (!r) return;
      const novo = this._ricoEnvolver(r, modo === 'letra'
        ? { estilo: { color: cor }, limparEstilo: 'color' }
        : { estilo: { backgroundColor: cor }, limparEstilo: 'backgroundColor' });
      aplicarResultado(novo);
    };

    const fecharCaixaCor = () => {
      caixaCor.classList.add('fechada');
      caixaCor.innerHTML = '';
      modoCor = null;
      btnCorLetra.classList.remove('ativa');
      btnCorFundo.classList.remove('ativa');
    };

    const removerCor = modo => {
      const r = pegarRange(); if (!r) return;
      aplicarResultado(this._ricoLimparEstilo(r, modo === 'letra' ? 'color' : 'backgroundColor', editor));
    };

    const abrirCaixaCor = modo => {
      const r0 = pegarRange();
      const prop = modo === 'letra' ? 'color' : 'backgroundColor';
      const atualReal = r0 ? this._ricoCorDoTrecho(r0, prop, editor) : null;
      editor.blur();   // fecha o teclado do celular
      try { window.getSelection().removeAllRanges(); } catch (e) {}
      this.escolherCor({
        cor: corAtual[modo],
        atual: atualReal,
        comRemover: true,
        titulo: modo === 'letra' ? 'Cor da letra' : 'Cor de fundo',
      }).then(res => {
        if (!res) return;
        if (res.remover) { removerCor(modo); return; }
        const cor = res;
        corAtual[modo] = cor;
        if (modo === 'letra') {
          amostraCor.style.background = cor;
        } else {
          amostraFundo.style.background = cor;
          amostraFundo.style.color = Cores.contraste(cor);
        }
        aplicarCor(modo, cor);
      });
    };

    // A cor abre no CLIQUE (fim do toque) para a paleta não fechar com o próprio
    // toque de abertura; o trecho é memorizado no pointerdown.
    [btnCorLetra, btnCorFundo].forEach(b => b.addEventListener('pointerdown', () => pegarRange()));
    btnCorLetra.onclick = () => abrirCaixaCor('letra');
    btnCorFundo.onclick = () => abrirCaixaCor('fundo');

    const fonte = document.getElementById('fmt-fonte');
    fonte.onchange = () => {
      if (!fonte.value) return;
      const r = pegarRange();
      if (r) aplicarResultado(this._ricoEnvolver(r, { estilo: { fontFamily: fonte.value }, limparEstilo: 'fontFamily' }));
      fonte.value = '';
    };

    document.getElementById('cancelar-anot').onclick = () => { this._limparSelNota?.(); this.abrirAnotacoes(vers); };

    document.getElementById('salvar-anot').onclick = () => {
      this._limparSelNota?.();
      const html = Anotacoes.limpar(editor.innerHTML);
      const vazia = !(new DOMParser().parseFromString(html, 'text/html')
        .body.textContent || '').trim();
      if (vazia) {                        // nota em branco não vira registro
        if (id) Anotacoes.remover(id);
        this.abrirAnotacoes(vers);
        this.repintarNotasVisiveis();
        return;
      }
      if (id) {
        Anotacoes.atualizar(id, html);
      } else {
        const versificacao = Dados.versificacaoDe(this.versao);
        Anotacoes.criar({ versificacao, code: this.code, cap: this.cap, vers,
          versiculos: this.anotVersiculos, versao: this.versao, corpo: html });
      }
      this.avisoRapido('Anotação salva');
      this.abrirAnotacoes(vers);
      this.repintarNotasVisiveis();
    };

    setTimeout(() => editor.focus(), 120);
  },

  /* A visao geral: todas as notas, agrupadas por passagem, na ordem da Biblia. */
  desenharCaderno() {
    const corpo = document.getElementById('corpo-caderno');
    const todas = Anotacoes.todas();

    if (!todas.length) {
      corpo.innerHTML = `<div class="estado">Você ainda não tem anotações.<br>
        Selecione um versículo e toque em <strong>Anotar</strong>, ou toque no
        sinal de anotação ao lado de um versículo já anotado.</div>`;
      return;
    }

    // agrupa por passagem (livro|cap|vers), preservando a ordem canônica
    const grupos = new Map();
    for (const a of todas) {
      const k = `${a.code}|${a.cap}|${a.vers}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(a);
    }

    const canone = Dados.livros(this.versao);
    const posLivro = code => {
      const i = canone.findIndex(l => l.code === code);
      return i < 0 ? 999 : i;
    };
    const chaves = [...grupos.keys()].sort((x, y) => {
      const [cx, capx, vx] = x.split('|'); const [cy, capy, vy] = y.split('|');
      return posLivro(cx) - posLivro(cy) || (+capx - +capy) || (+vx - +vy);
    });

    corpo.innerHTML = chaves.map(k => {
      const notas = grupos.get(k);
      const [code, cap, vers] = k.split('|');
      const ref = `${Dados.nomeCurto(notas[0].versao || this.versao, code)} ${cap}:${vers}`;
      const cartoes = notas.map(a => `<div class="cartao-anot">
          <button class="anot-corpo" data-abrir="${a.id}">
            <div class="anot-previa">${Leitura.escapar(Anotacoes.resumo(a)) || '<em>(nota vazia)</em>'}</div>
            <div class="quando">${Anotacoes.quandoDe(a)}</div>
          </button>
        </div>`).join('');
      return `<div class="grupo-caderno">
        <button class="cab-grupo-caderno" data-ir="${code}|${cap}|${vers}">
          <span>${ref}</span>
          <span class="sub">${notas.length}</span>
        </button>
        ${cartoes}
      </div>`;
    }).join('');

    corpo.querySelectorAll('[data-ir]').forEach(el => {
      el.onclick = () => {
        const [code, cap, vers] = el.dataset.ir.split('|');
        this.fecharPaineis();
        this.ir(code, +cap, +vers);
      };
    });

    corpo.querySelectorAll('[data-abrir]').forEach(el => {
      el.onclick = () => {
        const a = Anotacoes.achar(el.dataset.abrir);
        if (!a) return;
        this.fecharPaineis();
        // abre a leitura primeiro; o editor só entra se a pessoa tocar em Editar
        const irVer = () => {
          this.anotVers = a.vers;
          this.verAnotacaoPainel(a.vers);
        };
        if (a.code !== this.code || a.cap !== this.cap) {
          this.ir(a.code, a.cap, a.vers).then(irVer);
        } else {
          irVer();
        }
      };
    });
  },

  /* Aviso só de leitura: reusa o diálogo do tema, mas com um único botão.
   * A mensagem aceita HTML (para destacar os passos). Devolve uma promessa que
   * resolve quando a pessoa fecha. */
  avisar({ titulo = 'Aviso', html = '' } = {}) {
    return new Promise(resolve => {
      const veu = document.getElementById('dialogo-veu');
      const btConf = document.getElementById('dialogo-confirmar');
      const btCanc = document.getElementById('dialogo-cancelar');
      document.getElementById('dialogo-titulo').textContent = titulo;
      document.getElementById('dialogo-mensagem').innerHTML = html;
      btConf.textContent = 'Entendi';
      btCanc.style.display = 'none';
      veu.classList.add('aviso');

      const fechar = () => {
        veu.classList.remove('aberto');
        veu.classList.remove('aviso');
        veu.setAttribute('aria-hidden', 'true');
        btConf.onclick = veu.onclick = null;
        btCanc.style.display = '';
        document.removeEventListener('keydown', aoTeclar, true);
        resolve();
      };
      const aoTeclar = e => {
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fechar(); }
      };

      btConf.onclick = fechar;
      veu.onclick = e => { if (e.target === veu) fechar(); };
      document.addEventListener('keydown', aoTeclar, true);

      veu.setAttribute('aria-hidden', 'false');
      veu.classList.add('aberto');
      btConf.focus();
    });
  },

  /* Explica que as vozes são do aparelho e ensina a instalar vozes melhores.
   * O app não baixa nem instala vozes — é uma trava de segurança do navegador. */
  ajudaVozes() {
    return this.avisar({
      titulo: 'Trazer vozes novas',
      html:
        'As vozes da leitura vêm do seu aparelho, não do app. Por isso a lista ' +
        'muda de um aparelho para outro — e o app não consegue baixar nem instalar ' +
        'vozes sozinho, por uma trava de segurança do navegador.<br><br>' +
        'Mas você mesmo pode instalar vozes melhores. No Android:<br><br>' +
        '1. Abra as <strong>Configurações</strong> do celular.<br>' +
        '2. Entre em <strong>Sistema</strong> › <strong>Idiomas</strong> ' +
        '(em alguns aparelhos fica em <strong>Acessibilidade</strong>).<br>' +
        '3. Toque em <strong>Saída de conversão de texto em voz</strong>.<br>' +
        '4. No motor, escolha <strong>Speech Services da Google</strong>.<br>' +
        '5. Toque em <strong>Instalar dados de voz</strong> e baixe ' +
        '<strong>Português do Brasil</strong>.<br><br>' +
        'Depois volte aqui, abra os Ajustes e use <strong>Ouvir a voz</strong> para ' +
        'escolher a que mais te agrada. Prefira as marcadas como <strong>pt-BR</strong>; ' +
        'as <strong>pt-PT</strong> têm sotaque de Portugal.'
    });
  },

  /* Diálogo de confirmação no tema do app, no lugar do confirm() do navegador.
   * Devolve uma promessa: true se confirmou, false se cancelou. Tocar fora ou
   * apertar Esc cancela; Enter confirma. */
  confirmar({ titulo = 'Confirmar', mensagem = '', confirmar: rotuloConf = 'Confirmar',
              cancelar: rotuloCanc = 'Cancelar' } = {}) {
    return new Promise(resolve => {
      const veu = document.getElementById('dialogo-veu');
      const btConf = document.getElementById('dialogo-confirmar');
      const btCanc = document.getElementById('dialogo-cancelar');
      document.getElementById('dialogo-titulo').textContent = titulo;
      document.getElementById('dialogo-mensagem').textContent = mensagem;
      btConf.textContent = rotuloConf;
      btCanc.textContent = rotuloCanc;
      btCanc.style.display = '';
      veu.classList.remove('aviso');

      const fechar = valor => {
        veu.classList.remove('aberto');
        veu.setAttribute('aria-hidden', 'true');
        btConf.onclick = btCanc.onclick = veu.onclick = null;
        document.removeEventListener('keydown', aoTeclar, true);
        resolve(valor);
      };
      const aoTeclar = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fechar(true); }
      };

      btConf.onclick = () => fechar(true);
      btCanc.onclick = () => fechar(false);
      veu.onclick = e => { if (e.target === veu) fechar(false); };
      document.addEventListener('keydown', aoTeclar, true);

      veu.setAttribute('aria-hidden', 'false');
      veu.classList.add('aberto');
      btConf.focus();
    });
  },

  /* Entrada de texto no tema do app, no lugar do prompt() do navegador. Devolve
   * uma promessa: o texto (já aparado) se salvou, ou null se cancelou. Tocar
   * fora ou Esc cancela; Enter salva. */
  pedirTexto({ titulo = '', valor = '', ok = 'Salvar', cancelar = 'Cancelar', placeholder = '' } = {}) {
    return new Promise(resolve => {
      const veu = document.getElementById('prompt-veu');
      const campo = document.getElementById('prompt-campo');
      const btOk = document.getElementById('prompt-ok');
      const btCanc = document.getElementById('prompt-cancelar');
      document.getElementById('prompt-titulo').textContent = titulo;
      btOk.textContent = ok;
      btCanc.textContent = cancelar;
      campo.value = valor || '';
      campo.placeholder = placeholder || '';

      const fechar = resultado => {
        veu.classList.remove('aberto');
        veu.setAttribute('aria-hidden', 'true');
        btOk.onclick = btCanc.onclick = veu.onclick = campo.onkeydown = null;
        document.removeEventListener('keydown', aoTeclar, true);
        resolve(resultado);
      };
      const salvar = () => fechar(campo.value.trim());
      const aoTeclar = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(null); }
      };

      btOk.onclick = salvar;
      btCanc.onclick = () => fechar(null);
      veu.onclick = e => { if (e.target === veu) fechar(null); };
      campo.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); salvar(); } };
      document.addEventListener('keydown', aoTeclar, true);

      veu.setAttribute('aria-hidden', 'false');
      veu.classList.add('aberto');
      setTimeout(() => { campo.focus(); campo.select(); }, 30);
    });
  },

  /* Seletor de cor padrão: abre a roda num popup próprio, sem empurrar a tela.
   * Devolve uma promessa com o hex escolhido (se Salvar) ou null (se Cancelar).
   * A cor entra nos "recentes" só quando salva. */
  escolherCor({ cor = '#8c2f39', atual = undefined, comRemover = false, titulo = 'Escolher cor' } = {}) {
    return new Promise(resolve => {
      const veu = document.getElementById('cor-veu');
      const corpo = document.getElementById('cor-corpo');
      const btSalvar = document.getElementById('cor-salvar');
      const btCanc = document.getElementById('cor-cancelar');
      const amAtual = document.getElementById('cor-previa-atual');
      const amNova = document.getElementById('cor-previa-nova');
      document.getElementById('cor-titulo').textContent = titulo;

      // "Atual": a cor REAL do trecho (null = sem cor → mostra vazio, só a borda).
      // Marcadores não passam 'atual', então mostram a própria cor de entrada.
      const corMostrar = (atual === undefined) ? cor : atual;
      const podeRemover = comRemover && !!corMostrar;
      let removendo = false;
      let hexAtual = cor;

      const pintarAtual = () => {
        if (corMostrar) {
          amAtual.classList.remove('vazia');
          amAtual.style.background = corMostrar;
          amAtual.style.color = Cores.contraste(corMostrar);   // o × contrasta
        } else {
          amAtual.classList.add('vazia');
          amAtual.style.background = 'transparent';
          amAtual.style.color = '';
        }
        amAtual.classList.toggle('removivel', podeRemover);
      };
      const novaComCor = hex => {
        removendo = false;
        amNova.classList.remove('vazia');
        amNova.style.background = hex;
      };
      const novaVazia = () => {           // remoção pendente: "Nova" fica só a borda
        removendo = true;
        amNova.classList.add('vazia');
        amNova.style.background = 'transparent';
      };

      const ctrl = RodaDeCores.montar(corpo, cor, () => {}, {
        semAplicar: true,
        vivo: hex => { hexAtual = hex; novaComCor(hex); },   // mexer na roda cancela a remoção
      });
      hexAtual = ctrl.corAtual();
      pintarAtual();
      novaComCor(hexAtual);

      const fechar = resultado => {
        veu.classList.remove('aberto');
        veu.setAttribute('aria-hidden', 'true');
        btSalvar.onclick = btCanc.onclick = amAtual.onclick = null;
        amAtual.classList.remove('vazia', 'removivel');
        amNova.classList.remove('vazia');
        document.removeEventListener('keydown', aoTeclar, true);
        corpo.innerHTML = '';
        resolve(resultado);
      };
      const aoTeclar = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(null); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); salvar(); }
      };
      const salvar = () => {
        if (removendo) { fechar({ remover: true }); return; }
        CoresRecentes.registrar(hexAtual);
        fechar(hexAtual);
      };

      // clicar na amostra "Atual" (o ×) marca a remoção e esvazia a "Nova"
      amAtual.onclick = podeRemover ? () => novaVazia() : null;
      btSalvar.onclick = salvar;
      btCanc.onclick = () => fechar(null);
      // A paleta fecha SÓ pelos botões ou Esc — nada de "fechar tocando fora".
      document.addEventListener('keydown', aoTeclar, true);

      veu.setAttribute('aria-hidden', 'false');
      veu.classList.add('aberto');
    });
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

  /** "Salmos 23:1-4", "Salmos 23:4" ou, com buracos, "Salmos 23:1-3,5-6".
   *  Junta os versículos em faixas seguidas para não parecer que vai tudo do
   *  primeiro ao último quando, no meio, algum foi pulado. */
  referenciaDaSelecao(pedacos) {
    const nome = Dados.nomeCurto(this.versao, this.code);
    // seção que cruza capítulos: intervalo contínuo (não uma lista de versículos)
    const fx = this.selecao && this.selecao.faixa;
    if (fx) {
      if (fx.capInicio === fx.capFim) {
        return fx.versInicio === fx.versFim
          ? `${nome} ${fx.capInicio}:${fx.versInicio}`
          : `${nome} ${fx.capInicio}:${fx.versInicio}-${fx.versFim}`;
      }
      return `${nome} ${fx.capInicio}:${fx.versInicio}–${fx.capFim}:${fx.versFim}`;
    }
    const vs = [...new Set(pedacos.map(p => p.vers))].sort((a, b) => a - b);
    if (!vs.length) return `${nome} ${this.cap}`;

    const faixas = [];
    let ini = vs[0], ant = vs[0];
    for (let k = 1; k < vs.length; k++) {
      if (vs[k] === ant + 1) { ant = vs[k]; continue; }
      faixas.push([ini, ant]); ini = ant = vs[k];
    }
    faixas.push([ini, ant]);

    const partes = faixas.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
    return `${nome} ${this.cap}:${partes.join(',')}`;
  },

  /** O texto pronto para copiar ou compartilhar, com a referência no fim. */
  textoParaCitar() {
    if (!this.selecao) return '';
    const { pedacos } = this.selecao;
    // quando o trecho cruza capítulos, o número solto é ambíguo (há um "1" em
    // cada capítulo), então cada versículo leva "cap:vers"
    const multiCap = new Set(pedacos.map(p => p.cap != null ? p.cap : this.cap)).size > 1;
    const corpo = pedacos.length === 1
      ? pedacos[0].texto.slice(pedacos[0].i, pedacos[0].f)
      : pedacos.map(p => {
          const rot = multiCap ? `${p.cap != null ? p.cap : this.cap}:${p.vers}` : `${p.vers}`;
          return `${rot} ${p.texto.slice(p.i, p.f)}`;
        }).join(' ');
    return `"${corpo.trim()}"\n${this.referenciaDaSelecao(pedacos)} (${this.versao})`;
  },

  mostrarBarraSelecao() {
    // no modo de vários versículos, a barra é comandada pelo próprio módulo;
    // a seleção nativa de texto não deve mexer nela
    if (this.multiAtivo || this.multiSelecao) return;
    this.selecao = this.lerSelecao();
    this.renderBarraSelecao();
  },

  /** Desenha (ou fecha) a barra a partir de `this.selecao` — serve tanto para a
   *  seleção nativa de texto quanto para o grupo de vários versículos. */
  renderBarraSelecao() {
    const barra = document.getElementById('barra-selecao');
    const sel = this.selecao;

    if (!sel) {
      barra.classList.remove('aberta');
      barra.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('selecionando');
      document.getElementById('sel-cores').classList.add('fechada');
      return;
    }

    const n = sel.pedacos.length;
    const conta = sel.faixa ? 'seção' : `${n} versículo${n > 1 ? 's' : ''}`;
    document.getElementById('sel-ref').innerHTML =
      `${this.referenciaDaSelecao(sel.pedacos)}
       <span class="sel-conta">${conta}</span>`;

    // o ponto onde a pessoa está de fato lendo é o versículo que ela seleciona;
    // ele atualiza o histórico e acompanha a posição no livro fixado
    const ultimo = sel.pedacos[sel.pedacos.length - 1];
    Historico.acompanharFixado({ code: this.code,
      cap: ultimo.cap != null ? ultimo.cap : this.cap, vers: ultimo.vers });

    barra.classList.add('aberta');
    barra.setAttribute('aria-hidden', 'false');
    document.body.classList.add('selecionando');
  },

  fecharSelecao() {
    window.getSelection()?.removeAllRanges();
    this.resetarMulti();          // o X cancela também a seleção de vários
    this.selecao = null;
    this.renderBarraSelecao();
  },

  /* ------------------------------------ seleção de vários versículos (o "+") */

  mostrarMais() {
    const fab = document.getElementById('mais-selecao');
    if (fab) fab.hidden = false;
  },
  esconderMais() {
    const fab = document.getElementById('mais-selecao');
    if (fab) fab.hidden = true;
  },
  atualizarMais() {
    const fab = document.getElementById('mais-selecao');
    if (!fab) return;
    fab.classList.toggle('ativo', !!this.multiAtivo);
    fab.setAttribute('aria-pressed', this.multiAtivo ? 'true' : 'false');
    const n = this.multiVers ? this.multiVers.size : 0;
    const conta = document.getElementById('mais-conta');
    if (conta) conta.textContent = n > 1 ? n : '';
    fab.classList.toggle('tem-conta', n > 1);
  },

  /** Monta `this.selecao` a partir dos versículos escolhidos (inteiros). */
  construirSelecaoMulti() {
    const versos = [...(this.multiVers || [])].sort((a, b) => a - b);
    const pedacos = versos.map(v => {
      const el = this._qv(v);
      const texto = el ? this.textoDoVersiculo(el) : '';
      return { vers: v, i: 0, f: texto.length, texto };
    }).filter(p => p.texto.length);
    this.selecao = pedacos.length
      ? { pedacos, bruto: pedacos.map(p => p.texto).join(' ') }
      : null;
  },

  pintarMultiSel() {
    document.querySelectorAll('#folha .v.multi-sel, #folha .v.multi-inicio')
      .forEach(el => el.classList.remove('multi-sel', 'multi-inicio'));
    // o realce do "parei aqui" (.ponto) é substituído pela seleção múltipla; limpa
    // global para não deixar um versículo de outro capítulo parecendo selecionado
    document.querySelectorAll('#folha .v.ponto').forEach(el => el.classList.remove('ponto'));
    for (const v of (this.multiVers || [])) {
      const el = this._qv(v);
      if (el) el.classList.add('multi-sel');
    }
    // o traço à esquerda (início da seleção) fica SEMPRE no menor número —
    // isto é, no primeiro versículo do grupo, mesmo quando se seleciona para cima
    if (this.multiVers && this.multiVers.size) {
      const menor = Math.min(...this.multiVers);
      const ini = this._qv(menor);
      if (ini) ini.classList.add('multi-inicio');
    }
  },

  atualizarSelecaoMulti() {
    this.construirSelecaoMulti();
    this.pintarMultiSel();
    this.multiSelecao = !!(this.multiVers && this.multiVers.size);
    this.renderBarraSelecao();
    this.atualizarMais();
  },

  /** O toque no "+": liga ou desliga o modo de acumular. Quem manda é o usuário
   *  — não desliga sozinho depois de uma ação. */
  alternarMulti() {
    this.multiVers = this.multiVers || new Set();
    if (!this.multiAtivo) {
      window.getSelection()?.removeAllRanges();     // larga a seleção de texto
      this.multiAtivo = true;
      if (this.pontoAtual) this.multiVers.add(this.pontoAtual);
      this.atualizarSelecaoMulti();
    } else {
      // desligar mantém o que já está na tela; o próximo toque solto reinicia
      this.multiAtivo = false;
      this.atualizarMais();
    }
  },

  /** Com o modo ligado, tocar num versículo o adiciona; tocar de novo o tira. */
  /** Capítulo a que a seleção múltipla atual pertence (Contínuo). */
  _capSelecao: null,

  alternarVersiculoMulti(vers) {
    this.multiVers = this.multiVers || new Set();
    const capAtual = Prefs.get('paginaModo') === 'continuo' ? this.cap : null;
    // a seleção múltipla é por capítulo: tocar num versículo de OUTRO capítulo
    // limpa as demais e passa a selecionar apenas este
    if (capAtual != null && this._capSelecao != null && capAtual !== this._capSelecao) {
      this.multiVers.clear();
      this.multiVers.add(vers);
      this._capSelecao = capAtual;
      this.atualizarSelecaoMulti();
      return;
    }
    if (this.multiVers.has(vers)) this.multiVers.delete(vers);
    else this.multiVers.add(vers);
    this._capSelecao = capAtual;
    this.atualizarSelecaoMulti();
  },

  resetarMulti() {
    this.multiAtivo = false;
    this.multiSelecao = false;
    this._capSelecao = null;
    if (this.multiVers) this.multiVers.clear();
    document.querySelectorAll('#folha .v.multi-sel, #folha .v.multi-inicio')
      .forEach(el => el.classList.remove('multi-sel', 'multi-inicio'));
    this.atualizarMais();
  },

  /** Tocar no número grande do capítulo seleciona todos os versículos de uma vez.
   *  Se todos já estão selecionados, um novo toque limpa a seleção. Havendo apenas
   *  alguns marcados, passa a marcar o capítulo inteiro. Atalho do modo de vários. */
  selecionarCapitulo() {
    const todos = [...this._escopoVersos().querySelectorAll('.v[data-vers]')]
      .map(el => +el.dataset.vers)
      .filter(n => !Number.isNaN(n));
    if (!todos.length) return;
    this.multiVers = this.multiVers || new Set();
    const jaTodos = this.multiVers.size === todos.length
      && todos.every(v => this.multiVers.has(v));
    if (jaTodos) {
      this.resetarMulti();
      this.selecao = null;
      this.renderBarraSelecao();
    } else {
      window.getSelection()?.removeAllRanges();   // larga qualquer seleção de texto
      this.multiAtivo = true;                      // fica no modo de vários para ajustar depois
      this.multiVers = new Set(todos);
      this._capSelecao = Prefs.get('paginaModo') === 'continuo' ? this.cap : null;
      this.atualizarSelecaoMulti();
    }
  },

  /** Fecha a barra ao concluir uma ação. No modo de vários versículos, mantém o
   *  grupo e o modo ligados (só recolhe a paleta de cores). */
  encerrarAcao() {
    if (this.multiAtivo || this.multiSelecao) {
      document.getElementById('sel-cores').classList.add('fechada');
      return;
    }
    this.fecharSelecao();
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

  /** Fecha o aplicativo, para quem prefere um botão a fazer o gesto do sistema.
   *  Em PWA instalado o window.close() costuma funcionar; num navegador comum,
   *  muitos bloqueiam fechar uma aba que o script não abriu — nesse caso avisa. */
  async fecharAplicativo() {
    const ok = await this.confirmar({
      titulo: 'Fechar aplicativo',
      mensagem: 'Deseja fechar o aplicativo agora?',
      confirmar: 'Fechar', cancelar: 'Cancelar',
    });
    if (!ok) return;
    try { window.close(); } catch {}
    // se ainda estamos aqui depois de um instante, o fechamento foi bloqueado
    setTimeout(() => this.avisoRapido('Se não fechou, use o gesto do aparelho para sair'), 500);
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

  /* Tocar a seleção em voz. Dois comportamentos, conforme o que a pessoa marcou:
   *  - UM versículo: começa a leitura ali e SEGUE em frente (livro afora), como
   *    um "começar a ouvir a partir daqui". Ninguém costuma querer ouvir um
   *    versículo isolado; o mais útil é partir de um ponto do texto.
   *  - DOIS OU MAIS: toca só aquele conjunto, confinado. Os controles de repetir
   *    (nenhum / capítulo / versículo) passam a valer sobre esse grupo. */
  tocarSelecao() {
    if (!Locutor.disponivel()) {
      this.avisoRapido('Este navegador não oferece leitura em voz');
      return;
    }
    if (Dados.ehOriginal(this.versao)) {
      this.avisoRapido('Áudio disponível apenas em português');
      return;
    }
    const sel = this.selecao;
    if (!sel || !sel.pedacos || !sel.pedacos.length) return;

    const versos = sel.pedacos.map(p => p.vers).sort((a, b) => a - b);

    if (versos.length === 1) {
      // um só: começa dali e segue a sequência normal do livro
      this.iniciarOuvir({ comecarEm: versos[0] });
    } else {
      // vários: toca só o conjunto selecionado, confinado, com o repetir agindo
      // nele. Uma seção pode cruzar capítulos, então monta um segmento por
      // capítulo (o player os toca em ordem). Seleção normal = um só segmento.
      const porCap = new Map();
      for (const p of sel.pedacos) {
        const c = p.cap != null ? p.cap : this.cap;
        if (!porCap.has(c)) porCap.set(c, []);
        porCap.get(c).push(p.vers);
      }
      const fila = [...porCap.entries()].sort((a, b) => a[0] - b[0]).map(([c, vs]) =>
        ({ versao: this.versao, code: this.code, cap: c,
           versos: vs.sort((a, b) => a - b), de: null, ate: null }));
      const nome = this.referenciaDaSelecao(sel.pedacos);
      this.tocarFila(fila, nome);
    }
  },

  async copiarSelecao() {
    const texto = this.textoParaCitar();
    if (!texto) return;
    this.avisoRapido(await this.paraAreaDeTransferencia(texto)
      ? 'Copiado' : 'Não foi possível copiar');
    this.encerrarAcao();
  },

  async compartilharSelecao() {
    const texto = this.textoParaCitar();
    if (!texto) return;
    const titulo = this.referenciaDaSelecao(this.selecao.pedacos);

    if (navigator.share) {
      try { await navigator.share({ title: titulo, text: texto }); }
      catch { /* a pessoa desistiu: não é erro */ }
      this.encerrarAcao();
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
      const cap = p.cap != null ? p.cap : this.cap;   // seção pode cruzar capítulos
      for (const fx of Marcadores.faixas(versificacao, this.code, cap, p.vers)) {
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
    const continuo = Prefs.get('paginaModo') === 'continuo';

    for (const p of this.selecao.pedacos) {
      const cap = p.cap != null ? p.cap : this.cap;   // seção pode cruzar capítulos
      const inteiro = p.i === 0 && p.f >= p.texto.length;
      const fim = inteiro ? null : p.f;

      const faixas = marcadorId === 0
        ? Marcadores.limparTrecho(versificacao, this.code, cap, p.vers,
            inteiro ? null : p.i, fim)
        : Marcadores.marcarTrecho(versificacao, this.code, cap, p.vers,
            p.i, fim, marcadorId);

      // a marca é sempre GRAVADA no capítulo certo (aparece ao navegar até lá).
      // já a PINTURA na hora precisa de escopo: no contínuo, o mesmo número
      // existe em vários blocos; sem escopo, pintaríamos o versículo errado.
      if (continuo) {
        const bloco = document.querySelector(`#folha .cap-bloco[data-cap="${cap}"]`);
        if (bloco) Leitura.pintarMarca(p.vers, p.texto, faixas, bloco);
      } else if (cap === this.cap) {
        Leitura.pintarMarca(p.vers, p.texto, faixas);
      }
    }

    this.avisoRapido(marcadorId === 0 ? 'Marca removida' : 'Marcado');
    this.encerrarAcao();
  },

  /* =========================================================== comparação */

  async alternarComparacao() {
    this.comparando = !this.comparando;
    document.body.classList.toggle('comparando', this.comparando);
    if (this.comparando) {
      // a comparação não usa seleção de vários; recolhe tudo
      this.resetarMulti();
      this.esconderMais();
      this.selecao = null;
      this.renderBarraSelecao();
      await this.desenharComparacao();
    }
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
      // o X de fechar a comparação mora no cabeçalho da metade de baixo,
      // no canto direito do nome do livro/capítulo daquela tradução
      const fecharBotao = qual === 'baixo'
        ? `<button class="fechar-comparar-inline" data-fechar-comparar
            aria-label="Fechar comparação"><svg class="icone"><use href="#i-fechar"/></svg></button>`
        : '';
      if (!Dados.temLivro(versaoCode, this.code)) {
        alvo.innerHTML = `<div class="cabeca-metade">${sigla(versaoCode, qual)}
          <span>${Dados.nomeCurto(this.versao, this.code)} não existe nesta versão.</span>${fecharBotao}</div>`;
        return;
      }

      /* Se o arquivo do livro faltar nesta versão, a metade avisa e segue. Antes
       * a falha subia e derrubava a comparação inteira: nem a outra metade
       * aparecia, nem os botões de trocar respondiam. */
      let r = null;
      try {
        r = await Dados.capitulo(versaoCode, this.code, capitulo);
      } catch {
        alvo.innerHTML = `<div class="cabeca-metade">${sigla(versaoCode, qual)}
          <span>Não foi possível abrir este livro na versão ${versaoCode}.</span>${fecharBotao}</div>`;
        return;
      }

      if (!r) {
        alvo.innerHTML = `<div class="cabeca-metade">${sigla(versaoCode, qual)}
          <span>Capítulo não encontrado.</span>${fecharBotao}</div>`;
        return;
      }
      // metade de língua original: carrega o léxico antes (montagem síncrona)
      if (Dados.ehOriginal(versaoCode)) {
        try { await Dados.carregarLexico(r.livro.lang); } catch {}
      }
      alvo.innerHTML = `<div class="cabeca-metade">
          ${sigla(versaoCode, qual)}
          ${Dados.ehInterlinear(versaoCode) ? this.htmlEngrenagemIl() : ''}
          <span>${Leitura.escapar(r.livro.name)} ${capitulo}</span>
          ${nota ? `<span style="color:var(--rubrica)">${nota}</span>` : ''}
          ${fecharBotao}
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

    document.querySelectorAll('[data-fechar-comparar]').forEach(el => {
      el.onclick = ev => { ev.stopPropagation(); this.alternarComparacao(); };
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
        // interlinear: com o versículo já realçado, tocar a palavra abre o estudo
        const palavra = e.target.closest('.il-p');
        if (palavra && this.destaqueComparacao === vers) {
          this.abrirPalavraInterlinear(palavra);
          return;
        }
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

  /* ============================================================= recentes */

  /* O relógio no cabeçalho do painel de livros só aparece quando há ao menos
   * uma navegação registrada. Chamado na abertura e depois de cada registro. */
  atualizarBotaoRecentes() {
    const btn = document.getElementById('btn-recentes');
    if (!btn) return;
    btn.hidden = HistoricoNavegacao.lista().length === 0;
  },

  /* Tempo relativo amigável: minutos até 1h, horas até 1 dia, depois dias.
   * Sem precisão de segundos — serve para a pessoa reconhecer "foi hoje de
   * manhã", "foi há dois dias", sem exatidão de relógio. */
  tempoRelativo(iso) {
    const seg = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    const min = Math.floor(seg / 60);
    const hor = Math.floor(min / 60);
    const dia = Math.floor(hor / 24);
    if (min < 1) return 'agora mesmo';
    if (hor < 1) return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
    if (dia < 1) return `há ${hor} ${hor === 1 ? 'hora' : 'horas'}`;
    return `há ${dia} ${dia === 1 ? 'dia' : 'dias'}`;
  },

  abrirMenuRecentes() {
    this.desenharMenuRecentes();
    const menu = document.getElementById('menu-recentes');
    const veu = document.getElementById('veu-recentes');
    if (veu) veu.hidden = false;
    if (menu) { menu.hidden = false; menu.classList.add('aberto'); }
  },

  fecharMenuRecentes() {
    const menu = document.getElementById('menu-recentes');
    const veu = document.getElementById('veu-recentes');
    if (menu) { menu.classList.remove('aberto'); menu.hidden = true; }
    if (veu) veu.hidden = true;
  },

  desenharMenuRecentes() {
    const alvo = document.getElementById('lista-recentes');
    if (!alvo) return;
    const lista = HistoricoNavegacao.lista();
    if (!lista.length) {
      alvo.innerHTML = `<p class="rec-vazio">Nenhuma navegação recente ainda.</p>`;
      return;
    }
    const linhas = lista.map((it, i) => {
      const nome = Dados.nomeCurto(it.versao, it.code) || it.code;
      if (it.tipo === 'subtitulo') {
        const r = it.fim && it.fim !== it.ini ? `${it.cap}:${it.ini}-${it.fim}` : `${it.cap}:${it.ini}`;
        return `<button class="linha-recente" data-i="${i}">
          <span class="rec-topo"><span class="rec-ref">${nome} ${r}</span>
          <span class="rec-hora">${this.tempoRelativo(it.hora)}</span></span>
          <span class="rec-sub">${Leitura.escapar(it.titulo || '')}</span></button>`;
      }
      const r = it.versFim && it.versFim !== it.vers ? `${it.cap}:${it.vers}-${it.versFim}` : `${it.cap}:${it.vers}`;
      return `<button class="linha-recente" data-i="${i}">
        <span class="rec-topo"><span class="rec-ref">${nome} ${r}</span>
        <span class="rec-hora">${this.tempoRelativo(it.hora)}</span></span></button>`;
    });
    alvo.innerHTML = linhas.join('');
    alvo.querySelectorAll('.linha-recente').forEach(el => {
      el.onclick = () => this.abrirRecente(HistoricoNavegacao.lista()[+el.dataset.i]);
    });
  },

  /* Reabrir uma navegação recente: leva à página e RECOLOCA a entrada no topo
   * com a hora renovada (sem duplicar). Não cria linha nova — só reposiciona. */
  abrirRecente(item) {
    if (!item) return;
    this.fecharMenuRecentes();
    if (item.versao && Dados.versao(item.versao)) this.versao = item.versao;
    if (item.tipo === 'subtitulo') {
      HistoricoNavegacao.registrarSubtitulo({
        versao: this.versao, code: item.code, cap: item.cap,
        ini: item.ini, fim: item.fim, titulo: item.titulo,
      });
      this.fecharPaineis();
      this.ir(item.code, item.cap, item.ini, { alvoTitulo: true });
    } else {
      HistoricoNavegacao.registrarVersiculo({
        versao: this.versao, code: item.code, cap: item.cap,
        vers: item.vers, versFim: item.versFim,
      });
      this.fecharPaineis();
      this.ir(item.code, item.cap, item.vers);
    }
    this.atualizarBotaoRecentes();
  },

  /* ============================================================== eventos */

  ligarEventos() {
    const q = id => document.getElementById(id);

    q('btn-arvore').onclick = () => { this.desenharArvore(); this.abrir('painel-arvore'); };
    q('btn-ref').onclick = () => { this.desenharCapitulos(this.code); this.abrir('painel-arvore'); };

    // Recentes: o relógio abre o menu; o X e o véu (fundo) fecham
    const btnRec = q('btn-recentes');
    if (btnRec) btnRec.onclick = () => this.abrirMenuRecentes();
    const fecharRec = q('fechar-recentes');
    if (fecharRec) fecharRec.onclick = () => this.fecharMenuRecentes();
    const veuRec = q('veu-recentes');
    if (veuRec) veuRec.onclick = () => this.fecharMenuRecentes();
    q('btn-versao').onclick = () => { this.alvoVersao = 'principal'; this.desenharVersoes(); this.abrir('painel-versao'); };
    q('busca-versao').onclick = () => {
      this.alvoVersao = 'busca';
      this.desenharVersoes();
      this.abrir('painel-versao');
      this._volta = () => this._reabrirBusca();   // a seta "voltar" retorna à busca
    };
    q('btn-comparar').onclick = () => this.alternarComparacao();
    q('btn-antes').onclick = () => this.passo(-1);
    q('btn-depois').onclick = () => this.passo(1);

    /* O menu do canto reúne os painéis que não cabiam na barra. Abre por baixo
     * do botão e fecha ao escolher um item ou ao tocar fora. */
    const menu = q('menu-flutuante');
    const abrirItem = {
      busca: () => { this.versaoBusca = this.versao; this.desenharFiltros(); this.atualizarBuscaVersao(); this.abrir('painel-busca');
                     setTimeout(() => q('campo-busca').focus(), 220); },
      historico: () => { this.desenharHistorico(); this.abrir('painel-historico'); },
      marcadores: () => { this.desenharMarcadores(); this.abrir('painel-marcadores'); },
      estudos: () => this._abrirEstudosLista(),
      listas: () => this._abrirListas(),
      caderno: () => { this.desenharCaderno(); this.abrir('painel-caderno'); },
      referencias: () => this.abrirReferenciasCruzadas(),
      ouvir: () => this.iniciarOuvir(),
      ajustes: () => { this.dobraA = null; this.desenharAjustes(); this.abrir('painel-ajustes'); },
      compartilhar: () => { this.desenharCompartilhar(); this.abrir('painel-compartilhar'); },
      'fechar-app': () => this.fecharAplicativo(),
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

    q('btn-atalho-fixado').onclick = (ev) => { ev.stopPropagation(); this.alternarListaFixados(); };
    q('voltar-origem').onclick = () => this.voltarParaOrigem();

    menu.querySelectorAll('[data-menu]').forEach(el => {
      el.onclick = () => {
        fecharMenu();
        abrirItem[el.dataset.menu]();
        // de qualquer painel aberto pelo menu, "voltar" reabre o menu
        this._volta = () => this.abrirMenuFlutuante();
      };
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
    q('sel-tocar').onclick = () => this.tocarSelecao();
    q('sel-compartilhar').onclick = () => this.compartilharSelecao();
    q('sel-marcar').onclick = () => this.abrirCoresDaSelecao();
    q('sel-estudo').onclick = () => this.abrirSalvarEstudo();
    q('sel-lista').onclick = () => this.abrirAddLista();
    q('sel-anotar').onclick = () => this.anotarSelecao();
    q('sel-limpar').onclick = () => this.fecharSelecao();
    q('mais-selecao').onclick = () => this.alternarMulti();

    /* Pop-up "Exibir" do interlinear. As engrenagens são redesenhadas (topo e
     * metades da comparação), então entram por delegação pela classe; os toggles
     * e o fechar são fixos no HTML. */
    document.addEventListener('click', e => {
      if (e.target.closest && e.target.closest('.btn-il-exibir')) this.abrirExibirInterlinear();
    });
    const ilVeu = q('il-veu');
    if (ilVeu) {
      q('il-fechar').onclick = () => this.fecharExibirInterlinear();
      ilVeu.addEventListener('click', e => { if (e.target === ilVeu) this.fecharExibirInterlinear(); });
      // transliteração: independente (checkbox)
      q('il-translit').onchange = e => this.alternarInterlinear('translit', e.target.checked);
      // abreviar: independente (checkbox)
      const abrevEl = q('il-abrev');
      if (abrevEl) abrevEl.onchange = e => this.alternarInterlinear('abrev', e.target.checked);
      // português × morfologia × nenhum: exclusivos (rádios)
      ['il-pt', 'il-morfo', 'il-nada'].forEach(id => {
        const el = q(id);
        if (el) el.onchange = e => { if (e.target.checked) this.alternarInterlinear('info', e.target.value); };
      });
    }

    /* Pop-up de estudo da palavra (interlinear). */
    const peVeu = q('palavra-veu');
    if (peVeu) {
      q('pe-fechar').onclick = () => this.fecharPalavraInterlinear();
      peVeu.addEventListener('click', e => { if (e.target === peVeu) this.fecharPalavraInterlinear(); });
    }

    /* Arrastar para os lados vira a pagina, como num livro de verdade.
     *
     * Tres cuidados para nao atrapalhar o resto: se o dedo andou mais na
     * vertical, e rolagem e nao virada; se ha texto selecionado, a pessoa esta
     * escolhendo um trecho e nao quer trocar de capitulo; e o gesto precisa ser
     * decidido — curto demais ou demorado demais nao conta. */
    // rolagem no Contínuo: atualiza a referência do topo conforme o capítulo
    let spyPend = false;
    window.addEventListener('scroll', () => {
      if (spyPend) return;
      spyPend = true;
      requestAnimationFrame(() => { spyPend = false; this._spyCapitulo(); });
    }, { passive: true });

    // durante a leitura em voz, a tela acompanha o versículo que toca. Se a
    // pessoa mexe na rolagem (arrasta o dedo ou gira a roda), o reposicionamento
    // pausa por alguns segundos e reinicia a contagem a cada gesto; parando de
    // mexer, volta a centralizar sozinho. (Toque em botão/versículo não conta —
    // só o arrasto de rolagem e a roda.)
    const marcarInteracao = () => this._marcarInteracaoLeitura();
    window.addEventListener('touchmove', marcarInteracao, { passive: true });
    window.addEventListener('wheel', marcarInteracao, { passive: true });

    // a Leitura pinta marca/ponto dentro do mesmo escopo (folha ou bloco ativo)
    Leitura.escopo = () => this._escopoVersos();

    const folha = q('folha');
    const viz = q('folha-vizinho');
    let arr = null;   // estado do arrasto em curso
    const largura = () => window.innerWidth;
    const semAnim = () => window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const limparArraste = () => {
      folha.style.transition = 'none';
      folha.style.transform = '';
      if (viz) { viz.hidden = true; viz.style.transition = 'none'; viz.style.transform = ''; }
    };

    folha.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) { arr = null; return; }
      if (!window.getSelection().isCollapsed) { arr = null; return; }  // selecionando texto
      const t = e.touches[0];
      arr = { x0: t.clientX, y0: t.clientY, dx: 0, eixo: null, dir: 0,
              alvo: null, r: null, hora: Date.now() };
    }, { passive: true });

    folha.addEventListener('touchmove', e => {
      if (!arr || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - arr.x0;
      const dy = t.clientY - arr.y0;

      // decide o eixo uma única vez
      if (!arr.eixo) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.3) { arr.eixo = 'v'; return; }  // rolagem
        arr.eixo = 'h';
        arr.dir = dx > 0 ? -1 : 1;                 // esquerda = próximo; direita = anterior
        arr.alvo = this._alvoPasso(arr.dir);
        const k = arr.alvo ? `${this.versao}|${arr.alvo.code}|${arr.alvo.cap}` : null;
        arr.r = k ? (this._vizCache[k] || null) : null;
        if (arr.alvo && arr.r && viz && !semAnim()) {
          viz.innerHTML = this._htmlCapitulo(arr.r, arr.alvo.cap);
          viz.hidden = false;
          viz.style.transition = 'none';
          folha.style.transition = 'none';
        }
      }
      if (arr.eixo !== 'h') return;
      e.preventDefault();                          // trava a rolagem no arrasto lateral

      // sem destino (fim da Bíblia) ou sem vizinho pronto: resistência
      let d = dx;
      if (!arr.alvo || !arr.r || semAnim()) d = dx * 0.28;
      arr.dx = d;
      folha.style.transform = `translateX(${d}px)`;
      if (arr.alvo && arr.r && viz && !viz.hidden) {
        const W = largura();
        const base = arr.dir > 0 ? W : -W;         // próximo entra pela direita; anterior pela esquerda
        viz.style.transform = `translateX(${base + d}px)`;
      }
    }, { passive: false });

    folha.addEventListener('touchend', () => {
      if (!arr) return;
      const st = arr; arr = null;
      if (st.eixo !== 'h') return;                 // não foi virada de página

      const W = largura();
      const commit = !!st.alvo && this._decidirCommit(st.dx, W, Date.now() - st.hora);

      // caso simples: sem vizinho pré-carregado (ou menos-animação) — usa o
      // deslize da etapa 1 no commit, e apenas volta a folha se cancelar
      if (!st.r || semAnim() || !viz) {
        limparArraste();
        if (commit && st.alvo) {
          this.ir(st.alvo.code, st.alvo.cap, undefined, { desliza: st.dir })
            .then(() => this._irAoTopoPaginaVirada());   // virada por arrasto sempre no topo
        }
        return;
      }

      folha.style.transition = 'transform .22s ease';
      viz.style.transition = 'transform .22s ease';

      if (commit) {
        const fim = st.dir > 0 ? -W : W;           // folha sai; vizinho encaixa em 0
        folha.style.transform = `translateX(${fim}px)`;
        viz.style.transform = 'translateX(0)';
        let feito = false;
        const finalizar = async () => {
          if (feito) return; feito = true;
          await this.ir(st.alvo.code, st.alvo.cap);   // reconstrói a folha real por baixo
          limparArraste();
          this._irAoTopoPaginaVirada();               // virada por arrasto sempre no topo
        };
        viz.addEventListener('transitionend', finalizar, { once: true });
        setTimeout(finalizar, 320);                // rede de segurança
      } else {
        folha.style.transform = 'translateX(0)';
        const base = st.dir > 0 ? W : -W;
        viz.style.transform = `translateX(${base}px)`;
        let feito = false;
        const voltar = () => { if (feito) return; feito = true; limparArraste(); };
        viz.addEventListener('transitionend', voltar, { once: true });
        setTimeout(voltar, 320);
      }
    }, { passive: true });

    let atraso;
    q('campo-busca').oninput = () => {
      clearTimeout(atraso);
      Busca.cancelar();
      atraso = setTimeout(() => this.rodarBusca(), 320);
    };

    q('veu').onclick = () => this.fecharPaineis();
    document.querySelectorAll('[data-fechar]').forEach(el => {
      el.onclick = () => { this._volta = null; this.fecharPaineis(); };
    });
    // engrenagem nos cabeçalhos: abre o popup contextual com só aquele módulo
    document.querySelectorAll('[data-ajuste-popup]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.abrirAjustePopup(el.dataset.ajustePopup);
      };
    });
    document.querySelectorAll('[data-voltar]').forEach(el => {
      el.onclick = e => {
        // não deixa este clique chegar ao fechador do menu flutuante (que
        // fecharia o menu que o próprio "voltar" acabou de reabrir)
        e.stopPropagation();
        this.voltar();
      };
    });
    document.querySelector('[data-fechar-tirinha]').onclick = () => this.fecharTirinha();

    /* Toque simples deixa o ponto de leitura — o "parei aqui". Toque duplo,
     * que exige intencao, e que abre as versoes e os marcadores. Sao dois
     * gestos com pesos diferentes para duas coisas com pesos diferentes. */
    let espera = null;

    q('folha').onclick = e => {
      if (Prefs.get('paginaModo') === 'continuo') {
        // define o capítulo ativo pelo bloco tocado, para seleção/marcação/anotação
        const bloco = e.target.closest('.cap-bloco');
        if (bloco) {
          this._blocoAtivo = bloco;
          const c = +bloco.dataset.cap;
          if (c !== this.cap) {
            this.cap = c;
            const ref = document.getElementById('btn-ref');
            if (ref) ref.textContent = Dados.referencia(this.versao, this.code, c);
          }
        }
      }
      if (this.ouvindo) {                // modo player: o toque só reposiciona a leitura
        const v = e.target.closest('.v');
        if (v) {
          // no Contínuo, tocar num versículo de outro capítulo move a leitura para lá.
          // Na combinação do motor novo o toque é ignorado — então NÃO mexe no bloco.
          if (Prefs.get('paginaModo') === 'continuo' && !this.modoFila
            && !(this._naAtivo && !this._naNatural)) {
            const bl = v.closest('.cap-bloco');
            if (bl && bl !== this._blocoLendo) {
              this._blocoLendo = bl;
              this._capLendo = +bl.dataset.cap;
              this.cap = this._capLendo;
              this._execColapsada = false;
              if (this._capExplorando === this._capLendo) this._capExplorando = null;
              if (this._listaAberta) this.desenharListaPlayer();
            }
          }
          if (this._MOTOR_NOVO && this._naAtivo) this._naTocarVerso(+v.dataset.vers);
          else if (this.modoFila) this._tocarVersoFila(+v.dataset.vers);
          else this.lerVersiculo(+v.dataset.vers);
        }
        return;
      }
      // tocar no número grande do capítulo seleciona (ou limpa) todos os versículos
      if (e.target.closest('.capitular')) {
        clearTimeout(espera); espera = null;
        this.selecionarCapitulo();
        return;
      }
      // tocar no cabeçalho de uma seção (o subtítulo no meio do texto) seleciona
      // os versículos da seção e mostra o intervalo completo na barra
      const secTit = e.target.closest('.secao-titulo');
      if (secTit) {
        clearTimeout(espera); espera = null;
        this.tocarTituloSecao(secTit);
        return;
      }
      const sinal = e.target.closest('.marca-nota');
      if (sinal) {                       // tocar no sinalzinho abre a leitura
        clearTimeout(espera); espera = null;
        this.verAnotacoes(+sinal.dataset.notaVers);
        return;
      }
      const v = e.target.closest('.v');
      if (!v) return;
      if (espera) { clearTimeout(espera); espera = null; return; } // e duplo
      const vers = +v.dataset.vers;
      const palavra = e.target.closest('.il-p');   // tocou numa palavra do interlinear?
      espera = setTimeout(() => {
        espera = null;
        // com o versículo JÁ selecionado, tocar a palavra abre o estudo dela —
        // vale no interlinear e no original puro (ambos têm dados por palavra)
        if (palavra && this.pontoAtual === vers && !this.multiAtivo && !this.multiSelecao) {
          this.abrirPalavraInterlinear(palavra);
          return;
        }
        if (this.multiAtivo) {
          // modo ligado: acumula (ou tira) o versículo do grupo
          this.alternarVersiculoMulti(vers);
        } else if (this.multiSelecao) {
          // grupo ainda na tela, mas o modo desligado: volta ao normal
          this.resetarMulti();
          this.selecao = null;
          this.renderBarraSelecao();
          this.marcarPonto(vers);
        } else {
          this.marcarPonto(vers);
        }
      }, 230);
    };

    q('player-anterior').onclick = () => this.pularVers(-1);
    q('player-play').onclick = () => this.alternarPausa({ explicito: true });
    q('player-proximo').onclick = () => this.pularVers(1);
    q('player-fechar').onclick = () => this.pararOuvir();
    q('player-alca').onclick = () => this.alternarListaPlayer();
    q('player-seguir').onclick = () => this.alternarSeguirCapitulos();
    q('player-repetir').onclick = () => this.alternarRepetir();

    q('folha').ondblclick = e => {
      if (this.ouvindo) return;          // no modo player, o duplo não faz nada
      clearTimeout(espera);
      espera = null;
      if (this.multiAtivo) return;       // no modo de vários, o duplo não abre a tirinha
      const v = e.target.closest('.v');
      if (!v) return;
      this.abrirTirinha(+v.dataset.vers);
    };

    q('tirinha-acoes').onclick = () => this.abrirAcoesTirinha();
    q('tirinha-fixar').onclick = () => this.alternarFixarPelaTirinha();
    q('desfixar-refs').onclick = () => this.desligarRefsFixas();
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
        this.versaoBusca = this.versao;
        this.desenharFiltros();
        this.atualizarBuscaVersao();
        this.abrir('painel-busca');
        setTimeout(() => document.getElementById('campo-busca').focus(), 220);
      }
    };

    // Religa a leitura em sincronia quando a página volta do segundo plano
    // (celular bloqueado, app minimizado, virada de dia). Sem isso, a memória
    // do app e o motor de voz vão se desencontrando a cada congelamento — é a
    // causa da degradação que só aparece depois de horas/dias de uso.
    this._ligarReconciliacaoVoz();
  },

  /* Registrado UMA vez (guardado por _reconVozLigada). Ao voltar à tela, dá um
   * instante pro motor de voz se assentar e então reconcilia o estado. */
  _ligarReconciliacaoVoz() {
    if (this._reconVozLigada) return;
    this._reconVozLigada = true;
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      // pequena espera: logo após voltar, speaking/pending às vezes vêm com
      // valor velho; 300ms deixa o motor reportar o estado real.
      setTimeout(() => this._reconciliarVoz(), 300);
    };
    document.addEventListener('visibilitychange', aoVoltar);
    // pageshow cobre o retorno do bfcache em alguns navegadores mobile.
    window.addEventListener('pageshow', aoVoltar);
  },

  /* Reconciliação: quando a página volta do segundo plano, o app pode ACHAR que
   * está lendo enquanto o motor de voz foi morto pelo congelamento. Se for esse
   * o caso, paramos LIMPO no versículo atual — nunca reiniciamos sozinhos (é o
   * reinício automático que faz a lista entrar em loop). A pessoa retoma no
   * play quando quiser; aí é um toque explícito e seguro. */
  _reconciliarVoz() {
    if (!this.ouvindo || !this.modoFila) return;   // só interessa no modo fila ativo
    if (this.pausado) return;                       // já parado: nada a fazer
    if (this.lendoVers == null && !this.lendoNota) return;  // não estava lendo
    let vivo = false;
    try {
      const s = window.speechSynthesis;
      vivo = !!(s && (s.speaking || s.pending));
    } catch (e) { vivo = false; }
    if (vivo) return;   // motor ainda falando de verdade: deixa seguir
    // motor morreu por baixo do app: para limpo no ponto atual, sem reiniciar
    try { console.warn('[fila] voz morta no retorno ao 1º plano — pausando limpo (sem reiniciar)'); } catch (e) {}
    this.leituraGen++;             // invalida qualquer callback pendente de antes
    Locutor.parar();               // zera o motor de voz global
    this.pausado = true;
    this.atualizarPlayer();
  },

  /* =========================================================== marcadores */

  /** Toque simples: poe ou tira o ponto de leitura, na hora. */
  /** O texto do versículo (pelo número) como está na tela, sem o número, para
   *  servir de amostra na linha do histórico. */
  amostraDoVersiculo(vers) {
    const el = this._qv(vers);
    return el ? this.textoDoVersiculo(el).trim() : '';
  },

  marcarPonto(vers) {
    // o realce (foco) que a tirinha deixa ao abrir por toque duplo precisa sair
    // quando a pessoa toca noutro versiculo — senao fica preso na tela
    document.querySelectorAll('#folha .v.foco').forEach(x => x.classList.remove('foco'));
    this.destaque = null;

    const versificacao = Dados.versificacaoDe(this.versao);
    const posto = Ponto.alternar(versificacao, this.code, this.cap, vers);
    Leitura.pintarPonto(vers, posto);

    // marcar o ponto é dizer "parei aqui": a mesma entrada do capítulo no
    // histórico passa a apontar este versículo (sem criar outra) e o livro
    // fixado acompanha, para o atalho voltar exatamente onde a leitura parou
    if (posto) {
      Historico.registrar({
        versao: this.versao, code: this.code, cap: this.cap, vers,
        trecho: this.amostraDoVersiculo(vers),
      });
    }

    // com as referências fixas ligadas, tocar num versículo filtra as dele;
    // tocar de novo no mesmo (tirando o ponto) volta às do capítulo todo
    if (Prefs.get('refsFixas')) {
      this.destaque = posto ? vers : null;
      this.atualizarRefsFixas(this.destaque);
    }

    // o "+" (seleção de vários) aparece quando há um versículo em foco
    if (posto) {
      this.pontoAtual = vers;
      this._capSelecao = Prefs.get('paginaModo') === 'continuo' ? this.cap : null;
      this.mostrarMais();
    } else {
      this.pontoAtual = null;
      if (!this.multiAtivo && !this.multiSelecao) this.esconderMais();
    }
  },

  /* ============================================== leitura em voz (modo ouvir)
   *
   * Liga pelos Ajustes ("Ouvir este capítulo"). Enquanto está ligado, o app
   * vira um player: ilumina o versículo que está sendo lido, rola a tela para
   * mantê-lo à vista, e o toque no versículo só reposiciona a leitura. Lê o
   * capítulo inteiro e vira a página sozinho até o fim do livro. A cada troca
   * de capítulo, anuncia "Capítulo N"; os números de versículo não são falados.
   *
   * A leitura é feita versículo a versículo (uma fala por versículo). O
   * `leituraGen` é um selo de geração: sempre que a gente para, pula ou
   * reposiciona, ele é incrementado, de modo que a fala anterior — que pode
   * disparar seu "terminou" ao ser cancelada — seja reconhecida como obsoleta
   * e ignorada, sem avançar duas vezes. */
  ouvindo: false,
  pausado: false,
  lendoVers: null,
  leituraGen: 0,

  /* Escopo de LEITURA do player: no Contínuo é o bloco do capítulo que está sendo
   * lido (avança sozinho, independente da rolagem e do toque); no com quebra é a
   * folha inteira. Distinto do _blocoAtivo (que é o da interação por toque). */
  _blocoLendo: null,
  _capLendo: null,
  _escopoLeitura() {
    if (Prefs.get('paginaModo') === 'continuo' && this._blocoLendo && this._blocoLendo.isConnected)
      return this._blocoLendo;
    return document.getElementById('folha');
  },
  _capLeitura() {
    return (Prefs.get('paginaModo') === 'continuo' && this._capLendo) ? this._capLendo : this.cap;
  },

  /** Os números de versículo do capítulo que está sendo lido, em ordem. */
  versiculosNaTela() {
    return [...this._escopoLeitura().querySelectorAll('.v[data-vers]')]
      .map(el => +el.dataset.vers)
      .filter(n => !Number.isNaN(n));
  },

  /* Insere o botãozinho "ouvir" no canto superior direito da folha, como uma
   * marca de impressor. É recriado a cada render (o innerHTML da folha é
   * trocado), então basta acrescentá-lo ao fim de cada montagem. Não aparece em
   * versões sem áudio (originais/interlinear); e o CSS o esconde enquanto o
   * player está aberto (body.ouvindo). Faz a mesma coisa que "Ouvir" no menu. */
  _montarBotaoOuvirFolha() {
    const folha = document.getElementById('folha');
    if (!folha) return;
    if (Dados.ehOriginal(this.versao)) return;   // sem áudio nessas versões: sem botão
    const b = document.createElement('button');
    b.className = 'btn-ouvir-folha';
    b.type = 'button';
    b.title = 'Ouvir este capítulo';
    b.setAttribute('aria-label', 'Ouvir este capítulo');
    b.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true">'
      + '<circle cx="16" cy="16" r="14"/><path d="M13 10 L23 16 L13 22 Z"/></svg>';
    b.addEventListener('click', (e) => { e.preventDefault(); this.iniciarOuvir(); });
    folha.insertBefore(b, folha.firstChild);
  },

  iniciarOuvir({ comecarEm = null } = {}) {
    if (!Locutor.disponivel()) {
      return this.confirmar({
        titulo: 'Ouvir a Bíblia',
        mensagem: 'Este navegador não oferece leitura em voz. Tente pelo Chrome '
          + 'ou pelo aplicativo instalado na tela inicial.',
        confirmar: 'Entendi', cancelar: 'Fechar',
      });
    }
    // a voz do navegador não pronuncia hebraico/grego; ler a transliteração
    // soletra os pontos e não fica bom — por ora, avisa e não entra no modo.
    if (Dados.ehOriginal(this.versao)) {
      this.avisoRapido('Áudio disponível apenas em português');
      return;
    }
    // MOTOR NOVO (Etapa 1): sequência natural. Monta a fila de faixas com o
    // texto já resolvido (a partir de Dados, sem ler o DOM) e toca só ela.
    if (this._MOTOR_NOVO) {
      return this._naFilaNatural(this.versao, this.code, this.cap, comecarEm || 1)
        .then(faixas => {
          if (!faixas.length) { this.avisoRapido('Nada para tocar'); return; }
          this._naAbrirPlayer('');
          this._naFila = faixas; this._naIdx = 0; this._naNatural = true;
          this._naTocar();
        });
    }
    this.fecharPaineis();
    this.resetarMulti();
    this.pontoAtual = null;
    this.esconderMais();
    this.selecao = null;
    this.renderBarraSelecao();

    this.leituraGen++;   // invalida QUALQUER leitura/callback pendente de antes
    Locutor.parar();     // corta fala em andamento pra não sobrepor sessões
    this.ouvindo = true;
    this.pausado = false;
    this.modoFila = false;
    this.lendoVers = null;
    this._listaAberta = false;
    this._capExplorando = null;   // capítulo aberto manualmente (exploração)
    this._execColapsada = false;  // usuário recolheu o capítulo em execução?
    if (this.seguirCapitulos == null) this.seguirCapitulos = true;
    this.repetir = 'nao';   // cada sessão começa sem repetição; o usuário liga no botão se quiser
    this._repsRestantes = null;   // zera o contador de repetições da sessão anterior
    this._filaEncerrada = false;   // nova sessão: ainda não terminou
    this._cancelarAutoFechar();
    document.body.classList.add('ouvindo');
    const player = document.getElementById('player-voz');
    player.classList.add('aberto');
    player.setAttribute('aria-hidden', 'false');
    const filaEl = document.getElementById('player-fila');
    if (filaEl) { filaEl.hidden = true; filaEl.textContent = ''; }
    this._fecharListaPlayer();
    this._atualizarSeguirBotao();
    this._atualizarRepetirBotao();
    Locutor.manterSessao();          // segura a página viva com a tela apagada
    this._configurarMediaSession();  // controles na tela de bloqueio
    this.manterTelaAcesa();

    if (Prefs.get('paginaModo') === 'continuo') {
      this._blocoLendo = document.querySelector(`#folha .cap-bloco[data-cap="${this.cap}"]`)
        || document.querySelector('#folha .cap-bloco');
      this._capLendo = this._blocoLendo ? +this._blocoLendo.dataset.cap : this.cap;
    }
    const lista = this.versiculosNaTela();
    // se veio um versículo de partida (tocar a partir da seleção), começa nele;
    // senão, começa no primeiro da tela, como sempre
    const inicio = (comecarEm && lista.includes(comecarEm)) ? comecarEm : (lista[0] || 1);
    this._ultimoVersLido = null;   // nova sessão: não há "anterior" pra comparar salto
    this._filaEncerrada = false;   // nova sessão: ainda não terminou
    this.lerVersiculo(inicio, { anunciarCap: true });
  },

  /** Sai do modo ouvir e devolve o app ao normal. */
  pararOuvir() {
    this.leituraGen++;
    this._naAtivo = false;   // desliga o motor novo (callbacks pendentes caem pelo gen)
    this._naFila = [];
    this._naIdx = 0;
    this._naUltVers = this._naUltCap = this._naUltCode = null;
    this._cancelarAutoFechar();
    Locutor.parar();
    Locutor.encerrarSessao();
    this.ouvindo = false;
    this.pausado = false;
    this.lendoVers = null;
    this._blocoLendo = null;
    this._capLendo = null;
    this._capExplorando = null;
    this._execColapsada = false;
    this.lendoNota = false;
    this.modoFila = false;
    this.fila = [];
    this.filaVersos = [];
    this._listaAberta = false;
    // Reset COMPLETO da fila ao encerrar: sem isso, estas marcações sobram e
    // contaminam a PRÓXIMA lista (repetição fantasma, contador travado, cabeçalho
    // que não anuncia). Garante que cada sessão comece de fato do zero.
    this._filaEncerrada = false;
    this._repsRestantes = null;
    this.repetir = 'nao';
    this._ultimoVersLido = null;
    this._ultimoCapLido = null;
    this._ultimoCodeLido = null;
    document.body.classList.remove('ouvindo');
    const player = document.getElementById('player-voz');
    player.classList.remove('aberto');
    player.classList.remove('expandido');
    player.setAttribute('aria-hidden', 'true');
    const filaEl = document.getElementById('player-fila');
    if (filaEl) { filaEl.hidden = true; filaEl.textContent = ''; }
    const listaEl = document.getElementById('player-lista');
    if (listaEl) { listaEl.hidden = true; listaEl.innerHTML = ''; }
    const alca = document.getElementById('player-alca');
    if (alca) { alca.setAttribute('aria-expanded', 'false'); alca.classList.remove('aberta');
      alca.querySelector('use').setAttribute('href', '#i-cima'); }
    this.despintarLendo();
    this.liberarTela();
  },

  /** Lê um versículo e, ao terminar, avança sozinho para o próximo. */
  lerVersiculo(vers, { anunciarCap = false } = {}) {
    const lista = this.versiculosNaTela();
    if (!lista.includes(vers)) return;

    this._cancelarAutoFechar();

    // Decide se o NÚMERO do versículo deve ser falado. Normalmente não é (a
    // leitura flui melhor sem), mas há duas exceções que fariam a pessoa se
    // perder: (1) começar num versículo que não é o 1 — ela ouviria o capítulo
    // e já emendaria um texto do meio; (2) um salto — o versículo atual não é o
    // que vinha logo depois do anterior (playlists e seleções geram buracos).
    const contiguo = this._ultimoVersLido != null
      && this.code === this._ultimoCodeLido
      && this._capLeitura() === this._ultimoCapLido
      && vers === this._ultimoVersLido + 1;
    const anunciarVers = anunciarCap
      ? vers !== 1                 // ao anunciar o capítulo, só diz o versículo se não for o 1
      : !contiguo;                 // sem trocar de capítulo: anuncia quando houve salto

    this.lendoVers = vers;
    this.pausado = false;
    this._filaEncerrada = false;   // está lendo: sessão viva
    this.pintarLendo(vers);
    this.rolarAteVersiculo(vers);
    this.atualizarPlayer();

    // registra o ponto lido, pra próxima chamada saber se houve salto
    this._ultimoVersLido = vers;
    this._ultimoCapLido = this._capLeitura();
    this._ultimoCodeLido = this.code;

    const el = this._escopoLeitura().querySelector(`.v[data-vers="${vers}"]`);
    const texto = el ? this.textoDoVersiculo(el).trim() : '';
    const capPrefixo = anunciarCap ? `Capítulo ${this._capLeitura()}. ` : '';
    const versPrefixo = anunciarVers ? `Versículo ${vers}. ` : '';
    const prefixo = capPrefixo + versPrefixo;

    const gen = ++this.leituraGen;
    Locutor.parar();
    // uma batidinha depois do cancelar: alguns motores engasgam se a gente
    // manda falar no mesmo instante em que cancelou a fala anterior
    setTimeout(() => {
      if (gen !== this.leituraGen) return;   // já pularam/pararam nesse meio-tempo
      Locutor.falar(prefixo + texto, {
        aoFim: () => { if (gen === this.leituraGen) this.avancarLeitura(); },
        aoErro: () => { if (gen === this.leituraGen) this.avancarLeitura(); },
      });
    }, 60);
  },

  /** Passou o último versículo: vira a página; no fim do livro, encerra. */
  avancarLeitura() {
    if (this.repetir === 'vers' && this.lendoVers != null) {   // repete o mesmo versículo
      if (this._consumirRepeticao()) { this.lerVersiculo(this.lendoVers); }
      else { this.finalizarLeitura(); }
      return;
    }
    const lista = this.versiculosNaTela();
    const i = lista.indexOf(this.lendoVers);
    if (i >= 0 && i < lista.length - 1) {
      this.lerVersiculo(lista[i + 1]);
      return;
    }
    if (this.repetir === 'cap') {              // fim do capítulo: recomeça do início
      if (this._consumirRepeticao()) {
        this.lerVersiculo(lista[0] || 1, { anunciarCap: true });
      } else {
        this.finalizarLeitura();
      }
      return;
    }
    if (this.seguirCapitulos && Prefs.get('paginaModo') === 'continuo') {
      const prox = this._blocoLendo && this._blocoLendo.nextElementSibling;
      if (prox && prox.classList && prox.classList.contains('cap-bloco')) {
        this._blocoLendo = prox;
        this._capLendo = +prox.dataset.cap;
        this.cap = this._capLendo;
        this._execColapsada = false;   // o novo capítulo em execução abre sozinho
        if (this._listaAberta) this.desenharListaPlayer();
        this._configurarMediaSession();
        const nova = this.versiculosNaTela();
        this.lerVersiculo(nova[0] || 1, { anunciarCap: true });
        return;
      }
      this.finalizarLeitura();   // fim do livro no Contínuo
      return;
    }
    const info = Dados.infoLivro(this.versao, this.code);
    if (this.seguirCapitulos && info && this.cap < info.chapters) {
      this.ir(this.code, this.cap + 1).then(() => {
        if (!this.ouvindo) return;
        if (this._listaAberta) this.desenharListaPlayer();   // nova página, nova lista
        this._configurarMediaSession();
        const nova = this.versiculosNaTela();
        this.lerVersiculo(nova[0] || 1, { anunciarCap: true });
      });
      return;
    }
    this.finalizarLeitura();   // fim do capítulo (ou avanço desligado)
  },

  /** Chegou ao fim do livro: para, mas mantém o player para recomeçar. */
  finalizarLeitura() {
    this.leituraGen++;
    Locutor.parar();
    this.pausado = true;
    this.despintarLendo();
    this.lendoVers = null;
    this._filaEncerrada = true;   // fim do livro: play automático não deve reiniciar
    this.atualizarPlayer();
    this._agendarAutoFechar();   // acabou: some sozinho e libera a tela
  },

  /* ============================================== player de SEQUÊNCIA (fila)
   *
   * Toca uma lista de leitura ou um estudo: uma fila de trechos, lidos em
   * ordem. Reaproveita a mesma barra do player, o Locutor e o realce do modo
   * ouvir, mas com motor próprio — a fila atravessa livros, capítulos e até
   * versões diferentes. Cada trecho é achatado em segmentos de UM capítulo;
   * dentro do segmento, lê só os versículos escolhidos, na ordem. O selo
   * `leituraGen` continua sendo o árbitro do que é fala válida vs. obsoleta. */
  modoFila: false,
  fila: [],
  filaNome: '',
  filaIdx: 0,
  filaVersos: [],
  filaVersoIdx: 0,

  /** Achata trechos (de lista ou estudo) em segmentos de um capítulo cada. */
  _segmentosDeTrechos(trechos) {
    const segs = [];
    (trechos || []).forEach(t => {
      const versao = t.versao || this.versao;
      if (Array.isArray(t.versiculos) && t.versiculos.length) {
        segs.push({ versao, code: t.code, cap: t.cap,
          versos: [...t.versiculos].sort((a, b) => a - b), de: null, ate: null });
      } else if (t.capInicio != null) {
        // formato antigo de estudo: capInicio:versInicio — capFim:versFim
        for (let c = t.capInicio; c <= t.capFim; c++) {
          segs.push({
            versao, code: t.code, cap: c, versos: null,
            de: c === t.capInicio ? (t.versInicio || null) : null,
            ate: c === t.capFim ? (t.versFim || null) : null,
          });
        }
      } else if (t.cap != null) {
        segs.push({ versao, code: t.code, cap: t.cap, versos: null, de: null, ate: null });
      }
    });
    return segs;
  },

  /** Texto puro de uma nota do estudo (tira o HTML, junta os espaços). */
  _textoDaNota(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  },

  /* Monta a fila de um ESTUDO percorrendo os blocos NA ORDEM. Um bloco de
   * texto vira um segmento de nota (numerado: "Anotação 1", "Anotação 2"…);
   * um bloco de versículos vira os segmentos de versículo de sempre. Assim a
   * leitura do estudo inclui as anotações no lugar certo, sem confundi-las com
   * a Bíblia — cada nota é anunciada com "Nota" antes do texto. */
  _segmentosDeEstudo(e) {
    const segs = [];
    let nNota = 0;
    for (const b of Estudos.blocosDe(e)) {
      if (b.tipo === 'texto') {
        const texto = this._textoDaNota(b.html || '');
        if (!texto) continue;                 // nota vazia não entra na fila
        nNota++;
        segs.push({ tipo: 'nota', texto, rotulo: `Anotação ${nNota}`, versao: this.versao });
      } else if (b.trecho) {
        segs.push(...this._segmentosDeTrechos([b.trecho]));
      }
    }
    return segs;
  },

  tocarListaPorId(id) {
    const l = Listas.todos().find(x => x.id === id);
    if (l) this.tocarSequencia(Listas.trechosDe(l), Listas.nomeDe(l));
  },

  tocarEstudoPorId(id) {
    const e = Estudos.todos().find(x => x.id === id);
    if (e) this.tocarFila(this._segmentosDeEstudo(e), Estudos.nomeDe(e));
  },

  /** Ponto de entrada por TRECHOS (listas de leitura): vira segmentos e toca. */
  tocarSequencia(trechos, nome) {
    this.tocarFila(this._segmentosDeTrechos(trechos), nome);
  },

  /** Núcleo: recebe a fila já montada (versículos e/ou notas) e começa a tocar. */
  tocarFila(fila, nome) {
    if (!Locutor.disponivel()) {
      return this.confirmar({
        titulo: 'Ouvir', mensagem: 'Este navegador não oferece leitura em voz. '
          + 'Tente pelo Chrome ou pelo aplicativo instalado na tela inicial.',
        confirmar: 'Entendi', cancelar: 'Fechar',
      });
    }
    if (!fila || !fila.length) { this.avisoRapido('Nada para tocar nesta lista'); return; }

    // MOTOR NOVO (Etapa 1): combinação/lista/estudo. Resolve os segmentos em
    // faixas com texto pronto (via Dados, sem DOM) e toca a fila fechada.
    if (this._MOTOR_NOVO) {
      return this._naFilaDeSegmentos(fila).then(faixas => {
        if (!faixas.length) { this.avisoRapido('Nada para tocar nesta lista'); return; }
        this._naAbrirPlayer(nome || 'Lista');
        this._naFila = faixas; this._naIdx = 0; this._naNatural = false;
        this._naTocar();
      });
    }

    this.fecharPaineis();
    this.resetarMulti();
    this.pontoAtual = null;
    this.esconderMais();
    this.selecao = null;
    this.renderBarraSelecao();

    this.leituraGen++;   // invalida QUALQUER leitura/callback pendente de antes
    Locutor.parar();     // corta fala em andamento pra não sobrepor sessões
    this.modoFila = true;
    this.ouvindo = true;
    this.pausado = false;
    this.lendoNota = false;
    this.lendoVers = null;
    this._listaAberta = false;
    this.repetir = 'nao';   // cada sessão começa sem repetição; o usuário liga no botão se quiser
    this._repsRestantes = null;   // zera o contador de repetições da sessão anterior
    this._filaEncerrada = false;   // nova fila: ainda não terminou
    this._cancelarAutoFechar();
    this.fila = fila;
    this.filaNome = nome || 'Lista';
    this.filaIdx = 0;
    this.filaVersos = [];
    this.filaVersoIdx = 0;
    this._ultimoVersLido = null;   // nova sessão: sem "anterior" pra comparar salto
    this._ultimoCapLido = null;    // idem: sem capítulo/livro "anterior" da sessão passada
    this._ultimoCodeLido = null;   // (senão o cabeçalho pode não anunciar na 1ª faixa)

    document.body.classList.add('ouvindo');
    const player = document.getElementById('player-voz');
    player.classList.add('aberto');
    player.setAttribute('aria-hidden', 'false');
    const filaEl = document.getElementById('player-fila');
    if (filaEl) { filaEl.hidden = false; filaEl.textContent = this.filaNome; }
    this._fecharListaPlayer();
    this._atualizarSeguirBotao();
    this._atualizarRepetirBotao();
    Locutor.manterSessao();
    this._configurarMediaSession();
    this.manterTelaAcesa();

    this._irParaSegmento(0, { anunciar: true, reinicioOk: true });
  },

  /** Navega até o capítulo do segmento idx e começa a ler seus versículos.
   *  `versoAlvo` (opcional) posiciona num versículo específico do segmento. */
  async _irParaSegmento(idx, { anunciar = false, aoFim = false, versoAlvo = null, reinicioOk = false } = {}) {
    if (!this.modoFila) return;
    if (idx < 0) idx = 0;
    if (idx >= this.fila.length) { this._fimDaFila(); return; }
    // Trava anti-loop: voltar ao começo (idx 0) só é permitido por uma origem
    // autorizada (início da fila, repetição de lista ligada, ou play explícito).
    // Qualquer outra tentativa de recomeçar do zero é um disparo-fantasma
    // (áudio de fundo, media session) e é ignorada — senão a lista fica em loop.
    if (idx === 0 && this._filaEncerrada && !reinicioOk) {
      try { console.warn('[fila] reinício-fantasma bloqueado (lista encerrada, sem repetição)'); } catch (e) {}
      return;
    }

    const seg = this.fila[idx];
    this.filaIdx = idx;

    // segmento de NOTA: não navega na Bíblia; é um passo único que lê o texto
    if (seg.tipo === 'nota') {
      this.filaVersos = [null];
      this.filaVersoIdx = 0;
      this._configurarMediaSession();
      this._lerPassoFila({ anunciarCap: false });
      return;
    }

    if (seg.versao && seg.versao !== this.versao && Dados.versao(seg.versao)) {
      this.versao = seg.versao;
      Prefs.set('versao', seg.versao);
    }

    const gen = ++this.leituraGen;   // navegação é assíncrona: sela a transição
    await this.ir(seg.code, seg.cap, undefined, { registrar: false });
    if (!this.modoFila || gen !== this.leituraGen) return;

    const versos = this._versosDoSegmento(seg);
    this.filaVersos = versos;
    if (versoAlvo != null) {
      const k = versos.indexOf(versoAlvo);
      this.filaVersoIdx = k >= 0 ? k : 0;
    } else {
      this.filaVersoIdx = aoFim ? Math.max(0, versos.length - 1) : 0;
    }

    if (!versos.length) {
      // segmento sem versículos válidos: pula para o vizinho na direção do movimento
      if (aoFim) { if (idx > 0) this._irParaSegmento(idx - 1, { aoFim: true }); }
      else this._irParaSegmento(idx + 1, { anunciar: true });
      return;
    }
    this._configurarMediaSession();
    this._lerPassoFila({ anunciarCap: anunciar });
  },

  /** Os versículos realmente presentes na tela que o segmento pede, em ordem. */
  _versosDoSegmento(seg) {
    let versos = this.versiculosNaTela();
    if (Array.isArray(seg.versos)) {
      const pedidos = new Set(seg.versos);
      return versos.filter(v => pedidos.has(v));
    }
    if (seg.de != null) versos = versos.filter(v => v >= seg.de);
    if (seg.ate != null) versos = versos.filter(v => v <= seg.ate);
    return versos;
  },

  /** Lê o versículo corrente da fila; ao terminar, anda para o próximo. */
  _lerPassoFila({ anunciarCap = false } = {}) {
    if (!this.modoFila) return;
    this._cancelarAutoFechar();
    this._filaEncerrada = false;   // está lendo: a fila está viva
    if (this.filaVersoIdx >= this.filaVersos.length) {
      this._irParaSegmento(this.filaIdx + 1, { anunciar: true });
      return;
    }
    const seg = this.fila[this.filaIdx];
    let fala = '';

    if (seg.tipo === 'nota') {
      // uma NOTA do estudo: anuncia "Nota" antes, para não soar como Bíblia
      this.lendoVers = null;
      this.lendoNota = true;
      this.pausado = false;
      this.despintarLendo();
      this.atualizarPlayer();
      this._ultimoVersLido = null;   // depois de uma nota, o próximo versículo se anuncia
      fala = 'Nota. ' + (seg.texto || '');
    } else {
      const vers = this.filaVersos[this.filaVersoIdx];
      this.lendoVers = vers;
      this.lendoNota = false;
      this.pausado = false;
      this.pintarLendo(vers);
      this.rolarAteVersiculo(vers);
      this.atualizarPlayer();
      const el = document.querySelector(`#folha .v[data-vers="${vers}"]`);
      const texto = el ? this.textoDoVersiculo(el).trim() : '';

      // Nas playlists, cada faixa é um segmento próprio (um versículo por faixa),
      // então a contiguidade tem que ATRAVESSAR as faixas: comparo sempre com o
      // último versículo tocado, não importa se mudou de segmento.
      const contiguo = this._ultimoVersLido != null
        && seg.code === this._ultimoCodeLido
        && seg.cap === this._ultimoCapLido
        && vers === this._ultimoVersLido + 1;

      // O capítulo se anuncia quando MUDA de fato o livro/capítulo (não a cada
      // faixa). Em sequência dentro do mesmo capítulo, não repete o cabeçalho.
      const trocouCap = seg.code !== this._ultimoCodeLido
        || seg.cap !== this._ultimoCapLido;
      const anunciarCabeca = anunciarCap && trocouCap;

      // O versículo se anuncia quando a pessoa se perderia: começo sem anterior
      // fora do v.1, ou salto. Quando anuncia o capítulo, só diz o versículo se
      // não for o 1 (início natural do capítulo).
      const anunciarVers = anunciarCabeca ? (vers !== 1) : !contiguo;

      this._ultimoVersLido = vers;
      this._ultimoCapLido = seg.cap;
      this._ultimoCodeLido = seg.code;

      const capPrefixo = anunciarCabeca
        ? `${Dados.nomeCurto(seg.versao, seg.code)}, capítulo ${seg.cap}. ` : '';
      const versPrefixo = anunciarVers ? `Versículo ${vers}. ` : '';
      fala = capPrefixo + versPrefixo + texto;
    }

    const gen = ++this.leituraGen;
    Locutor.parar();
    setTimeout(() => {
      if (!this.modoFila || gen !== this.leituraGen) return;
      const seguir = () => {
        if (!this.modoFila || gen !== this.leituraGen) return;
        if (this.repetir === 'vers') {
          // repete o mesmo versículo enquanto houver repetições restantes
          if (this._consumirRepeticao()) { this._lerPassoFila(); }
          else { this._fimDaFila(); }
          return;
        }
        this.filaVersoIdx++;
        // fim da fila com repetição de "capítulo" (= lista inteira): recomeça
        if (this.repetir === 'cap'
          && this.filaIdx >= this.fila.length - 1
          && this.filaVersoIdx >= this.filaVersos.length) {
          if (this._consumirRepeticao()) {
            this._irParaSegmento(0, { anunciar: true, reinicioOk: true });
          } else {
            this._fimDaFila();
          }
          return;
        }
        this._lerPassoFila();
      };
      Locutor.falar(fala, { aoFim: seguir, aoErro: seguir });
    }, 60);
  },

  /** Pular versículo dentro da fila (atravessa segmentos nas bordas). */
  _pularFila(dir) {
    if (!this.modoFila) return;
    const j = this.filaVersoIdx + dir;
    if (j >= 0 && j < this.filaVersos.length) {
      this.filaVersoIdx = j;
      this._lerPassoFila();
      return;
    }
    if (dir > 0) this._irParaSegmento(this.filaIdx + 1, { anunciar: true });
    else if (this.filaIdx > 0) this._irParaSegmento(this.filaIdx - 1, { aoFim: true });
  },

  /** Reposicionar a leitura tocando num versículo da tela (modo fila). */
  _tocarVersoFila(vers) {
    const i = this.filaVersos.indexOf(vers);
    if (i < 0) return;             // fora do trecho da fila: ignora
    this.filaVersoIdx = i;
    this._lerPassoFila();
  },

  /** Play/pausa no modo fila (retomar re-lê o versículo atual, como no capítulo). */
  alternarPausaFila({ explicito = false } = {}) {
    if (!this.modoFila) return;
    // Fila terminada: só recomeça do zero por toque EXPLÍCITO no botão. Um "play"
    // que chegue sozinho (keep-alive da voz, sessão de mídia da tela de bloqueio)
    // NÃO deve reiniciar a lista — senão ela fica repetindo sem repetição ligada.
    if (this.lendoVers == null && !this.lendoNota) {
      if (explicito && this._filaEncerrada) {
        this._irParaSegmento(0, { anunciar: true, reinicioOk: true });
      }
      return;
    }
    if (this.pausado) {
      this.pausado = false;
      this._lerPassoFila();
    } else {
      this.leituraGen++;
      Locutor.parar();
      this.pausado = true;
      this.atualizarPlayer();
    }
  },

  /** Fim da fila: para, mas mantém o player para recomeçar. */
  _fimDaFila() {
    this.leituraGen++;
    Locutor.parar();
    this.pausado = true;
    this.despintarLendo();
    this.lendoVers = null;
    this._filaEncerrada = true;   // encerrou sozinha: um "play" automático não deve reiniciar
    this.atualizarPlayer();
    this._agendarAutoFechar();   // acabou a sequência: some e libera a tela
  },

  /* Quando a leitura chega ao fim, o player fica parado mas ainda segura a tela
   * acesa (wake lock), gastando bateria. Depois de 15s sem nada acontecer, ele
   * se fecha sozinho — aí a tela pode apagar. Qualquer retomada cancela isso. */
  _agendarAutoFechar() {
    this._cancelarAutoFechar();
    this.liberarTela();          // já solta a tela; não precisa segurar parado
    this._timerFechar = setTimeout(() => {
      if (this.ouvindo && this.lendoVers == null && this.pausado) this.pararOuvir();
    }, 15000);
  },

  _cancelarAutoFechar() {
    if (this._timerFechar) { clearTimeout(this._timerFechar); this._timerFechar = null; }
  },

  /** Play/pausa. Retomar re-lê o versículo atual do começo — é o jeito que
   *  funciona igual em todos os navegadores (o pause/resume nativo falha em
   *  vários aparelhos). Como o versículo é curto, mal se nota. */
  alternarPausa({ explicito = false } = {}) {
    if (this._MOTOR_NOVO && this._naAtivo) return this._naAlternarPausa({ explicito });
    if (this.modoFila) return this.alternarPausaFila({ explicito });
    if (!this.ouvindo) return;
    if (this.lendoVers == null) {            // parado (fim do livro): só recomeça por toque explícito
      if (explicito && this._filaEncerrada) {
        this._filaEncerrada = false;
        const lista = this.versiculosNaTela();
        this._ultimoVersLido = null;
        this.lerVersiculo(lista[0] || 1, { anunciarCap: true });
      }
      return;
    }
    if (this.pausado) {
      this.pausado = false;
      this.lerVersiculo(this.lendoVers);
    } else {
      this.leituraGen++;
      Locutor.parar();
      this.pausado = true;
      this.atualizarPlayer();
    }
  },

  /** Pular para o versículo anterior/seguinte (atravessa capítulos do mesmo
   *  livro; para nas bordas do livro). */
  pularVers(dir) {
    if (this._MOTOR_NOVO && this._naAtivo) return this._naPular(dir);
    if (this.modoFila) return this._pularFila(dir);
    if (!this.ouvindo) return;
    const lista = this.versiculosNaTela();
    const i = lista.indexOf(this.lendoVers);
    if (i < 0) { this.lerVersiculo(lista[0] || 1); return; }

    const j = i + dir;
    if (j >= 0 && j < lista.length) { this.lerVersiculo(lista[j]); return; }

    if (Prefs.get('paginaModo') === 'continuo') {
      const irmao = dir > 0 ? (this._blocoLendo && this._blocoLendo.nextElementSibling)
                            : (this._blocoLendo && this._blocoLendo.previousElementSibling);
      if (irmao && irmao.classList && irmao.classList.contains('cap-bloco')) {
        this._blocoLendo = irmao;
        this._capLendo = +irmao.dataset.cap;
        this.cap = this._capLendo;
        this._execColapsada = false;
        if (this._listaAberta) this.desenharListaPlayer();
        const nova = this.versiculosNaTela();
        this.lerVersiculo(dir > 0 ? (nova[0] || 1) : (nova[nova.length - 1] || 1), { anunciarCap: true });
      }
    } else if (dir > 0) {
      const info = Dados.infoLivro(this.versao, this.code);
      if (info && this.cap < info.chapters) {
        this.ir(this.code, this.cap + 1).then(() => {
          if (!this.ouvindo) return;
          const nova = this.versiculosNaTela();
          this.lerVersiculo(nova[0] || 1, { anunciarCap: true });
        });
      }
    } else if (this.cap > 1) {
      this.ir(this.code, this.cap - 1).then(() => {
        if (!this.ouvindo) return;
        const nova = this.versiculosNaTela();
        this.lerVersiculo(nova[nova.length - 1] || 1);
      });
    }
  },

  pintarLendo(vers) {
    this.despintarLendo();
    this._escopoLeitura().querySelectorAll(`.v[data-vers="${vers}"]`)
      .forEach(el => el.classList.add('lendo'));
  },

  despintarLendo() {
    document.querySelectorAll('#folha .v.lendo').forEach(el => el.classList.remove('lendo'));
  },

  /* Quanto tempo o reposicionamento automático espera depois que a pessoa mexe
   * na rolagem (procurando um ponto). A cada gesto o relógio reinicia; passado
   * esse tempo sem toque, a tela volta a acompanhar o versículo que está tocando. */
  _PAUSA_SEGUIR: 10000,

  /* Borda de baixo da barra do topo (o começo da área de leitura visível). */
  _topoVisivel() {
    const topo = document.querySelector('.topo');
    const h = topo ? topo.getBoundingClientRect().bottom : 0;
    return (h > 0 && h < window.innerHeight) ? h : 52;
  },

  /* Borda de cima do que está visível: o topo do player quando aberto (sobe
   * quando a lista está expandida), senão o fundo da tela. É o que encolhe o
   * espaço superior — e é nele que o versículo deve ficar centralizado. */
  _baseVisivel() {
    const player = document.getElementById('player-voz');
    if (player && player.classList.contains('aberto')) {
      const t = player.getBoundingClientRect().top;
      if (t > 0 && t < window.innerHeight) return t;
    }
    return window.innerHeight;
  },

  /* Registra que a pessoa mexeu na rolagem: pausa o reposicionamento por
   * _PAUSA_SEGUIR e reagenda a retomada. Só conta durante a leitura em voz. */
  _marcarInteracaoLeitura() {
    if (!this.ouvindo) return;
    this._seguirPausadoAte = Date.now() + this._PAUSA_SEGUIR;
    clearTimeout(this._seguirRetomaTimer);
    this._seguirRetomaTimer = setTimeout(() => this._retomarSeguir(), this._PAUSA_SEGUIR + 50);
  },

  /* Passado o tempo sem toque, volta a centralizar no versículo que está tocando. */
  _retomarSeguir() {
    if (!this.ouvindo) return;
    if (Date.now() < (this._seguirPausadoAte || 0)) return;   // mexeu de novo: o reagendamento cuida
    if (this.lendoVers != null) this.rolarAteVersiculo(this.lendoVers, { forcar: true });
  },

  /* Rola para deixar o versículo que está tocando mais ou menos no CENTRO do
   * espaço realmente visível — entre a barra do topo e o topo do player (que
   * sobe quando a lista está expandida). Uma zona morta evita ficar rolando a
   * cada versículo curto. Respeita a pausa por interação: se a pessoa acabou de
   * mexer na rolagem, não reposiciona (a não ser com `forcar`). */
  rolarAteVersiculo(vers, { forcar = false } = {}) {
    if (!forcar && Date.now() < (this._seguirPausadoAte || 0)) return;
    const el = this._escopoLeitura().querySelector(`.v[data-vers="${vers}"]`);
    if (!el) return;
    const topo = this._topoVisivel();
    const base = this._baseVisivel();
    const janela = base - topo;
    if (janela <= 40) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const r = el.getBoundingClientRect();
    // onde o TOPO do versículo deve ficar para centralizá-lo na faixa visível
    // (entre a barra do topo e o topo do player, que sobe com a lista aberta)
    const alvoTopo = topo + Math.max(0, (janela - r.height) / 2);
    // tolerância fixa (não proporcional): já está no ponto? não mexe (sem tremor)
    if (!forcar && Math.abs(r.top - alvoTopo) < 16) return;
    // scrollIntoView acha SOZINHO o elemento que realmente rola (janela, <html>
    // ou <body>, conforme o modo) — window.scrollTo mirava a janela e, quando
    // quem rola é o body, não mexia nada. O scroll-margin-top coloca o topo do
    // versículo no ponto calculado (block:'start' + margem = centralizado).
    const antes = el.style.scrollMarginTop;
    el.style.scrollMarginTop = alvoTopo + 'px';
    try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
    // restaura a margem depois que o rolar já mirou (não atrapalha outros usos
    // de scrollIntoView, como pular para um versículo pela navegação)
    clearTimeout(this._margemTimer);
    this._margemTimer = setTimeout(() => { el.style.scrollMarginTop = antes || ''; }, 700);
  },

  /** Atualiza o rótulo e o ícone (play vs pausa) da barra do player. */
  atualizarPlayer() {
    const seg = this.modoFila && this.fila ? this.fila[this.filaIdx] : null;
    const emNota = !!(seg && seg.tipo === 'nota');
    const btn = document.getElementById('player-play');
    if (btn) {
      const tocando = this.ouvindo && !this.pausado && (this.lendoVers != null || emNota);
      btn.querySelector('use').setAttribute('href', tocando ? '#i-pausar' : '#i-play');
      const rotulo = tocando ? 'Pausar' : 'Tocar';
      btn.setAttribute('aria-label', rotulo);
      btn.title = rotulo;
    }
    const ref = document.getElementById('player-ref');
    if (ref) {
      ref.textContent = emNota
        ? (seg.rotulo || 'Anotação')
        : (this.lendoVers != null
          ? `${Dados.nomeCurto(this.versao, this.code)} ${this.cap}:${this.lendoVers}`
          : Dados.referencia(this.versao, this.code, this.cap));
    }
    if (this._listaAberta) this.desenharListaPlayer();
    this._atualizarMediaSession();
  },

  /* ---- painel expansível do player: "o que está tocando", faixa a faixa ----
   * Uma alça (setinha) abre uma lista que ocupa cerca de metade da tela junto
   * com a barra. No modo fila, lista todos os trechos da sequência (livros
   * diferentes inclusive) e deixa saltar de faixa num toque — dá pra adiantar
   * ou voltar livros e enxergar quanto falta. No modo ouvir simples, mostra os
   * versículos do capítulo atual e, no rodapé, um "próximo capítulo +" quando
   * ainda há capítulo à frente (nada quando é o fim). */
  alternarListaPlayer() {
    this._listaAberta = !this._listaAberta;
    const alca = document.getElementById('player-alca');
    const lista = document.getElementById('player-lista');
    if (alca) {
      alca.setAttribute('aria-expanded', String(this._listaAberta));
      alca.setAttribute('aria-label', this._listaAberta ? 'Ocultar lista' : 'Exibir lista');
      alca.title = this._listaAberta ? 'Ocultar lista' : 'Exibir lista';
      alca.querySelector('use').setAttribute('href', this._listaAberta ? '#i-tri-baixo' : '#i-tri-cima');
      alca.classList.toggle('aberta', this._listaAberta);
    }
    if (lista) lista.hidden = !this._listaAberta;
    document.getElementById('player-voz')?.classList.toggle('expandido', this._listaAberta);
    if (this._listaAberta) {
      this._capExplorando = null;    // reabrir a lista começa com tudo fechado, exceto a execução
      this._execColapsada = false;
      this.desenharListaPlayer();
    }
    // a lista subiu/desceu: o espaço visível mudou. Recentraliza o versículo que
    // está tocando nesse novo espaço (forçado — é uma ação deliberada da pessoa).
    if (this.ouvindo && this.lendoVers != null) {
      requestAnimationFrame(() => this.rolarAteVersiculo(this.lendoVers, { forcar: true }));
    }
  },

  /** Deixa a alça/lista no estado fechado (ao (re)abrir o player num modo). */
  _fecharListaPlayer() {
    this._listaAberta = false;
    const alca = document.getElementById('player-alca');
    if (alca) {
      alca.setAttribute('aria-expanded', 'false');
      alca.setAttribute('aria-label', 'Exibir lista');
      alca.title = 'Exibir lista';
      alca.classList.remove('aberta');
      alca.querySelector('use').setAttribute('href', '#i-tri-cima');
    }
    const lista = document.getElementById('player-lista');
    if (lista) { lista.hidden = true; lista.innerHTML = ''; }
    document.getElementById('player-voz')?.classList.remove('expandido');
  },

  /* Botãozinho "»" na linha da referência: liga/desliga o avanço automático
   * para o próximo capítulo. Desligado, a leitura para no fim do capítulo atual
   * — um jeito de delimitar a leitura a um único capítulo. Só aparece no modo
   * ouvir simples (na fila, atravessar trechos é o próprio sentido). */
  alternarSeguirCapitulos() {
    this.seguirCapitulos = !this.seguirCapitulos;
    this._atualizarSeguirBotao();
    this.avisoRapido(this.seguirCapitulos
      ? 'Segue para o próximo capítulo'
      : 'Vai tocar só este capítulo');
  },

  _atualizarSeguirBotao() {
    const b = document.getElementById('player-seguir');
    if (!b) return;
    b.hidden = this.modoFila;                  // na fila não faz sentido
    b.querySelector('use').setAttribute('href', this.seguirCapitulos ? '#i-seguir-sim' : '#i-seguir-nao');
    b.classList.toggle('ativo', !!this.seguirCapitulos);
    const t = this.seguirCapitulos ? 'Seguindo capítulos' : 'Só este capítulo';
    b.setAttribute('aria-label', t);
    b.title = t;
  },

  /* Ciclo de repetição, percorrido a cada toque no botão:
   *   'nao'  ⊘  não repete (segue o fluxo normal)
   *   'cap'  ⟳  ao acabar, recomeça o capítulo / a fila do começo
   *   'vers' ↻  repete sempre o mesmo versículo
   * Sem texto no botão: cada toque mostra um aviso rápido do que ligou.
   * O quanto repete vem do Ajuste "Modo repetição" (Infinito ou 1–10). */
  alternarRepetir() {
    const ordem = ['nao', 'cap', 'vers'];
    const i = ordem.indexOf(this.repetir || 'nao');
    this.repetir = ordem[(i + 1) % ordem.length];
    this._reiniciarContagemRepeticao();   // liga/troca o modo → reinicia a contagem
    this._atualizarRepetirBotao();
    const lim = +Prefs.get('repeticaoLimite') || 0;
    const sufixo = (this.repetir !== 'nao' && lim > 0) ? ` (${lim}×)` : '';
    this.avisoRapido(
      this.repetir === 'cap' ? (this.modoFila ? 'Repetir a lista' : 'Repetir o capítulo') + sufixo
      : this.repetir === 'vers' ? 'Repetir o versículo' + sufixo
      : 'Sem repetição');
  },

  /* Reinicia o contador de repetições restantes conforme o Ajuste. Chamado ao
   * ligar/trocar o modo de repetição ou ao mudar o número no Ajuste. Para
   * "Sem repetição" ou "Infinito" (limite 0), não há contagem. */
  _reiniciarContagemRepeticao() {
    const lim = +Prefs.get('repeticaoLimite') || 0;
    this._repsRestantes = (this.repetir !== 'nao' && lim > 0) ? lim : null;
  },

  /* Consome uma repetição no fim de um ciclo (capítulo/versículo). Devolve true
   * se ainda há repetições a fazer, false se esgotou (aí quem chama encerra).
   * No Infinito (_repsRestantes === null) sempre devolve true.
   *
   * Semântica: o número escolhido é o total de execuções. Ex.: "3" toca o
   * versículo/capítulo 3 vezes ao todo — o círculo mostra 3 na 1ª, 2 na 2ª,
   * 1 na 3ª, e encerra. Como a 1ª execução já aconteceu antes de chamar aqui,
   * esgota quando o restante chega a 1 (não a 0). */
  _consumirRepeticao() {
    if (this._repsRestantes == null) return true;   // infinito
    if (this._repsRestantes <= 1) {
      this._repsRestantes = 0;          // esgotou: marca "concluído"
      this._atualizarRepetirBotao();     // apaga o selo do contador (terminou)
      return false;
    }
    this._repsRestantes--;
    this._atualizarRepetirBotao();
    return true;
  },

  _atualizarRepetirBotao() {
    const b = document.getElementById('player-repetir');
    if (!b) return;
    const icone = this.repetir === 'cap' ? '#i-rep-cap'
      : this.repetir === 'vers' ? '#i-rep-vers' : '#i-rep-nao';
    b.querySelector('use').setAttribute('href', icone);
    b.classList.toggle('ativo', this.repetir && this.repetir !== 'nao');
    const t = this.repetir === 'cap' ? (this.modoFila ? 'Repetindo a lista' : 'Repetindo o capítulo')
      : this.repetir === 'vers' ? 'Repetindo o versículo' : 'Sem repetição';
    b.setAttribute('aria-label', t);
    b.title = t;

    // círculo contador no canto: ∞ no infinito, o número restante quando é 1–10.
    // Só nos modos de repetição (nunca em "Sem repetição").
    let selo = b.querySelector('.repetir-selo');
    const lim = +Prefs.get('repeticaoLimite') || 0;
    const mostrar = this.repetir !== 'nao' && this._repsRestantes !== 0;
    if (mostrar) {
      if (!selo) {
        selo = document.createElement('span');
        selo.className = 'repetir-selo';
        b.appendChild(selo);
      }
      selo.textContent = lim === 0 ? '∞'
        : String(this._repsRestantes != null ? this._repsRestantes : lim);
    } else if (selo) {
      selo.remove();
    }
  },

  desenharListaPlayer(opts = {}) {
    const lista = document.getElementById('player-lista');
    if (!lista || !this._listaAberta) return;
    // o motor novo tem sua própria lista (plana, com salto de faixa); o acordeão
    // do Contínuo não se aplica a ele.
    const acordeao = !this._naAtivo && !this.modoFila && Prefs.get('paginaModo') === 'continuo';

    // "seguir o foco" (rolar até o que está tocando) só vale quando NÃO se está
    // explorando um capítulo; ao explorar, mantém a posição (âncora = o capítulo
    // aberto), para o avanço da leitura não puxar a tela de volta.
    const seguir = opts.seguir != null ? opts.seguir
      : (acordeao ? (this._capExplorando == null) : true);
    const ancora = opts.ancora != null ? opts.ancora
      : (acordeao && !seguir ? this._capExplorando : null);

    const topoDe = (c) => {
      const h = lista.querySelector(`[data-cap-toggle="${c}"]`);
      return h ? h.getBoundingClientRect().top - lista.getBoundingClientRect().top : null;
    };
    const topoAntes = ancora != null ? topoDe(ancora) : null;
    const scrollAntes = lista.scrollTop;

    lista.innerHTML = this._naAtivo
      ? this._naHtmlLista()
      : this.modoFila
        ? this._htmlListaFila()
        : (acordeao ? this._htmlListaLivroContinuo() : this._htmlListaCapitulo());

    if (seguir) {
      const ativo = lista.querySelector('.faixa.tocando');
      if (ativo) ativo.scrollIntoView({ block: 'center' });
    } else if (ancora != null && topoAntes != null) {
      const topoDepois = topoDe(ancora);
      if (topoDepois != null) lista.scrollTop += (topoDepois - topoAntes);
      else lista.scrollTop = scrollAntes;
    } else {
      lista.scrollTop = scrollAntes;   // avanço da leitura enquanto explora: fica parado
    }

    // motor novo: tocar numa faixa salta direto pra ela; "próximo capítulo +"
    // pula pra primeira faixa do capítulo seguinte
    lista.querySelectorAll('[data-nafaixa]').forEach(el => {
      el.onclick = () => this._naSaltarFaixa(+el.dataset.nafaixa);
    });
    lista.querySelectorAll('[data-naprox]').forEach(el => {
      el.onclick = () => this._naSaltarFaixa(+el.dataset.naprox);
    });
    // modo fila: tocar num versículo salta a leitura direto para ele
    lista.querySelectorAll('[data-faixa]').forEach(el => {
      el.onclick = () => {
        const idx = +el.dataset.faixa;
        const v = el.dataset.fverso != null ? +el.dataset.fverso : null;
        this._irParaSegmento(idx, { anunciar: true, versoAlvo: v });
      };
    });
    // modo capítulo: tocar num versículo reposiciona a leitura ali
    lista.querySelectorAll('[data-verso]').forEach(el => {
      el.onclick = () => this.lerVersiculo(+el.dataset.verso);
    });
    // acordeão (Contínuo): abrir/fechar capítulo (exploração) e escolher versículo
    lista.querySelectorAll('[data-cap-toggle]').forEach(el => {
      el.onclick = () => this._alternarCapLista(+el.dataset.capToggle);
    });
    lista.querySelectorAll('[data-vcap]').forEach(el => {
      el.onclick = () => this._escolherVersoLista(+el.dataset.vcap, +el.dataset.vnum);
    });
  },

  /* A lista do Ouvir no Contínuo é um ACORDEÃO do livro inteiro: cada capítulo é
   * uma linha; um capítulo aberto mostra seus versículos. Dois estados de abertura
   * coexistem e são independentes:
   *   • execução  — o capítulo que está tocando abre sozinho e fecha ao virar;
   *   • exploração — o usuário abre UM capítulo por vez para navegar, sem tocar na
   *     execução. Tocar num versículo ASSUME a execução a partir dali. */
  _htmlListaLivroContinuo() {
    const nome = Dados.nomeCurto(this.versao, this.code);
    const blocos = [...document.querySelectorAll('#folha .cap-bloco')];
    const itens = blocos.map(bl => {
      const cap = +bl.dataset.cap;
      const versos = [...bl.querySelectorAll('.v[data-vers]')]
        .map(el => +el.dataset.vers).filter(n => !Number.isNaN(n));
      const tocandoCap = cap === this._capLendo;
      const aberto = (tocandoCap && !this._execColapsada) || cap === this._capExplorando;
      let corpo = '';
      if (aberto) {
        let ordem = 0;
        const linhas = versos.map(v => {
          let estado = '';
          if (tocandoCap && v === this.lendoVers) estado = 'tocando';
          else if (tocandoCap && this.lendoVers != null && v < this.lendoVers) estado = 'passou';
          return this._faixaHTML({ ordem: ++ordem, versao: this.versao, nome, cap, vers: v, estado,
            attrs: `data-vcap="${cap}" data-vnum="${v}"` });
        }).join('');
        corpo = `<div class="cap-versos">${linhas}</div>`;
      }
      return `<div class="cap-item ${aberto ? 'aberto' : ''}">
        <button class="cap-linha ${tocandoCap ? 'tocando' : ''}" data-cap-toggle="${cap}" aria-expanded="${aberto}">
          <span class="cap-seta"><svg class="icone"><use href="#i-tri-baixo"/></svg></span>
          <span class="cap-linha-nome">Capítulo ${cap}</span>
          <span class="cap-linha-conta">${versos.length}</span>
          ${tocandoCap ? '<span class="faixa-agora">tocando</span>' : ''}
        </button>${corpo}</div>`;
    }).join('');
    return `<div class="player-lista-topo">
        <span class="player-lista-nome">${nome}</span>
        <span class="player-lista-conta">${blocos.length} capítulo${blocos.length > 1 ? 's' : ''}</span>
      </div>
      <div class="player-lista-rol">${itens}</div>`;
  },

  /** Abrir/fechar um capítulo na lista. Só a EXPLORAÇÃO obedece "um por vez"; o
   *  capítulo em execução tem estado próprio (o usuário pode recolhê-lo, mas o
   *  trâmite automático continua mandando nele). */
  _alternarCapLista(cap) {
    if (cap === this._capLendo) {
      this._execColapsada = !this._execColapsada;       // recolhe/expande o de execução
      this.desenharListaPlayer({ ancora: cap, seguir: false });
    } else if (cap === this._capExplorando) {
      this._capExplorando = null;                        // fecha a exploração → foco volta ao tocando
      this.desenharListaPlayer({ seguir: true });
    } else {
      this._capExplorando = cap;                         // abre esta (fecha a anterior), mantendo o ponto
      this.desenharListaPlayer({ ancora: cap, seguir: false });
    }
  },

  /** Escolher um versículo na lista TRANSFERE a execução para aquele capítulo,
   *  a partir do versículo tocado, fechando o capítulo que estava em execução. */
  _escolherVersoLista(cap, vers) {
    const bl = document.querySelector(`#folha .cap-bloco[data-cap="${cap}"]`);
    if (bl) { this._blocoLendo = bl; this._capLendo = cap; this.cap = cap; }
    this._execColapsada = false;
    if (this._capExplorando === cap) this._capExplorando = null;   // funde exploração → execução
    this.desenharListaPlayer();
    this.lerVersiculo(vers, { anunciarCap: true });
  },

  /** Uma linha da lista: número de ordem, versão no retângulo padrão, e a
   *  referência "Livro cap:vers" — sem o texto do versículo. */
  _faixaHTML({ ordem, versao, nome, cap, vers, estado, attrs }) {
    const ref = vers != null ? `${nome} ${cap}:${vers}` : `${nome} ${cap}`;
    return `<button class="faixa ${estado}" ${attrs}>
      <span class="faixa-num">${ordem}</span>
      <span class="sigla faixa-versao">${versao || ''}</span>
      <span class="faixa-ref">${Leitura.escapar(ref)}</span>
      ${estado === 'tocando' ? '<span class="faixa-agora">tocando</span>' : ''}
    </button>`;
  },

  /** Lista da FILA: uma linha por VERSÍCULO (não por trecho). A atual fica
   *  marcada; um contador diz quantos versículos ainda faltam. */
  _htmlListaFila() {
    const versoAtual = this.filaVersos[this.filaVersoIdx];
    const linhas = [];
    let ordem = 0, totalItens = 0, jaPassou = 0, achouAtual = false, temNota = false;

    this.fila.forEach((seg, si) => {
      // segmento de NOTA: uma única linha "Anotação N", sem versão nem referência
      if (seg.tipo === 'nota') {
        temNota = true;
        ordem++; totalItens++;
        let estado = '';
        if (si === this.filaIdx) { estado = 'tocando'; achouAtual = true; }
        else if (!achouAtual) { estado = 'passou'; jaPassou++; }
        linhas.push(`<button class="faixa faixa-nota ${estado}" data-faixa="${si}">
          <span class="faixa-num">${ordem}</span>
          <span class="faixa-ref">${Leitura.escapar(seg.rotulo || 'Anotação')}</span>
          ${estado === 'tocando' ? '<span class="faixa-agora">tocando</span>' : ''}
        </button>`);
        return;
      }
      const nome = Dados.nomeCurto(seg.versao, seg.code);
      const versos = Array.isArray(seg.versos) && seg.versos.length ? seg.versos : [null];
      versos.forEach(v => {
        ordem++; totalItens++;
        let estado = '';
        if (si === this.filaIdx && (v == null || v === versoAtual)) { estado = 'tocando'; achouAtual = true; }
        else if (!achouAtual) { estado = 'passou'; jaPassou++; }
        const attrs = `data-faixa="${si}"` + (v != null ? ` data-fverso="${v}"` : '');
        linhas.push(this._faixaHTML({ ordem, versao: seg.versao, nome, cap: seg.cap, vers: v, estado, attrs }));
      });
    });

    const faltam = Math.max(0, totalItens - jaPassou - 1);
    const palavra = temNota ? 'iten' : 'versículo';   // "itens" quando há notas na mistura
    return `<div class="player-lista-topo">
        <span class="player-lista-nome">${Leitura.escapar(this.filaNome || 'Lista')}</span>
        <span class="player-lista-conta">${totalItens} ${palavra}${totalItens > 1 ? 's' : ''} · faltam ${faltam}</span>
      </div>
      <div class="player-lista-rol">${linhas.join('')}</div>`;
  },

  /** Lista do CAPÍTULO (ouvir simples): uma linha por versículo do capítulo
   *  atual; no rodapé, "próximo capítulo +" quando há capítulo adiante. */
  _htmlListaCapitulo() {
    const versos = this.versiculosNaTela();
    const nome = Dados.nomeCurto(this.versao, this.code);
    let ordem = 0;
    const linhas = versos.map(v => {
      let estado = '';
      if (v === this.lendoVers) estado = 'tocando';
      else if (this.lendoVers != null && v < this.lendoVers) estado = 'passou';
      return this._faixaHTML({ ordem: ++ordem, versao: this.versao, nome, cap: this._capLeitura(), vers: v, estado, attrs: `data-verso="${v}"` });
    }).join('');

    const rodape = this._temProximoCapitulo()
      ? `<div class="player-lista-proximo">Próximo capítulo <span class="mais-cap">+</span></div>`
      : '';

    return `<div class="player-lista-topo">
        <span class="player-lista-nome">${nome} ${this._capLeitura()}</span>
        <span class="player-lista-conta">${versos.length} versículo${versos.length > 1 ? 's' : ''}</span>
      </div>
      <div class="player-lista-rol">${linhas}${rodape}</div>`;
  },

  /** Há um próximo capítulo (neste livro ou no seguinte) depois do atual? */
  _temProximoCapitulo() {
    try {
      const info = Dados.infoLivro(this.versao, this.code);
      return (info && this._capLeitura() < info.chapters) || !!Dados.vizinho(this.versao, this.code, 1);
    } catch (e) { return false; }
  },

  /* Mantém a tela acesa enquanto ouve (nem todo aparelho deixa; quando não
   * deixa, apenas não faz nada). Se a tela apagar e voltar, refaz o pedido. */
  async manterTelaAcesa() {
    try {
      if ('wakeLock' in navigator) {
        this._wake = await navigator.wakeLock.request('screen');
        if (!this._revalidarWake) {
          this._revalidarWake = () => {
            if (document.visibilityState === 'visible' && this.ouvindo) this.manterTelaAcesa();
          };
          document.addEventListener('visibilitychange', this._revalidarWake);
        }
      }
    } catch (e) { /* sem trava de tela; segue a leitura mesmo assim */ }
  },

  liberarTela() {
    try { if (this._wake) { this._wake.release(); this._wake = null; } } catch (e) {}
  },

  /* ==========================================================================
   * MOTOR DE ÁUDIO NOVO (Etapa 1) — estilo tocador de música
   * --------------------------------------------------------------------------
   * Uma ÚNICA fila de dados na memória. Cada "faixa" já carrega o texto pronto
   * pra falar — resolvido a partir de `Dados`, NUNCA lido do DOM. O motor toca
   * só a fila; ele não pergunta à tela o que dizer nem vira a página pra saber
   * o próximo. (A tela como seguidora é a Etapa 2.)
   *
   * Faixa de versículo: { versao, code, cap, vers, texto }
   * Faixa de nota:      { nota:true, texto, rotulo, versao }
   *
   * Reaproveita toda a "encanação" que já existe: o Locutor, a barra do player,
   * o realce, a sessão de áudio de fundo, o wake-lock, o auto-fechar, o contador
   * de repetição (_consumirRepeticao) e os botões de repetir/seguir.
   *
   * A chave `_MOTOR_NOVO` liga/desliga tudo: com ela `false`, o app volta
   * inteiro ao motor antigo (que continua no arquivo, intacto).
   * ======================================================================== */
  _MOTOR_NOVO: true,

  _naAtivo: false,      // o motor novo está tocando?
  _naFila: [],          // as faixas
  _naIdx: 0,            // faixa corrente
  _naNatural: false,    // true = sequência natural (segue capítulos); false = combinação fechada
  _naNome: '',          // rótulo da lista (playlist/estudo), se houver
  _naUltVers: null,     // último versículo falado (pra decidir anúncio de salto)
  _naUltCap: null,
  _naUltCode: null,

  /* ---- construtores da fila (tudo a partir de Dados, sem tocar no DOM) ---- */

  /** Sequência natural: do ponto de partida até o fim do LIVRO. Como
   *  `Dados.livro` carrega o livro inteiro de uma vez (e fica em cache), montar
   *  a fila é só percorrer o que já está na memória — sem novas idas à rede. */
  async _naFilaNatural(versao, code, capInicio, versInicio) {
    const faixas = [];
    let livro;
    try { livro = await Dados.livro(versao, code); } catch (e) { return faixas; }
    if (!livro || !Array.isArray(livro.chapters)) return faixas;
    for (const cap of livro.chapters) {
      if (cap.number < capInicio) continue;
      for (const v of (cap.verses || [])) {
        if (cap.number === capInicio && v.number < (versInicio || 1)) continue;
        const texto = (v.text || '').trim();
        if (!texto) continue;             // versículo sem texto legível: fora da fila
        faixas.push({ versao, code, cap: cap.number, vers: v.number, texto });
      }
    }
    return this._naIntercalarSubtitulos(faixas);
  },

  /** Combinação confinada: só os versículos pedidos, do mesmo capítulo, na
   *  ordem em que vierem. (Usada quando a seleção tem 2+ versículos.) */
  async _naFilaCombinacao(versao, code, cap, versos) {
    const faixas = [];
    let dados;
    try { dados = await Dados.capitulo(versao, code, cap); } catch (e) { return faixas; }
    if (!dados) return faixas;
    const porNum = new Map((dados.capitulo.verses || []).map(v => [v.number, v]));
    for (const n of versos) {
      const v = porNum.get(n);
      const texto = v ? (v.text || '').trim() : '';
      if (!texto) continue;
      faixas.push({ versao, code, cap, vers: n, texto });
    }
    return this._naIntercalarSubtitulos(faixas);
  },

  /** A partir de SEGMENTOS (listas de leitura e estudos, que atravessam livros,
   *  capítulos e versões, e podem trazer notas). Os segmentos já são dados puros
   *  — aqui a gente só resolve o texto de cada versículo pedido. */
  async _naFilaDeSegmentos(segs) {
    const faixas = [];
    for (const seg of (segs || [])) {
      if (seg.tipo === 'nota') {
        faixas.push({ nota: true, texto: seg.texto || '',
          rotulo: seg.rotulo || 'Anotação', versao: seg.versao || this.versao });
        continue;
      }
      const versao = seg.versao || this.versao;
      if (Dados.ehOriginal(versao)) continue;   // interlinear: sem áudio, pula o segmento
      let dados;
      try { dados = await Dados.capitulo(versao, seg.code, seg.cap); } catch (e) { continue; }
      if (!dados) continue;
      let verses = dados.capitulo.verses || [];
      if (Array.isArray(seg.versos)) {
        const pedidos = new Set(seg.versos);
        verses = verses.filter(v => pedidos.has(v.number));
      } else {
        if (seg.de != null) verses = verses.filter(v => v.number >= seg.de);
        if (seg.ate != null) verses = verses.filter(v => v.number <= seg.ate);
      }
      for (const v of verses) {
        const texto = (v.text || '').trim();
        if (!texto) continue;
        faixas.push({ versao, code: seg.code, cap: seg.cap, vers: v.number, texto });
      }
    }
    return this._naIntercalarSubtitulos(faixas);
  },

  /** Intercala faixas de SUBTÍTULO nas faixas de versículo (já em ordem de
   *  leitura). Uma faixa de subtítulo entra imediatamente ANTES do versículo que
   *  abre a seção — e só ali, então cada seção é anunciada uma única vez, mesmo
   *  quando ela atravessa capítulos (o início da seção existe num ponto só).
   *
   *  Dois portões:
   *   1. a preferência `vozSubtitulos` (o interruptor "Anunciar na leitura em voz");
   *   2. a EXIBIÇÃO dos subtítulos — que vem de graça, porque
   *      `Dados.secoesDoLivroParaNavegacao` usa `secoesParaLeitura`, e essa devolve
   *      vazio quando os subtítulos estão desligados. Assim, subtítulo oculto na
   *      tela = nada a falar. E o título é o da versão que está sendo lida (ou o do
   *      favorito, exatamente como aparece na página). */
  async _naIntercalarSubtitulos(faixas) {
    if (typeof Prefs !== 'undefined' && !Prefs.get('vozSubtitulos')) return faixas;
    if (!Array.isArray(faixas) || !faixas.length) return faixas;

    const cache = new Map();   // (versao|code) -> Map(cap -> Map(inicio -> titulo))
    const iniciosDe = async (versao, code) => {
      const chave = versao + '|' + code;
      if (cache.has(chave)) return cache.get(chave);
      const mapa = new Map();
      try {
        const secs = await Dados.secoesDoLivroParaNavegacao(versao, code);
        for (const s of (secs || [])) {
          if (!mapa.has(s.capitulo)) mapa.set(s.capitulo, new Map());
          mapa.get(s.capitulo).set(s.inicio, s.titulo);
        }
      } catch (e) {}
      cache.set(chave, mapa);
      return mapa;
    };

    const saida = [];
    const jaFalada = new Set();   // (versao|code|cap|inicio) já anunciados
    for (const f of faixas) {
      if (!f.nota && !f.subtitulo && f.code && f.cap != null && f.vers != null) {
        const mapa = await iniciosDe(f.versao, f.code);
        const doCap = mapa.get(f.cap);
        const titulo = doCap && doCap.get(f.vers);
        if (titulo) {
          const chave = f.versao + '|' + f.code + '|' + f.cap + '|' + f.vers;
          if (!jaFalada.has(chave)) {
            jaFalada.add(chave);
            saida.push({ subtitulo: true, texto: titulo,
              versao: f.versao, code: f.code, cap: f.cap, vers: f.vers });
          }
        }
      }
      saida.push(f);
    }
    return saida;
  },

  /* ---- abertura do player (mesma encanação do motor antigo) ---- */

  _naAbrirPlayer(nome) {
    this.fecharPaineis();
    this.resetarMulti();
    this.pontoAtual = null;
    this.esconderMais();
    this.selecao = null;
    this.renderBarraSelecao();

    this.leituraGen++;      // invalida qualquer fala/callback pendente de antes
    Locutor.parar();
    this._naAtivo = true;
    this.ouvindo = true;
    this.pausado = false;
    this.modoFila = false;  // o motor novo não usa o motor de fila antigo
    this.lendoNota = false;
    this.lendoVers = null;
    this._listaAberta = false;
    if (this.seguirCapitulos == null) this.seguirCapitulos = true;
    this.repetir = 'nao';
    this._repsRestantes = null;
    this._filaEncerrada = false;
    this._naUltVers = this._naUltCap = this._naUltCode = null;
    this._naNome = nome || '';
    this._seguirPausadoAte = 0;                 // nova sessão: começa acompanhando
    clearTimeout(this._seguirRetomaTimer);
    this._cancelarAutoFechar();

    document.body.classList.add('ouvindo');
    const player = document.getElementById('player-voz');
    player.classList.add('aberto');
    player.setAttribute('aria-hidden', 'false');
    const filaEl = document.getElementById('player-fila');
    if (filaEl) {
      if (nome) { filaEl.hidden = false; filaEl.textContent = nome; }
      else { filaEl.hidden = true; filaEl.textContent = ''; }
    }
    this._fecharListaPlayer();
    this._atualizarSeguirBotao();
    this._atualizarRepetirBotao();
    Locutor.manterSessao();
    this.manterTelaAcesa();
  },

  /* ---- núcleo: falar a faixa corrente e, ao fim, avançar ---- */

  _naTocar() {
    if (!this._naAtivo) return;
    this._cancelarAutoFechar();
    this._filaEncerrada = false;
    const faixa = this._naFila[this._naIdx];
    if (!faixa) { this._naFim(); return; }

    let fala = '';
    if (faixa.subtitulo) {
      // Cabeçalho de seção: fala só o título, uma vez, no começo da seção. NÃO
      // mexe em _naUltVers/_naUltCap/_naUltCode — assim o versículo que vem logo
      // depois anuncia capítulo/número exatamente como faria sem o subtítulo.
      this.lendoVers = faixa.vers;   // ancora no versículo de abertura (tela/estado)
      this.lendoNota = false;
      this.pausado = false;
      fala = (faixa.texto || '').trim();
      if (fala && !/[.!?…]$/.test(fala)) fala += '.';   // um ponto ajuda a prosódia/pausa
    } else if (faixa.nota) {
      this.lendoVers = null;
      this.lendoNota = true;
      this.pausado = false;
      this.despintarLendo();
      this._naUltVers = null;   // depois de uma nota, o próximo versículo se anuncia
      fala = 'Nota. ' + (faixa.texto || '');
    } else {
      this.lendoVers = faixa.vers;
      this.lendoNota = false;
      this.pausado = false;

      // Anúncio: o cabeçalho do capítulo sai quando MUDA o livro/capítulo (ou no
      // começo). O número do versículo sai quando a pessoa se perderia — começo
      // fora do v.1, ou um salto (faixa não contígua à anterior).
      const trocouCap = faixa.code !== this._naUltCode || faixa.cap !== this._naUltCap;
      const contiguo = this._naUltVers != null && faixa.code === this._naUltCode
        && faixa.cap === this._naUltCap && faixa.vers === this._naUltVers + 1;
      const anunciarCabeca = (this._naUltVers == null) || trocouCap;
      const anunciarVers = anunciarCabeca ? (faixa.vers !== 1) : !contiguo;

      // natural fica no mesmo livro → "Capítulo X."; combinação/playlist pode
      // pular de livro → "Nome, capítulo X.".
      const capPrefixo = anunciarCabeca
        ? (this._naNatural
            ? `Capítulo ${faixa.cap}. `
            : `${Dados.nomeCurto(faixa.versao, faixa.code)}, capítulo ${faixa.cap}. `)
        : '';
      const versPrefixo = anunciarVers ? `Versículo ${faixa.vers}. ` : '';
      fala = capPrefixo + versPrefixo + faixa.texto;

      this._naUltVers = faixa.vers;
      this._naUltCap = faixa.cap;
      this._naUltCode = faixa.code;
    }

    // Sela a transição ANTES de acionar a tela: o seguidor usa este mesmo selo
    // pra decidir se ainda deve pintar quando um ir() assíncrono terminar (se a
    // pessoa saltou de faixa nesse meio-tempo, o selo muda e a pintura é abortada).
    const gen = ++this.leituraGen;

    this._naAtualizarPlayer();
    this._naMediaSession();
    this._naSeguirTela(faixa);   // Etapa 2: a tela segue o que está tocando

    Locutor.parar();
    // uma batidinha depois do cancelar: alguns motores engasgam se mandar falar
    // no mesmo instante em que cancelou a fala anterior. Em torno do subtítulo a
    // espera é maior, criando a pausa ANTES dele (folga do fim do versículo
    // anterior) e DEPOIS dele (a faixa seguinte é o versículo de abertura, que
    // vê a anterior como subtítulo e também espera).
    const anterior = this._naFila[this._naIdx - 1];
    const emTornoDeSubtitulo = faixa.subtitulo || (anterior && anterior.subtitulo);
    const espera = emTornoDeSubtitulo ? 450 : 60;
    setTimeout(() => {
      if (!this._naAtivo || gen !== this.leituraGen) return;
      Locutor.falar(fala, {
        aoFim: () => { if (this._naAtivo && gen === this.leituraGen) this._naAvancar(); },
        aoErro: () => { if (this._naAtivo && gen === this.leituraGen) this._naAvancar(); },
      });
    }, espera);
  },

  /* ---- avançar (repetição, portão do "seguir", fim) ---- */

  _naAvancar() {
    if (!this._naAtivo) return;

    // faixa de subtítulo: é sempre seguida pelo versículo que abre a seção, no
    // mesmo capítulo. Só avança — não repete (a repetição de versículo recai no
    // versículo, não no título) e não passa pelo portão de "seguir capítulos".
    const emSubtitulo = this._naFila[this._naIdx];
    if (emSubtitulo && emSubtitulo.subtitulo) {
      if (this._naIdx + 1 >= this._naFila.length) { this._naFim(); return; }
      this._naIdx++;
      this._naTocar();
      return;
    }

    // repetição de versículo: repete a MESMA faixa
    if (this.repetir === 'vers' && this.lendoVers != null) {
      if (this._consumirRepeticao()) { this._naTocar(); }
      else { this._naFim(); }
      return;
    }

    const atual = this._naFila[this._naIdx];
    const prox = this._naFila[this._naIdx + 1];

    // repetição de "capítulo":
    //  - natural  → recomeça o CAPÍTULO corrente (as faixas do mesmo cap)
    //  - combinação/playlist → recomeça a FILA inteira
    if (this.repetir === 'cap') {
      const fimDoCiclo = this._naNatural
        ? (!prox || prox.cap !== atual.cap || prox.code !== atual.code)
        : (!prox);
      if (fimDoCiclo) {
        if (this._consumirRepeticao()) {
          let alvo = 0;
          if (this._naNatural) {
            alvo = this._naIdx;
            while (alvo > 0
              && this._naFila[alvo - 1].cap === atual.cap
              && this._naFila[alvo - 1].code === atual.code) alvo--;
          }
          this._naIdx = alvo;
          this._naUltVers = this._naUltCap = this._naUltCode = null;   // re-anuncia o começo
          this._naTocar();
        } else {
          this._naFim();
        }
        return;
      }
    }

    if (!prox) { this._naFim(); return; }

    // portão do "seguir capítulos" (só faz sentido no modo natural): se o
    // próximo é outro capítulo e o seguir está desligado, para aqui.
    if (this._naNatural && !this.seguirCapitulos
      && (prox.cap !== atual.cap || prox.code !== atual.code)) {
      this._naFim();
      return;
    }

    this._naIdx++;
    this._naTocar();
  },

  /** Fim da fila: para, mas mantém o player aberto pra poder recomeçar. */
  _naFim() {
    this.leituraGen++;
    Locutor.parar();
    this.pausado = true;
    this.despintarLendo();
    this.lendoVers = null;
    this.lendoNota = false;
    this._filaEncerrada = true;   // encerrou sozinha: um "play" automático não reinicia
    this._naAtualizarPlayer();
    this._agendarAutoFechar();
  },

  /* ---- controles: pular, play/pausa, tocar num versículo ---- */

  /** Anterior / próximo. Simplesmente anda o ponteiro na fila; nas bordas, nada. */
  _naPular(dir) {
    if (!this._naAtivo) return;
    const j = this._naIdx + dir;
    if (j < 0 || j >= this._naFila.length) return;
    this._naIdx = j;
    this._naTocar();
  },

  /** Play/pausa. Retomar re-lê a faixa atual do começo (o pause/resume nativo
   *  falha em vários aparelhos; como a faixa é curta, mal se nota). */
  _naAlternarPausa({ explicito = false } = {}) {
    if (!this._naAtivo) return;
    // fila terminada: só recomeça do zero por toque EXPLÍCITO no botão. Um "play"
    // que chegue sozinho (keep-alive, sessão de mídia) NÃO reinicia — senão a
    // lista fica repetindo sem repetição ligada.
    if (this.lendoVers == null && !this.lendoNota) {
      if (explicito && this._filaEncerrada) {
        this._naIdx = 0;
        this._naUltVers = this._naUltCap = this._naUltCode = null;
        this._filaEncerrada = false;
        this._naTocar();
      }
      return;
    }
    if (this.pausado) {
      this.pausado = false;
      this._naTocar();
    } else {
      this.leituraGen++;
      Locutor.parar();
      this.pausado = true;
      this._naAtualizarPlayer();
    }
  },

  /** Toque num versículo da tela. Na sequência natural, reposiciona a leitura
   *  ali (dentro do capítulo que está na tela). Na combinação, o toque NÃO
   *  reposiciona — a tela é só seguidora; pra mudar a combinação, é preciso parar. */
  _naTocarVerso(vers) {
    if (!this._naAtivo) return;
    if (!this._naNatural) return;   // combinação/playlist: toque não adiciona nem reposiciona
    const code = this.code;
    const cap = this._capLeitura();   // no Contínuo, o capítulo tocado; senão, this.cap
    const alvo = this._naFila.findIndex(f => !f.nota && !f.subtitulo
      && f.code === code && f.cap === cap && f.vers === vers);
    if (alvo < 0) return;
    this._naIdx = alvo;
    this._naTocar();
  },

  /** Saltar direto para uma faixa da fila (toque na lista de execução). */
  _naSaltarFaixa(i) {
    if (!this._naAtivo) return;
    if (i < 0 || i >= this._naFila.length) return;
    this._naIdx = i;
    this._naTocar();
  },

  /* ---- a TELA como seguidora (Etapa 2) ----
   * A tela reage ao que está tocando: garante o capítulo certo à vista (virando
   * a página quando a fila cruza pra outro capítulo/livro), ilumina o versículo
   * e o centraliza. É "dispara-e-esquece", protegido por try: se a rolagem ou a
   * navegação falharem, o áudio (que vem da fila em memória) não é afetado. */
  _naSeguirTela(faixa) {
    try {
      if (!faixa || faixa.nota) { this.despintarLendo(); return; }
      const gen = this.leituraGen;   // sela: se pular de faixa durante um ir() async, aborta a pintura
      const continuo = Prefs.get('paginaModo') === 'continuo';
      const trocarVersao = this.versao !== faixa.versao && !!Dados.versao(faixa.versao);
      // no Contínuo o LIVRO inteiro está empilhado, então navegar só é preciso
      // quando muda de livro/versão; trocar de capítulo é só rolar até o bloco.
      const precisaNavegar = trocarVersao
        || this.code !== faixa.code
        || (!continuo && this.cap !== faixa.cap);

      const pintarAlvo = () => {
        if (gen !== this.leituraGen) return;   // já saltou pra outra faixa nesse meio-tempo
        if (continuo) {
          const bl = document.querySelector(`#folha .cap-bloco[data-cap="${faixa.cap}"]`);
          if (bl) { this._blocoLendo = bl; this._capLendo = faixa.cap; this.cap = faixa.cap; }
        }
        this.pintarLendo(faixa.vers);
        this.rolarAteVersiculo(faixa.vers);
      };

      if (precisaNavegar) {
        if (trocarVersao) { this.versao = faixa.versao; Prefs.set('versao', faixa.versao); }
        Promise.resolve(this.ir(faixa.code, faixa.cap, undefined, { registrar: false }))
          .then(pintarAlvo).catch(() => {});
      } else {
        pintarAlvo();
      }
    } catch (e) {}
  },

  /* ---- lista de execução do player, alimentada pela fila NOVA ----
   * Natural: mostra só os versículos do capítulo que está tocando, com um
   * "próximo capítulo +" no rodapé quando há mais adiante (leve, mesmo num livro
   * grande). Combinação/playlist: mostra todas as faixas. Em ambos, a que toca
   * fica marcada e um toque salta pra ela. */
  _naHtmlLista() {
    const atual = this._naFila[this._naIdx];
    let faixas, offset = 0, titulo = '', rodape = '';

    if (this._naNatural && atual) {
      let ini = this._naFila.findIndex(f => f.code === atual.code && f.cap === atual.cap);
      if (ini < 0) ini = this._naIdx;
      let fim = ini;
      while (fim + 1 < this._naFila.length
        && this._naFila[fim + 1].code === atual.code
        && this._naFila[fim + 1].cap === atual.cap) fim++;
      faixas = this._naFila.slice(ini, fim + 1);
      offset = ini;
      titulo = `${Dados.nomeCurto(atual.versao, atual.code)} ${atual.cap}`;
      if (fim + 1 < this._naFila.length) {
        rodape = `<button class="player-lista-proximo" data-naprox="${fim + 1}">`
          + `Próximo capítulo <span class="mais-cap">+</span></button>`;
      }
    } else {
      faixas = this._naFila;
      titulo = this._naNome || 'Lista';
    }

    const linhas = faixas.map((f, k) => {
      const i = offset + k;
      const estado = i === this._naIdx ? 'tocando' : (i < this._naIdx ? 'passou' : '');
      if (f.subtitulo) {
        // cabeçalho de seção: uma divisória com o título, não um versículo (nem
        // clicável — não se "salta" para um subtítulo).
        return `<div class="faixa faixa-subtitulo ${estado}"
          style="padding:8px 12px;font-weight:600;opacity:.72;font-size:.85em">
          ${Leitura.escapar(f.texto || '')}</div>`;
      }
      if (f.nota) {
        return `<button class="faixa faixa-nota ${estado}" data-nafaixa="${i}">
          <span class="faixa-num">${i + 1}</span>
          <span class="faixa-ref">${Leitura.escapar(f.rotulo || 'Anotação')}</span>
          ${estado === 'tocando' ? '<span class="faixa-agora">tocando</span>' : ''}
        </button>`;
      }
      return this._faixaHTML({ ordem: i + 1, versao: f.versao,
        nome: Dados.nomeCurto(f.versao, f.code), cap: f.cap, vers: f.vers, estado,
        attrs: `data-nafaixa="${i}"` });
    });

    const nVersos = faixas.filter(f => !f.subtitulo).length;   // não conta os títulos
    const conta = this._naNatural
      ? `${nVersos} versículo${nVersos > 1 ? 's' : ''}`
      : `${this._naFila.length} item${this._naFila.length > 1 ? 'ns' : ''} · faltam `
        + `${Math.max(0, this._naFila.length - this._naIdx - 1)}`;

    return `<div class="player-lista-topo">
        <span class="player-lista-nome">${Leitura.escapar(titulo)}</span>
        <span class="player-lista-conta">${conta}</span>
      </div>
      <div class="player-lista-rol">${linhas.join('')}${rodape}</div>`;
  },

  /* ---- espelhos de UI do player (rótulo + sessão de mídia) ---- */

  _naAtualizarPlayer() {
    const faixa = this._naFila[this._naIdx];
    const btn = document.getElementById('player-play');
    if (btn) {
      const tocando = this._naAtivo && !this.pausado && (this.lendoVers != null || this.lendoNota);
      btn.querySelector('use').setAttribute('href', tocando ? '#i-pausar' : '#i-play');
      const rot = tocando ? 'Pausar' : 'Tocar';
      btn.setAttribute('aria-label', rot); btn.title = rot;
    }
    const ref = document.getElementById('player-ref');
    if (ref && faixa) {
      ref.textContent = faixa.nota
        ? (faixa.rotulo || 'Anotação')
        : `${Dados.nomeCurto(faixa.versao, faixa.code)} ${faixa.cap}:${faixa.vers}`;
    }
    if (this._listaAberta) this.desenharListaPlayer();
    this._naMediaSessionEstado();
  },

  _naMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      const faixa = this._naFila[this._naIdx];
      const titulo = faixa
        ? (faixa.nota ? (faixa.rotulo || 'Anotação')
          : `${Dados.nomeCurto(faixa.versao, faixa.code)} ${faixa.cap}:${faixa.vers}`)
        : 'Bíblia';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: titulo, artist: 'Bíblia',
        album: this._naNome
          || (faixa && !faixa.nota ? Dados.nomeCurto(faixa.versao, faixa.code) : 'Leitura'),
      });
      const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch (e) {} };
      set('play', () => { if (this.pausado || this.lendoVers == null) this._naAlternarPausa(); });
      set('pause', () => { if (!this.pausado && this.lendoVers != null) this._naAlternarPausa(); });
      set('previoustrack', () => this._naPular(-1));
      set('nexttrack', () => this._naPular(1));
      navigator.mediaSession.playbackState = 'playing';
    } catch (e) {}
  },

  _naMediaSessionEstado() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState =
        (this._naAtivo && !this.pausado && (this.lendoVers != null || this.lendoNota))
          ? 'playing' : 'paused';
    } catch (e) {}
  },

  /* Media Session: dá controles na tela de bloqueio / notificação (play, pausa,
   * anterior, próximo) e, tão importante quanto, faz o sistema tratar a página
   * como "tocando mídia" — o que ajuda a mantê-la viva com a tela apagada. */
  _configurarMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      const ref = this.modoFila
        ? (this.filaNome || 'Lista de leitura')
        : Dados.referencia(this.versao, this.code, this.cap);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ref,
        artist: 'Bíblia',
        album: this.modoFila ? 'Lista de leitura' : Dados.nomeCurto(this.versao, this.code),
      });
      const set = (acao, fn) => { try { navigator.mediaSession.setActionHandler(acao, fn); } catch (e) {} };
      set('play', () => { if (this.pausado || this.lendoVers == null) this.alternarPausa(); });
      set('pause', () => { if (!this.pausado && this.lendoVers != null) this.alternarPausa(); });
      set('previoustrack', () => this.pularVers(-1));
      set('nexttrack', () => this.pularVers(1));
      navigator.mediaSession.playbackState = 'playing';
    } catch (e) {}
  },

  _atualizarMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState =
        (this.ouvindo && !this.pausado && (this.lendoVers != null || this.lendoNota)) ? 'playing' : 'paused';
    } catch (e) {}
  },

  /** Amostra da voz nos Ajustes: fala um versículo (o primeiro do capítulo
   *  aberto) para a pessoa ouvir como a voz escolhida soa, sem entrar no modo
   *  player. Não mexe na leitura em andamento nem no estado do app. */
  ouvirAmostra() {
    if (!Locutor.disponivel()) return;
    const lista = this.versiculosNaTela();
    let texto = '';
    if (lista.length) {
      const el = document.querySelector(`#folha .v[data-vers="${lista[0]}"]`);
      texto = el ? this.textoDoVersiculo(el).trim() : '';
    }
    if (!texto) texto = 'Esta é a voz escolhida para a leitura da Bíblia.';
    Locutor.parar();
    Locutor.falar(texto);
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
    const painel = document.getElementById('painel-refs-fixas');
    if (painel) painel.classList.remove('alto');   // a lista fica na altura normal
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
    const painel = document.getElementById('painel-refs-fixas');
    const corpo = document.getElementById('corpo-refs-fixas');
    corpo.innerHTML = '<div class="estado">Abrindo o texto…</div>';

    // ao abrir o texto, o painel cresce e cobre a folha, como a tirinha faz —
    // a leitura da referência ganha espaço. Volta ao normal ao tocar em Voltar.
    painel.classList.add('alto');

    let capLocal = cap;
    if (Dados.versificacaoDe(this.versao) === 'vulgata') {
      capLocal = Dados.converter(code, cap, 'hebraica', 'vulgata').capitulo;
    }

    let versos = [], nomeLivro = Dados.nomeCurto(this.versao, code);
    try {
      const r = await Dados.capitulo(this.versao, code, capLocal);
      if (r) {
        nomeLivro = r.livro.name;
        const ate = vFim + 8;
        versos = r.capitulo.verses.filter(v => v.number >= vIni && v.number <= ate);
      }
    } catch { /* ausente */ }

    const ref = `${nomeLivro} ${capLocal}:${vIni}` + (vFim !== vIni ? `-${vFim}` : '');
    const corpoTexto = versos.length
      ? versos.map(v => {
          const foco = v.number >= vIni && v.number <= vFim ? ' em-foco' : '';
          return `<p class="verso-ref${foco}"><span class="n">${v.number}</span>${Leitura.escapar(v.text || '')}</p>`;
        }).join('')
      : '<div class="estado">Texto não disponível nesta versão.</div>';

    // mesmos botões da tirinha, lado a lado, para ficar padronizado
    const nomeCurto = Dados.nomeCurto(this.versao, code);
    corpo.innerHTML = `
      <div class="cabeca-ref-texto"><strong>${ref}</strong></div>
      <div class="texto-ref">${corpoTexto}</div>
      <div class="acoes-ref">
        <button class="botao secundario" id="voltar-ref-fixa">← Voltar</button>
        <button class="botao" id="ir-ref-fixa">Ir para ${nomeCurto} ${capLocal}</button>
      </div>`;

    // Voltar contrai o painel de volta à altura normal e mostra a lista
    document.getElementById('voltar-ref-fixa').onclick = () => {
      painel.classList.remove('alto');
      this.atualizarRefsFixas(this.destaque);
    };
    document.getElementById('ir-ref-fixa').onclick = () =>
      this.pularParaReferencia(code, capLocal, vIni);
  },

  abrirTirinha(vers) {
    this.destaque = vers;
    this.abaTirinha = 'versoes';
    document.querySelectorAll('.v.foco').forEach(x => x.classList.remove('foco'));
    document.querySelectorAll(`#folha .v[data-vers="${vers}"]`)
      .forEach(x => x.classList.add('foco'));
    this.mostrarAbaTirinha('versoes');
    this.sincronizarBotaoFixarTirinha();
    const t = document.getElementById('tirinha');
    t.classList.add('aberta');
    t.setAttribute('aria-hidden', 'false');
  },

  mostrarAbaTirinha(aba) {
    this.abaTirinha = aba;
    document.querySelectorAll('.aba-tirinha').forEach(el =>
      el.classList.toggle('ativa', el.dataset.aba === aba));
    // "Ações" só vale para o versículo em si (aba Versões);
    // o fixar só faz sentido na aba Referências, que é o que se fixa na tela
    document.getElementById('tirinha-acoes').style.display =
      aba === 'versoes' ? '' : 'none';
    document.getElementById('tirinha-fixar').hidden = aba !== 'refs';
    if (aba === 'refs') this.sincronizarBotaoFixarTirinha();
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

  /* ================================================= Referências cruzadas
   *
   * Tela dedicada: a partir de um versículo (a "raiz"), monta em árvore as
   * passagens relacionadas (Treasury of Scripture Knowledge). O primeiro nível
   * abre junto; o segundo abre ao tocar no ENDEREÇO. Tocar no TEXTO abre o
   * versículo inteiro — um por vez, fechando o anterior. Qualquer nó pode
   * virar nova raiz (botão fixo). Um histórico guarda as raízes visitadas —
   * persistente e limitado a 30 — para o "Voltar" andar etapa por etapa e para
   * a tela retomar a última abertura quando nada estiver selecionado. */

  _RAIZ_PADRAO: { code: 'MAT', cap: 5, vIni: 1, vFim: 1 },
  _LIMITE_HIST_REFS: 30,

  _carregarHistRefs() {
    const h = Guarda.ler('refsHist', []);
    this.refsHist = Array.isArray(h) ? h : [];
  },

  _salvarHistRefs() {
    if (this.refsHist.length > this._LIMITE_HIST_REFS) {
      this.refsHist = this.refsHist.slice(-this._LIMITE_HIST_REFS);
    }
    Guarda.gravar('refsHist', this.refsHist);
  },

  _mesmoNo(a, b) {
    return !!a && !!b && a.code === b.code && a.cap === b.cap
      && a.vIni === b.vIni && (a.vFim || a.vIni) === (b.vFim || b.vIni);
  },

  /* Empilha uma nova raiz no histórico (evitando repetir a do topo) e a torna
   * a raiz atual. É por aqui que passam a abertura, o "tornar raiz" e a troca. */
  _empilharRaizRef(no) {
    const limpo = { code: no.code, cap: no.cap, vIni: no.vIni, vFim: no.vFim || no.vIni };
    const topo = this.refsHist[this.refsHist.length - 1];
    if (this._mesmoNo(topo, limpo)) { this.refsRaiz = topo; return; }
    this.refsHist.push(limpo);
    this.refsRaiz = limpo;
    this._salvarHistRefs();
  },

  abrirReferenciasCruzadas() {
    this._carregarHistRefs();

    // versículo tocado na leitura (o "ponto"); só cai no padrão se não houver
    const ativo = this.pontoAtual || this.destaque;
    if (ativo) {
      let cap = this.cap;
      if (Dados.versificacaoDe(this.versao) === 'vulgata') {
        try { cap = Dados.converter(this.code, this.cap, 'vulgata', 'hebraica').capitulo; } catch {}
      }
      this._empilharRaizRef({ code: this.code, cap, vIni: ativo, vFim: ativo });
    } else if (this.refsHist.length) {
      this.refsRaiz = this.refsHist[this.refsHist.length - 1];   // retoma a última
    } else {
      this._empilharRaizRef(this._RAIZ_PADRAO);                  // 1ª vez: Mateus 5:1
    }

    if (!this.refsFiltro) this.refsFiltro = 'tudo';
    this.refsSelecionado = null;
    this.refsTextoAberto = null;

    document.getElementById('refs-raiz-end').onclick = () => this.abrirTrocaRefs();
    document.getElementById('refs-raiz-amostra').onclick = () => this._tocarTextoRaiz();
    document.getElementById('refs-voltar').onclick = () => this.voltarRaizRefs();
    document.getElementById('refs-tornar-raiz').onclick = () => this.tornarRaizRefs();
    document.getElementById('troca-cancelar').onclick = () => this.fecharTrocaRefs();
    document.getElementById('troca-ok').onclick = () => this.confirmarTrocaRefs();

    this.abrir('painel-refs-cruzadas');
    this._montarFiltroRefs();
    this.desenharArvoreRefs();
  },

  /* Uma versão de numeração protestante para consultar as referências dos
   * filhos: os alvos já vêm nessa numeração, então não se deve reconverter. */
  _versaoProtRefs() {
    if (this._vProtRefs) return this._vProtRefs;
    const lista = Dados.versoes || [];
    const v = lista.find(x => x.versification === 'hebraica');
    this._vProtRefs = v ? v.code : this.versao;
    return this._vProtRefs;
  },

  async _filhosRef(no) {
    const refs = await Dados.referenciasDe(this._versaoProtRefs(), no.code, no.cap, no.vIni);
    return (refs || []).map(r => ({ code: r.code, cap: r.cap, vIni: r.vIni, vFim: r.vFim, votos: r.votos }));
  },

  _testamentoDe(code) {
    const info = Dados.infoLivro(this.versao, code);
    return info ? info.testament : null;
  },

  _passaFiltroRef(no) {
    if (this.refsFiltro === 'tudo') return true;
    const t = this._testamentoDe(no.code);
    if (t == null) return true;            // testamento desconhecido: não esconde
    return t === this.refsFiltro;
  },

  _rotuloRef(no) {
    const nome = Dados.nomeCurto(this.versao, no.code);
    const ate = no.vFim && no.vFim !== no.vIni ? `-${no.vFim}` : '';
    return `${nome} ${no.cap}:${no.vIni}${ate}`;
  },

  _montarFiltroRefs() {
    const cont = document.getElementById('refs-filtro');
    let testamentos = [];
    try { testamentos = Dados.arvore(this.versao).testaments || []; } catch {}
    const curto = nome => {
      if (/antigo/i.test(nome)) return 'Antigo T.';
      if (/novo/i.test(nome)) return 'Novo T.';
      return nome;
    };
    const opcoes = [{ id: 'tudo', nome: 'Bíblia toda' }]
      .concat(testamentos.map(t => ({ id: t.id, nome: curto(t.name || t.id) })));
    cont.innerHTML = opcoes.map(o =>
      `<button class="refs-filtro-bt${o.id === this.refsFiltro ? ' ativo' : ''}" data-f="${o.id}">${o.nome}</button>`).join('');
    cont.querySelectorAll('[data-f]').forEach(el => {
      el.onclick = () => {
        this.refsFiltro = el.dataset.f;
        cont.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('ativo', b.dataset.f === this.refsFiltro));
        this.refsSelecionado = null;
        this.refsTextoAberto = null;
        this.desenharArvoreRefs();
      };
    });
  },

  _pintarRaizRef() {
    const end = document.getElementById('refs-raiz-end');
    const am = document.getElementById('refs-raiz-amostra');
    end.textContent = this._rotuloRef(this.refsRaiz);
    am.dataset.trecho = `${this.refsRaiz.code}|${this.refsRaiz.cap}|${this.refsRaiz.vIni}`;
    am.dataset.pronto = '';
    am.classList.remove('aberto');
    am.textContent = '…';
    this._preencherAmostrasRef(document.getElementById('refs-raiz'));
  },

  async desenharArvoreRefs() {
    this.refsTextoAberto = null;   // a árvore é remontada; nada fica aberto
    this._pintarRaizRef();
    this._refsSeq = 0;
    this._refsNos = {};
    this._atualizarBotoesRefs();

    const corpo = document.getElementById('corpo-refs');
    corpo.innerHTML = '<div class="estado">Buscando referências…</div>';

    const filhos = (await this._filhosRef(this.refsRaiz)).filter(n => this._passaFiltroRef(n));
    if (!filhos.length) {
      corpo.innerHTML = `<div class="estado">Sem referências cruzadas para
        <strong>${Leitura.escapar(this._rotuloRef(this.refsRaiz))}</strong> neste filtro.
        <br><span class="sub">Elas vêm do Treasury of Scripture Knowledge; nem todo
        versículo tem.</span></div>`;
      return;
    }

    const html = filhos.map(n => this._noRefHTML(n, 1)).join('');
    corpo.innerHTML = `<div class="arv">${html}</div>`;
    this._ligarNosRef(corpo);
    this._preencherAmostrasRef(corpo);
  },

  /* Monta o HTML de um nó. A hierarquia (recuo e linhas-guia) é desenhada por
   * CSS a partir do aninhamento real em .arv-filhos — sem caracteres de árvore.
   * Registra o nó num mapa para os toques saberem a que endereço se referem. */
  _noRefHTML(no, nivel) {
    const id = 'n' + (this._refsSeq++);
    this._refsNos[id] = { no, nivel };
    const podeExpandir = nivel < 2;
    const sel = this.refsSelecionado === id ? ' sel' : '';
    return `<div class="arv-no" data-no="${id}">
        <div class="arv-linha">
          <button class="arv-end${sel}${podeExpandir ? ' expansivel' : ''}" data-end="${id}">${Leitura.escapar(this._rotuloRef(no))}</button>
        </div>
        <div class="arv-amostra-linha">
          <button class="arv-amostra" data-texto="${id}"
            data-trecho="${no.code}|${no.cap}|${no.vIni}">…</button>
        </div>
        <div class="arv-filhos" data-filhos="${id}"></div>
      </div>`;
  },

  _ligarNosRef(cont) {
    cont.querySelectorAll('[data-end]').forEach(el => {
      el.onclick = () => this._tocarEnderecoRef(el.dataset.end);
    });
    cont.querySelectorAll('[data-texto]').forEach(el => {
      el.onclick = () => this._tocarTextoRef(el.dataset.texto);
    });
  },

  async _tocarEnderecoRef(id) {
    const reg = this._refsNos[id];
    if (!reg) return;
    this._selecionarRef(id);
    if (reg.nivel >= 2) return;   // dois níveis visíveis; mais fundo é só via "tornar raiz"

    const cont = document.querySelector(`[data-filhos="${id}"]`);
    const endBt = document.querySelector(`[data-end="${id}"]`);
    if (cont.dataset.aberto === '1') {          // recolhe
      cont.innerHTML = '';
      cont.dataset.aberto = '';
      if (endBt) endBt.classList.remove('expandido');
      return;
    }
    cont.innerHTML = '<div class="estado peq">…</div>';
    const filhos = (await this._filhosRef(reg.no)).filter(n => this._passaFiltroRef(n));
    if (!filhos.length) {
      cont.innerHTML = '<div class="arv-vazio">sem referências aqui</div>';
      return;
    }
    cont.innerHTML = filhos.map(n => this._noRefHTML(n, reg.nivel + 1)).join('');
    cont.dataset.aberto = '1';
    if (endBt) endBt.classList.add('expandido');
    this._ligarNosRef(cont);
    this._preencherAmostrasRef(cont);
  },

  /* Fecha o texto que estiver aberto — seja de um nó da árvore, seja o da raiz
   * — restaurando a amostra. Garante o "um texto por vez" nas duas pontas. */
  _fecharTextoRefAberto() {
    const aberto = this.refsTextoAberto;
    if (!aberto) return;
    const bt = aberto === 'raiz'
      ? document.getElementById('refs-raiz-amostra')
      : document.querySelector(`[data-texto="${aberto}"]`);
    if (bt) { bt.classList.remove('aberto'); this._restaurarAmostraRef(bt); }
    this.refsTextoAberto = null;
  },

  /* A bolinha de indicação no fim do trecho: esfera na cor do texto com o sinal
   * (+ fechado, − aberto) na cor do papel — branco no tema claro, escuro no
   * escuro, sempre legível. É só charme visual; não muda a lógica. */
  _bolhaRef(sinal) {
    return `<span class="rc-bolha" data-sinal="${sinal}" aria-hidden="true"></span>`;
  },

  _restaurarAmostraRef(bt) {
    bt.innerHTML = `<span class="rc-amostra-txt">${Leitura.escapar(bt.dataset.amostra || '')}</span>`
      + this._bolhaRef('+');
  },

  async _tocarTextoRef(id) {
    const reg = this._refsNos[id];
    if (!reg) return;
    this._selecionarRef(id);
    if (this.refsTextoAberto === id) { this._fecharTextoRefAberto(); return; }
    this._fecharTextoRefAberto();          // fecha qualquer outro (nó ou raiz)
    const bt = document.querySelector(`[data-texto="${id}"]`);
    bt.classList.add('aberto');
    bt.textContent = 'abrindo…';
    bt.innerHTML = (await this._textoCompletoRef(reg.no)) + this._bolhaRef('−');
    this.refsTextoAberto = id;
  },

  /* Toque no trecho da RAIZ: abre/fecha o texto inteiro dela, respeitando o
   * mesmo "um por vez" da árvore. Não seleciona (a raiz já é a raiz). */
  async _tocarTextoRaiz() {
    const bt = document.getElementById('refs-raiz-amostra');
    if (this.refsTextoAberto === 'raiz') { this._fecharTextoRefAberto(); return; }
    this._fecharTextoRefAberto();
    bt.classList.add('aberto');
    bt.textContent = 'abrindo…';
    bt.innerHTML = (await this._textoCompletoRef(this.refsRaiz)) + this._bolhaRef('−');
    this.refsTextoAberto = 'raiz';
  },

  async _textoCompletoRef(no) {
    let capLocal = no.cap;
    if (Dados.versificacaoDe(this.versao) === 'vulgata') {
      try { capLocal = Dados.converter(no.code, no.cap, 'hebraica', 'vulgata').capitulo; } catch {}
    }
    try {
      const r = await Dados.capitulo(this.versao, no.code, capLocal);
      if (!r) return '<em>Texto não disponível nesta versão.</em>';
      const vFim = no.vFim || no.vIni;
      const versos = r.capitulo.verses.filter(v => v.number >= no.vIni && v.number <= vFim);
      if (!versos.length) return '<em>Texto não disponível.</em>';
      return versos.map(v => `<span class="rc-vn">${v.number}</span>${Leitura.escapar(v.text || '')}`).join(' ');
    } catch { return '<em>Texto não disponível nesta versão.</em>'; }
  },

  /* Busca o começo do texto de cada amostra e preenche as linhas. Agrupa por
   * capítulo para não recarregar o mesmo várias vezes. Guarda a amostra em
   * data-amostra para restaurar quando o texto completo for fechado. */
  async _preencherAmostrasRef(cont) {
    const alvos = [...cont.querySelectorAll('[data-trecho]')].filter(el => !el.dataset.pronto);
    const porCap = new Map();
    for (const el of alvos) {
      const [code, cap] = el.dataset.trecho.split('|');
      const chave = code + '|' + cap;
      if (!porCap.has(chave)) porCap.set(chave, []);
      porCap.get(chave).push(el);
    }
    for (const [chave, els] of porCap) {
      const [code, capProt] = chave.split('|');
      let capLocal = +capProt;
      if (Dados.versificacaoDe(this.versao) === 'vulgata') {
        try { capLocal = Dados.converter(code, +capProt, 'hebraica', 'vulgata').capitulo; } catch {}
      }
      try {
        const r = await Dados.capitulo(this.versao, code, capLocal);
        for (const el of els) {
          el.dataset.pronto = '1';
          if (!r) { el.textContent = ''; continue; }
          const vers = +el.dataset.trecho.split('|')[2];
          const v = r.capitulo.verses.find(x => x.number === vers);
          const t = v && v.text ? v.text : '';
          const base = t ? (t.length > 80 ? t.slice(0, 80).trim() : t) : '';
          el.dataset.amostra = base;
          el.innerHTML = `<span class="rc-amostra-txt">${Leitura.escapar(base)}</span>`
            + this._bolhaRef('+');
        }
      } catch { els.forEach(el => { el.dataset.pronto = '1'; el.textContent = ''; }); }
    }
  },

  _selecionarRef(id) {
    if (this.refsSelecionado && this.refsSelecionado !== id) {
      const antes = document.querySelector(`[data-end="${this.refsSelecionado}"]`);
      if (antes) antes.classList.remove('sel');
    }
    this.refsSelecionado = id;
    const bt = document.querySelector(`[data-end="${id}"]`);
    if (bt) bt.classList.add('sel');
    this._atualizarBotoesRefs();
  },

  _atualizarBotoesRefs() {
    const bTornar = document.getElementById('refs-tornar-raiz');
    const bVoltar = document.getElementById('refs-voltar');
    const alvoTornar = document.getElementById('refs-tornar-alvo');
    const alvoVoltar = document.getElementById('refs-voltar-alvo');
    const reg = this.refsSelecionado ? this._refsNos[this.refsSelecionado] : null;

    if (bTornar) bTornar.disabled = !reg;
    if (alvoTornar) alvoTornar.textContent = reg ? this._rotuloRef(reg.no) : '';

    // "Voltar" anda pelo histórico; a 2ª linha antecipa para onde vai
    const anterior = (this.refsHist && this.refsHist.length > 1)
      ? this.refsHist[this.refsHist.length - 2] : null;
    if (bVoltar) bVoltar.disabled = !anterior;
    if (alvoVoltar) alvoVoltar.textContent = anterior ? this._rotuloRef(anterior) : '';
  },

  tornarRaizRefs() {
    const reg = this.refsSelecionado ? this._refsNos[this.refsSelecionado] : null;
    if (!reg) return;
    this._empilharRaizRef(reg.no);
    this.refsSelecionado = null;
    this.desenharArvoreRefs();
  },

  voltarRaizRefs() {
    if (!this.refsHist || this.refsHist.length <= 1) return;
    this.refsHist.pop();
    this._salvarHistRefs();
    this.refsRaiz = this.refsHist[this.refsHist.length - 1];
    this.refsSelecionado = null;
    this.desenharArvoreRefs();
  },

  /* -------- janela de troca (Livro / Capítulo / Versículo em cascata) -------- */

  async _livrosComRef() {
    if (this._refsLivros) return this._refsLivros;
    let ordem = [];
    try { ordem = Dados.arvore(this.versao).reading_order || []; } catch {}
    const tem = new Set();
    await Promise.all(ordem.map(async code => {
      const d = await Dados.carregarRefs(code);
      if (d && Object.keys(d).length) tem.add(code);
    }));
    this._refsLivros = ordem.filter(c => tem.has(c))
      .map(code => ({ code, nome: Dados.nomeCurto(this.versao, code) }));
    return this._refsLivros;
  },

  async _capitulosComRef(code) {
    const d = await Dados.carregarRefs(code);
    if (!d) return [];
    return Object.keys(d)
      .filter(cap => Object.values(d[cap]).some(a => Array.isArray(a) && a.length))
      .map(Number).sort((a, b) => a - b);
  },

  async _versiculosComRef(code, cap) {
    const d = await Dados.carregarRefs(code);
    const doCap = d && d[String(cap)];
    if (!doCap) return [];
    return Object.keys(doCap)
      .filter(v => { const a = doCap[v]; return Array.isArray(a) && a.length; })
      .map(Number).sort((a, b) => a - b);
  },

  async abrirTrocaRefs() {
    const veu = document.getElementById('refs-troca-veu');
    veu.classList.add('aberto');
    veu.setAttribute('aria-hidden', 'false');

    const selL = document.getElementById('troca-livro');
    const livros = await this._livrosComRef();
    selL.innerHTML = '<option value="">Livro…</option>' +
      livros.map(l => `<option value="${l.code}">${Leitura.escapar(l.nome)}</option>`).join('');
    selL.onchange = () => this._cascataCapRef(selL.value);

    selL.value = this.refsRaiz.code;
    if (selL.value) await this._cascataCapRef(selL.value, this.refsRaiz.cap, this.refsRaiz.vIni);
    else { this._cascataCapRef(''); }
  },

  async _cascataCapRef(code, capSel, versSel) {
    const selC = document.getElementById('troca-cap');
    const selV = document.getElementById('troca-vers');
    const caps = code ? await this._capitulosComRef(code) : [];
    selC.innerHTML = '<option value="">Capítulo…</option>' +
      caps.map(c => `<option value="${c}">${c}</option>`).join('');
    selC.disabled = !caps.length;
    selC.onchange = () => this._cascataVersRef(code, +selC.value);
    selV.innerHTML = '<option value="">Versículo…</option>';
    selV.disabled = true;
    if (capSel && caps.includes(+capSel)) {
      selC.value = String(capSel);
      await this._cascataVersRef(code, +capSel, versSel);
    }
  },

  async _cascataVersRef(code, cap, versSel) {
    const selV = document.getElementById('troca-vers');
    const vs = (code && cap) ? await this._versiculosComRef(code, cap) : [];
    selV.innerHTML = '<option value="">Versículo…</option>' +
      vs.map(v => `<option value="${v}">${v}</option>`).join('');
    selV.disabled = !vs.length;
    if (versSel && vs.includes(+versSel)) selV.value = String(versSel);
  },

  confirmarTrocaRefs() {
    const code = document.getElementById('troca-livro').value;
    const cap = +document.getElementById('troca-cap').value;
    const vers = +document.getElementById('troca-vers').value;
    if (!code || !cap || !vers) { this.fecharTrocaRefs(); return; }
    this._empilharRaizRef({ code, cap, vIni: vers, vFim: vers });
    this.refsSelecionado = null;
    this.fecharTrocaRefs();
    this.desenharArvoreRefs();
  },

  fecharTrocaRefs() {
    const veu = document.getElementById('refs-troca-veu');
    veu.classList.remove('aberto');
    veu.setAttribute('aria-hidden', 'true');
  },

  /* O botão "Ações" da tirinha reaproveita a MESMA barra de ações que aparece
   * quando a pessoa seleciona um trecho no texto (Copiar, Compartilhar, Salvar
   * estudo, Anotar, Marcar). Para isso, seleciona o versículo inteiro no texto
   * e deixa a barra de sempre surgir — nada novo é criado. */
  abrirAcoesTirinha() {
    const vers = this.destaque;
    const el = document.querySelector(`#folha .v[data-vers="${vers}"]`);
    this.fecharTirinha();
    if (!el) return;

    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);

    this.mostrarBarraSelecao();
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
