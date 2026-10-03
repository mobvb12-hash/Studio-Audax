import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { carregarBeneficiosClube, carregarMeuClube } from '@/services/supabase/painel'
import type { ClubePainel } from '@/services/supabase/painel'
import PainelClube from './telas/PainelClube'

vi.mock('@/services/supabase/painel', () => ({
  carregarMeuClube: vi.fn(),
  carregarBeneficiosClube: vi.fn(),
}))

const meuClube = vi.mocked(carregarMeuClube)
const beneficios = vi.mocked(carregarBeneficiosClube)

// Vencimento distante: o status não depende da data em que o teste roda.
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

/** O config oficial do Club, como a migration 034 devolve. */
const BENEFICIOS = {
  coberturas: {
    cabelo: ['Cabelo'],
    barba: ['Barba'],
    cabelo_barba: ['Cabelo', 'Barba'],
  },
  desconto: { quimicos: 0.1, produtos: 0.1 },
  rotulos: {},
}

/** Vencimento passado de N dias, para cair no status pedido. */
function vencido(ha: number): string {
  const d = new Date()
  d.setDate(d.getDate() - ha)
  // Data LOCAL, não `toISOString()`: em Recife (UTC-3), à noite, o UTC já virou
  // o dia seguinte e o teste passaria a medir outro dia.
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

beforeEach(() => {
  meuClube.mockReset()
  meuClube.mockResolvedValue(ASSINATURA)
  beneficios.mockReset()
  beneficios.mockResolvedValue(BENEFICIOS)
})

describe('PainelClube', () => {
  it('mostra plano, status, validade e pagamentos próprios', async () => {
    render(<PainelClube />)

    await waitFor(() =>
      expect(screen.getByText('Plano: Audax Corte + Barba')).toBeTruthy(),
    )
    expect(screen.getByText('Mensalidade de R$ 149,90')).toBeTruthy()
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByText('Válido até')).toBeTruthy()
    expect(screen.getByText(/5\/11\/2099/)).toBeTruthy()

    const listas = screen.getAllByRole('list')
    const texto = (listas[listas.length - 1].textContent ?? '').replace(
      /\u00a0/g,
      ' ',
    )
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

  it('ATIVO: mostra os benefícios e diz que dá para usar', async () => {
    render(<PainelClube />)

    await waitFor(() => expect(screen.getByText('Ativo')).toBeTruthy())
    expect(
      screen.getByText(/Seu plano está ativo.*podem ser usados/i),
    ).toBeTruthy()
    expect(
      screen.getByText('cabelo e barba ilimitados durante a vigência'),
    ).toBeTruthy()
    expect(screen.getByText('10% em procedimentos químicos')).toBeTruthy()
    expect(screen.getByText('10% em produtos')).toBeTruthy()
  })

  it('EM ATRASO: avisa o pagamento pendente e não promete benefício', async () => {
    meuClube.mockResolvedValue({
      ...ASSINATURA,
      assinatura: {
        ...ASSINATURA.assinatura,
        proximoVencimento: vencido(5),
      },
      pagamentos: [],
    })
    render(<PainelClube />)

    await waitFor(() => expect(screen.getByText('Em atraso')).toBeTruthy())
    expect(screen.getByText(/Há um pagamento pendente/i)).toBeTruthy()
    // O cliente continua cliente: o aviso não proíbe o agendamento.
    expect(screen.getByText(/marcando horário normalmente/i)).toBeTruthy()
    // Benefício bloqueado: a lista existe, mas riscada.
    const item = screen.getByText('cabelo e barba ilimitados durante a vigência')
    expect(item.closest('li')?.className ?? '').toMatch(/line-through/)
  })

  it('EXPIRADO: diz que a vigência acabou e não libera benefício', async () => {
    meuClube.mockResolvedValue({
      ...ASSINATURA,
      assinatura: {
        ...ASSINATURA.assinatura,
        proximoVencimento: vencido(90),
      },
      pagamentos: [],
    })
    render(<PainelClube />)

    await waitFor(() => expect(screen.getByText('Expirado')).toBeTruthy())
    expect(screen.getByText(/não está disponível/i)).toBeTruthy()
    const item = screen.getByText('cabelo e barba ilimitados durante a vigência')
    expect(item.closest('li')?.className ?? '').toMatch(/line-through/)
  })

  it('CANCELADO: mostra o cancelamento, com data e motivo', async () => {
    meuClube.mockResolvedValue({
      ...ASSINATURA,
      assinatura: {
        ...ASSINATURA.assinatura,
        proximoVencimento: vencido(200),
        cancelada: true,
        canceladaEm: vencido(210),
        motivoCancelamento: 'mudou de cidade',
      },
      pagamentos: [],
    })
    render(<PainelClube />)

    await waitFor(() => expect(screen.getByText('Cancelado')).toBeTruthy())
    expect(screen.getByText(/Motivo: mudou de cidade\./)).toBeTruthy()
    expect(
      screen.getByText('Nenhum pagamento registrado até agora.'),
    ).toBeTruthy()
  })

  it('os benefícios vêm da configuração da casa, não do código', async () => {
    // A casa trocou as coberturas: a tela tem de acompanhar.
    beneficios.mockResolvedValue({
      coberturas: { cabelo_barba: ['Cabelo', 'Barba', 'Sobrancelha'] },
      desconto: { quimicos: 0.15, produtos: 0 },
      rotulos: {},
    })
    render(<PainelClube />)

    await waitFor(() =>
      expect(
        screen.getByText('cabelo, barba e sobrancelha ilimitados durante a vigência'),
      ).toBeTruthy(),
    )
    expect(screen.getByText('15% em procedimentos químicos')).toBeTruthy()
    // Desconto zerado na configuração: nada de prometer 10% na tela.
    expect(screen.queryByText(/em produtos/)).toBeNull()
  })

  it('falha ao ler os benefícios NÃO derruba a tela do plano', async () => {
    beneficios.mockResolvedValue(null)
    render(<PainelClube />)

    await waitFor(() => expect(screen.getByText('Ativo')).toBeTruthy())
    expect(screen.getByText('Plano: Audax Corte + Barba')).toBeTruthy()
    expect(
      screen.getByText(/benefícios deste plano são definidos pela equipe/i),
    ).toBeTruthy()
  })

  it('falha de carga do Clube vira alerta com "Tentar de novo"', async () => {
    meuClube.mockRejectedValueOnce(new Error('rede fora'))
    render(<PainelClube />)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('rede fora'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() =>
      expect(screen.getByText('Plano: Audax Corte + Barba')).toBeTruthy(),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
