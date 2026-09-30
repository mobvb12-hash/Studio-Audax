import { ROTULO_FORM as rotulo, formatarISO } from '@/lib/apresentacao'
import { useEffect, useState } from 'react'
import type { Agendamento } from '@/modules/agenda/types'
import { useComissoesOpcional } from '@/modules/comissoes/store'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_ROTULO, type Lancamento } from '@/modules/caixa/types'
import { useClientes } from '@/modules/clientes/store'
import { assinaturaVigente } from '@/modules/clube/regras'
import { useClube } from '@/modules/clube/store'
import { PLANOS_ROTULO } from '@/modules/clube/types'
import { useEstoque } from '@/modules/estoque/store'
import { formatarBRL, normalizarTexto } from '@/lib/moeda'

/** Motivos de reabertura oferecidos na confirmação (mais "Outro" livre). */
const MOTIVOS_REABERTURA = [
  'Produto não lançado',
  'Serviço não lançado',
  'Correção de desconto',
  'Correção de pagamento',
]

type Props = {
  agendamento: Agendamento
  onFechar: () => void
}

/**
 * Ver Fechamento de Conta — leitura + REABERTURA (Fase 11.2).
 *
 * Reconstrói o fechamento de um atendimento a partir do lançamento do Caixa
 * ligado por `agendamentoId` (vínculo exato). Em modo leitura não cria, não
 * altera e não exclui nada.
 *
 * "Reabrir Conta" segue o modelo seguro: exige motivo, estorna o fechamento
 * ativo (primitiva existente — preserva o histórico), devolve a baixa de
 * estoque das vendas vinculadas (idempotente) e grava auditoria `reabertura`
 * com motivo. O atendimento volta a ficar em aberto para novo fechamento.
 */
export default function VerFechamentoModal({ agendamento, onFechar }: Props) {
  const { lancamentos, auditoria, reabrirConta, vincularVenda } = useCaixa()
  const { reverterVenda } = useEstoque()
  const { fechamentos: comissoes } = useComissoesOpcional()
  const { porId, porNome } = useClientes()
  const { assinaturas } = useClube()

  const [reabrindo, setReabrindo] = useState(false)
  const [motivoEscolha, setMotivoEscolha] = useState('')
  const [motivoTexto, setMotivoTexto] = useState('')
  const [erroReabertura, setErroReabertura] = useState('')
  const [erroVinculo, setErroVinculo] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  // Fechamento deste atendimento: o lançamento ativo tem prioridade; um
  // estornado entra apenas como histórico (nunca é editado por esta tela).
  const doAtendimento = lancamentos.filter(
    (l) => l.origem === 'atendimento' && l.agendamentoId === agendamento.id,
  )
  const lancamento: Lancamento | undefined =
    doAtendimento.find((l) => !l.estornado) ??
    doAtendimento[doAtendimento.length - 1]
  // Todos os fechamentos estornados deste atendimento (histórico preservado)
  const historicos = doAtendimento.filter((l) => l.estornado)

  // Eventos de reabertura DESTA conta — identificação exata no fim da
  // descrição (`… atendimento <id>`), imune a ids parecidos (endsWith).
  const eventosReabertura = auditoria
    .filter(
      (e) =>
        e.acao === 'reabertura' &&
        e.descricao.endsWith(`atendimento ${agendamento.id}`),
    )
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))

  const motivoDe = (escorpo: Lancamento): string | undefined => {
    if (!escorpo.estornado) return undefined
    return eventosReabertura.find(
      (e) => !escorpo.estornadoEm || e.criadoEm >= escorpo.estornadoEm,
    )?.motivo
  }
  const motivoDoEstornado = lancamento?.estornado ? motivoDe(lancamento) : undefined

  const cliente = lancamento?.clienteId
    ? (porId(lancamento.clienteId) ?? porNome(agendamento.cliente))
    : porNome(agendamento.cliente)

  const assinatura = assinaturas.find(
    (a) =>
      (lancamento?.clienteId !== undefined &&
        a.clienteId === lancamento.clienteId) ||
      normalizarTexto(a.cliente) === normalizarTexto(agendamento.cliente),
  )
  // Plano: só quando o valor efetivo é R$ 0,00 E há assinatura vigente na
  // data do atendimento. Exibição informativa — nunca gera cobrança.
  const peloPlano =
    lancamento !== undefined &&
    lancamento.valorLiquido === 0 &&
    assinatura !== undefined &&
    assinaturaVigente(assinatura, agendamento.data)

  const telefone = agendamento.telefone || cliente?.telefone
  const email = cliente?.email

  // Vendas de produto VINCULADAS a esta conta (o fechamento novo grava
  // `agendamentoId`; sem vínculo ficam fora — nenhum é inferido). No
  // histórico estornado os produtos não são itemizados: sem vínculo de
  // período, não é seguro atribuí-los a um fechamento específico.
  const vendasVinculadas =
    lancamento !== undefined && !lancamento.estornado
      ? lancamentos.filter(
          (l) =>
            l.origem === 'produto' &&
            l.agendamentoId === agendamento.id &&
            !l.estornado,
        )
      : []
  const somaProdutos = vendasVinculadas.reduce(
    (acc, l) => ({
      valor: acc.valor + l.valor,
      desconto: acc.desconto + l.desconto,
      liquido: acc.liquido + l.valorLiquido,
    }),
    { valor: 0, desconto: 0, liquido: 0 },
  )
  // Totais da conta exibidos: serviço + produtos vinculados (0 sem vínculo)
  const totalValor = (lancamento?.valor ?? 0) + somaProdutos.valor
  const totalDesconto = (lancamento?.desconto ?? 0) + somaProdutos.desconto
  const totalLiquido =
    (lancamento?.valorLiquido ?? 0) + somaProdutos.liquido

  // Vendas de produto do mesmo cliente no mesmo dia SEM vínculo com este
  // atendimento: ficam FORA da conta — mas podem ser vinculadas aqui (§5.2).
  const vendasNoDia =
    lancamento !== undefined
      ? lancamentos.filter(
          (l) =>
            l.origem === 'produto' &&
            !l.estornado &&
            l.data === lancamento.data &&
            l.agendamentoId !== agendamento.id &&
            (lancamento.clienteId !== undefined
              ? l.clienteId === lancamento.clienteId
              : normalizarTexto(l.cliente ?? '') ===
                normalizarTexto(lancamento.cliente ?? '')),
        )
      : []
  // Só vendas SEM dono entram como candidatas — as já ligadas a outro
  // atendimento aparecem apenas como aviso (nunca são reatribuídas aqui).
  const candidatas = vendasNoDia.filter((v) => !v.agendamentoId)
  const deOutroAtendimento = vendasNoDia.filter((v) => v.agendamentoId)

  // §5.1 — multi-serviço: itens detalhados quando o fechamento novo gravou
  // a lista; fechamento legado (sem `servicos`) segue com a linha única de
  // sempre, já com o desconto exibido nela.
  const itensServico =
    lancamento?.servicos && lancamento.servicos.length > 1
      ? lancamento.servicos
      : null

  function vincular(vendaId: string) {
    setErroVinculo('')
    try {
      // Não-destrutivo: só cria o vínculo + auditoria `vinculo` (§5.2)
      vincularVenda(vendaId, agendamento.id)
    } catch (e) {
      setErroVinculo(
        e instanceof Error ? e.message : 'Não foi possível vincular a venda.',
      )
    }
  }

  // Trava de comissão (regra 6): se já existe fechamento ATIVO de comissão
  // cobrindo a data deste lançamento para o mesmo profissional, a reabertura
  // mudaria a produção depois de a comissão ter sido fechada — bloqueia e
  // orienta (não contorna a trava; a saída é reabrir a comissão primeiro).
  const conflitoComissao =
    lancamento !== undefined && !lancamento.estornado
      ? comissoes.find(
          (f) =>
            !f.reaberto &&
            normalizarTexto(f.profissionalNome) ===
              normalizarTexto(
                lancamento.profissional ?? agendamento.profissional,
              ) &&
            f.periodo.inicio <= lancamento.data &&
            f.periodo.fim >= lancamento.data,
        )
      : undefined

  const motivoFinal =
    motivoEscolha === 'outro' ? motivoTexto.trim() : motivoEscolha
  const motivoValido = motivoFinal.length >= 3

  function cancelarReabertura() {
    setReabrindo(false)
    setMotivoEscolha('')
    setMotivoTexto('')
    setErroReabertura('')
  }

  function confirmarReabertura() {
    if (conflitoComissao || !motivoValido) return
    try {
      reabrirConta(agendamento.id, motivoFinal, (vendas) => {
        for (const venda of vendas) reverterVenda(venda)
      })
      cancelarReabertura()
    } catch (e) {
      setErroReabertura(
        e instanceof Error ? e.message : 'Não foi possível reabrir a conta.',
      )
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              FECHAMENTO DE CONTA
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#1C1A15]">
              {agendamento.cliente}
            </h2>
            <p className="text-[13px] text-[#8A8171]">
              {telefone ? `${telefone} · ` : ''}
              {agendamento.profissional} · {agendamento.horario}
            </p>
            <p className="text-[13px] text-[#8A8171]">
              {agendamento.servico} · {agendamento.data}
            </p>
            {email && <p className="text-[13px] text-[#8A8171]">{email}</p>}
            {lancamento && (
              <p className="mt-1 text-[12px] text-[#4A4436]">
                Fechado em {formatarISO(lancamento.criadoEm)}
              </p>
            )}
          </div>
        </div>

        {!lancamento ? (
          <>
            <p className="mt-4 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-3 py-2 text-center text-sm text-[#A99E85]">
              Nenhum fechamento registrado para este atendimento.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onFechar}
                className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
              >
                Voltar
              </button>
            </div>
          </>
        ) : (
          <>
            {lancamento.estornado && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                <p className="font-semibold">FECHAMENTO ESTORNADO</p>
                <p className="text-xs">
                  {lancamento.estornadoEm
                    ? `Estornado em ${formatarISO(lancamento.estornadoEm)} — `
                    : ''}
                  valores históricos preservados. Visualização somente leitura.
                  Este fechamento não permite nova reabertura.
                </p>
                {motivoDoEstornado && (
                  <p className="mt-1 text-xs">
                    Motivo da reabertura: {motivoDoEstornado}
                  </p>
                )}
              </div>
            )}

            {peloPlano && (
              <div className="mt-3 rounded-lg border border-[#BFE0B2] bg-[#E9F5E4] px-3 py-2 text-[13px] text-[#3F6B33]">
                <p className="font-semibold">
                  Atendimento realizado pelo plano Audax Club
                </p>
                <p className="text-xs">
                  Coberto pela assinatura
                  {assinatura ? ` — plano ${PLANOS_ROTULO[assinatura.plano]}` : ''}
                  . Valor efetivo R$ 0,00 — sem cobrança adicional.
                </p>
              </div>
            )}

            <div className="mt-4 border-t border-[#EFE7D3] pt-4">
              <p className={rotulo}>Itens da conta</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-[#E5DCC3]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#FAF6EB] text-[11px] tracking-wide text-[#8A8171] uppercase">
                      <th className="px-2 py-1.5 text-left font-semibold">
                        Item
                      </th>
                      <th className="px-2 py-1.5 text-right font-semibold">
                        Preço
                      </th>
                      <th className="px-2 py-1.5 text-right font-semibold">
                        Desconto
                      </th>
                      <th className="px-2 py-1.5 text-right font-semibold">
                        A pagar
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE7D3]">
                    {itensServico ? (
                      itensServico.map((s, idx) => (
                        <tr key={`${s.servicoId ?? 'sv'}-${idx}`}>
                          <td className="px-2 py-2 text-[#1C1A15]">
                            Serviço · {s.servico}
                          </td>
                          <td className="px-2 py-2 text-right text-[#4A4436]">
                            {formatarBRL(s.preco)}
                          </td>
                          <td className="px-2 py-2 text-right text-xs text-[#A99E85]">
                            —
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-[#1C1A15]">
                            {formatarBRL(s.preco)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-2 py-2 text-[#1C1A15]">
                          Serviço · {lancamento.servico ?? agendamento.servico}
                        </td>
                        <td className="px-2 py-2 text-right text-[#4A4436]">
                          {formatarBRL(lancamento.valor)}
                        </td>
                        <td className="px-2 py-2 text-right text-[#4A4436]">
                          − {formatarBRL(lancamento.desconto)}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-[#1C1A15]">
                          {formatarBRL(lancamento.valorLiquido)}
                        </td>
                      </tr>
                    )}
                    {vendasVinculadas.map((v) => (
                      <tr key={v.id}>
                        <td className="px-2 py-2 text-[#1C1A15]">
                          Produto · {v.produto ?? 'item'}
                          {v.quantidade ? ` ×${v.quantidade}` : ''}
                        </td>
                        <td className="px-2 py-2 text-right text-[#4A4436]">
                          {formatarBRL(v.valor)}
                        </td>
                        <td className="px-2 py-2 text-right text-[#4A4436]">
                          − {formatarBRL(v.desconto)}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-[#1C1A15]">
                          {formatarBRL(v.valorLiquido)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 rounded-lg border border-[#E5DCC3] bg-[#FAF6EB]/60 px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-[#8A8171]">Subtotal</span>
                  <span className="font-medium text-[#4A4436]">
                    {formatarBRL(totalValor)}
                  </span>
                </div>
                {vendasVinculadas.length > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-[#8A8171]">Produtos</span>
                    <span className="font-medium text-[#4A4436]">
                      {formatarBRL(somaProdutos.liquido)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-[#8A8171]">Descontos</span>
                  <span className="font-medium text-[#6B8E5A]">
                    − {formatarBRL(totalDesconto)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between gap-3 border-t border-[#E5DCC3] pt-1">
                  <span className="font-semibold text-[#1C1A15]">
                    Total final
                  </span>
                  <span className="font-bold text-[#8A6A14]">
                    {formatarBRL(totalLiquido)}
                  </span>
                </div>
              </div>

              {/* §5.2 — vendas antigas sem dono: vincular sem destruir nada */}
              {!lancamento.estornado && candidatas.length > 0 && (
                <div className="mt-3 rounded-lg border border-[#E5DCC3] bg-[#FAF6EB]/60 px-3 py-2 text-sm">
                  <p className="text-[11px] font-semibold tracking-wide text-[#8A8171] uppercase">
                    Vendas deste dia sem vínculo
                  </p>
                  <p className="mt-0.5 text-xs text-[#A99E85]">
                    Vincular só liga a venda à conta e grava auditoria — valor,
                    receita, estoque e caixa não mudam.
                  </p>
                  {candidatas.map((v) => (
                    <div
                      key={v.id}
                      className="mt-1.5 flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0 truncate text-[#4A4436]">
                        {v.descricao} · {formatarBRL(v.valorLiquido)}
                      </span>
                      <button
                        type="button"
                        onClick={() => vincular(v.id)}
                        className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-semibold text-[#4A4436] hover:bg-[#F3ECDA]"
                      >
                        Vincular à conta
                      </button>
                    </div>
                  ))}
                  {erroVinculo && (
                    <p className="mt-2 text-xs font-medium text-red-700">
                      {erroVinculo}
                    </p>
                  )}
                </div>
              )}

              <p className="mt-2 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-3 py-2 text-xs text-[#A99E85]">
                {vendasVinculadas.length > 0
                  ? 'Produtos vinculados a esta conta: a baixa de estoque acontece no fechamento e é devolvida (idempotente) na reabertura.'
                  : lancamento.estornado
                    ? 'Itens de produto não são exibidos no histórico estornado. Os totais acima consideram apenas o serviço.'
                    : `Itens de produto não são exibidos: a venda antiga não guarda vínculo com o atendimento.${
                        candidatas.length > 0
                          ? ` Use "Vincular à conta" acima para ligar ${candidatas.length} venda(s) de ${lancamento.cliente} em ${lancamento.data}.`
                          : ''
                      }${deOutroAtendimento.length > 0 ? ` ${deOutroAtendimento.length} venda(s) do dia já pertencem a outro atendimento.` : ''} Os totais acima consideram apenas o serviço.`}
              </p>
            </div>

            <div className="mt-4 border-t border-[#EFE7D3] pt-4">
              <p className={rotulo}>Pagamento</p>
              <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8A8171]">Forma de pagamento</dt>
                  <dd className="font-medium text-[#1C1A15]">
                    {FORMAS_ROTULO[lancamento.formaPagamento]}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8A8171]">Total pago</dt>
                  <dd className="font-semibold text-[#1C1A15]">
                    {formatarBRL(totalLiquido)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8A8171]">Recebido</dt>
                  <dd className="font-medium text-[#1C1A15]">
                    {lancamento.recebido !== undefined
                      ? formatarBRL(lancamento.recebido)
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8A8171]">Troco</dt>
                  <dd className="font-medium text-[#1C1A15]">
                    {formatarBRL(lancamento.troco ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8A8171]">Falta</dt>
                  <dd
                    className={
                      (lancamento.falta ?? 0) > 0
                        ? 'font-semibold text-red-700'
                        : 'font-medium text-[#1C1A15]'
                    }
                  >
                    {formatarBRL(lancamento.falta ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8A8171]">Gorjeta</dt>
                  <dd className="font-medium text-[#1C1A15]">
                    {formatarBRL(lancamento.gorjeta ?? 0)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-4 border-t border-[#EFE7D3] pt-4">
              <p className={rotulo}>Identificação</p>
              <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8A8171]">Data e hora do fechamento</dt>
                  <dd className="font-medium text-[#1C1A15]">
                    {formatarISO(lancamento.criadoEm)}
                  </dd>
                </div>
                {lancamento.observacao && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8A8171]">Comentário</dt>
                    <dd className="text-right font-medium text-[#1C1A15]">
                      {lancamento.observacao}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Histórico: fechamentos anteriores estornados/reabertos —
                permanecem visíveis, nunca mais podem ser reabertos. */}
            {historicos.length > 0 && !lancamento.estornado && (
              <div className="mt-4 border-t border-[#EFE7D3] pt-4">
                <p className={rotulo}>Histórico de fechamentos</p>
                {historicos.map((h) => (
                  <div
                    key={h.id}
                    className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm"
                  >
                    <div className="flex justify-between gap-3">
                      <span className="text-[#4A4436]">
                        Fechado em {formatarISO(h.criadoEm)}
                      </span>
                      <span className="font-semibold text-[#1C1A15]">
                        {formatarBRL(h.valorLiquido)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-red-700">
                      Estornado/Reaberto
                      {h.estornadoEm ? ` em ${formatarISO(h.estornadoEm)}` : ''}
                      — histórico preservado; não permite nova reabertura.
                    </p>
                    {motivoDe(h) && (
                      <p className="mt-0.5 text-xs text-red-700">
                        Motivo: {motivoDe(h)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {reabrindo && !lancamento.estornado ? (
              <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                <p className="font-semibold text-amber-800">
                  Reabrir conta deste atendimento?
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  O fechamento atual será estornado (histórico preservado,
                  nada é apagado), o estoque dos produtos da conta será
                  devolvido e o atendimento voltará a permitir edição e um novo
                  fechamento. A receita não é duplicada.
                </p>

                {conflitoComissao ? (
                  <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <p className="font-semibold">Reabertura bloqueada</p>
                    <p>
                      A comissão de {conflitoComissao.profissionalNome} já está
                      fechada para o período {conflitoComissao.periodo.inicio} a{' '}
                      {conflitoComissao.periodo.fim} — reabrir agora mudaria a
                      produção depois do fechamento da comissão. Reabra a
                      comissão antes de reabrir a conta.
                    </p>
                  </div>
                ) : (
                  <>
                    <label
                      htmlFor="reabrir-motivo"
                      className="mt-3 block text-xs font-semibold text-amber-900"
                    >
                      Motivo da reabertura *
                    </label>
                    <select
                      id="reabrir-motivo"
                      aria-label="Motivo da reabertura"
                      className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm text-[#1C1A15]"
                      value={motivoEscolha}
                      onChange={(e) => {
                        setMotivoEscolha(e.target.value)
                        setErroReabertura('')
                      }}
                    >
                      <option value="">Selecione o motivo</option>
                      {MOTIVOS_REABERTURA.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="outro">Outro</option>
                    </select>

                    {motivoEscolha === 'outro' && (
                      <>
                        <label
                          htmlFor="reabrir-motivo-texto"
                          className="mt-2 block text-xs font-semibold text-amber-900"
                        >
                          Descreva o motivo *
                        </label>
                        <textarea
                          id="reabrir-motivo-texto"
                          aria-label="Descreva o motivo da reabertura"
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm text-[#1C1A15]"
                          value={motivoTexto}
                          onChange={(e) => {
                            setMotivoTexto(e.target.value)
                            setErroReabertura('')
                          }}
                        />
                      </>
                    )}

                    {erroReabertura && (
                      <p className="mt-2 text-xs font-medium text-red-700">
                        {erroReabertura}
                      </p>
                    )}

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelarReabertura}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-[#4A4436] hover:bg-amber-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={confirmarReabertura}
                        disabled={!motivoValido}
                        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Confirmar reabertura
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {!lancamento.estornado && !reabrindo && (
                  <button
                    type="button"
                    onClick={() => {
                      setReabrindo(true)
                      setErroReabertura('')
                    }}
                    className="rounded-lg border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-200"
                  >
                    Reabrir Conta
                  </button>
                )}
                <button
                  type="button"
                  onClick={onFechar}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
                >
                  Voltar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
