// Templates de mensagem — texto gerado apenas com dados reais do sistema
// (cliente, agendamento, serviço, profissional e datas já registrados).
// Nenhum número de telefone ou contato é inventado aqui.
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import type { IdTemplate } from './types'

export type DadosTemplate = {
  /** Nome real do cliente */
  nome: string
  /** Serviço do agendamento */
  servico?: string
  /** Profissional do agendamento */
  profissional?: string
  /** YYYY-MM-DD */
  data?: string
  /** HH:MM */
  horario?: string
  /** YYYY-MM-DD do último atendimento concluído (reativação/pós) */
  ultimoAtendimento?: string
  /** Dias reais desde o último atendimento (reativação) */
  diasSemAtendimento?: number
}

function exigir(valor: string | undefined, rotulo: string, template: string) {
  if (!valor || !valor.trim()) {
    throw new Error(
      `Dados incompletos para o template ${template}: ${rotulo}.`,
    )
  }
  return valor.trim()
}

/**
 * Texto final da mensagem. Falha com erro claro quando os dados reais
 * necessários não existem (ex.: confirmação sem agendamento futuro).
 */
export function textoTemplate(id: IdTemplate, d: DadosTemplate): string {
  const nome = exigir(d.nome, 'cliente', id)
  switch (id) {
    case 'confirmacao': {
      const servico = exigir(d.servico, 'serviço', id)
      const profissional = exigir(d.profissional, 'profissional', id)
      const data = exigir(d.data, 'data', id)
      const horario = exigir(d.horario, 'horário', id)
      return `Olá, ${nome}! Confirmação do seu agendamento: ${servico} com ${profissional} em ${formatarDataLonga(data)} às ${horario}. Até lá — Studio Audax.`
    }
    case 'lembrete': {
      const servico = exigir(d.servico, 'serviço', id)
      const profissional = exigir(d.profissional, 'profissional', id)
      const data = exigir(d.data, 'data', id)
      const horario = exigir(d.horario, 'horário', id)
      return `Olá, ${nome}! Lembrete: você tem ${servico} com ${profissional} em ${formatarDataLonga(data)} às ${horario}. Se precisar remarcar, é só responder.`
    }
    case 'pos_atendimento': {
      const servico = exigir(d.servico, 'serviço', id)
      return `Oi, ${nome}! Obrigado por fazer ${servico} no Studio Audax. Esperamos que tenha gostado do resultado!`
    }
    case 'reativacao': {
      const ultimo = exigir(d.ultimoAtendimento, 'último atendimento', id)
      const dias = d.diasSemAtendimento
      if (dias === undefined || dias === null || dias < 0) {
        throw new Error(
          'Dados incompletos para o template reativacao: dias desde o último atendimento.',
        )
      }
      return `Olá, ${nome}! Já são ${dias} dia(s) desde seu último atendimento (${formatarDataLonga(ultimo)}). Que tal reservar um horário no Studio Audax?`
    }
  }
}

/** Converte um agendamento real nos dados dos templates de agendamento. */
export function dadosDoAgendamento(ag: Agendamento): DadosTemplate {
  return {
    nome: ag.cliente,
    servico: ag.servico,
    profissional: ag.profissional,
    data: ag.data,
    horario: ag.horario,
  }
}
