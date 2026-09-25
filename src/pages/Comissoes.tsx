import { useMemo, useState } from 'react'
import Avatar from '@/components/Avatar'
import ConfigComissaoModal from '@/components/ConfigComissaoModal'
import ConfirmarModal from '@/components/ConfirmarModal'
import DetalheComissaoModal from '@/components/DetalheComissaoModal'
import FechamentoComissaoModal from '@/components/FechamentoComissaoModal'
import { useCaixa } from '@/modules/caixa/store'
import {
  periodoHoje,
  periodoMes,
  periodoSemana,
  rotuloPeriodo,
} from '@/modules/comissoes/periodo'
import { linhasDoPeriodo, totaisDoPeriodo } from '@/modules/comissoes/resumo'
import type { LinhaProducao } from '@/modules/comissoes/resumo'
import { useComissoes } from '@/modules/comissoes/store'
import type { Periodo } from '@/modules/comissoes/types'
import { useProfissionais } from '@/modules/profissionais/store'
import { formatarBRL } from '@/lib/moeda'

type TipoPreenchido = 'hoje' | 'semana' | 'mes' | 'custom'

const ROTULO_TIPO: Record<TipoPreenchido, string> = {
  hoje: 'Hoje',
  semana: 'Esta semana',
  mes: 'Este mês',
  custom: 'Personalizado',
}

function chipPeriodo(ativo: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativo
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

export default function Comissoes() {
  const { lancamentos } = useCaixa()
  const { profissionais } = useProfissionais()
  const {
    configDe,
    fechamentoAtivo,
    reabrirComissao,
    auditoria,
  } = useComissoes()

  const [tipo, setTipo] = useState<TipoPreenchido>('mes')
  const [custom, setCustom] = useState<Periodo>(() => periodoMes())
  const [configurando, setConfigurando] = useState<{
    id: string
    nome: string
  } | null>(null)
  const [detalhe, setDetalhe] = useState<LinhaProducao | null>(null)
  const [fechando, setFechando] = useState<LinhaProducao | null>(null)
  const [reabrindo, setReabrindo] = useState<
    { id: string; nome: string } | null
  >(null)

  const periodo = useMemo<Periodo>(() => {
    if (tipo === 'hoje') return periodoHoje()
    if (tipo === 'semana') return periodoSemana()
    if (tipo === 'mes') return periodoMes()
    return custom
  }, [tipo, custom])

  const linhas = useMemo<LinhaProducao[]>(
    () => linhasDoPeriodo(lancamentos, profissionais, configDe, periodo),
    [lancamentos, profissionais, configDe, periodo],
  )

  const { qtd: totalQtd, producao: totalProducao, comissao: totalComissao } =
    useMemo(() => totaisDoPeriodo(linhas), [linhas])

  const auditoriaVisivel = useMemo(
    () => auditoria.slice().reverse().slice(0, 8),
    [auditoria],
  )

  function aplicarCustom(campo: 'inicio' | 'fim', valor: string) {
    if (!valor) return
    setCustom((atual) => ({ ...atual, [campo]: valor }))
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Comissões
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {rotuloPeriodo(periodo)} · {linhas.length} profissional(is) ·{' '}
            {totalQtd} atendimento(s) pagos
          </p>
        </div>
      </div>

      {/* Período */}
      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        {(['hoje', 'semana', 'mes'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={chipPeriodo(tipo === t)}
          >
            {ROTULO_TIPO[t]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTipo('custom')}
          className={chipPeriodo(tipo === 'custom')}
        >
          Personalizado
        </button>
        {tipo === 'custom' && (
          <span className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Início do período"
              value={custom.inicio}
              onChange={(e) => aplicarCustom('inicio', e.target.value)}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
            />
            <span className="text-sm text-[#8A8171]">até</span>
            <input
              type="date"
              aria-label="Fim do período"
              value={custom.fim}
              onChange={(e) => aplicarCustom('fim', e.target.value)}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
            />
          </span>
        )}
        <span className="ml-auto text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
          Calculado sobre os pagamentos do Caixa
        </span>
      </div>

      {/* Totais */}
      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[640px] divide-x divide-[#E5DCC3]">
          <div className="min-w-[150px] flex-1 px-4 py-4">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
              Atendimentos pagos
            </p>
            <p className="mt-1.5 text-[22px] leading-none font-bold text-[#8A6A14]">
              {totalQtd}
            </p>
          </div>
          <div className="min-w-[150px] flex-1 px-4 py-4">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
              Produção total
            </p>
            <p className="mt-1.5 text-[22px] leading-none font-bold text-[#8A6A14]">
              {formatarBRL(totalProducao)}
            </p>
          </div>
          <div className="min-w-[150px] flex-1 px-4 py-4">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
              Comissões a pagar
            </p>
            <p className="mt-1.5 text-[22px] leading-none font-bold text-[#6B8E5A]">
              {formatarBRL(totalComissao)}
            </p>
          </div>
          <div className="min-w-[150px] flex-1 px-4 py-4">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
              Profissionais ativos
            </p>
            <p className="mt-1.5 text-[22px] leading-none font-bold text-[#8A6A14]">
              {linhas.filter((l) => !l.inativo).length}
            </p>
          </div>
        </div>
      </div>

      {/* Tabela por profissional */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3]">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
              <th className="px-4 py-3 font-semibold">Barbeiro</th>
              <th className="px-4 py-3 text-right font-semibold">
                Atendimentos
              </th>
              <th className="px-4 py-3 text-right font-semibold">Produção</th>
              <th className="px-4 py-3 text-right font-semibold">%</th>
              <th className="px-4 py-3 text-right font-semibold">Comissão</th>
              <th className="px-4 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE7D3]">
            {linhas.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-[#A99E85]"
                >
                  Nenhum profissional cadastrado. Cadastre em Profissionais.
                </td>
              </tr>
            )}
            {linhas.map((linha) => {
              const fechamento = fechamentoAtivo(
                linha.profissionalId,
                periodo,
              )
              return (
                <tr key={linha.chave} className="hover:bg-[#FAF6EB]">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDetalhe(linha)}
                      className="flex items-center gap-2.5 text-left"
                      aria-label={`Ver detalhes de ${linha.nome}`}
                    >
                      <Avatar nome={linha.nome} foto={linha.foto} tamanho="sm" />
                      <span>
                        <span className="block text-sm font-bold text-[#1C1A15]">
                          {linha.nome}
                        </span>
                        <span className="flex gap-1.5">
                          {linha.inativo && (
                            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              Inativo
                            </span>
                          )}
                          {fechamento && (
                            <span className="rounded-full border border-[#BFE0B2] bg-[#E9F5E4] px-2 py-0.5 text-[10px] font-semibold text-[#3F6B33]">
                              Fechada {formatarBRL(fechamento.comissao)}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-[#1C1A15]">
                    {linha.qtd}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-[#1C1A15]">
                    {formatarBRL(linha.producao)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[#4A4436]">
                    {linha.percentual}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-[#8A6A14]">
                    {formatarBRL(linha.comissao)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setConfigurando({
                            id: linha.profissionalId,
                            nome: linha.nome,
                          })
                        }
                        className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                      >
                        Configurar
                      </button>
                      {fechamento ? (
                        <button
                          type="button"
                          onClick={() =>
                            setReabrindo({
                              id: fechamento.id,
                              nome: linha.nome,
                            })
                          }
                          className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Reabrir
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setFechando(linha)}
                          className="rounded-lg bg-[#8A6A14] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#6F550F]"
                        >
                          Fechar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#E5DCC3] bg-[#FAF6EB] text-sm font-bold text-[#1C1A15]">
                <td className="px-4 py-3">Total geral</td>
                <td className="px-4 py-3 text-right">{totalQtd}</td>
                <td className="px-4 py-3 text-right">
                  {formatarBRL(totalProducao)}
                </td>
                <td />
                <td className="px-4 py-3 text-right text-[#8A6A14]">
                  {formatarBRL(totalComissao)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-3 text-[13px] text-[#8A8171]">
        Clique no nome do barbeiro para ver os atendimentos que formaram a
        produção. Vendas de produtos ficam separadas (visíveis no
        detalhamento) e ainda não entram na comissão.
      </p>

      {/* Auditoria */}
      {auditoriaVisivel.length > 0 && (
        <div className="mt-5 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
          <h2 className="text-[15px] font-bold text-[#1C1A15]">
            Auditoria de comissões
          </h2>
          <ul className="mt-3 divide-y divide-[#EFE7D3]">
            {auditoriaVisivel.map((ev) => (
              <li key={ev.id} className="py-2.5">
                <p className="text-sm font-medium text-[#1C1A15]">
                  {ev.acao === 'fechamento' ? 'Fechamento' : 'Reabertura'} ·{' '}
                  {ev.descricao}
                </p>
                <p className="text-xs text-[#8A8171]">
                  {new Date(ev.criadoEm).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {ev.motivo && ` — motivo: ${ev.motivo}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {configurando && (
        <ConfigComissaoModal
          profissionalId={configurando.id}
          profissionalNome={configurando.nome}
          config={configDe(configurando.id)}
          onFechar={() => setConfigurando(null)}
        />
      )}

      {detalhe && (
        <DetalheComissaoModal
          profissionalId={detalhe.profissionalId}
          profissionalNome={detalhe.nome}
          periodo={periodo}
          config={configDe(detalhe.profissionalId)}
          fechamento={fechamentoAtivo(detalhe.profissionalId, periodo)}
          onFechar={() => setDetalhe(null)}
        />
      )}

      {fechando && (
        <FechamentoComissaoModal
          profissionalId={fechando.profissionalId}
          profissionalNome={fechando.nome}
          periodo={periodo}
          qtdAtendimentos={fechando.qtd}
          producao={fechando.producao}
          percentual={fechando.percentual}
          comissao={fechando.comissao}
          onFechar={() => setFechando(null)}
        />
      )}

      {reabrindo && (
        <ConfirmarModal
          titulo="Reabrir comissão"
          texto={`A comissão de ${reabrindo.nome} no período ${rotuloPeriodo(periodo)} será reaberta. O fechamento original é preservado no histórico e a reabertura fica registrada na auditoria.`}
          rotuloConfirmar="Reabrir"
          perigo
          motivoObrigatorio
          rotuloMotivo="Motivo da reabertura"
          placeholderMotivo="Ex.: esqueci um pagamento do período"
          onConfirmar={(motivo) => {
            reabrirComissao(reabrindo.id, motivo ?? '')
            setReabrindo(null)
          }}
          onFechar={() => setReabrindo(null)}
        />
      )}
    </div>
  )
}
