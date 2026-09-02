/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* importacao.js — Importa bundles JSON de conteúdo compartilhado.
 *
 * Validações:
 * - Formato e versão
 * - Integridade (assinatura/hash)
 * - Autoria (rastreabilidade)
 *
 * Permissões:
 * 1. Somente leitura (padrão, seguro)
 * 2. Edição com crédito (colaboração)
 * 3. Assumir como seu (apropriação transparente)
 */

const Importacao = {
  MODO_LEITURA: 'somente-leitura',
  MODO_CREDITO: 'edicao-com-credito',
  MODO_ASSUMIR: 'assumir-como-seu',

  MODOS: [
    {
      id: 'somente-leitura',
      nome: 'Somente leitura',
      descricao: 'Ver conteúdo, sem editar. Autor original permanece.',
      icon: '👁️',
    },
    {
      id: 'edicao-com-credito',
      nome: 'Edição com crédito',
      descricao: 'Editar e colaborar, mas mantém autor original no histórico.',
      icon: '✏️',
    },
    {
      id: 'assumir-como-seu',
      nome: 'Assumir como seu',
      descricao: 'Muda o autor para você, mas mantém "Baseado em: original".',
      icon: '✓',
    },
  ],

  /* ================================================== Carregar Arquivo */
  async carregarArquivo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          resolve(json);
        } catch (err) {
          reject(new Error(`Erro ao ler JSON: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file);
    });
  },

  /* ================================================== Validar Bundle */
  validarBundle(bundle) {
    const validacao = Exportacao.validar(bundle);
    if (!validacao.valido) {
      return { ok: false, erro: validacao.erro };
    }

    return {
      ok: true,
      criador: bundle.criador,
      assinaturaValida: validacao.assinaturaValida,
      gruposCount: validacao.gruposCount,
      totalItens: validacao.totalItens,
    };
  },

  /* ================================================== Preparar Importação */
  prepararImportacao(bundle, modo = this.MODO_LEITURA) {
    const validacao = this.validarBundle(bundle);
    if (!validacao.ok) return validacao;

    const criador = bundle.criador;
    const perfilAtual = Perfil.todos();

    return {
      ok: true,
      modo,
      criador: {
        original: criador.nome,
        religiao: criador.religiao,
        denominacao: criador.denominacao,
        contatos: criador.contatos,
      },
      autor: modo === this.MODO_ASSUMIR ? perfilAtual.nome : criador.nome,
      baseadoEm: modo === this.MODO_ASSUMIR ? criador.nome : null,
      grupos: bundle.grupos.map(g => ({
        id: g.id,
        nome: g.nome,
        descricao: g.descricao,
        anotacoesCount: g.anotacoes?.length || 0,
        listasCount: g.listas?.length || 0,
        estudosCount: g.estudos?.length || 0,
        marcadoresCount: g.marcadores?.length || 0,
      })),
    };
  },

  /* ================================================== Ler Modo do Bundle */
  // O modo de permissão é definido pelo DONO na exportação e vem gravado no
  // bundle. O receptor não escolhe — apenas é informado.
  modoDoBundle(bundle) {
    return bundle && bundle.permissao ? bundle.permissao : this.MODO_LEITURA;
  },

  /* ================================================== Aplicar Importação
   * selecao (opcional): objeto que diz quais itens importar, no formato:
   *   { [grupoId]: { anotacoes:[i,...], listas:[i,...], estudos:[i,...], marcadores:[i,...] } }
   * onde cada array contém os ÍNDICES dos itens escolhidos naquele tipo.
   * Se selecao for null/undefined, importa TUDO. */
  aplicarImportacao(bundle, grupos, selecao = null) {
    const validacao = this.validarBundle(bundle);
    if (!validacao.ok) {
      return { sucesso: false, erro: validacao.erro };
    }

    // Modo vem do BUNDLE (definido pelo dono), não do receptor
    const modo = this.modoDoBundle(bundle);
    const criador = bundle.criador;

    // AUTORIA: se o arquivo é do próprio usuário, o conteúdo volta a ser dele —
    // sem marca de autor e sem bloqueio. Se for de outra pessoa, guardamos o
    // perfil do autor e aplicamos a permissão que o dono definiu.
    const souEuMesmo = Perfil.ehOMesmoAutor(criador);

    // Perfil compacto do autor que fica preso a cada item de terceiros
    // (para exibir o nome e abrir o popup do perfil ao clicar).
    const autorPerfil = souEuMesmo ? null : {
      nome: criador.nome || 'Anônimo',
      local: criador.local || '',
      religiao: criador.religiao || '',
      denominacao: criador.denominacao || '',
      vertentes: criador.vertentes || [],
      proposito: criador.proposito || '',
      contatos: criador.contatos || [],
      foto: criador.foto || null,
    };

    // Decide os metadados de autoria/bloqueio de um item conforme o cenário.
    const marcarAutoria = (item) => {
      if (souEuMesmo) return item; // conteúdo próprio: sem marcas, editável
      item.autor = autorPerfil;               // perfil completo do autor
      item.autorNome = autorPerfil.nome;       // atalho para exibição
      item.importadoEm = new Date().toISOString();
      if (modo === this.MODO_ASSUMIR) {
        // "Assumir como seu": passa a ser editável, mas registra a origem
        item.baseadoEm = autorPerfil.nome;
        item.somenteLeitura = false;
      } else if (modo === this.MODO_CREDITO) {
        // "Edição com crédito": editável, mantém autor no crédito
        item.somenteLeitura = false;
      } else {
        // "Somente leitura": bloqueia edição de verdade
        item.somenteLeitura = true;
      }
      return item;
    };

    let contador = 0;

    // DESDUPLICAÇÃO DE NOME: quando um item importado tem nome que já existe,
    // acrescenta " (2)", " (3)"... Considera tanto os nomes já salvos quanto os
    // que estão sendo importados neste mesmo lote. `usados` é um Set vivo por tipo.
    const nomeUnico = (nomeBase, usados) => {
      const base = (nomeBase || '').trim() || 'Sem nome';
      if (!usados.has(base)) {
        usados.add(base);
        return base;
      }
      // Se a base já tem sufixo "(n)", remove antes de renumerar
      const semSufixo = base.replace(/\s*\(\d+\)\s*$/, '');
      let n = 2;
      let candidato = `${semSufixo} (${n})`;
      while (usados.has(candidato)) {
        n++;
        candidato = `${semSufixo} (${n})`;
      }
      usados.add(candidato);
      return candidato;
    };

    // Conjuntos de nomes já em uso (preenchidos com o que já existe no app)
    const nomesListas = new Set(Listas.todos().map(l => (l.nome || '').trim()).filter(Boolean));
    const nomesEstudos = new Set(Estudos.todos().map(e => (e.nome || '').trim()).filter(Boolean));

    const querImportar = (grupoId, tipo, indice) => {
      if (!selecao) return true;
      const g = selecao[grupoId];
      if (!g || !Array.isArray(g[tipo])) return false;
      return g[tipo].includes(indice);
    };

    try {
      for (const grupoId of grupos) {
        const grupo = bundle.grupos.find(g => g.id === grupoId);
        if (!grupo) continue;

        // Importar anotações
        if (Array.isArray(grupo.anotacoes)) {
          const lista = Anotacoes.todas();
          let alguma = false;
          grupo.anotacoes.forEach((anotacao, idx) => {
            if (!querImportar(grupoId, 'anotacoes', idx)) return;
            const agora = new Date().toISOString();
            const nova = marcarAutoria({
              id: 'a' + Date.now() + Math.random().toString(36).slice(2),
              versificacao: anotacao.versificacao,
              code: anotacao.code,
              cap: anotacao.cap,
              vers: anotacao.vers,
              versiculos: Array.isArray(anotacao.versiculos) ? anotacao.versiculos : [anotacao.vers],
              versao: anotacao.versao || '',
              corpo: Anotacoes.limpar ? Anotacoes.limpar(anotacao.corpo) : anotacao.corpo,
              criado: anotacao.criado || agora,
              modificado: agora,
            });
            lista.unshift(nova);
            contador++;
            alguma = true;
          });
          if (alguma) Guarda.gravar('anotacoes', lista);
        }

        // Importar listas
        if (Array.isArray(grupo.listas)) {
          grupo.listas.forEach((lista, idx) => {
            if (!querImportar(grupoId, 'listas', idx)) return;
            const listaSalva = marcarAutoria({
              id: 'lst' + Date.now() + Math.random().toString(36).slice(2),
              nome: nomeUnico(lista.nome, nomesListas),
              trechos: lista.trechos || [],
              criado: lista.criado || new Date().toISOString(),
            });
            Guarda.gravar('listas', [...Listas.todos(), listaSalva]);
            contador++;
          });
        }

        // Importar estudos
        if (Array.isArray(grupo.estudos)) {
          grupo.estudos.forEach((estudo, idx) => {
            if (!querImportar(grupoId, 'estudos', idx)) return;
            const estudoSalvo = marcarAutoria({
              ...estudo,
              id: 'est' + Date.now() + Math.random().toString(36).slice(2),
              nome: nomeUnico(estudo.nome, nomesEstudos),
              criado: estudo.criado || new Date().toISOString(),
            });
            Guarda.gravar('estudos', [...Estudos.todos(), estudoSalvo]);
            contador++;
          });
        }

        // Importar marcadores (marcadores não carregam autoria individual —
        // são apenas realces de cor sobre trechos)
        if (Array.isArray(grupo.marcadores)) {
          const marcados = Marcadores.marcados();
          let algumMarcador = false;
          grupo.marcadores.forEach((marca, idx) => {
            if (!querImportar(grupoId, 'marcadores', idx)) return;
            const chave = `${marca.versificacao}|${marca.code}|${marca.cap}|${marca.vers}`;
            const faixa = { m: marca.marcador, i: marca.inicio, f: marca.fim };
            if (!marcados[chave]) marcados[chave] = [];
            marcados[chave].push(faixa);
            contador++;
            algumMarcador = true;
          });
          if (algumMarcador) Guarda.gravar('marcados', marcados);
        }
      }

      return {
        sucesso: true,
        itemsImportados: contador,
        criadorOriginal: criador.nome,
        modo,
        souEuMesmo,
      };
    } catch (erro) {
      return {
        sucesso: false,
        erro: `Erro ao importar: ${erro.message}`,
        itemsImportados: contador,
      };
    }
  },

  /* ================================================== Descrição do Modo */
  descricaoModo(modo) {
    const desc = this.MODOS.find(m => m.id === modo);
    return desc || this.MODOS[0];
  },
};
