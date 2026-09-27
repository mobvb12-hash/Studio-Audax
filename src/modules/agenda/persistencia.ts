import { carregarJSON, salvarJSON } from '@/lib/persistencia'
import { EXPEDIENTE_PADRAO } from './regras'
import type { Agendamento, Bloqueio, Expediente } from './types'

export const CHAVE_STORAGE = 'studio-audax:agendamentos:v1'
export const CHAVE_BLOQUEIOS = 'studio-audax:bloqueios:v1'
export const CHAVE_EXPEDIENTE = 'studio-audax:expediente:v1'

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

export function carregarAgendamentos(): Agendamento[] {
  return carregarLista<Agendamento>(CHAVE_STORAGE)
}

export function carregarBloqueios(): Bloqueio[] {
  return carregarLista<Bloqueio>(CHAVE_BLOQUEIOS)
}

export function carregarExpediente(): Expediente {
  return carregarJSON<Expediente>(CHAVE_EXPEDIENTE, EXPEDIENTE_PADRAO, ehExpediente)
}

export function salvarAgendamentos(lista: Agendamento[]): void {
  salvarJSON(CHAVE_STORAGE, lista)
}

export function salvarBloqueios(lista: Bloqueio[]): void {
  salvarJSON(CHAVE_BLOQUEIOS, lista)
}

export function salvarExpedienteJSON(expediente: Expediente): void {
  salvarJSON(CHAVE_EXPEDIENTE, expediente)
}
