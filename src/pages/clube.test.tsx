import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { addMonthsISO } from '@/modules/clube/regras'
import { ClubeProvider, useClube } from '@/modules/clube/store'
import type { AssinaturaClube } from '@/modules/clube/types'
import { formatarBRL } from '@/lib/moeda'
import Clube from './Clube'

const DIA = hojeISO()

let ctxClube: ReturnType<typeof useClube>
let ctxClientes: ReturnType<typeof useClientes>

function Captura() {
  const clube = useClube()
  const clientes = useClientes()
  useEffect(() => {
    ctxClube = clube
    ctxClientes = clientes
  })
  return null
}

function montar() {
  return render(
    <ClientesProvider>
      <CaixaProvider>
        <ClubeProvider>
          <Captura />
          <div data-testid="clube">
            <Clube />
          </div>
        </ClubeProvider>
      </CaixaProvider>
    </ClientesProvider>,
  )
}

function criarCliente(nome: string): string {
  const r: { id?: string } = {}
  act(() => {
    r.id = ctxClientes.adicionar({
      nome,
      telefone: '',
      email: '',
      observacao: '',
    }).id
  })
  return r.id as string
}

function criarAssinatura(
  clienteId: string,
  cliente: string,
  dataAssinatura: string = DIA,
  valorMensal = 99.9,
): AssinaturaClube {
  const r: { nova?: AssinaturaClube } = {}
  act(() => {
    r.nova = ctxClube.assinar({
      clienteId,
      cliente,
      plano: 'cabelo_barba',
      valorMensal,
      dataAssinatura,
    })
  })
  return r.nova as AssinaturaClube
}

// Compara textContent (preserva NBSP do formatarBRL), ignorando a normalização
// de espaços do testing-library.
function valorKpi(rotulo: string): string {
  const rotuloEl = screen
    .getAllByText(rotulo)
    .find((el) => el.tagName === 'P') as HTMLElement
  return rotuloEl.parentElement?.lastElementChild?.textContent ?? ''
}

function clicarChip(rotulo: string) {
  fireEvent.click(screen.getByRole('button', { name: rotulo }))
}

beforeEach(() => {
  localStorage.clear()
})

describe('Audax Club — página', () => {
  it('renderiza cabeçalho, KPIs zerados e estado vazio', () => {
    montar()
    expect(screen.getByRole('heading', { name: 'Audax Club' })).toBeTruthy()
    expect(screen.getByText('+ Nova assinatura')).toBeTruthy()
    expect(screen.getByText('Nenhuma assinatura cadastrada.')).toBeTruthy()
    expect(valorKpi('Assinantes ativos')).toBe('0')
    expect(valorKpi('Receita prevista/mês')).toBe(formatarBRL(0))
    expect(valorKpi('Pago no mês')).toBe(formatarBRL(0))
  })

  it('cria assinatura pelo formulário: plano, valor e vencimento +1 mês', () => {
    montar()
    const id = criarCliente('Lucas Mendes')

    fireEvent.click(screen.getByText('+ Nova assinatura'))
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: id },
    })
    fireEvent.change(screen.getByLabelText('Plano *'), {
      target: { value: 'cabelo_barba' },
    })
    fireEvent.change(screen.getByLabelText('Mensalidade (R$) *'), {
      target: { value: '99,90' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar assinatura' }))

    expect(screen.queryByText('Nova assinatura')).toBeNull()
    expect(screen.getByText('Lucas Mendes')).toBeTruthy()
    expect(screen.getByText('Cabelo + Barba')).toBeTruthy()
    expect(screen.getByText('Ativa')).toBeTruthy()
    expect(valorKpi('Assinantes ativos')).toBe('1')
    expect(valorKpi('Receita prevista/mês')).toBe(formatarBRL(99.9))

    expect(ctxClube.assinaturas).toHaveLength(1)
    expect(ctxClube.assinaturas[0].proximoVencimento).toBe(addMonthsISO(DIA, 1))
    expect(ctxClube.assinaturas[0].valorMensal).toBe(99.9)
  })

  it('valida os campos obrigatórios do formulário', () => {
    montar()
    criarCliente('Lucas Mendes')
    fireEvent.click(screen.getByText('+ Nova assinatura'))
    fireEvent.click(screen.getByRole('button', { name: 'Criar assinatura' }))
    expect(screen.getByText('Selecione o cliente.')).toBeTruthy()
    expect(ctxClube.assinaturas).toHaveLength(0)
  })

  it('não oferece cliente que já tem assinatura em andamento', () => {
    montar()
    const id = criarCliente('Lucas Mendes')
    criarAssinatura(id, 'Lucas Mendes')

    fireEvent.click(screen.getByText('+ Nova assinatura'))
    expect(screen.queryByLabelText('Cliente *')).toBeNull()
    expect(
      screen.getByText(/Todos os clientes já têm assinatura em andamento/),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Criar assinatura' }),
    ).toHaveProperty('disabled', true)
  })

  it('registra pagamento/renovação e mostra no histórico', () => {
    montar()
    const id = criarCliente('Lucas Mendes')
    const ass = criarAssinatura(id, 'Lucas Mendes')

    fireEvent.click(screen.getByText('Detalhes'))
    expect(screen.getByText('Histórico da assinatura')).toBeTruthy()
    expect(screen.getByText('Pagamentos (0)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '+ Registrar pagamento' }))
    expect(screen.getByText('Pagamento de renovação')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'pix' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }))

    expect(
      screen.getByText('Pagamento registrado e ciclo renovado.'),
    ).toBeTruthy()
    expect(screen.getByText('Pagamentos (1)')).toBeTruthy()
    expect(valorKpi('Assinantes ativos')).toBe('1')

    // ciclo renovado: +1 mês sobre o vencimento anterior
    expect(ctxClube.assinaturas[0].proximoVencimento).toBe(
      addMonthsISO(addMonthsISO(DIA, 1), 1),
    )
    expect(ctxClube.pagamentosDaAssinatura(ass.id)).toHaveLength(1)
    expect(ctxClube.pagamentos[0].valor).toBe(99.9)
  })

  it('cancela sem apagar histórico e reflete nos filtros', () => {
    montar()
    const id = criarCliente('Lucas Mendes')
    criarAssinatura(id, 'Lucas Mendes')

    // pagamento antes do cancelamento
    fireEvent.click(screen.getByText('Detalhes'))
    fireEvent.click(screen.getByRole('button', { name: '+ Registrar pagamento' }))
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'pix' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }))

    // cancelar a partir do histórico
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    const texto = screen.getByText(/Cancelar a assinatura de/)
    fireEvent.click(
      within(texto.parentElement as HTMLElement).getByRole('button', {
        name: 'Cancelar assinatura',
      }),
    )

    expect(screen.getAllByText('Cancelada').length).toBeGreaterThan(0)
    expect(screen.getByText('Pagamentos (1)')).toBeTruthy() // histórico preservado
    expect(
      screen.queryByRole('button', { name: '+ Registrar pagamento' }),
    ).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0])
    expect(screen.getByText('Cancelada')).toBeTruthy()
    expect(ctxClube.assinaturas[0].cancelada).toBe(true)
    expect(ctxClube.pagamentos).toHaveLength(1)

    // filtros
    clicarChip('Canceladas')
    expect(screen.getByText('Lucas Mendes')).toBeTruthy()
    clicarChip('Ativas')
    expect(
      screen.getByText('Nenhuma assinatura encontrada com este filtro.'),
    ).toBeTruthy()
  })

  it('filtra por situação e busca por cliente', () => {
    montar()
    const id1 = criarCliente('Ana Souza')
    const id2 = criarCliente('Bruno Lima')
    criarAssinatura(id1, 'Ana Souza')
    // assinatura com vencimento há 5 dias → atrasada
    criarAssinatura(id2, 'Bruno Lima', addMonthsISO(somarDias(DIA, -5), -1))

    expect(valorKpi('Assinantes ativos')).toBe('1')
    expect(valorKpi('Atrasadas')).toBe('1')

    clicarChip('Atrasadas')
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.queryByText('Ana Souza')).toBeNull()

    clicarChip('Ativas')
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.queryByText('Bruno Lima')).toBeNull()

    clicarChip('Todas')
    fireEvent.change(screen.getByLabelText('Buscar assinatura por cliente'), {
      target: { value: 'bruno' },
    })
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.queryByText('Ana Souza')).toBeNull()
  })

  it('renderiza a página sem erros de console', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar()
    expect(screen.getByRole('heading', { name: 'Audax Club' })).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })
})
