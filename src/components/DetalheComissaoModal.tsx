import { useEffect, useMemo } from 'react'
import Avatar from '@/components/Avatar'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import type { Lancamento } from '@/modules/caixa/types'
import { calcularComissao, calcularProducao } from '@/modules/comissoes/producao'
import { rotuloPeriodo } from '@/modules/comissoes/periodo'
import type { ConfigComissao, FechamentoComissao, Periodo } from '@/modules/comissoes/types'
import { useProfissionais } from '@/modules/profissionais/store'
import { formatarBRL } from '@/lib/moeda'

type Props = {
  profissionalId: string
  profissionalNome: string
  periodo: Periodo
  config: ConfigComissao
  fechamento?: FechamentoComissao
  onFechar: () => void
}

function LinhaItem({
  l,
  percentual,
  estornado = false,
}: {
  l: Lancamento
  percentual: number
  estornado?: boolean
}) {
  const comissao = estornado ? 0 : calcularComissao(l.valorLiquido, percentual)
  return (
    <tr className={estornado ? 'opacity-60' : undefined}>
      <td className="px-2 py-2 text-xs whitespace-nowrap text-[#3A352C]">
        {formatarDataLonga(l.data)}
      </td>
      <td className="max-w-[120px] truncate px-2 py-2 text-sm font-medium text-[#121110]">
        {l.cliente ?? '—'}
      </td>
      <td className="max-w-[140px] truncate px-2 py-2 text-xs text-[#3A352C]">
        {l.servico ?? l.descricao}
      </td>
      <td className="px-2 py-2 text-right text-sm text-[#121110]">
        {formatarBRL(l.valor)}
      </td>
      <td className="px-2 py-2 text-right text-sm text-[#7C7469]">
        {formatarBRL(l.desconto)}
      </td>
      <td className="px-2 py-2 text-right text-sm font-semibold text-[#121110]">
        {formatarBRL(l.valorLiquido)}
      </td>
      <td className="px-2 py-2 text-right text-sm font-semibold text-[#8A6A14]">
        {formatarBRL(comissao)}
      </td>
      <td className="px-2 py-2 text-right">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            estornado
              ? 'border-red-200 bg-red-50 text-red-600'
              : 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
          }`}
        >
          {estornado ? 'Estornado' : 'Pago'}
        </span>
      </td>
    </tr>
  )
}

export default function DetalheComissaoModal({
  profissionalId,
  profissionalNome,
  periodo,
  config,
  fechamento,
  onFechar,
}: Props) {
  const { lancamentos } = useCaixa()
  const { profissionais } = useProfissionais()
  const profissional = profissionais.find((p) => p.id === profissionalId)

  const producao = useMemo(
    () =>
      calcularProducao(
        lancamentos,
        profissionalNome,
        periodo,
        profissionalId.startsWith('nome:') ? undefined : profissionalId,
      ),
    [lancamentos, profissionalNome, periodo, profissionalId],
  )

  const comissaoViva = calcularComissao(producao.liquido, config.percentual)
  const comissaoTotal = fechamento ? fechamento.comissao : comissaoViva
  // Divergência entre o snapshot congelado e a produção atual (o fechamento
  // não recalcula; apenas expõe que o fecho ficou para trás).
  const divergente =
    fechamento !== undefined &&
    Math.abs(comissaoViva - fechamento.comissao) > 0.005

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar
              nome={profissionalNome}
              foto={profissional?.foto}
              tamanho="md"
            />
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#7C7469] uppercase">
                Detalhamento da produção
              </p>
              <h2 className="text-lg font-bold text-[#121110]">
                {profissionalNome}
              </h2>
              <p className="text-[13px] text-[#7C7469]">
                {rotuloPeriodo(periodo)} · {config.percentual}% de comissão
                {fechamento && ' · comissão fechada'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#7C7469] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-center">
            <p className="text-lg leading-none font-bold text-[#8A6A14]">
              {producao.qtdAtendimentos}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#7C7469] uppercase">
              Atendimentos
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-center">
            <p className="text-lg leading-none font-bold text-[#8A6A14]">
              {formatarBRL(producao.liquido)}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#7C7469] uppercase">
              Produção líquida
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-center">
            <p className="text-lg leading-none font-bold text-[#8A6A14]">
              {formatarBRL(producao.producaoProdutos)}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#7C7469] uppercase">
              Produtos (separado)
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-[#F3ECDA] px-3 py-2.5 text-center">
            <p className="text-lg leading-none font-bold text-[#8A6A14]">
              {formatarBRL(comissaoTotal)}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#7C7469] uppercase">
              {fechamento ? 'Comissão (fechada)' : 'Comissão'}
            </p>
          </div>
        </div>

        {fechamento && (
          <div className="mt-3 space-y-1.5">
            <p className="rounded-lg bg-[#F3ECDA] px-3 py-2 text-[13px] text-[#3A352C]">
              Comissão fechada: {formatarBRL(fechamento.comissao)} — snapshot
              congelado em{' '}
              {new Date(fechamento.fechadoEm).toLocaleDateString('pt-BR')}.
              Valor do fechamento permanece congelado até reabertura.
            </p>
            {divergente && (
              <p className="rounded-lg bg-[#F3ECDA] px-3 py-2 text-[13px] text-[#3A352C]">
                Produção atual diferente do fechamento: produção atual{' '}
                {formatarBRL(comissaoViva)} contra{' '}
                {formatarBRL(fechamento.comissao)} fechados. O valor do
                fechamento permanece congelado até reabertura.
              </p>
            )}
          </div>
        )}

        {(producao.qtdEstornos > 0 || producao.descontos > 0) && (
          <p className="mt-3 rounded-lg bg-[#F3ECDA] px-3 py-2 text-[13px] text-[#3A352C]">
            Descontos concedidos: {formatarBRL(producao.descontos)}
            {producao.qtdEstornos > 0 &&
              ` · ${producao.qtdEstornos} estorno(s) de ${formatarBRL(producao.valorEstornos)} já retirados da produção`}
          </p>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-[#E5DCC3] bg-white">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#7C7469] uppercase">
                <th className="px-2 py-2 font-semibold">Data</th>
                <th className="px-2 py-2 font-semibold">Cliente</th>
                <th className="px-2 py-2 font-semibold">Serviço</th>
                <th className="px-2 py-2 text-right font-semibold">Valor</th>
                <th className="px-2 py-2 text-right font-semibold">Desc.</th>
                <th className="px-2 py-2 text-right font-semibold">Líquido</th>
                <th className="px-2 py-2 text-right font-semibold">Comissão</th>
                <th className="px-2 py-2 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE7D3]">
              {producao.itens.map((l) => (
                <LinhaItem key={l.id} l={l} percentual={config.percentual} />
              ))}
              {producao.estornados.map((l) => (
                <LinhaItem
                  key={l.id}
                  l={l}
                  percentual={config.percentual}
                  estornado
                />
              ))}
              {producao.itens.length === 0 &&
                producao.estornados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-[#A99E85]">
                      Nenhum atendimento pago neste período.
                    </td>
                  </tr>
                )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#E5DCC3] bg-[#FAF6EB] text-sm font-bold text-[#121110]">
                <td colSpan={5} className="px-2 py-2.5 text-right">
                  Totais
                </td>
                <td className="px-2 py-2.5 text-right">
                  {formatarBRL(producao.liquido)}
                </td>
                <td className="px-2 py-2.5 text-right text-[#8A6A14]">
                  {formatarBRL(comissaoTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <button
          type="button"
          onClick={onFechar}
          className="mt-5 w-full rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}
