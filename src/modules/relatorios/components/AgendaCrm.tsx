import { CelulaKpi, LinhaDetalhe, Secao, Vazio } from '@/components/PainelUi'
import { formatarBRL } from '@/lib/moeda'
import type { PerfilCliente, ResumoSegmentos } from '@/modules/crm/regras'
import { SEGMENTOS_ORDEM, SEGMENTOS_ROTULO } from '@/modules/crm/types'
import type { AgendaPeriodo } from '@/modules/relatorios/calculos'

type Props = {
  agenda: AgendaPeriodo
  perfisCrm: PerfilCliente[]
  resumoCrm: ResumoSegmentos
  profFiltro: string
}

/** Agendamentos do período + segmentos de CRM (independem do período). */
export default function AgendaCrm({
  agenda,
  perfisCrm,
  resumoCrm,
  profFiltro,
}: Props) {
  return (
    <>
      {/* Agendamentos do período */}
      <div className="mt-4">
        <Secao titulo="Agendamentos do período">
          <div className="overflow-x-auto border-y border-[#E5DCC3]">
            <div className="flex min-w-[760px] divide-x divide-[#E5DCC3]">
              <CelulaKpi
                rotulo="Agendamentos"
                valor={String(agenda.total)}
              />
              <CelulaKpi
                rotulo="Em aberto"
                valor={String(agenda.emAberto)}
              />
              <CelulaKpi
                rotulo="Concluídos"
                valor={String(agenda.concluidos)}
              />
              <CelulaKpi
                rotulo="Cancelados"
                valor={String(agenda.cancelados)}
              />
              <CelulaKpi
                rotulo="Não compareceu"
                valor={String(agenda.naoCompareceu)}
              />
              <CelulaKpi
                rotulo="Remarcações"
                valor={String(agenda.remarcacoes)}
              />
            </div>
          </div>
        </Secao>
      </div>

      {/* CRM — segmentos atuais (independem do período) */}
      <div className="mt-4">
        <Secao titulo="CRM">
          {perfisCrm.length === 0 ? (
            <Vazio texto="Nenhum cliente cadastrado." />
          ) : (
            <>
              <p className="text-[13px] text-[#3A352C]">
                {profFiltro === 'todos'
                  ? 'Classificação atual dos clientes — não muda com o período selecionado.'
                  : `Classificação dos clientes atendidos por ${profFiltro} — não muda com o período selecionado.`}
              </p>
              <div className="mt-3 overflow-x-auto border-y border-[#E5DCC3]">
                <div className="flex min-w-[760px] divide-x divide-[#E5DCC3]">
                  {SEGMENTOS_ORDEM.map((segmento) => (
                    <CelulaKpi
                      key={segmento}
                      rotulo={`${SEGMENTOS_ROTULO[segmento]} (CRM)`}
                      valor={String(resumoCrm[segmento])}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <LinhaDetalhe
                  rotulo="Clientes analisados (CRM)"
                  valor={String(perfisCrm.length)}
                />
                <LinhaDetalhe
                  rotulo="Atendimentos realizados (CRM)"
                  valor={String(
                    perfisCrm.reduce((t, p) => t + p.totalAtendimentos, 0),
                  )}
                />
                <LinhaDetalhe
                  rotulo="Total gasto pelos clientes (CRM)"
                  valor={formatarBRL(
                    perfisCrm.reduce((t, p) => t + p.totalGasto, 0),
                  )}
                />
              </div>
            </>
          )}
        </Secao>
      </div>
    </>
  )
}
