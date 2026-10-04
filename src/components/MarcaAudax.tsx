/**
 * Marca Studio Audax — símbolo (tesoura em círculo) e selo "Desde 2024"
 * recriados em SVG a partir da arte final da barbearia (logo enviado pelo
 * usuário). O símbolo usa `currentColor`, então herda a cor do contexto:
 * use `text-[#F7F3EA]` sobre fundo escuro e `text-[#121110]` sobre claro.
 */
export function MarcaAudax({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx="32"
        cy="32"
        r="29"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M22.5 46.5 41.5 15"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M41.5 46.5 22.5 15"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle
        cx="20.5"
        cy="49"
        r="5"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle
        cx="43.5"
        cy="49"
        r="5"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="32" cy="30.8" r="2.4" fill="#C9A24A" />
    </svg>
  )
}

/**
 * Filete dourado "— Desde 2024 —" presente na arte da marca.
 * Decorativo (aria-hidden): nenhum texto de teste depende dele.
 */
export function SeloDesde2024({ className = '' }: { className?: string }) {
  return (
    <p
      aria-hidden="true"
      className={`flex items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.3em] text-[#C9A24A] uppercase ${className}`}
    >
      <span className="h-px flex-1 bg-[#C9A24A]/70" />
      Desde 2024
      <span className="h-px flex-1 bg-[#C9A24A]/70" />
    </p>
  )
}

export default MarcaAudax
