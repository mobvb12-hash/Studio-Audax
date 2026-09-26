// Automações — gatilhos puros calculados dos dados reais do sistema.
// NUNCA altera dados e NUNCA envia WhatsApp: cada sugestão prepara no
// máximo uma mensagem PENDENTE (ou é marcada como tratada) por decisão
// humana. A trava anti-duplicação é a chave determinística de cada
// sugestão, guardada pelo store em `studio-audax:automacoes:v1`.
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { diasEntre, statusAssinatura } from '@/modules/clube/regras'
import {
  PLANOS_ROTULO,
  type AssinaturaClube,
} from '@/modules/clube/types'
import { normalizarBusca } from '@/modules/clientes/regras'
import type { Cliente } from '@/modules/clientes/types'
import {
  DIAS_INATIVO,
  diasParaAniversario,
  montarPerfis,
  proximoAgendamento,
} from '@/modules/crm/regras'
import { compativel } from '@/modules/espera/regras'
import type { PedidoEspera } from '@/modules/espera/types'
import { dadosDoAgendamento, textoTemplate } from '@/modules/whatsapp/templates'
import type { IdTemplate, MensagemWhats } from '@/modules/whatsapp/types'
import {
  AUTOMACOES_ORDEM,
  type SugestaoAutomacao,
  type TipoAutomacao,
} from './types'

export type EntradaAutomacoes = {
  agendamentos: Agendamento[]
  clientes: Cliente[]
  lancamentos: Lancamento[]
  assinaturas: AssinaturaClube[]
  pedidos: PedidoEspera[]
  /** Histórico de mensagens (evita duplicar o que já foi preparado fora) */
  mensagens: MensagemWhats[]
  /** YYYY-MM-DD — omitido = hoje */
  hoje?: string
}

function clientePorNome(
  clientes: Cliente[],
  nome: string,
): Cliente | undefined {
  const chave = normalizarBusca(nome)
  if (!chave) return undefined
  return clientes.find((c) => normalizarBusca(c.nome) === chave)
}

function preferenciaAtiva(cliente: Cliente, campo: 'smsLembrete' | 'smsMarketing'): boolean {
  return cliente.preferencias?.[campo] !== false
}

/** Mensagens pendentes/enviadas (falha não trava nada). */
function jaPreparada(
  mensagens: MensagemWhats[],
  template: IdTemplate,
  clienteId: string,
  agendamentoId?: string,
): boolean {
  return mensagens.some(
    (m) =>
      m.status !== 'falhou' &&
      m.template === template &&
      m.clienteId === clienteId &&
      (agendamentoId ? m.agendamentoId === agendamentoId : true),
  )
}

function ordem(tipo: TipoAutomacao): number {
  const i = AUTOMACOES_ORDEM.indexOf(tipo)
  return i < 0 ? AUTOMACOES_ORDEM.length : i
}

/**
 * Todos os gatilhos válidos no estado atual. Confirmação e lembrete não
 * re-sugerem o que já foi preparado manualmente (CRM/IA); o restante é
 * barrado pela chave de tratadas no `semTratadas`.
 */
export function gerarAutomacoes(
  entrada: EntradaAutomacoes,
): SugestaoAutomacao[] {
  const hoje = entrada.hoje ?? hojeISO()
  const amanha = somarDias(hoje, 1)
  const { agendamentos, clientes, lancamentos, assinaturas, pedidos, mensagens } =
    entrada
  const sugestoes: SugestaoAutomacao[] = []

  for (const ag of agendamentos) {
    const cliente = clientePorNome(clientes, ag.cliente)

    // 1) Confirmação: agendamento de amanhã ainda pendente.
    if (ag.status === 'pendente' && ag.data === amanha && cliente) {
      if (
        !jaPreparada(mensagens, 'confirmacao', cliente.id, ag.id)
      ) {
        sugestoes.push({
          chave: `confirmacao:${ag.id}`,
          tipo: 'confirmacao',
          template: 'confirmacao',
          clienteId: cliente.id,
          cliente: ag.cliente,
          texto: textoTemplate('confirmacao', dadosDoAgendamento(ag)),
          agendamentoId: ag.id,
        })
      }
    }

    // 2) Lembrete: agendamento de hoje, respeitando a preferência de aviso.
    if (
      (ag.status === 'pendente' || ag.status === 'confirmado') &&
      ag.data === hoje &&
      cliente &&
      preferenciaAtiva(cliente, 'smsLembrete')
    ) {
      if (!jaPreparada(mensagens, 'lembrete', cliente.id, ag.id)) {
        sugestoes.push({
          chave: `lembrete:${ag.id}`,
          tipo: 'lembrete',
          template: 'lembrete',
          clienteId: cliente.id,
          cliente: ag.cliente,
          texto: textoTemplate('lembrete', dadosDoAgendamento(ag)),
          agendamentoId: ag.id,
        })
      }
    }

    // 3) Cancelamento: avisar quem cancelou um horário de hoje em diante.
    if (ag.status === 'cancelado' && ag.data >= hoje && cliente) {
      if (!jaPreparada(mensagens, 'cancelamento', cliente.id, ag.id)) {
        sugestoes.push({
          chave: `cancelamento:${ag.id}`,
          tipo: 'cancelamento',
          template: 'cancelamento',
          clienteId: cliente.id,
          cliente: ag.cliente,
          texto: textoTemplate('cancelamento', dadosDoAgendamento(ag)),
          agendamentoId: ag.id,
        })
      }
    }

    // 4) Reagendamento: avisar a remarcação atual (uma chave por horário).
    if (
      ag.remarcacoes &&
      ag.remarcacoes.length > 0 &&
      ag.data >= hoje &&
      (ag.status === 'pendente' || ag.status === 'confirmado') &&
      cliente
    ) {
      sugestoes.push({
        chave: `reagendamento:${ag.id}:${ag.data}:${ag.horario}`,
        tipo: 'reagendamento',
        template: 'reagendamento',
        clienteId: cliente.id,
        cliente: ag.cliente,
        texto: textoTemplate('reagendamento', dadosDoAgendamento(ag)),
        agendamentoId: ag.id,
      })
    }

    // 5) Horário liberado: cancelamento futuro vaga avisar quem está na fila.
    if (ag.status === 'cancelado' && ag.data > hoje) {
      const ocupado = agendamentos.some(
        (outra) =>
          outra.id !== ag.id &&
          outra.data === ag.data &&
          outra.horario === ag.horario &&
          outra.profissional === ag.profissional &&
          outra.status !== 'cancelado',
      )
      if (!ocupado) {
        for (const pedido of pedidos) {
          if (pedido.status !== 'aguardando') continue
          if (pedido.servico !== ag.servico) continue
          const aguardando = clientes.find((c) => c.id === pedido.clienteId)
          if (!aguardando?.ativo) continue
          if (
            !compativel(pedido, {
              data: ag.data,
              horario: ag.horario,
              profissional: ag.profissional,
            })
          )
            continue
          if (
            jaPreparada(
              mensagens,
              'horario_liberado',
              pedido.clienteId,
              ag.id,
            )
          )
            continue
          sugestoes.push({
            chave: `horario_liberado:${ag.id}:${pedido.id}`,
            tipo: 'horario_liberado',
            template: 'horario_liberado',
            clienteId: pedido.clienteId,
            cliente: pedido.cliente,
            texto: textoTemplate('horario_liberado', {
              nome: pedido.cliente,
              servico: ag.servico,
              profissional: ag.profissional,
              data: ag.data,
              horario: ag.horario,
            }),
            agendamentoId: ag.id,
          })
        }
      }
    }
  }

  // 6) Aniversário: hoje é o dia do cliente (marketing respeitado).
  for (const cliente of clientes) {
    if (!cliente.ativo) continue
    if (diasParaAniversario(cliente.nascimento, hoje) !== 0) continue
    if (!preferenciaAtiva(cliente, 'smsMarketing')) continue
    if (jaPreparada(mensagens, 'aniversario', cliente.id)) continue
    sugestoes.push({
      chave: `aniversario:${cliente.id}:${hoje.slice(0, 4)}`,
      tipo: 'aniversario',
      template: 'aniversario',
      clienteId: cliente.id,
      cliente: cliente.nome,
      texto: textoTemplate('aniversario', { nome: cliente.nome }),
    })
  }

  // 7) Inatividade:90+ dias sem atendimento, sem retorno marcado.
  const perfis = montarPerfis(clientes, agendamentos, lancamentos, hoje)
  for (const perfil of perfis) {
    const { cliente } = perfil
    if (!cliente.ativo) continue
    if (perfil.diasDesdeUltimo === null) continue
    if (perfil.diasDesdeUltimo < DIAS_INATIVO) continue
    if (proximoAgendamento(agendamentos, cliente.nome, hoje)) continue
    if (!preferenciaAtiva(cliente, 'smsMarketing')) continue
    if (jaPreparada(mensagens, 'reativacao', cliente.id)) continue
    sugestoes.push({
      chave: `inatividade:${cliente.id}:${perfil.ultimoAtendimento}`,
      tipo: 'inatividade',
      template: 'reativacao',
      clienteId: cliente.id,
      cliente: cliente.nome,
      texto: textoTemplate('reativacao', {
        nome: cliente.nome,
        ultimoAtendimento: perfil.ultimoAtendimento,
        diasSemAtendimento: perfil.diasDesdeUltimo,
      }),
    })
  }

  // 8) Vencimento do Clube: próxima, atrasada ou vencida (conta, não marketing).
  for (const assinatura of assinaturas) {
    if (assinatura.cancelada) continue
    const status = statusAssinatura(assinatura, hoje)
    if (
      status !== 'proxima_vencimento' &&
      status !== 'atrasada' &&
      status !== 'vencida'
    )
      continue
    const cliente = clientes.find((c) => c.id === assinatura.clienteId)
    if (!cliente?.ativo) continue
    sugestoes.push({
      chave: `vencimento_clube:${assinatura.id}:${assinatura.proximoVencimento}`,
      tipo: 'vencimento_clube',
      template: 'vencimento_clube',
      clienteId: cliente.id,
      cliente: assinatura.cliente,
      texto: textoTemplate('vencimento_clube', {
        nome: assinatura.cliente,
        plano: PLANOS_ROTULO[assinatura.plano],
        data: assinatura.proximoVencimento,
        diasVencimento: diasEntre(hoje, assinatura.proximoVencimento),
      }),
    })
  }

  return sugestoes.sort(
    (a, b) =>
      ordem(a.tipo) - ordem(b.tipo) ||
      a.cliente.localeCompare(b.cliente, 'pt-BR') ||
      a.chave.localeCompare(b.chave),
  )
}

/** Trava anti-duplicação: a chave já foi preparada ou ignorada. */
export function chaveTratada(
  tratadas: ReadonlySet<string> | readonly string[],
  chave: string,
): boolean {
  return 'has' in tratadas ? tratadas.has(chave) : tratadas.includes(chave)
}

/** Remove sugestões cuja chave já foi tratada (preparada ou ignorada). */
export function semTratadas(
  sugestoes: SugestaoAutomacao[],
  tratadas: ReadonlySet<string> | readonly string[],
): SugestaoAutomacao[] {
  return sugestoes.filter((s) => !chaveTratada(tratadas, s.chave))
}
