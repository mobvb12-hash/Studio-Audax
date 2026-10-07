// -----------------------------------------------------------------------------
// auth.ts — comparação de credenciais server-to-server (timing-safe).
//
// Usada pelo `whatsapp-webhook` para aceitar a credencial do pg_cron
// (service_role) SOMENTE na ação `notificar-pendentes`. Módulo puro, sem
// dependência de Deno, para ser testável no vitest.
// -----------------------------------------------------------------------------

/**
 * Comparação de credenciais em tempo constante (timing-safe): o resultado
 * não depende da posição do primeiro byte divergente, impedindo ataques de
 * timing na autenticação do cron.
 */
export function tokensIguais(a: string, b: string): boolean {
  const bytesA = new TextEncoder().encode(a)
  const bytesB = new TextEncoder().encode(b)
  let diff = bytesA.length ^ bytesB.length
  const total = Math.max(bytesA.length, bytesB.length)
  for (let i = 0; i < total; i++) {
    diff = diff | ((bytesA[i] ?? 0) ^ (bytesB[i] ?? 0))
  }
  return diff === 0
}
