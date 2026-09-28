// Regressão do validador de `studio-audax:clube:v1`.
//
// Contexto: o aviso "Foi detectado um dado local corrompido; uma cópia foi
// preservada" apareceu para `studio-audax:clube:v1:corrompido` com conteúdo
// `{"assinaturas":[],"pagamentos":[]}` — que é um estado do Clube
// PERFEITAMENTE VÁLIDO. Clube sem assinatura nenhuma é um estado legítimo, não
// corrupção.
//
// O validador antigo aceitava qualquer objeto (`typeof === 'object'`) e
// `carregarEstado` convertia em `[]` uma lista gravada com forma errada. O
// `[]` resultante era gravado de volta por `salvarJSON`, sobrescrevendo o
// original SEM backup e SEM aviso: dado corrompido sumia em silêncio. Este
// arquivo trava os dois lados — o que é aceito e o que é preservado.
import { act } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { carregarJSON } from '@/lib/persistencia'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClubeProvider, useClube } from './store'

const CHAVE_CLUBE = 'studio-audax:clube:v1'
const BACKUP = `${CHAVE_CLUBE}:corrompido`

/**
 * Cópia do validador de `clube/store.tsx`. O original não é exportado; esta
 * duplicata éSubject a mudar junto — o teste de integração abaixo monta o
 * provider de verdade e pega qualquer divergência.
 */
function ehEstadoClube(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return false
  }
  const estado = valor as { assinaturas?: unknown; pagamentos?: unknown }
  if (estado.assinaturas !== undefined && !Array.isArray(estado.assinaturas)) {
    return false
  }
  if (estado.pagamentos !== undefined && !Array.isArray(estado.pagamentos)) {
    return false
  }
  return true
}

const assinaturaValida = {
  id: 'as-1',
  clienteId: 'cl-1',
  plano: 'Cabelo',
  valor: 90,
  inicio: '2026-01-01',
  proximoVencimento: '2026-02-01',
  desconto: 10,
  cancelada: false,
  canceladaEm: null,
  motivo: null,
  criadoEm: '2026-01-01T00:00:00.000Z',
}

const pagamentoValido = {
  id: 'pg-1',
  assinaturaId: 'as-1',
  vencimentoCoberto: '2026-02-01',
  valor: 90,
  data: '2026-02-01',
  caixaLancamentoId: 'lc-1',
  criadoEm: '2026-02-01T00:00:00.000Z',
}

// ---------------------------------------------------------------------------
// 1. O validador aceita estado vazio e listas válidas
// ---------------------------------------------------------------------------

describe('ehEstadoClube — estados que NÃO são corrupção', () => {
  it('aceita o estado vazio do clube (o caso reportado)', () => {
    expect(ehEstadoClube({ assinaturas: [], pagamentos: [] })).toBe(true)
  })

  it('aceita objeto sem nenhuma das listas', () => {
    expect(ehEstadoClube({})).toBe(true)
  })

  it('aceita somente assinaturas, somente pagamentos ou as duas listas vazias', () => {
    expect(ehEstadoClube({ assinaturas: [] })).toBe(true)
    expect(ehEstadoClube({ pagamentos: [] })).toBe(true)
  })

  it('aceita assinaturas válidas', () => {
    expect(ehEstadoClube({ assinaturas: [assinaturaValida], pagamentos: [] })).toBe(
      true,
    )
  })

  it('aceita pagamentos válidos', () => {
    expect(ehEstadoClube({ assinaturas: [], pagamentos: [pagamentoValido] })).toBe(
      true,
    )
  })

  it('aceita as duas listas preenchidas', () => {
    expect(
      ehEstadoClube({
        assinaturas: [assinaturaValida],
        pagamentos: [pagamentoValido],
      }),
    ).toBe(true)
  })

  it('NÃO aceita lista com a forma errada (a perda silenciosa de dado)', () => {
    expect(ehEstadoClube({ assinaturas: 'nao-e-array', pagamentos: [] })).toBe(
      false,
    )
    expect(ehEstadoClube({ assinaturas: [], pagamentos: {} })).toBe(false)
    expect(ehEstadoClube({ assinaturas: 0, pagamentos: [] })).toBe(false)
  })

  it('NÃO aceita o que nunca foi estado do clube', () => {
    expect(ehEstadoClube('nao-e-objeto')).toBe(false)
    expect(ehEstadoClube(null)).toBe(false)
    expect(ehEstadoClube([])).toBe(false)
    expect(ehEstadoClube([assinaturaValida])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. carregarJSON: estado vazio NÃO gera :corrompido
// ---------------------------------------------------------------------------

describe('carregarJSON na chave do clube', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('estado vazio é aceito e NÃO é marcado como corrompido', () => {
    const original = '{"assinaturas":[],"pagamentos":[]}'
    localStorage.setItem(CHAVE_CLUBE, original)

    const valor = carregarJSON<Partial<{ assinaturas: unknown[]; pagamentos: unknown[] }>>(
      CHAVE_CLUBE,
      {},
      ehEstadoClube,
    )

    expect(valor.assinaturas).toEqual([])
    expect(valor.pagamentos).toEqual([])
    // nada de backup, nada de aviso, nada apagado
    expect(localStorage.getItem(BACKUP)).toBeNull()
    expect(localStorage.getItem(CHAVE_CLUBE)).toBe(original)
  })

  it('dado realmente inválido é preservado em :corrompido, sem apagar o original', () => {
    const invalido = '{"assinaturas":"nao-e-array","pagamentos":[]}'
    localStorage.setItem(CHAVE_CLUBE, invalido)

    const valor = carregarJSON<Partial<{ assinaturas: unknown[]; pagamentos: unknown[] }>>(
      CHAVE_CLUBE,
      {},
      ehEstadoClube,
    )

    // fallback seguro
    expect(valor).toEqual({})
    // original preservado para não se perder
    expect(localStorage.getItem(BACKUP)).toBe(invalido)
  })

  it('JSON quebrado também é preservado', () => {
    localStorage.setItem(CHAVE_CLUBE, '{quebrado')

    carregarJSON(CHAVE_CLUBE, {}, ehEstadoClube)

    expect(localStorage.getItem(BACKUP)).toBe('{quebrado')
  })
})

// ---------------------------------------------------------------------------
// 3. Integração: o provider real do Clube
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase', () => ({ supabase: () => null }))

type Captura = { assinaturas: unknown[]; pagamentos: unknown[] }
let capturado: Captura = { assinaturas: [], pagamentos: [] }

function Sondagem() {
  const clube = useClube()
  capturado = { assinaturas: clube.assinaturas, pagamentos: clube.pagamentos }
  return null
}

function montar(): void {
  // ClubeProvider usa useCaixa (grava o pagamento no caixa), então precisa
  // do CaixaProvider por fora — mesmo montagem de src/modules/clube/store.test.tsx.
  act(() => {
    render(
      <CaixaProvider>
        <ClubeProvider>
          <Sondagem />
        </ClubeProvider>
      </CaixaProvider>,
    )
  })
}

describe('ClubeProvider — estado vazio não é corrupção', () => {
  beforeEach(() => {
    localStorage.clear()
    capturado = { assinaturas: [], pagamentos: [] }
  })

  it('carrega o estado vazio preservado e NÃO cria :corrompido', () => {
    localStorage.setItem(CHAVE_CLUBE, '{"assinaturas":[],"pagamentos":[]}')

    montar()

    expect(capturado.assinaturas).toEqual([])
    expect(capturado.pagamentos).toEqual([])
    expect(localStorage.getItem(BACKUP)).toBeNull()
  })

  it('carrega assinaturas gravadas sem tocar no backup', () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({ assinaturas: [assinaturaValida], pagamentos: [] }),
    )

    montar()

    expect(capturado.assinaturas).toHaveLength(1)
    expect(capturado.assinaturas[0]).toMatchObject({ id: 'as-1' })
    expect(localStorage.getItem(BACKUP)).toBeNull()
  })

  it('carrega pagamentos gravados sem tocar no backup', () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({ assinaturas: [], pagamentos: [pagamentoValido] }),
    )

    montar()

    expect(capturado.pagamentos).toHaveLength(1)
    expect(capturado.pagamentos[0]).toMatchObject({ id: 'pg-1' })
    expect(localStorage.getItem(BACKUP)).toBeNull()
  })

  it('estado com lista de forma errada é preservado em :corrompido', () => {
    const invalido = '{"assinaturas":{"id":"as-1"},"pagamentos":[]}'
    localStorage.setItem(CHAVE_CLUBE, invalido)

    montar()

    // fallback vazio, nada inventado
    expect(capturado.assinaturas).toEqual([])
    expect(capturado.pagamentos).toEqual([])
    // o dado NÃO some: fica preservado para recuperação
    expect(localStorage.getItem(BACKUP)).toBe(invalido)
  })
})
