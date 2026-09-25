import { useState } from 'react'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import AppLayout, { type PaginaId } from '@/layouts/AppLayout'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { CrmProvider } from '@/modules/crm/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { IaProvider } from '@/modules/ia/store'
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
import Ia from '@/pages/Ia'
import PDV from '@/pages/PDV'
import Produtos from '@/pages/Produtos'
import Profissionais from '@/pages/Profissionais'
import Relatorios from '@/pages/Relatorios'
import Servicos from '@/pages/Servicos'

const ROTULOS: Record<PaginaId, string> = {
  painel: 'Painel',
  agenda: 'Agenda',
  fila: 'Fila de espera',
  pdv: 'PDV',
  caixa: 'Caixa',
  comandas: 'Comandas',
  clientes: 'Clientes',
  crm: 'CRM',
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
  'caixa',
  'clientes',
  'crm',
  'servicos',
  'profissionais',
  'comissoes',
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
      {pagina === 'painel' && (
        <Dashboard
          onNovo={() => abrirNovo()}
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
      {pagina === 'caixa' && <Caixa />}
      {pagina === 'clientes' && <Clientes />}
      {pagina === 'crm' && <Crm />}
      {pagina === 'servicos' && <Servicos />}
      {pagina === 'profissionais' && <Profissionais />}
      {pagina === 'comissoes' && <Comissoes />}
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
    </AppLayout>
  )
}

function App() {
  return (
    <ClientesProvider>
      <ProfissionaisProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <ServicosProvider>
              <AgendaProvider>
                <CaixaProvider>
                  <ComissoesProvider>
                    <ClubeProvider>
                      <CrmProvider>
                        <WhatsProvider>
                          <IaProvider>
                            <Conteudo />
                          </IaProvider>
                        </WhatsProvider>
                      </CrmProvider>
                    </ClubeProvider>
                  </ComissoesProvider>
                </CaixaProvider>
              </AgendaProvider>
            </ServicosProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>
  )
}

export default App
