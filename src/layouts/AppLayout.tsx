import { useState } from 'react'
import type { ReactNode } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import { MarcaAudax } from '@/components/MarcaAudax'
import { useAuth } from '@/modules/auth/useAuth'
import { usePodeAcessarPagina } from '@/modules/auth/useAuthPermissao'

export type PaginaId =
  | 'painel'
  | 'agenda'
  | 'fila'
  | 'pdv'
  | 'caixa'
  | 'comandas'
  | 'clientes'
  | 'crm'
  | 'whatsapp'
  | 'profissionais'
  | 'servicos'
  | 'comissoes'
  | 'pacotes'
  | 'clube'
  | 'pote'
  | 'estoque'
  | 'financeiro'
  | 'relatorios'
  | 'ia'
  | 'configuracoes'
  | 'usuarios'

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
      { id: 'whatsapp', rotulo: 'WhatsApp' },
    ],
  },
  {
    titulo: 'Negócio',
    itens: [
      { id: 'profissionais', rotulo: 'Profissionais' },
      { id: 'usuarios', rotulo: 'Usuários e permissões' },
      { id: 'comissoes', rotulo: 'Comissões' },
      { id: 'servicos', rotulo: 'Serviços' },
      { id: 'pacotes', rotulo: 'Pacotes' },
      { id: 'clube', rotulo: 'Clube de assinaturas' },
    { id: 'pote', rotulo: 'Audax Club · Pote' },
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
          ? 'bg-[#C9A24A] font-medium text-[#121110]'
          : 'text-[#C9BFA4] hover:bg-[#1A1815] hover:text-[#F7F3EA]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          ativo ? 'bg-[#121110]' : 'bg-[#5A5346]'
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
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)
  const { sair, saindo, erroSaida } = useAuth()
  // Menu e navegação usam a permissão EFETIVA (papel + exceção individual):
  // o item some da barra e a rota é recusada pela mesma regra.
  const podeAcessar = usePodeAcessarPagina()

  // Filtrar seções e itens baseado nas permissões efetivas
  const secoesVisiveis = SECOES.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => podeAcessar(item.id)),
  })).filter((secao) => secao.itens.length > 0)

  // Se a página atual não é acessível, redirecionar para a primeira disponível
  const paginaValida = secoesVisiveis.some((s) => s.itens.some((i) => i.id === paginaAtual))
  if (!paginaValida && secoesVisiveis.length > 0) {
    const primeiraPagina = secoesVisiveis[0].itens[0].id
    onNavegar(primeiraPagina)
    // Retornar null para evitar renderizar a página incorreta durante o redirecionamento
    return null
  }

  const navegar = (pagina: PaginaId) => {
    if (!podeAcessar(pagina)) return
    setMenuAberto(false)
    onNavegar(pagina)
  }

  return (
    <div className="flex min-h-screen bg-[#F3ECDA] text-[#121110]">
      {/* Barra superior — apenas mobile */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-[#2E2A21] bg-[#0C0B0A] px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuAberto((a) => !a)}
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          className="rounded-lg border border-[#3A352C] bg-[#15140F] p-2 text-[#F7F3EA] hover:bg-[#1F1D18]"
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
        <MarcaAudax className="h-6 w-6 shrink-0 text-[#F7F3EA]" />
        <p className="text-[18px] leading-none font-bold tracking-tight text-[#F7F3EA]">
          Studio <span className="text-[#C9A24A]">Audax</span>
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[230px] flex-col border-r border-[#2E2A21] bg-[#0C0B0A] transition-transform duration-200 lg:static lg:w-[260px] lg:translate-x-0 lg:transition-none ${
          menuAberto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-[#2E2A21] px-5 py-5">
          <MarcaAudax className="h-9 w-9 shrink-0 text-[#F7F3EA]" />
          <div className="min-w-0">
            <p className="text-[21px] leading-none font-bold tracking-tight text-[#F7F3EA]">
              Studio <span className="text-[#C9A24A]">Audax</span>
            </p>
            <p className="mt-1.5 text-[10px] font-semibold tracking-[0.28em] text-[#C9A24A] uppercase">
              Desde 2024
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {secoesVisiveis.map((secao) => (
            <div key={secao.titulo} className="mb-5">
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.2em] text-[#8E887C] uppercase">
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

        <div className="border-t border-[#2E2A21] px-5 py-3">
          <p className="text-[11px] text-[#8E887C]">
            Dados salvos automaticamente
          </p>
          {erroSaida && (
            <p
              role="alert"
              className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800"
            >
              {erroSaida}
            </p>
          )}
          <button
            type="button"
            onClick={() => setConfirmandoSaida(true)}
            disabled={saindo}
            className="mt-2.5 w-full rounded-lg border border-[#3A352C] bg-[#15140F] px-3 py-2 text-[12px] font-semibold text-[#E7E0CB] hover:bg-[#1F1D18] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saindo ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      </aside>

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-[53px] lg:hidden" aria-hidden="true" />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      {confirmandoSaida && (
        <ConfirmarModal
          titulo="Sair do Studio Audax"
          texto="A sessão será encerrada e a tela de login volta a aparecer."
          rotuloConfirmar="Sair da conta"
          perigo
          onConfirmar={() => {
            setConfirmandoSaida(false)
            setMenuAberto(false)
            // `sair` só marca deslogado quando o provedor encerra a sessão;
            // se recusar, o estado continua autenticado e o erro aparece na
            // sidebar.
            void sair()
          }}
          onFechar={() => setConfirmandoSaida(false)}
        />
      )}
    </div>
  )
}
