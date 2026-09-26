import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { CrmProvider } from '@/modules/crm/store'
import { ClubeProvider } from '@/modules/clube/store'
import { EsperaProvider } from '@/modules/espera/store'
import { WhatsProvider } from '@/modules/whatsapp/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Clientes from './Clientes'
import Profissionais from './Profissionais'
import Servicos from './Servicos'

beforeEach(() => {
  localStorage.clear()
})

function montarClientes() {
  return render(
    <ClientesProvider>
      <CrmProvider>
        <WhatsProvider>
          <AgendaProvider>
            <CaixaProvider>
              <ClubeProvider>
                <EsperaProvider>
                  <Clientes />
                </EsperaProvider>
              </ClubeProvider>
            </CaixaProvider>
          </AgendaProvider>
        </WhatsProvider>
      </CrmProvider>
    </ClientesProvider>,
  )
}

describe('Confirmação de exclusão destrutiva', () => {
  it('Clientes: excluir exige confirmação e preserva histórico', async () => {
    montarClientes()
    fireEvent.click(screen.getByText('+ Novo cliente'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Lucas Mendes' },
    })
    fireEvent.change(screen.getByLabelText('Telefone *'), {
      target: { value: '(11) 98888-7777' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))

    fireEvent.click(screen.getByLabelText('Excluir Lucas Mendes'))
    expect(screen.getByText('Excluir cliente')).toBeTruthy()

    fireEvent.click(screen.getByText('Voltar'))
    await waitFor(() =>
      expect(screen.queryByText('Excluir cliente')).toBeNull(),
    )
    expect(screen.getByText('Lucas Mendes')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Excluir Lucas Mendes'))
    fireEvent.click(screen.getByText('Sim, excluir'))
    await waitFor(() =>
      expect(screen.queryByText('Lucas Mendes')).toBeNull(),
    )
  })

  it('Serviços: excluir exige confirmação', async () => {
    render(
      <ServicosProvider>
        <AgendaProvider>
          <CaixaProvider>
            <Servicos />
          </CaixaProvider>
        </AgendaProvider>
      </ServicosProvider>,
    )
    fireEvent.click(screen.getByLabelText('Excluir Corte Degradê'))
    expect(screen.getByText('Excluir serviço')).toBeTruthy()
    expect(screen.getByText('Corte Degradê')).toBeTruthy()

    fireEvent.click(screen.getByText('Sim, excluir'))
    await waitFor(() =>
      expect(screen.queryByLabelText('Excluir Corte Degradê')).toBeNull(),
    )
  })

  it('Profissionais: excluir exige confirmação', async () => {
    render(
      <ProfissionaisProvider>
        <AgendaProvider>
          <CaixaProvider>
            <Profissionais />
          </CaixaProvider>
        </AgendaProvider>
      </ProfissionaisProvider>,
    )
    fireEvent.click(screen.getByLabelText('Excluir Cleiton Silva'))
    expect(screen.getByText('Excluir profissional')).toBeTruthy()

    fireEvent.click(screen.getByText('Voltar'))
    await waitFor(() =>
      expect(screen.queryByText('Excluir profissional')).toBeNull(),
    )
    expect(screen.getByText('Cleiton Silva')).toBeTruthy()
  })
})

// Auditoria F2: profissional que já aparece em agendamentos, caixa ou
// fechamentos de comissão não pode ser apagado (histórico viraria órfão);
// a recusa acontece dentro do modal com os números reais de uso.
describe('Exclusão bloqueada por uso (auditoria F2/F3)', () => {
  it('Profissionais: bloqueia exclusão com agendamentos, caixa e comissões', () => {
    localStorage.setItem(
      'studio-audax:agendamentos:v1',
      JSON.stringify([
        {
          id: 'ag-1',
          cliente: 'Ana Souza',
          telefone: '(11) 99999-0000',
          servico: 'Corte Degradê',
          profissional: 'Cleiton Silva',
          data: '2026-09-01',
          horario: '10:00',
          status: 'concluido',
          observacao: '',
          criadoEm: '2026-09-01T00:00:00.000Z',
        },
      ]),
    )
    localStorage.setItem(
      'studio-audax:caixa:lancamentos:v1',
      JSON.stringify([
        {
          id: 'l-1',
          tipo: 'receita',
          origem: 'atendimento',
          data: '2026-09-01',
          hora: '10:00',
          descricao: 'Corte Degradê',
          valor: 70,
          desconto: 0,
          valorLiquido: 70,
          formaPagamento: 'pix',
          profissional: 'Cleiton Silva',
        },
      ]),
    )
    localStorage.setItem(
      'studio-audax:comissoes:fechamentos:v1',
      JSON.stringify([
        {
          id: 'f-1',
          profissionalId: 'prof-cleiton-silva',
          profissionalNome: 'Cleiton Silva',
          periodo: { inicio: '2026-09-01', fim: '2026-09-30' },
          qtdAtendimentos: 1,
          producao: 70,
          percentual: 40,
          comissao: 28,
          fechadoEm: '2026-09-30T10:00:00.000Z',
        },
      ]),
    )

    render(
      <ProfissionaisProvider>
        <AgendaProvider>
          <CaixaProvider>
            <ComissoesProvider>
              <Profissionais />
            </ComissoesProvider>
          </CaixaProvider>
        </AgendaProvider>
      </ProfissionaisProvider>,
    )

    fireEvent.click(screen.getByLabelText('Excluir Cleiton Silva'))
    expect(screen.getByText('Excluir profissional')).toBeTruthy()
    fireEvent.click(screen.getByText('Sim, excluir'))

    // modal continua aberto com a recusa e os números reais de uso
    const erro = screen.getByText(/já aparece em/)
    expect(erro.textContent).toContain('“Cleiton Silva” já aparece em 1 agendamento(s)')
    expect(erro.textContent).toContain('1 lançamento(oes) do caixa')
    expect(erro.textContent).toContain('1 fechamento(s) de comissão')
    expect(erro.textContent).toContain('Use “Inativar”')
    expect(screen.getByText('Excluir profissional')).toBeTruthy()
    expect(screen.getByText('Cleiton Silva')).toBeTruthy()
    expect(
      JSON.parse(localStorage.getItem('studio-audax:agendamentos:v1') ?? '[]'),
    ).toHaveLength(1)
    expect(
      JSON.parse(
        localStorage.getItem('studio-audax:comissoes:fechamentos:v1') ?? '[]',
      ),
    ).toHaveLength(1)
  })

  it('Clientes: bloqueia exclusão com assinatura ativa do Clube e pedido na fila', () => {
    localStorage.setItem(
      'studio-audax:clientes:v1',
      JSON.stringify([
        {
          id: 'cli-1',
          nome: 'Lucas Mendes',
          telefone: '(11) 98888-7777',
          email: '',
          observacao: '',
          ativo: true,
        },
      ]),
    )
    localStorage.setItem(
      'studio-audax:clube:v1',
      JSON.stringify({
        assinaturas: [
          {
            id: 'a1',
            clienteId: 'cli-1',
            cliente: 'Lucas Mendes',
            plano: 'cabelo',
            valorMensal: 89.9,
            dataAssinatura: '2026-09-01',
            proximoVencimento: '2026-12-01',
            cancelada: false,
            criadoEm: '2026-09-01T00:00:00.000Z',
          },
        ],
        pagamentos: [],
      }),
    )
    localStorage.setItem(
      'studio-audax:espera:v1',
      JSON.stringify([
        {
          id: 'p-1',
          clienteId: 'cli-1',
          cliente: 'Lucas Mendes',
          telefone: '(11) 98888-7777',
          servico: 'Corte',
          profissional: '',
          periodo: 'qualquer',
          dataPreferida: '',
          observacao: '',
          status: 'aguardando',
          criadoEm: '2026-09-25T00:00:00.000Z',
        },
      ]),
    )

    montarClientes()

    fireEvent.click(screen.getByLabelText('Excluir Lucas Mendes'))

    // sem modal de confirmação: a recusa aparece direto como alerta
    const alerta = screen.getByRole('alert')
    expect(alerta.textContent).toContain(
      'Não foi possível excluir “Lucas Mendes”.',
    )
    expect(alerta.textContent).toContain('assinatura ativa do Audax Club')
    expect(alerta.textContent).toContain('1 pedido(s) na fila de espera')
    expect(screen.queryByText('Excluir cliente')).toBeNull()
    expect(screen.getByText('Lucas Mendes')).toBeTruthy()
    expect(
      JSON.parse(localStorage.getItem('studio-audax:clientes:v1') ?? '[]'),
    ).toHaveLength(1)
  })
})
