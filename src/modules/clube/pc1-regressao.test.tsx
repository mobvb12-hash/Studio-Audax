// Regressão do P-C1 — rollback do pagamento de assinatura no Clube.
//
// `registrarReceitaClube` grava primeiro a receita no Caixa e só depois o
// pagamento no estado do Clube. Se algo falhar nessa janela, o lançamento do
// Caixa precisa ser desfeito para não deixar entrada órfã, o erro original
// precisa chegar intacto à UI e o retry precisa continuar possível.
//
// Falha injetada em `proximoVencimentoAposPagamento` — o único ponto da janela
// que executa código nosso entre a escrita no Caixa e o `setEstado`.
import { act, useEffect } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClubeProvider, useClube } from './store'

const { injetar } = vi.hoisted(() => ({ injetar: { falha: false } }))

vi.mock('./regras', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./regras')>()
  return {
    ...orig,
    proximoVencimentoAposPagamento: (venc: string, data: string): string => {
      if (injetar.falha) throw new Error('falha injetada')
      return orig.proximoVencimentoAposPagamento(venc, data)
    },
  }
})

const DIA = hojeISO()
let clube: ReturnType<typeof useClube>
let caixa: ReturnType<typeof useCaixa>

function Captura() {
  const clubeCtx = useClube()
  const caixaCtx = useCaixa()
  useEffect(() => {
    clube = clubeCtx
    caixa = caixaCtx
  })
  return null
}

function montar() {
  return render(
    <CaixaProvider>
      <ClubeProvider>
        <Captura />
      </ClubeProvider>
    </CaixaProvider>,
  )
}

const receitasClube = () => caixa.lancamentos.filter((l) => l.origem === 'clube')

function pagar() {
  clube.registrarPagamento({
    assinaturaId: clube.assinaturas[0].id,
    data: DIA,
    valor: 99.9,
    formaPagamento: 'dinheiro',
  })
}

function assinar(clienteId: string, cliente: string) {
  act(() => {
    clube.assinar({
      clienteId,
      cliente,
      plano: 'cabelo_barba',
      valorMensal: 99.9,
      dataAssinatura: DIA,
    })
  })
}

beforeEach(() => {
  localStorage.clear()
  injetar.falha = false
})

describe('P-C1 — rollback do pagamento de assinatura', () => {
  it('cria o lançamento do Clube no Caixa', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    expect(receitasClube()).toHaveLength(0)

    act(pagar)
    expect(receitasClube()).toHaveLength(1)
    expect(receitasClube()[0].origem).toBe('clube')
    expect(receitasClube()[0].valorLiquido).toBe(99.9)
    expect(receitasClube()[0].assinaturaId).toBe(clube.assinaturas[0].id)
    expect(clube.pagamentos).toHaveLength(1)
    expect(clube.pagamentos[0].caixaLancamentoId).toBe(receitasClube()[0].id)
    expect(caixa.resumoDoDia(DIA).receitasClube).toBe(99.9)
    expect(caixa.resumoDoDia(DIA).totalRecebido).toBe(99.9)
  })

  it('falha depois do lançamento desfaz a receita no Caixa', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    const antes = clube.assinaturas[0].proximoVencimento

    injetar.falha = true
    expect(() => act(pagar)).toThrow('falha injetada')

    // a receita foi desfeita: nada sobra no Caixa, nada sobra no Clube
    expect(receitasClube()).toHaveLength(0)
    expect(caixa.lancamentos).toHaveLength(0)
    expect(clube.pagamentos).toHaveLength(0)
    expect(clube.assinaturas[0].proximoVencimento).toBe(antes)
  })

  it('preserva o erro original e permite o retry', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    const antes = clube.assinaturas[0].proximoVencimento

    injetar.falha = true
    let visto: unknown = null
    try {
      act(pagar)
    } catch (erro) {
      visto = erro
    }
    // o erro não é mascarado nem trocado
    expect((visto as Error).message).toBe('falha injetada')

    // retry: não é barrado pelo marcador de ciclo e regrava coerente
    injetar.falha = false
    act(pagar)
    expect(receitasClube()).toHaveLength(1)
    expect(clube.pagamentos).toHaveLength(1)
    expect(clube.pagamentos[0].caixaLancamentoId).toBe(receitasClube()[0].id)
    expect(receitasClube()[0].valorLiquido).toBe(99.9)
    expect(clube.assinaturas[0].proximoVencimento).not.toBe(antes)
  })

  it('caminho feliz mantém o comportamento atual', () => {
    montar()
    assinar('cli-2', 'Ana Souza')
    const antes = clube.assinaturas[0].proximoVencimento

    act(pagar)

    expect(receitasClube()).toHaveLength(1)
    expect(receitasClube()[0].origem).toBe('clube')
    expect(receitasClube()[0].tipo).toBe('receita')
    expect(receitasClube()[0].formaPagamento).toBe('dinheiro')
    expect(receitasClube()[0].valorLiquido).toBe(99.9)
    expect(receitasClube()[0].estornado).toBeFalsy()

    expect(clube.pagamentos).toHaveLength(1)
    expect(clube.pagamentos[0].caixaLancamentoId).toBe(receitasClube()[0].id)
    expect(clube.pagamentos[0].vencimentoCoberto).toBe(antes)
    expect(clube.assinaturas[0].proximoVencimento).not.toBe(antes)

    expect(caixa.resumoDoDia(DIA).receitasClube).toBe(99.9)
    expect(caixa.resumoDoDia(DIA).totalRecebido).toBe(99.9)
  })

  it('caixa fechado bloqueia antes de qualquer alteração', () => {
    montar()
    assinar('cli-3', 'Bia Ramos')
    act(() => {
      caixa.fecharCaixa(DIA)
    })

    expect(() => act(pagar)).toThrow(/fechado/)

    expect(caixa.lancamentos).toHaveLength(0)
    expect(receitasClube()).toHaveLength(0)
    expect(clube.pagamentos).toHaveLength(0)
    expect(clube.assinaturas).toHaveLength(1)
  })
})
