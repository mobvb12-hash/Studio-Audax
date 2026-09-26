import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatarBRL } from '@/lib/moeda'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider, useClube } from '@/modules/clube/store'
import { periodoMes } from '@/modules/comissoes/periodo'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { montarPerfis, resumoSegmentos } from '@/modules/crm/regras'
import { SEGMENTOS_ROTULO } from '@/modules/crm/types'
import { resumoFinanceiro } from '@/modules/relatorios/calculos'
import { ProdutosProvider } from '@/modules/produtos/store'
import {
  ProfissionaisProvider,
  useProfissionais,
} from '@/modules/profissionais/store'
import Relatorios from './Relatorios'

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxClientes: ReturnType<typeof useClientes>
let ctxAgenda: ReturnType<typeof useAgenda>
let ctxClube: ReturnType<typeof useClube>
let ctxProfissionais: ReturnType<typeof useProfissionais>

function Captura() {
  const caixa = useCaixa()
  const clientes = useClientes()
  const agenda = useAgenda()
  const clube = useClube()
  const profissionais = useProfissionais()
  useEffect(() => {
    ctxCaixa = caixa
    ctxClientes = clientes
    ctxAgenda = agenda
    ctxClube = clube
    ctxProfissionais = profissionais
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
                  <div data-testid="rel">
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

function semear() {
  act(() => {
    const lucas = ctxClientes.adicionar({
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
    ctxProfissionais.adicionar({
      nome: 'Diego',
      telefone: '',
      email: '',
      foto: '',
    })
    // Produção do Audax: 100 (PIX)
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-1',
      data: hojeISO(),
      hora: '09:00',
      cliente: 'Lucas Mendes',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 100,
      desconto: 0,
      formaPagamento: 'pix',
      statusAgendamento: 'confirmado',
    })
    // Produção do Diego: 50 (dinheiro) + venda de produto 30
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
    ctxCaixa.venderProduto({
      data: hojeISO(),
      produto: 'Pomada',
      quantidade: 1,
      preco: 30,
      desconto: 0,
      formaPagamento: 'dinheiro',
      profissional: 'Diego',
    })
    // Despesa sem profissional — fica fora do filtro, na visão geral
    ctxCaixa.adicionarDespesa({
      data: hojeISO(),
      descricao: 'Aluguel',
      categoria: 'Aluguel',
      valor: 100,
      formaPagamento: 'pix',
    })
    ctxClube.assinar({
      clienteId: lucas.id,
      cliente: 'Lucas Mendes',
      plano: 'cabelo_barba',
      valorMensal: 99.9,
      dataAssinatura: hojeISO(),
    })
  })
  act(() => {
    ctxAgenda.adicionar({
      cliente: 'Lucas Mendes',
      telefone: '',
      servico: 'Corte Degradê',
      profissional: 'Audax',
      data: hojeISO(),
      horario: '10:00',
      observacao: '',
      duracaoMin: 30,
    })
    ctxAgenda.adicionar({
      cliente: 'Ana Souza',
      telefone: '',
      servico: 'Barba',
      profissional: 'Diego',
      data: hojeISO(),
      horario: '11:00',
      observacao: '',
      duracaoMin: 30,
    })
  })
}

/** Normaliza o espaço não separável do toLocaleString('pt-BR'). */
function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00a0/g, ' ')
}

const brl = (v: number) => norm(formatarBRL(v))

function valorKpi(container: HTMLElement, rotulo: string): string {
  const candidatos = within(container).getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P')
  if (!rotuloEl) throw new Error(`KPI não encontrado: ${rotulo}`)
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

function secao(titulo: string): HTMLElement {
  return screen.getByText(titulo).closest('section') as HTMLElement
}

function selecaoProf(): HTMLSelectElement {
  return screen.getByLabelText('Profissional') as HTMLSelectElement
}

beforeEach(() => {
  localStorage.clear()
})

describe('Relatórios — filtros por período e profissional', () => {
  it('seletor de profissional vem com cadastro, nomes da produção e Todos', () => {
    montar()
    semear()

    const sel = selecaoProf()
    expect(sel.value).toBe('todos')

    const nomes = Array.from(sel.options).map((o) => o.textContent)
    expect(nomes).toContain('Todos os profissionais')
    expect(nomes).toContain('Cleiton Silva')
    expect(nomes).toContain('Ítalo Santos')
    expect(nomes).toContain('Audax')
    expect(nomes).toContain('Diego')
  })

  it('sem filtro mantém o relatório completo pelas regras oficiais', () => {
    montar()
    semear()

    const rel = screen.getByTestId('rel')
    const esperado = resumoFinanceiro(ctxCaixa.lancamentos, periodoMes())
    expect(valorKpi(rel, 'Receita total')).toBe(brl(esperado.receitaTotal))
    expect(valorKpi(rel, 'Receita total')).toBe('R$ 180,00')
    expect(valorKpi(rel, 'Ticket médio')).toBe(brl(esperado.ticketMedio))
    expect(valorKpi(rel, 'Atendimentos pagos')).toBe('2')

    const prof = secao('Profissionais')
    expect(within(prof).getByText('Audax')).toBeTruthy()
    expect(within(prof).getByText('Diego')).toBeTruthy()

    const ags = secao('Agendamentos do período')
    expect(valorKpi(ags, 'Agendamentos')).toBe('2')
    expect(selecaoProf().value).toBe('todos')
  })

  it('filtro por profissional restringe resumo, produção, comissões, clientes e agenda', () => {
    montar()
    semear()

    const rel = screen.getByTestId('rel')
    fireEvent.change(selecaoProf(), { target: { value: 'Diego' } })

    // Subtítulo passa a indicar o profissional selecionado
    expect(screen.getByText(/Profissional: Diego/)).toBeTruthy()

    // Resumo oficial recalculado só com os lançamentos do Diego
    const filtrados = ctxCaixa.lancamentos.filter(
      (l) => l.profissional === 'Diego',
    )
    const esperado = resumoFinanceiro(filtrados, periodoMes())
    expect(valorKpi(rel, 'Receita total')).toBe(brl(esperado.receitaTotal))
    expect(valorKpi(rel, 'Receita total')).toBe('R$ 80,00')
    expect(valorKpi(rel, 'Atendimentos pagos')).toBe('1')
    // Despesa sem profissional sai da visão do profissional
    expect(valorKpi(rel, 'Despesas')).toBe('R$ 0,00')
    expect(
      screen.getByText('Nenhuma despesa no período selecionado.'),
    ).toBeTruthy()

    // Produção e comissões: só o Diego
    const prof = secao('Profissionais')
    expect(within(prof).getByText('Diego')).toBeTruthy()
    expect(within(prof).queryByText('Audax')).toBeNull()
    const comis = secao('Comissões do período')
    expect(within(comis).getByText('Diego')).toBeTruthy()
    expect(within(comis).queryByText('Audax')).toBeNull()

    // Clientes: só os atendidos pelo Diego
    const clientes = secao('Clientes')
    expect(within(clientes).getByText('Ana Souza')).toBeTruthy()
    expect(within(clientes).queryByText('Lucas Mendes')).toBeNull()

    // Agenda: só os agendamentos do Diego
    const ags = secao('Agendamentos do período')
    expect(valorKpi(ags, 'Agendamentos')).toBe('1')
    expect(valorKpi(ags, 'Em aberto')).toBe('1')

    // Os dois filtros compõem: período continua ativo junto com o profissional
    fireEvent.click(screen.getByText('Hoje'))
    expect(valorKpi(rel, 'Receita total')).toBe('R$ 80,00')
    expect(valorKpi(rel, 'Atendimentos pagos')).toBe('1')
  })

  it('Audax Club fica global e o CRM muda de escopo com o filtro', () => {
    montar()
    semear()

    fireEvent.change(selecaoProf(), { target: { value: 'Diego' } })

    // Clube: assinaturas não são filtradas por profissional
    const club = secao('Audax Club')
    expect(valorKpi(club, 'Assinaturas ativas')).toBe('1')
    expect(
      screen.getByText(/assinaturas do Audax Club não são filtradas/),
    ).toBeTruthy()

    // CRM: classificação passa a ser dos clientes do profissional
    expect(
      screen.getByText(
        'Classificação dos clientes atendidos por Diego — não muda com o período selecionado.',
      ),
    ).toBeTruthy()

    const perfis = montarPerfis(
      ctxClientes.clientes,
      ctxAgenda.agendamentos.filter((a) => a.profissional === 'Diego'),
      ctxCaixa.lancamentos.filter((l) => l.profissional === 'Diego'),
    )
    const esperado = resumoSegmentos(perfis)
    const crm = secao('CRM')
    expect(valorKpi(crm, `${SEGMENTOS_ROTULO.novo} (CRM)`)).toBe(
      String(esperado.novo),
    )
    expect(valorKpi(crm, `${SEGMENTOS_ROTULO.ativo} (CRM)`)).toBe(
      String(esperado.ativo),
    )
  })

  it('voltar para Todos restaura os totais sem alterar os dados salvos', () => {
    montar()
    semear()

    const rel = screen.getByTestId('rel')
    const antes = valorKpi(rel, 'Receita total')
    const storageAntes = localStorage.getItem(
      'studio-audax:caixa:lancamentos:v1',
    )
    expect(antes).toBe('R$ 180,00')

    fireEvent.change(selecaoProf(), { target: { value: 'Diego' } })
    expect(valorKpi(rel, 'Receita total')).toBe('R$ 80,00')

    fireEvent.change(selecaoProf(), { target: { value: 'todos' } })
    expect(valorKpi(rel, 'Receita total')).toBe(antes)
    expect(valorKpi(rel, 'Atendimentos pagos')).toBe('2')
    expect(screen.queryByText(/Profissional:/)).toBeNull()

    // Os filtros são apenas de leitura: nada foi gravado nem removido
    expect(ctxCaixa.lancamentos).toHaveLength(4)
    expect(localStorage.getItem('studio-audax:caixa:lancamentos:v1')).toBe(
      storageAntes,
    )
  })
})
