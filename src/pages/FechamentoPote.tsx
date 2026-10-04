// ============================================================================
// AUDAX CLUB — FECHAMENTO DO POTE (itens 18 a 21)
//
// Fluxo: Data inicial + Data final → [ CALCULAR FECHAMENTO ] → resumo, tabela
// por profissional e detalhamento → [ FECHAR PERÍODO ].
//
// O período é SEMPRE EXPLÍCITO (item 16): nada assume "mês atual". A janela é
// inclusiva e o cálculo vem do SERVIDOR (`clube_pote_calcular`), que recalcula
// tudo pelo SQL — a tela não soma nada por conta própria.
//
// Snapshot: depois de fechado, o resultado é imutável. Correção é reabrir com
// motivo, e o histórico do cálculo original fica guardado (item 22).
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import { CelulaKpi } from '@/components/PainelUi'
import { ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { CAMPO_FORM as campo } from '@/lib/apresentacao'
import { formatarBRL, normalizarTexto } from '@/lib/moeda'
import { hojeISO } from '@/modules/agenda/catalogo'
import {
  atendimentosDoProfissional,
  calcularRateioPote,
  servicoCobertoPeloPlano,
  type FichaProducao,
  type Periodo,
  type RateioPote,
} from '@/modules/clube/pote'
import {
  fecharPote,
  listarPote,
  reabrirPote,
  type CalculoPote,
  type FechamentoPote,
} from '@/services/supabase/clubePote'
import { supabase } from '@/lib/supabase'
import { useCaixa } from '@/modules/caixa/store'
import { useClube } from '@/modules/clube/store'
import { carregarConfiguracoes } from '@/services/supabase/configuracoes'
import { CONFIG_PADRAO, type Configuracoes } from '@/modules/configuracoes/types'

/**
 * Período inicial: HOJE, e só hoje.
 *
 * Antes a tela assumia o mês corrente (1º dia → hoje). Isso é exatamente o
 * que o dono pediu para não acontecer: o pote é sempre o período que a pessoa
 * ESCOLHEU, e um mês assumido no lugar dela mistura meses de receita e de
 * produção sem ninguém pedir. Começando em hoje→hoje, o período é escolhido
 * antes de qualquer número aparecer.
 */
function periodoInicial(hoje: string): Periodo {
  return { inicio: hoje, fim: hoje }
}

/**
 * Atalho "Mês atual" — só roda quando a pessoa clica nele.
 *
 * Não é o padrão da tela (ver `periodoInicial`): é uma régua que o dono pode
 * puxar quando realmente quiser o mês. O cálculo sempre usa o intervalo que
 * está nos dois campos, seja ele qual for.
 */
function mesCorrente(hoje: string): Periodo {
  return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje }
}

function dataCurta(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

export default function FechamentoPote() {
  const hoje = hojeISO()
  const { pagamentos } = useClube()
  const { lancamentos } = useCaixa()
  // A configuração é carregada aqui (mesma fonte da tela de Configurações):
  // o percentual do pote nunca é fixado no código.
  const [config, setConfig] = useState<Configuracoes>(CONFIG_PADRAO)

  useEffect(() => {
    let vivo = true
    void carregarConfiguracoes().then((r) => {
      if (vivo) setConfig(r.dados)
    })
    return () => {
      vivo = false
    }
  }, [])

  const [periodo, setPeriodo] = useState<Periodo>(() => periodoInicial(hoje))
  const [calculo, setCalculo] = useState<CalculoPote | null>(null)
  const [fichas, setFichas] = useState<FichaProducao[]>([])
  const [fechados, setFechados] = useState<FechamentoPote[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [detalhe, setDetalhe] = useState<{ nome: string; id?: string } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [reabrindo, setReabrindo] = useState<FechamentoPote | null>(null)

const online = Boolean(supabase())
  // Comissão do profissional sobre a SUA parcela do pote (40% no Studio
  // Audax). O pote em si é sempre a receita inteira — não existe "percentual
  // da receita que entra no pote".
  const comissao = config.clube.comissao.percentual
  const poteAtivo = config.clube.pote.ativo

  // Sem Supabase, o mesmo cálculo puro roda em memória a partir dos
  // pagamentos e das fichas guardadas pelo app — a regra não muda.
  const estornados = useMemo(
    () => new Set(lancamentos.filter((l) => l.estornado).map((l) => l.id)),
    [lancamentos],
  )
  const pagamentosPeriodo = useMemo(
    () =>
      pagamentos.map((p) => ({
        data: p.data,
        valor: p.valor,
        estornado: p.caixaLancamentoId ? estornados.has(p.caixaLancamentoId) : false,
      })),
    [pagamentos, estornados],
  )

  const carregarHistorico = useCallback(async () => {
    if (!supabase()) return
    try {
      const lista = await listarPote()
      setFichas(lista.fichas)
      setFechados(lista.fechamentos)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o histórico.')
    }
  }, [])

// Carga inicial: o setState fica só na cadeia assíncrona (setState síncrono
  // no corpo do efeito é proibido pelas regras do React).
  useEffect(() => {
    let vivo = true
    void listarPote()
      .then((lista) => {
        if (!vivo) return
        setFichas(lista.fichas)
        setFechados(lista.fechamentos)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErro(
          e instanceof Error
            ? e.message
            : 'Não foi possível carregar o histórico.',
        )
      })
    return () => {
      vivo = false
    }
  }, [])

  async function calcular() {
    setErro('')
    setAviso('')
    setCarregando(true)
    try {
      if (supabase()) {
        const resposta = await (await import('@/services/supabase/clubePote')).calcularPote({ periodo })
        setCalculo(resposta)
      } else {
        setCalculo(null)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível calcular.')
    } finally {
      setCarregando(false)
    }
  }

  /** Resultadoshown: do servidor quando há Supabase, puro quando não há. */
  const resultado: RateioPote | null = useMemo(() => {
    if (calculo) return calculo
    if (!online) {
      return calcularRateioPote({
        fichas,
        pagamentos: pagamentosPeriodo,
        periodo,
        comissaoPercentual: comissao,
        // Fechamento anterior não pode ser pago de novo.
        apenasNaoRateadas: true,
      })
    }
    return null
  }, [calculo, online, fichas, pagamentosPeriodo, periodo, comissao])

  async function confirmarFechamento() {
    setErro('')
    try {
      await fecharPote({ periodo, responsavel: 'painel' })
      setConfirmando(false)
      setAviso('Período fechado. O resultado agora é um registro imutável.')
      await carregarHistorico()
      await calcular()
    } catch (e) {
      setConfirmando(false)
      setErro(e instanceof Error ? e.message : 'Não foi possível fechar o pote.')
    }
  }

  async function confirmarReabertura(motivo: string) {
    if (!reabrindo) return
    setErro('')
    try {
      await reabrirPote(reabrindo.id, motivo)
      setReabrindo(null)
      setAviso('Fechamento reaberto. O cálculo original continua no histórico.')
      await carregarHistorico()
      await calcular()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível reabrir.')
    }
  }

  const filtroInvalido = periodo.fim < periodo.inicio
  const parte = resultado?.partes.find(
    (p) => p.profissional === detalhe?.nome && (detalhe.id === undefined || p.profissionalId === detalhe.id),
  )
  const atendimentosDetalhe = detalhe
    ? atendimentosDoProfissional(fichas, periodo, detalhe.nome, detalhe.id)
    : []

  return (
    <div>
      <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#121110]">
        AUDAX CLUB — FECHAMENTO DO POTE
      </h1>
      <p className="mt-2 max-w-3xl text-[13px] text-[#3A352C]">
        Receita de assinaturas do período, dividida proporcionalmente pela
        produção de cada profissional. O horário mostrado é sempre o que a Agenda
        e o Caixa registraram —{' '}
        {online
          ? 'o cálculo é refeito pelo servidor a cada consulta.'
          : 'sem conexão, o mesmo cálculo roda no app.'}
      </p>

      {/* -------------------------------------------------- PERÍODO */}
      <div className="mt-5 rounded-lg border border-[#E5DCC3] bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={rotulo} htmlFor="pote-inicio">
              Data inicial
            </label>
            <input
              id="pote-inicio"
              type="date"
              className={campo}
              value={periodo.inicio}
              onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="pote-fim">
              Data final
            </label>
            <input
              id="pote-fim"
              type="date"
              className={campo}
              value={periodo.fim}
              onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void calcular()}
              disabled={carregando || filtroInvalido}
              className="w-full rounded-lg bg-[#C9A24A] px-4 py-2.5 text-sm font-semibold text-[#121110] transition-colors hover:bg-[#A8842C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {carregando ? 'Calculando...' : 'CALCULAR FECHAMENTO'}
            </button>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setPeriodo(mesCorrente(hoje))}
              className="w-full rounded-lg border border-[#E5DCC3] px-4 py-2.5 text-sm font-medium text-[#3A352C] transition-colors hover:border-[#8A6A14]"
            >
              Mês atual
            </button>
          </div>
        </div>

        {filtroInvalido && (
          <p role="alert" className="mt-3 text-[13px] text-red-700">
            A data final precisa ser igual ou depois da data inicial.
          </p>
        )}
        {!poteAtivo && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            O fechamento do pote está <strong>desligado</strong> nas
            Configurações. Calcular funciona; o botão de fechar só é liberado
            depois que for ligado.
          </p>
        )}
        {erro && (
          <p role="alert" className="mt-3 text-[13px] text-red-700">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="mt-3 rounded-lg border border-[#BFE0B2] bg-[#E9F5E4] px-3 py-2 text-[12.5px] text-[#3F6B33]">
            {aviso}
          </p>
        )}
      </div>

      {/* --------------------------------------------------- RESUMO */}
      {resultado && (
        <>
          <p className="mt-4 text-[12px] text-[#7C7469]">
            {dataCurta(periodo.inicio)} até {dataCurta(periodo.fim)}
          </p>
          <div className="mt-2 overflow-x-auto border-y border-[#E5DCC3]">
            {/* Os cinco valores do resumo, cada um separado: receita das
                assinaturas, pote, produção, comissão e o que fica com a
                empresa. Nenhum deles é derivado do outro na tela. */}
            <div className="flex min-w-[760px] divide-x divide-[#E5DCC3]">
              <CelulaKpi rotulo="Receita das assinaturas" valor={formatarBRL(resultado.receita)} />
              <CelulaKpi rotulo="Pote (100% da receita)" valor={formatarBRL(resultado.pote)} />
              <CelulaKpi rotulo="Produção total" valor={`${resultado.fichasTotal} fichas`} />
              <CelulaKpi rotulo={`Comissão dos profissionais (${Math.round(resultado.comissaoPercentual * 100)}%)`} valor={formatarBRL(resultado.comissaoTotal)} />
              <CelulaKpi rotulo="Receita da empresa" valor={formatarBRL(resultado.receitaEmpresa)} />
            </div>
          </div>
          {resultado.producaoTotal > 0 && (
            <p className="mt-1.5 text-[12px] text-[#7C7469]">
              Valor de referência da produção: {formatarBRL(resultado.producaoTotal)}
            </p>
          )}

          {resultado.fichasTotal <= 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-[#E5DCC3] px-4 py-3 text-[13px] text-[#7C7469]">
              Nenhuma ficha de Club no período. O pote fica parado: sem produção
              não há quem divida.
            </p>
          ) : (
            <>
              {/* ------------------------------------------ TABELA */}
              <div className="mt-5 overflow-x-auto border border-[#E5DCC3]">
                <table className="w-full min-w-[640px] border-collapse text-sm">
<thead>
                    <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-left">
                      <th className="px-3 py-2 font-semibold text-[#3A352C]">Profissional</th>
                      <th className="px-3 py-2 text-right font-semibold text-[#3A352C]">Fichas</th>
                      <th className="px-3 py-2 text-right font-semibold text-[#3A352C]">Participação</th>
                      <th className="px-3 py-2 text-right font-semibold text-[#3A352C]">
                        Parcela do Pote
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-[#8A6A14]">
                        Comissão {Math.round(resultado.comissaoPercentual * 100)}%
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.partes.map((p) => (
                      <tr
                        key={p.profissional}
                        className="cursor-pointer border-b border-[#EFEAE0] last:border-0 hover:bg-[#FAF6EB]"
                        onClick={() =>
                          setDetalhe({ nome: p.profissional, id: p.profissionalId })
                        }
                      >
                        <td className="px-3 py-2 font-medium text-[#121110]">{p.profissional}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.fichas}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#3A352C]">
                          {p.participacao.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          %
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#121110]">
                          {formatarBRL(p.valor)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-[#8A6A14]">
                          {formatarBRL(p.comissao)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#E5DCC3] bg-[#FAF6EB] font-semibold">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{resultado.fichasTotal}</td>
                      <td className="px-3 py-2 text-right tabular-nums">100,00%</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarBRL(resultado.somaPartes)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#8A6A14]">
                        {formatarBRL(resultado.comissaoTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* A soma tem de bater com o pote, no centavo (item 27). */}
              {Math.abs(resultado.somaPartes - resultado.pote) > 0.001 && (
                <p role="alert" className="mt-2 text-[13px] text-red-700">
                  Atenção: a soma das partes ({formatarBRL(resultado.somaPartes)}) não
                  bate com o pote ({formatarBRL(resultado.pote)}). Não feche o
                  período até o cálculo do servidor corrigir.
                </p>
              )}

              {calculo?.jaFechado ? (
                <p className="mt-4 rounded-lg border border-[#BFE0B2] bg-[#E9F5E4] px-4 py-3 text-[13px] text-[#3F6B33]">
                  Este período já está fechado. O resultado abaixo é o cálculo
                  atual; o valor oficial é o do fechamento registrado no
                  histórico.
                </p>
              ) : (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setConfirmando(true)}
                    disabled={!poteAtivo}
                    className="rounded-lg bg-[#C9A24A] px-5 py-2.5 text-sm font-semibold text-[#121110] transition-colors hover:bg-[#A8842C] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    FECHAR PERÍODO
                  </button>
                  <p className="mt-2 text-[12px] text-[#7C7469]">
                    Fechar grava receita, pote, produção e a parte de cada
                    profissional — com a comissão e a receita da empresa — como
                    registro imutável, com auditoria.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ------------------------------------- RELATÓRIO (item 23) */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CelulaKpi rotulo="Receita Club" valor={formatarBRL(resultado.receita)} />
            <CelulaKpi rotulo="Pote" valor={formatarBRL(resultado.pote)} />
            <CelulaKpi rotulo="Benefícios utilizados" valor={`${resultado.utilizacao} atendimentos`} />
            <CelulaKpi rotulo="Atendimentos avulso" valor={`${resultado.atendimentosAvulso} atendimentos`} />
          </div>
        </>
      )}

      {/* ------------------------------------------ DETALHAMENTO */}
      {detalhe && resultado && (
        <div className="mt-6 rounded-lg border border-[#E5DCC3] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[#121110]">
                Produção de {detalhe.nome}
              </h2>
              <p className="mt-1 text-[12.5px] text-[#7C7469]">
                {parte?.fichas ?? 0} fichas · {parte?.participacao.toFixed(2) ?? '0,00'}% ·{' '}
                {formatarBRL(parte?.valor ?? 0)} a receber · referência{' '}
                {formatarBRL(parte?.producaoReferencia ?? 0)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetalhe(null)}
              className="text-[13px] font-medium text-[#8A6A14] hover:underline"
            >
              Fechar
            </button>
          </div>

          {Object.keys(resultado.porServico).length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {Object.entries(resultado.porServico).map(([servico, dados]) => (
                <li
                  key={servico}
                  className="rounded-full border border-[#E5DCC3] px-3 py-1 text-[12px] text-[#3A352C]"
                >
                  {servico}: <strong>{dados.atendimentos}</strong> ·{' '}
                  {formatarBRL(dados.producaoReferencia)}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#E5DCC3] text-left text-[#3A352C]">
                  <th className="px-2 py-1.5 font-semibold">Data</th>
                  <th className="px-2 py-1.5 font-semibold">Cliente</th>
                  <th className="px-2 py-1.5 font-semibold">Serviço</th>
                  <th className="px-2 py-1.5 font-semibold">Plano</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Tabela</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Pago</th>
                </tr>
              </thead>
              <tbody>
                {atendimentosDetalhe.map((f) => (
                  <tr key={f.id ?? `${f.data}-${f.horario}-${f.servico}`} className="border-b border-[#EFEAE0] last:border-0">
                    <td className="px-2 py-1.5 tabular-nums text-[#3A352C]">
                      {dataCurta(f.data)} {f.horario}
                    </td>
                    <td className="px-2 py-1.5 text-[#121110]">{f.cliente}</td>
                    <td className="px-2 py-1.5 text-[#3A352C]">{f.servico}</td>
                    <td className="px-2 py-1.5 text-[#3A352C]">
                      {servicoCobertoPeloPlano('', f.plano, {})
                        ? 'Club'
                        : normalizarTexto(f.plano) || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatarBRL(f.valorTabela)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatarBRL(f.valorPago)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------------------------------------- HISTÓRICO */}
      {fechados.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[15px] font-semibold text-[#121110]">
            Fechamentos do pote
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {fechados.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5DCC3] bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-[#121110]">
                    {dataCurta(f.periodoInicio)} até {dataCurta(f.periodoFim)} ·{' '}
                    {formatarBRL(f.pote)} · {f.fichasTotal} fichas
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#7C7469]">
                    {formatarBRL(f.receita)} de receita · comissão{' '}
                    {Math.round((f.comissaoPercentual ?? 0) * 100)}% (
                    {formatarBRL(f.comissaoTotal)}) · empresa{' '}
                    {formatarBRL(f.receitaEmpresa)} · fechado em{' '}
                    {dataCurta(f.fechadoEm.slice(0, 10))}
                    {f.fechadoPor ? ` por ${f.fechadoPor}` : ''}
                    {f.reaberto ? ' · REABERTO' : ''}
                  </p>
                </div>
                {f.reaberto ? (
                  <span className="text-[12px] font-semibold text-amber-700">
                    Reaberto: {f.reaberto.motivo}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReabrindo(f)}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-[12.5px] font-medium text-red-700 transition-colors hover:bg-red-50"
                  >
                    Reabrir
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmando && (
        <ConfirmarModal
          titulo="Fechar o período?"
          texto={`O pote de ${formatarBRL(resultado?.pote ?? 0)} entre ${dataCurta(
            periodo.inicio,
          )} e ${dataCurta(periodo.fim)} será gravado como registro imutável, com auditoria. Depois disso o resultado não muda sozinho: correção exige reabrir com motivo.`}
          rotuloConfirmar="Fechar período"
          onFechar={() => setConfirmando(false)}
          onConfirmar={() => void confirmarFechamento()}
        />
      )}

      {reabrindo && (
        <ConfirmarModal
          titulo="Reabrir o fechamento?"
          texto="O cálculo original fica no histórico. As fichas do período voltam a ser distribuíveis no próximo fechamento."
          motivoObrigatorio
          rotuloConfirmar="Reabrir"
          onFechar={() => setReabrindo(null)}
          onConfirmar={(motivo) => void confirmarReabertura(motivo ?? '')}
        />
      )}
    </div>
  )
}