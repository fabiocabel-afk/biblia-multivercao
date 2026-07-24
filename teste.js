/* teste.js — roda em node, fora do navegador, so para conferir a logica.
 * Nao faz parte do app. Uso:  node teste.js
 */
const fs = require('fs');
const path = require('path');

// simula o fetch do navegador lendo do disco
global.fetch = async (url) => ({
  ok: fs.existsSync(path.join(__dirname, url)),
  json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, url), 'utf8')),
});

const codigo = fs.readFileSync(path.join(__dirname, 'assets/js/dados.js'), 'utf8');
eval(codigo + '\nglobal.Dados = Dados; global.normalizar = normalizar;');

let falhas = 0;
function conferir(descricao, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${descricao}` +
    (ok ? '' : `\n         esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`));
}

(async () => {
  await Dados.iniciar();

  console.log('\n== metadados ==');
  conferir('19 versoes carregadas', Dados.versoes.length, 19);
  conferir('Ave-Maria e catolica', Dados.canoneDe('AVEMARIA'), 'catholic');
  conferir('Ave-Maria usa a Vulgata', Dados.versificacaoDe('AVEMARIA'), 'vulgata');
  conferir('ACF usa a hebraica', Dados.versificacaoDe('ACF'), 'hebraica');
  conferir('canone protestante tem 66 livros', Dados.livros('ACF').length, 66);
  conferir('canone catolico tem 73 livros', Dados.livros('AVEMARIA').length, 73);
  conferir('Tobias so existe na catolica', Dados.temLivro('ACF', 'TOB'), false);
  conferir('Tobias existe na Ave-Maria', Dados.temLivro('AVEMARIA', 'TOB'), true);

  console.log('\n== numeracao: Salmos ==');
  const sl = (c, de, para) => Dados.converter('PSA', c, de, para);
  conferir('Sl 23 hebraico -> 22 na Vulgata', sl(23, 'hebraica', 'vulgata').capitulo, 22);
  conferir('Sl 22 Vulgata -> 23 hebraico', sl(22, 'vulgata', 'hebraica').capitulo, 23);
  conferir('Sl 119 hebraico -> 118 na Vulgata', sl(119, 'hebraica', 'vulgata').capitulo, 118);
  conferir('Sl 1 nao muda', sl(1, 'hebraica', 'vulgata').capitulo, 1);
  conferir('Sl 150 nao muda', sl(150, 'hebraica', 'vulgata').capitulo, 150);
  conferir('Sl 10 hebraico cai no 9 da Vulgata (fusao)', sl(10, 'hebraica', 'vulgata').capitulo, 9);
  conferir('e avisa que nao e exato', sl(10, 'hebraica', 'vulgata').exato, false);
  conferir('Sl 23 e conversao exata', sl(23, 'hebraica', 'vulgata').exato, true);

  console.log('\n== numeracao: Joel e Malaquias ==');
  conferir('Jl 3 hebraico -> 4 na Vulgata', Dados.converter('JOL', 3, 'hebraica', 'vulgata').capitulo, 4);
  conferir('Jl 4 Vulgata -> 3 hebraico', Dados.converter('JOL', 4, 'vulgata', 'hebraica').capitulo, 3);
  conferir('Ml 4 hebraico -> 3 na Vulgata', Dados.converter('MAL', 4, 'hebraica', 'vulgata').capitulo, 3);
  conferir('Gn 1 nao tem regra, passa direto', Dados.converter('GEN', 1, 'vulgata', 'hebraica').capitulo, 1);

  console.log('\n== o texto bate mesmo? ==');
  const acf = await Dados.capitulo('ACF', 'PSA', 23);
  const ave = await Dados.capitulo('AVEMARIA', 'PSA', 22);
  const t1 = acf.capitulo.verses[0].text;
  const t2 = ave.capitulo.verses[0].text;
  console.log(`  ACF  Sl 23:1 -> ${t1}`);
  console.log(`  AVE  Sl 22:1 -> ${t2}`);
  conferir('as duas falam de pastor', /pastor/i.test(t1) && /pastor/i.test(t2), true);

  const sl119 = await Dados.capitulo('ACF', 'PSA', 119);
  const sl118 = await Dados.capitulo('AVEMARIA', 'PSA', 118);
  conferir('Sl 119 da ACF tem 176 versiculos', sl119.capitulo.verses.length, 176);
  conferir('Sl 118 da Ave-Maria tem 176 versiculos', sl118.capitulo.verses.length, 176);

  console.log('\n== livros e capitulos ==');
  conferir('Ester na ACF tem 10 capitulos', Dados.infoLivro('ACF', 'EST').chapters, 10);
  conferir('Ester na Ave-Maria tem 16', Dados.infoLivro('AVEMARIA', 'EST').chapters, 16);
  conferir('Daniel na Ave-Maria marca caps extras',
    Dados.infoLivro('AVEMARIA', 'DAN').deutero_sections.chapters, [13, 14]);
  conferir('depois de Malaquias vem Mateus (protestante)',
    Dados.vizinho('ACF', 'MAL', 1), 'MAT');
  conferir('depois de Malaquias vem Tobias (catolico, gaveta no fim do AT)',
    Dados.vizinho('AVEMARIA', 'MAL', 1), 'TOB');
  conferir('depois de Baruc vem Mateus (catolico)',
    Dados.vizinho('AVEMARIA', 'BAR', 1), 'MAT');

  console.log('\n== a lacuna de Josue continua declarada ==');
  const jos = await Dados.capitulo('AVEMARIA', 'JOS', 19);
  const vazios = jos.capitulo.verses.filter(v => !v.text).map(v => v.number);
  conferir('Josue 19 tem 6 versiculos sem texto', vazios, [12, 13, 14, 15, 16, 17]);

  console.log('\n== nomes proprios de cada versao ==');
  console.log(`  ACF chama: ${(await Dados.livro('ACF', 'MAT')).name}`);
  console.log(`  AVE chama: ${(await Dados.livro('AVEMARIA', 'MAT')).name}`);

  console.log(`\n${falhas ? falhas + ' FALHA(S)' : 'tudo passou'}\n`);
  process.exit(falhas ? 1 : 0);
})();
