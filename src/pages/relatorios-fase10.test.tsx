import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatarBRL } from '@/lib/moeda'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider, useClube } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import Relatorios from './Relatorios'

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxClientes: ReturnType<typeof useClientes>
let ctxAgenda: ReturnType<typeof useAgenda>
let ctxClube: ReturnType<typeof useClube>

function Captura() {
  const caixa = useCaixa()
  const clientes = useClientes()
  const agenda = useAgenda()
  const clube = useClube()
  useEffect(() => {
    ctxCaixa = caixa
    ctxClientes = clientes
    ctxAgenda = agenda
    ctxClube = clube
  })
  return null
}

function montar() {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ProdutosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <ComissoesProvider>
                <ClubeProvider>
                  <Captura />
                  <div data-testid="relatorios">
                    <Relatorios />
                  </div>
                </ClubeProvider>
              </ComissoesProvider>
            </CaixaProvider>
          </AgendaProvider>
        </ProdutosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function isoLocal(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoLocal(d)
}

function clicarFiltro(rotulo: string) {
  fireEvent.click(within(screen.getByTestId('relatorios')).getByText(rotulo))
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00A0/g, ' ')
}

function celulaKpi(rotulo: string): string {
  const candidatos = within(screen.getByTestId('relatorios')).getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P')
  if (!rotuloEl) throw new Error(`KPI não encontrado: ${rotulo}`)
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

function linhaDetalhe(rotulo: string): string {
  const el = within(screen.getByTestId('relatorios')).getByText(rotulo)
  return norm(el.parentElement?.textContent).trim()
}

function textoRelatorio(): string {
  return norm(screen.getByTestId('relatorios').textContent)
}

/** Base: clientes, atendimentos na agenda, receitas em dias conhecidos. */
function semear() {
  let agendamentoId = ''
  act(() => {
    ctxClientes.adicionar({
      nome: 'Ana Souza',
      telefone: '(11) 97777-6666',
      email: '',
      observacao: '',
    })
    ctxClientes.adicionar({
      nome: 'Bruno Lima',
      telefone: '(11) 96666-5555',
      email: '',
      observacao: '',
    })
    agendamentoId = ctxAgenda.adicionar({
      cliente: 'Ana Souza',
      telefone: '',
      servico: 'Corte Degradê',
      profissional: 'Audax',
      data: diasAtras(1),
      horario: '10:00',
      observacao: '',
    }).id
    // receitas: hoje 70 (Ana), ontem 50 (Ana), anteontem 30 (Bruno)
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-1',
      data: hojeISO(),
      hora: '09:00',
      cliente: 'Ana Souza',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 70,
      desconto: 0,
      formaPagamento: 'pix',
      statusAgendamento: 'confirmado',
    })
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-2',
      data: diasAtras(1),
      hora: '10:00',
      cliente: 'Ana Souza',
      profissional: 'Diego',
      servico: 'Barba',
      valor: 50,
      desconto: 0,
      formaPagamento: 'dinheiro',
      statusAgendamento: 'confirmado',
    })
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-3',
      data: diasAtras(2),
      hora: '11:00',
      cliente: 'Bruno Lima',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 30,
      desconto: 0,
      formaPagamento: 'pix',
      statusAgendamento: 'confirmado',
    })
    // despesa de hoje
    ctxCaixa.adicionarDespesa({
      data: hojeISO(),
      descricao: 'Aluguel',
      categoria: 'Aluguel',
      valor: 40,
      formaPagamento: 'pix',
    })
  })
  // act separado: o status lê a lista já atualizada
  act(() => {
    ctxAgenda.mudarStatus(agendamentoId, 'concluido')
  })
}

function semearClube() {
  let assinaturaId = ''
  act(() => {
    const assinatura = ctxClube.assinar({
      clienteId: ctxClientes.clientes[0].id,
      cliente: 'Ana Souza',
      plano: 'cabelo',
      valorMensal: 120,
      dataAssinatura: hojeISO(),
    })
    assinaturaId = assinatura.id
  })
  // act separado: o pagamento lê a lista de assinaturas já atualizada
  act(() => {
    ctxClube.registrarPagamento({
      assinaturaId,
      data: hojeISO(),
      valor: 120,
      formaPagamento: 'pix',
    })
  })
}

beforeEach(() => {
  localStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
  ctxClube = undefined as unknown as ReturnType<typeof useClube>
})

describe('Relatórios — Audax Club', () => {
  it('mostra assinaturas, pagamentos e receita do Caixa do período', () => {
    montar()
    semear()
    semearClube()

    expect(
      within(screen.getByTestId('relatorios')).getByRole('heading', {
        name: 'Audax Club',
      }),
    ).toBeTruthy()
    expect(celulaKpi('Assinaturas ativas')).toBe('1')
    expect(celulaKpi('Receita prevista/mês')).toBe('R$ 120,00')
    expect(linhaDetalhe('Assinaturas cadastradas')).toContain('1')
    expect(linhaDetalhe('Pagamentos no período')).toContain('1 · R$ 120,00')
    // receita de assinaturas exibida vem do Caixa (fonte oficial)
    expect(linhaDetalhe('Receita de assinaturas no caixa')).toContain(
      'R$ 120,00',
    )
    expect(celulaKpi('Receita de assinaturas')).toBe('R$ 120,00')
  })

  it('sem assinaturas mostra estado vazio da seção', () => {
    montar()
    expect(
      within(screen.getByTestId('relatorios')).getByText(
        'Nenhuma assinatura do Audax Club.',
      ),
    ).toBeTruthy()
  })

  it('filtro Mês anterior tira os pagamentos de hoje do Clube', () => {
    montar()
    semear()
    semearClube()

    clicarFiltro('Mês anterior')
    expect(linhaDetalhe('Pagamentos no período')).toContain('0 · R$ 0,00')
    expect(linhaDetalhe('Receita de assinaturas no caixa')).toContain(
      'R$ 0,00',
    )
  })
})

describe('Relatórios — CRM', () => {
  it('mostra os segmentos derivados dos dados reais', () => {
    montar()
    semear()

    expect(
      within(screen.getByTestId('relatorios')).getByRole('heading', {
        name: 'CRM',
      }),
    ).toBeTruthy()
    // Ana: 1 atendimento concluído ontem → Ativo; Bruno: sem atendimento e
    // cadastro recente → Novo
    expect(celulaKpi('Novo (CRM)')).toBe('1')
    expect(celulaKpi('Ativo (CRM)')).toBe('1')
    expect(celulaKpi('Recorrente (CRM)')).toBe('0')
    expect(celulaKpi('Sem retorno (CRM)')).toBe('0')
    expect(celulaKpi('Inativo (CRM)')).toBe('0')
    expect(linhaDetalhe('Clientes analisados (CRM)')).toContain('2')
    expect(linhaDetalhe('Atendimentos realizados (CRM)')).toContain('1')
    // classificação atual não depende do filtro de período
    clicarFiltro('Mês anterior')
    expect(celulaKpi('Ativo (CRM)')).toBe('1')
  })

  it('sem clientes cadastrados mostra estado vazio', () => {
    montar()
    expect(
      within(screen.getByTestId('relatorios')).getByText(
        'Nenhum cliente cadastrado.',
      ),
    ).toBeTruthy()
  })
})

describe('Relatórios — comparação entre períodos', () => {
  it('compara com a janela anterior quando ela tem dados', () => {
    montar()
    semear()

    clicarFiltro('Ontem')
    expect(
      within(screen.getByTestId('relatorios')).getByText(
        'Comparação com o período anterior',
      ),
    ).toBeTruthy()
    expect(linhaDetalhe('Receita líquida no anterior')).toContain(
      'R$ 30,00',
    )
    expect(linhaDetalhe('Atendimentos pagos no anterior')).toContain('1')
    // ontem 50 vs. anteontem 30 → +66.7%
    expect(screen.getByText(/Receita: \+66\.7% vs\. anterior/)).toBeTruthy()
  })

  it('sem dados no período anterior a comparação fica oculta', () => {
    montar()
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-hoje',
        data: hojeISO(),
        hora: '09:00',
        cliente: 'Ana Souza',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 70,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
    })

    clicarFiltro('Hoje')
    expect(
      within(screen.getByTestId('relatorios')).queryByText(
        'Comparação com o período anterior',
      ),
    ).toBeNull()
  })
})

describe('Relatórios — financeiro bate com o Caixa oficial', () => {
  it('receita total e despesas somam os resumos diários do Caixa', () => {
    montar()
    semear()

    const dias = new Set(
      ctxCaixa.lancamentos.map((l) => l.data).filter((d) => d.startsWith(hojeISO().slice(0, 7))),
    )
    let receita = 0
    let despesas = 0
    for (const dia of dias) {
      const resumo = ctxCaixa.resumoDoDia(dia)
      receita += resumo.totalRecebido
      despesas += resumo.despesas
    }
    expect(celulaKpi('Receita total')).toBe(norm(formatarBRL(receita)))
    expect(celulaKpi('Despesas')).toBe(norm(formatarBRL(despesas)))
    expect(textoRelatorio()).not.toMatch(/NaN|Infinity/)
  })

  it('seções novas não introduzem NaN nem undefined', () => {
    montar()
    semear()
    semearClube()
    expect(textoRelatorio()).not.toMatch(/NaN|Infinity/)
    expect(textoRelatorio()).not.toContain('undefined')
  })
})
