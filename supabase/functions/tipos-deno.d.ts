// Tipos do ambiente Deno + módulos do Supabase que a Edge Function usa.
// Só declarations — a execução continua sendo no Deno (Supabase Edge Runtime).
// O objetivo deste shim é permitir que `npm run typecheck` inclua
// `supabase/functions/**` no gate de TypeScript sem instalar o runtime Deno.

declare namespace Deno {
  const env: { get(name: string): string | undefined }
  function serve(handler: unknown, options?: unknown): void
}

declare module 'jsr:@supabase/functions-js/edge-runtime.d.ts' {
  export {}
}

declare module '@supabase/server' {
  type ClienteMinimo = {
    auth: {
      getUser(token: string): Promise<{
        data: { user: { id: string; role: string } | null }
        error: { message: string } | null
      }>
      getClaims(token: string): Promise<{
        data: { sub?: string; role?: string } | null
        error: { message: string } | null
      }>
    }
    rpc(nome: string, args?: Record<string, unknown>): Promise<{
      data: unknown
      error: { message: string } | null
    }>
  }

  export function withSupabase(
    opcoes: { auth: string[] | string },
    handler: (
      req: Request,
      ctx: {
      supabase: ClienteMinimo
      authMode: string
      userClaims: { role?: string; sub?: string } | null
    },
    ) => Response | Promise<Response>,
  ): unknown
}
