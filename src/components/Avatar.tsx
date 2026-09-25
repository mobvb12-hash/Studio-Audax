type Props = {
  nome: string
  foto?: string
  tamanho?: 'sm' | 'md'
}

const TAMANHOS = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-11 w-11 text-sm',
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (!partes[0]) return '??'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
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
