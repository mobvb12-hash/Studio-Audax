import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import PagamentoModal from './PagamentoModal'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'

const DIA = '2026-09-25'

const AG: Agendamento = {
  id: 'ag-1',
  cliente: 'Lucas Mendes',
  telefone: '(11) 98888-7777',
  servico: 'Corte Degradê',
  profissional: 'Audax',
  data: DIA,
  horario: '10:00',
  status: 'confirmado',
  observacao: '',
  criadoEm: '2026-09-01T00:00:00.000Z',
}

function Estado() {
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()
  return (
    <output data-testid="estado">
      {JSON.stringify({
        status: agendamentos[0]?.status ?? 'removido',
        pagamentos: lancamentos.map((l) => ({
          valorLiquido: l.valorLiquido,
          formaPagamento: l.formaPagamento,
          recebido: l.recebido,
          troco: l.troco,
          falta: l.falta,
          gorjeta: l.gorjeta,
        })),
      })}
    </output>
  )
}

function montar(ag = AG, fechado = false) {
  localStorage.setItem('studio-audax:agendamentos:v1', JSON.stringify([ag]))
  if (fechado) {
    localStorage.setItem(
      'studio-audax:caixa:fechamentos:v1',
      JSON.stringify([
        {
          id: 'f1',
          data: DIA,
          fechadoEm: '2026-09-25T23:00:00.000Z',
          resumo: {},
        },
      ]),
    )
  }
  return render(
    <ClientesProvider>
      <ServicosProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <ProfissionaisProvider>
              <AgendaProvider>
                <CaixaProvider>
                  <Estado />
                  <PagamentoModal agendamento={ag} onFechar={() => undefined} />
                </CaixaProvider>
              </AgendaProvider>
            </ProfissionaisProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ServicosProvider>
    </ClientesProvider>,
  )
}

function lerEstado() {
  return JSON.parse(screen.getByTestId('estado').textContent ?? '{}')
}

beforeEach(() => {
  localStorage.clear()
})

describe('PagamentoModal', () => {
  it('registra receita com desconto e muda o status para concluído', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Valor do serviço (R$) *'), {
      target: { value: '70' },
    })
    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'pix' },
    })
    fireEvent.click(screen.getByText('Fechar Conta R$ 60,00'))

    const estado = lerEstado()
    expect(estado.status).toBe('concluido')
    expect(estado.pagamentos).toHaveLength(1)
    expect(estado.pagamentos[0].valorLiquido).toBe(60)
    expect(estado.pagamentos[0].formaPagamento).toBe('pix')
  })

  it('bloqueia desconto maior que o valor do serviço', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByText('Fechar Conta R$ 0,00'))
    expect(
      screen.getByText(/desconto não pode ser maior/),
    ).toBeTruthy()
    expect(lerEstado().pagamentos).toHaveLength(0)
  })

  it('mostra aviso imediato e bloqueia quando o caixa do dia está fechado', () => {
    montar(AG, true)
    expect(
      screen.getByText(/O caixa de 2026-09-25 está fechado/),
    ).toBeTruthy()
    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))
    expect(lerEstado().pagamentos).toHaveLength(0)
  })

  it('impede pagamento duplicado do mesmo atendimento', () => {
    montar()
    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))
    expect(lerEstado().pagamentos).toHaveLength(1)

    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))
    expect(screen.getByText(/já foi pago/)).toBeTruthy()
    expect(lerEstado().pagamentos).toHaveLength(1)
  })
})

describe('Fechar conta — recebido, troco, falta e dívida', () => {
  it('recebido acima do total calcula o troco e grava os dois valores', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Recebido (R$)'), {
      target: { value: '100' },
    })
    expect(screen.getByText('R$ 30,00')).toBeTruthy()

    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))
    const [pag] = lerEstado().pagamentos
    expect(pag.recebido).toBe(100)
    expect(pag.troco).toBe(30)
    expect(pag.falta).toBeUndefined()
    expect(lerEstado().status).toBe('concluido')
  })

  it('saldo em aberto só entra como dívida com a opção marcada', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Recebido (R$)'), {
      target: { value: '40' },
    })
    expect(screen.getByText('R$ 30,00')).toBeTruthy() // falta

    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))
    expect(screen.getByText(/Restam R\$ 30,00 em aberto/)).toBeTruthy()
    expect(lerEstado().pagamentos).toHaveLength(0)
    expect(lerEstado().status).toBe('confirmado')

    fireEvent.click(
      screen.getByLabelText('Registrar o restante como dívida (R$ 30,00)'),
    )
    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))
    const [pag] = lerEstado().pagamentos
    expect(pag.recebido).toBe(40)
    expect(pag.falta).toBe(30)
    expect(lerEstado().status).toBe('concluido')
  })

  it('forma de pagamento nova (transferência) entra no lançamento', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'transferencia' },
    })
    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))
    expect(lerEstado().pagamentos[0].formaPagamento).toBe('transferencia')
  })

  it('gorjeta fica fora da receita e não muda o valor lançado', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Gorjeta (R$)'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Recebido (R$)'), {
      target: { value: '80' },
    })
    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))

    const [pag] = lerEstado().pagamentos
    expect(pag.gorjeta).toBe(10)
    expect(pag.valorLiquido).toBe(70)
    expect(pag.troco).toBeUndefined()
    expect(pag.falta).toBeUndefined()
  })

  it('gorjeta exige recebido cobrindo total + gorjeta', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Gorjeta (R$)'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))
    expect(screen.getByText(/exige recebido cobrindo/)).toBeTruthy()
    expect(lerEstado().pagamentos).toHaveLength(0)
    expect(lerEstado().status).toBe('confirmado')
  })
})

describe('Fechar conta — todas as formas de pagamento', () => {
  it.each([
    'dinheiro',
    'pix',
    'pix_integrado',
    'cartao_credito',
    'cartao_debito',
    'transferencia',
    'pre_pago',
    'outro',
  ])('forma "%s" fecha a conta e grava no lançamento', (forma) => {
    montar()
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: forma },
    })
    fireEvent.click(screen.getByText('Fechar Conta R$ 70,00'))

    const estado = lerEstado()
    expect(estado.status).toBe('concluido')
    expect(estado.pagamentos).toHaveLength(1)
    expect(estado.pagamentos[0].formaPagamento).toBe(forma)
    expect(estado.pagamentos[0].valorLiquido).toBe(70)
  })

  it('seletor oferece as 8 formas na ordem oficial', () => {
    montar()
    const opcoes = Array.from(
      (screen.getByLabelText('Forma de pagamento *') as HTMLSelectElement)
        .options,
    ).map((o) => o.value)
    expect(opcoes).toEqual([
      'dinheiro',
      'pix',
      'pix_integrado',
      'cartao_credito',
      'cartao_debito',
      'transferencia',
      'pre_pago',
      'outro',
    ])
  })
})
