import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { normalizarTexto } from '@/lib/moeda'
import { useCaixa } from '@/modules/caixa/store'
import {
  carregarAgendamentos,
  carregarBloqueios,
  carregarExpediente,
  salvarAgendamentos,
  salvarBloqueios,
  salvarExpedienteJSON,
} from './persistencia'
import {
  duracaoBase,
  validarBloqueio,
  validarExpediente,
  validarProposta,
} from './regras'
import type {
  Agendamento,
  Bloqueio,
  EdicaoAgendamentoInput,
  Expediente,
  NovoAgendamentoInput,
  NovoBloqueioInput,
  StatusAgendamento,
} from './types'

type AgendaContexto = {
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
  expediente: Expediente
  /** Cria validando expediente, almoço, bloqueios e conflito (lança erro) */
  adicionar: (input: NovoAgendamentoInput) => Agendamento
  mudarStatus: (id: string, status: StatusAgendamento) => void
  remover: (id: string) => void
  porData: (dataISO: string) => Agendamento[]
  /**
   * Move o agendamento para nova data/horário/profissional mantendo o id,
   * o status e registrando a remarcação no histórico (lança erro se ocupado).
   */
  remarcar: (
    id: string,
    novo: { data: string; horario: string; profissional: string },
  ) => Agendamento
  /** Persiste o expediente validando os horários (lança erro) */
  salvarExpediente: (entrada: Expediente) => void
  /**
   * Edita cliente, telefone, serviço e observação mantendo id, status,
   * data/horário/profissional (mover é remarcação). Revalida conflito com a
   * nova duração e bloqueia quando o agendamento já foi pago (lança erro).
   */
  editar: (id: string, entrada: EdicaoAgendamentoInput) => Agendamento
  criarBloqueio: (entrada: NovoBloqueioInput) => Bloqueio
  removerBloqueio: (id: string) => void
  /** Propaga renomeações de cadastro para os agendamentos existentes */
  renomearProfissional: (antigo: string, novo: string) => void
  renomearServico: (antigo: string, novo: string) => void
  renomearCliente: (antigo: string, novo: string) => void
}

const Contexto = createContext<AgendaContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function ordenar(lista: Agendamento[]): Agendamento[] {
  return [...lista].sort((a, b) =>
    `${a.data} ${a.horario}`.localeCompare(`${b.data} ${b.horario}`),
  )
}

/**
 * Consulta o jaPago do CaixaProvider (pagamento não estornado do agendamento).
 * Na app o AgendaProvider fica dentro do CaixaProvider; quando montado isolado,
 * sem CaixaProvider por fora, a trava de pagamento fica desligada.
 */
function useJaPago(): (agendamentoId: string) => boolean {
  let jaPago: ((agendamentoId: string) => boolean) | undefined
  try {
    const caixa = useCaixa()
    jaPago = (id) => Boolean(caixa.jaPago(id))
  } catch {
    jaPago = undefined
  }
  return useCallback((id) => Boolean(jaPago?.(id)), [jaPago])
}

export function AgendaProvider({ children }: { children: ReactNode }) {
  const jaPago = useJaPago()
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>(() =>
    carregarAgendamentos(),
  )
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>(() =>
    carregarBloqueios(),
  )
  const [expediente, setExpediente] = useState<Expediente>(() =>
    carregarExpediente(),
  )

  useEffect(() => {
    salvarAgendamentos(agendamentos)
  }, [agendamentos])

  useEffect(() => {
    salvarBloqueios(bloqueios)
  }, [bloqueios])

  useEffect(() => {
    salvarExpedienteJSON(expediente)
  }, [expediente])

  const adicionar = useCallback(
    (input: NovoAgendamentoInput) => {
      const duracaoMin = input.duracaoMin ?? duracaoBase(input.servico)
      const resultado = validarProposta({
        agendamentos,
        bloqueios,
        expediente,
        data: input.data,
        horario: input.horario,
        profissional: input.profissional,
        duracaoMin,
      })
      if (!resultado.ok) throw new Error(resultado.erro)

      const novo: Agendamento = {
        id: gerarId(),
        cliente: input.cliente.trim(),
        telefone: input.telefone.trim(),
        servico: input.servico,
        profissional: input.profissional,
        data: input.data,
        horario: input.horario,
        status: 'pendente',
        observacao: input.observacao.trim(),
        criadoEm: new Date().toISOString(),
        duracaoMin,
      }
      setAgendamentos((atual) => ordenar([...atual, novo]))
      return novo
    },
    [agendamentos, bloqueios, expediente],
  )

  const mudarStatus = useCallback(
    (id: string, status: StatusAgendamento) => {
      if (status === 'cancelado' && jaPago(id)) {
        throw new Error(
          'Este agendamento já foi pago. Estorne o pagamento no Caixa antes de cancelar.',
        )
      }
      setAgendamentos((atual) =>
        atual.map((ag) => (ag.id === id ? { ...ag, status } : ag)),
      )
    },
    [jaPago],
  )

  const remover = useCallback(
    (id: string) => {
      if (jaPago(id)) {
        throw new Error(
          'Este agendamento já foi pago. Estorne o pagamento no Caixa antes de excluir.',
        )
      }
      setAgendamentos((atual) => atual.filter((ag) => ag.id !== id))
    },
    [jaPago],
  )

  const remarcar = useCallback(
    (id: string, novo: { data: string; horario: string; profissional: string }) => {
      const ag = agendamentos.find((a) => a.id === id)
      if (!ag) throw new Error('Agendamento não encontrado.')
      const igual =
        ag.data === novo.data &&
        ag.horario === novo.horario &&
        ag.profissional === novo.profissional
      if (igual) return ag

      const duracaoMin = ag.duracaoMin ?? duracaoBase(ag.servico)
      const resultado = validarProposta({
        agendamentos,
        bloqueios,
        expediente,
        data: novo.data,
        horario: novo.horario,
        profissional: novo.profissional,
        duracaoMin,
        ignorarId: id,
      })
      if (!resultado.ok) throw new Error(resultado.erro)

      const em = new Date().toISOString()
      setAgendamentos((atual) =>
        ordenar(
          atual.map((a) =>
            a.id === id
              ? {
                  ...a,
                  data: novo.data,
                  horario: novo.horario,
                  profissional: novo.profissional,
                  remarcacoes: [
                    ...(a.remarcacoes ?? []),
                    {
                      de: {
                        data: a.data,
                        horario: a.horario,
                        profissional: a.profissional,
                      },
                      em,
                    },
                  ],
                }
              : a,
          ),
        ),
      )
      return { ...ag, ...novo }
    },
    [agendamentos, bloqueios, expediente],
  )

  const editar = useCallback(
    (id: string, entrada: EdicaoAgendamentoInput) => {
      const ag = agendamentos.find((a) => a.id === id)
      if (!ag) throw new Error('Agendamento não encontrado.')
      if (jaPago(id)) {
        throw new Error(
          'Este agendamento já foi pago. Estorne o pagamento no Caixa antes de editar.',
        )
      }
      const cliente = entrada.cliente.trim()
      if (cliente.length < 2) {
        throw new Error('Informe o nome do cliente.')
      }
      if (!entrada.servico) {
        throw new Error('Cadastre um serviço no módulo Serviços antes de editar.')
      }
      const servicoMudou = entrada.servico !== ag.servico
      const duracaoMin = servicoMudou
        ? entrada.duracaoMin ?? duracaoBase(entrada.servico)
        : (ag.duracaoMin ?? duracaoBase(entrada.servico))
      const resultado = validarProposta({
        agendamentos,
        bloqueios,
        expediente,
        data: ag.data,
        horario: ag.horario,
        profissional: ag.profissional,
        duracaoMin,
        ignorarId: id,
      })
      if (!resultado.ok) throw new Error(resultado.erro)

      const editado: Agendamento = {
        ...ag,
        cliente,
        telefone: entrada.telefone.trim(),
        servico: entrada.servico,
        observacao: entrada.observacao.trim(),
        duracaoMin,
      }
      setAgendamentos((atual) =>
        ordenar(atual.map((a) => (a.id === id ? editado : a))),
      )
      return editado
    },
    [agendamentos, bloqueios, expediente, jaPago],
  )

  const salvarExpediente = useCallback((entrada: Expediente) => {
    const erro = validarExpediente(entrada)
    if (erro) throw new Error(erro)
    setExpediente(entrada)
  }, [])

  const criarBloqueio = useCallback((entrada: NovoBloqueioInput) => {
    const erro = validarBloqueio(entrada, bloqueios)
    if (erro) throw new Error(erro)
    const profissional = entrada.profissional.trim()
    const motivo = entrada.motivo.trim()
    const novo: Bloqueio = {
      id: gerarId(),
      profissional,
      data: entrada.data,
      dataFim: entrada.dataFim || undefined,
      inicio: entrada.inicio,
      fim: entrada.fim,
      tipo: entrada.tipo,
      motivo,
      criadoEm: new Date().toISOString(),
    }
    setBloqueios((atual) =>
      [...atual, novo].sort((a, b) =>
        `${a.data} ${a.inicio}`.localeCompare(`${b.data} ${b.inicio}`),
      ),
    )
    return novo
  }, [bloqueios])

  const removerBloqueio = useCallback((id: string) => {
    setBloqueios((atual) => atual.filter((b) => b.id !== id))
  }, [])

  const renomearProfissional = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      // Propagação casa por chave normalizada (mesma regra do dedupe do
      // cadastro): dado legado com caixa/acentos diferentes não engancha.
      const chave = normalizarTexto(antigo)
      setAgendamentos((atual) =>
        atual.map((ag) =>
          normalizarTexto(ag.profissional) === chave
            ? { ...ag, profissional: destino }
            : ag,
        ),
      )
      setBloqueios((atual) =>
        atual.map((b) =>
          normalizarTexto(b.profissional) === chave
            ? { ...b, profissional: destino }
            : b,
        ),
      )
    },
    [],
  )

  const renomearServico = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    const chave = normalizarTexto(antigo)
    setAgendamentos((atual) =>
      atual.map((ag) =>
        normalizarTexto(ag.servico) === chave ? { ...ag, servico: destino } : ag,
      ),
    )
  }, [])

  const renomearCliente = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    const chave = normalizarTexto(antigo)
    setAgendamentos((atual) =>
      atual.map((ag) =>
        normalizarTexto(ag.cliente) === chave ? { ...ag, cliente: destino } : ag,
      ),
    )
  }, [])

  const porData = useCallback(
    (dataISO: string) =>
      agendamentos
        .filter((ag) => ag.data === dataISO && ag.status !== 'cancelado')
        .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos],
  )

  const valor = useMemo(
    () => ({
      agendamentos,
      bloqueios,
      expediente,
      adicionar,
      mudarStatus,
      remover,
      porData,
      remarcar,
      editar,
      salvarExpediente,
      criarBloqueio,
      removerBloqueio,
      renomearProfissional,
      renomearServico,
      renomearCliente,
    }),
    [
      agendamentos,
      bloqueios,
      expediente,
      adicionar,
      mudarStatus,
      remover,
      porData,
      remarcar,
      editar,
      salvarExpediente,
      criarBloqueio,
      removerBloqueio,
      renomearProfissional,
      renomearServico,
      renomearCliente,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAgenda(): AgendaContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAgenda deve ser usado dentro de AgendaProvider')
  return ctx
}
