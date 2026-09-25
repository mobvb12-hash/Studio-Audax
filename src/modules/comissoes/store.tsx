import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { PERCENTUAL_PADRAO } from './types'
import type {
  ConfigComissao,
  EventoAuditoriaComissao,
  FecharComissaoInput,
  FechamentoComissao,
  NovaConfigInput,
  Periodo,
} from './types'

const CHAVE_CONFIGS = 'studio-audax:comissoes:configs:v1'
const CHAVE_FECHAMENTOS = 'studio-audax:comissoes:fechamentos:v1'
const CHAVE_AUDITORIA = 'studio-audax:comissoes:auditoria:v1'

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function carregar<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave)
    if (!bruto) return padrao
    const valor = JSON.parse(bruto) as T
    if (Array.isArray(valor)) return valor
    return padrao
  } catch {
    return padrao
  }
}

export type ComissoesContexto = {
  configs: ConfigComissao[]
  fechamentos: FechamentoComissao[]
  auditoria: EventoAuditoriaComissao[]
  configDe: (profissionalId: string) => ConfigComissao
  salvarConfig: (profissionalId: string, input: NovaConfigInput) => void
  fechamentoAtivo: (
    profissionalId: string,
    periodo: Periodo,
  ) => FechamentoComissao | undefined
  fecharComissao: (input: FecharComissaoInput) => FechamentoComissao
  reabrirComissao: (fechamentoId: string, motivo: string) => void
}

const Contexto = createContext<ComissoesContexto | null>(null)

export function ComissoesProvider({ children }: { children: ReactNode }) {
  const [configs, setConfigs] = useState<ConfigComissao[]>(() =>
    carregar<ConfigComissao[]>(CHAVE_CONFIGS, []),
  )
  const [fechamentos, setFechamentos] = useState<FechamentoComissao[]>(() =>
    carregar<FechamentoComissao[]>(CHAVE_FECHAMENTOS, []),
  )
  const [auditoria, setAuditoria] = useState<EventoAuditoriaComissao[]>(() =>
    carregar<EventoAuditoriaComissao[]>(CHAVE_AUDITORIA, []),
  )

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_CONFIGS, JSON.stringify(configs))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [configs])

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify(fechamentos))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [fechamentos])

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_AUDITORIA, JSON.stringify(auditoria))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [auditoria])

  const configDe = useCallback(
    (profissionalId: string): ConfigComissao =>
      configs.find((c) => c.profissionalId === profissionalId) ?? {
        profissionalId,
        percentual: PERCENTUAL_PADRAO,
        ativo: true,
      },
    [configs],
  )

  const salvarConfig = useCallback(
    (profissionalId: string, input: NovaConfigInput) => {
      if (!profissionalId) throw new Error('Profissional sem identificação.')
      if (!Number.isFinite(input.percentual) || input.percentual < 0) {
        throw new Error('Percentual inválido (mínimo 0).')
      }
      if (input.percentual > 100) {
        throw new Error('O percentual não pode ser maior que 100%.')
      }
      setConfigs((atual) => {
        const existente = atual.find(
          (c) => c.profissionalId === profissionalId,
        )
        if (existente) {
          return atual.map((c) =>
            c.profissionalId === profissionalId
              ? {
                  ...c,
                  percentual: input.percentual,
                  ativo: input.ativo,
                }
              : c,
          )
        }
        return [
          ...atual,
          {
            profissionalId,
            percentual: input.percentual,
            ativo: input.ativo,
          },
        ]
      })
    },
    [],
  )

  const fechamentoAtivo = useCallback(
    (profissionalId: string, periodo: Periodo) =>
      fechamentos.find(
        (f) =>
          f.profissionalId === profissionalId &&
          f.periodo.inicio === periodo.inicio &&
          f.periodo.fim === periodo.fim &&
          !f.reaberto,
      ),
    [fechamentos],
  )

  const fecharComissao = useCallback(
    (input: FecharComissaoInput): FechamentoComissao => {
      if (!input.profissionalId) throw new Error('Profissional sem identificação.')
      if (!input.periodo.inicio || !input.periodo.fim) {
        throw new Error('Período inválido.')
      }
      if (input.periodo.inicio > input.periodo.fim) {
        throw new Error('O início do período não pode ser depois do fim.')
      }
      if (fechamentoAtivo(input.profissionalId, input.periodo)) {
        throw new Error(
          'Já existe comissão fechada para este profissional neste período.',
        )
      }
      if (!Number.isFinite(input.producao) || input.producao < 0) {
        throw new Error('Produção inválida.')
      }
      if (
        !Number.isFinite(input.percentual) ||
        input.percentual < 0 ||
        input.percentual > 100
      ) {
        throw new Error('Percentual inválido.')
      }
      if (!Number.isFinite(input.comissao) || input.comissao < 0) {
        throw new Error('Comissão inválida (não pode ser negativa).')
      }

      const agora = new Date().toISOString()
      const fechamento: FechamentoComissao = {
        id: gerarId(),
        profissionalId: input.profissionalId,
        profissionalNome: input.profissionalNome,
        periodo: { ...input.periodo },
        qtdAtendimentos: input.qtdAtendimentos,
        producao: input.producao,
        percentual: input.percentual,
        comissao: input.comissao,
        fechadoEm: agora,
      }
      const evento: EventoAuditoriaComissao = {
        id: gerarId(),
        acao: 'fechamento',
        profissionalId: input.profissionalId,
        profissionalNome: input.profissionalNome,
        periodo: { ...input.periodo },
        descricao: `Comissão de ${input.profissionalNome} fechada em ${formatarDatas(agora)} — ${input.comissao.toFixed(2).replace('.', ',')}`,
        criadoEm: agora,
      }
      setFechamentos((atual) => [...atual, fechamento])
      setAuditoria((atual) => [...atual, evento])
      return fechamento
    },
    [fechamentoAtivo],
  )

  const reabrirComissao = useCallback(
    (fechamentoId: string, motivo: string) => {
      const alvo = fechamentos.find((f) => f.id === fechamentoId)
      if (!alvo) throw new Error('Fechamento não encontrado.')
      if (alvo.reaberto) throw new Error('Esta comissão já foi reaberta.')
      if (motivo.trim().length < 3) {
        throw new Error('Informe o motivo da reabertura (mín. 3 letras).')
      }
      const agora = new Date().toISOString()
      const evento: EventoAuditoriaComissao = {
        id: gerarId(),
        acao: 'reabertura',
        profissionalId: alvo.profissionalId,
        profissionalNome: alvo.profissionalNome,
        periodo: { ...alvo.periodo },
        descricao: `Comissão de ${alvo.profissionalNome} (${alvo.periodo.inicio} a ${alvo.periodo.fim}) reaberta`,
        motivo: motivo.trim(),
        criadoEm: agora,
      }
      setFechamentos((atual) =>
        atual.map((f) =>
          f.id === fechamentoId
            ? { ...f, reaberto: { em: agora, motivo: motivo.trim() } }
            : f,
        ),
      )
      setAuditoria((atual) => [...atual, evento])
    },
    [fechamentos],
  )

  const valor = useMemo(
    () => ({
      configs,
      fechamentos,
      auditoria,
      configDe,
      salvarConfig,
      fechamentoAtivo,
      fecharComissao,
      reabrirComissao,
    }),
    [
      configs,
      fechamentos,
      auditoria,
      configDe,
      salvarConfig,
      fechamentoAtivo,
      fecharComissao,
      reabrirComissao,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

function formatarDatas(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function useComissoes(): ComissoesContexto {
  const ctx = useContext(Contexto)
  if (!ctx)
    throw new Error('useComissoes deve ser usado dentro de ComissoesProvider')
  return ctx
}
