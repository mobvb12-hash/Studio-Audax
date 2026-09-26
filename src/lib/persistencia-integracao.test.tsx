import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvisoPersistencia from '@/components/AvisoPersistencia'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClubeProvider, useClube } from '@/modules/clube/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ComissoesProvider, useComissoes } from '@/modules/comissoes/store'
import { CrmProvider, useCrm } from '@/modules/crm/store'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import { IaProvider, useIa } from '@/modules/ia/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { ProfissionaisProvider, useProfissionais } from '@/modules/profissionais/store'
import { ServicosProvider, useServicos } from '@/modules/servicos/store'
import { WhatsProvider, useWhats } from '@/modules/whatsapp/store'
import { limparAvisosPersistencia } from './persistencia'

const DIA = '2026-09-25'

const CHAVE_LANCAMENTOS = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_AGENDAMENTOS = 'studio-audax:agendamentos:v1'
const CHAVE_CONFIGS = 'studio-audax:comissoes:configs:v1'
const CHAVE_MOVIMENTACOES = 'studio-audax:estoque:movimentacoes:v1'
const CHAVE_CLUBE = 'studio-audax:clube:v1'
const CHAVE_PRODUTOS = 'studio-audax:produtos:v1'

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
  const produtos = useProdutos()
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
      <output data-testid="produtos">{JSON.stringify(produtos.produtos)}</output>
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
      <button
        type="button"
        onClick={() =>
          produtos.adicionar({
            nome: 'Pomada modeladora',
            preco: 40,
            custo: 20,
            estoque: 10,
            estoqueMinimo: 2,
          })
        }
      >
        novo-produto
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
  localStorage.setItem(CHAVE_PRODUTOS, '{quebrado')
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
    expect(lista('produtos')).toEqual([])

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
    expect(localStorage.getItem(`${CHAVE_PRODUTOS}:corrompido`)).toBe(
      '{quebrado',
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
    fireEvent.click(screen.getByText('novo-produto'))

    // dados gravados normalmente nas chaves originais
    expect(lerJson(CHAVE_LANCAMENTOS)).toHaveLength(1)
    expect(lerJson(CHAVE_AGENDAMENTOS)).toHaveLength(1)
    expect(lerJson(CHAVE_CONFIGS)).toHaveLength(1)
    expect(lerJson(CHAVE_MOVIMENTACOES)).toHaveLength(1)
    expect((lerJson(CHAVE_CLUBE) as { assinaturas: unknown[] }).assinaturas)
      .toHaveLength(1)
    expect(lerJson(CHAVE_PRODUTOS)).toHaveLength(1)

    // F5: desmonta e monta de novo com o mesmo localStorage
    primeiro.unmount()
    montarCompleta()
    await act(async () => {})

    expect(lista('caixa')).toHaveLength(1)
    expect(lista('agenda')).toHaveLength(1)
    expect(lista('configs')).toHaveLength(1)
    expect(lista('movs')).toHaveLength(1)
    expect(lista('assinaturas')).toHaveLength(1)
    expect(lista('produtos')).toHaveLength(1)
    // o backup do dado corrompido continua preservado
    expect(localStorage.getItem(`${CHAVE_LANCAMENTOS}:corrompido`)).toBe(
      '{quebrado',
    )
    expect(localStorage.getItem(`${CHAVE_PRODUTOS}:corrompido`)).toBe(
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
    fireEvent.click(screen.getByText('novo-produto'))
    expect(lista('produtos')).toHaveLength(1)

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

/* ------------------------------------------------------------------ */
/* Auditoria F13 — stores convertados para carregarJSON com validação  */
/* ------------------------------------------------------------------ */

const CHAVE_WHATS = 'studio-audax:whatsapp:v1'
const CHAVE_CLIENTES = 'studio-audax:clientes:v1'
const CHAVE_CRM = 'studio-audax:crm:v1'
const CHAVE_SERVICOS = 'studio-audax:servicos:v1'
const CHAVE_PROFISSIONAIS = 'studio-audax:profissionais:v1'
const CHAVE_IA = 'studio-audax:ia:v1'

function TelaConvertidos() {
  const whats = useWhats()
  const clientes = useClientes()
  const crm = useCrm()
  const servicos = useServicos()
  const profissionais = useProfissionais()
  const ia = useIa()
  return (
    <div>
      <output data-testid="whats">{JSON.stringify(whats.mensagens)}</output>
      <output data-testid="clientes">{JSON.stringify(clientes.clientes)}</output>
      <output data-testid="crm">{JSON.stringify(crm.interacoes)}</output>
      <output data-testid="servicos">{JSON.stringify(servicos.servicos)}</output>
      <output data-testid="profissionais">
        {JSON.stringify(profissionais.profissionais)}
      </output>
      <output data-testid="ia">{JSON.stringify(ia.aceitas)}</output>
      <button type="button" onClick={() => ia.marcarAceita('sug-1')}>
        marcar
      </button>
    </div>
  )
}

function montarConvertidos() {
  return render(
    <>
      <AvisoPersistencia />
      <WhatsProvider>
        <ClientesProvider>
          <CrmProvider>
            <ServicosProvider>
              <ProfissionaisProvider>
                <IaProvider>
                  <TelaConvertidos />
                </IaProvider>
              </ProfissionaisProvider>
            </ServicosProvider>
          </CrmProvider>
        </ClientesProvider>
      </WhatsProvider>
    </>,
  )
}

describe('persistência — stores convertidos na auditoria (F13)', () => {
  it('corrupção em whatsapp/clientes/crm/servicos/profissionais/ia: fallback + backup + aviso', async () => {
    const corrompidas = [
      CHAVE_WHATS,
      CHAVE_CLIENTES,
      CHAVE_CRM,
      CHAVE_SERVICOS,
      CHAVE_PROFISSIONAIS,
    ]
    for (const chave of corrompidas) {
      localStorage.setItem(chave, '{quebrado')
    }
    localStorage.setItem(CHAVE_IA, '"nao-e-objeto"')

    const primeiro = montarConvertidos()
    await act(async () => {})

    // fallbacks: listas vazias; profissionais/servicos caem no SEED
    expect(lista('whats')).toEqual([])
    expect(lista('clientes')).toEqual([])
    expect(lista('crm')).toEqual([])
    expect(lista('ia')).toEqual([])
    expect(lista('servicos').length).toBeGreaterThan(0)
    expect(lista('profissionais').length).toBeGreaterThan(0)

    // cópia original preservada em cada chave de backup
    for (const chave of corrompidas) {
      expect(localStorage.getItem(`${chave}:corrompido`)).toBe('{quebrado')
    }
    expect(localStorage.getItem(`${CHAVE_IA}:corrompido`)).toBe(
      '"nao-e-objeto"',
    )

    // aviso visível, sem bloquear a aplicação
    expect(screen.getByRole('alert').textContent).toContain(
      'Foi detectado um dado local corrompido; uma cópia foi preservada.',
    )

    // gravação normal mesmo após o fallback
    fireEvent.click(screen.getByText('marcar'))
    expect(lerJson(CHAVE_IA)).toEqual({
      aceitas: ['sug-1'],
      descartadas: [],
    })

    // F5: remonta com o mesmo localStorage
    primeiro.unmount()
    montarConvertidos()
    await act(async () => {})
    expect(lista('ia')).toEqual(['sug-1'])
    expect(localStorage.getItem(`${CHAVE_WHATS}:corrompido`)).toBe('{quebrado')
    expect(localStorage.getItem(`${CHAVE_PROFISSIONAIS}:corrompido`)).toBe(
      '{quebrado',
    )
  })

  it('listas válidas carregam sem gerar backup de corrupção', async () => {
    localStorage.setItem(
      CHAVE_WHATS,
      JSON.stringify([
        {
          id: 'm-1',
          clienteId: 'c-1',
          cliente: 'Ana Souza',
          template: 'confirmacao',
          texto: 'Oi',
          status: 'pendente',
          origem: 'crm',
          criadoEm: `${DIA}T10:00:00.000Z`,
        },
      ]),
    )
    localStorage.setItem(
      CHAVE_CLIENTES,
      JSON.stringify([
        {
          id: 'c-1',
          nome: 'Ana Souza',
          telefone: '(11) 99999-0000',
          email: '',
          observacao: '',
          ativo: true,
        },
      ]),
    )

    montarConvertidos()
    await act(async () => {})

    expect(lista('whats')).toHaveLength(1)
    expect(lista('clientes')).toHaveLength(1)
    expect(localStorage.getItem(`${CHAVE_WHATS}:corrompido`)).toBeNull()
    expect(localStorage.getItem(`${CHAVE_CLIENTES}:corrompido`)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
