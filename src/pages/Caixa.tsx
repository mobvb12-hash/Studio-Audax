import { useContext, useMemo, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import DespesaFormModal from '@/components/DespesaFormModal'
import FechamentoCaixaModal from '@/components/FechamentoCaixaModal'
import { Cartao, CelulaKpi, Vazio } from '@/components/PainelUi'
import VendaProdutoModal from '@/components/VendaProdutoModal'
import { formatarDataLonga, hojeISO, somarDias } from '@/modules/agenda/catalogo'
import CartaoLancamentos from '@/modules/caixa/components/CartaoLancamentos'
import { useCaixa } from '@/modules/caixa/store'
import type { Lancamento } from '@/modules/caixa/types'
import { FORMAS_ROTULO } from '@/modules/caixa/types'
import { ContextoAuth } from '@/modules/auth/contexto'
import { useAuthPermissao } from '@/modules/auth/useAuthPermissao'
import { useEstoque } from '@/modules/estoque/store'
import { formatarBRL } from '@/lib/moeda'

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
  const { reverterVenda } = useEstoque()

  // Permissões de ação (mesmo mapa único usado no RLS). Fora do AuthProvider
  // (testes/render isolado) não há papel a consultar — mantém o comportamento
  // atual; em produção a página só existe dentro do AuthProvider.
  const auth = useContext(ContextoAuth)
  const { pode } = useAuthPermissao()
  const comSessao = auth !== null
  const podeDespesa = !comSessao || pode('caixa:lancar_despesa')
  const podeFechar = !comSessao || pode('caixa:fechar')
  const podeReabrir = !comSessao || pode('caixa:reabrir')
  const podeEstornarAcao = !comSessao || pode('caixa:estornar')

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
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#121110]">
            Caixa
          </h1>
          <p className="mt-2 flex items-center gap-2 text-[13px] text-[#3A352C]">
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
          {podeDespesa && (
            <button
              type="button"
              onClick={() => setDespesaAberta(true)}
              disabled={fechado}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3.5 py-2 text-sm font-medium hover:bg-[#F3ECDA] disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Despesa
            </button>
          )}
          {fechado ? (
            podeReabrir && (
              <button
                type="button"
                onClick={() => setReabrindo(true)}
                className="rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Reabrir caixa
              </button>
            )
          ) : (
            podeFechar && (
              <button
                type="button"
                onClick={() => setFechamentoAberto(true)}
                className="rounded-lg bg-[#C9A24A] px-4 py-2 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
              >
                Fechar caixa
              </button>
            )
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
        <span className="ml-auto text-[11px] font-semibold tracking-[0.12em] text-[#7C7469] uppercase">
          {fechado ? 'Lançamentos bloqueados' : 'Lançamentos liberados'}
        </span>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[640px] divide-x divide-[#E5DCC3]">
          {kpis.map((kpi) => (
            <CelulaKpi
              key={kpi.rotulo}
              rotulo={kpi.rotulo}
              valor={kpi.valor}
              destaque={'verde' in kpi && kpi.verde}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <CartaoLancamentos
            titulo="Recebimentos do dia"
            contador={`${receitas.filter((l) => !l.estornado).length} registro(s)`}
            lancamentos={receitas}
            textoVazio="Nenhum recebimento neste dia."
            podeEstornar={!fechado && podeEstornarAcao}
            aoEstornar={setEstornando}
          />

          <CartaoLancamentos
            titulo="Despesas do dia"
            contador={`${despesas.length} registro(s)`}
            lancamentos={despesas}
            textoVazio="Nenhuma despesa neste dia."
            podeEstornar={!fechado && podeEstornarAcao}
            aoEstornar={setEstornando}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Cartao titulo="Resumo por forma de pagamento">
            <ul className="divide-y divide-[#EFE7D3]">
              {Object.entries(resumo.porForma).map(([forma, valor]) => (
                <li
                  key={forma}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-[#3A352C]">
                    {FORMAS_ROTULO[forma as keyof typeof FORMAS_ROTULO]}
                  </span>
                  <span className="font-semibold text-[#121110]">
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
                    <span className="text-[#3A352C]">
                      {p.nome}{' '}
                      <span className="text-xs text-[#7C7469]">
                        ({p.qtd} recebimento(s))
                      </span>
                    </span>
                    <span className="font-semibold text-[#121110]">
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
                <span className="text-[#3A352C]">Fechado em</span>
                <span className="font-medium text-[#121110]">
                  {new Date(fechamento.fechadoEm).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-[#3A352C]">Resultado líquido</span>
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
                    <p className="text-sm font-medium text-[#121110]">
                      {ev.acao === 'estorno' ? 'Estorno' : 'Reabertura'} ·{' '}
                      {ev.descricao}
                    </p>
                    <p className="text-xs text-[#7C7469]">
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
            // Venda de produto: devolve estoque ANTES do estorno no caixa —
            // se a devolução falhar (produto removido etc.), nada muda e o
            // lançamento segue ativo; a movimentação original nunca é
            // apagada e a venda fica no histórico.
            if (estornando.origem === 'produto') {
              reverterVenda(estornando)
            }
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
