import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { carregarJSON, salvarJSON } from '@/lib/persistencia'
import { useCaixa } from '@/modules/caixa/store'
import {
  EXPEDIENTE_PADRAO,
  duracaoBase,
  paraMinutos,
  validarProposta,
} from './regras'
import type {
  Agendamento,
  Bloqueio,
  Expediente,
  NovoAgendamentoInput,
  NovoBloqueioInput,
  StatusAgendamento,
} from './types'

const CHAVE_STORAGE = 'studio-audax:agendamentos:v1'
const CHAVE_BLOQUEIOS = 'studio-audax:bloqueios:v1'
const CHAVE_EXPEDIENTE = 'studio-audax:expediente:v1'

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

function carregarLista<T>(chave: string): T[] {
  return carregarJSON<T[]>(chave, [], Array.isArray)
}

function ehExpediente(valor: unknown): boolean {
  const salvo = valor as Expediente | null
  return Boolean(
    salvo &&
      typeof salvo.inicio === 'string' &&
      typeof salvo.fim === 'string' &&
      typeof salvo.almocoInicio === 'string' &&
      typeof salvo.almocoFim === 'string',
  )
}

function carregarExpediente(): Expediente {
  return carregarJSON<Expediente>(CHAVE_EXPEDIENTE, EXPEDIENTE_PADRAO, ehExpediente)
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
    carregarLista<Agendamento>(CHAVE_STORAGE),
  )
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>(() =>
    carregarLista<Bloqueio>(CHAVE_BLOQUEIOS),
  )
  const [expediente, setExpediente] = useState<Expediente>(() =>
    carregarExpediente(),
  )

  useEffect(() => {
    salvarJSON(CHAVE_STORAGE, agendamentos)
  }, [agendamentos])

  useEffect(() => {
    salvarJSON(CHAVE_BLOQUEIOS, bloqueios)
  }, [bloqueios])

  useEffect(() => {
    salvarJSON(CHAVE_EXPEDIENTE, expediente)
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

  const salvarExpediente = useCallback((entrada: Expediente) => {
    const inicio = paraMinutos(entrada.inicio)
    const fim = paraMinutos(entrada.fim)
    const almocoIni = paraMinutos(entrada.almocoInicio)
    const almocoFim = paraMinutos(entrada.almocoFim)
    if (!entrada.inicio || !entrada.fim || !entrada.almocoInicio || !entrada.almocoFim) {
      throw new Error('Informe início, fim e horário do almoço.')
    }
    if (inicio >= fim) {
      throw new Error('O fim do expediente deve ser depois do início.')
    }
    if (almocoIni > almocoFim) {
      throw new Error('O fim do almoço deve ser depois do início.')
    }
    if (almocoIni < inicio || almocoFim > fim) {
      throw new Error('O almoço deve ficar dentro do expediente.')
    }
    setExpediente(entrada)
  }, [])

  const criarBloqueio = useCallback((entrada: NovoBloqueioInput) => {
    const profissional = entrada.profissional.trim()
    const motivo = entrada.motivo.trim()
    if (!profissional) throw new Error('Informe o profissional.')
    if (!entrada.data) throw new Error('Informe a data do bloqueio.')
    if (entrada.dataFim && entrada.dataFim < entrada.data) {
      throw new Error('A data final deve ser depois da inicial.')
    }
    if (paraMinutos(entrada.inicio) >= paraMinutos(entrada.fim)) {
      throw new Error('O fim do bloqueio deve ser depois do início.')
    }
    if (entrada.tipo === 'outro' && !motivo) {
      throw new Error('Descreva o motivo do bloqueio.')
    }
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
  }, [])

  const removerBloqueio = useCallback((id: string) => {
    setBloqueios((atual) => atual.filter((b) => b.id !== id))
  }, [])

  const renomearProfissional = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      setAgendamentos((atual) =>
        atual.map((ag) =>
          ag.profissional === antigo ? { ...ag, profissional: destino } : ag,
        ),
      )
      setBloqueios((atual) =>
        atual.map((b) =>
          b.profissional === antigo ? { ...b, profissional: destino } : b,
        ),
      )
    },
    [],
  )

  const renomearServico = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setAgendamentos((atual) =>
      atual.map((ag) =>
        ag.servico === antigo ? { ...ag, servico: destino } : ag,
      ),
    )
  }, [])

  const renomearCliente = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setAgendamentos((atual) =>
      atual.map((ag) =>
        ag.cliente === antigo ? { ...ag, cliente: destino } : ag,
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
