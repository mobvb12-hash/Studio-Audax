import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  avisosPersistencia,
  carregarJSON,
  limparAvisosPersistencia,
  salvarJSON,
} from './persistencia'

const CHAVE = 'studio-audax:teste:lista:v1'
const BACKUP = `${CHAVE}:corrompido`

function tiposAviso(): string[] {
  return avisosPersistencia().map((a) => a.tipo)
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
})

describe('persistencia — leitura segura', () => {
  it('JSON válido continua carregando normalmente, sem aviso nem backup', () => {
    localStorage.setItem(CHAVE, JSON.stringify([{ id: 'a' }]))
    expect(carregarJSON(CHAVE, [], Array.isArray)).toEqual([{ id: 'a' }])
    expect(avisosPersistencia()).toHaveLength(0)
    expect(localStorage.getItem(BACKUP)).toBeNull()
  })

  it('chave ausente devolve o padrão em silêncio (primeira execução)', () => {
    expect(carregarJSON(CHAVE, ['padrao'], Array.isArray)).toEqual(['padrao'])
    expect(avisosPersistencia()).toHaveLength(0)
    expect(localStorage.getItem(BACKUP)).toBeNull()
  })

  it('JSON inválido preserva o original em :corrompido, devolve fallback e avisa', () => {
    localStorage.setItem(CHAVE, '{quebrado')
    expect(carregarJSON(CHAVE, [], Array.isArray)).toEqual([])
    expect(localStorage.getItem(BACKUP)).toBe('{quebrado')
    expect(tiposAviso()).toContain('dado_corrompido')
    expect(avisosPersistencia()[0].mensagem).toBe(
      'Foi detectado um dado local corrompido; uma cópia foi preservada.',
    )
  })

  it('JSON com forma inesperada também é preservado e não apagado', () => {
    localStorage.setItem(CHAVE, '"uma string"')
    expect(carregarJSON(CHAVE, [], Array.isArray)).toEqual([])
    expect(localStorage.getItem(BACKUP)).toBe('"uma string"')
    expect(tiposAviso()).toContain('dado_corrompido')
  })

  it('o backup é gravado antes de a chave original ser alterada', () => {
    localStorage.setItem(CHAVE, 'conteudo-original')
    carregarJSON(CHAVE, [], Array.isArray)
    // no momento em que o fallback é devolvido, a cópia original já está no backup
    expect(localStorage.getItem(BACKUP)).toBe('conteudo-original')
    // o utilitário em si nunca reescreve a chave original
    expect(localStorage.getItem(CHAVE)).toBe('conteudo-original')
  })

  it('nunca sobrescreve um backup já existente (primeira cópia preservada)', () => {
    localStorage.setItem(CHAVE, 'dado-novo-quebrado')
    localStorage.setItem(BACKUP, 'primeira-copia')
    carregarJSON(CHAVE, [], Array.isArray)
    expect(localStorage.getItem(BACKUP)).toBe('primeira-copia')
    expect(tiposAviso()).toContain('dado_corrompido')
  })

  it('validador próprio é respeitado (forma aceita pelo store)', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ lista: [1] }))
    const ehObjeto = (v: unknown): v is { lista: number[] } =>
      typeof v === 'object' && v !== null && !Array.isArray(v)
    expect(carregarJSON(CHAVE, { lista: [] }, ehObjeto)).toEqual({ lista: [1] })
    expect(avisosPersistencia()).toHaveLength(0)
  })
})

describe('persistencia — gravação segura', () => {
  it('grava normalmente sem emitir aviso', () => {
    salvarJSON(CHAVE, [{ id: 'x' }])
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? 'null')).toEqual([
      { id: 'x' },
    ])
    expect(avisosPersistencia()).toHaveLength(0)
  })

  it('falha de setItem não é engolida: emite aviso e não lança', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })

    expect(() => salvarJSON(CHAVE, [])).not.toThrow()
    expect(tiposAviso()).toEqual(['falha_gravacao'])
    expect(avisosPersistencia()[0].mensagem).toBe(
      'Os dados locais do Studio Audax não puderam ser salvos.',
    )

    spy.mockRestore()
  })

  it('falhas repetidas deduplicam o mesmo aviso e limpar libera de novo', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })

    salvarJSON(CHAVE, [])
    salvarJSON(CHAVE, [])
    salvarJSON(CHAVE, [])
    expect(avisosPersistencia()).toHaveLength(1)

    limparAvisosPersistencia()
    expect(avisosPersistencia()).toHaveLength(0)

    salvarJSON(CHAVE, [])
    expect(avisosPersistencia()).toHaveLength(1)

    spy.mockRestore()
  })

  it('após a falha corrigida, a gravação volta a funcionar sem aviso', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })
    salvarJSON(CHAVE, [{ id: 'a' }])
    spy.mockRestore()
    limparAvisosPersistencia()

    salvarJSON(CHAVE, [{ id: 'a' }])
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? 'null')).toEqual([
      { id: 'a' },
    ])
    expect(avisosPersistencia()).toHaveLength(0)
  })
})
