import { useState } from 'react'
import { usePainelAuth } from '../usePainelAuth'
import { navegarPainel } from '../regras'
import { AvisoPainel, BotaoPrimario, Campo, CartaoPainel, ErroPainel, LinkPainel } from './comum'
import { submeterFormulario } from './submissao'

export default function TelaRedefinirPainel() {
  const { estado, erro, processando, redefinir, limparMensagens } =
    usePainelAuth()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erroLocal, setErroLocal] = useState('')

  const aviso = estado.status === 'redefinindo' ? estado.aviso : ''

  function enviar() {
    setErroLocal('')
    if (senha !== confirmacao) {
      setErroLocal('As senhas precisam ser iguais.')
      return
    }
    void redefinir(senha)
  }

  function irPara(rota: string) {
    limparMensagens()
    navegarPainel(rota)
  }

  return (
    <CartaoPainel
      titulo="Nova senha"
      subtitulo="Escolha a senha da sua conta do painel."
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={(evento) => submeterFormulario(evento, enviar)}
      >
        <Campo
          id="nova-senha"
          label="Nova senha"
          tipo="password"
          valor={senha}
          aoMudar={setSenha}
          autocomplete="new-password"
          dica="Mínimo de 6 caracteres."
        />
        <Campo
          id="confirmar-senha"
          label="Confirmar nova senha"
          tipo="password"
          valor={confirmacao}
          aoMudar={setConfirmacao}
          autocomplete="new-password"
        />
        <BotaoPrimario
          processando={processando}
          rotulo="Salvar senha"
          processandoRotulo="Salvando…"
        />
      </form>

      <AvisoPainel texto={aviso} />
      <ErroPainel texto={erroLocal || erro} />

      <div className="mt-5">
        <LinkPainel aoClicar={() => irPara('entrar')}>
          Voltar para o acesso
        </LinkPainel>
      </div>
    </CartaoPainel>
  )
}
