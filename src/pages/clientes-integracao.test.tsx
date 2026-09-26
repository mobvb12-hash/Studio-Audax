import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import AssinaturaFormModal from '@/components/AssinaturaFormModal'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { CrmProvider } from '@/modules/crm/store'
import { ClubeProvider, useClube } from '@/modules/clube/store'
import { WhatsProvider } from '@/modules/whatsapp/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Clientes from './Clientes'
import PDV from './PDV'
import Relatorios from './Relatorios'

const DIA = hojeISO()

let ctxClientes: ReturnType<typeof useClientes>
let ctxCaixa: ReturnType<typeof useCaixa>
let ctxClube: ReturnType<typeof useClube>

function Captura() {
  const clientes = useClientes()
  const caixa = useCaixa()
  const clube = useClube()
  useEffect(() => {
    ctxClientes = clientes
    ctxCaixa = caixa
    ctxClube = clube
  })
  return null
}

function env(children: ReactNode) {
  return render(
    <ClientesProvider>
      <CrmProvider>
        <WhatsProvider>
          <ProfissionaisProvider>
            <ProdutosProvider>
              <EstoqueProvider>
                <ServicosProvider>
                  <AgendaProvider>
                    <CaixaProvider>
                      <ComissoesProvider>
                        <ClubeProvider>
                          <Captura />
                          {children}
                        </ClubeProvider>
                      </ComissoesProvider>
                    </CaixaProvider>
                  </AgendaProvider>
                </ServicosProvider>
              </EstoqueProvider>
            </ProdutosProvider>
          </ProfissionaisProvider>
        </WhatsProvider>
      </CrmProvider>
    </ClientesProvider>,
  )
}

function criar(nome: string, telefone = ''): string {
  let id = ''
  act(() => {
    id = ctxClientes.adicionar({ nome, telefone, email: '', observacao: '' }).id
  })
  return id
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00a0/g, ' ')
}

function celulaKpi(rotulo: string): string {
  const candidatos = within(screen.getByTestId('relatorios')).getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P')
  if (!rotuloEl) throw new Error(`KPI não encontrado: ${rotulo}`)
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

beforeEach(() => {
  localStorage.clear()
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxClube = undefined as unknown as ReturnType<typeof useClube>
})

describe('Clientes — integração com PDV, Clube e Relatórios', () => {
  it('PDV não oferece cliente inativo no select de cliente', () => {
    env(<PDV />)
    criar('Lucas Mendes', '(11) 98888-7777')
    const anaId = criar('Ana Souza', '(11) 97777-6666')
    act(() => {
      ctxClientes.alternarAtivo(anaId)
    })

    const select = screen.getByLabelText('Cliente (opcional)') as HTMLSelectElement
    expect(
      within(select).getByRole('option', { name: 'Lucas Mendes' }),
    ).toBeTruthy()
    expect(
      within(select).queryByRole('option', { name: 'Ana Souza' }),
    ).toBeNull()
    expect(within(select).getByRole('option', { name: 'Sem cliente' })).toBeTruthy()
  })

  it('nova assinatura não oferece cliente inativo', () => {
    env(<AssinaturaFormModal onFechar={() => undefined} />)
    criar('Lucas Mendes', '(11) 98888-7777')
    const anaId = criar('Ana Souza', '(11) 97777-6666')
    act(() => {
      ctxClientes.alternarAtivo(anaId)
    })

    const select = screen.getByLabelText('Cliente *') as HTMLSelectElement
    expect(
      within(select).getByRole('option', { name: 'Lucas Mendes' }),
    ).toBeTruthy()
    expect(
      within(select).queryByRole('option', { name: 'Ana Souza' }),
    ).toBeNull()
  })

  it('renomear cliente propaga para as assinaturas do Audax Club', () => {
    env(<Clientes />)
    const id = criar('Lucas Mendes', '(11) 98888-7777')
    act(() => {
      ctxClube.assinar({
        clienteId: id,
        cliente: 'Lucas Mendes',
        plano: 'cabelo',
        valorMensal: 79.9,
        dataAssinatura: DIA,
      })
    })

    const card = screen.getByText('Lucas Mendes').closest('li') as HTMLElement
    fireEvent.click(within(card).getByText('Editar'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Lucas M.' },
    })
    fireEvent.click(screen.getByText('Salvar alterações'))

    expect(ctxClube.assinaturas).toHaveLength(1)
    expect(ctxClube.assinaturas[0].cliente).toBe('Lucas M.')
    expect(ctxClube.assinaturas[0].clienteId).toBe(id)
  })

  it('inativar cliente não apaga histórico: Relatórios continua contando', () => {
    const r1 = env(null)
    const id = criar('Lucas Mendes', '(11) 98888-7777')
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: DIA,
        hora: '10:00',
        cliente: 'Lucas Mendes',
        clienteId: id,
        profissional: 'Audax',
        servico: 'Corte',
        valor: 100,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'concluido',
      })
      ctxClube.assinar({
        clienteId: id,
        cliente: 'Lucas Mendes',
        plano: 'cabelo',
        valorMensal: 79.9,
        dataAssinatura: DIA,
      })
    })
    act(() => {
      ctxClientes.alternarAtivo(id)
    })
    expect(ctxClientes.clientes[0].ativo).toBe(false)
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(ctxClube.assinaturas).toHaveLength(1)
    r1.unmount()

    env(
      <div data-testid="relatorios">
        <Relatorios />
      </div>,
    )
    expect(celulaKpi('Clientes atendidos')).toBe('1')
    expect(celulaKpi('Total gasto')).toContain('R$ 100,00')
  })
})
