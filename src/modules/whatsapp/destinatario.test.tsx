import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAVE_STORAGE_CLIENTES } from '@/modules/clientes/migracao'
import { enviarTextoWhatsApp } from '@/services/evolution'
import { WhatsProvider, useWhats } from './store'

// Supabase "configurado" para ativar o provedor padrão Evolution, com o
// envio real substituído por um espião — nenhum WhatsApp é acionado.
vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))
vi.mock('@/services/evolution', () => ({
  FUNCAO_WHATSAPP: 'whatsapp-enviar',
  enviarTextoWhatsApp: vi.fn().mockResolvedValue({ ok: true }),
}))

let ctx: ReturnType<typeof useWhats>

function Captura() {
  const whats = useWhats()
  useEffect(() => {
    ctx = whats
  })
  return null
}

function montar() {
  render(
    <WhatsProvider>
      <Captura />
    </WhatsProvider>,
  )
}

function semearCliente(telefone: string) {
  localStorage.setItem(
    CHAVE_STORAGE_CLIENTES,
    JSON.stringify([{ id: 'cli-1', nome: 'Ana Souza', telefone }]),
  )
}

function criarConfirmacao(): string {
  let id = ''
  act(() => {
    id = ctx.criar({
      clienteId: 'cli-1',
      cliente: 'Ana Souza',
      template: 'confirmacao',
      texto: 'Olá, Ana Souza! Confirmação do seu agendamento.',
      origem: 'automacao',
      agendamentoId: 'ag-1',
    }).id
  })
  return id
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useWhats>
  vi.mocked(enviarTextoWhatsApp).mockClear()
  vi.mocked(enviarTextoWhatsApp).mockResolvedValue({ ok: true })
})

describe('Destinatário da confirmação automática', () => {
  it('usa exclusivamente o telefone do cliente cadastrado', async () => {
    semearCliente('81 98888-7777')
    montar()
    const id = criarConfirmacao()

    await act(async () => {
      await ctx.enviar(id)
    })

    expect(enviarTextoWhatsApp).toHaveBeenCalledTimes(1)
    expect(enviarTextoWhatsApp).toHaveBeenCalledWith(
      '81 98888-7777',
      expect.any(String),
    )
    expect(ctx.mensagens[0].status).toBe('enviada')
  })

  it('cliente sem telefone: o provedor não é chamado e a mensagem fica falhou com motivo', async () => {
    semearCliente('')
    montar()
    const id = criarConfirmacao()

    await act(async () => {
      await ctx.enviar(id)
    })

    expect(enviarTextoWhatsApp).not.toHaveBeenCalled()
    expect(ctx.mensagens[0].status).toBe('falhou')
    expect(ctx.mensagens[0].motivoFalha).toBe(
      'Cliente sem telefone cadastrado.',
    )
  })
})
