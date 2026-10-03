// Normalização de texto compartilhada pelos módulos puros da função.
//
// Vive num arquivo próprio (e não em ./conversa.ts) para que ./identidade.ts
// possa usar `normalizar` sem criar ciclo de runtime: este arquivo não importa
// nada. `./conversa.ts` continua reexportando, então a API pública e os testes
// existentes não mudam.

/** minúsculo, sem acento, sem espaços nas pontas. */
export function normalizar(valor: string): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
