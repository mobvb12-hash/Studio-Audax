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
  const [nascimento, setNascimento] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erroConfirmacao, setErroConfirmacao] = useState('')

  /**
   * As duas senhas têm que ser iguais ANTES de qualquer chamada de servidor.
   *
   * A comparação mora aqui e não no provider de propósito: `DadosCadastro` é o
   * contrato da autenticação (nome, e-mail, telefone, nascimento, senha) e não
   * tem — nem deve ter — um campo de confirmação. Confirmar é detalhe da tela;
   * a senha em si continua só no Supabase Auth.
   */
  function enviar() {
    setErroConfirmacao('')
    if (confirmarSenha !== senha) {
      setErroConfirmacao('As senhas precisam ser iguais.')
      return
    }
    void cadastrar({ nome, email, telefone, nascimento, senha })
  }

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
        onSubmit={(evento) => submeterFormulario(evento, enviar)}
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
          id="cad-nascimento"
          label="Data de nascimento"
          tipo="date"
          valor={nascimento}
          aoMudar={setNascimento}
          autocomplete="bday"
          obrigatorio
        />
        <Campo
          id="cad-senha"
          label="Senha"
          tipo="password"
          valor={senha}
          aoMudar={setSenha}
          autocomplete="new-password"
          dica="Mínimo de 6 caracteres."
        />
        <Campo
          id="cad-confirmar-senha"
          label="Confirmar senha"
          tipo="password"
          valor={confirmarSenha}
          aoMudar={(valor) => {
            setConfirmarSenha(valor)
            // Digitou de novo, o erro velho deixa de fazer sentido.
            setErroConfirmacao('')
          }}
          autocomplete="new-password"
        />
        <BotaoPrimario
          processando={processando}
          rotulo="Criar conta"
          processandoRotulo="Criando…"
        />
      </form>

      <ErroPainel texto={erroConfirmacao || erro} />

      <div className="mt-5">
        <LinkPainel aoClicar={() => irPara('entrar')}>
          Já tenho conta — entrar
        </LinkPainel>
      </div>
    </CartaoPainel>
  )
}
