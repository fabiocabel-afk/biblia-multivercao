/* sw.js — deixa o app funcionar sem internet.
 *
 * O esqueleto (telas, estilo, codigo) e os arquivos de meta entram no cache na
 * instalacao. Os livros entram conforme sao abertos: na primeira leitura vem da
 * rede e fica guardado; da segunda em diante sai do cache, mesmo sem sinal.
 */

/* A casca sobe de versao a cada mudanca no app, para o navegador nao servir a
 * versao antiga. Os textos biblicos ficam numa versao propria e estavel: eles
 * nunca mudam, e nao ha por que rebaixar tudo por causa de um ajuste de tela. */
const CASCA = 'casca-biblia-v14';
const TEXTOS = 'textos-biblia-v1';

const ESSENCIAIS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/estilo.css',
  './assets/js/dados.js',
  './assets/js/armazenamento.js',
  './assets/js/cores.js',
  './assets/js/leitura.js',
  './assets/js/busca.js',
  './assets/js/app.js',
  './data/meta/versoes.json',
  './data/meta/estrutura.json',
  './data/meta/numeracao.json',
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CASCA)
      .then(c => c.addAll(ESSENCIAIS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n !== CASCA && n !== TEXTOS).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // texto biblico e referencias cruzadas: cache primeiro, porque nunca mudam
  if (url.pathname.includes('/data/biblias/') || url.pathname.includes('/data/refs/')) {
    evento.respondWith(
      caches.match(req).then(guardado => guardado || fetch(req).then(resp => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(TEXTOS).then(c => c.put(req, copia));
        }
        return resp;
      }))
    );
    return;
  }

  // esqueleto do app: rede primeiro para pegar atualizacoes, cache como rede de seguranca
  evento.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CASCA).then(c => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req).then(g => g || caches.match('./index.html')))
  );
});
