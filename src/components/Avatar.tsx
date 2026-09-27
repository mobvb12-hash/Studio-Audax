import { iniciais } from '@/lib/apresentacao'

type Props = {
  nome: string
  foto?: string
  tamanho?: 'sm' | 'md'
}

const TAMANHOS = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-11 w-11 text-sm',
}

/** Avatar com foto do profissional; sem foto, mostra as iniciais. */
export default function Avatar({ nome, foto, tamanho = 'md' }: Props) {
  const classes = `${TAMANHOS[tamanho]} shrink-0 rounded-full`
  if (foto) {
    return (
      <img
        src={foto}
        alt={`Foto de ${nome}`}
        className={`${classes} border border-[#E5DCC3] object-cover`}
      />
    )
  }
  return (
    <span
      className={`${classes} flex items-center justify-center bg-[#E9DDC0] font-bold text-[#8A6A14]`}
      aria-hidden="true"
    >
      {iniciais(nome)}
    </span>
  )
}
