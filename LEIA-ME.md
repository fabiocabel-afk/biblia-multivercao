# O que mudou — segunda leva

Cinco pedidos, todos feitos. A pasta `data` continua intocada.

## Como trocar

Apague `index.html`, `sw.js`, `manifest.json`, `teste.js` e a pasta `assets`
inteira. Copie no lugar os arquivos deste pacote. A pasta `data` fica onde está.

Se o app abrir igual ao de antes, aperte `Ctrl` + `Shift` + `R` uma vez.

**Tem um arquivo novo** — `assets/js/cores.js`. Se você copiar a pasta `assets`
inteira, ele vai junto.

---

## 1. Selecionar trechos, copiar, compartilhar e marcar

Você pediu "igual o selecionar normal do Android", então é a seleção nativa
mesmo: toque longo e arraste. Funciona dentro de um versículo, atravessando
vários, ou pegando só um pedaço no meio da frase.

Aparecida a seleção, sobe uma barra na parte de baixo com a referência do que
foi pego (por exemplo, *Salmos 23:1-4, 4 versículos*) e três ações:

**Copiar** leva o texto com a referência e a sigla da versão no fim, pronto para
colar. Quando são vários versículos, cada um vai com seu número.

**Compartilhar** abre o compartilhamento do celular. No computador, onde isso
quase nunca existe, ele copia e avisa.

**Marcar** abre as cores e pinta **exatamente o trecho selecionado**.

Isso muda uma regra antiga: não é mais um marcador por versículo. Um mesmo
versículo pode ter dois ou três trechos de cores diferentes convivendo. Marcar
por cima de um trecho já colorido substitui só a parte que se sobrepõe.

O que você já tinha marcado antes continua valendo, lido como um trecho que
cobre o versículo inteiro. Não se perde nada.

No painel de marcadores, a lista agora mostra o pedaço marcado, com reticências
indicando que o versículo continua antes ou depois.

## 2. O flag de categorias, e o recolher

Desligado, agora é só isso mesmo: Antigo Testamento, Novo Testamento e os livros.
Nenhum nome de categoria, nenhuma divisão no meio. Tirei os marcos que eu tinha
posto na leva anterior — você tem razão, era exatamente a nomenclatura de que o
flag existia para fugir. O total de capítulos do Testamento continua.

**Clicar num Testamento aberto agora recolhe ele.** Isso tinha um defeito: o
código guardava "fechado" e "nunca aberto" do mesmo jeito, então na hora de
redesenhar ele achava que era a primeira vez e reabria sozinho. Corrigido — agora
fechado é fechado, e o outro Testamento sobe para perto do dedo.

## 3. A bolinha de apagar, e os Ajustes

A bolinha branca com o xis só aparece quando existe marca para tirar. Sem marca,
ela some.

Os Ajustes viraram sanfona, pelo mesmo motivo do painel de livros: estava
comprido demais. Seis seções — Folha, Painel de livros, Comparar, Versões
empilhadas, Marcadores e Armazenamento — abrindo uma por vez.

## 4. Roda de cores

O seletor do navegador saiu. No lugar entrou uma roda: o ângulo escolhe a cor, a
distância do centro escolhe o quanto ela é viva (perto do meio fica pálida, na
borda fica cheia).

Embaixo, a barra de tonalidade. O meio dela é a cor como saiu da roda; para a
esquerda escurece até quase preto, para a direita clareia até quase branco. A
barra se repinta com a cor escolhida, então dá para ver o caminho inteiro antes
de decidir.

Ao lado fica a amostra grande e o código da cor. Tudo muda ao vivo enquanto o
dedo anda, e a mudança já recolore todos os trechos daquele marcador.

Abre tocando na bolinha colorida de cada marcador, dentro dos Ajustes.

## 5. Arrastar para virar a página

Arrastar para a esquerda avança um capítulo, para a direita volta.

Três cuidados para o gesto não atrapalhar o resto: se o dedo andou mais na
vertical, é rolagem e não virada; se há texto selecionado, você está escolhendo
um trecho e não quer trocar de capítulo; e o gesto precisa ser decidido — curto
demais ou demorado demais não conta.

---

## Conferido

- 34 verificações novas em navegador, todas passando.
- As 40 da leva anterior, atualizadas para as regras novas, todas passando.
- Os 26 testes de dados continuam passando (`node teste.js`).
- Marcadores no formato antigo testados à parte: aparecem certos, contam certo
  e abrem certo.
- Nenhum erro de javascript.
