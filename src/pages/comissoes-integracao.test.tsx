import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ComissoesProvider, useComissoes } from '@/modules/comissoes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Comissoes from './Comissoes'

let idParaEstornar = ''

function Semente() {
  const { registrarPagamento, venderProduto, estornar } = useCaixa()
  const { salvarConfig } = useComissoes()
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          // Audax: 70 - 10 de desconto = 60 líquido (conta)
          registrarPagamento({
            agendamentoId: 'ag-1',
            data: hojeISO(),
            hora: '10:00',
            cliente: 'Lucas Mendes',
            profissional: 'Audax',
            servico: 'Corte Degradê',
            valor: 70,
            desconto: 10,
            formaPagamento: 'pix',
            statusAgendamento: 'confirmado',
          })
          // Audax: pago e depois estornado (não conta) — estorno em clique
          // separado porque o store atualiza o estado em lotes
          const paraEstornar = registrarPagamento({
            agendamentoId: 'ag-2',
            data: hojeISO(),
            hora: '11:00',
            cliente: 'Rafael',
            profissional: 'Audax',
            servico: 'Barba',
            valor: 50,
            desconto: 0,
            formaPagamento: 'dinheiro',
            statusAgendamento: 'confirmado',
          })
          idParaEstornar = paraEstornar.id
          // Diego: 90 (conta)
          registrarPagamento({
            agendamentoId: 'ag-3',
            data: hojeISO(),
            hora: '12:00',
            cliente: 'Bruno',
            profissional: 'Diego',
            servico: 'Corte Máquina',
            valor: 90,
            desconto: 0,
            formaPagamento: 'pix',
            statusAgendamento: 'concluido',
          })
          // Audax: pagamento fora do mês corrente (não conta no período "Este mês")
          registrarPagamento({
            agendamentoId: 'ag-4',
            data: '2020-01-15',
            hora: '09:00',
            cliente: 'Antigo',
            profissional: 'Audax',
            servico: 'Corte',
            valor: 40,
            desconto: 0,
            formaPagamento: 'dinheiro',
            statusAgendamento: 'concluido',
          })
          // Venda de produto de Audax (separada da produção de serviços)
          venderProduto({
            data: hojeISO(),
            produto: 'Pomada',
            quantidade: 1,
            preco: 30,
            desconto: 0,
            formaPagamento: 'cartao_credito',
            profissional: 'Audax',
          })
        }}
      >
        semear
      </button>
      <button
        type="button"
        onClick={() => {
          if (idParaEstornar) estornar(idParaEstornar)
        }}
      >
        estornar
      </button>
      <button
        type="button"
        onClick={() => {
          try {
            registrarPagamento({
              agendamentoId: 'ag-5',
              data: hojeISO(),
              hora: '13:00',
              cliente: 'Cancelado',
              profissional: 'Audax',
              servico: 'Corte',
              valor: 60,
              desconto: 0,
              formaPagamento: 'pix',
              statusAgendamento: 'cancelado',
            })
          } catch (e) {
            const saida = document.getElementById(
              'erro-cancelado',
            ) as HTMLInputElement
            saida.value = e instanceof Error ? e.message : 'erro'
          }
        }}
      >
        semear-cancelado
      </button>
      <input id="erro-cancelado" data-testid="erro-cancelado" defaultValue="" />
      <button
        type="button"
        onClick={() =>
          salvarConfig('prof-diego', { percentual: 40, ativo: false })
        }
      >
        desativar-diego
      </button>
    </div>
  )
}

function montar() {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <ComissoesProvider>
                <Semente />
                <Comissoes />
              </ComissoesProvider>
            </CaixaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function linha(nome: string): HTMLElement {
  return screen
    .getByRole('button', { name: `Ver detalhes de ${nome}` })
    .closest('tr') as HTMLElement
}

beforeEach(() => {
  localStorage.clear()
  idParaEstornar = ''
})

describe('Caixa ↔ Comissões — produção real vinda dos pagamentos', () => {
  it('exibe produção/comissão por profissional batendo com o Caixa', () => {
    montar()
    fireEvent.click(screen.getByText('semear'))
    fireEvent.click(screen.getByText('estornar'))

    const audax = linha('Audax')
    const diego = linha('Diego')

    // Audax: 1 atendimento pago no mês (estornado fora, fora do mês fora)
    expect(within(audax).getByText('1')).toBeTruthy()
    expect(within(audax).getByText('R$ 60,00')).toBeTruthy()
    expect(within(audax).getByText('R$ 24,00')).toBeTruthy()

    expect(within(diego).getByText('1')).toBeTruthy()
    expect(within(diego).getByText('R$ 90,00')).toBeTruthy()
    expect(within(diego).getByText('R$ 36,00')).toBeTruthy()

    // Totais gerais: 2 atendimentos, R$ 150 de produção, R$ 60 de comissão
    const totais = screen.getByText('Total geral').closest('tr') as HTMLElement
    expect(within(totais).getByText('2')).toBeTruthy()
    expect(within(totais).getByText('R$ 150,00')).toBeTruthy()
    expect(within(totais).getByText('R$ 60,00')).toBeTruthy()

    // KPIs do topo
    const kpi = (rotulo: string) =>
      screen.getByText(rotulo).parentElement as HTMLElement
    expect(within(kpi('Produção total')).getByText('R$ 150,00')).toBeTruthy()
    expect(within(kpi('Comissões a pagar')).getByText('R$ 60,00')).toBeTruthy()
    expect(within(kpi('Profissionais ativos')).getByText('2')).toBeTruthy()

    // Venda de produto não entra na produção de serviços (30 separados)
    const detalhe = screen.getByRole('button', {
      name: 'Ver detalhes de Audax',
    })
    fireEvent.click(detalhe)
    expect(screen.getByText('Detalhamento da produção')).toBeTruthy()
    expect(screen.getByText('Produtos (separado)')).toBeTruthy()
    const kpiProdutos = screen.getByText('Produtos (separado)')
      .parentElement as HTMLElement
    expect(within(kpiProdutos).getByText('R$ 30,00')).toBeTruthy()
    const modalDetalhe = screen
      .getByText('Detalhamento da produção')
      .closest('div[class*="rounded-xl"]') as HTMLElement
    fireEvent.click(within(modalDetalhe).getByText('Fechar'))
  })

  it('status cancelado/não pago não gera lançamento nem comissão', () => {
    montar()
    fireEvent.click(screen.getByText('semear'))
    fireEvent.click(screen.getByText('estornar'))
    fireEvent.click(screen.getByText('semear-cancelado'))
    expect(screen.getByTestId('erro-cancelado')).toHaveProperty(
      'value',
      expect.stringMatching(/cancelad/i),
    )
    const totais = screen.getByText('Total geral').closest('tr') as HTMLElement
    expect(within(totais).getByText('2')).toBeTruthy()
  })

  it('fecha comissão pela tela e preserva o fechamento após recarregar', () => {
    const primeira = montar()
    fireEvent.click(screen.getByText('semear'))
    fireEvent.click(screen.getByText('estornar'))

    fireEvent.click(within(linha('Audax')).getByText('Fechar'))
    expect(screen.getByText('Comissão a pagar')).toBeTruthy()
    const modal = screen
      .getByText('Confirmar fechamento')
      .closest('div[class*="rounded-xl"]') as HTMLElement
    expect(within(modal).getByText('R$ 24,00')).toBeTruthy()
    fireEvent.click(screen.getByText('Confirmar fechamento'))

    expect(within(linha('Audax')).getByText(/Fechada R\$ 24,00/)).toBeTruthy()
    expect(within(linha('Audax')).getByText('Reabrir')).toBeTruthy()
    expect(screen.getByText('Auditoria de comissões')).toBeTruthy()

    // F5: fechamento persiste
    primeira.unmount()
    montar()
    expect(within(linha('Audax')).getByText(/Fechada R\$ 24,00/)).toBeTruthy()
  })

  it('profissional inativo mantém histórico, produção e comissão visíveis', () => {
    montar()
    fireEvent.click(screen.getByText('semear'))
    fireEvent.click(screen.getByText('estornar'))
    fireEvent.click(screen.getByText('desativar-diego'))

    const diego = linha('Diego')
    expect(within(diego).getByText('Inativo')).toBeTruthy()
    expect(within(diego).getByText('R$ 90,00')).toBeTruthy()
    expect(within(diego).getByText('R$ 36,00')).toBeTruthy()
    const kpi = (rotulo: string) =>
      screen.getByText(rotulo).parentElement as HTMLElement
    expect(within(kpi('Profissionais ativos')).getByText('1')).toBeTruthy()
  })

  it('reabre a comissão pelo modal com motivo obrigatório', () => {
    montar()
    fireEvent.click(screen.getByText('semear'))
    fireEvent.click(screen.getByText('estornar'))
    fireEvent.click(within(linha('Audax')).getByText('Fechar'))
    fireEvent.click(screen.getByText('Confirmar fechamento'))

    fireEvent.click(within(linha('Audax')).getByText('Reabrir'))
    expect(screen.getByText('Reabrir comissão')).toBeTruthy()
    const modalReabertura = screen
      .getByText('Reabrir comissão')
      .closest('div[class*="rounded-xl"]') as HTMLElement
    // sem motivo → não reabre
    fireEvent.click(within(modalReabertura).getByText('Reabrir'))
    expect(
      screen.getByText('Informe o motivo (mínimo 3 letras).'),
    ).toBeTruthy()
    fireEvent.change(
      screen.getByPlaceholderText('Ex.: esqueci um pagamento do período'),
      { target: { value: 'pagamento duplicado' } },
    )
    fireEvent.click(within(modalReabertura).getByText('Reabrir'))
    expect(screen.queryByText('Reabrir comissão')).toBeNull()
    expect(within(linha('Audax')).getByText('Fechar')).toBeTruthy()
    expect(screen.getByText(/Reabertura/)).toBeTruthy()
  })
})
