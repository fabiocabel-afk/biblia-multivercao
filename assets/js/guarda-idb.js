/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* guarda-idb.js — Armazena dados em IndexedDB com fallback para localStorage.
 *
 * Interface simples: Guarda.ler(chave, padrão) / Guarda.gravar(chave, valor)
 */

const Guarda = {
  BANCO: 'biblia-app-db',
  VERSAO: 1,
  LOJA: 'dados',
  
  _db: null,
  _pronto: false,

  /* ================================================== Inicializar IDB */
  async _iniciar() {
    if (this._pronto) return;

    return new Promise((resolve) => {
      const req = indexedDB.open(this.BANCO, this.VERSAO);
      
      req.onerror = () => {
        console.warn('IndexedDB erro, usando localStorage');
        this._db = null;
        this._pronto = true;
        resolve();
      };

      req.onsuccess = (e) => {
        this._db = e.target.result;
        this._pronto = true;
        resolve();
      };

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.LOJA)) {
          db.createObjectStore(this.LOJA, { keyPath: 'chave' });
        }
      };
    });
  },

  /* ================================================== Ler */
  ler(chave, padrao = null) {
    // Tenta localStorage primeiro (síncrono)
    try {
      const item = localStorage.getItem(chave);
      if (item) {
        return JSON.parse(item);
      }
    } catch (e) {
      // localStorage pode estar desabilitado
    }
    
    return padrao;
  },

  /* ================================================== Gravar */
  gravar(chave, valor) {
    // Salvar em localStorage (síncrono, imediato)
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {
      console.warn('localStorage erro:', e);
    }

    // Tentar também em IDB (assíncrono, mas não bloqueia)
    if (this._pronto && this._db) {
      try {
        const tx = this._db.transaction(this.LOJA, 'readwrite');
        const store = tx.objectStore(this.LOJA);
        store.put({ chave, valor });
      } catch (e) {
        console.warn('IDB gravar erro:', e);
      }
    } else if (!this._pronto) {
      // Se ainda não iniciou, fazer assincronamente
      this._iniciar().then(() => {
        if (this._db) {
          try {
            const tx = this._db.transaction(this.LOJA, 'readwrite');
            const store = tx.objectStore(this.LOJA);
            store.put({ chave, valor });
          } catch (e) {
            console.warn('IDB gravar erro (async):', e);
          }
        }
      });
    }
  },

  /* ================================================== Deletar */
  deletar(chave) {
    try {
      localStorage.removeItem(chave);
    } catch (e) {
      // ignorar
    }

    if (this._pronto && this._db) {
      try {
        const tx = this._db.transaction(this.LOJA, 'readwrite');
        const store = tx.objectStore(this.LOJA);
        store.delete(chave);
      } catch (e) {
        // ignorar
      }
    }
  },

  /* ================================================== Limpar tudo */
  limpar() {
    try {
      localStorage.clear();
    } catch (e) {
      // ignorar
    }

    if (this._pronto && this._db) {
      try {
        const tx = this._db.transaction(this.LOJA, 'readwrite');
        const store = tx.objectStore(this.LOJA);
        store.clear();
      } catch (e) {
        // ignorar
      }
    }
  },
};

// Iniciar na carga
Guarda._iniciar();
