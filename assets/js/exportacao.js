/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* exportacao.js — Exporta estudos, anotações, listas e marcadores como JSON.
 *
 * Formato de exportação: Bundle JSON com:
 * - Metadados (versão, criado, criador)
 * - Grupos (livremente organizados pelo usuário)
 * - Cada grupo com: marcadores, anotações, listas, estudos
 * - Assinatura digital (hash do perfil)
 * - Permissão de importação (qual modo usar)
 */

const Exportacao = {
  VERSAO_FORMATO: '1.0',

  /* ================================================== Criar Bundle Vazio */
  criarGrupo(nome = '', descricao = '') {
    return {
      id: 'g' + Date.now(),
      nome: nome.trim(),
      descricao: descricao.trim(),
      marcadores: [],
      anotacoes: [],
      listas: [],
      estudos: [],
    };
  },

  /* ================================================== Exportar Tudo */
  exportarTudo(nomeGrupo = 'Meu Conteúdo', modo = 'somente-leitura') {
    const perfil = Perfil.todos();
    const criado = new Date().toISOString();
    const assinatura = Perfil.criarAssinatura(perfil, criado);

    const grupo = this.criarGrupo(nomeGrupo);

    // Adiciona tudo ao grupo
    grupo.marcadores = this.coletarMarcadores();
    grupo.anotacoes = this.coletarAnotacoes();
    grupo.listas = this.coletarListas();
    grupo.estudos = this.coletarEstudos();

    return this.montarBundle(perfil, [grupo], assinatura, criado, modo);
  },

  /* ================================================== Exportar Seletivo */
  exportarSeletivo(grupos = [], modo = 'somente-leitura') {
    if (!Array.isArray(grupos) || grupos.length === 0) {
      throw new Error('Nenhum grupo selecionado para exportação');
    }

    const perfil = Perfil.todos();
    const criado = new Date().toISOString();
    const assinatura = Perfil.criarAssinatura(perfil, criado);

    return this.montarBundle(perfil, grupos, assinatura, criado, modo);
  },

  /* ================================================== Exportar Item Único */
  exportarItem(tipo, id, modo = 'somente-leitura') {
    const perfil = Perfil.todos();
    const criado = new Date().toISOString();
    const assinatura = Perfil.criarAssinatura(perfil, criado);

    const grupo = this.criarGrupo(`${tipo} compartilhado`, `Um ${tipo} único`);

    // Busca o item específico
    switch (tipo) {
      case 'anotacao':
        const anotacao = Anotacoes.achar(id);
        if (anotacao) grupo.anotacoes = [anotacao];
        break;
      case 'lista':
        const lista = Listas.achar(id);
        if (lista) grupo.listas = [lista];
        break;
      case 'estudo':
        const estudo = Estudos.achar(id);
        if (estudo) grupo.estudos = [estudo];
        break;
    }

    return this.montarBundle(perfil, [grupo], assinatura, criado, modo);
  },

  /* ================================================== Montar Bundle */
  montarBundle(perfil, grupos, assinatura, criado, modo = 'somente-leitura') {
    return {
      versao: this.VERSAO_FORMATO,
      criador: {
        nome: perfil.nome,
        local: perfil.local || '',
        religiao: perfil.religiao,
        denominacao: perfil.denominacao,
        vertentes: perfil.vertentes || [],
        proposito: perfil.proposito || '',
        contatos: perfil.contatos,
        foto: perfil.foto || null,
        criado,
      },
      assinatura,
      permissao: modo, // Modo de permissão definido pelo DONO ao exportar
      appVersao: '1.0', // Versão da app (incrementa quando formato muda)
      grupos: grupos || [],
    };
  },

  /* ================================================== Coletar Dados */
  coletarMarcadores() {
    const marcadores = Marcadores.marcados();
    const saida = [];

    for (const chave of Object.keys(marcadores)) {
      const [versificacao, code, cap, vers] = chave.split('|');
      for (const faixa of Marcadores.normalizar(marcadores[chave])) {
        saida.push({
          versificacao,
          code,
          cap: +cap,
          vers: +vers,
          marcador: faixa.m,
          inicio: faixa.i,
          fim: faixa.f,
        });
      }
    }

    return saida;
  },

  coletarAnotacoes() {
    return Anotacoes.todas();
  },

  coletarListas() {
    return Listas.todos();
  },

  coletarEstudos() {
    return Estudos.todos();
  },

  /* ================================================== Salvar em Arquivo */
  salvarArquivo(bundle, nomeArquivo = null) {
    if (!nomeArquivo) {
      const data = new Date().toISOString().slice(0, 10);
      nomeArquivo = `biblia-${data}.json`;
    }

    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    link.click();

    URL.revokeObjectURL(url);
  },

  /* ================================================== Validar Bundle */
  validar(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      return { valido: false, erro: 'Arquivo não é um objeto JSON válido' };
    }

    if (bundle.versao !== this.VERSAO_FORMATO) {
      return { valido: false, erro: `Versão incompatível: ${bundle.versao} (esperado ${this.VERSAO_FORMATO})` };
    }

    if (!bundle.criador || typeof bundle.criador !== 'object') {
      return { valido: false, erro: 'Falta criador no arquivo' };
    }

    if (!Array.isArray(bundle.grupos)) {
      return { valido: false, erro: 'Falta grupos no arquivo' };
    }

    // Valida assinatura
    const perfil = bundle.criador;
    const assinaturaValida = Perfil.validarAssinatura(perfil, bundle.assinatura);

    return {
      valido: true,
      assinaturaValida,
      criador: bundle.criador.nome || 'Anônimo',
      gruposCount: bundle.grupos.length,
      totalItens: bundle.grupos.reduce((sum, g) => {
        return sum + (g.anotacoes?.length || 0) + (g.listas?.length || 0) +
               (g.estudos?.length || 0) + (g.marcadores?.length || 0);
      }, 0),
    };
  },
};
