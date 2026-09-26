import {
  limparAvisosPersistencia,
  useAvisosPersistencia,
} from '@/lib/persistencia'

/**
 * Banner centralizado de avisos de persistência (dado local corrompido ou
 * gravação que falhou). Não bloqueia a aplicação: só informa e pode ser fechado.
 */
export default function AvisoPersistencia() {
  const avisos = useAvisosPersistencia()
  const mensagens = [...new Set(avisos.map((a) => a.mensagem))]

  if (mensagens.length === 0) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-3 z-[70] mx-auto w-[min(560px,calc(100%-1.5rem))] rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1.5">
          {mensagens.map((mensagem) => (
            <p key={mensagem} className="text-[13px] text-[#4A4436]">
              {mensagem}
            </p>
          ))}
        </div>
        <button
          type="button"
          onClick={() => limparAvisosPersistencia()}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-semibold text-[#8A6A14] hover:bg-[#F3ECDA]"
        >
          Entendi
        </button>
      </div>
    </div>
  )
}
