# O que mudou — bugs, seletor de versículo, referências e ajustes

Uma leva grande, 12 itens. A pasta data continua intocada — SÓ o app muda.

## Como trocar

Apague index.html, sw.js, manifest.json, teste.js e a pasta assets. Copie os
novos. Ctrl + Shift + R uma vez ao abrir.

---

## Bugs corrigidos

**A marcação que não saía.** Quando você abria um versículo por toque duplo e
depois tocava em outro, o realce do primeiro ficava preso. Agora o toque simples
limpa esse realce.

**Modo "um por linha".** A margem esquerda estava grande demais e o número ficava
pendurado para fora. Agora as margens são iguais dos dois lados e o número abre a
linha junto do texto, sem sair para fora — só ganha destaque quando você
seleciona o versículo. E a barra lateral do "onde parei" não cai mais em cima do
número.

## Seletor de livro, agora com versículo

Depois de escolher o livro e o capítulo, aparece a grade de versículos daquele
capítulo. Serve para registrar de onde você parte — muitos capítulos têm dezenas
de versículos e quase sempre você já tem um em mente.

O primeiro toque leva até o versículo, com o efeito de "parei aqui", e cria o
registro. Tocando em outros abaixo, o registro se estende até o maior: se você
toca no 5, depois no 6, pula o 7 e toca no 13, o registro fica de 5 a 13.

## Referências

**Sumiu o deslizador de filtro** — estava atrapalhando.

**Texto embutido.** Ao tocar numa referência, o texto dela aparece ali dentro
mesmo, com o versículo apontado em destaque e alguns a mais de contexto. Você rola
e lê sem sair do livro. Um botão "Ir para o capítulo" leva até lá se quiser; senão,
"← Referências" volta à lista. O painel ficou mais alto para caber a leitura.

**Referências fixas (novo, nos Ajustes).** Ligando essa opção, a tela se divide:
o texto em cima (maior) e as referências embaixo. Sem versículo selecionado,
mostra as do capítulo inteiro (cada uma marcada com o versículo de origem); ao
tocar num versículo, filtra pelas dele. Tocar numa referência abre o texto
embaixo, com volta — igual ao de cima. Vem desligada por padrão, mas fica salva
se você ligar.

## Ajustes

- "Folha" agora se chama **Página**.
- A escolha "corrido / um por linha" virou **botão redondo** de seleção única.
- O painel **abre sempre com tudo fechado**.
- A seção aberta ganhou um **fundo levemente diferente** no título, para não se
  confundir com o conteúdo — antes os itens de baixo pareciam estar dentro dela.

## Padrões iniciais

- Temperatura do papel começa em **50%**.
- A fonte fica como está.
- A exibição começa em **corrido**.

## Leitura

O **nome do livro** aparece grande e em negrito **só no primeiro capítulo**, para
dar aquela impressão de abertura de livro numa Bíblia física. Nos demais
capítulos, discreto como antes.

---

## Conferido

- 35 verificações desta leva, todas passando.
- As 240 das levas anteriores, atualizadas, todas passando.
- Os 26 testes de dados continuam passando.
- Nenhum erro de javascript.
