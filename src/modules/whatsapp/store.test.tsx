import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProvedorEnvio } from './provedor'
import { ERRO_SEM_INTEGRACAO, WhatsProvider, useWhats } from './store'
import type { MensagemWhats } from './types'

const CHAVE = 'studio-audax:whatsapp:v1'

let ctx: ReturnType<typeof useWhats>

function Captura() {
  const whats = useWhats()
  useEffect(() => {
    ctx = whats
  })
  return null
}

function montar() {
  return render(
    <WhatsProvider>
      <Captura />
    </WhatsProvider>,
  )
}

function criarPadrao(): MensagemWhats {
  return ctx.criar({
    clienteId: 'c-1',
    cliente: 'Ana Souza',
    template: 'reativacao',
    texto: 'Olá, Ana! Já são 45 dia(s) desde seu último atendimento.',
  })
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useWhats>
})

describe('WhatsApp store — mensagens pendentes', () => {
  it('cria mensagem como pendente e persiste', () => {
    montar()
    let msg: MensagemWhats | undefined
    act(() => {
      msg = criarPadrao()
    })
    expect(msg?.status).toBe('pendente')
    expect(msg?.origem).toBe('crm')

    const salvo: MensagemWhats[] = JSON.parse(
      localStorage.getItem(CHAVE) ?? '[]',
    )
    expect(salvo).toHaveLength(1)
    expect(salvo[0].status).toBe('pendente')
  })

  it('valida antes de gravar: cliente, template e texto', () => {
    montar()
    expect(() =>
      ctx.criar({
        clienteId: '',
        cliente: 'Ana',
        template: 'reativacao',
        texto: 'Texto válido',
      }),
    ).toThrow('Selecione um cliente para criar a mensagem.')
    expect(() =>
      ctx.criar({
        clienteId: 'c-1',
        cliente: 'Ana',
        template: 'inventado' as 'reativacao',
        texto: 'Texto válido',
      }),
    ).toThrow('Template de mensagem inválido.')
    expect(() =>
      ctx.criar({
        clienteId: 'c-1',
        cliente: 'Ana',
        template: 'reativacao',
        texto: '  ',
      }),
    ).toThrow('A mensagem precisa de um texto.')
    expect(ctx.mensagens).toHaveLength(0)
  })

  it('sem integração configurada: NÃO envia e nada muda (pendente permanece)', async () => {
    montar()
    let id = ''
    act(() => {
      id = criarPadrao().id
    })
    expect(ctx.integracaoAtiva).toBe(false)

    await expect(ctx.enviar(id)).rejects.toThrow(ERRO_SEM_INTEGRACAO)

    const salvo: MensagemWhats[] = JSON.parse(
      localStorage.getItem(CHAVE) ?? '[]',
    )
    expect(salvo[0].status).toBe('pendente')
    expect(salvo[0].enviadoEm).toBeUndefined()
  })

  it('com provedor configurado: marca como enviada', async () => {
    montar()
    const provedor: ProvedorEnvio = {
      nome: 'oficial',
      enviar: vi.fn().mockResolvedValue({ ok: true }),
    }
    let id = ''
    act(() => {
      id = criarPadrao().id
      ctx.configurarProvedor(provedor)
    })
    expect(ctx.integracaoAtiva).toBe(true)

    await act(async () => {
      await ctx.enviar(id)
    })

    expect(provedor.enviar).toHaveBeenCalledTimes(1)
    const atual = ctx.mensagens.find((m) => m.id === id)
    expect(atual?.status).toBe('enviada')
    expect(atual?.enviadoEm).toBeTruthy()
  })

  it('com provedor que falha: marca como falhou com o motivo', async () => {
    montar()
    const provedor: ProvedorEnvio = {
      nome: 'oficial',
      enviar: vi.fn().mockResolvedValue({ ok: false, motivo: 'Sem conexão' }),
    }
    let id = ''
    act(() => {
      id = criarPadrao().id
      ctx.configurarProvedor(provedor)
    })
    await act(async () => {
      await ctx.enviar(id)
    })
    const atual = ctx.mensagens.find((m) => m.id === id)
    expect(atual?.status).toBe('falhou')
    expect(atual?.motivoFalha).toBe('Sem conexão')
  })

  it('registra envio manual e falha manual com motivo', () => {
    montar()
    let id = ''
    act(() => {
      id = criarPadrao().id
    })
    act(() => {
      ctx.registrarEnvioManual(id)
    })
    expect(ctx.mensagens[0].status).toBe('enviada')

    expect(() => ctx.registrarFalha(id, '   ')).toThrow(
      'Informe o motivo da falha.',
    )
    act(() => {
      ctx.registrarFalha(id, 'Número bloqueado pelo destinatário')
    })
    expect(ctx.mensagens[0].status).toBe('falhou')
    expect(ctx.mensagens[0].motivoFalha).toBe('Número bloqueado pelo destinatário')
  })

  it('enviar id inexistente lança erro', async () => {
    montar()
    await expect(ctx.enviar('nao-existe')).rejects.toThrow(
      'Mensagem não encontrada.',
    )
  })

  it('mensagensDoCliente filtra por cliente', () => {
    montar()
    act(() => {
      criarPadrao()
      ctx.criar({
        clienteId: 'c-2',
        cliente: 'Bruno',
        template: 'pos_atendimento',
        texto: 'Oi, Bruno! Obrigado pelo atendimento.',
      })
    })
    expect(ctx.mensagensDoCliente('c-1')).toHaveLength(1)
    expect(ctx.mensagensDoCliente('c-2')).toHaveLength(1)
    expect(ctx.mensagensDoCliente('c-3')).toHaveLength(0)
  })

  it('migra registros antigos sem apagar (status inválido vira pendente)', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        {
          id: 'm-1',
          clienteId: 'c-1',
          cliente: 'Ana',
          template: 'lembrete',
          texto: 'Mensagem antiga',
          status: 'qualquer',
        },
      ]),
    )
    montar()
    expect(ctx.mensagens).toHaveLength(1)
    expect(ctx.mensagens[0].status).toBe('pendente')
    expect(ctx.mensagens[0].template).toBe('lembrete')
    expect(ctx.mensagens[0].texto).toBe('Mensagem antiga')
  })

  it('reconhece templates e origem de automação sem apagar registros', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        {
          id: 'm-1',
          clienteId: 'c-1',
          cliente: 'Ana',
          template: 'aniversario',
          texto: 'Feliz aniversário',
          origem: 'automacao',
        },
        {
          id: 'm-2',
          clienteId: 'c-2',
          cliente: 'Bruno',
          template: 'desconhecido',
          texto: 'Antiga',
          origem: 'outra',
        },
      ]),
    )
    montar()
    expect(ctx.mensagens[0].template).toBe('aniversario')
    expect(ctx.mensagens[0].origem).toBe('automacao')
    expect(ctx.mensagens[1].template).toBe('confirmacao')
    expect(ctx.mensagens[1].origem).toBe('crm')
  })

  it('aceita criar mensagem com origem de automação', () => {
    montar()
    let nova: MensagemWhats | undefined
    act(() => {
      nova = ctx.criar({
        clienteId: 'c-1',
        cliente: 'Ana',
        template: 'vencimento_clube',
        texto: 'Seu plano vence em 3 dia(s).',
        origem: 'automacao',
      })
    })
    expect(nova?.status).toBe('pendente')
    expect(nova?.origem).toBe('automacao')
    const salvo: MensagemWhats[] = JSON.parse(
      localStorage.getItem(CHAVE) ?? '[]',
    )
    expect(salvo[0].template).toBe('vencimento_clube')
    expect(salvo[0].origem).toBe('automacao')
  })

  it('anti-duplicação: pendente idêntica é reutilizada, nunca copiada', () => {
    montar()
    let primeira: MensagemWhats | undefined
    let segunda: MensagemWhats | undefined
    act(() => {
      primeira = criarPadrao()
    })
    act(() => {
      segunda = criarPadrao()
    })
    expect(segunda?.id).toBe(primeira?.id)
    expect(ctx.mensagens).toHaveLength(1)

    // texto diferente cria outra mensagem
    act(() => {
      ctx.criar({
        clienteId: 'c-1',
        cliente: 'Ana Souza',
        template: 'reativacao',
        texto: 'Outro texto, outra mensagem pendente.',
      })
    })
    expect(ctx.mensagens).toHaveLength(2)

    // enviada não bloqueia uma nova pendente com o mesmo texto
    act(() => {
      ctx.registrarEnvioManual(primeira!.id)
    })
    let nova: MensagemWhats | undefined
    act(() => {
      nova = criarPadrao()
    })
    expect(nova?.id).not.toBe(primeira?.id)
    expect(ctx.mensagens).toHaveLength(3)
    const salvo: MensagemWhats[] = JSON.parse(
      localStorage.getItem(CHAVE) ?? '[]',
    )
    expect(salvo).toHaveLength(3)
  })
})
