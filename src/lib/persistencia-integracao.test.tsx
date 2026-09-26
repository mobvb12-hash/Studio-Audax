import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvisoPersistencia from '@/components/AvisoPersistencia'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClubeProvider, useClube } from '@/modules/clube/store'
import { ComissoesProvider, useComissoes } from '@/modules/comissoes/store'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { limparAvisosPersistencia } from './persistencia'

const DIA = '2026-09-25'

const CHAVE_LANCAMENTOS = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_AGENDAMENTOS = 'studio-audax:agendamentos:v1'
const CHAVE_CONFIGS = 'studio-audax:comissoes:configs:v1'
const CHAVE_MOVIMENTACOES = 'studio-audax:estoque:movimentacoes:v1'
const CHAVE_CLUBE = 'studio-audax:clube:v1'

const PRODUTO_TESTE: Produto = {
  id: 'prod-1',
  nome: 'Pomada modeladora',
  preco: 40,
  custo: 20,
  estoque: 10,
  estoqueMinimo: 2,
  categoria: 'Cuidado',
  foto: '',
  ativo: true,
  criadoEm: DIA,
  atualizadoEm: DIA,
}

function TelaCompleta() {
  const caixa = useCaixa()
  const agenda = useAgenda()
  const comissoes = useComissoes()
  const estoque = useEstoque()
  const clube = useClube()
  return (
    <div>
      <output data-testid="caixa">{JSON.stringify(caixa.lancamentos)}</output>
      <output data-testid="agenda">
        {JSON.stringify(agenda.agendamentos)}
      </output>
      <output data-testid="configs">{JSON.stringify(comissoes.configs)}</output>
      <output data-testid="movs">
        {JSON.stringify(estoque.movimentacoes)}
      </output>
      <output data-testid="assinaturas">
        {JSON.stringify(clube.assinaturas)}
      </output>
      <button
        type="button"
        onClick={() =>
          caixa.adicionarDespesa({
            data: DIA,
            descricao: 'Insumos',
            categoria: 'Insumos',
            valor: 30,
            formaPagamento: 'dinheiro',
          })
        }
      >
        nova-despesa
      </button>
      <button
        type="button"
        onClick={() =>
          agenda.adicionar({
            cliente: 'Ana Souza',
            telefone: '',
            servico: 'Corte Degradê',
            profissional: 'Audax',
            data: DIA,
            horario: '10:00',
            observacao: '',
            duracaoMin: 40,
          })
        }
      >
        novo-agendamento
      </button>
      <button
        type="button"
        onClick={() =>
          comissoes.salvarConfig('prof-1', { percentual: 50, ativo: true })
        }
      >
        nova-config
      </button>
      <button
        type="button"
        onClick={() => estoque.registrarInicial(PRODUTO_TESTE, 5)}
      >
        entrada-inicial
      </button>
      <button
        type="button"
        onClick={() =>
          clube.assinar({
            clienteId: 'cli-1',
            cliente: 'Ana Souza',
            plano: 'cabelo',
            valorMensal: 99.9,
            dataAssinatura: DIA,
          })
        }
      >
        assinar
      </button>
    </div>
  )
}

function montarCompleta() {
  return render(
    <>
      <AvisoPersistencia />
      <ProdutosProvider>
        <EstoqueProvider>
          <CaixaProvider>
            <AgendaProvider>
              <ComissoesProvider>
                <ClubeProvider>
                  <TelaCompleta />
                </ClubeProvider>
              </ComissoesProvider>
            </AgendaProvider>
          </CaixaProvider>
        </EstoqueProvider>
      </ProdutosProvider>
    </>,
  )
}

/** Agenda isolada, exatamente como os testes existentes montam. */
function TelaAgenda() {
  const { agendamentos, adicionar } = useAgenda()
  return (
    <div>
      <output data-testid="agenda">{JSON.stringify(agendamentos)}</output>
      <button
        type="button"
        onClick={() =>
          adicionar({
            cliente: 'Bruno',
            telefone: '',
            servico: 'Corte Degradê',
            profissional: 'Audax',
            data: DIA,
            horario: '10:00',
            observacao: '',
            duracaoMin: 40,
          })
        }
      >
        criar
      </button>
    </div>
  )
}

function montarAgenda() {
  return render(
    <>
      <AvisoPersistencia />
      <AgendaProvider>
        <TelaAgenda />
      </AgendaProvider>
    </>,
  )
}

function lista(testid: string): unknown[] {
  return JSON.parse(screen.getByTestId(testid).textContent ?? '[]')
}

function lerJson(chave: string): unknown {
  return JSON.parse(localStorage.getItem(chave) ?? 'null')
}

function semearCorrupcao() {
  localStorage.setItem(CHAVE_LANCAMENTOS, '{quebrado')
  localStorage.setItem(CHAVE_AGENDAMENTOS, '{quebrado')
  localStorage.setItem(CHAVE_CONFIGS, '{quebrado')
  localStorage.setItem(CHAVE_MOVIMENTACOES, '{quebrado')
  localStorage.setItem(CHAVE_CLUBE, '"nao-e-objeto"')
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
})

describe('persistência — stores do escopo com dado corrompido', () => {
  it('carregam o fallback, preservam backup :corrompido e mostram o aviso', async () => {
    semearCorrupcao()
    montarCompleta()
    await act(async () => {})

    // fallback carregado em todos os stores
    expect(lista('caixa')).toEqual([])
    expect(lista('agenda')).toEqual([])
    expect(lista('configs')).toEqual([])
    expect(lista('movs')).toEqual([])
    expect(lista('assinaturas')).toEqual([])

    // cópia original preservada em cada chave de backup
    expect(localStorage.getItem(`${CHAVE_LANCAMENTOS}:corrompido`)).toBe(
      '{quebrado',
    )
    expect(localStorage.getItem(`${CHAVE_AGENDAMENTOS}:corrompido`)).toBe(
      '{quebrado',
    )
    expect(localStorage.getItem(`${CHAVE_CONFIGS}:corrompido`)).toBe(
      '{quebrado',
    )
    expect(localStorage.getItem(`${CHAVE_MOVIMENTACOES}:corrompido`)).toBe(
      '{quebrado',
    )
    expect(localStorage.getItem(`${CHAVE_CLUBE}:corrompido`)).toBe(
      '"nao-e-objeto"',
    )

    // aviso visível, sem bloquear a aplicação
    const alerta = screen.getByRole('alert')
    expect(alerta.textContent).toContain(
      'Foi detectado um dado local corrompido; uma cópia foi preservada.',
    )
    expect(screen.getByText('nova-despesa')).toBeTruthy()
  })

  it('persiste normalmente depois da correção e mantém os dados no F5', async () => {
    semearCorrupcao()
    const primeiro = montarCompleta()
    await act(async () => {})

    fireEvent.click(screen.getByText('nova-despesa'))
    fireEvent.click(screen.getByText('novo-agendamento'))
    fireEvent.click(screen.getByText('nova-config'))
    fireEvent.click(screen.getByText('entrada-inicial'))
    fireEvent.click(screen.getByText('assinar'))

    // dados gravados normalmente nas chaves originais
    expect(lerJson(CHAVE_LANCAMENTOS)).toHaveLength(1)
    expect(lerJson(CHAVE_AGENDAMENTOS)).toHaveLength(1)
    expect(lerJson(CHAVE_CONFIGS)).toHaveLength(1)
    expect(lerJson(CHAVE_MOVIMENTACOES)).toHaveLength(1)
    expect((lerJson(CHAVE_CLUBE) as { assinaturas: unknown[] }).assinaturas)
      .toHaveLength(1)

    // F5: desmonta e monta de novo com o mesmo localStorage
    primeiro.unmount()
    montarCompleta()
    await act(async () => {})

    expect(lista('caixa')).toHaveLength(1)
    expect(lista('agenda')).toHaveLength(1)
    expect(lista('configs')).toHaveLength(1)
    expect(lista('movs')).toHaveLength(1)
    expect(lista('assinaturas')).toHaveLength(1)
    // o backup do dado corrompido continua preservado
    expect(localStorage.getItem(`${CHAVE_LANCAMENTOS}:corrompido`)).toBe(
      '{quebrado',
    )
  })
})

describe('persistência — Agenda isolada (sem CaixaProvider)', () => {
  it('funciona sozinha: fallback, backup, criação e F5', async () => {
    localStorage.setItem(CHAVE_AGENDAMENTOS, '{quebrado')
    const primeiro = montarAgenda()
    await act(async () => {})

    expect(lista('agenda')).toEqual([])
    expect(localStorage.getItem(`${CHAVE_AGENDAMENTOS}:corrompido`)).toBe(
      '{quebrado',
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Foi detectado um dado local corrompido; uma cópia foi preservada.',
    )

    fireEvent.click(screen.getByText('criar'))
    expect(lista('agenda')).toHaveLength(1)
    expect(lerJson(CHAVE_AGENDAMENTOS)).toHaveLength(1)

    primeiro.unmount()
    montarAgenda()
    await act(async () => {})
    expect(lista('agenda')).toHaveLength(1)
  })
})

describe('persistência — falha de gravação', () => {
  it('setItem que falha gera o aviso visível e o store segue em memória', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })

    montarCompleta()
    await act(async () => {})

    expect(screen.getByRole('alert').textContent).toContain(
      'Os dados locais do Studio Audax não puderam ser salvos.',
    )

    fireEvent.click(screen.getByText('nova-despesa'))
    expect(lista('caixa')).toHaveLength(1)

    spy.mockRestore()
  })

  it('com o armazenamento saudável de volta, volta a gravar sem aviso', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    montarCompleta()
    await act(async () => {})
    spy.mockRestore()
    limparAvisosPersistencia()

    fireEvent.click(screen.getByText('nova-despesa'))
    expect(lerJson(CHAVE_LANCAMENTOS)).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
