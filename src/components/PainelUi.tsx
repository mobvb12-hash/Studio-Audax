import { dataCurta } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'

/**
 * Blocos visuais compartilhados por páginas de painel/relatório
 * (Financeiro, Relatórios, Caixa, Dashboard).
 *
 * Somente apresentação: nenhuma regra de negócio aqui.
 */

export function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
      {texto}
    </div>
  )
}

export function Cartao({
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

export function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
      <h2 className="text-[15px] font-bold text-[#1C1A15]">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function CelulaKpi({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="min-w-[150px] flex-1 px-4 py-4">
      <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
        {rotulo}
      </p>
      <p
        className={`mt-1.5 text-[22px] leading-none font-bold ${
          destaque ? 'text-[#6B8E5A]' : 'text-[#8A6A14]'
        }`}
      >
        {valor}
      </p>
    </div>
  )
}

export function LinhaDetalhe({
  rotulo,
  valor,
}: {
  rotulo: string
  valor: string
}) {
  return (
    <div className="flex items-center justify-between border-t border-[#EFE7D3] py-2 text-sm first:border-t-0">
      <span className="text-[#4A4436]">{rotulo}</span>
      <span className="font-semibold text-[#1C1A15]">{valor}</span>
    </div>
  )
}

export function BarraEvolucao({
  dias,
}: {
  dias: { data: string; receita: number; despesa: number }[]
}) {
  const maximo = Math.max(1, ...dias.map((d) => Math.max(d.receita, d.despesa)))
  return (
    <ul className="mt-3 divide-y divide-[#EFE7D3]">
      {dias.map((d) => (
        <li
          key={d.data}
          className="flex items-center gap-3 py-2 text-[13px]"
        >
          <span className="w-20 shrink-0 text-[#8A8171]">
            {dataCurta(d.data)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <div
                className="h-2 rounded-full bg-[#8A6A14]"
                style={{ width: `${(d.receita / maximo) * 100}%` }}
                aria-hidden="true"
              />
              <span className="shrink-0 font-medium text-[#1C1A15]">
                {formatarBRL(d.receita)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-2 rounded-full bg-red-300"
                style={{ width: `${(d.despesa / maximo) * 100}%` }}
                aria-hidden="true"
              />
              <span className="shrink-0 text-xs text-[#8A8171]">
                {formatarBRL(d.despesa)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
