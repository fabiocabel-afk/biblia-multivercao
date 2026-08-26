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

  /* ================================================== Regras por tipo de contato
   * Cada rede social tem um formato próprio:
   *  - username: começa com @, só letras/números/ponto/underscore, sem espaço
   *    (Instagram, Facebook, TikTok)
   *  - telefone: número BR formatado (DD) XXXXX-XXXX
   *  - telOuLink: aceita telefone OU um link (Telegram, WhatsApp)
   *  - email: padrão nome@servidor.com
   * O prefixo "@" só aparece nos usernames; os demais não levam @. */
  REGRAS_CONTATO: {
    Instagram: { modo: 'username', prefixo: '@', placeholder: 'usuario' },
    Facebook:  { modo: 'username', prefixo: '@', placeholder: 'usuario' },
    TikTok:    { modo: 'username', prefixo: '@', placeholder: 'usuario' },
    Telegram:  { modo: 'telOuLink', prefixo: '', placeholder: 'telefone ou link' },
    WhatsApp:  { modo: 'telOuLink', prefixo: '', placeholder: 'telefone ou link' },
    Telefone:  { modo: 'telefone', prefixo: '', placeholder: '(00) 00000-0000' },
    Email:     { modo: 'email', prefixo: '', placeholder: 'nome@servidor.com' },
  },

  regraContato(tipo) {
    return this.REGRAS_CONTATO[tipo] || { modo: 'texto', prefixo: '', placeholder: '' };
  },

  /* Tira @ do começo e espaços; deixa só o que vale num @usuário. */
  limparUsuario(v) {
    return (v || '').trim().replace(/^@+/, '').replace(/\s+/g, '');
  },

  /* Formata um telefone BR: (DD) XXXXX-XXXX (11 díg.) ou (DD) XXXX-XXXX (10). */
  formatarTelefone(bruto) {
    const d = (bruto || '').replace(/\D/g, '').slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },

  /* Heurística: o texto parece um link? (http, www, ou domínio com barra/ponto) */
  pareceLink(v) {
    const s = (v || '').trim();
    if (!s) return false;
    return /^(https?:\/\/|www\.)/i.test(s) || /\b[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(s) || /(t\.me|wa\.me)/i.test(s);
  },

  /* Valida um contato. Valor vazio é considerado OK (não obriga preencher).
   * Devolve { ok, msg } — msg vazio quando ok. */
  validarContato(tipo, valor) {
    const v = (valor || '').trim();
    if (!v) return { ok: true, msg: '' };
    const regra = this.regraContato(tipo);

    switch (regra.modo) {
      case 'username': {
        // Remove só o @ do início; espaço no meio deve ser sinalizado como inválido
        const u = v.replace(/^@+/, '');
        if (!u) return { ok: false, msg: 'Informe o usuário (sem @).' };
        return /^[a-zA-Z0-9._]+$/.test(u)
          ? { ok: true, msg: '' }
          : { ok: false, msg: 'Use letras, números, ponto ou _ (sem espaços).' };
      }
      case 'telefone': {
        const d = v.replace(/\D/g, '');
        return (d.length === 10 || d.length === 11)
          ? { ok: true, msg: '' }
          : { ok: false, msg: 'Telefone: DDD + número, ex. (11) 91234-5678.' };
      }
      case 'telOuLink': {
        if (this.pareceLink(v)) {
          // link plausível: precisa ter um ponto de domínio
          return /\.[a-z]{2,}/i.test(v) ? { ok: true, msg: '' }
            : { ok: false, msg: 'Link inválido.' };
        }
        const d = v.replace(/\D/g, '');
        return (d.length === 10 || d.length === 11)
          ? { ok: true, msg: '' }
          : { ok: false, msg: 'Informe um telefone (com DDD) ou um link.' };
      }
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
          ? { ok: true, msg: '' }
          : { ok: false, msg: 'E-mail inválido (ex. nome@servidor.com).' };
      default:
        return { ok: true, msg: '' };
    }
  },

  /* Normaliza um valor para salvar conforme o tipo (username sem @, telefone
   * formatado, telOuLink formata se for número, resto como está). */
  normalizarContato(tipo, valor) {
    const v = (valor || '').trim();
    if (!v) return '';
    const regra = this.regraContato(tipo);
    if (regra.modo === 'username') return this.limparUsuario(v);
    if (regra.modo === 'telefone') return this.formatarTelefone(v);
    if (regra.modo === 'telOuLink') {
      // Só formata como telefone se claramente não é um link (sem letras/URL).
      return /[a-zA-Z/:]/.test(v) ? v : this.formatarTelefone(v);
    }
    return v;
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

