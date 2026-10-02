import { useEffect, useState } from 'react'
import { formatarBRL } from '@/lib/moeda'
import { hojeISO } from '@/modules/agenda/catalogo'
import {
  statusAssinatura,
  statusClasse,
  STATUS_ROTULO,
} from '@/modules/clube/regras'
import {
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
      <span className="text-[#4A4436]">
        {formatarDataBR(pagamento.data)} · {rotuloForma(pagamento.formaPagamento)}
      </span>
      <span className="font-medium text-[#1C1A15]">
        {formatarBRL(pagamento.valor)}
      </span>
    </li>
  )
}

/**
 * Aba Clube do painel do cliente: a PRÓPRIA assinatura e os PRÓPRIOS
 * pagamentos, lidos pela RPC `painel_clube_minha` (020) — as tabelas do
 * Club continuam intocadas com a política da área admin, e o painel nunca
 * consulta as tabelas direto (posse garantida na RPC).
 */
export default function PainelClube() {
  const [estado, setEstado] = useState<Estado | null>({ fase: 'carregando' })
  const [clube, setClube] = useState<ClubePainel | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
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
      <div className="rounded-xl border border-[#E5DCC3] bg-white p-6 text-center">
        <p role="alert" className="text-sm text-red-700">
          {estado.mensagem}
        </p>
        <button
          type="button"
          onClick={() => {
            setEstado({ fase: 'carregando' })
            setTentativa((atual) => atual + 1)
          }}
          className="mt-4 rounded-lg border border-[#E5DCC3] px-4 py-2 text-sm font-medium text-[#4A4436] hover:border-[#8A6A14]"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  if (estado !== null) {
    return (
      <p className="py-10 text-center text-sm text-[#8A8171]">
        Carregando seu Clube…
      </p>
    )
  }

  if (clube === null) {
    return (
      <div className="space-y-6">
        <header className="text-center">
          <h1 className="text-[22px] font-bold text-[#1C1A15]">
            Clube Audax
          </h1>
          <div
            className="mx-auto mt-3 h-px w-16 bg-[#8A6A14]"
            aria-hidden="true"
          />
        </header>
        <div className="rounded-xl border border-dashed border-[#E5DCC3] bg-white p-6 text-center">
          <p className="text-sm text-[#8A8171]">
            Você ainda não tem uma assinatura do Clube Audax.
          </p>
          <p className="mt-2 text-sm text-[#8A8171]">
            As assinaturas são feitas direto no Studio — fale com a equipe
            para fazer parte.
          </p>
        </div>
      </div>
    )
  }

  const { assinatura } = clube
  const status = statusAssinatura(assinatura, hojeISO())

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-[22px] font-bold text-[#1C1A15]">
          Clube Audax
        </h1>
        <div
          className="mx-auto mt-3 h-px w-16 bg-[#8A6A14]"
          aria-hidden="true"
        />
      </header>

      <section className="rounded-xl border border-[#E5DCC3] bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[#1C1A15]">
              {clube.planoRotulo}
            </p>
            <p className="mt-0.5 text-[13px] text-[#8A8171]">
              Mensalidade de {formatarBRL(assinatura.valorMensal)}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-1 text-[12px] font-medium ${statusClasse(status)}`}
          >
            {STATUS_ROTULO[status]}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-[#8A8171]">Assinante desde</dt>
            <dd className="mt-0.5 font-medium text-[#1C1A15]">
              {formatarDataBR(assinatura.dataAssinatura)}
            </dd>
          </div>
          <div>
            <dt className="text-[#8A8171]">Próximo vencimento</dt>
            <dd className="mt-0.5 font-medium text-[#1C1A15]">
              {formatarDataBR(assinatura.proximoVencimento)}
            </dd>
          </div>
        </dl>

        {assinatura.cancelada && (
          <p className="mt-4 rounded-lg bg-[#FDFBF3] px-3 py-2 text-[13px] text-[#4A4436]">
            Cancelada em {formatarDataBR(assinatura.canceladaEm ?? '')}
            {assinatura.motivoCancelamento
              ? ` — ${assinatura.motivoCancelamento}`
              : ''}
            .
          </p>
        )}
      </section>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#8A6A14]">
          Últimos pagamentos
        </h2>
        {clube.pagamentos.length === 0 ? (
          <p className="mt-2 text-sm text-[#8A8171]">
            Nenhum pagamento registrado até agora.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#E5DCC3] rounded-xl border border-[#E5DCC3] bg-white px-4">
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
