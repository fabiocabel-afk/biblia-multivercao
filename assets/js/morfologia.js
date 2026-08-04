/* ============================================================ morfologia
 *
 * Traduz os códigos morfológicos do STEPBible (padrão OSHM/Tyndale) para uma
 * forma legível em português. Dois formatos de saída:
 *
 *   compacto(cod)  -> abreviado, para caber embaixo da palavra
 *                     ex.: "HVqp3ms"  -> "v. qal perf. 3ms"
 *   completo(cod)  -> por extenso, para o title (toque longo / hover)
 *                     ex.: "HVqp3ms"  -> "verbo · qal · perfeito · 3ª m. sing."
 *
 * O hebraico/aramaico vem grudado com prefixo de idioma (H.. / A..); o grego
 * vem hifenizado (N-GSM, V-PAI-3S, V-PAP-NSM...). Quando algum pedaço não é
 * reconhecido, ele é mantido cru para o código nunca sumir por completo. */

const MorfologiaCodigo = {

  /* ---------------------------------------------------------- tabelas HE */

  hePos: {
    A: ['adj.', 'adjetivo'], C: ['conj.', 'conjunção'], D: ['adv.', 'advérbio'],
    N: ['subst.', 'substantivo'], P: ['pron.', 'pronome'], R: ['prep.', 'preposição'],
    S: ['suf.', 'sufixo'], T: ['part.', 'partícula'], V: ['v.', 'verbo'],
  },
  heTronco: {
    q: 'qal', N: 'nifal', p: 'piel', P: 'pual', h: 'hifil', H: 'hofal',
    t: 'hitpael', o: 'polel', O: 'polal', r: 'poel', v: 'hitpolel',
  },
  heConjug: {
    p: ['perf.', 'perfeito'], i: ['imperf.', 'imperfeito'],
    w: ['consec.', 'consecutivo (wayyiqtol)'], h: ['coort.', 'coortativo'],
    j: ['juss.', 'jussivo'], v: ['imper.', 'imperativo'],
    a: ['inf. abs.', 'infinitivo absoluto'], c: ['inf. constr.', 'infinitivo construto'],
    r: ['part.', 'particípio'], s: ['part. pass.', 'particípio passivo'],
  },
  heTipoSubst: { c: 'comum', p: 'próprio', g: 'gentílico', x: '' },
  heEstado: { a: ['abs.', 'absoluto'], c: ['constr.', 'construto'], d: ['det.', 'determinado'] },
  heTipoPron: {
    p: 'pessoal', d: 'demonstrativo', i: 'interrogativo', r: 'relativo', f: 'indefinido',
  },
  heTipoPart: {
    a: 'de afirmação', d: 'artigo definido', e: 'de exortação', i: 'interrogativa',
    j: 'interjeição', m: 'demonstrativa', n: 'de negação', o: 'marcador de objeto',
    r: 'relativa',
  },
  heTipoSuf: { p: 'pronominal', d: 'direcional (hê locativo)', h: 'paragógico' },

  /* ---------------------------------------------------------- tabelas GR */

  grPos: {
    V: ['v.', 'verbo'], N: ['subst.', 'substantivo'], T: ['art.', 'artigo'],
    A: ['adj.', 'adjetivo'], P: ['pron.', 'pronome pessoal'],
    R: ['pron. rel.', 'pronome relativo'], D: ['pron. dem.', 'pronome demonstrativo'],
    I: ['pron. interr.', 'pronome interrogativo'], X: ['pron. indef.', 'pronome indefinido'],
    F: ['pron. refl.', 'pronome reflexivo'], S: ['pron. poss.', 'pronome possessivo'],
    K: ['pron. correl.', 'pronome correlativo'], Q: ['pron. correl.', 'pronome correlativo/interrogativo'],
    C: ['pron. recípr.', 'pronome recíproco'],
    CONJ: ['conj.', 'conjunção'], PREP: ['prep.', 'preposição'], ADV: ['adv.', 'advérbio'],
    PRT: ['part.', 'partícula'], COND: ['part. cond.', 'partícula condicional'],
    INJ: ['interj.', 'interjeição'], HEB: ['hebr.', 'palavra hebraica'],
    ARAM: ['aram.', 'palavra aramaica'],
  },
  grTempo: {
    P: ['pres.', 'presente'], I: ['imperf.', 'imperfeito'], F: ['fut.', 'futuro'],
    A: ['aor.', 'aoristo'], X: ['perf.', 'perfeito'], Y: ['m.-q.-perf.', 'mais-que-perfeito'],
  },
  grVoz: {
    A: ['at.', 'ativa'], M: ['méd.', 'média'], P: ['pass.', 'passiva'],
    E: ['méd./pass.', 'média ou passiva'], D: ['méd. dep.', 'média depoente'],
    O: ['pass. dep.', 'passiva depoente'], N: ['méd./pass. dep.', 'média ou passiva depoente'],
  },
  grModo: {
    I: ['ind.', 'indicativo'], S: ['subj.', 'subjuntivo'], O: ['opt.', 'optativo'],
    M: ['imper.', 'imperativo'], N: ['inf.', 'infinitivo'], P: ['part.', 'particípio'],
  },
  grCaso: {
    N: ['nom.', 'nominativo'], G: ['gen.', 'genitivo'], D: ['dat.', 'dativo'],
    A: ['ac.', 'acusativo'], V: ['voc.', 'vocativo'],
  },
  grGenero: { M: ['m.', 'masculino'], F: ['f.', 'feminino'], N: ['n.', 'neutro'] },
  grNumero: { S: ['sing.', 'singular'], P: ['pl.', 'plural'] },
  grSufixo: {
    P: ['próprio', 'nome próprio'], T: ['título', 'usado como título'],
    C: ['comp.', 'comparativo'], S: ['superl.', 'superlativo'],
    N: ['neg.', 'de negação'], I: ['interr.', 'interrogativo'],
    K: ['correl.', 'correlativo'], ABB: ['abrev.', 'abreviação'],
    ATT: ['ático', 'forma ática'],
  },

  /* pessoa/gênero/número comuns aos dois idiomas (letras minúsculas no HE) */
  pgnPessoa: { 1: '1ª', 2: '2ª', 3: '3ª' },
  pgnGenero: { m: 'm.', f: 'f.', c: 'com.', b: 'amb.' },
  pgnNumero: { s: 'sing.', p: 'pl.', d: 'dual' },
  pgnGeneroLongo: { m: 'masculino', f: 'feminino', c: 'comum', b: 'ambos' },
  pgnNumeroLongo: { s: 'singular', p: 'plural', d: 'dual' },

  /* ------------------------------------------------------------- público */

  compacto(codigo) { const r = this.analisar(codigo); return r ? r.curto : null; },
  completo(codigo) { const r = this.analisar(codigo); return r ? r.longo : null; },

  /* Devolve { curto, longo } ou null se não conseguir nem começar. */
  analisar(codigo) {
    if (!codigo || typeof codigo !== 'string') return null;
    const cod = codigo.trim();
    if (!cod) return null;
    try {
      if (cod.includes('-') || /^(V|N|A|T|P|R|D|I|X|F|S|K|Q|C|CONJ|PREP|ADV|PRT|COND|INJ|HEB|ARAM)/.test(cod) && !/^[HA]/.test(cod)) {
        return this.grego(cod);
      }
      if (/^[HA]/.test(cod)) return this.hebraico(cod);
      return this.grego(cod); // último recurso
    } catch (e) {
      return { curto: cod, longo: cod };
    }
  },

  /* ----------------------------------------------------------- hebraico */

  hebraico(cod) {
    const idioma = cod[0];                 // H ou A (aramaico)
    let resto = cod.slice(1);
    const pos = resto[0];
    resto = resto.slice(1);
    const posPar = this.hePos[pos];
    if (!posPar) return { curto: cod, longo: cod };

    const curto = [posPar[0]];
    const longo = [posPar[1] + (idioma === 'A' ? ' (aram.)' : '')];

    if (pos === 'V') {
      const tronco = this.heTronco[resto[0]];
      if (tronco) { curto.push(tronco); longo.push(tronco); resto = resto.slice(1); }
      const conj = this.heConjug[resto[0]];
      if (conj) { curto.push(conj[0]); longo.push(conj[1]); resto = resto.slice(1); }
      this.pgn(resto, curto, longo);
    } else if (pos === 'N') {
      const tipo = this.heTipoSubst[resto[0]];
      if (tipo !== undefined) { if (tipo) longo.push(tipo); resto = resto.slice(1); }
      this.genNumEstado(resto, curto, longo);
    } else if (pos === 'A') {
      resto = resto.slice(1); // tipo do adjetivo (a/c/g/o) — pouco usado no rótulo
      this.genNumEstado(resto, curto, longo);
    } else if (pos === 'P') {
      const tipo = this.heTipoPron[resto[0]];
      if (tipo) { longo.push(tipo); resto = resto.slice(1); }
      this.pgn(resto, curto, longo);
    } else if (pos === 'S') {
      const tipo = this.heTipoSuf[resto[0]];
      if (tipo) { longo.push(tipo); resto = resto.slice(1); }
      this.pgn(resto, curto, longo);
    } else if (pos === 'T') {
      const tipo = this.heTipoPart[resto[0]];
      if (tipo) { longo.push(tipo); resto = resto.slice(1); }
    }
    // conjunção, preposição, advérbio: só o rótulo do POS basta

    return { curto: curto.join(' '), longo: longo.join(' · ') };
  },

  /* pessoa-gênero-número no hebraico, ex. "3ms" -> curto "3ms" / longo "3ª m. sing." */
  pgn(resto, curto, longo) {
    const m = resto.match(/([123])([mfcb])([spd])/);
    if (!m) return;
    curto.push(m[1] + m[2] + m[3]);
    longo.push(`${this.pgnPessoa[m[1]]} ${this.pgnGeneroLongo[m[2]]} ${this.pgnNumeroLongo[m[3]]}`);
  },

  /* gênero-número-estado no hebraico, ex. "msa" -> "m. sing. abs." */
  genNumEstado(resto, curto, longo) {
    const g = this.pgnGenero[resto[0]];
    if (g) { curto.push(g); longo.push(this.pgnGeneroLongo[resto[0]]); resto = resto.slice(1); }
    const n = this.pgnNumero[resto[0]];
    if (n) { curto.push(n); longo.push(this.pgnNumeroLongo[resto[0]]); resto = resto.slice(1); }
    const e = this.heEstado[resto[0]];
    if (e) { curto.push(e[0]); longo.push(e[1]); }
  },

  /* -------------------------------------------------------------- grego */

  grego(cod) {
    const partes = cod.split('-');
    const pos = partes[0];
    const posPar = this.grPos[pos];
    if (!posPar) return { curto: cod, longo: cod };

    const curto = [posPar[0]];
    const longo = [posPar[1]];

    if (pos === 'V') {
      // V-[tempo][voz][modo]-[pessoa+número]  ou  -[caso+número+gênero] (particípio)
      let miolo = partes[1] || '';
      miolo = miolo.replace(/^[0-9]/, '');          // tira o "2"/"3" de 2º aoristo etc.
      const t = this.grTempo[miolo[0]];
      const v = this.grVoz[miolo[1]];
      const md = this.grModo[miolo[2]];
      if (t) { curto.push(t[0]); longo.push(t[1]); }
      if (v) { curto.push(v[0]); longo.push(v[1]); }
      if (md) { curto.push(md[0]); longo.push(md[1]); }
      const cauda = partes[2] || '';
      if (/^[123][SP]$/.test(cauda)) {              // finito: pessoa + número
        curto.push(cauda.toLowerCase());
        longo.push(`${this.pgnPessoa[cauda[0]]} ${this.grNumero[cauda[1]][1]}`);
      } else if (cauda) {                            // particípio: caso+número+gênero
        this.casoNumGen(cauda, curto, longo);
      }
    }
    const comCaso = ['N', 'A', 'T', 'P', 'R', 'D', 'I', 'X', 'F', 'S', 'K', 'Q', 'C'];
    let inicioSufixo;
    if (pos === 'V') {
      inicioSufixo = 3;                       // V-miolo-cauda-[sufixos]
    } else if (comCaso.includes(pos)) {
      this.casoNumGen(partes[1] || '', curto, longo); // caso+número+gênero
      inicioSufixo = 2;
    } else {
      inicioSufixo = 1;                       // ADV, CONJ, PRT... sufixo vem logo
    }

    // sufixos finais (-P próprio, -T título, -C comparativo, -N negação...)
    for (let i = inicioSufixo; i < partes.length; i++) {
      const s = this.grSufixo[partes[i]];
      if (s) { curto.push(s[0]); longo.push(s[1]); }
    }

    return { curto: curto.join(' '), longo: longo.join(' · ') };
  },

  /* caso+número+gênero grego, ex. "GSM" -> "gen. sing. m." / "genitivo singular masculino" */
  casoNumGen(seg, curto, longo) {
    if (!seg) return;
    const c = this.grCaso[seg[0]];
    const n = this.grNumero[seg[1]];
    const g = this.grGenero[seg[2]];
    if (c) { curto.push(c[0]); longo.push(c[1]); }
    if (n) { curto.push(n[0]); longo.push(n[1]); }
    if (g) { curto.push(g[0]); longo.push(g[1]); }
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { MorfologiaCodigo };
