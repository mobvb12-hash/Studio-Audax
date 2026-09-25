import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BloqueiosModal from '@/components/BloqueiosModal'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import RemarcarAgendamentoModal from '@/components/RemarcarAgendamentoModal'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import {
  ProfissionaisProvider,
  useProfissionais,
} from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Agenda from './Agenda'
import PDV from './PDV'
import Profissionais from './Profissionais'
import Relatorios from './Relatorios'

const DIA = hojeISO()
const CHAVE_AG = 'studio-audax:agendamentos:v1'
const CHAVE_PROFS = 'studio-audax:profissionais:v1'

let ctxProfissionais: ReturnType<typeof useProfissionais>
let ctxAgenda: ReturnType<typeof useAgenda>
let ctxCaixa: ReturnType<typeof useCaixa>

function Captura() {
  const profissionais = useProfissionais()
  const agenda = useAgenda()
  const caixa = useCaixa()
  useEffect(() => {
    ctxProfissionais = profissionais
    ctxAgenda = agenda
    ctxCaixa = caixa
  })
  return null
}

function semearProfissionais(lista: {
  nome: string
  ativo: boolean
  id?: string
}[]) {
  localStorage.setItem(
    CHAVE_PROFS,
    JSON.stringify(
      lista.map((p, i) => ({
        id: p.id ?? `prof-${i + 1}`,
        nome: p.nome,
        telefone: '',
        email: '',
        foto: '',
        ativo: p.ativo,
        criadoEm: '2026-01-01T00:00:00.000Z',
      })),
    ),
  )
}

function semearAgendamento(ag: {
  id?: string
  cliente?: string
  profissional: string
  horario?: string
  status?: string
}) {
  localStorage.setItem(
    CHAVE_AG,
    JSON.stringify([
      {
        id: ag.id ?? 'ag-1',
        cliente: ag.cliente ?? 'Ana Souza',
        telefone: '',
        servico: 'Corte Degradê',
        profissional: ag.profissional,
        data: DIA,
        horario: ag.horario ?? '14:00',
        status: ag.status ?? 'concluido',
        observacao: '',
        criadoEm: '2026-09-01T00:00:00.000Z',
        duracaoMin: 40,
      },
    ]),
  )
}

function criarAgendamento(profissional: string): Agendamento {
  return {
    id: 'ag-1',
    cliente: 'Ana Souza',
    telefone: '',
    servico: 'Corte Degradê',
    profissional,
    data: DIA,
    horario: '14:00',
    status: 'confirmado',
    observacao: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    duracaoMin: 40,
  }
}

function env(elemento: ReactNode) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <Captura />
              {elemento}
            </CaixaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function envPdv() {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <ClubeProvider>
                    <Captura />
                    <div data-testid="pdv">
                      <PDV />
                    </div>
                  </ClubeProvider>
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function envRelatorios() {
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

function norm(s: string): string {
  return s.replace(/\u00A0/g, ' ')
}

function idDoProfissional(nome: string): string {
  const alvo = ctxProfissionais.profissionais.find((p) => p.nome === nome)
  if (!alvo) throw new Error(`profissional não encontrado: ${nome}`)
  return alvo.id
}

beforeEach(() => {
  localStorage.clear()
  ctxProfissionais = undefined as unknown as ReturnType<
    typeof useProfissionais
  >
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
})

describe('Profissionais inativos × novos agendamentos', () => {
  it('profissional inativo não aparece no modal de novos agendamentos', () => {
    semearProfissionais([
      { nome: 'Audax', ativo: true },
      { nome: 'Diego', ativo: false },
    ])
    const onFechar = vi.fn()
    env(
      <NovoAgendamentoModal
        dataInicial={DIA}
        horarioInicial="15:00"
        onFechar={onFechar}
      />,
    )

    const select = screen.getByLabelText('Profissional')
    expect(select.textContent).toContain('Audax')
    expect(select.textContent).not.toContain('Diego')
    expect(
      (screen.getByLabelText('Profissional') as HTMLSelectElement).value,
    ).toBe('Audax')
  })

  it('recusa salvar quando o profissional inicial está inativo', () => {
    semearProfissionais([
      { nome: 'Audax', ativo: true },
      { nome: 'Diego', ativo: false },
    ])
    const onFechar = vi.fn()
    env(
      <NovoAgendamentoModal
        dataInicial={DIA}
        horarioInicial="15:00"
        profissionalInicial="Diego"
        onFechar={onFechar}
      />,
    )

    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(
      screen.getByText('Profissional inativo — escolha outro profissional.'),
    ).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
    expect(ctxAgenda.agendamentos).toHaveLength(0)
  })
})

describe('Agenda — profissional inativo preserva histórico', () => {
  it('mantém coluna, agendamento salvo e sinaliza "· inativo" no cabeçalho', () => {
    semearProfissionais([
      { nome: 'Audax', ativo: true },
      { nome: 'Diego', ativo: false },
    ])
    semearAgendamento({ profissional: 'Diego', cliente: 'Ana Souza' })
    env(<Agenda onNovo={vi.fn()} />)

    // cabeçalho com o marcador (não remove a coluna)
    expect(screen.getAllByText('Diego').length).toBeGreaterThan(0)
    expect(screen.getByText('Barbeiro(a) · inativo')).toBeTruthy()
    // histórico visível na grade
    expect(screen.getByText('Ana Souza')).toBeTruthy()
  })
})

describe('Página Profissionais — inativar sem apagar', () => {
  it('inativar/reativar preserva cadastro, contagem e histórico', () => {
    semearProfissionais([
      { nome: 'Audax', ativo: true },
      { nome: 'Diego', ativo: true },
    ])
    semearAgendamento({ profissional: 'Diego', status: 'concluido' })
    env(<Profissionais />)

    const alvo = screen.getByText('Diego').closest('li') as HTMLElement
    expect(within(alvo).getByText('1 atendimento(s)')).toBeTruthy()
    expect(within(alvo).getByText('Ativo')).toBeTruthy()

    fireEvent.click(within(alvo).getByLabelText('Inativar Diego'))
    expect(within(alvo).getByText('Inativo')).toBeTruthy()
    expect(within(alvo).getByText('1 atendimento(s)')).toBeTruthy()
    expect(within(alvo).getByLabelText('Reativar Diego')).toBeTruthy()
    // nada apagado no armazenamento
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxAgenda.agendamentos[0].profissional).toBe('Diego')
    const salvo = JSON.parse(localStorage.getItem(CHAVE_PROFS) ?? '[]')
    expect(salvo.find((p: { nome: string }) => p.nome === 'Diego').ativo).toBe(
      false,
    )

    fireEvent.click(within(alvo).getByLabelText('Reativar Diego'))
    expect(within(alvo).getByText('Ativo')).toBeTruthy()
    expect(
      ctxProfissionais.profissionais.find((p) => p.nome === 'Diego')?.ativo,
    ).toBe(true)
  })
})

describe('PDV — profissional inativo do cadastro', () => {
  it('não oferece profissional inativo no select do atendimento', () => {
    envPdv()
    act(() => {
      ctxProfissionais.alternarAtivo(idDoProfissional('Audax'))
    })
    const select = screen.getByLabelText('Profissional (opcional)')
    expect(select.textContent).toContain('Diego')
    expect(select.textContent).not.toContain('Audax')
  })
})

describe('Relatórios — profissional inativo com produção preservada', () => {
  it('marca "Inativo" na tabela e mantém a produção do período', () => {
    envRelatorios()
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: DIA,
        hora: '10:00',
        cliente: 'Ana Souza',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 100,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'concluido',
      })
      ctxProfissionais.alternarAtivo(idDoProfissional('Audax'))
    })

    expect(screen.getByText('Inativo')).toBeTruthy()
    const texto = norm(screen.getByTestId('relatorios').textContent ?? '')
    expect(texto).toContain('R$ 100,00')
  })
})

describe('Remarcar e Bloqueios — apenas profissionais ativos', () => {
  it('remarcar não oferece inativos (exceto o profissional atual do agendamento)', () => {
    semearProfissionais([
      { nome: 'Audax', ativo: true },
      { nome: 'Diego', ativo: false },
    ])
    env(
      <RemarcarAgendamentoModal
        agendamento={criarAgendamento('Audax')}
        onFechar={vi.fn()}
      />,
    )
    const select = screen.getByLabelText('Profissional *')
    expect(select.textContent).toContain('Audax')
    expect(select.textContent).not.toContain('Diego')
  })

  it('remarcar mantém o profissional inativo atual do agendamento na lista', () => {
    semearProfissionais([
      { nome: 'Audax', ativo: true },
      { nome: 'Diego', ativo: false },
    ])
    env(
      <RemarcarAgendamentoModal
        agendamento={criarAgendamento('Diego')}
        onFechar={vi.fn()}
      />,
    )
    const select = screen.getByLabelText('Profissional *')
    expect(select.textContent).toContain('Diego')
    expect(select.textContent).toContain('Audax')
  })

  it('bloqueios não oferecem profissionais inativos', () => {
    semearProfissionais([
      { nome: 'Audax', ativo: true },
      { nome: 'Diego', ativo: false },
    ])
    env(<BloqueiosModal onFechar={vi.fn()} />)
    const profNames = ctxProfissionais.profissionais
    expect(profNames.find((p) => p.nome === 'Diego')?.ativo).toBe(false)
    // modal aberto sem opção de Diego
    expect(screen.queryByRole('option', { name: 'Diego' })).toBeNull()
  })
})

