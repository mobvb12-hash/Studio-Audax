import { useState } from 'react'
import type { ReactNode } from 'react'
import AvisoPersistencia from '@/components/AvisoPersistencia'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import TelaLogin from '@/components/TelaLogin'
import AppLayout, { type PaginaId } from '@/layouts/AppLayout'
import { AuthProvider } from '@/modules/auth/AuthProvider'
import { useAuth } from '@/modules/auth/useAuth'
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
import Agenda, { type SlotAgendamento } from '@/pages/Agenda'
import Caixa from '@/pages/Caixa'
import Clientes from '@/pages/Clientes'
import Clube from '@/pages/Clube'
import Comissoes from '@/pages/Comissoes'
import Crm from '@/pages/Crm'
import Dashboard from '@/pages/Dashboard'
import Espera from '@/pages/Espera'
import Financeiro from '@/pages/Financeiro'
import Ia from '@/pages/Ia'
import PDV from '@/pages/PDV'
import Produtos from '@/pages/Produtos'
import Profissionais from '@/pages/Profissionais'
import Relatorios from '@/pages/Relatorios'
import Servicos from '@/pages/Servicos'
import Whats from '@/pages/Whats'
import ErrorBoundary from '@/components/ErrorBoundary'

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
  estoque: 'Produtos / Estoque',
  financeiro: 'Financeiro',
  relatorios: 'Relatórios',
  ia: 'Central de IA',
  configuracoes: 'Configurações',
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
  'ia',
]

function Conteudo() {
  const [pagina, setPagina] = useState<PaginaId>('painel')
  const [modalAberto, setModalAberto] = useState(false)
  const [inicial, setInicial] = useState<SlotAgendamento | null>(null)

  function abrirNovo(slot?: SlotAgendamento) {
    setInicial(slot ?? null)
    setModalAberto(true)
  }

  return (
    <AppLayout paginaAtual={pagina} onNavegar={setPagina}>
      {/* Falha numa página não derruba o layout: a barreira por página
          reseta ao trocar de módulo (key). */}
      <ErrorBoundary key={pagina}>
      {pagina === 'painel' && (
        <Dashboard
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
      )}
      {pagina === 'agenda' && <Agenda onNovo={abrirNovo} />}
      {pagina === 'fila' && <Espera />}
      {pagina === 'caixa' && <Caixa />}
      {pagina === 'clientes' && <Clientes />}
      {pagina === 'crm' && <Crm />}
      {pagina === 'whatsapp' && <Whats />}
      {pagina === 'servicos' && <Servicos />}
      {pagina === 'profissionais' && <Profissionais />}
      {pagina === 'comissoes' && <Comissoes />}
      {pagina === 'financeiro' && <Financeiro />}
      {pagina === 'relatorios' && <Relatorios />}
      {pagina === 'pdv' && <PDV />}
      {pagina === 'estoque' && <Produtos />}
      {pagina === 'clube' && <Clube />}
      {pagina === 'ia' && <Ia />}
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

function App() {
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
      <AreaProtegida>
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
      </AreaProtegida>
    </AuthProvider>
  )
}

export default App
