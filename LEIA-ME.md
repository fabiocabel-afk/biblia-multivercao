# O que mudou — referências fixas em linhas e volta rápida

A pasta data continua intocada — só o app muda. Apague index.html, sw.js,
manifest.json, teste.js e a pasta assets, copie os novos, e dê Ctrl+Shift+R uma
vez ao abrir.

---

## 1. Referências fixas no mesmo padrão da tirinha

As referências fixas (a faixa de baixo, quando você liga a opção nos Ajustes)
agora aparecem no mesmo formato de linhas da tirinha: uma por linha, com o livro,
capítulo e versículo em cima, e o começo do texto daquele versículo embaixo, em
fonte menor. Na visão do capítulo todo, cada linha ainda mostra de qual versículo
ela vem (v.16, v.17...).

## 2. Botão de volta rápida

Faltava isto: quando você toca em "Ir para" numa referência — seja na tirinha,
seja nas referências fixas — o app te leva ao capítulo dela, mas antes você
perdia o lugar de onde saiu.

Agora, ao chegar, aparece embaixo um botão **"Voltar para [livro cap:versículo]"**,
apontando exatamente para onde você estava. Um toque e você retorna.

Ele é temporário, feito só para o ir-e-volta rápido enquanto você busca contexto:

- Some assim que você usa.
- Some se você navegar para qualquer outro lugar por conta própria (trocar de
  capítulo, abrir outro livro).

Assim você consulta uma referência e volta ao seu estudo sem se perder.

---

## Conferido

- 14 verificações desta leva, todas passando.
- As 303 das levas anteriores, todas passando.
- Os 26 testes de dados continuam passando.
- Nenhum erro de javascript.
