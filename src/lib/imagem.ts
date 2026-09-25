// Imagens de perfil — compactação antes de salvar no localStorage
export const TAMANHO_FOTO = 320
const TAMANHO_MAX_ARQUIVO = 10 * 1024 * 1024 // 10 MB

function lerComoDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(String(leitor.result))
    leitor.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    leitor.readAsDataURL(file)
  })
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const imagem = new Image()
    imagem.onload = () => resolve(imagem)
    imagem.onerror = () => reject(new Error('Arquivo de imagem inválido.'))
    imagem.src = src
  })
}

/**
 * Lê um arquivo de imagem, recorta no centro (quadrado) e retorna
 * um data URL JPEG compactado (320×320, qualidade 0.82) — cabe no
 * localStorage sem estourar a cota.
 */
export async function arquivoParaFoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem (JPG, PNG, WebP...).')
  }
  if (file.size > TAMANHO_MAX_ARQUIVO) {
    throw new Error('Imagem muito grande (máximo 10 MB).')
  }
  const dataUrl = await lerComoDataURL(file)
  const imagem = await carregarImagem(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = TAMANHO_FOTO
  canvas.height = TAMANHO_FOTO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a imagem.')

  const lado = Math.min(imagem.naturalWidth, imagem.naturalHeight)
  const sx = (imagem.naturalWidth - lado) / 2
  const sy = (imagem.naturalHeight - lado) / 2
  ctx.drawImage(imagem, sx, sy, lado, lado, 0, 0, TAMANHO_FOTO, TAMANHO_FOTO)
  return canvas.toDataURL('image/jpeg', 0.82)
}
