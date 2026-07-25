# O que mudou — fixados múltiplos, camadas e referências em linhas

A pasta data continua intocada — só o app muda. Apague index.html, sw.js,
manifest.json, teste.js e a pasta assets, copie os novos, e dê Ctrl+Shift+R uma
vez ao abrir.

---

## Bugs corrigidos

**O fixado agora acompanha onde você parou.** Antes ele guardava só o ponto mais
avançado e nunca seguia sua posição de volta — você fixava Gênesis 5, ia até o 29,
mas ao voltar caía no 5. Agora ele acompanha sua última posição no livro, valendo
para qualquer forma de navegar: tocar num versículo, arrastar, ou "próxima página".
Você retoma exatamente de onde parou.

**Os botões não ficam mais atrás da barra inferior.** O "ir para o capítulo" da
referência agora reserva espaço e para acima do rodapé. E o **comparar** passou
para a frente da barra — como a ideia dele é uma comparação rápida, ele cobre o
rodapé e ganhou um botão próprio de fechar (o X no canto).

## Fixados: agora vários, reordenáveis

Dá para fixar mais de um livro — o estudo quase sempre cruza livros. O novo entra
embaixo, e você reordena com as setas ▲▼. Cada um fica no Histórico, na seção
**Fixados** no topo, com o botão de desfixar. Continuam fixos até você tirá-los.

**Atalho no topo.** À esquerda da sigla da tradução apareceu um ícone de alfinete:
é um retorno rápido para o primeiro fixado. Ele só aparece quando você está em
outro livro — some quando você já está nele.

## Referências: nova apresentação

- A **quantidade** aparece ao lado do título ("João 3:16 — 23 referências").
- A lista virou **uma por linha**, esticada, em vez de dois botões por linha.
- Cada linha traz o livro, capítulo e versículo na fonte normal, e abaixo o
  **começo do texto** daquele versículo, em fonte menor e sem negrito — para você
  já ter uma ideia sem precisar abrir.
- Ao **abrir** uma referência, o painel **cresce** (cerca de 3/4 da tela) para
  você ler melhor e rolar pelo texto.
- Os botões **Voltar** e **Ir para** ficam **lado a lado**. O "ir" usa o nome
  curto do livro, que cabe mesmo em nomes grandes.
- A volta é temporária: ao fechar, o estado é descartado. É só para você ir e
  voltar rápido, buscando contexto sem se perder no livro principal.

---

## Conferido

- 28 verificações desta leva, todas passando.
- As 275 das levas anteriores, atualizadas, todas passando.
- Os 26 testes de dados continuam passando.
- Nenhum erro de javascript.

## Uma observação

O seu fixado antigo (do formato de um só) é migrado automaticamente para a nova
lista na primeira vez que abrir — não se perde.
