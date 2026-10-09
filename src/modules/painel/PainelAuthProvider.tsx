import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AVISO_SESSAO_EXPIRADA,
  mensagemErroEntrada,
} from '@/modules/auth/regras'
import { clientePainel } from '@/services/supabase/painel'
import { ContextoPainel } from './contexto'
import {
  AVISO_LINK_ENVIADO,
  avisoParaEstadoVinculo,
  cadastroPendenteDo,
  exigeNascimento,
  hashAuthRedirect,
  lerCadastroPendente,
  lerRetomadaAgendamento,
  limparCadastroPendente,
  limparHashAuth,
  mensagemErroCadastro,
  mensagemErroPerfil,
  mensagemErroRecuperacao,
  mensagemErroRedefinicao,
  mensagemErroVinculo,
  nascimentoValido,
  nomeValido,
  salvarCadastroPendente,
  senhaValida,
  telefoneValido,
  urlAgendamentoOficial,
} from './regras'
import type {
  ClientePainel,
  DadosCadastro,
  DadosPerfilPainel,
} from './tipos'

/**
 * Estados do painel do cliente:
 * - sem_supabase: sem Supabase configurado — sem sessão possível;
 * - carregando:   verificando a sessão salva;
 * - sem_sessao:   tela de entrar/cadastrar/recuperar (`aviso` opcional);
 * - confirme_email: conta criada com confirmação de e-mail ativa;
 * - redefinindo:  link de recuperação aberto — falta escolher a nova senha;
 * - vinculando:   sessão válida, verificando o vínculo com o cadastro;
 * - precisa_vinculo: sessão válida sem cadastro provado — formulário
 *   (nascimento aparece/é exigido conforme a prova da RPC 018);
 * - pronto:       vinculado — conteúdo do painel liberado.
 */
export type EstadoPainel =
  | { status: 'sem_supabase' }
  | { status: 'carregando' }
  | { status: 'sem_sessao'; aviso: string }
  | { status: 'confirme_email'; email: string }
  | { status: 'redefinindo'; aviso: string }
  | { status: 'vinculando' }
  | {
      status: 'precisa_vinculo'
      aviso: string
      mostrarNascimento: boolean
      nascimentoObrigatorio: boolean
    }
  | { status: 'pronto'; clienteId: string }

type Props = {
  children: ReactNode
  /** Cliente de autenticação; omitido = lido do ambiente (Supabase). */
  cliente?: ClientePainel | null
}

function padraoDoAmbiente(): ClientePainel | null {
  return clientePainel()
}

export function PainelAuthProvider({ children, cliente: informado }: Props) {
  const padrao = useMemo(() => padraoDoAmbiente(), [])
  const cliente = informado !== undefined ? informado : padrao

  const [estado, setEstado] = useState<EstadoPainel>(() =>
    cliente === null ? { status: 'sem_supabase' } : { status: 'carregando' },
  )
  const [erro, setErro] = useState('')
  const [processando, setProcessando] = useState(false)

  // prontoRef evita revalidar um vínculo já concluído; emCurso compartilha a
  // mesma promessa entre o observer e a ação explícita (sem corrida).
  const prontoRef = useRef(false)
  const emCurso = useRef<Promise<boolean> | null>(null)

  const marcarPronto = useCallback((clienteId: string) => {
    prontoRef.current = true
    setErro('')
    setEstado({ status: 'pronto', clienteId })
  }, [])

  /**
   * Roda a prova de vínculo (RPC 018) e conduz o estado. Com sessão sem
   * cadastro provado cai no formulário; com prova concluída vai para
   * `pronto`. Nunca lança: o erro vira mensagem amigável.
   */
  const concluirVinculo = useCallback(
    (
      nome: string | null = null,
      telefone: string | null = null,
      nascimento = '',
    ): Promise<boolean> => {
      if (prontoRef.current) return Promise.resolve(true)
      if (emCurso.current) return emCurso.current
      if (cliente === null) return Promise.resolve(false)

      setErro('')
      setEstado({ status: 'vinculando' })

      const rodar = async (): Promise<boolean> => {
        try {
          const resultado = await cliente.vincular(nome, telefone, nascimento)
          if (
            (resultado.estado === 'vinculado' ||
              resultado.estado === 'criado') &&
            resultado.clienteId
          ) {
            marcarPronto(resultado.clienteId)
            return true
          }
          setEstado({
            status: 'precisa_vinculo',
            aviso: avisoParaEstadoVinculo(resultado.estado),
            mostrarNascimento: exigeNascimento(resultado.estado),
            nascimentoObrigatorio: resultado.estado === 'ambiguo',
          })
          return false
        } catch (erroVinculo) {
          const texto = mensagemErroVinculo(erroVinculo)
          const semDados = /Informe seu nome|Informe um telefone/.test(texto)
          if (!semDados) setErro(texto)
          setEstado({
            status: 'precisa_vinculo',
            aviso: '',
            mostrarNascimento: false,
            nascimentoObrigatorio: false,
          })
          return false
        }
      }

      const promessa = rodar()
      emCurso.current = promessa
      void promessa.finally(() => {
        if (emCurso.current === promessa) emCurso.current = null
      })
      return promessa
    },
    [cliente, marcarPronto],
  )

  /**
   * Conclui o vínculo reaproveitando o cadastro guardado pela confirmação de
   * e-mail — só se a pendência for do MESMO e-mail da sessão. A pendência é
   * apagada em sucesso; um erro de rede não pode jogar fora o que a pessoa
   * acabou de digitar.
   */
  const concluirComCadastroPendente = useCallback(
    async (
      usarPendente: boolean,
      emailSessao?: string | null,
    ): Promise<boolean> => {
      const pendente = usarPendente
        ? cadastroPendenteDo(lerCadastroPendente(), emailSessao)
        : null
      const ok = pendente
        ? await concluirVinculo(
            pendente.nome,
            pendente.telefone,
            pendente.nascimento,
          )
        : await concluirVinculo()
      if (pendente && ok) limparCadastroPendente()
      return ok
    },
    [concluirVinculo],
  )

  useEffect(() => {
    if (cliente === null) return
    let vivo = true

    // Link de e-mail no hash: recovery escolhe nova senha; signup já confirma
    // a conta (a sessão implícita chega em seguida pelo observer). A troca de
    // estado fica DENTRO da cadeia assíncrona — setState síncrono no corpo do
    // effect é proibido pelas regras do React.
    const redirect = hashAuthRedirect()
    const veioDaConfirmacao = redirect === 'signup'
    if (redirect === 'signup') {
      limparHashAuth()
    }

    cliente
      .sessao()
      .then(async (sessao) => {
        if (!vivo) return
        if (redirect === 'recovery') {
          setEstado({ status: 'redefinindo', aviso: '' })
          return
        }
        if (!sessao) {
          setEstado({ status: 'sem_sessao', aviso: '' })
          return
        }
        if (!(await cliente.confirmar())) {
          setEstado({ status: 'sem_sessao', aviso: AVISO_SESSAO_EXPIRADA })
          return
        }
        await concluirComCadastroPendente(veioDaConfirmacao, sessao.email)
      })
      .catch(() => {
        if (vivo) setEstado({ status: 'sem_sessao', aviso: '' })
      })

    const cancelar = cliente.observar((sessao, motivo) => {
      if (!vivo) return
      if (motivo === 'recuperar') {
        setEstado({ status: 'redefinindo', aviso: '' })
        return
      }
      if (!sessao) {
        prontoRef.current = false
        setEstado({
          status: 'sem_sessao',
          aviso: motivo === 'expirada' ? AVISO_SESSAO_EXPIRADA : '',
        })
        return
      }
      // a sessão também chega pelo observer (confirmação sem recarregar);
      // mesmo caminho da cadeia acima, com a mesma cadência de pendência
      void concluirComCadastroPendente(veioDaConfirmacao, sessao.email)
    })

    return () => {
      vivo = false
      cancelar()
    }
  }, [cliente, concluirComCadastroPendente])

  /**
   * Terminou de entrar (ou de criar conta) E tinha um agendamento a retomar:
   * volta para `/agendar`, que restaura as escolhas e reabre na etapa de
   * extras.
   *
   * É a segunda metade da ponte: o fluxo público salva o rascunho quando
   * falta identificação, manda a pessoa para cá, e aqui devolvemos ela com o
   * que já tinha escolhido. Sem rascunho não há para onde voltar — quem só
   * quis abrir o painel continua nele.
   *
   * O rascunho vive 30 minutos no `sessionStorage` e é apagado pelo próprio
   * fluxo depois de restaurar, então isto não pega ninguém de surpresa horas
   * depois. Navegação cheia (não hash): `/agendar` é a URL oficial, e é ela
   * que precisa estar no endereço.
   */
  useEffect(() => {
    if (estado.status !== 'pronto') return
    if (!lerRetomadaAgendamento()) return
    window.location.assign(urlAgendamentoOficial())
  }, [estado.status])

  const entrar = useCallback(
    async (email: string, senha: string): Promise<boolean> => {
      if (cliente === null) return false
      setErro('')
      setProcessando(true)
      try {
        await cliente.entrar(email.trim(), senha)
        if (!(await cliente.confirmar())) {
          setEstado({ status: 'sem_sessao', aviso: AVISO_SESSAO_EXPIRADA })
          return false
        }
        return await concluirVinculo()
      } catch (erroEntrada) {
        setErro(mensagemErroEntrada(erroEntrada))
        return false
      } finally {
        setProcessando(false)
      }
    },
    [cliente, concluirVinculo],
  )

  const cadastrar = useCallback(
    async (dados: DadosCadastro): Promise<boolean> => {
      if (cliente === null) return false
      setErro('')
      if (!nomeValido(dados.nome)) {
        setErro('Informe seu nome.')
        return false
      }
      // Só o vazio: o formato do e-mail é do campo `type="email"` no navegador
      // e do signUp no servidor — aqui não se inventa uma segunda regra.
      if (!dados.email.trim()) {
        setErro('Informe seu e-mail.')
        return false
      }
      if (!telefoneValido(dados.telefone)) {
        setErro('Informe um telefone válido com DDD.')
        return false
      }
      if (!senhaValida(dados.senha)) {
        setErro('A senha precisa de pelo menos 6 caracteres.')
        return false
      }
      if (!nascimentoValido(dados.nascimento)) {
        setErro('Informe uma data de nascimento válida.')
        return false
      }
      setProcessando(true)
      try {
        const sessao = await cliente.cadastrar({
          ...dados,
          nome: dados.nome.trim(),
          email: dados.email.trim(),
          telefone: dados.telefone.trim(),
        })
        if (!sessao) {
          // Confirmação de e-mail em andamento: o link reabre a página e o
          // estado do React some. Guarda o que foi digitado para a prova de
          // vínculo não nascer sem o nascimento.
          salvarCadastroPendente({
            email: dados.email.trim(),
            nome: dados.nome.trim(),
            telefone: dados.telefone.trim(),
            nascimento: dados.nascimento.trim(),
          })
          setEstado({ status: 'confirme_email', email: dados.email.trim() })
          return true
        }
        if (!(await cliente.confirmar())) {
          setEstado({ status: 'sem_sessao', aviso: AVISO_SESSAO_EXPIRADA })
          return false
        }
        return await concluirVinculo(
          dados.nome.trim(),
          dados.telefone.trim(),
          dados.nascimento.trim(),
        )
      } catch (erroCadastro) {
        setErro(mensagemErroCadastro(erroCadastro))
        return false
      } finally {
        setProcessando(false)
      }
    },
    [cliente, concluirVinculo],
  )

  const recuperar = useCallback(
    async (email: string): Promise<boolean> => {
      if (cliente === null) return false
      setErro('')
      if (!email.trim()) {
        setErro('Informe seu e-mail.')
        return false
      }
      setProcessando(true)
      try {
        await cliente.recuperar(email.trim())
        setEstado({ status: 'sem_sessao', aviso: AVISO_LINK_ENVIADO })
        return true
      } catch (erroEnvio) {
        setErro(mensagemErroRecuperacao(erroEnvio))
        return false
      } finally {
        setProcessando(false)
      }
    },
    [cliente],
  )

  const redefinir = useCallback(
    async (senha: string): Promise<boolean> => {
      if (cliente === null) return false
      setErro('')
      if (!senhaValida(senha)) {
        setErro('A senha precisa de pelo menos 6 caracteres.')
        return false
      }
      setProcessando(true)
      try {
        await cliente.redefinir(senha)
        limparHashAuth()
        return await concluirVinculo()
      } catch (erroSenha) {
        setErro(mensagemErroRedefinicao(erroSenha))
        return false
      } finally {
        setProcessando(false)
      }
    },
    [cliente, concluirVinculo],
  )

  const vincular = useCallback(
    async (nome: string, telefone: string, nascimento: string) => {
      if (cliente === null) return false
      setErro('')
      if (!nomeValido(nome)) {
        setErro('Informe seu nome.')
        return false
      }
      if (!telefoneValido(telefone)) {
        setErro('Informe um telefone válido com DDD.')
        return false
      }
      setProcessando(true)
      try {
        return await concluirVinculo(nome.trim(), telefone.trim(), nascimento)
      } finally {
        setProcessando(false)
      }
    },
    [cliente, concluirVinculo],
  )

  /**
   * Salva o cadastro pela RPC 018. Valida o mínimo no cliente (mesmas
   * frases da RPC) e só mostra textos conhecidos no erro — nunca vaza
   * erro interno do banco.
   */
  const atualizar = useCallback(
    async (dados: DadosPerfilPainel): Promise<boolean> => {
      if (cliente === null) return false
      setErro('')
      if (!nomeValido(dados.nome)) {
        setErro('Informe seu nome.')
        return false
      }
      if (!telefoneValido(dados.telefone)) {
        setErro('Informe um telefone válido com DDD.')
        return false
      }
      setProcessando(true)
      try {
        await cliente.atualizar({
          nome: dados.nome.trim(),
          telefone: dados.telefone.trim(),
          nascimento: dados.nascimento,
          genero: dados.genero,
        })
        return true
      } catch (erroAtualizar) {
        setErro(mensagemErroPerfil(erroAtualizar))
        return false
      } finally {
        setProcessando(false)
      }
    },
    [cliente],
  )

  const aoConfirmarEmail = useCallback(async (): Promise<boolean> => {
    if (cliente === null) return false
    setErro('')
    setProcessando(true)
    try {
      const sessao = await cliente.sessao()
      if (!sessao || !(await cliente.confirmar())) {
        setErro(
          'Ainda não recebemos a confirmação do e-mail. Abra o link enviado e tente novamente.',
        )
        return false
      }
      return await concluirComCadastroPendente(true, sessao.email)
    } catch {
      setErro('Não foi possível verificar a conta. Tente novamente.')
      return false
    } finally {
      setProcessando(false)
    }
  }, [cliente, concluirComCadastroPendente])

  const sair = useCallback(async (): Promise<boolean> => {
    if (cliente === null) {
      setErro('')
      setEstado({ status: 'sem_sessao', aviso: '' })
      return true
    }
    setProcessando(true)
    try {
      await cliente.sair()
      limparCadastroPendente()
      prontoRef.current = false
      setErro('')
      setEstado({ status: 'sem_sessao', aviso: '' })
      return true
    } catch (erroSaida) {
      setErro(
        erroSaida instanceof Error && erroSaida.message
          ? `Não foi possível encerrar a sessão: ${erroSaida.message}`
          : 'Não foi possível encerrar a sessão. Tente novamente.',
      )
      return false
    } finally {
      setProcessando(false)
    }
  }, [cliente])

  const limparMensagens = useCallback(() => {
    setErro('')
    setEstado((atual) =>
      atual.status === 'sem_sessao' || atual.status === 'redefinindo'
        ? { ...atual, aviso: '' }
        : atual,
    )
  }, [])

  const valor = useMemo(
    () => ({
      estado,
      erro,
      processando,
      entrar,
      cadastrar,
      recuperar,
      redefinir,
      vincular,
      aoConfirmarEmail,
      atualizar,
      sair,
      limparMensagens,
    }),
    [
      estado,
      erro,
      processando,
      entrar,
      cadastrar,
      recuperar,
      redefinir,
      vincular,
      aoConfirmarEmail,
      atualizar,
      sair,
      limparMensagens,
    ],
  )

  return (
    <ContextoPainel.Provider value={valor}>{children}</ContextoPainel.Provider>
  )
}
