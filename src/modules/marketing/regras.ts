// Regras puras de Marketing — públicos derivados dos dados reais de
// Clientes/Agenda/Caixa (sem cópia, sem estado, sem efeitos). Reutiliza
// a segmentação oficial do CRM em vez de criar regra paralela.
import { hojeISO } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import type { Cliente } from '@/modules/clientes/types'
import { aniversariantesDoMes, montarPerfis } from '@/modules/crm/regras'
import {
  PUBLICOS_DESCRICAO,
  PUBLICOS_ORDEM,
  PUBLICOS_ROTULO,
  type PublicoId,
} from './types'

export type Publico = {
  id: PublicoId
  rotulo: string
  descricao: string
  clientes: Cliente[]
}

/**
 * Públicos do marketing calculados na hora: segmentos do CRM +
 * aniversariantes do mês. A lista muda sozinha quando dados mudam —
 * por isso as listas salvas guardam só o público, não os clientes.
 */
export function montarPublicos(
  clientes: Cliente[],
  agendamentos: Agendamento[],
  lancamentos: Lancamento[],
  hoje: string = hojeISO(),
): Publico[] {
  const perfis = montarPerfis(clientes, agendamentos, lancamentos, hoje)
  const porSegmento = (id: PublicoId): Cliente[] => {
    if (id === 'inativos')
      return perfis.filter((p) => p.segmento === 'inativo').map((p) => p.cliente)
    if (id === 'sem_retorno')
      return perfis
        .filter((p) => p.segmento === 'sem_retorno')
        .map((p) => p.cliente)
    if (id === 'recorrentes')
      return perfis
        .filter((p) => p.segmento === 'recorrente')
        .map((p) => p.cliente)
    if (id === 'novos')
      return perfis.filter((p) => p.segmento === 'novo').map((p) => p.cliente)
    return aniversariantesDoMes(clientes, hoje)
  }

  return PUBLICOS_ORDEM.map((id) => ({
    id,
    rotulo: PUBLICOS_ROTULO[id],
    descricao: PUBLICOS_DESCRICAO[id],
    clientes: porSegmento(id),
  }))
}
