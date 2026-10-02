// Fix 5 (Upgrade Geral) — permissões de UI na Caixa e em excluir cliente.
//
// O mapa único (permissoes.ts) é a mesma regra do RLS:
//   caixa:fechar/lancar_despesa → recepção ou acima;
//   caixa:estornar/caixa:reabrir → dono/admin/gerente;
//   clientes:excluir            → dono/admin (RLS: admin only).
// Sem AuthProvider (testes legados/render isolado) os botões seguem como
// antes — em produção a página só existe dentro do AuthProvider.
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { hojeISO } from '@/modules/agenda/catalogo'
import { CaixaProvider } from '@/modules/caixa/store'
import type { Fechamento, Lancamento } from '@/modules/caixa/types'
import { ClientesProvider } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'
import { preferenciasPadrao } from '@/modules/clientes/types'
import { ClubeProvider } from '@/modules/clube/store'
import { CrmProvider } from '@/modules/crm/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { WhatsProvider } from '@/modules/whatsapp/store'
import { ContextoAuth } from '@/modules/auth/contexto'
import type { ContextoAuth as ContextoValor } from '@/modules/auth/contexto'
import type { PapelPerfil, PerfilInfo } from '@/modules/auth/tipos'
import Caixa from './Caixa'
import Clientes from './Clientes'

const DIA = hojeISO()
const CHAVE_LANC = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_FECH = 'studio-audax:caixa:fechamentos:v1'
const CHAVE_CLI = 'studio-audax:clientes:v1'

const LANCAMENTO: Lancamento = {
  id: 'l-1',
  tipo: 'receita',
  origem: 'atendimento',
  data: DIA,
  hora: '10:00',
  descricao: 'Corte Degradê — Ana Souza',
  valor: 70,
  desconto: 0,
  valorLiquido: 70,
  formaPagamento: 'dinheiro',
  cliente: 'Ana Souza',
  profissional: 'Cleiton Silva',
  criadoEm: `${DIA}T10:05:00.000Z`,
}

const FECHAMENTO: Fechamento = {
  id: 'f-1',
  data: DIA,
  fechadoEm: `${DIA}T19:00:00.000Z`,
  resumo: {
    receitasAtendimentos: 70,
    receitasProdutos: 0,
    receitasClube: 0,
    totalRecebido: 70,
    descontos: 0,
    despesas: 0,
    liquido: 70,
    porForma: {
      dinheiro: 70,
      pix: 0,
      pix_integrado: 0,
      cartao_credito: 0,
      cartao_debito: 0,
      transferencia: 0,
      pre_pago: 0,
      outro: 0,
    },
    porProfissional: [],
    qtdAtendimentos: 1,
    qtdProdutos: 0,
  },
}

const CLIENTE: Cliente = {
  id: 'cli-1',
  nome: 'Ana Souza',
  telefone: '11 99999-0000',
  email: '',
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
  preferencias: preferenciasPadrao(),
  criadoEm: DIA,
  atualizadoEm: DIA,
}

function valorAuth(papel: PapelPerfil): ContextoValor {
  const perfil: PerfilInfo = {
    id: 'perf-1',
    userId: 'user-1',
    nome: 'Teste',
    email: 'teste@studio.dev',
    papel,
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
  }
  return {
    estado: { status: 'autenticado', email: perfil.email, perfil },
    erroEntrada: '',
    entrando: false,
    entrar: async () => true,
    sair: async () => true,
    saindo: false,
    erroSaida: '',
    perfil,
  }
}

function env(children: ReactNode, papel?: PapelPerfil) {
  const arvore = (
    <ProdutosProvider>
      <EstoqueProvider>
        <CaixaProvider>
          <ClientesProvider>
            <AgendaProvider>
              <CrmProvider>
                <ClubeProvider>
                  <WhatsProvider>{children}</WhatsProvider>
                </ClubeProvider>
              </CrmProvider>
            </AgendaProvider>
          </ClientesProvider>
        </CaixaProvider>
      </EstoqueProvider>
    </ProdutosProvider>
  )
  if (!papel) return render(arvore)
  return render(
    <ContextoAuth.Provider value={valorAuth(papel)}>
      {arvore}
    </ContextoAuth.Provider>,
  )
}

function semearLancamento() {
  localStorage.setItem(CHAVE_LANC, JSON.stringify([LANCAMENTO]))
}

function semearFechado() {
  semearLancamento()
  localStorage.setItem(CHAVE_FECH, JSON.stringify([FECHAMENTO]))
}

beforeEach(() => {
  localStorage.clear()
})

describe('Caixa — permissões dos botões', () => {
  it('sem sessão de auth mantém os botões (comportamento legado)', () => {
    semearLancamento()
    env(<Caixa />)
    expect(screen.getByRole('button', { name: 'Fechar caixa' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Despesa' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Estornar' })).toBeTruthy()
  })

  it('recepção vê fechar/despesa, mas não estorna', () => {
    semearLancamento()
    env(<Caixa />, 'recepcao')
    expect(screen.getByRole('button', { name: 'Fechar caixa' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Despesa' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Estornar' })).toBeNull()
  })

  it('admin estorna normalmente', () => {
    semearLancamento()
    env(<Caixa />, 'admin')
    expect(screen.getByRole('button', { name: 'Estornar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fechar caixa' })).toBeTruthy()
  })

  it('dia fechado: recepção não vê reabrir, admin vê', () => {
    semearFechado()
    env(<Caixa />, 'recepcao')
    expect(screen.queryByRole('button', { name: 'Reabrir caixa' })).toBeNull()
  })

  it('dia fechado: admin vê reabrir', () => {
    semearFechado()
    env(<Caixa />, 'admin')
    expect(screen.getByRole('button', { name: 'Reabrir caixa' })).toBeTruthy()
  })
})

describe('Clientes — excluir alinhado ao RLS admin-only', () => {
  function semearClientes() {
    localStorage.setItem(CHAVE_CLI, JSON.stringify([CLIENTE]))
  }

  it('recepção não vê o botão de excluir', () => {
    semearClientes()
    env(<Clientes />, 'recepcao')
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.queryByLabelText('Excluir Ana Souza')).toBeNull()
  })

  it('admin vê o botão de excluir', () => {
    semearClientes()
    env(<Clientes />, 'admin')
    expect(screen.getByLabelText('Excluir Ana Souza')).toBeTruthy()
  })

  it('sem sessão de auth o botão segue visível (legado)', () => {
    semearClientes()
    env(<Clientes />)
    expect(screen.getByLabelText('Excluir Ana Souza')).toBeTruthy()
  })
})
