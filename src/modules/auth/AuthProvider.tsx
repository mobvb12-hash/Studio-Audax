import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { ContextoAuth } from './contexto'
import {
  AVISO_SESSAO_EXPIRADA,
  mensagemErroEntrada,
  sessaoExpirada,
} from './regras'
import { adaptarSupabase } from './supabaseAdapter'
import type { ClienteAuth } from './tipos'

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
  | { status: 'autenticado'; email: string }

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

  useEffect(() => {
    // `cliente` é estável (injetado uma única vez): o estado inicial já é
    // 'desabilitado' sem cliente e 'carregando' com cliente — nenhum
    // setEstado síncrono aqui; as mudanças só acontecem nas respostas async.
    if (cliente === null) return
    let vivo = true

    cliente
      .sessao()
      .then((sessao) => {
        if (!vivo) return
        if (!sessao) {
          setEstado({ status: 'deslogado', aviso: '' })
        } else if (sessaoExpirada(sessao, agoraSegundos())) {
          setEstado({ status: 'deslogado', aviso: AVISO_SESSAO_EXPIRADA })
        } else {
          setEstado({ status: 'autenticado', email: sessao.email })
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
      setEstado({ status: 'autenticado', email: sessao.email })
    })

    return () => {
      vivo = false
      cancelar()
    }
  }, [cliente])

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
        setEstado({ status: 'autenticado', email: sessao.email })
        return true
      } catch (erro) {
        setErroEntrada(mensagemErroEntrada(erro))
        return false
      } finally {
        setEntrando(false)
      }
    },
    [cliente],
  )

  const sair = useCallback(async () => {
    if (cliente !== null) {
      try {
        await cliente.sair()
      } catch {
        // falha ao avisar o provedor não impede o logout local
      }
    }
    setErroEntrada('')
    setEstado({ status: 'deslogado', aviso: '' })
  }, [cliente])

  const valor = useMemo(
    () => ({ estado, erroEntrada, entrando, entrar, sair }),
    [estado, erroEntrada, entrando, entrar, sair],
  )

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>
}
