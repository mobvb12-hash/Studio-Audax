import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NovoAgendamentoModal from './NovoAgendamentoModal'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import {
  ERRO_SEM_INTEGRACAO,
  WhatsProvider,
  useWhats,
} from '@/modules/whatsapp/store'
import type { ProvedorEnvio } from '@/modules/whatsapp/provedor'

const CHAVE_AG = 'studio-audax:agendamentos:v1'
const DIA = '2026-09-25'

let ctxAgenda: ReturnType<typeof useAgenda>
let ctxClientes: ReturnType<typeof useClientes>
let ctxWhats: ReturnType<typeof useWhats>

function Captura() {
  const agenda = useAgenda()
  const clientes = useClientes()
  const whats = useWhats()
  useEffect(() => {
    ctxAgenda = agenda
    ctxClientes = clientes
    ctxWhats = whats
  })
  return null
}

function semear(horario: string, profissional = 'Cleiton Silva') {
  localStorage.setItem(
    CHAVE_AG,
    JSON.stringify([
      {
        id: 'ag-existente',
        cliente: 'Lucas Mendes',
        telefone: '',
        servico: 'Corte Degradê',
        profissional,
        data: DIA,
        horario,
        status: 'confirmado',
        observacao: '',
        criadoEm: '2026-09-01T00:00:00.000Z',
      },
    ]),
  )
}

/**
 * Reproduz o App: ao salvar, a modal fecha e desmonta de verdade — o envio
 * precisa acontecer antes disso, sem depender de re-renderização atrasada.
 */
function montar(horarioInicial = '10:30', profissionalInicial = 'Cleiton Silva') {
  const onFechar = vi.fn()
  function Janela() {
    const [aberto, setAberto] = useState(true)
    return (
      <>
        <button type="button" onClick={() => setAberto(true)}>
          reabrir modal
        </button>
        {aberto && (
          <NovoAgendamentoModal
            dataInicial={DIA}
            horarioInicial={horarioInicial}
            profissionalInicial={profissionalInicial}
            onFechar={() => {
              onFechar()
              setAberto(false)
            }}
          />
        )}
      </>
    )
  }
  render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <WhatsProvider>
              <Captura />
              <Janela />
            </WhatsProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
  return onFechar
}

function criarCliente(nome: string, telefone: string) {
  act(() => {
    ctxClientes.adicionar({ nome, telefone, email: '', observacao: '' })
  })
}

function configurarProvedor(enviar: ProvedorEnvio['enviar']) {
  const provedor: ProvedorEnvio = { nome: 'fake', enviar }
  act(() => {
    ctxWhats.configurarProvedor(provedor)
  })
  return provedor
}

/** Deixa o envio agendado no próximo semáforo concluir dentro do act. */
async function aguardarEnvio() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
}

function digitarCliente(nome: string) {
  fireEvent.change(screen.getByLabelText('Cliente *'), {
    target: { value: nome },
  })
}

function salvar() {
  fireEvent.click(screen.getByText('Salvar agendamento'))
}

beforeEach(() => {
  localStorage.clear()
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxWhats = undefined as unknown as ReturnType<typeof useWhats>
})

describe('NovoAgendamentoModal — conflito de horários', () => {
  it('bloqueia sobreposição parcial (10:00 de 40min + 10:30)', () => {
    semear('10:00')
    const onFechar = montar('10:30')
    digitarCliente('Ana Souza')
    salvar()
    expect(screen.getByText(/Conflito:/)).toBeTruthy()
    expect(screen.getByText(/10:00–10:40/)).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
  })

  it('profissional diferente no mesmo horário não conflita', () => {
    semear('10:30', 'Cleiton Silva')
    const onFechar = montar('10:30', 'Ítalo Santos')
    digitarCliente('Ana Souza')
    salvar()
    expect(screen.queryByText(/Conflito:/)).toBeNull()
    expect(onFechar).toHaveBeenCalledTimes(1)
  })

  it('horário livre salva normalmente', () => {
    semear('10:00')
    const onFechar = montar('14:00')
    digitarCliente('Ana Souza')
    salvar()
    expect(screen.queryByText(/Conflito:/)).toBeNull()
    expect(onFechar).toHaveBeenCalledTimes(1)
    const lista = JSON.parse(localStorage.getItem(CHAVE_AG) ?? '[]')
    expect(lista).toHaveLength(2)
    expect(lista[1].cliente).toBe('Ana Souza')
  })

  it('valida nome do cliente antes de salvar', () => {
    semear('10:00')
    const onFechar = montar('14:00')
    salvar()
    expect(screen.getByText('Informe o nome do cliente.')).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
  })
})

describe('NovoAgendamentoModal — cliente duplicado no horário', () => {
  it('bloqueia mesmo cliente no mesmo horário mesmo com profissional diferente', () => {
    semear('10:00', 'Cleiton Silva')
    const onFechar = montar('10:00', 'Ítalo Santos')
    digitarCliente('lucas mendes')
    salvar()
    expect(
      screen.getByText(/Cliente já tem agendamento neste horário/),
    ).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
  })

  it('cliente diferente no mesmo horário salva normalmente', () => {
    semear('10:00', 'Cleiton Silva')
    const onFechar = montar('10:00', 'Ítalo Santos')
    digitarCliente('Ana Souza')
    salvar()
    expect(onFechar).toHaveBeenCalledTimes(1)
    const lista = JSON.parse(localStorage.getItem(CHAVE_AG) ?? '[]')
    expect(lista).toHaveLength(2)
  })
})

describe('NovoAgendamentoModal — confirmação automática de WhatsApp', () => {
  it('cliente cadastrado com telefone: cria e envia exatamente 1 confirmação', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    const onFechar = montar()
    configurarProvedor(enviar)
    criarCliente('Ana Souza', '81 98888-7777')

    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    expect(onFechar).toHaveBeenCalledTimes(1)
    // fecha de verdade: o envio não pode depender da modal que já desmontou
    expect(screen.queryByLabelText('Cliente *')).toBeNull()
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxWhats.mensagens).toHaveLength(1)
    const [mensagem] = ctxWhats.mensagens
    expect(mensagem.template).toBe('confirmacao')
    expect(mensagem.origem).toBe('automacao')
    expect(mensagem.status).toBe('enviada')
    expect(mensagem.texto).toContain('Ana Souza')
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('mensagem carrega o agendamentoId do agendamento criado', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    montar()
    configurarProvedor(enviar)
    criarCliente('Ana Souza', '81 98888-7777')

    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    const agendamento = ctxAgenda.agendamentos[0]
    expect(ctxWhats.mensagens).toHaveLength(1)
    expect(ctxWhats.mensagens[0].agendamentoId).toBe(agendamento.id)
    expect(ctxWhats.mensagens[0].clienteId).toBeTruthy()
  })

  it('cliente sem telefone: agenda normalmente e não cria mensagem', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    const onFechar = montar()
    configurarProvedor(enviar)
    criarCliente('Bruno Lima', '')

    digitarCliente('Bruno Lima')
    salvar()
    await aguardarEnvio()

    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxWhats.mensagens).toHaveLength(0)
    expect(enviar).not.toHaveBeenCalled()
  })

  it('cliente não cadastrado: agenda normalmente e não cria mensagem', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    const onFechar = montar()
    configurarProvedor(enviar)

    digitarCliente('Carla Não Cadastrada')
    salvar()
    await aguardarEnvio()

    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxWhats.mensagens).toHaveLength(0)
    expect(enviar).not.toHaveBeenCalled()
  })

  it('tentativa duplicada no mesmo horário não cria/envia 2ª confirmação', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    const onFechar = montar()
    configurarProvedor(enviar)
    criarCliente('Ana Souza', '81 98888-7777')

    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(ctxWhats.mensagens).toHaveLength(1)

    // mesmo cliente, mesma data e horário numa nova abertura da modal
    fireEvent.click(screen.getByText('reabrir modal'))
    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    expect(screen.getByText(/Conflito:/)).toBeTruthy()
    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxWhats.mensagens).toHaveLength(1)
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('falha no provedor: agendamento salvo e mensagem fica falhou com motivo', async () => {
    const enviar = vi
      .fn()
      .mockResolvedValue({ ok: false, motivo: 'Sem conexão com a Evolution' })
    const onFechar = montar()
    configurarProvedor(enviar)
    criarCliente('Ana Souza', '81 98888-7777')

    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxWhats.mensagens).toHaveLength(1)
    const [mensagem] = ctxWhats.mensagens
    expect(mensagem.status).toBe('falhou')
    expect(mensagem.motivoFalha).toBe('Sem conexão com a Evolution')
  })

  it('sem integração configurada: mensagem fica falhou com o motivo do sistema', async () => {
    const onFechar = montar()
    criarCliente('Ana Souza', '81 98888-7777')

    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxWhats.mensagens).toHaveLength(1)
    const [mensagem] = ctxWhats.mensagens
    expect(mensagem.status).toBe('falhou')
    expect(mensagem.motivoFalha).toBe(ERRO_SEM_INTEGRACAO)
  })
})
