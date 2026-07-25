# O que mudou — Compartilhar no menu

A pasta data continua intocada — só o app muda. Apague index.html, sw.js,
manifest.json, teste.js e a pasta assets, copie os novos, e dê Ctrl+Shift+R uma
vez ao abrir.

Atenção: esta leva traz um arquivo novo dentro de assets — assets/img/qrcode.svg.
Ao copiar a pasta assets inteira, ele já vai junto.

---

## Compartilhar

Entrou no menu (por último, depois de Ajustes) a opção Compartilhar.

Ela abre um painel com:

- O QR code do app. Ele é o SVG que você mandou, adaptado para herdar a cor do
  tema: aparece em marrom escuro no modo claro e em bege claro no modo escuro,
  com o fundo transparente acompanhando o papel. Quem apontar a câmera abre o app.
- O link: https://fabiocabel-afk.github.io/biblia-multivercao/
- Dois botões: Copiar link e Compartilhar. O "Compartilhar" usa a folha de
  compartilhamento do próprio aparelho (WhatsApp, e-mail, etc.) onde ela existe;
  onde não existe, ele também copia o link.

O QR fica guardado no cache offline, então o painel funciona mesmo sem internet.

---

## Conferido

- 11 verificações desta leva, todas passando.
- As 317 das levas anteriores, todas passando.
- Os 26 testes de dados continuam passando.
- Nenhum erro de javascript.
