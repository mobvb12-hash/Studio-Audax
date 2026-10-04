import { useState } from 'react'
import { usePainelAuth } from '../usePainelAuth'
import { navegarPainel } from '../regras'
import { AvisoPainel, BotaoPrimario, Campo, CartaoPainel, ErroPainel, LinkPainel } from './comum'
import { submeterFormulario } from './submissao'

export default function TelaEntrarPainel() {
  const { estado, erro, processando, entrar, limparMensagens } = usePainelAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  const aviso = estado.status === 'sem_sessao' ? estado.aviso : ''

  function irPara(rota: string) {
    limparMensagens()
    navegarPainel(rota)
  }

  return (
    <CartaoPainel
      titulo="Studio Audax"
      subtitulo="Entre com seu acesso para abrir o seu painel."
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={(evento) =>
          submeterFormulario(evento, () => void entrar(email, senha))
        }
      >
        <Campo
          id="painel-email"
          label="E-mail"
          tipo="email"
          valor={email}
          aoMudar={setEmail}
          autocomplete="email"
        />
        <Campo
          id="painel-senha"
          label="Senha"
          tipo="password"
          valor={senha}
          aoMudar={setSenha}
          autocomplete="current-password"
        />
        <BotaoPrimario
          processando={processando}
          rotulo="Entrar"
          processandoRotulo="Entrando…"
        />
      </form>

      <AvisoPainel texto={aviso} />
      <ErroPainel texto={erro} />

      <div className="mt-5 space-y-3">
        <LinkPainel aoClicar={() => irPara('recuperar')}>
          Esqueci minha senha
        </LinkPainel>
        <LinkPainel aoClicar={() => irPara('cadastrar')}>
          Criar minha conta
        </LinkPainel>
      </div>
    </CartaoPainel>
  )
}
