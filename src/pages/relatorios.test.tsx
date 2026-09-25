import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ComissoesProvider, useComissoes } from '@/modules/comissoes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import {
  periodoMes,
  periodoSemana,
} from '@/modules/relatorios/periodo'
import Relatorios from './Relatorios'

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxClientes: ReturnType<typeof useClientes>
let ctxComissoes: ReturnType<typeof useComissoes>

function Captura() {
  const caixa = useCaixa()
  const clientes = useClientes()
  const comissoes = useComissoes()
  useEffect(() => {
    ctxCaixa = caixa
    ctxClientes = clientes
    ctxComissoes = comissoes
  })
  return null
}

function montar() {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <AgendaProvider>
          <CaixaProvider>
            <ComissoesProvider>
              <Captura />
              <div data-testid="relatorios">
                <Relatorios />
              </div>
            </ComissoesProvider>
          </CaixaProvider>
        </AgendaProvider>
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

function dia15MesAnterior(): string {
  const hoje = new Date()
  return isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 15))
}

function clicarFiltro(rotulo: string) {
  fireEvent.click(within(screen.getByTestId('relatorios')).getByText(rotulo))
}

/** toLocaleString('pt-BR') usa espaço não separável (U+00A0) — normaliza para comparações. */
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

function textoRelatorio(): string {
  return norm(screen.getByTestId('relatorios').textContent)
}

/** Base conhecida — todos os lançamentos em "hoje" (sempre no mês corrente). */
let idEstornar = ''
function semearBase() {
  act(() => {
    ctxClientes.adicionar({
      nome: 'Lucas Mendes',
      telefone: '(11) 98888-7777',
      email: '',
      observacao: '',
    })
    ctxClientes.adicionar({
      nome: 'Ana Souza',
      telefone: '(11) 97777-6666',
      email: '',
      observacao: '',
    })

    // Pagamento com desconto: 100 - 20 = 80 (PIX, Audax, Corte Degradê)
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-1',
      data: hojeISO(),
      hora: '09:00',
      cliente: 'Lucas Mendes',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 100,
      desconto: 20,
      formaPagamento: 'pix',
      statusAgendamento: 'confirmado',
    })
    // Pagamento simples: 50 (dinheiro, Diego, Barba)
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-2',
      data: hojeISO(),
      hora: '10:00',
      cliente: 'Ana Souza',
      profissional: 'Diego',
      servico: 'Barba',
      valor: 50,
      desconto: 0,
      formaPagamento: 'dinheiro',
      statusAgendamento: 'confirmado',
    })
    // Segundo atendimento do Lucas (recorrência): 60 (dinheiro, Audax)
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-3',
      data: hojeISO(),
      hora: '11:00',
      cliente: 'Lucas Mendes',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 60,
      desconto: 0,
      formaPagamento: 'dinheiro',
      statusAgendamento: 'confirmado',
    })
    // Venda de produto: 30 (dinheiro, Diego)
    ctxCaixa.venderProduto({
      data: hojeISO(),
      produto: 'Pomada',
      quantidade: 1,
      preco: 30,
      desconto: 0,
      formaPagamento: 'dinheiro',
      profissional: 'Diego',
    })
    // Despesa: 100 (PIX, Aluguel)
    ctxCaixa.adicionarDespesa({
      data: hojeISO(),
      descricao: 'Aluguel',
      categoria: 'Aluguel',
      valor: 100,
      formaPagamento: 'pix',
    })
    // Pagamento estornado: 40 (cartão crédito, Diego) — sai da receita
    const estornado = ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-4',
      data: hojeISO(),
      hora: '15:00',
      cliente: 'Ana Souza',
      profissional: 'Diego',
      servico: 'Barba',
      valor: 40,
      desconto: 0,
      formaPagamento: 'cartao_credito',
      statusAgendamento: 'confirmado',
    })
    idEstornar = estornado.id
  })
  // act separado: o estorno precisa ler a lista já atualizada
  act(() => {
    ctxCaixa.estornar(idEstornar)
  })
}

beforeEach(() => {
  localStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxComissoes = undefined as unknown as ReturnType<typeof useComissoes>
})

describe('Relatórios — filtros de período', () => {
  it('filtro Hoje mostra somente o lançamento de hoje', () => {
    montar()
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-hoje',
        data: hojeISO(),
        hora: '10:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 70,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-ontem',
        data: diasAtras(1),
        hora: '11:00',
        cliente: 'Ana Souza',
        profissional: 'Diego',
        servico: 'Barba',
        valor: 50,
        desconto: 0,
        formaPagamento: 'dinheiro',
        statusAgendamento: 'confirmado',
      })
    })

    clicarFiltro('Hoje')
    expect(celulaKpi('Receita total')).toContain('R$ 70,00')
    expect(celulaKpi('Atendimentos pagos')).toContain('1')

    clicarFiltro('Ontem')
    expect(celulaKpi('Receita total')).toContain('R$ 50,00')
  })

  it('filtro Esta semana cobre da segunda ao domingo', () => {
    montar()
    const inicioSemana = periodoSemana().inicio
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-semana',
        data: inicioSemana,
        hora: '09:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 100,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-hoje',
        data: hojeISO(),
        hora: '10:00',
        cliente: 'Ana Souza',
        profissional: 'Diego',
        servico: 'Barba',
        valor: 70,
        desconto: 0,
        formaPagamento: 'dinheiro',
        statusAgendamento: 'confirmado',
      })
    })

    clicarFiltro('Esta semana')
    expect(celulaKpi('Receita total')).toContain('R$ 170,00')
    expect(celulaKpi('Atendimentos pagos')).toContain('2')
  })

  it('filtros Este mês e Mês anterior separam os meses', () => {
    montar()
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-mes',
        data: hojeISO(),
        hora: '10:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 70,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-mes-anterior',
        data: dia15MesAnterior(),
        hora: '11:00',
        cliente: 'Ana Souza',
        profissional: 'Diego',
        servico: 'Barba',
        valor: 50,
        desconto: 0,
        formaPagamento: 'dinheiro',
        statusAgendamento: 'confirmado',
      })
    })

    clicarFiltro('Este mês')
    expect(celulaKpi('Receita total')).toContain('R$ 70,00')

    clicarFiltro('Mês anterior')
    expect(celulaKpi('Receita total')).toContain('R$ 50,00')
    expect(celulaKpi('Atendimentos pagos')).toContain('1')
  })

  it('período personalizado aceita início e fim', () => {
    montar()
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: diasAtras(1),
        hora: '09:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 50,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-2',
        data: hojeISO(),
        hora: '10:00',
        cliente: 'Ana Souza',
        profissional: 'Diego',
        servico: 'Barba',
        valor: 70,
        desconto: 0,
        formaPagamento: 'dinheiro',
        statusAgendamento: 'confirmado',
      })
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-3',
        data: dia15MesAnterior(),
        hora: '11:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 90,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
    })

    clicarFiltro('Personalizado')
    fireEvent.change(screen.getByLabelText('Início do período'), {
      target: { value: diasAtras(1) },
    })
    fireEvent.change(screen.getByLabelText('Fim do período'), {
      target: { value: hojeISO() },
    })

    expect(celulaKpi('Receita total')).toContain('R$ 120,00')
    expect(celulaKpi('Atendimentos pagos')).toContain('2')
  })
})

describe('Relatórios — resumo financeiro e faturamento', () => {
  it('receita, despesas, estornos, produtos e ticket batem com o Caixa', () => {
    montar()
    semearBase()
    clicarFiltro('Este mês')

    // 80 + 50 + 60 = 190 serviços (estornado de 40 fora)
    expect(celulaKpi('Receita de serviços')).toContain('R$ 190,00')
    expect(celulaKpi('Receita de produtos')).toContain('R$ 30,00')
    expect(celulaKpi('Receita total')).toContain('R$ 220,00')
    expect(celulaKpi('Despesas')).toContain('R$ 100,00')
    expect(celulaKpi('Estornos')).toContain('R$ 40,00')
    expect(celulaKpi('Resultado líquido')).toContain('R$ 120,00')
    expect(celulaKpi('Atendimentos pagos')).toContain('3')
    // 190 / 3 = 63,33
    expect(celulaKpi('Ticket médio')).toContain('R$ 63,33')
  })

  it('faturamento mostra bruto, descontos e evolução por dia', () => {
    montar()
    semearBase()

    const secao = screen
      .getByRole('heading', { name: 'Faturamento', level: 2 })
      .closest('section') as HTMLElement
    // bruto = 100 + 50 + 60 + 30 = 240; desconto 20; líquido 220
    expect(within(secao).getByText('Faturamento bruto (total)')).toBeTruthy()
    expect(
      norm(
        within(secao).getByText('Faturamento bruto (total)').parentElement
          ?.textContent,
      ),
    ).toContain('R$ 240,00')
    expect(
      norm(
        within(secao).getByText('Descontos concedidos').parentElement?.textContent,
      ),
    ).toContain('R$ 20,00')
    expect(
      norm(
        within(secao).getByText('Evolução por dia').parentElement?.textContent,
      ),
    ).toContain('R$ 220,00')
  })
})

describe('Relatórios — formas de pagamento', () => {
  it('lista valor, quantidade e percentual por forma', () => {
    montar()
    semearBase()

    const secao = screen
      .getByText('Formas de pagamento')
      .closest('section') as HTMLElement

    // PIX: só o atendimento de 80 (despesa em PIX não conta como receita)
    const linhaPix = norm(
      within(secao).getByText('PIX').closest('tr')?.textContent,
    )
    expect(linhaPix).toContain('R$ 80,00')
    expect(linhaPix).toContain('1')

    // Dinheiro: 50 + 60 + produto 30 = 140
    const linhaDinheiro = norm(
      within(secao).getByText('Dinheiro').closest('tr')?.textContent,
    )
    expect(linhaDinheiro).toContain('R$ 140,00')
    expect(linhaDinheiro).toContain('3')

    // Estornado (cartão crédito) não aparece
    expect(within(secao).queryByText('Cartão crédito')).toBeNull()

    // Percentuais: 80/220 = 36,4% · 140/220 = 63,6%
    expect(linhaPix).toContain('36.4%')
    expect(linhaDinheiro).toContain('63.6%')

    // Total bate com a receita total
    expect(
      norm(within(secao).getByText('Total').parentElement?.textContent),
    ).toContain('R$ 220,00')
  })
})

describe('Relatórios — profissionais', () => {
  it('mostra produção, produtos, descontos, estornos, comissão e líquido', () => {
    montar()
    semearBase()

    const secao = screen.getByText('Profissionais').closest('section') as HTMLElement

    const linhaAudax = within(secao).getByText('Audax').closest('tr') as HTMLElement
    const cellsAudax = within(linhaAudax).getAllByRole('cell')
    // Atend. 2 · Produção 140 · Produtos 0 · Descontos 20 · Estornos 0 · 40% · Comissão 56 · Líquido 84
    expect(cellsAudax[1].textContent).toBe('2')
    expect(norm(cellsAudax[2].textContent)).toContain('R$ 140,00')
    expect(norm(cellsAudax[3].textContent)).toContain('R$ 0,00')
    expect(norm(cellsAudax[4].textContent)).toContain('R$ 20,00')
    expect(norm(cellsAudax[5].textContent)).toContain('R$ 0,00')
    expect(cellsAudax[6].textContent).toBe('40%')
    expect(norm(cellsAudax[7].textContent)).toContain('R$ 56,00')
    expect(norm(cellsAudax[8].textContent)).toContain('R$ 84,00')

    const linhaDiego = within(secao).getByText('Diego').closest('tr') as HTMLElement
    const cellsDiego = within(linhaDiego).getAllByRole('cell')
    // Atend. 1 (estornado fora) · Produção 50 · Produtos 30 · Comissão 20 · Líquido 60
    expect(cellsDiego[1].textContent).toBe('1')
    expect(norm(cellsDiego[2].textContent)).toContain('R$ 50,00')
    expect(norm(cellsDiego[3].textContent)).toContain('R$ 30,00')
    expect(norm(cellsDiego[7].textContent)).toContain('R$ 20,00')
    expect(norm(cellsDiego[8].textContent)).toContain('R$ 60,00')
  })

  it('profissional inativo aparece identificado como Inativo', () => {
    montar()
    act(() => {
      ctxComissoes.salvarConfig('prof-diego', { percentual: 40, ativo: false })
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: hojeISO(),
        hora: '10:00',
        cliente: 'Ana Souza',
        profissional: 'Diego',
        servico: 'Barba',
        valor: 50,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
    })

    expect(screen.getByText('Inativo')).toBeTruthy()
    // continua com produção e comissão calculados (mesma regra da Comissões)
    const secao = screen.getByText('Profissionais').closest('section') as HTMLElement
    const linha = within(secao).getByText('Diego').closest('tr') as HTMLElement
    expect(norm(linha.textContent)).toContain('R$ 20,00')
  })
})

describe('Relatórios — serviços', () => {
  it('agrupa por serviço com quantidade, faturamento e ticket', () => {
    montar()
    semearBase()

    const secao = screen.getByText('Serviços').closest('section') as HTMLElement

    const corte = within(secao).getByText('Corte Degradê').closest('tr') as HTMLElement
    expect(corte.textContent).toContain('2') // realizados
    expect(norm(corte.textContent)).toContain('R$ 140,00') // faturamento
    expect(norm(corte.textContent)).toContain('R$ 70,00') // ticket médio

    const barba = within(secao).getByText('Barba').closest('tr') as HTMLElement
    expect(barba.textContent).toContain('1')
    expect(norm(barba.textContent)).toContain('R$ 50,00')

    // Destaques de identificação
    expect(secao.textContent).toContain('Mais realizado: Corte Degradê (2)')
    expect(secao.textContent).toContain('Maior receita: Corte Degradê')
  })
})

describe('Relatórios — despesas', () => {
  it('total, quantidade, categoria e evolução vêm do Caixa', () => {
    montar()
    semearBase()

    const secao = screen
      .getByText('Despesas do período')
      .closest('section') as HTMLElement
    expect(norm(secao.textContent)).toContain('R$ 100,00')
    expect(secao.textContent).toContain('Aluguel')
    expect(secao.textContent).toContain('(1)')
  })

  it('sem despesas mostra estado vazio (sem zeros enganosos)', () => {
    montar()
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: hojeISO(),
        hora: '10:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 70,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
    })

    const secao = screen
      .getByText('Despesas do período')
      .closest('section') as HTMLElement
    expect(
      within(secao).getByText('Nenhuma despesa no período selecionado.'),
    ).toBeTruthy()
  })
})

describe('Relatórios — clientes', () => {
  it('atendidos, novos, recorrentes e total gasto', () => {
    montar()
    semearBase()

    // 2 clientes cadastrados agora (novos no mês) · Lucas com 2 atendimentos
    expect(celulaKpi('Clientes atendidos')).toContain('2')
    expect(celulaKpi('Novos clientes')).toContain('2')
    expect(celulaKpi('Recorrentes')).toContain('1')
    // Lucas 80 + 60 = 140 · Ana 50 → 190 (produto sem cliente fica de fora)
    expect(celulaKpi('Total gasto')).toContain('R$ 190,00')
    expect(celulaKpi('Ticket médio por cliente')).toContain('R$ 95,00')
  })
})

describe('Relatórios — comissões', () => {
  it('total, por profissional e fechadas/abertas usam a fonte da FASE 1', () => {
    montar()
    semearBase()
    act(() => {
      ctxComissoes.fecharComissao({
        profissionalId: 'prof-audax',
        profissionalNome: 'Audax',
        periodo: periodoMes(),
        qtdAtendimentos: 2,
        producao: 140,
        percentual: 40,
        comissao: 56,
      })
    })

    // Total = Audax 56 + Diego 20 = 76 (mesma fórmula da tela Comissões)
    expect(celulaKpi('Comissões a pagar')).toContain('R$ 76,00')
    expect(celulaKpi('Fechadas no período')).toContain('R$ 56,00')
    expect(celulaKpi('Ainda abertas')).toContain('R$ 20,00')

    const secao = screen
      .getByText('Comissões do período')
      .closest('section') as HTMLElement
    const linhaAudax = within(secao).getByText('Audax').closest('tr') as HTMLElement
    expect(linhaAudax.textContent).toContain('40%')
    expect(norm(linhaAudax.textContent)).toContain('R$ 140,00')
    expect(norm(linhaAudax.textContent)).toContain('R$ 56,00')
    expect(secao.textContent).toContain('Comissões fechadas')
  })
})

describe('Relatórios — regras do Caixa respeitadas', () => {
  it('cancelado e não compareceu não geram receita (estado vazio)', () => {
    montar()
    expect(() =>
      act(() =>
        ctxCaixa.registrarPagamento({
          agendamentoId: 'ag-canc',
          data: hojeISO(),
          hora: '10:00',
          cliente: 'Lucas Mendes',
          profissional: 'Audax',
          servico: 'Corte Degradê',
          valor: 70,
          desconto: 0,
          formaPagamento: 'pix',
          statusAgendamento: 'cancelado',
        }),
      ),
    ).toThrow(/cancelado/)
    expect(() =>
      act(() =>
        ctxCaixa.registrarPagamento({
          agendamentoId: 'ag-falta',
          data: hojeISO(),
          hora: '11:00',
          cliente: 'Ana Souza',
          profissional: 'Diego',
          servico: 'Barba',
          valor: 50,
          desconto: 0,
          formaPagamento: 'dinheiro',
          statusAgendamento: 'nao_compareceu',
        }),
      ),
    ).toThrow(/compareceu/)

    expect(
      within(screen.getByTestId('relatorios')).getByText(
        'Nenhuma movimentação no período selecionado.',
      ),
    ).toBeTruthy()
    expect(textoRelatorio()).not.toMatch(/NaN|Infinity/)
  })

  it('caixa fechado continua sendo considerado no relatório', () => {
    montar()
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: hojeISO(),
        hora: '10:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 70,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
    })
    expect(celulaKpi('Receita total')).toContain('R$ 70,00')

    act(() => {
      ctxCaixa.fecharCaixa(hojeISO())
    })
    // lançamento do dia fechado segue aparecendo
    expect(celulaKpi('Receita total')).toContain('R$ 70,00')
    expect(textoRelatorio()).not.toMatch(/NaN|Infinity/)
  })
})

describe('Relatórios — estado vazio', () => {
  it('sem dados mostra aviso claro e nenhum NaN/Infinity', () => {
    montar()
    clicarFiltro('Hoje')

    expect(
      within(screen.getByTestId('relatorios')).getByText(
        'Nenhuma movimentação no período selecionado.',
      ),
    ).toBeTruthy()
    expect(
      within(screen.getByTestId('relatorios')).getByText(
        'Sem faturamento no período selecionado.',
      ),
    ).toBeTruthy()
    expect(
      within(screen.getByTestId('relatorios')).getByText(
        'Nenhum recebimento no período selecionado.',
      ),
    ).toBeTruthy()
    expect(
      within(screen.getByTestId('relatorios')).getByText(
        'Nenhum serviço realizado no período.',
      ),
    ).toBeTruthy()
    expect(textoRelatorio()).not.toMatch(/NaN|Infinity/)
    expect(textoRelatorio()).not.toContain('undefined')
  })
})
