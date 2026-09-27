import { Cartao, Vazio } from '@/components/PainelUi'
import { LinhaLancamento } from '@/modules/caixa/components/LinhaLancamento'
import type { Lancamento } from '@/modules/caixa/types'

type Props = {
  titulo: string
  contador: string
  lancamentos: Lancamento[]
  textoVazio: string
  podeEstornar: boolean
  aoEstornar: (l: Lancamento) => void
}

/** Cartão com a lista de lançamentos do dia (receitas ou despesas). */
export default function CartaoLancamentos({
  titulo,
  contador,
  lancamentos,
  textoVazio,
  podeEstornar,
  aoEstornar,
}: Props) {
  return (
    <Cartao titulo={titulo} contador={contador}>
      {lancamentos.length === 0 ? (
        <Vazio texto={textoVazio} />
      ) : (
        <ul className="divide-y divide-[#EFE7D3]">
          {lancamentos.map((l) => (
            <LinhaLancamento
              key={l.id}
              l={l}
              podeEstornar={podeEstornar}
              onEstornar={aoEstornar}
            />
          ))}
        </ul>
      )}
    </Cartao>
  )
}
