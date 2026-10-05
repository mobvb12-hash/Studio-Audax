// Homologação da regra de sincronização (FASE E).
//
// Cenário real do proprietário: o navegador tem o localStorage com os dados
// históricos/testes que foram apagados do Supabase e o servidor está vazio
// naquela parte. Ao abrir o painel, NENHUMA integração pode reenviar esse
// conteúdo antigo — o registro que o servidor não tem é resquício, não
// pendência.
//
// O teste monta os módulos reais (providers) contra um Supabase vazio em
// memória e afirma que nenhuma função de importação é chamada, que as listas
// passam a refletir o servidor (fonte oficial) e que o conteúdo antigo fica
// preservado em snapshot.
import { render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ComissoesProvider, useComissoes } from '@/modules/comissoes/store'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'

const CHAVES = {
  clientes: 'studio-audax:clientes:v1',
  produtos: 'studio-audax:produtos:v1',
  estoque: 'studio-audax:estoque:movimentacoes:v1',
  lancamentos: 'studio-audax:caixa:lancamentos:v1',
  fechamentos: 'studio-audax:caixa:fechamentos:v1',
  auditoriaCaixa: 'studio-audax:caixa:auditoria:v1',
  comissoesConfigs: 'studio-audax:comissoes:configs:v1',
  comissoesFechamentos: 'studio-audax:comissoes:fechamentos:v1',
  comissoesAuditoria: 'studio-audax:comissoes:auditoria:v1',
  agendamentos: 'studio-audax:agendamentos:v1',
  bloqueios: 'studio-audax:bloqueios:v1',
} as const

/** Tudo que o painel tentou reenviar — precisa continuar vazio. */
const remoto = vi.hoisted(() => ({ imports: [] as string[] }))

vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

/** Registra e bloqueia qualquer tentativa de reenvio. */
function reenvio(nome: string) {
  return vi.fn(async (lista: unknown[]) => {
    remoto.imports.push(`${nome}:${Array.isArray(lista) ? lista.length : 1}`)
    return Array.isArray(lista) ? lista.length : 1
  })
}

vi.mock('@/services/supabase/clientes', () => ({
  listarClientes: vi.fn(async () => []),
  buscarClientes: vi.fn(async () => []),
  criarCliente: vi.fn(async (c: unknown) => c),
  atualizarCliente: vi.fn(async (c: unknown) => c),
  alternarAtivoCliente: vi.fn(async (c: unknown) => c),
  removerCliente: vi.fn(async () => true),
  importarClientes: reenvio('importarClientes'),
}))
vi.mock('@/services/supabase/produtos', () => ({
  listarProdutos: vi.fn(async () => []),
  criarProduto: vi.fn(async (p: unknown) => p),
  atualizarProduto: vi.fn(async () => null),
  importarProdutos: reenvio('importarProdutos'),
}))
vi.mock('@/services/supabase/estoque', () => ({
  listarMovimentacoes: vi.fn(async () => []),
  gravarMovimentacao: vi.fn(async (m: unknown) => m),
  importarMovimentacoes: reenvio('importarMovimentacoes'),
}))
vi.mock('@/services/supabase/caixa', () => ({
  listarLancamentos: vi.fn(async () => []),
  listarFechamentos: vi.fn(async () => []),
  listarAuditoria: vi.fn(async () => []),
  criarLancamento: vi.fn(async (l: unknown) => l),
  atualizarLancamento: vi.fn(async (l: unknown) => l),
  removerLancamento: vi.fn(async () => true),
  criarFechamento: vi.fn(async (f: unknown) => f),
  atualizarFechamento: vi.fn(async (f: unknown) => f),
  criarEventoAuditoria: vi.fn(async (e: unknown) => e),
  importarLancamentos: reenvio('importarLancamentos'),
  importarFechamentos: reenvio('importarFechamentosCaixa'),
  importarAuditoria: reenvio('importarAuditoriaCaixa'),
}))
vi.mock('@/services/supabase/comissoes', () => ({
  listarConfigs: vi.fn(async () => []),
  listarFechamentos: vi.fn(async () => []),
  listarAuditoria: vi.fn(async () => []),
  gravarConfig: vi.fn(async (c: unknown) => c),
  gravarFechamento: vi.fn(async (f: unknown) => f),
  gravarEvento: vi.fn(async (e: unknown) => e),
  importarConfigs: reenvio('importarConfigs'),
  importarFechamentos: reenvio('importarFechamentosComissao'),
  importarAuditoria: reenvio('importarAuditoriaComissao'),
}))
vi.mock('@/services/supabase/agenda', () => ({
  listarAgendamentos: vi.fn(async () => []),
  listarBloqueios: vi.fn(async () => []),
  lerExpediente: vi.fn(async () => null),
  gravarAgendamento: vi.fn(async (a: unknown) => a),
  gravarBloqueio: vi.fn(async (b: unknown) => b),
  gravarExpediente: vi.fn(async () => true),
  removerAgendamento: vi.fn(async () => true),
  removerBloqueio: vi.fn(async () => true),
  importarAgendamentos: reenvio('importarAgendamentos'),
  importarBloqueios: reenvio('importarBloqueios'),
}))

let vistaClientes: ReturnType<typeof useClientes>
let vistaProdutos: ReturnType<typeof useProdutos>
let vistaEstoque: ReturnType<typeof useEstoque>
let vistaCaixa: ReturnType<typeof useCaixa>
let vistaComissoes: ReturnType<typeof useComissoes>
let vistaAgenda: ReturnType<typeof useAgenda>

function Captura() {
  const clientes = useClientes()
  const produtos = useProdutos()
  const estoque = useEstoque()
  const caixa = useCaixa()
  const comissoes = useComissoes()
  const agenda = useAgenda()
  useEffect(() => {
    vistaClientes = clientes
    vistaProdutos = produtos
    vistaEstoque = estoque
    vistaCaixa = caixa
    vistaComissoes = comissoes
    vistaAgenda = agenda
  })
  return null
}

function montar() {
  return render(
    <ClientesProvider>
      <ProdutosProvider>
        <EstoqueProvider>
          <CaixaProvider>
            <ComissoesProvider>
              <AgendaProvider>
                <Captura />
              </AgendaProvider>
            </ComissoesProvider>
          </CaixaProvider>
        </EstoqueProvider>
      </ProdutosProvider>
    </ClientesProvider>,
  )
}

/** LocalStorage como estava no navegador do dono: dados antigos/testes. */
const ANTIGO = '2019-01-01T00:00:00.000Z'

function semearLocalStorageHistorico(): void {
  localStorage.setItem(
    CHAVES.clientes,
    JSON.stringify([
      {
        id: 'cli-antigo',
        nome: 'Cliente de Teste Apagado',
        telefone: '(11) 90000-0000',
        email: 'antigo@email.com',
        observacao: '',
        ativo: true,
        genero: 'nao_informado',
        cpf: '',
        cnpj: '',
        nascimento: '',
        etiquetas: [],
        instagram: '',
        comoNosConheceu: '',
        telefones: [],
        endereco: null,
        preferencias: {
          emailAgendamentos: true,
          smsLembrete: true,
          smsMarketing: true,
          emailMarketing: true,
        },
        criadoEm: ANTIGO,
        atualizadoEm: ANTIGO,
      },
    ]),
  )
  localStorage.setItem(
    CHAVES.produtos,
    JSON.stringify([
      {
        id: 'pro-antigo',
        nome: 'Produto de Teste',
        preco: 10,
        custo: 5,
        estoque: 3,
        estoqueMinimo: 1,
        categoria: 'Testes',
        foto: '',
        ativo: true,
        criadoEm: ANTIGO,
        atualizadoEm: ANTIGO,
      },
    ]),
  )
  localStorage.setItem(
    CHAVES.estoque,
    JSON.stringify([
      {
        id: 'mov-antiga',
        produtoId: 'pro-antigo',
        produto: 'Produto de Teste',
        tipo: 'entrada',
        quantidade: 3,
        estoqueAntes: 0,
        estoqueDepois: 3,
        custoUnitario: 5,
        data: '2019-01-01',
        hora: '10:00',
        origem: 'manual',
        criadoEm: ANTIGO,
      },
    ]),
  )
  localStorage.setItem(
    CHAVES.lancamentos,
    JSON.stringify([
      {
        id: 'lan-antiga',
        tipo: 'receita',
        origem: 'atendimento',
        data: '2019-01-01',
        hora: '10:00',
        descricao: 'Receita de teste',
        valor: 100,
        desconto: 0,
        valorLiquido: 100,
        formaPagamento: 'pix',
        criadoEm: ANTIGO,
      },
    ]),
  )
  localStorage.setItem(CHAVES.fechamentos, JSON.stringify([]))
  localStorage.setItem(CHAVES.auditoriaCaixa, JSON.stringify([]))
  localStorage.setItem(CHAVES.comissoesConfigs, JSON.stringify([]))
  localStorage.setItem(CHAVES.comissoesFechamentos, JSON.stringify([]))
  localStorage.setItem(CHAVES.comissoesAuditoria, JSON.stringify([]))
  localStorage.setItem(
    CHAVES.agendamentos,
    JSON.stringify([
      {
        id: 'ag-antigo',
        profissional: 'Cleiton',
        cliente: 'Cliente de Teste',
        servico: 'Corte',
        data: '2019-01-01',
        hora: '10:00',
        duracaoMin: 30,
        status: 'pendente',
        valor: 50,
        criadoEm: ANTIGO,
        atualizadoEm: ANTIGO,
      },
    ]),
  )
  localStorage.setItem(CHAVES.bloqueios, JSON.stringify([]))
}

function snapshots(): string[] {
  return Object.keys(localStorage).filter((chave) => chave.includes(':backup:'))
}

beforeEach(() => {
  localStorage.clear()
  remoto.imports = []
  vi.clearAllMocks()
})

describe('Homologação — localStorage histórico não volta para o Supabase', () => {
  it('nenhum módulo reenvia o conteúdo antigo que o servidor não tem', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    semearLocalStorageHistorico()

    montar()

    // a integração termina: o servidor (vazio) é a lista oficial
    await waitFor(() => {
      expect(vistaClientes.clientes).toEqual([])
      expect(vistaProdutos.produtos).toEqual([])
      expect(vistaEstoque.movimentacoes).toEqual([])
      expect(vistaCaixa.lancamentos).toEqual([])
      expect(vistaCaixa.fechamentos).toEqual([])
      expect(vistaComissoes.fechamentos).toEqual([])
      expect(vistaAgenda.agendamentos).toEqual([])
      expect(vistaAgenda.bloqueios).toEqual([])
    })

    // NENHUM envio para o Supabase
    expect(remoto.imports).toEqual([])

    // o que estava no navegador segue preservado em snapshot
    expect(snapshots().length).toBeGreaterThanOrEqual(4)

    // e a marca de sincronização passa a existir (carga concluída)
    expect(
      localStorage.getItem(`${CHAVES.clientes}:sincronizado_em:v1`),
    ).not.toBeNull()
    aviso.mockRestore()
  })

  it('segunda abertura continua sem reenviar nada (marca já estabelecida)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    semearLocalStorageHistorico()

    const primeira = montar()
    await waitFor(() => expect(vistaClientes.clientes).toEqual([]))
    primeira.unmount()
    remoto.imports = []

    montar()
    await waitFor(() => expect(vistaProdutos.produtos).toEqual([]))

    expect(remoto.imports).toEqual([])
    aviso.mockRestore()
  })
})