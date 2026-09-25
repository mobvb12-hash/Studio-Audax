// Arquitetura de envio — contrato pronto para uma futura integração
// oficial (ex.: API oficial de WhatsApp Business). O sistema não embut
// nenhum provedor, número, token ou webhook: sem configuração, nenhuma
// mensagem sai do sistema.
import type { MensagemWhats } from './types'

export type ResultadoEnvio = {
  ok: boolean
  motivo?: string
}

export type ProvedorEnvio = {
  nome: string
  enviar: (mensagem: MensagemWhats) => Promise<ResultadoEnvio>
}
