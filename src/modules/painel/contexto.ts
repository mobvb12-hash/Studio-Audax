import { createContext } from 'react'
import type { EstadoPainel } from './PainelAuthProvider'
import type { DadosCadastro, DadosPerfilPainel } from './tipos'

export type ContextoPainel = {
  estado: EstadoPainel
  /** Erro da última ação ('' = sem erro). */
  erro: string
  /** true enquanto uma ação (entrar/cadastrar/vincular/…) está em andamento. */
  processando: boolean
  entrar: (email: string, senha: string) => Promise<boolean>
  cadastrar: (dados: DadosCadastro) => Promise<boolean>
  recuperar: (email: string) => Promise<boolean>
  redefinir: (senha: string) => Promise<boolean>
  vincular: (
    nome: string,
    telefone: string,
    nascimento: string,
  ) => Promise<boolean>
  /** Re-verifica a sessão depois da confirmação de e-mail. */
  aoConfirmarEmail: () => Promise<boolean>
  /** Salva o cadastro (RPC da 018); `false` = erro já exposto em `erro`. */
  atualizar: (dados: DadosPerfilPainel) => Promise<boolean>
  sair: () => Promise<boolean>
  /** Limpa aviso/erro ao navegar entre as telas. */
  limparMensagens: () => void
}

export const ContextoPainel = createContext<ContextoPainel | null>(null)
