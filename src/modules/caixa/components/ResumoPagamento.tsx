import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO, type FormaPagamento } from '@/modules/caixa/types'
import type { Cliente } from '@/modules/clientes/types'
import {
  statusAssinatura,
  STATUS_ROTULO,
} from '@/modules/clube/regras'
import type { AssinaturaClube } from '@/modules/clube/types'
import type { Profissional } from '@/modules/profissionais/types'

type Props = {
  subtotal: number
  descontoAssinante: number
  descontoTexto: string
  aoDesconto: (texto: string) => void
  total: number
  clientes: Cliente[]
  clienteId: string
  aoCliente: (clienteId: string) => void
  assinatura?: AssinaturaClube
  assinanteVigente: boolean
  hoje: string
  profissionais: Profissional[]
  profissional: string
  aoProfissional: (nome: string) => void
  forma: FormaPagamento | ''
  aoForma: (forma: FormaPagamento | '') => void
  erro: string
  sucesso: string
  caixaFechado: boolean
  temItens: boolean
  aoFinalizar: () => void
}

export default function ResumoPagamento({
  subtotal,
  descontoAssinante,
  descontoTexto,
  aoDesconto,
  total,
  clientes,
  clienteId,
  aoCliente,
  assinatura,
  assinanteVigente,
  hoje,
  profissionais,
  profissional,
  aoProfissional,
  forma,
  aoForma,
  erro,
  sucesso,
  caixaFechado,
  temItens,
  aoFinalizar,
}: Props) {
  return (
    <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
      <h2 className="text-[15px] font-bold text-[#1C1A15]">Pagamento</h2>

      <div className="mt-4 divide-y divide-[#EFE7D3]">
        <div className="flex items-center justify-between py-2 text-sm">
          <span className="text-[#4A4436]">Subtotal</span>
          <span className="font-semibold text-[#1C1A15]">
            {formatarBRL(subtotal)}
          </span>
        </div>
        {descontoAssinante > 0 && (
          <div className="flex items-center justify-between py-2 text-sm">
            <span className="text-[#4A4436]">
              Desconto assinante Audax Club (10%)
            </span>
            <span className="font-semibold text-[#6B8E5A]">
              − {formatarBRL(descontoAssinante)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 py-2 text-sm">
          <label className="text-[#4A4436]" htmlFor="pdv-desconto">
            Desconto (R$)
          </label>
          <input
            id="pdv-desconto"
            className="w-28 rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-right text-sm outline-none focus:border-[#8A6A14]"
            inputMode="decimal"
            value={descontoTexto}
            onChange={(e) => aoDesconto(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between py-2 text-sm">
          <span className="font-bold text-[#1C1A15]">Total da venda</span>
          <span className="text-lg leading-none font-bold text-[#8A6A14]">
            {formatarBRL(total)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div>
          <label className={rotulo} htmlFor="pdv-cliente">
            Cliente (opcional)
          </label>
          <select
            id="pdv-cliente"
            className={campo}
            value={clienteId}
            onChange={(e) => aoCliente(e.target.value)}
          >
            <option value="">Sem cliente</option>
            {clientes
              .filter((c) => c.ativo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
          {assinatura && assinanteVigente && (
            <p className="mt-1.5 text-xs font-medium text-[#3F6B33]">
              ✓ Assinante {STATUS_ROTULO[statusAssinatura(assinatura, hoje)]}{' '}
              — desconto de 10% aplicado.
            </p>
          )}
          {assinatura && !assinanteVigente && (
            <p className="mt-1.5 text-xs font-medium text-orange-700">
              Assinatura {STATUS_ROTULO[statusAssinatura(assinatura, hoje)].toLowerCase()}{' '}
              — sem desconto de assinante.
            </p>
          )}
        </div>
        <div>
          <label className={rotulo} htmlFor="pdv-profissional">
            Profissional (opcional)
          </label>
          <select
            id="pdv-profissional"
            className={campo}
            value={profissional}
            onChange={(e) => aoProfissional(e.target.value)}
          >
            <option value="">— Venda na loja —</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.nome}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="pdv-forma">
            Forma de pagamento *
          </label>
          <select
            id="pdv-forma"
            className={campo}
            value={forma}
            onChange={(e) => aoForma(e.target.value as FormaPagamento | '')}
          >
            <option value="">Selecione...</option>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f} value={f}>
                {FORMAS_ROTULO[f]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-[13px] text-green-700">
          {sucesso}
        </p>
      )}

      <button
        type="button"
        onClick={aoFinalizar}
        disabled={caixaFechado || !temItens}
        className="mt-4 w-full rounded-lg bg-[#8A6A14] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#6F550F] disabled:cursor-not-allowed disabled:bg-[#C9BC94]"
      >
        Finalizar venda
      </button>
    </section>
  )
}
