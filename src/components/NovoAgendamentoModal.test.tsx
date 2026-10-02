import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NovoAgendamentoModal from './NovoAgendamentoModal'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ProfissionaisProvider, useProfissionais } from '@/modules/profissionais/store'
import { ServicosProvider, useServicos } from '@/modules/servicos/store'
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
let ctxServicos: ReturnType<typeof useServicos>
let ctxProfissionais: ReturnType<typeof useProfissionais>

function Captura() {
  const agenda = useAgenda()
  const clientes = useClientes()
  const whats = useWhats()
  const servicos = useServicos()
  const profissionais = useProfissionais()
  useEffect(() => {
    ctxAgenda = agenda
    ctxClientes = clientes
    ctxWhats = whats
    ctxServicos = servicos
    ctxProfissionais = profissionais
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
  ctxServicos = undefined as unknown as ReturnType<typeof useServicos>
  ctxProfissionais = undefined as unknown as ReturnType<typeof useProfissionais>
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

  it('mensagem completa: cliente, serviço, profissional, data longa e horário, sem endereço', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    montar()
    configurarProvedor(enviar)
    criarCliente('Ana Souza', '81 98888-7777')

    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    expect(ctxWhats.mensagens).toHaveLength(1)
    const servicoPadrao = ctxServicos.servicos.filter((s) => s.ativo)[0].nome
    const [mensagem] = ctxWhats.mensagens
    expect(mensagem.texto).toBe(
      `Olá, Ana Souza! Confirmação do seu agendamento: ${servicoPadrao} com Cleiton Silva em ${formatarDataLonga(DIA)} às 10:30. Até lá — Studio Audax.`,
    )
    // Sem fonte oficial de endereço, a confirmação não inventa um
    expect(mensagem.texto).not.toMatch(/endere[çc]o|Rua |Avenida /i)
  })

  it('serviço inexistente no cadastro: não salva e não cria/envia confirmação', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    const onFechar = montar()
    configurarProvedor(enviar)
    criarCliente('Ana Souza', '81 98888-7777')
    const servicoSelecionado = ctxServicos.servicos[0]

    await act(async () => {
      await ctxServicos.remover(servicoSelecionado.id)
    })
    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    expect(
      screen.getByText('Cadastre um serviço no módulo Serviços antes de agendar.'),
    ).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
    expect(ctxAgenda.agendamentos).toHaveLength(0)
    expect(ctxWhats.mensagens).toHaveLength(0)
    expect(enviar).not.toHaveBeenCalled()
  })

  it('profissional inexistente no cadastro: não salva e não cria/envia confirmação', async () => {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    const onFechar = montar()
    configurarProvedor(enviar)
    criarCliente('Ana Souza', '81 98888-7777')
    const profSelecionado = ctxProfissionais.profissionais.find(
      (p) => p.nome === 'Cleiton Silva',
    )

    await act(async () => {
      await ctxProfissionais.remover(profSelecionado!.id)
    })
    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()

    expect(
      screen.getByText(
        'Cadastre um profissional no módulo Profissionais antes de agendar.',
      ),
    ).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
    expect(ctxAgenda.agendamentos).toHaveLength(0)
    expect(ctxWhats.mensagens).toHaveLength(0)
    expect(enviar).not.toHaveBeenCalled()
  })

  /** Cria o agendamento de partida (1 confirmação enviada) para as mutações. */
  async function agendarUmaVez() {
    const enviar = vi.fn().mockResolvedValue({ ok: true })
    montar()
    configurarProvedor(enviar)
    criarCliente('Ana Souza', '81 98888-7777')
    digitarCliente('Ana Souza')
    salvar()
    await aguardarEnvio()
    expect(ctxWhats.mensagens).toHaveLength(1)
    expect(enviar).toHaveBeenCalledTimes(1)
    return enviar
  }

  it('cancelar o agendamento não cria nem envia nova confirmação', async () => {
    const enviar = await agendarUmaVez()
    const ag = ctxAgenda.agendamentos[0]

    act(() => {
      ctxAgenda.mudarStatus(ag.id, 'cancelado')
    })

    expect(ctxAgenda.agendamentos[0].status).toBe('cancelado')
    expect(ctxWhats.mensagens).toHaveLength(1)
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('editar o agendamento não cria nem envia nova confirmação', async () => {
    const enviar = await agendarUmaVez()
    const ag = ctxAgenda.agendamentos[0]

    act(() => {
      ctxAgenda.editar(ag.id, {
        cliente: ag.cliente,
        telefone: ag.telefone,
        servico: ag.servico,
        observacao: 'Observação atualizada pelo cliente',
      })
    })

    expect(ctxAgenda.agendamentos[0].observacao).toBe(
      'Observação atualizada pelo cliente',
    )
    expect(ctxWhats.mensagens).toHaveLength(1)
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('remarcar o agendamento não cria nem envia nova confirmação', async () => {
    const enviar = await agendarUmaVez()
    const ag = ctxAgenda.agendamentos[0]

    act(() => {
      ctxAgenda.remarcar(ag.id, {
        data: ag.data,
        horario: '15:00',
        profissional: ag.profissional,
      })
    })

    expect(ctxAgenda.agendamentos[0].horario).toBe('15:00')
    expect(ctxWhats.mensagens).toHaveLength(1)
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('mudar o status (concluído) não cria nem envia nova confirmação', async () => {
    const enviar = await agendarUmaVez()
    const ag = ctxAgenda.agendamentos[0]

    act(() => {
      ctxAgenda.mudarStatus(ag.id, 'concluido')
    })

    expect(ctxAgenda.agendamentos[0].status).toBe('concluido')
    expect(ctxWhats.mensagens).toHaveLength(1)
    expect(enviar).toHaveBeenCalledTimes(1)
  })
})
