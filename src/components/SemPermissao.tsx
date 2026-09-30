// ============================================================================
// Tela exibida quando o usuário autenticado não tem permissão para acessar
// uma página/recurso.
// ============================================================================

type Props = {
  /** Ação que o usuário tentou executar (opcional, para mensagem mais específica). */
  acao?: string
  /** Página que o usuário tentou acessar (opcional). */
  pagina?: string
  /** Função para voltar à página anterior ou ao painel. */
  onVoltar?: () => void
}

export default function SemPermissao({ acao, pagina, onVoltar }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFBF3] px-4">
      <div className="w-full max-w-md rounded-xl border border-[#E5DCC3] bg-white p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full border-2 border-amber-300 flex items-center justify-center">
          <svg
            aria-hidden="true"
            className="h-6 w-6 text-amber-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-bold text-[#1C1A15]">
          Acesso não autorizado
        </h1>
        <p className="mt-3 text-sm text-[#4A4436]">
          {pagina
            ? `Você não tem permissão para acessar “${pagina}”.`
            : acao
            ? `Você não tem permissão para “${acao}”.`
            : 'Você não tem permissão para realizar esta ação.'}
        </p>
        <p className="mt-2 text-xs text-[#8A8171]">
          Entre em contato com o administrador do sistema caso acredite que isto
          seja um erro.
        </p>
        {onVoltar && (
          <button
            type="button"
            onClick={onVoltar}
            className="mt-5 w-full rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Voltar
          </button>
        )}
      </div>
    </div>
  )
}