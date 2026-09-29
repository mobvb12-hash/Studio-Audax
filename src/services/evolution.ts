// Camada isolada de envio de WhatsApp (Evolution API) no navegador.
//
// O cliente NUNCA vê a URL, a chave ou a instância da Evolution: ele apenas
// invoca a Edge Function `whatsapp-enviar`, que roda no Supabase com os
// secrets (EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE).
// Sem Supabase configurado não existe endpoint — o envio responde
// { ok: false } em modo local. Saída no mesmo contrato `ResultadoEnvio`
// de whatsapp/provedor.ts, importado apenas como tipo (nada é alterado
// naquele módulo).
import { supabase } from '@/lib/supabase'
import type { ResultadoEnvio } from '@/modules/whatsapp/provedor'

/** Nome da Edge Function — único ponto de contato com a Evolution. */
export const FUNCAO_WHATSAPP = 'whatsapp-enviar'

/**
 * Envia um texto pelo WhatsApp via Evolution API (somente texto por ora).
 * Nunca lança: toda falha vira `{ ok: false, motivo }` para a UI tratar.
 */
export async function enviarTextoWhatsApp(
  telefone: string,
  mensagem: string,
): Promise<ResultadoEnvio> {
  const cliente = supabase()
  if (!cliente) {
    return { ok: false, motivo: 'Supabase não configurado — envio indisponível.' }
  }
  try {
    const { data, error } = await cliente.functions.invoke(FUNCAO_WHATSAPP, {
      body: { telefone, mensagem },
    })
    if (error) {
      return { ok: false, motivo: error.message || 'Falha ao acionar o envio.' }
    }
    const resultado = data as Partial<ResultadoEnvio> | null
    if (resultado && resultado.ok === true) return { ok: true }
    return { ok: false, motivo: resultado?.motivo || 'Envio recusado pela função.' }
  } catch (erro) {
    return {
      ok: false,
      motivo: erro instanceof Error ? erro.message : 'Falha inesperada no envio.',
    }
  }
}
