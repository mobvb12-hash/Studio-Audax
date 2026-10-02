import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { carregarMeuClube } from '@/services/supabase/painel'
import type { ClubePainel } from '@/services/supabase/painel'
import PainelClube from './telas/PainelClube'

vi.mock('@/services/supabase/painel', () => ({
  carregarMeuClube: vi.fn(),
}))

const meuClube = vi.mocked(carregarMeuClube)

// vencimento distante: o status calculado ('Ativa') não depende da data
// em que o teste roda
const ASSINATURA: ClubePainel = {
  assinatura: {
    id: 'ass-1',
    clienteId: 'cli-1',
    cliente: 'Ana Silva',
    plano: 'cabelo_barba',
    valorMensal: 149.9,
    dataAssinatura: '2026-01-05',
    proximoVencimento: '2099-11-05',
    cancelada: false,
    criadoEm: '2026-01-05T10:00:00.000Z',
  },
  planoRotulo: 'Cabelo + Barba',
  pagamentos: [
    { data: '2026-10-01', valor: 149.9, formaPagamento: 'pix' },
    { data: '2026-09-01', valor: 149.9, formaPagamento: 'dinheiro' },
  ],
}

beforeEach(() => {
  meuClube.mockReset()
  meuClube.mockResolvedValue(ASSINATURA)
})

describe('PainelClube', () => {
  it('mostra plano, status, vencimento e pagamentos próprios', async () => {
    render(<PainelClube />)

    await waitFor(() =>
      expect(screen.getByText('Cabelo + Barba')).toBeTruthy(),
    )
    expect(screen.getByText('Mensalidade de R$ 149,90')).toBeTruthy()
    expect(screen.getByText('Ativa')).toBeTruthy()
    expect(screen.getByText('Próximo vencimento')).toBeTruthy()
    expect(screen.getByText(/5\/11\/2099/)).toBeTruthy()

    const lista = screen.getByRole('list')
    const texto = (lista.textContent ?? '').replace(/\u00a0/g, ' ')
    expect(texto).toContain('Pix')
    expect(texto).toContain('Dinheiro')
    expect(texto).toContain('R$ 149,90')
  })

  it('sem assinatura mostra o estado vazio honesto (sem auto-adesão)', async () => {
    meuClube.mockResolvedValue(null)
    render(<PainelClube />)

    await waitFor(() =>
      expect(
        screen.getByText(
          'Você ainda não tem uma assinatura do Clube Audax.',
        ),
      ).toBeTruthy(),
    )
    expect(
      screen.getByText(/As assinaturas são feitas direto no Studio/i),
    ).toBeTruthy()
  })

  it('assinatura cancelada aparece como cancelada, com data e motivo', async () => {
    meuClube.mockResolvedValue({
      ...ASSINATURA,
      assinatura: {
        ...ASSINATURA.assinatura,
        proximoVencimento: '2025-06-05',
        cancelada: true,
        canceladaEm: '2025-05-01',
        motivoCancelamento: 'mudou de cidade',
      },
      pagamentos: [],
    })
    render(<PainelClube />)

    await waitFor(() => expect(screen.getByText('Cancelada')).toBeTruthy())
    expect(
      screen.getByText(/Cancelada em .*1\/5\/2025 — mudou de cidade/),
    ).toBeTruthy()
    expect(
      screen.getByText('Nenhum pagamento registrado até agora.'),
    ).toBeTruthy()
  })

  it('falha de carga vira alerta com "Tentar de novo"', async () => {
    meuClube.mockRejectedValueOnce(new Error('rede fora'))
    render(<PainelClube />)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('rede fora'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() =>
      expect(screen.getByText('Cabelo + Barba')).toBeTruthy(),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
