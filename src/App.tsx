import { useEffect, useState, Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import AvisoPersistencia from '@/components/AvisoPersistencia'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import SemPermissao from '@/components/SemPermissao'
import TelaLogin from '@/components/TelaLogin'
import AppLayout, { type PaginaId } from '@/layouts/AppLayout'
import { AuthProvider } from '@/modules/auth/AuthProvider'
import { useAuth } from '@/modules/auth/useAuth'
import { usePodeAcessarPagina } from '@/modules/auth/useAuthPermissao'
import { PermissoesIndividuaisProvider } from '@/modules/auth/permissoesIndividuais'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { AutomacoesProvider } from '@/modules/automacoes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { CrmProvider } from '@/modules/crm/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { EsperaProvider } from '@/modules/espera/store'
import { IaProvider } from '@/modules/ia/store'
import { MarketingProvider } from '@/modules/marketing/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ServicosProvider } from '@/modules/servicos/store'
import { WhatsProvider } from '@/modules/whatsapp/store'
import type { SlotAgendamento } from '@/pages/Agenda'
import AgendarPublico from '@/pages/AgendarPublico'
import ErrorBoundary from '@/components/ErrorBoundary'
import { PainelAuthProvider } from '@/modules/painel/PainelAuthProvider'
import { areaPelaUrl, type AreaPública } from '@/modules/painel/regras'
import PainelRaiz from '@/modules/painel/telas/PainelRaiz'

// Code splitting - lazy load pages
const DashboardLazy = lazy(() => import('@/pages/Dashboard'))
const AgendaLazy = lazy(() => import('@/pages/Agenda'))
const EsperaLazy = lazy(() => import('@/pages/Espera'))
const CaixaLazy = lazy(() => import('@/pages/Caixa'))
const ClientesLazy = lazy(() => import('@/pages/Clientes'))
const CrmLazy = lazy(() => import('@/pages/Crm'))
const WhatsLazy = lazy(() => import('@/pages/Whats'))
const ServicosLazy = lazy(() => import('@/pages/Servicos'))
const ProfissionaisLazy = lazy(() => import('@/pages/Profissionais'))
const ComissoesLazy = lazy(() => import('@/pages/Comissoes'))
const FinanceiroLazy = lazy(() => import('@/pages/Financeiro'))
const RelatoriosLazy = lazy(() => import('@/pages/Relatorios'))
const PDVLazy = lazy(() => import('@/pages/PDV'))
const ProdutosLazy = lazy(() => import('@/pages/Produtos'))
const ClubeLazy = lazy(() => import('@/pages/Clube'))
const PoteLazy = lazy(() => import('@/pages/FechamentoPote'))
const IaLazy = lazy(() => import('@/pages/Ia'))
const ConfiguracoesLazy = lazy(() => import('@/pages/Configuracoes'))
const UsuariosLazy = lazy(() => import('@/pages/UsuariosPermissoes'))

const ROTULOS: Record<PaginaId, string> = {
  painel: 'Painel',
  agenda: 'Agenda',
  fila: 'Fila de espera',
  pdv: 'PDV',
  caixa: 'Caixa',
  comandas: 'Comandas',
  clientes: 'Clientes',
  crm: 'CRM',
  whatsapp: 'WhatsApp',
  profissionais: 'Profissionais',
  comissoes: 'Comissões',
  servicos: 'Serviços',
  pacotes: 'Pacotes',
  clube: 'Clube de assinaturas',
  pote: 'Audax Club · Pote',
  estoque: 'Produtos / Estoque',
  financeiro: 'Financeiro',
  relatorios: 'Relatórios',
  ia: 'Central de IA',
  configuracoes: 'Configurações',
  usuarios: 'Usuários e permissões',
}

function ModuloFuturo({ pagina }: { pagina: PaginaId }) {
  return (
    <div className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-8 text-center">
      <h1 className="text-[22px] font-bold text-[#1C1A15]">
        {ROTULOS[pagina]}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#8A8171]">
        Este módulo ainda não foi implementado. O layout já está pronto nas
        cores do Studio Audax — a regra de negócio entra na próxima etapa.
      </p>
      <div className="mx-auto mt-5 h-px w-16 bg-[#8A6A14]" aria-hidden="true" />
    </div>
  )
}

const IMPLEMENTADAS: PaginaId[] = [
  'painel',
  'agenda',
  'fila',
  'caixa',
  'clientes',
  'crm',
  'whatsapp',
  'servicos',
  'profissionais',
  'comissoes',
  'financeiro',
  'relatorios',
  'pdv',
  'estoque',
  'clube',
  'pote',
  'ia',
  'configuracoes',
  'usuarios',
]

function PaginaProtegida({ pagina: paginaId, children, onNegado }: {
  pagina: PaginaId
  children: ReactNode
  onNegado: () => void
}) {
  // Mesma regra do menu: papel + permissão individual. Uma URL digitada à
  // mão passa pelo mesmo crivo do item de navegação (e a RLS do banco
  // continua valendo por baixo, para o caso de a leitura das exceções
  // ainda não ter chegado).
  const podeAcessar = usePodeAcessarPagina()
  if (!podeAcessar(paginaId)) {
    return <SemPermissao pagina={paginaId} onVoltar={onNegado} />
  }
  return <>{children}</>
}

function Conteudo() {
  const [pagina, setPagina] = useState<PaginaId>('painel')
  const [modalAberto, setModalAberto] = useState(false)
  const [inicial, setInicial] = useState<SlotAgendamento | null>(null)

  function abrirNovo(slot?: SlotAgendamento) {
    setInicial(slot ?? null)
    setModalAberto(true)
  }

  const handleNegado = () => setPagina('painel')

  return (
    <AppLayout paginaAtual={pagina} onNavegar={setPagina}>
      {/* Falha numa página não derruba o layout: a barreira por página
          reseta ao trocar de módulo (key). */}
      <ErrorBoundary key={pagina}>
        {pagina === 'painel' && (
          <PaginaProtegida pagina="painel" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Painel…</div>}>
              <DashboardLazy
                onNovo={() => abrirNovo()}
                onIrPara={setPagina}
                onIrParaEstoque={() => {
                  try {
                    sessionStorage.setItem('studio-audax:estoque:filtro', 'baixo')
                  } catch {
                    // sessionStorage indisponível: tela abre sem o filtro
                  }
                  setPagina('estoque')
                }}
              />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'agenda' && (
          <PaginaProtegida pagina="agenda" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Agenda…</div>}>
              <AgendaLazy onNovo={abrirNovo} />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'fila' && (
          <PaginaProtegida pagina="fila" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Fila…</div>}>
              <EsperaLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'caixa' && (
          <PaginaProtegida pagina="caixa" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Caixa…</div>}>
              <CaixaLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'clientes' && (
          <PaginaProtegida pagina="clientes" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Clientes…</div>}>
              <ClientesLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'crm' && (
          <PaginaProtegida pagina="crm" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando CRM…</div>}>
              <CrmLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'whatsapp' && (
          <PaginaProtegida pagina="whatsapp" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando WhatsApp…</div>}>
              <WhatsLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'servicos' && (
          <PaginaProtegida pagina="servicos" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Serviços…</div>}>
              <ServicosLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'profissionais' && (
          <PaginaProtegida pagina="profissionais" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Profissionais…</div>}>
              <ProfissionaisLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'comissoes' && (
          <PaginaProtegida pagina="comissoes" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Comissões…</div>}>
              <ComissoesLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'financeiro' && (
          <PaginaProtegida pagina="financeiro" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Financeiro…</div>}>
              <FinanceiroLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'relatorios' && (
          <PaginaProtegida pagina="relatorios" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Relatórios…</div>}>
              <RelatoriosLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'pdv' && (
          <PaginaProtegida pagina="pdv" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando PDV…</div>}>
              <PDVLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'estoque' && (
          <PaginaProtegida pagina="estoque" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Estoque…</div>}>
              <ProdutosLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'clube' && (
          <PaginaProtegida pagina="clube" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Clube…</div>}>
              <ClubeLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'pote' && (
          <PaginaProtegida pagina="pote" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando o fechamento do pote…</div>}>
              <PoteLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'ia' && (
          <PaginaProtegida pagina="ia" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando IA…</div>}>
              <IaLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'configuracoes' && (
          <PaginaProtegida pagina="configuracoes" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando Configurações…</div>}>
              <ConfiguracoesLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {pagina === 'usuarios' && (
          <PaginaProtegida pagina="usuarios" onNegado={handleNegado}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-[#8A8171]">Carregando usuários…</div>}>
              <UsuariosLazy />
            </Suspense>
          </PaginaProtegida>
        )}
        {!IMPLEMENTADAS.includes(pagina) && <ModuloFuturo pagina={pagina} />}
        {modalAberto && (
          <NovoAgendamentoModal
            dataInicial={inicial?.data}
            horarioInicial={inicial?.horario}
            profissionalInicial={inicial?.profissional}
            onFechar={() => setModalAberto(false)}
          />
        )}
      </ErrorBoundary>
    </AppLayout>
  )
}

/**
 * Sem Supabase não há sessão possível — e sem sessão o painel não abre.
 * Nenhum caminho de código, e nenhuma configuração, libera o sistema sem
 * autenticação.
 */
function SupabaseAusente() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFBF3] px-4">
      <div className="w-full max-w-md rounded-xl border border-[#E5DCC3] bg-white p-8">
        <h1 className="text-center text-xl font-bold text-[#1C1A15]">Studio Audax</h1>
        <div
          className="mx-auto mt-3 h-px w-16 bg-[#8A6A14]"
          aria-hidden="true"
        />
        <p role="alert" className="mt-4 text-sm text-[#8A8171]">
          O Studio Audax está configurado para exigir login, mas o Supabase não
          foi encontrado.
        </p>
        <p className="mt-3 text-[13px] text-[#8A8171]">
          Sem <span className="font-mono">VITE_SUPABASE_URL</span> e{' '}
          <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> não existe
          sessão para validar, então o painel permanece fechado. Configure as
          duas variáveis e recarregue a página.
        </p>
      </div>
    </div>
  )
}

/**
 * Portão de acesso — allow-list: SOMENTE `autenticado` abre o conteúdo.
 * `deslogado` mostra o login, `carregando` mostra a verificação, e qualquer
 * outro estado (hoje `desabilitado`, amanhã o que vier) cai na tela de
 * Supabase ausente em vez de liberar o sistema. A versão anterior liberava
 * `{children}` para tudo que não fosse `carregando`/`deslogado`, o que
 * entregava o painel inteiro sem autenticação sempre que as variáveis de
 * ambiente não chegassem no build.
 */
function AreaProtegida({ children }: { children: ReactNode }) {
  const { estado } = useAuth()
  if (estado.status === 'autenticado') return <>{children}</>
  if (estado.status === 'carregando') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FDFBF3] text-sm text-[#8A8171]">
        Verificando a sessão…
      </div>
    )
  }
  if (estado.status === 'deslogado') return <TelaLogin />
  return <SupabaseAusente />
}

/**
 * Qual área a URL abriu: o agendamento público (`/agendar`), a Área do Cliente
 * (`/cliente`) ou o app interno. A decisão mora em `areaPelaUrl` — aqui só
 * escolhe o que montar.
 *
 * `/agendar` e `/cliente` são paths de verdade (ver `vercel.json`), então
 * abrem sem sessão de profissional. O hash legado (`#/agendar`, `#/painel`)
 * continua valendo.
 */
function App() {
  const [area, setArea] = useState<AreaPública>(() => areaPelaUrl())
  useEffect(() => {
    const aoMudar = () => setArea(areaPelaUrl())
    window.addEventListener('hashchange', aoMudar)
    window.addEventListener('popstate', aoMudar)
    return () => {
      window.removeEventListener('hashchange', aoMudar)
      window.removeEventListener('popstate', aoMudar)
    }
  }, [])

  return (
    <AuthProvider>
      <AvisoPersistencia />
      {/*
        Os módulos que leem/gravam no Supabase montam DEPOIS do portão de
        sessão: carga remota sem token é recusada pela RLS e não se repete
        sozinha — sem esta ordem, o primeiro login abriria o sistema vazio
        (dado nenhum foi lido) mesmo com tudo salvo no servidor. Sem Supabase
        o portão não abre: ele mostra a tela de ausência de configuração em
        vez de entregar o painel.
      */}
      {area === 'agendar' ? (
        <AgendarPublico />
      ) : area === 'cliente' ? (
        <PainelAuthProvider>
          <PainelRaiz />
        </PainelAuthProvider>
      ) : (
        <AreaProtegida>
        {/*
          As permissões individuais só existem com sessão: o provedor lê as
          exceções de QUEM ESTÁ LOGADO (e só as dele — a RLS da 042 não deixa
          ninguém ler as de outro). Quem não monta este provedor (testes
          isolados, Área do Cliente) segue exatamente pelo papel.
        */}
        <PermissoesIndividuaisProvider>
        <ClientesProvider>
          <ProfissionaisProvider>
            <ProdutosProvider>
              <EstoqueProvider>
                <ServicosProvider>
                  <CaixaProvider>
                    <AgendaProvider>
                      <ComissoesProvider>
                        <ClubeProvider>
                          <CrmProvider>
                            <EsperaProvider>
                              <MarketingProvider>
                                <AutomacoesProvider>
                                  <WhatsProvider>
                                    <IaProvider>
                                      <Conteudo />
                                    </IaProvider>
                                  </WhatsProvider>
                                </AutomacoesProvider>
                              </MarketingProvider>
                            </EsperaProvider>
                          </CrmProvider>
                        </ClubeProvider>
                      </ComissoesProvider>
                    </AgendaProvider>
                  </CaixaProvider>
                </ServicosProvider>
              </EstoqueProvider>
            </ProdutosProvider>
          </ProfissionaisProvider>
        </ClientesProvider>
        </PermissoesIndividuaisProvider>
      </AreaProtegida>
      )}
    </AuthProvider>
  )
}

export default App
