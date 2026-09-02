/* Bíblia — © 2026 Fabio · CC BY-NC-SA 4.0 (uso não comercial, sem lucro). Veja LICENSE. */
/* perfil-foto.js — Gerencia redimensionamento e conversão de foto de perfil para base64.
 *
 * Redimensiona para 128x128, converte para JPEG comprimido (~5-10KB).
 * Armazena no Perfil como base64.
 */

const PerfilFoto = {
  TAMANHO_FOTO: 128,
  QUALIDADE_JPEG: 0.85,

  /* ================================================== Converter arquivo para base64 */
  async procesarArquivo(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('Arquivo não é uma imagem'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Redimensiona usando Canvas
          const canvas = document.createElement('canvas');
          canvas.width = this.TAMANHO_FOTO;
          canvas.height = this.TAMANHO_FOTO;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, this.TAMANHO_FOTO, this.TAMANHO_FOTO);
          
          // Converte para JPEG comprimido
          const base64 = canvas.toDataURL('image/jpeg', this.QUALIDADE_JPEG);
          resolve(base64);
        };
        img.onerror = () => reject(new Error('Erro ao carregar imagem'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsDataURL(file);
    });
  },

  /* ================================================== Obter foto do perfil */
  obter() {
    const perfil = Perfil.todos();
    return perfil.foto || null;
  },

  /* ================================================== Salvar foto no perfil */
  salvar(base64) {
    const perfil = Perfil.todos();
    Perfil.salvar({
      ...perfil,
      foto: base64,
    });
  },

  /* ================================================== Remover foto */
  remover() {
    const perfil = Perfil.todos();
    delete perfil.foto;
    Perfil.salvar(perfil);
  },
};
