# O que mudou nesta versão

Oito ajustes pedidos depois do app já estar rodando.

## Como trocar os arquivos

A pasta `data` **não** vem neste pacote e **não deve ser mexida** — os textos
bíblicos continuam os mesmos. Só a parte do aplicativo se renova.

1. Na sua pasta `biblia-app`, apague `index.html`, `sw.js`, `manifest.json`,
   `teste.js` e a pasta `assets` inteira.
2. Copie no lugar os arquivos deste pacote.
3. A pasta `data` fica exatamente onde está.
4. Suba o servidor de novo (`abrir-biblia.bat`, ou `python -m http.server 8080`)
   e acesse `http://localhost:8080`.

**Se o app abrir igualzinho ao de antes**, o navegador está servindo a versão
guardada em memória. Aperte `Ctrl` + `Shift` + `R` para forçar a atualização.
Isso acontece uma vez só.

---

## Os oito ajustes

**1. As barras acompanham a temperatura da folha.**
Topo e rodapé deixaram de ser presos no preto. Com o papel branco eles ficam
quase pretos, como antes; conforme você esquenta a temperatura, vão virando
marrom de couro, no mesmo tom da leitura. A barra do sistema operacional
acompanha junto.

**2. Toque simples deixa o "parei aqui".**
Um traço vertical discreto na lateral do versículo, na própria tinta do momento
— preto no papel branco, marrom no sépia. É um só: quando você toca em outro, o
traço pula para lá. Tocar de novo no mesmo tira. Fica gravado, então no dia
seguinte você retoma de onde parou.

**3. Toque duplo abre as versões e os marcadores.**
O que antes o toque simples fazia agora exige o toque duplo. São dois gestos com
pesos diferentes para duas coisas com pesos diferentes.

**4. Dá para remover a marca.**
Ao lado das doze cores entrou uma bolinha branca com um xis. Clicou, o versículo
volta ao normal.

**5. A cor entra na hora.**

Este era um defeito de verdade, e a causa não era a que parecia.

O versículo que você acabou de tocar fica sempre "em foco". O realce do foco e a
cor do marcador pintavam o mesmo fundo, com o mesmo peso — e o foco vinha depois
na folha de estilo, então ganhava. A cor estava lá o tempo todo, coberta. Quando
você ia para outro versículo, o foco saía dali e a cor aparecia. Era exatamente
o que você via.

Corrigido em duas frentes: a marca agora vence o fundo e o foco fica só no traço
lateral; e a cor passa a ser aplicada direto no versículo no instante do clique,
sem esperar a tela se redesenhar. Medido em teste: abaixo de 120 milissegundos.

De quebra, trocar a cor de um marcador nos Ajustes agora recolore ao vivo,
enquanto você arrasta no seletor.

**6. Painel de marcadores.**
Ícone próprio na barra do topo, ao lado da busca e do histórico.

Lista os doze grupos pelo nome que você deu, com a cor e quantos versículos cada
um tem. Entrando num grupo, vêm todos os versículos daquele marcador — de
qualquer livro — com a referência e um trecho do texto para reconhecer de
relance. Clicando, salta direto para a passagem. A lista sai na ordem de leitura
da Bíblia, não na ordem em que você marcou.

No alto do painel fica o "Onde parei", que leva de volta ao ponto do item 2.

Os nomes e as cores continuam se editando nos Ajustes, como já era. Trocar a cor
de um grupo recolore todos os versículos dele de uma vez.

**7. Subtotais de capítulos.**
Cada categoria mostra a soma dos capítulos dos seus livros, e cada Testamento a
soma geral. O Pentateuco marca 187, o Antigo Testamento 929, o Novo 260.
Aparecem sempre, com as categorias ligadas ou desligadas — o número é uma
verdade sobre o conjunto, não sobre o modo de exibição.

**8. Painel de livros em sanfona.**
De início só os dois Testamentos. Abriu um, o outro recolhe. Dentro dele, uma
categoria por vez, mesma regra.

Ao abrir o painel, o app já escancara onde você está lendo agora.

Nos Ajustes há o interruptor **Mostrar categorias**. Desligado, os livros vêm
direto sob o Testamento, sem a camada do meio — e as categorias viram marcos
finos ao longo da lista, ainda com a contagem de capítulos.

---

## Conferido

- 39 verificações em navegador de verdade, todas passando.
- Os 26 testes de dados continuam passando (`node teste.js` na pasta do app).
- Nenhum erro de javascript no console.

## Uma coisa para você conferir

Na minha bancada de teste a pasta `data/biblias/ntlh` veio só com o `meta.json`,
sem os livros. Aqui é limitação do meu ambiente, mas vale conferir a sua — a
`data/meta` já tinha chegado pela metade uma vez.

O `verificar-pasta.bat` conta os arquivos de cada versão e mostra qualquer uma
que esteja capenga. Uma versão completa tem 67 arquivos (66 livros + meta);
a Ave-Maria tem 74 (73 livros + meta).

## Antes de subir no GitHub Pages

O servidor do GitHub diferencia maiúscula de minúscula; o Windows não. As
pastas de versão precisam estar em **minúscula** (`acf`, `nvi`, `avemaria`) e os
arquivos de livro em **maiúscula** (`GEN.json`, `PSA.json`), porque é assim que
o código procura.
