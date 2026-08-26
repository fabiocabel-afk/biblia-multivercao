/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* perfil.js — Gerencia o perfil do autor para exportação e compartilhamento.
 *
 * O perfil vincula a autoria ao conteúdo compartilhado, protegendo a propriedade
 * intelectual através de assinatura digital (hash) e permitindo colaboração com
 * crédito. Todos os campos são opcionais; "Anônimo" é o padrão.
 */

const Perfil = {
  CHAVE_PERFIL: 'perfil',
  RELIGIOES: [
    'Cristianismo',
    'Judaísmo',
    'Islamismo',
    'Espiritismo',
    'Hinduísmo',
    'Budismo',
    'Outras',
  ],
  
  // Denominações cristãs (aparecem quando religião = Cristianismo)
  DENOMINACOES_CRISTIANISMO: [
    'Nenhum',
    'Adventista do Sétimo Dia',
    'Anabatista',
    'Anglicano',
    'Batista',
    'Católico Antigo',
    'Católico Ortodoxo',
    'Católico Romano',
    'Ciência Cristã',
    'Evangélico Neopentecostal',
    'Evangélico Pentecostal',
    'Evangélico Tradicional',
    'Hussita',
    'Luterano',
    'Metodista',
    'Mormonismo',
    'Ortodoxo Oriental',
    'Ortodoxo Oriental Antigo',
    'Outra vertente cristã',
    'Presbiteriano',
    'Puritano',
    'Quacre',
    'Reformado',
    'Testemunhas de Jeová',
    'Valdense',
  ],
  
  // Vertentes teológicas (sistema de tags dinâmico, múltipla seleção)
  VERTENTES_TEOLOGICAS: [
    'Calvinismo',
    'Arminianismo',
    'Molinismo',
    'Pelagianismo',
    'Semipelagianismo',
    'Monergismo',
    'Sinergismo',
    'Supralapsarianismo',
    'Infralapsarianismo',
    'Teísmo Aberto',
    'Teologia do Processo',
    'Socinianismo',
    'Amilenismo',
    'Pré-milenismo Histórico',
    'Pré-milenismo Dispensacionalista',
    'Pós-milenismo',
    'Preterismo Total',
    'Preterismo Parcial',
    'Futurismo',
    'Historicismo',
    'Idealismo',
    'Pretribulacionismo',
    'Mesotribulacionismo',
    'Pós-tribulacionismo',
    'Teologia da Aliança',
    'Teologia Dispensacionalista',
    'Cessacionismo',
    'Continuísmo',
    'Imortalidade Condicional',
    'Aniquilacionismo',
    'Universalismo Cristão',
    'Teologia Ortodoxa',
    'Teologia Neo-ortodoxa',
    'Teologia Reformada',
    'Teologia Liberal',
    'Teologia da Libertação',
    'Teologia da Prosperidade',
    'Teologia Progressista',
    'Teologia Queer',
    'Teologia Negra',
    'Teologia Inclusiva',
    'Teologia Natural',
    'Teologia Apofática',
    'Teologia Catafática',
    'Criacionismo da Terra Jovem',
    'Criacionismo da Terra Antiga',
    'Evolucionismo Teísta',
  ],
  
  TIPOS_CONTATO: [
    'Instagram',
    'Facebook',
    'TikTok',
    'Telegram',
    'WhatsApp',
    'Email',
    'Telefone',
  ],

  /* ================================================== Estrutura padrão */
  padrao: {
    nome: 'Anônimo',
    local: '', // ✅ NOVO: Campo separado para Local
    religiao: '',
    denominacao: '',
    vertentes: [], // agora com vertentes teológicas e customizadas
    proposito: '',
    contatos: [],
    foto: null, // base64 da foto de perfil (128x128 JPEG)
  },

  /* ================================================== Carregar perfil */
  todos() {
    const salvo = Guarda.ler(this.CHAVE_PERFIL, null);
    if (!salvo) return { ...this.padrao };

    // Valida e normaliza - com fallback para padrão se faltarem campos
    return {
      nome: (salvo.nome || '').trim() || 'Anônimo',
      local: (salvo.local || '').trim(), // ✅ Garante que existe, mesmo se vazio
      religiao: salvo.religiao || '',
      denominacao: (salvo.denominacao || '').trim(),
      vertentes: Array.isArray(salvo.vertentes) ? salvo.vertentes : [],
      proposito: (salvo.proposito || '').trim(),
      contatos: Array.isArray(salvo.contatos)
        ? salvo.contatos.slice(0, 3).filter(c => c.tipo)
        : [],
      foto: salvo.foto || null,
    };
  },

  /* ================================================== Salvar perfil */
  salvar(dados) {
    const perfil = {
      nome: (dados.nome || '').trim() || 'Anônimo',
      local: (dados.local || '').trim(), // ✅ NOVO: Campo separado para Local
      religiao: dados.religiao || '',
      denominacao: (dados.denominacao || '').trim(),
      vertentes: Array.isArray(dados.vertentes) ? dados.vertentes : [],
      proposito: (dados.proposito || '').trim(),
      contatos: Array.isArray(dados.contatos)
        ? dados.contatos.slice(0, 3).filter(c => c.tipo)  // ✅ Apenas verifica tipo, valor pode estar vazio
        : [],
      foto: dados.foto || null,
    };

    Guarda.gravar(this.CHAVE_PERFIL, perfil);
    return perfil;
  },

  /* ================================================== Adicionar/remover vertentes */
  alternarVertente(vertente) {
    const perfil = this.todos();
    const idx = perfil.vertentes.indexOf(vertente);
    if (idx > -1) {
      perfil.vertentes.splice(idx, 1);
    } else {
      perfil.vertentes.push(vertente);
    }
    this.salvar(perfil);
    return perfil;
  },

  temVertente(vertente) {
    return this.todos().vertentes.includes(vertente);
  },

  /* ================================================== Adicionar contato */
  adicionarContato(tipo, valor) {
    const perfil = this.todos();
    if (perfil.contatos.length >= 3) return false;

    perfil.contatos.push({ tipo, valor });
    this.salvar(perfil);
    return true;
  },

  /* ================================================== Remover contato */
  removerContato(indice) {
    const perfil = this.todos();
    if (indice < 0 || indice >= perfil.contatos.length) return false;

    perfil.contatos.splice(indice, 1);
    this.salvar(perfil);
    return true;
  },

  /* ================================================== Assinatura (Hash)
   *
   * Cria um hash único que identifica o perfil e garante que não foi alterado
   * após a exportação. Combinação de: nome + religião + denominação + timestamp.
   *
   * Não é criptografia de verdade (JavaScript não é seguro para isso), mas é
   * suficiente para detectar modificações acidentais.
   */
  criarAssinatura(perfil = null, timestamp = null) {
    if (!perfil) perfil = this.todos();
    if (!timestamp) timestamp = new Date().toISOString();

    const dados = JSON.stringify({
      nome: perfil.nome,
      religiao: perfil.religiao,
      denominacao: perfil.denominacao,
      vertentes: perfil.vertentes,
      proposito: perfil.proposito,
      criado: timestamp,
    });

    // Hash simples (não é SHA-256, só uma checksum em JS)
    let hash = 0;
    for (let i = 0; i < dados.length; i++) {
      const char = dados.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Converte para 32-bit integer
    }

    // Formata como string hex
    return Math.abs(hash).toString(16).padStart(8, '0');
  },

  /* ================================================== Preview para Exportação
   *
   * Retorna uma visualização do que o perfil mostrará na exportação.
   */
  preview() {
    const perfil = this.todos();
    return {
      autor: perfil.nome,
      religiao: perfil.religiao || null,
      denominacao: perfil.denominacao || null,
      vertentes: perfil.vertentes,
      proposito: perfil.proposito || null,
      contatosCount: perfil.contatos.length,
      contatos: perfil.contatos.map(c => `${c.tipo}: ${c.valor}`),
    };
  },

  /* ================================================== Resetar Perfil */
  resetar() {
    console.log('🔄 RESETANDO PERFIL...');
    Guarda.deletar(this.CHAVE_PERFIL);
    return this.todos(); // Retorna padrao
  },

  /* ================================================== Comparar Perfil
   *
   * Valida se um perfil importado mantém integridade comparando a assinatura.
   */
  validarAssinatura(perfil, assinaturaEsperada) {
    const assinaturaPossível = this.criarAssinatura(perfil, perfil.criado);
    return assinaturaPossível === assinaturaEsperada;
  },

  /* Impressão digital de IDENTIDADE (estável, sem timestamp).
   * Diferente da assinatura de integridade — esta serve só para dizer se dois
   * perfis são "a mesma pessoa". Não inclui `criado`, então não muda entre
   * exportações. Combina nome + religião + denominação + contatos. */
  identidade(perfil = null) {
    if (!perfil) perfil = this.todos();
    const dados = JSON.stringify({
      nome: (perfil.nome || '').trim(),
      religiao: perfil.religiao || '',
      denominacao: (perfil.denominacao || '').trim(),
      contatos: (perfil.contatos || []).map(c => `${c.tipo}:${c.valor}`).sort(),
    });
    let hash = 0;
    for (let i = 0; i < dados.length; i++) {
      const char = dados.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  },

  /* ================================================== Detectar Autoria própria
   *
   * Compara um "criador" vindo de um arquivo importado com o perfil ATUAL do
   * usuário. Retorna true se for a mesma pessoa.
   *
   * Nome sozinho não basta (nomes se repetem); a impressão de identidade
   * (nome + religião + denominação + contatos) desambigua. Assim, conteúdo
   * próprio pode ser editado livremente ao voltar, enquanto conteúdo de
   * terceiros respeita a permissão definida pelo dono.
   */
  ehOMesmoAutor(criador) {
    if (!criador) return false;
    const meu = this.todos();

    // Nome precisa bater
    const mesmoNome = (criador.nome || '').trim() === (meu.nome || '').trim();
    if (!mesmoNome) return false;

    // E a identidade completa também
    return this.identidade(criador) === this.identidade(meu);
  },
};

