import { useState } from 'react'
import type { ReactNode } from 'react'

export type PaginaId =
  | 'painel'
  | 'agenda'
  | 'fila'
  | 'pdv'
  | 'caixa'
  | 'comandas'
  | 'clientes'
  | 'crm'
  | 'profissionais'
  | 'servicos'
  | 'comissoes'
  | 'pacotes'
  | 'clube'
  | 'estoque'
  | 'financeiro'
  | 'relatorios'
  | 'ia'
  | 'configuracoes'

type AppLayoutProps = {
  children: ReactNode
  paginaAtual: PaginaId
  onNavegar: (pagina: PaginaId) => void
}

type Secao = {
  titulo: string
  itens: { id: PaginaId; rotulo: string }[]
}

const SECOES: Secao[] = [
  {
    titulo: 'Operação',
    itens: [
      { id: 'painel', rotulo: 'Painel' },
      { id: 'agenda', rotulo: 'Agenda' },
      { id: 'fila', rotulo: 'Fila de espera' },
      { id: 'pdv', rotulo: 'PDV' },
      { id: 'caixa', rotulo: 'Caixa' },
      { id: 'comandas', rotulo: 'Comandas' },
      { id: 'clientes', rotulo: 'Clientes' },
      { id: 'crm', rotulo: 'CRM' },
    ],
  },
  {
    titulo: 'Negócio',
    itens: [
      { id: 'profissionais', rotulo: 'Profissionais' },
      { id: 'comissoes', rotulo: 'Comissões' },
      { id: 'servicos', rotulo: 'Serviços' },
      { id: 'pacotes', rotulo: 'Pacotes' },
      { id: 'clube', rotulo: 'Clube de assinaturas' },
      { id: 'estoque', rotulo: 'Produtos / Estoque' },
      { id: 'financeiro', rotulo: 'Financeiro' },
      { id: 'relatorios', rotulo: 'Relatórios' },
      { id: 'ia', rotulo: 'Central de IA' },
      { id: 'configuracoes', rotulo: 'Configurações' },
    ],
  },
]

function BotaoMenu({
  id,
  rotulo,
  ativo,
  onNavegar,
}: {
  id: PaginaId
  rotulo: string
  ativo: boolean
  onNavegar: (pagina: PaginaId) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onNavegar(id)}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        ativo
          ? 'bg-[#E9DDC0] font-medium text-[#1C1A15]'
          : 'text-[#4A4436] hover:bg-[#F3ECDA] hover:text-[#1C1A15]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          ativo ? 'bg-[#8A6A14]' : 'bg-[#C9B98F]'
        }`}
      />
      {rotulo}
    </button>
  )
}

export default function AppLayout({
  children,
  paginaAtual,
  onNavegar,
}: AppLayoutProps) {
  const [menuAberto, setMenuAberto] = useState(false)

  const navegar = (pagina: PaginaId) => {
    setMenuAberto(false)
    onNavegar(pagina)
  }

  return (
    <div className="flex min-h-screen bg-[#F3ECDA] text-[#1C1A15]">
      {/* Barra superior — apenas mobile */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-[#E9DDC0] bg-[#FAF6EB] px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuAberto((a) => !a)}
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          className="rounded-lg border border-[#E5DCC3] bg-white p-2 text-[#1C1A15] hover:bg-[#F3ECDA]"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <p className="text-[18px] leading-none font-bold tracking-tight">
          Studio <span className="text-[#8A6A14]">Audax</span>
        </p>
      </header>

      {/* Fundo escuro do menu — apenas mobile */}
      {menuAberto && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMenuAberto(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — drawer no mobile, lateral fixa no desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[230px] flex-col border-r border-[#E9DDC0] bg-[#FAF6EB] transition-transform duration-200 lg:static lg:w-[260px] lg:translate-x-0 lg:transition-none ${
          menuAberto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-[#E9DDC0] px-5 py-5">
          <p className="text-[22px] leading-none font-bold tracking-tight">
            Studio <span className="text-[#8A6A14]">Audax</span>
          </p>
          <p className="mt-1.5 text-[11px] font-semibold tracking-[0.22em] text-[#8A8171] uppercase">
            Studio Audax
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {SECOES.map((secao) => (
            <div key={secao.titulo} className="mb-5">
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.2em] text-[#8A8171] uppercase">
                {secao.titulo}
              </p>
              <div className="flex flex-col gap-0.5">
                {secao.itens.map((item) => (
                  <BotaoMenu
                    key={item.id}
                    id={item.id}
                    rotulo={item.rotulo}
                    ativo={paginaAtual === item.id}
                    onNavegar={navegar}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[#E9DDC0] px-5 py-3">
          <p className="text-[11px] text-[#A99E85]">
            Dados salvos automaticamente
          </p>
        </div>
      </aside>

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-[53px] lg:hidden" aria-hidden="true" />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
