import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { CrmProvider } from '@/modules/crm/store'
import { IaProvider } from '@/modules/ia/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider, useServicos } from '@/modules/servicos/store'
import { WhatsProvider } from '@/modules/whatsapp/store'
import Ia from './Ia'

const HOJE = hojeISO()
const CHAVE_CLIENTES = 'studio-audax:clientes:v1'
const CHAVE_AG = 'studio-audax:agendamentos:v1'
const CHAVE_CAIXA = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_WHATS = 'studio-audax:whatsapp:v1'
const CHAVE_CRM = 'studio-audax:crm:v1'
const CHAVE_IA = 'studio-audax:ia:v1'

let ctxServicos: ReturnType<typeof useServicos>

function Captura() {
  const servicos = useServicos()
  useEffect(() => {
    ctxServicos = servicos
  })
  return null
}

function env(elemento: ReactNode) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <CrmProvider>
                <WhatsProvider>
                  <IaProvider>
                    <Captura />
                    {elemento}
                  </IaProvider>
                </WhatsProvider>
              </CrmProvider>
            </CaixaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function ag(
  id: string,
  clienteNome: string,
  dataRel: number,
  servico: string,
) {
  return {
    id,
    cliente: clienteNome,
    telefone: '',
    servico,
    profissional: 'Audax',
    data: somarDias(HOJE, dataRel),
    horario: '10:00',
    status: 'concluido',
    observacao: '',
    criadoEm: '2026-01-01T00:00:00.000Z',
    duracaoMin: 40,
  }
}

/**
 * Ana: sem retorno (2 visitas, última há 60 dias).
 * Bruno: recorrente (3 visitas, última há 20 dias, frequência 20, sem futuro).
 */
function semear() {
  localStorage.setItem(
    CHAVE_CLIENTES,
    JSON.stringify([
      { id: 'c-ana', nome: 'Ana Souza', criadoEm: '2026-01-01T00:00:00.000Z' },
      { id: 'c-bruno', nome: 'Bruno Lima', criadoEm: '2026-01-01T00:00:00.000Z' },
    ]),
  )
  localStorage.setItem(
    CHAVE_AG,
    JSON.stringify([
      ag('ag-1', 'Ana Souza', -70, 'Corte Degradê'),
      ag('ag-2', 'Ana Souza', -60, 'Corte Degradê'),
      ag('ag-3', 'Bruno Lima', -60, 'Barba'),
      ag('ag-4', 'Bruno Lima', -40, 'Barba'),
      ag('ag-5', 'Bruno Lima', -20, 'Barba'),
    ]),
  )
}

function analisar() {
  fireEvent.click(screen.getByRole('button', { name: 'Analisar dados' }))
}

function ler(chave: string): unknown {
  return JSON.parse(localStorage.getItem(chave) ?? 'null')
}

beforeEach(() => {
  localStorage.clear()
  ctxServicos = undefined as unknown as ReturnType<typeof useServicos>
})

describe('Central de IA — análise sem tocar nos dados', () => {
  it('gera sugestões com dados reais sem alterar nada automaticamente', () => {
    semear()
    env(<Ia />)
    const antesClientes = localStorage.getItem(CHAVE_CLIENTES)
    const antesAg = localStorage.getItem(CHAVE_AG)
    const antesCaixa = localStorage.getItem(CHAVE_CAIXA)

    analisar()
    expect(screen.getByText('Reativar Ana Souza')).toBeTruthy()
    expect(screen.getByText('Horário em aberto: Bruno Lima')).toBeTruthy()

    // análise é pura: nenhum dado de negócio foi modificado
    expect(localStorage.getItem(CHAVE_CLIENTES)).toBe(antesClientes)
    expect(localStorage.getItem(CHAVE_AG)).toBe(antesAg)
    expect(localStorage.getItem(CHAVE_CAIXA)).toBe(antesCaixa)
    // nenhuma interação nem mensagem foi criada
    expect(ler(CHAVE_CRM) ?? []).toEqual([])
    expect(ler(CHAVE_WHATS) ?? []).toEqual([])
    expect(ler(CHAVE_IA)).toEqual({ aceitas: [], descartadas: [] })
    // serviços intactos
    expect(ctxServicos.servicos.map((s) => s.nome)).toContain('Barba')
  })

  it('estado inicial explica que nada foi analisado ainda', () => {
    env(<Ia />)
    expect(screen.getByText(/Clique em “Analisar dados”/)).toBeTruthy()
  })
})

describe('Central de IA — confirmação humana', () => {
  it('confirmar reativação cria mensagem PENDENTE (nunca envia sozinha)', async () => {
    semear()
    env(<Ia />)
    analisar()

    const card = screen
      .getByText('Reativar Ana Souza')
      .closest('li') as HTMLElement
    fireEvent.click(within(card).getByText('Confirmar ação'))
    expect(screen.getByText('Confirmar ação da IA')).toBeTruthy()
    fireEvent.click(screen.getByText('Sim, confirmar'))

    await waitFor(() =>
      expect(screen.queryByText('Reativar Ana Souza')).toBeNull(),
    )
    const mensagens: {
      status: string
      origem: string
      texto: string
      template: string
      clienteId: string
    }[] = JSON.parse(localStorage.getItem(CHAVE_WHATS) ?? '[]')
    expect(mensagens).toHaveLength(1)
    expect(mensagens[0].status).toBe('pendente')
    expect(mensagens[0].origem).toBe('ia')
    expect(mensagens[0].template).toBe('reativacao')
    expect(mensagens[0].clienteId).toBe('c-ana')
    expect(mensagens[0].texto).toContain('Ana Souza')

    const estado = JSON.parse(localStorage.getItem(CHAVE_IA) ?? '{}')
    expect(estado.aceitas).toEqual(['reativacao:c-ana'])
  })

  it('confirmar oportunidade cria nota no CRM do cliente', async () => {
    semear()
    env(<Ia />)
    analisar()

    const card = screen
      .getByText('Horário em aberto: Bruno Lima')
      .closest('li') as HTMLElement
    fireEvent.click(within(card).getByText('Confirmar ação'))
    fireEvent.click(screen.getByText('Sim, confirmar'))

    await waitFor(() =>
      expect(screen.queryByText('Horário em aberto: Bruno Lima')).toBeNull(),
    )
    const interacoes: { clienteId: string; texto: string }[] = JSON.parse(
      localStorage.getItem(CHAVE_CRM) ?? '[]',
    )
    expect(interacoes).toHaveLength(1)
    expect(interacoes[0].clienteId).toBe('c-bruno')
    expect(interacoes[0].texto).toContain('Oportunidade de atendimento (IA)')
    // nenhuma mensagem criada neste fluxo
    expect(ler(CHAVE_WHATS) ?? []).toEqual([])
  })

  it('descartar some com a sugestão sem criar nada', () => {
    semear()
    env(<Ia />)
    analisar()

    const card = screen
      .getByText('Reativar Ana Souza')
      .closest('li') as HTMLElement
    fireEvent.click(within(card).getByText('Descartar'))
    expect(screen.queryByText('Reativar Ana Souza')).toBeNull()
    expect(ler(CHAVE_CRM) ?? []).toEqual([])
    expect(ler(CHAVE_WHATS) ?? []).toEqual([])
    const estado = JSON.parse(localStorage.getItem(CHAVE_IA) ?? '{}')
    expect(estado.descartadas).toEqual(['reativacao:c-ana'])
  })

  it('sugestões já tratadas não voltam em uma nova análise', async () => {
    semear()
    env(<Ia />)
    analisar()

    const card = screen
      .getByText('Reativar Ana Souza')
      .closest('li') as HTMLElement
    fireEvent.click(within(card).getByText('Confirmar ação'))
    fireEvent.click(screen.getByText('Sim, confirmar'))
    await waitFor(() =>
      expect(screen.queryByText('Reativar Ana Souza')).toBeNull(),
    )

    analisar()
    expect(screen.queryByText('Reativar Ana Souza')).toBeNull()
    // as demais continuam visíveis
    expect(screen.getByText('Horário em aberto: Bruno Lima')).toBeTruthy()
  })
})
