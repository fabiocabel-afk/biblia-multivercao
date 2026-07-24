# O que mudou — terceira leva

Sete pedidos. A pasta `data` continua intocada.

## Como trocar

Apague `index.html`, `sw.js`, `manifest.json`, `teste.js` e a pasta `assets`
inteira. Copie no lugar os arquivos deste pacote. A `data` fica onde está.

Se o app abrir igual ao de antes, aperte `Ctrl` + `Shift` + `R` uma vez.

---

## 1. Exibição do versículo, e a cor do número

Nos Ajustes, dentro de **Folha**, entrou a escolha entre duas formas de ler:

**Corrido** é como sempre foi — o texto fluindo como numa Bíblia impressa, com a
capitular grande e os números sobrescritos.

**Um por linha** põe cada versículo no seu próprio parágrafo, com o número
servindo de cabeçalho em cima. Neste modo a capitular sai de cena: ela roubaria
o lugar do número do primeiro versículo.

O número do versículo ganhou cor própria — um marrom mais claro que a tinta do
texto, que acompanha a temperatura da folha junto com todo o resto. Antes ele
usava o mesmo cinza dos rodapés e sumia no meio da leitura.

## 2. Comparar, com a mesma cara do painel principal

O seletor de lista saiu dos Ajustes. No lugar entrou exatamente a lista do
painel de versões: agrupada em Protestantes e Católica, cada linha com a sigla,
o nome por extenso e o ano.

## 3. Trocar a versão dentro da própria comparação

As duas siglas que ficam ao lado do nome do livro viraram botões. Tocar em
qualquer uma abre a lista de versões, e o título do painel diz qual metade você
está mexendo. Escolheu, a comparação se refaz ali mesmo, sem sair da tela.

É o atalho para comparar várias traduções em sequência.

**De quebra, um defeito sério apareceu no teste.** Se faltasse o arquivo de um
livro na versão de baixo, a comparação inteira quebrava: nem a metade de cima
aparecia, nem os botões respondiam. Agora cada metade se vira sozinha — a que
falhou avisa qual versão está incompleta, e a outra continua funcionando.

## 4. O ponto de leitura, agora visível

Você tinha razão: estava transparente demais para achar no meio do capítulo.

O traço lateral engrossou, passou a usar a cor de destaque em vez da tinta
diluída, e ganhou um fundo leve que puxa o olho. Continua discreto, mas agora
se acha de relance.

## 5. Marcadores

**A marca não risca mais o texto.** Ela se esticava dois pixels em todas as
direções e acabava encostando na linha de cima e na de baixo. Agora tem folga em
volta das letras, sem crescer para fora da linha.

**Os marcadores aparecem pelo nome.** Tanto ao marcar um versículo quanto ao
marcar um trecho selecionado, a lista mostra a bolinha da cor junto do nome que
você deu. Ninguém precisa lembrar o que era o azul.

**Desmarcar ficou óbvio.** Sumiu aquela bolinha branca com xis, que não dizia
nada. Agora o marcador que está posto aparece com o xis dentro da própria cor —
você vê de qual se trata e que tocar ali vai tirar a marca.

## 6. Histórico

O botão agora diz **Salvar esta leitura e iniciar outra**.

**Data e hora nunca somem**, mesmo quando a leitura ganha nome próprio. Meses
depois, "Estudo sobre a graça" sozinho não diz quando foi.

**Cada leitura virou uma dobra**, abrindo uma por vez, com a contagem de
passagens do lado. A lista corrida virava um paredão sem fim.

**Compartilhar e Copiar** dentro de cada leitura levam o estudo inteiro em
texto: o nome, a data e a hora, e todas as passagens com o horário de cada uma e
o trecho lido. No celular abre o compartilhamento do sistema; no computador,
copia.

## 7. A busca ganhou a tela de volta

O funil era uma tira comprida de pílulas — todos os testamentos, todas as
categorias, tudo à mostra o tempo todo, comendo o espaço dos resultados.

Agora, embaixo do campo, fica só uma linha dizendo onde a busca vai acontecer.
Tocando nela, abrem três dobras: **Toda a Bíblia e Testamentos**, **Por
categoria** e **Por livro**. Uma aberta por vez, como no painel de livros.

Escolhido o escopo, o funil se recolhe sozinho e devolve a tela inteira aos
versículos encontrados.

## E a tela cheia no Android

O manifesto passou a pedir tela cheia, então a barra de navegação de baixo some
e o app ocupa a tela toda. Ela volta quando você arrasta de baixo para cima —
esse gesto é do próprio Android, não do app.

Isso só vale com o app **instalado** na tela inicial. Aberto pelo navegador
comum, o Android mantém as barras dele.

---

## Conferido

- 55 verificações novas em navegador, todas passando.
- As 75 das levas anteriores, atualizadas para as regras novas, todas passando.
- Os 26 testes de dados continuam passando (`node teste.js`).
- Nenhum erro de javascript.
