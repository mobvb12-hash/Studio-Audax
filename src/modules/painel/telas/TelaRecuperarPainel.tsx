import { useState } from 'react'
import { usePainelAuth } from '../usePainelAuth'
import { navegarPainel } from '../regras'
import { AvisoPainel, BotaoPrimario, Campo, CartaoPainel, ErroPainel, LinkPainel } from './comum'
import { submeterFormulario } from './submissao'

export default function TelaRecuperarPainel() {
  const { estado, erro, processando, recuperar, limparMensagens } =
    usePainelAuth()
  const [email, setEmail] = useState('')

  const aviso = estado.status === 'sem_sessao' ? estado.aviso : ''

  function irPara(rota: string) {
    limparMensagens()
    navegarPainel(rota)
  }

  return (
    <CartaoPainel
      titulo="Recuperar senha"
      subtitulo="Informe seu e-mail e enviamos um link para criar uma nova senha."
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={(evento) =>
          submeterFormulario(evento, () => void recuperar(email))
        }
      >
        <Campo
          id="rec-email"
          label="E-mail"
          tipo="email"
          valor={email}
          aoMudar={setEmail}
          autocomplete="email"
        />
        <BotaoPrimario
          processando={processando}
          rotulo="Enviar link"
          processandoRotulo="Enviando…"
        />
      </form>

      <AvisoPainel texto={aviso} />
      <ErroPainel texto={erro} />

      <div className="mt-5">
        <LinkPainel aoClicar={() => irPara('entrar')}>
          Voltar para o acesso
        </LinkPainel>
      </div>
    </CartaoPainel>
  )
}
