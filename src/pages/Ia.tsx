import { useMemo, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import { CelulaKpi } from '@/components/PainelUi'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import { useClientes } from '@/modules/clientes/store'
import { useCrm } from '@/modules/crm/store'
import {
  gerarSugestoes,
  semTratadas,
  TIPOS_SUGESTAO_ROTULO,
  type SugestaoIa,
} from '@/modules/ia/regras'
import { useIa } from '@/modules/ia/store'
import { useServicos } from '@/modules/servicos/store'
import { useWhats } from '@/modules/whatsapp/store'

function corTipo(tipo: string): string {
  switch (tipo) {
    case 'reativacao':
      return 'border-orange-300 bg-orange-50 text-orange-800'
    case 'servico_complementar':
      return 'border-sky-300 bg-sky-50 text-sky-700'
    default:
      return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  }
}

export default function Ia() {
  const { clientes } = useClientes()
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()
  const { servicos } = useServicos()
  const { aceitas, descartadas, marcarAceita, marcarDescartada } = useIa()
  const { criar, mensagens } = useWhats()
  const { adicionarInteracao } = useCrm()
  const [sugestoes, setSugestoes] = useState<SugestaoIa[] | null>(null)
  const [confirmando, setConfirmando] = useState<SugestaoIa | null>(null)

  const tratadas = useMemo(
    () => new Set([...aceitas, ...descartadas]),
    [aceitas, descartadas],
  )
  const visiveis = useMemo(
    () => (sugestoes ? semTratadas(sugestoes, tratadas) : []),
    [sugestoes, tratadas],
  )

  function analisar() {
    setSugestoes(
      gerarSugestoes({ clientes, agendamentos, lancamentos, servicos, mensagens }),
    )
  }

  function confirmarAcao() {
    if (!confirmando) return
    const s = confirmando
    if (s.acao.tipo === 'mensagem') {
      criar({
        clienteId: s.clienteId,
        cliente: s.cliente,
        template: s.acao.template,
        texto: s.acao.texto,
        origem: 'ia',
      })
    } else {
      adicionarInteracao({
        clienteId: s.clienteId,
        tipo: 'nota',
        texto: s.acao.texto,
      })
    }
    marcarAceita(s.id)
    setConfirmando(null)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#121110]">
            Central de IA
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] text-[#3A352C]">
            A IA analisa apenas dados reais já cadastrados (clientes, agenda,
            caixa e serviços) e propõe sugestões. Nada é alterado, enviado ou
            cobrado automaticamente — toda ação exige sua confirmação.
          </p>
        </div>
        <button
          type="button"
          onClick={analisar}
          className="shrink-0 rounded-lg bg-[#C9A24A] px-4 py-2.5 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
        >
          Analisar dados
        </button>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[480px] divide-x divide-[#E5DCC3]">
          {[
            { rotulo: 'Clientes analisados', valor: String(clientes.length) },
            { rotulo: 'Sugestões na última análise', valor: sugestoes ? String(sugestoes.length) : '—' },
            { rotulo: 'Visíveis agora', valor: String(visiveis.length) },
            { rotulo: 'Confirmadas', valor: String(aceitas.length) },
            { rotulo: 'Descartadas', valor: String(descartadas.length) },
          ].map((kpi) => (
            <CelulaKpi key={kpi.rotulo} rotulo={kpi.rotulo} valor={kpi.valor} />
          ))}
        </div>
      </div>

      {sugestoes === null ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          Clique em “Analisar dados” para a IA gerar sugestões a partir do que
          já existe no sistema.
        </div>
      ) : visiveis.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          Nenhuma sugestão pendente. A IA analisou os dados atuais e não há
          oportunidades abertas (ou você já tratou todas).
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {visiveis.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${corTipo(
                      s.tipo,
                    )}`}
                  >
                    {TIPOS_SUGESTAO_ROTULO[s.tipo]}
                  </span>
                  <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-0.5 text-xs font-medium text-[#3A352C]">
                    {s.cliente}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-bold text-[#121110]">
                  {s.titulo}
                </p>
                <p className="mt-0.5 text-[13px] text-[#3A352C]">
                  {s.descricao}
                </p>
                <p className="mt-1 text-[12px] italic text-[#7C7469]">
                  Ação proposta:{' '}
                  {s.acao.tipo === 'mensagem'
                    ? 'preparar mensagem de reativação (fica pendente — não envia agora)'
                    : 'criar nota no CRM do cliente'}
                  . Requer confirmação.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmando(s)}
                  className="rounded-lg bg-[#C9A24A] px-3 py-1.5 text-xs font-semibold text-[#121110] hover:bg-[#A8842C]"
                >
                  Confirmar ação
                </button>
                <button
                  type="button"
                  onClick={() => marcarDescartada(s.id)}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                >
                  Descartar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmando && (
        <ConfirmarModal
          titulo="Confirmar ação da IA"
          texto={`${
            confirmando.acao.tipo === 'mensagem'
              ? 'Criar mensagem de reativação como PENDENTE (nenhuma mensagem será enviada agora).'
              : 'Criar nota no CRM do cliente.'
          } ${confirmando.descricao}`}
          rotuloConfirmar="Sim, confirmar"
          onConfirmar={confirmarAcao}
          onFechar={() => setConfirmando(null)}
        />
      )}
    </div>
  )
}
