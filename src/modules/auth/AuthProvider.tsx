import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { ContextoAuth } from './contexto'
import {
  AVISO_PERFIL_INATIVO,
  AVISO_SESSAO_EXPIRADA,
  mensagemErroEntrada,
  sessaoExpirada,
} from './regras'
import { adaptarSupabase } from './supabaseAdapter'
import type { ClienteAuth, PerfilInfo, SessaoInfo } from './tipos'
import { obterPerfil } from '@/services/supabase/perfis'

/**
 * Estados do acesso ao painel:
 * - desabilitado: sem Supabase configurado (dev/teste) — app segue local;
 * - carregando:   verificando a sessão salva;
 * - deslogado:    exibe a tela de login (`aviso` = mensagem, ex.: expirada);
 * - autenticado:  sessão válida — conteúdo interno liberado.
 */
export type EstadoAuth =
  | { status: 'desabilitado' }
  | { status: 'carregando' }
  | { status: 'deslogado'; aviso: string }
  | { status: 'autenticado'; email: string; perfil: PerfilInfo | null }

type PropsAuthProvider = {
  children: ReactNode
  /** Cliente de autenticação; omitido = lido do ambiente (Supabase). */
  cliente?: ClienteAuth | null
}

function agoraSegundos(): number {
  return Math.floor(Date.now() / 1000)
}

function padraoDoAmbiente(): ClienteAuth | null {
  const cliente = supabase()
  return cliente ? adaptarSupabase(cliente) : null
}

export function AuthProvider({ children, cliente: informado }: PropsAuthProvider) {
  const padrao = useMemo(() => padraoDoAmbiente(), [])
  const cliente = informado !== undefined ? informado : padrao

  const [estado, setEstado] = useState<EstadoAuth>(() =>
    cliente === null ? { status: 'desabilitado' } : { status: 'carregando' },
  )
  const [erroEntrada, setErroEntrada] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const [erroSaida, setErroSaida] = useState('')

  const carregarPerfil = useCallback(async () => {
    const cliente = supabase()
    if (!cliente) return
    try {
      const {
        data: { user },
      } = await cliente.auth.getUser()
      if (!user) return
      const perfil = await obterPerfil(user.id)
      // Perfil desativado não pode seguir autenticado: a RLS do banco já
      // nega (papel vira nulo), e aqui a sessão também é encerrada com
      // aviso — sem isto a tela ficaria aberta sem conseguir ler nada.
      if (perfil && !perfil.ativo) {
        await cliente.auth.signOut().catch(() => undefined)
        setEstado({ status: 'deslogado', aviso: AVISO_PERFIL_INATIVO })
        return
      }
      setEstado((atual) =>
        atual.status === 'autenticado'
          ? { ...atual, perfil }
          : atual,
      )
    } catch {
      // perfil não encontrado ou erro de rede — segue sem perfil
    }
  }, [])

  /**
   * Entra em `autenticado` só com sessão confirmada pelo SERVIDOR.
   *
   * `cliente.sessao()` sozinho não basta: ele lê o localStorage e o auth-js
   * só confere a forma do objeto e o relógio local (auth-js
   * `_isValidSession`). Uma sessão revogada, ou cujo token o banco já não
   * aceita, continua "válida" no navegador — o painel abria e as consultas
   * saíam com a anon key, que a RLS trata como visitante. `confirmar()`
   * pergunta ao Auth se o JWT ainda vale.
   */
  const entrarComConfirmacao = useCallback(
    async (sessao: SessaoInfo | null): Promise<boolean> => {
      if (!sessao || !cliente) return false
      if (!sessaoExpirada(sessao, agoraSegundos()) && (await cliente.confirmar())) {
        setEstado({ status: 'autenticado', email: sessao.email, perfil: null })
        void carregarPerfil()
        return true
      }
      return false
    },
    [cliente, carregarPerfil],
  )

  useEffect(() => {
    // `cliente` é estável (injetado uma única vez): o estado inicial já é
    // 'desabilitado' sem cliente e 'carregando' com cliente — nenhum
    // setEstado síncrono aqui; as mudanças só acontecem nas respostas async.
    if (cliente === null) return
    let vivo = true

    cliente
      .sessao()
      .then(async (sessao) => {
        if (!vivo) return
        if (!sessao) {
          setEstado({ status: 'deslogado', aviso: '' })
          return
        }
        if (sessaoExpirada(sessao, agoraSegundos())) {
          setEstado({ status: 'deslogado', aviso: AVISO_SESSAO_EXPIRADA })
          return
        }
        if (!(await entrarComConfirmacao(sessao)) && vivo) {
          setEstado({ status: 'deslogado', aviso: AVISO_SESSAO_EXPIRADA })
        }
      })
      .catch(() => {
        if (vivo) setEstado({ status: 'deslogado', aviso: '' })
      })

    const cancelar = cliente.observar((sessao, motivo) => {
      if (!vivo) return
      if (!sessao) {
        setEstado({
          status: 'deslogado',
          aviso: motivo === 'expirada' ? AVISO_SESSAO_EXPIRADA : '',
        })
        return
      }
      if (sessaoExpirada(sessao, agoraSegundos())) {
        setEstado({ status: 'deslogado', aviso: AVISO_SESSAO_EXPIRADA })
        return
      }
      void entrarComConfirmacao(sessao)
    })

    return () => {
      vivo = false
      cancelar()
    }
  }, [cliente, entrarComConfirmacao])

  const entrar = useCallback(
    async (email: string, senha: string): Promise<boolean> => {
      if (cliente === null) return false
      setErroEntrada('')
      setEstado((atual) =>
        atual.status === 'deslogado' ? { status: 'deslogado', aviso: '' } : atual,
      )
      setEntrando(true)
      try {
        const sessao = await cliente.entrar(email, senha)
        if (sessaoExpirada(sessao, agoraSegundos())) {
          setEstado({ status: 'deslogado', aviso: AVISO_SESSAO_EXPIRADA })
          return false
        }
        // login aceito, mas o token ainda precisa valer para o banco: sem
        // esta confirmação o painel abriria e as consultas sairiam como
        // visitante, e a RLS recusaria tudo.
        if (!(await entrarComConfirmacao(sessao))) {
          setEstado({ status: 'deslogado', aviso: AVISO_SESSAO_EXPIRADA })
          return false
        }
        return true
      } catch (erro) {
        setErroEntrada(mensagemErroEntrada(erro))
        return false
      } finally {
        setEntrando(false)
      }
    },
    [cliente, entrarComConfirmacao],
  )

  /**
   * Encerra a sessão. Só marca `deslogado` quando o provedor realmente
   * encerrou: antes, uma falha de `signOut()` era engolida e o estado local
   * virava `deslogado` com a sessão ainda viva no servidor — no próximo F5 o
   * `getSession()` a encontra e o usuário entra de novo sem ter feito login.
   * Agora a falha é informada e o estado continua coerente com o provedor.
   */
  const sair = useCallback(async (): Promise<boolean> => {
    if (cliente === null) {
      setErroEntrada('')
      setEstado({ status: 'deslogado', aviso: '' })
      return true
    }
    setErroSaida('')
    setSaindo(true)
    try {
      await cliente.sair()
      setErroEntrada('')
      setEstado({ status: 'deslogado', aviso: '' })
      return true
    } catch (erro) {
      // O provedor recusou: a sessão continua válida, então o estado segue
      // autenticado e o usuário é avisado em vez de receber um logout falso.
      setErroSaida(
        erro instanceof Error && erro.message
          ? `Não foi possível encerrar a sessão: ${erro.message}`
          : 'Não foi possível encerrar a sessão. Tente novamente.',
      )
      return false
    } finally {
      setSaindo(false)
    }
  }, [cliente])

  const perfil = estado.status === 'autenticado' ? estado.perfil : null

  const valor = useMemo(
    () => ({
      estado,
      erroEntrada,
      entrando,
      entrar,
      sair,
      saindo,
      erroSaida,
      perfil,
    }),
    [estado, erroEntrada, entrando, entrar, sair, saindo, erroSaida, perfil],
  )

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>
}
