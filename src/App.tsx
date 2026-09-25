import { useState } from 'react'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import AppLayout, { type PaginaId } from '@/layouts/AppLayout'
import { AgendaProvider } from '@/modules/agenda/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Agenda, { type SlotAgendamento } from '@/pages/Agenda'
import Clientes from '@/pages/Clientes'
import Dashboard from '@/pages/Dashboard'
import Profissionais from '@/pages/Profissionais'
import Servicos from '@/pages/Servicos'

const ROTULOS: Record<PaginaId, string> = {
  painel: 'Painel',
  agenda: 'Agenda',
  fila: 'Fila de espera',
  pdv: 'PDV',
  caixa: 'Caixa',
  comandas: 'Comandas',
  clientes: 'Clientes',
  profissionais: 'Profissionais',
  servicos: 'Serviços',
  pacotes: 'Pacotes',
  clube: 'Clube de assinaturas',
  estoque: 'Produtos / Estoque',
  financeiro: 'Financeiro',
  relatorios: 'Relatórios',
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
  'clientes',
  'servicos',
  'profissionais',
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
      {pagina === 'painel' && <Dashboard onNovo={() => abrirNovo()} />}
      {pagina === 'agenda' && <Agenda onNovo={abrirNovo} />}
      {pagina === 'clientes' && <Clientes />}
      {pagina === 'servicos' && <Servicos />}
      {pagina === 'profissionais' && <Profissionais />}
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
        <ServicosProvider>
          <AgendaProvider>
            <Conteudo />
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>
  )
}

export default App
