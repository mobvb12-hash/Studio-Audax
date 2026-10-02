import { useState } from 'react'
import { usePainelAuth } from '../usePainelAuth'
import { navegarPainel } from '../regras'
import { BotaoPrimario, Campo, CartaoPainel, ErroPainel, LinkPainel } from './comum'
import { submeterFormulario } from './submissao'

export default function TelaCadastrarPainel() {
  const { erro, processando, cadastrar, limparMensagens } = usePainelAuth()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')

  function irPara(rota: string) {
    limparMensagens()
    navegarPainel(rota)
  }

  return (
    <CartaoPainel
      titulo="Criar conta"
      subtitulo="Cadastre-se para acompanhar seus agendamentos pelo painel."
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={(evento) =>
          submeterFormulario(evento, () =>
            void cadastrar({ nome, email, telefone, senha }),
          )
        }
      >
        <Campo
          id="cad-nome"
          label="Nome completo"
          tipo="text"
          valor={nome}
          aoMudar={setNome}
          autocomplete="name"
        />
        <Campo
          id="cad-email"
          label="E-mail"
          tipo="email"
          valor={email}
          aoMudar={setEmail}
          autocomplete="email"
        />
        <Campo
          id="cad-telefone"
          label="Telefone com DDD"
          tipo="tel"
          valor={telefone}
          aoMudar={setTelefone}
          autocomplete="tel"
          placeholder="(11) 99999-9999"
        />
        <Campo
          id="cad-senha"
          label="Senha"
          tipo="password"
          valor={senha}
          aoMudar={setSenha}
          autocomplete="new-password"
          dica="MÃ­nimo de 6 caracteres."
        />
        <BotaoPrimario
          processando={processando}
          rotulo="Criar conta"
          processandoRotulo="Criandoâ€¦"
        />
      </form>

      <ErroPainel texto={erro} />

      <div className="mt-5">
        <LinkPainel aoClicar={() => irPara('entrar')}>
          JÃ¡ tenho conta â€” entrar
        </LinkPainel>
      </div>
    </CartaoPainel>
  )
}
