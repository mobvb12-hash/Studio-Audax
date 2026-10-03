import { useEffect, useState } from 'react'
import { formatarBRL } from '@/lib/moeda'
import { hojeISO } from '@/modules/agenda/catalogo'
import {
  avisoDoStatus,
  beneficioLiberado,
  beneficiosDoPlano,
  normalizarBeneficios,
  rotuloDoPlano,
  STATUS_CLIENTE_ROTULO,
  statusDoCliente,
  type BeneficiosPublicos,
  type StatusParaCliente,
} from '@/modules/painel/clube'
import {
  carregarBeneficiosClube,
  carregarMeuClube,
  type ClubePagamentoPainel,
  type ClubePainel,
} from '@/services/supabase/painel'
import { formatarDataBR } from '../dashboard'

type Estado = { fase: 'carregando' } | { fase: 'erro'; mensagem: string }

const FORMAS_ROTULO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  pix_integrado: 'Pix integrado',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  outro: 'Outro',
}

function rotuloForma(forma: string): string {
  return FORMAS_ROTULO[forma] ?? forma
}

function LinhaPagamento({ pagamento }: { pagamento: ClubePagamentoPainel }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-[13px]">
      <span className="text-noir-700">
        {formatarDataBR(pagamento.data)} · {rotuloForma(pagamento.formaPagamento)}
      </span>
      <span className="font-medium text-noir-900">
        {formatarBRL(pagamento.valor)}
      </span>
    </li>
  )
}

/** A etiqueta do status com a cor que combina com o que ele significa. */
function etiquetaStatus(status: StatusParaCliente): string {
  const base =
    'shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold tracking-[0.06em] uppercase'
  if (status === 'ativo') {
    return `${base} border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]`
  }
  if (status === 'em_atraso') {
    return `${base} border-orange-300 bg-orange-50 text-orange-700`
  }
  if (status === 'expirado') {
    return `${base} border-red-200 bg-red-50 text-red-600`
  }
  return `${base} border-slate-300 bg-slate-100 text-slate-600}`
}

/**
 * Aba Clube do painel do cliente: a PRÓPRIA assinatura e os PRÓPRIOS
 * pagamentos, lidos pela RPC `painel_clube_minha` (020) — as tabelas do
 * Club continuam intocadas com a política da área admin, e o painel nunca
 * consulta as tabelas direto (posse garantida na RPC).
 *
 * O status mostrado é o do CLIENTE (Ativo / Em atraso / Cancelado / Expirado)
 * e a lista de benefícios vem da configuração oficial da casa (034). O
 * "libera ou não libera" NÃO é decidido aqui: vem de `beneficioLiberado`, que
 * é a mesma condição que o backend aplica no atendimento.
 */
export default function PainelClube() {
  const [estado, setEstado] = useState<Estado | null>({ fase: 'carregando' })
  const [clube, setClube] = useState<ClubePainel | null>(null)
  const [beneficios, setBeneficios] = useState<BeneficiosPublicos | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    // O conteúdo público do Clube vem em paralelo e nunca derruba a tela:
    // se falhar, o plano continua aparecendo, só sem a lista detalhada.
    // A normalização é aqui, não no serviço: a tela é quem conhece a forma.
    void carregarBeneficiosClube()
      .then((bruto) => {
        if (vivo) setBeneficios(normalizarBeneficios(bruto))
      })
      .catch(() => undefined)
    carregarMeuClube()
      .then((meu) => {
        if (!vivo) return
        setClube(meu)
        setEstado(null)
      })
      .catch((erro: unknown) => {
        if (!vivo) return
        setEstado({
          fase: 'erro',
          mensagem:
            erro instanceof Error && erro.message
              ? erro.message
              : 'Não foi possível carregar o Clube.',
        })
      })
    return () => {
      vivo = false
    }
  }, [tentativa])

  if (estado?.fase === 'erro') {
    return (
      <div className="rounded-xl border border-cream-300 bg-white p-6 text-center">
        <p role="alert" className="text-sm text-red-700">
          {estado.mensagem}
        </p>
        <button
          type="button"
          onClick={() => {
            setEstado({ fase: 'carregando' })
            setTentativa((atual) => atual + 1)
          }}
          className="mt-4 rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium text-noir-700 hover:border-gold-700"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  if (estado !== null) {
    return (
      <p className="py-10 text-center text-sm text-noir-500">
        Carregando seu Clube…
      </p>
    )
  }

  if (clube === null) {
    return (
      <div className="space-y-6">
        <header className="text-center">
          <h1 className="text-[22px] font-bold text-noir-900">
            Clube Audax
          </h1>
          <div
            className="mx-auto mt-3 h-px w-16 bg-gold-700"
            aria-hidden="true"
          />
        </header>
        <div className="rounded-xl border border-dashed border-cream-300 bg-white p-6 text-center">
          <p className="text-sm text-noir-500">
            Você ainda não tem uma assinatura do Clube Audax.
          </p>
          <p className="mt-2 text-sm text-noir-500">
            As assinaturas são feitas direto no Studio — fale com a equipe
            para fazer parte.
          </p>
        </div>
      </div>
    )
  }

  const { assinatura } = clube
  const hoje = hojeISO()
  const status = statusDoCliente(assinatura, hoje)
  const liberado = beneficioLiberado(assinatura, hoje)
  const lista = beneficiosDoPlano(assinatura.plano, beneficios)

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="font-serif-display text-[24px] leading-tight font-semibold text-noir-900">
          Meu Audax Club
        </h1>
        <div
          className="mx-auto mt-3 h-px w-16 bg-gold-700"
          aria-hidden="true"
        />
      </header>

      <section className="rounded-xl border border-cream-300 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-noir-900">
              Plano: {rotuloDoPlano(assinatura.plano, beneficios ?? undefined)}
            </p>
            <p className="mt-0.5 text-[13px] text-noir-500">
              Mensalidade de {formatarBRL(assinatura.valorMensal)}
            </p>
          </div>
          <span className={etiquetaStatus(status)}>
            {STATUS_CLIENTE_ROTULO[status]}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-noir-500">Assinante desde</dt>
            <dd className="mt-0.5 font-medium text-noir-900">
              {formatarDataBR(assinatura.dataAssinatura)}
            </dd>
          </div>
          <div>
            <dt className="text-noir-500">
              {status === 'cancelado' ? 'Cancelado em' : 'Válido até'}
            </dt>
            <dd className="mt-0.5 font-medium text-noir-900">
              {status === 'cancelado' && assinatura.canceladaEm
                ? formatarDataBR(assinatura.canceladaEm)
                : formatarDataBR(assinatura.proximoVencimento)}
            </dd>
          </div>
        </dl>

        {assinatura.cancelada && (
          <p className="mt-4 rounded-lg bg-cream-50 px-3 py-2 text-[13px] text-noir-700">
            {assinatura.motivoCancelamento
              ? `Motivo: ${assinatura.motivoCancelamento}.`
              : 'Este plano foi cancelado.'}
          </p>
        )}
      </section>

      {/* Benefícios: o que o plano oferece, e o que está liberado agora. */}
      <section className="rounded-xl border border-cream-300 bg-white p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gold-700">
          Benefícios
        </h2>
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-[13px] ${
            liberado
              ? 'bg-cream-50 text-noir-700'
              : 'bg-orange-50 text-orange-800'
          }`}
        >
          {avisoDoStatus(status)}
        </p>
        {lista.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {lista.map((item) => (
              <li
                key={item}
                className={`flex items-start gap-2 text-[14px] ${
                  liberado ? 'text-noir-800' : 'text-noir-400 line-through'
                }`}
              >
                <span aria-hidden="true" className="mt-0.5 text-gold-600">
                  {liberado ? '✓' : '–'}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-noir-500">
            Os benefícios deste plano são definidos pela equipe. Fale com a gente
            para saber mais.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gold-700">
          Últimos pagamentos
        </h2>
        {clube.pagamentos.length === 0 ? (
          <p className="mt-2 text-sm text-noir-500">
            Nenhum pagamento registrado até agora.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-cream-300 rounded-xl border border-cream-300 bg-white px-4">
            {clube.pagamentos.map((pagamento) => (
              <LinhaPagamento
                key={`${pagamento.data}-${pagamento.valor}-${pagamento.formaPagamento}`}
                pagamento={pagamento}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
