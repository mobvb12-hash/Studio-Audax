import { useMemo, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import DespesaFormModal from '@/components/DespesaFormModal'
import FechamentoCaixaModal from '@/components/FechamentoCaixaModal'
import VendaProdutoModal from '@/components/VendaProdutoModal'
import { formatarDataLonga, hojeISO, somarDias } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import type { Lancamento } from '@/modules/caixa/types'
import { FORMAS_ROTULO } from '@/modules/caixa/types'
import { formatarBRL } from '@/lib/moeda'

function formatarHora(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function Cartao({
  titulo,
  contador,
  children,
}: {
  titulo: string
  contador?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[#1C1A15]">{titulo}</h2>
        {contador && (
          <span className="text-sm font-semibold text-[#8A8171]">{contador}</span>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
      {texto}
    </div>
  )
}

function LinhaLancamento({
  l,
  podeEstornar,
  onEstornar,
}: {
  l: Lancamento
  podeEstornar: boolean
  onEstornar: (l: Lancamento) => void
}) {
  const despesa = l.tipo === 'despesa'
  return (
    <li
      className={`flex items-center justify-between gap-3 py-2.5 ${l.estornado ? 'opacity-50' : ''}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#1C1A15]">
          {despesa ? '' : `${formatarHora(l.criadoEm)} · `}
          {l.descricao}
          {l.profissional && (
            <span className="text-[#8A8171]"> · {l.profissional}</span>
          )}
        </p>
        <p className="text-xs text-[#8A8171]">
          {FORMAS_ROTULO[l.formaPagamento]}
          {despesa && l.categoria && ` · ${l.categoria}`}
          {l.desconto > 0 && ` · desconto ${formatarBRL(l.desconto)}`}
          {l.estornado && ' · estornado'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-sm font-semibold ${
            despesa ? 'text-red-700' : 'text-[#8A6A14]'
          }`}
        >
          {despesa ? '−' : '+'} {formatarBRL(l.valorLiquido)}
        </span>
        {podeEstornar && !l.estornado && (
          <button
            type="button"
            onClick={() => onEstornar(l)}
            className="rounded-lg px-2 py-1 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
          >
            Estornar
          </button>
        )}
      </div>
    </li>
  )
}

export default function Caixa() {
  const {
    auditoria,
    diaFechado,
    fechamentoAtivo,
    lancamentosDoDia,
    resumoDoDia,
    estornar,
    reabrirCaixa,
  } = useCaixa()

  const [data, setData] = useState(hojeISO())
  const [vendaAberta, setVendaAberta] = useState(false)
  const [despesaAberta, setDespesaAberta] = useState(false)
  const [fechamentoAberto, setFechamentoAberto] = useState(false)
  const [estornando, setEstornando] = useState<Lancamento | null>(null)
  const [reabrindo, setReabrindo] = useState(false)

  const fechado = diaFechado(data)
  const fechamento = fechamentoAtivo(data)
  const resumo = resumoDoDia(data)

  const doDia = useMemo(() => lancamentosDoDia(data), [lancamentosDoDia, data])

  const receitas = doDia.filter((l) => l.tipo === 'receita')
  const despesas = doDia.filter((l) => l.tipo === 'despesa')
  const auditoriaDoDia = useMemo(
    () => auditoria.filter((ev) => ev.data === data).reverse(),
    [auditoria, data],
  )

  const kpis = [
    { rotulo: 'Recebido no dia', valor: formatarBRL(resumo.totalRecebido) },
    { rotulo: 'Despesas', valor: formatarBRL(resumo.despesas) },
    {
      rotulo: 'Resultado líquido',
      valor: formatarBRL(resumo.liquido),
      verde: true,
    },
    { rotulo: 'Atendimentos pagos', valor: String(resumo.qtdAtendimentos) },
  ]

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Caixa
          </h1>
          <p className="mt-2 flex items-center gap-2 text-[13px] text-[#4A4436]">
            {formatarDataLonga(data)}
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                fechado
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : 'border-[#4F9417] bg-[#E9F5E4] text-[#3F6B33]'
              }`}
            >
              {fechado ? 'Caixa fechado' : 'Caixa aberto'}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setVendaAberta(true)}
            disabled={fechado}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3.5 py-2 text-sm font-medium hover:bg-[#F3ECDA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Venda de produto
          </button>
          <button
            type="button"
            onClick={() => setDespesaAberta(true)}
            disabled={fechado}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3.5 py-2 text-sm font-medium hover:bg-[#F3ECDA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Despesa
          </button>
          {fechado ? (
            <button
              type="button"
              onClick={() => setReabrindo(true)}
              className="rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Reabrir caixa
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setFechamentoAberto(true)}
              className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
            >
              Fechar caixa
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        <button
          type="button"
          onClick={() => setData((d) => somarDias(d, -1))}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F3ECDA]"
          aria-label="Dia anterior"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setData(hojeISO())}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-medium hover:bg-[#F3ECDA]"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setData((d) => somarDias(d, 1))}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F3ECDA]"
          aria-label="Próximo dia"
        >
          ›
        </button>
        <input
          type="date"
          aria-label="Data do caixa"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
        />
        <span className="ml-auto text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
          {fechado ? 'Lançamentos bloqueados' : 'Lançamentos liberados'}
        </span>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[640px] divide-x divide-[#E5DCC3]">
          {kpis.map((kpi) => (
            <div key={kpi.rotulo} className="min-w-[150px] flex-1 px-4 py-4">
              <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
                {kpi.rotulo}
              </p>
              <p
                className={`mt-1.5 text-[22px] leading-none font-bold ${
                  'verde' in kpi && kpi.verde
                    ? 'text-[#6B8E5A]'
                    : 'text-[#8A6A14]'
                }`}
              >
                {kpi.valor}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Cartao
            titulo="Recebimentos do dia"
            contador={`${receitas.filter((l) => !l.estornado).length} registro(s)`}
          >
            {receitas.length === 0 ? (
              <Vazio texto="Nenhum recebimento neste dia." />
            ) : (
              <ul className="divide-y divide-[#EFE7D3]">
                {receitas.map((l) => (
                  <LinhaLancamento
                    key={l.id}
                    l={l}
                    podeEstornar={!fechado}
                    onEstornar={setEstornando}
                  />
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao titulo="Despesas do dia" contador={`${despesas.length} registro(s)`}>
            {despesas.length === 0 ? (
              <Vazio texto="Nenhuma despesa neste dia." />
            ) : (
              <ul className="divide-y divide-[#EFE7D3]">
                {despesas.map((l) => (
                  <LinhaLancamento
                    key={l.id}
                    l={l}
                    podeEstornar={!fechado}
                    onEstornar={setEstornando}
                  />
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <div className="flex flex-col gap-4">
          <Cartao titulo="Resumo por forma de pagamento">
            <ul className="divide-y divide-[#EFE7D3]">
              {Object.entries(resumo.porForma).map(([forma, valor]) => (
                <li
                  key={forma}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-[#4A4436]">
                    {FORMAS_ROTULO[forma as keyof typeof FORMAS_ROTULO]}
                  </span>
                  <span className="font-semibold text-[#1C1A15]">
                    {formatarBRL(valor)}
                  </span>
                </li>
              ))}
            </ul>
          </Cartao>

          <Cartao
            titulo="Faturamento por profissional"
            contador={`${resumo.porProfissional.length} profissional(is)`}
          >
            {resumo.porProfissional.length === 0 ? (
              <Vazio texto="Nenhum recebimento por profissional neste dia." />
            ) : (
              <ul className="divide-y divide-[#EFE7D3]">
                {resumo.porProfissional.map((p) => (
                  <li
                    key={p.nome}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-[#4A4436]">
                      {p.nome}{' '}
                      <span className="text-xs text-[#8A8171]">
                        ({p.qtd} recebimento(s))
                      </span>
                    </span>
                    <span className="font-semibold text-[#1C1A15]">
                      {formatarBRL(p.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          {fechado && fechamento ? (
            <Cartao titulo="Fechamento registrado">
              <div className="flex items-center justify-between border-b border-[#EFE7D3] pb-2 text-sm">
                <span className="text-[#4A4436]">Fechado em</span>
                <span className="font-medium text-[#1C1A15]">
                  {new Date(fechamento.fechadoEm).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-[#4A4436]">Resultado líquido</span>
                <span className="font-bold text-[#8A6A14]">
                  {formatarBRL(fechamento.resumo.liquido)}
                </span>
              </div>
              {fechamento.reaberto && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Reaberto em{' '}
                  {new Date(fechamento.reaberto.em).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {' — '}
                  {fechamento.reaberto.motivo}
                </p>
              )}
            </Cartao>
          ) : (
            <Cartao titulo="Situação do fechamento">
              <Vazio
                texto="O caixa deste dia ainda não foi fechado. Use “Fechar caixa” para gerar o resumo do dia."
              />
            </Cartao>
          )}

          <Cartao titulo="Auditoria do dia" contador={`${auditoriaDoDia.length}`}>
            {auditoriaDoDia.length === 0 ? (
              <Vazio texto="Nenhum evento (estorno/reabertura) neste dia." />
            ) : (
              <ul className="divide-y divide-[#EFE7D3]">
                {auditoriaDoDia.map((ev) => (
                  <li key={ev.id} className="py-2.5">
                    <p className="text-sm font-medium text-[#1C1A15]">
                      {ev.acao === 'estorno' ? 'Estorno' : 'Reabertura'} ·{' '}
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
            )}
          </Cartao>
        </div>
      </div>

      {vendaAberta && (
        <VendaProdutoModal data={data} onFechar={() => setVendaAberta(false)} />
      )}
      {despesaAberta && (
        <DespesaFormModal data={data} onFechar={() => setDespesaAberta(false)} />
      )}
      {fechamentoAberto && (
        <FechamentoCaixaModal
          data={data}
          onFechar={() => setFechamentoAberto(false)}
        />
      )}
      {estornando && (
        <ConfirmarModal
          titulo="Estornar lançamento"
          texto={`Confirma o estorno de “${estornando.descricao}” (${formatarBRL(estornando.valorLiquido)})? O lançamento continua no histórico, marcado como estornado.`}
          rotuloConfirmar="Estornar"
          perigo
          onConfirmar={() => {
            estornar(estornando.id)
            setEstornando(null)
          }}
          onFechar={() => setEstornando(null)}
        />
      )}
      {reabrindo && (
        <ConfirmarModal
          titulo="Reabrir caixa"
          texto={`O caixa de ${formatarDataLonga(data)} está fechado. A reabertura fica registrada na auditoria e permite novos lançamentos neste dia.`}
          rotuloConfirmar="Reabrir caixa"
          perigo
          motivoObrigatorio
          rotuloMotivo="Motivo da reabertura"
          placeholderMotivo="Ex.: esqueci de lançar um pagamento"
          onConfirmar={(motivo) => {
            reabrirCaixa(data, motivo ?? '')
            setReabrindo(false)
          }}
          onFechar={() => setReabrindo(false)}
        />
      )}
    </div>
  )
}
