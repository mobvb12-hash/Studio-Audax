import { usePainelAuth } from '../usePainelAuth'
import { AVISO_CONFIRME_EMAIL, navegarPainel } from '../regras'
import { CartaoPainel, ErroPainel, LinkPainel } from './comum'

export default function TelaConfirmeEmailPainel() {
  const { estado, erro, processando, aoConfirmarEmail, limparMensagens } =
    usePainelAuth()

  const email = estado.status === 'confirme_email' ? estado.email : ''

  function irPara(rota: string) {
    limparMensagens()
    navegarPainel(rota)
  }

  return (
    <CartaoPainel
      titulo="Confirme seu e-mail"
      subtitulo={AVISO_CONFIRME_EMAIL}
    >
      {email && (
        <p className="mt-4 text-center text-sm font-medium text-[#1C1A15]">
          {email}
        </p>
      )}
      <div className="mt-6 space-y-4">
        <button
          type="button"
          disabled={processando}
          onClick={() => void aoConfirmarEmail()}
          className="w-full rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {processando ? 'Verificando…' : 'Já confirmei — continuar'}
        </button>
        <ErroPainel texto={erro} />
        <LinkPainel aoClicar={() => irPara('entrar')}>
          Voltar para o acesso
        </LinkPainel>
      </div>
    </CartaoPainel>
  )
}
