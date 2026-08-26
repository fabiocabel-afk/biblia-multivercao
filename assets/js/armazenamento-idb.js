/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* armazenamento-idb.js — IndexedDB com fallback automático para localStorage.
 *
 * Interface síncrona idêntica ao Guarda original: ler(chave, padrão) e gravar(chave, valor).
 * Oferece três camadas de fallback:
 *   1. IndexedDB (principal, com cache em memória)
 *   2. localStorage (compatibilidade)
 *   3. Memória (se tudo falhar)
 *
 * Migração silenciosa: na primeira abertura, copia localStorage → IndexedDB (em background).
 */

const GuardaIndexedDB = (() => {
  const PREFIXO = 'biblia:';
  const DB_NOME = 'biblia';
  const DB_VERS = 1;
  const STORE_DADOS = 'dados';
  const CHAVE_MIGRADO = '__indexeddb_migrado';

  let db = null;
  let temLocalStorage = true;
  let temIndexedDB = typeof indexedDB !== 'undefined';
  let memoria = {};         // Cache em memória (sempre acessível sincrono)
  let iniciacaoEmCurso = false;

  // =====================================================================
  // Testa suporte a localStorage
  // =====================================================================
  try {
    localStorage.setItem(PREFIXO + 'teste', '1');
    localStorage.removeItem(PREFIXO + 'teste');
  } catch {
    temLocalStorage = false;
  }

  // =====================================================================
  // Abre (ou cria) a database IndexedDB (assíncrono, em background)
  // =====================================================================
  function abrirDB() {
    if (db || !temIndexedDB) return;

    const req = indexedDB.open(DB_NOME, DB_VERS);

    req.onerror = () => {
      temIndexedDB = false;
    };

    req.onupgradeneeded = (evt) => {
      const database = evt.target.result;
      if (!database.objectStoreNames.contains(STORE_DADOS)) {
        database.createObjectStore(STORE_DADOS);
      }
    };

    req.onsuccess = () => {
      db = req.result;
      migrarDoLocalStorageEmBackground();
    };
  }

  // =====================================================================
  // Lê uma chave do IndexedDB (assíncrono, background)
  // =====================================================================
  function lerDoIndexedDB(chave, callback) {
    if (!db || !temIndexedDB) return callback(null);

    try {
      const tx = db.transaction(STORE_DADOS, 'readonly');
      const store = tx.objectStore(STORE_DADOS);
      const req = store.get(chave);

      req.onsuccess = () => callback(req.result ?? null);
      req.onerror = () => callback(null);
    } catch {
      callback(null);
    }
  }

  // =====================================================================
  // Escreve uma chave no IndexedDB (assíncrono, fire-and-forget)
  // =====================================================================
  function gravarNoIndexedDB(chave, valor) {
    if (!db || !temIndexedDB) return;

    try {
      const tx = db.transaction(STORE_DADOS, 'readwrite');
      const store = tx.objectStore(STORE_DADOS);
      store.put(valor, chave);
    } catch {
      // Falha silenciosa — localStorage/memória continuam funcionando
    }
  }

  // =====================================================================
  // Lê do localStorage (síncrono)
  // =====================================================================
  function lerDoLocalStorage(chave) {
    if (!temLocalStorage) return null;
    try {
      const bruto = localStorage.getItem(PREFIXO + chave);
      return bruto || null;
    } catch {
      return null;
    }
  }

  // =====================================================================
  // Escreve no localStorage (síncrono)
  // =====================================================================
  function gravarNoLocalStorage(chave, valor) {
    if (!temLocalStorage) return false;
    try {
      localStorage.setItem(PREFIXO + chave, valor);
      return true;
    } catch {
      return false;
    }
  }

  // =====================================================================
  // Migração silenciosa: localStorage → IndexedDB (background, não bloqueia)
  // =====================================================================
  function migrarDoLocalStorageEmBackground() {
    if (!db || !temLocalStorage || iniciacaoEmCurso) return;
    iniciacaoEmCurso = true;

    // Checa se já foi migrado
    lerDoIndexedDB(CHAVE_MIGRADO, (jaMigrado) => {
      if (jaMigrado) {
        iniciacaoEmCurso = false;
        return;
      }

      // Copia todas as chaves do localStorage para IDB (em background)
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const chaveCompleta = localStorage.key(i);
          if (chaveCompleta && chaveCompleta.startsWith(PREFIXO)) {
            const chave = chaveCompleta.slice(PREFIXO.length);
            const valor = localStorage.getItem(chaveCompleta);
            if (valor) {
              gravarNoIndexedDB(chave, valor);
            }
          }
        }
      } catch {
        // Falha silenciosa — localStorage já está lá
      }

      // Marca como migrado
      gravarNoIndexedDB(CHAVE_MIGRADO, 'true');
      iniciacaoEmCurso = false;
    });
  }

  // =====================================================================
  // Lê (cascata síncrona: memória → localStorage → padrão)
  // Nota: IndexedDB é background, usa callback para atualizar cache
  // =====================================================================
  function ler(chave, padrao) {
    try {
      // 1. Tenta memória (cache)
      if (memoria[chave] !== undefined) {
        return JSON.parse(memoria[chave]);
      }

      // 2. Tenta localStorage (fallback síncrono)
      const valorLS = lerDoLocalStorage(chave);
      if (valorLS !== null) {
        memoria[chave] = valorLS;  // Atualiza cache
        return JSON.parse(valorLS);
      }

      // 3. Se IndexedDB está aberto, tenta ler (background, atualiza cache)
      if (db && temIndexedDB) {
        lerDoIndexedDB(chave, (valor) => {
          if (valor !== null) {
            memoria[chave] = valor;
          }
        });
      }

      // 4. Retorna padrão
      return padrao;
    } catch {
      return padrao;
    }
  }

  // =====================================================================
  // Escreve (síncrono: memória + localStorage; assíncrono: IndexedDB)
  // =====================================================================
  function gravar(chave, valor) {
    const bruto = JSON.stringify(valor);

    // Sempre grava no cache em memória (instantâneo)
    memoria[chave] = bruto;

    // Grava no localStorage (síncrono, principal fallback)
    const okLS = gravarNoLocalStorage(chave, bruto);
    if (!okLS) {
      // Se localStorage falhar, pelo menos temos memória
      return;
    }

    // Grava no IndexedDB (assíncrono, fire-and-forget, em background)
    if (db && temIndexedDB) {
      gravarNoIndexedDB(chave, bruto);
    }
  }

  function persistente() {
    return temIndexedDB || temLocalStorage;
  }

  // =====================================================================
  // Remove uma chave (memória + localStorage + IndexedDB)
  // =====================================================================
  function deletar(chave) {
    // Remove do cache em memória
    delete memoria[chave];

    // Remove do localStorage
    if (temLocalStorage) {
      try {
        localStorage.removeItem(PREFIXO + chave);
      } catch {
        // Falha silenciosa
      }
    }

    // Remove do IndexedDB (assíncrono, background)
    if (db && temIndexedDB) {
      try {
        const tx = db.transaction(STORE_DADOS, 'readwrite');
        const store = tx.objectStore(STORE_DADOS);
        store.delete(chave);
      } catch {
        // Falha silenciosa
      }
    }
  }

  // =====================================================================
  // Inicialização (chamada uma vez na primeira leitura/escrita)
  // =====================================================================
  let jaIniciou = false;
  function garantirInicio() {
    if (jaIniciou) return;
    jaIniciou = true;
    abrirDB();
  }

  const exports = {
    ler: (chave, padrao) => {
      garantirInicio();
      return ler(chave, padrao);
    },
    gravar: (chave, valor) => {
      garantirInicio();
      gravar(chave, valor);
    },
    deletar: (chave) => {
      garantirInicio();
      deletar(chave);
    },
    persistente,
    temIndexedDB: () => temIndexedDB,
    temLocalStorage: () => temLocalStorage,
    // Para testes/debug
    _status: () => ({ temIndexedDB, temLocalStorage, dbAberto: db !== null, cacheSize: Object.keys(memoria).length }),
  };

  // Garante que fica no escopo global (Node.js + navegador)
  if (typeof globalThis !== 'undefined') {
    globalThis.GuardaIndexedDB = exports;
  } else if (typeof global !== 'undefined') {
    global.GuardaIndexedDB = exports;
  } else if (typeof window !== 'undefined') {
    window.GuardaIndexedDB = exports;
  }

  return exports;
})();
