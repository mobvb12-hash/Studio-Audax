import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import AutomacoesModal from '@/components/AutomacoesModal'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import {
  AutomacoesProvider,
  useAutomacoes,
} from '@/modules/automacoes/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { EsperaProvider } from '@/modules/espera/store'
import { WhatsProvider } from '@/modules/whatsapp/store'

const HOJE = hojeISO()
const AMANHA = somarDias(HOJE, 1)
const CHAVE_WHATS = 'studio-audax:whatsapp:v1'
const CHAVE_AUTOMACOES = 'studio-audax:automacoes:v1'

let ctxAgenda: ReturnType<typeof useAgenda>
let ctxClientes: ReturnType<typeof useClientes>
let ctxAutomacoes: ReturnType<typeof useAutomacoes>

function Captura() {
  const agenda = useAgenda()
  const clientes = useClientes()
  const automacoes = useAutomacoes()
  useEffect(() => {
    ctxAgenda = agenda
    ctxClientes = clientes
    ctxAutomacoes = automacoes
  })
  return null
}

function env(elemento: ReactNode) {
  return render(
    <ClientesProvider>
      <AgendaProvider>
        <CaixaProvider>
          <ClubeProvider>
            <EsperaProvider>
              <WhatsProvider>
                <AutomacoesProvider>
                  <Captura />
                  {elemento}
                </AutomacoesProvider>
              </WhatsProvider>
            </EsperaProvider>
          </ClubeProvider>
        </CaixaProvider>
      </AgendaProvider>
    </ClientesProvider>,
  )
}

function mensagens(): Array<Record<string, unknown>> {
  return JSON.parse(localStorage.getItem(CHAVE_WHATS) ?? '[]')
}

function tratadas(): string[] {
  const bruto = localStorage.getItem(CHAVE_AUTOMACOES)
  if (!bruto) return []
  return (JSON.parse(bruto) as { tratadas: string[] }).tratadas
}

beforeEach(() => {
  localStorage.clear()
  ctxAutomacoes = undefined as unknown as ReturnType<typeof useAutomacoes>
})

describe('Automações — integração do modal', () => {
  it('não prepara confirmação para agendamento já confirmado (trigger do banco envia)', () => {
    env(<AutomacoesModal onFechar={() => undefined} />)
    act(() => {
      ctxClientes.adicionar({
        nome: 'Ana Souza',
        telefone: '(11) 91111-2222',
        email: '',
        observacao: '',
      })
      ctxAgenda.adicionar({
        cliente: 'Ana Souza',
        telefone: '',
        servico: 'Corte',
        profissional: 'Audax',
        data: AMANHA,
        horario: '09:00',
        observacao: '',
      })
    })

    // Agendamento já confirmado: a confirmação é enviada pelo trigger do banco,
    // não pela automação local. O modal não deve sugerir confirmação.
    expect(screen.queryByText('Confirmação de agendamento')).toBeNull()
    expect(mensagens()).toHaveLength(0)
  })

  it('agendamento confirmado não gera sugestão de confirmação', () => {
    const { unmount } = env(<AutomacoesModal onFechar={() => undefined} />)
    act(() => {
      ctxClientes.adicionar({
        nome: 'Ana Souza',
        telefone: '',
        email: '',
        observacao: '',
      })
      ctxAgenda.adicionar({
        cliente: 'Ana Souza',
        telefone: '',
        servico: 'Corte',
        profissional: 'Audax',
        data: AMANHA,
        horario: '09:00',
        observacao: '',
      })
    })
    unmount()

    // "reabrir": novo modal lê a mesma chave de tratadas
    env(<AutomacoesModal onFechar={() => undefined} />)
    expect(screen.queryByText('Confirmação de agendamento')).toBeNull()
    expect(screen.getByText(/Nenhuma automação pronta/)).toBeTruthy()
  })

  it('ignorar marca como tratada sem criar mensagem', () => {
    env(<AutomacoesModal onFechar={() => undefined} />)
    act(() => {
      ctxClientes.adicionar({
        nome: 'Carla Dias',
        telefone: '',
        email: '',
        observacao: '',
        nascimento: HOJE,
      })
    })
    expect(screen.getByText('Feliz aniversário')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))

    expect(mensagens()).toHaveLength(0)
    expect(tratadas()[0]).toMatch(/^aniversario:/)
    expect(screen.queryByText('Feliz aniversário')).toBeNull()
    expect(ctxAutomacoes.tratadas).toHaveLength(1)
  })

  it('sem gatilhos mostra o estado vazio', () => {
    env(<AutomacoesModal onFechar={() => undefined} />)
    expect(screen.getByText(/Nenhuma automação pronta/)).toBeTruthy()
  })
})
