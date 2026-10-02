import { useState } from 'react'
import { usePainelAuth } from '../usePainelAuth'
import { AvisoPainel, BotaoPrimario, Campo, CartaoPainel, ErroPainel } from './comum'
import { submeterFormulario } from './submissao'

/**
 * FormulÃ¡rio de vÃ­nculo da sessÃ£o com um cadastro. O campo de nascimento
 * aparece/exige conforme o estado da prova da RPC 018 (ambiguo/precisa_dados)
 * â€” nunca mostra dados de outros cadastros.
 */
export default function TelaVincularPainel() {
  const { estado, erro, processando, vincular } = usePainelAuth()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nascimento, setNascimento] = useState('')

  const aviso = estado.status === 'precisa_vinculo' ? estado.aviso : ''
  const mostrarNascimento =
    estado.status === 'precisa_vinculo' && estado.mostrarNascimento
  const nascimentoObrigatorio =
    estado.status === 'precisa_vinculo' && estado.nascimentoObrigatorio

  return (
    <CartaoPainel
      titulo="Confirme seu cadastro"
      subtitulo="Use os dados que o Studio Audax jÃ¡ conhece para abrir o seu painel."
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={(evento) =>
          submeterFormulario(evento, () =>
            void vincular(nome, telefone, nascimento),
          )
        }
      >
        <Campo
          id="vinc-nome"
          label="Nome completo"
          tipo="text"
          valor={nome}
          aoMudar={setNome}
          autocomplete="name"
        />
        <Campo
          id="vinc-telefone"
          label="Telefone com DDD"
          tipo="tel"
          valor={telefone}
          aoMudar={setTelefone}
          autocomplete="tel"
          placeholder="(11) 99999-9999"
        />
        {mostrarNascimento && (
          <Campo
            id="vinc-nascimento"
            label="Data de nascimento"
            tipo="date"
            valor={nascimento}
            aoMudar={setNascimento}
            obrigatorio={nascimentoObrigatorio}
            autocomplete="bday"
          />
        )}
        <BotaoPrimario
          processando={processando}
          rotulo="Continuar"
          processandoRotulo="Verificandoâ€¦"
        />
      </form>

      <AvisoPainel texto={aviso} />
      <ErroPainel texto={erro} />
    </CartaoPainel>
  )
}
