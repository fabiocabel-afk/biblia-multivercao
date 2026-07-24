# O que mudou — quinta leva

Dois ajustes. A pasta `data` continua intocada.

## Como trocar

Apague `index.html`, `sw.js`, `manifest.json`, `teste.js` e a pasta `assets`
inteira. Copie no lugar os arquivos deste pacote. A `data` fica onde está.

Se o app abrir igual ao de antes, aperte `Ctrl` + `Shift` + `R` uma vez.

---

## 1. Salvar estudo: novo ou juntar a um existente

Antes, "Salvar estudo" sempre criava um estudo novo. Agora ele pergunta primeiro:

Ao tocar em **Salvar estudo**, abre uma escolha na própria barra — **Novo
estudo**, ou a lista dos estudos que você já tem. Escolhendo um da lista, o
trecho selecionado entra naquele estudo, ao lado dos que já estavam lá.

Assim dá para ir reunindo passagens de lugares diferentes sob o mesmo estudo —
juntar todos os versículos sobre um tema, por exemplo, mesmo que venham de livros
diferentes.

No painel de Estudos, cada estudo agora mostra todos os seus trechos, um abaixo
do outro. Tocar num trecho leva direto até ele; o **xis** ao lado remove aquele
trecho sozinho. Se você tirar o último, o estudo se apaga. Copiar e Compartilhar
levam o texto de todos os trechos juntos.

O que você já tinha salvo como estudo continua funcionando: é lido como um estudo
de um trecho só, e pode receber outros a partir de agora.

## 2. Modo "um por linha": número ao lado do texto

No modo de um versículo por linha, o número estava em cima, como um cabeçalho.
Agora ele fica **na mesma linha**, à esquerda do texto — recuado na margem, como
numa Bíblia impressa em coluna. As linhas seguintes do mesmo versículo se
alinham ao texto, deixando o número destacado sozinho na margem.

---

## Conferido

- 21 verificações novas em navegador, todas passando.
- As 156 das levas anteriores, atualizadas para o novo fluxo, todas passando.
- Os 26 testes de dados continuam passando (`node teste.js`).
- Compatibilidade com estudos no formato antigo, testada à parte.
- Nenhum erro de javascript.
