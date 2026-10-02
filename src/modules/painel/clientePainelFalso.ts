import type { SessaoInfo } from '@/modules/auth/tipos'
import type {
  ClientePainel,
  DadosCadastro,
  DadosPerfilPainel,
  MotivoPainel,
  RegistroCliente,
  ResultadoVinculo,
} from './tipos'

/**
 * Cliente do painel falso para testes — sem rede, sem Supabase.
 * Permite simular carga de sessão, resultados da prova de vínculo
 * (fila + padrão), sucesso/falha de cada ação e eventos de sessão.
 */
export type ClientePainelFalso = ClientePainel & {
  sessaoAtual: SessaoInfo | null
  confirmada: boolean
  /** Resultado usado quando a fila estiver vazia. */
  vincularResultado: ResultadoVinculo | Error
  /** Resultados consumidos um a um (antes do `vincularResultado`). */
  filaVincular: (ResultadoVinculo | Error)[]
  erroEntrada: Error | null
  erroCadastro: Error | null
  erroRecuperacao: Error | null
  erroRedefinicao: Error | null
  /** Lançado por `atualizar` quando definido (perfil falhando). */
  erroAtualizar: Error | null
  /** true = signUp sem sessão (confirmação de e-mail ativa). */
  cadastroSemSessao: boolean
  entradas: { email: string; senha: string }[]
  cadastros: DadosCadastro[]
  chamadasVincular: {
    nome: string | null
    telefone: string | null
    nascimento: string
  }[]
  chamadasRecuperar: string[]
  chamadasRedefinir: string[]
  chamadasAtualizar: DadosPerfilPainel[]
  disparar(sessao: SessaoInfo | null, motivo: MotivoPainel): void
}

export function sessaoValidaPainel(
  email = 'cliente@studio.com.br',
): SessaoInfo {
  return { email, expiraEm: Math.floor(Date.now() / 1000) + 3600 }
}

export function criarClientePainelFalso(
  sessaoInicial: SessaoInfo | null = null,
): ClientePainelFalso {
  const ouvintes = new Set<
    (sessao: SessaoInfo | null, motivo: MotivoPainel) => void
  >()
  const falso: ClientePainelFalso = {
    sessaoAtual: sessaoInicial,
    confirmada: sessaoInicial !== null,
    vincularResultado: { estado: 'vinculado', clienteId: 'cli-teste-1' },
    filaVincular: [],
    erroEntrada: null,
    erroCadastro: null,
    erroRecuperacao: null,
    erroRedefinicao: null,
    erroAtualizar: null,
    cadastroSemSessao: false,
    entradas: [],
    cadastros: [],
    chamadasVincular: [],
    chamadasRecuperar: [],
    chamadasRedefinir: [],
    chamadasAtualizar: [],
    async sessao() {
      return falso.sessaoAtual
    },
    async confirmar() {
      return falso.sessaoAtual !== null && falso.confirmada
    },
    observar(mudou) {
      ouvintes.add(mudou)
      return () => {
        ouvintes.delete(mudou)
      }
    },
    async entrar(email, senha) {
      falso.entradas.push({ email, senha })
      if (falso.erroEntrada) throw falso.erroEntrada
      falso.sessaoAtual = sessaoValidaPainel(email)
      falso.confirmada = true
      return falso.sessaoAtual
    },
    async sair() {
      falso.sessaoAtual = null
      falso.confirmada = false
    },
    async cadastrar(dados) {
      falso.cadastros.push(dados)
      if (falso.erroCadastro) throw falso.erroCadastro
      if (falso.cadastroSemSessao) return null
      falso.sessaoAtual = sessaoValidaPainel(dados.email)
      falso.confirmada = true
      return falso.sessaoAtual
    },
    async recuperar(email) {
      if (falso.erroRecuperacao) throw falso.erroRecuperacao
      falso.chamadasRecuperar.push(email)
    },
    async redefinir(senha) {
      if (falso.erroRedefinicao) throw falso.erroRedefinicao
      falso.chamadasRedefinir.push(senha)
    },
    async vincular(nome, telefone, nascimento) {
      falso.chamadasVincular.push({ nome, telefone, nascimento })
      const proximo = falso.filaVincular.shift()
      const resultado = proximo ?? falso.vincularResultado
      if (resultado instanceof Error) throw resultado
      return resultado
    },
    async atualizar(dados: DadosPerfilPainel): Promise<RegistroCliente> {
      falso.chamadasAtualizar.push(dados)
      if (falso.erroAtualizar) throw falso.erroAtualizar
      return {
        id: 'cli-teste-1',
        email: 'cliente@studio.com.br',
        ...dados,
      }
    },
    disparar(sessao, motivo) {
      falso.sessaoAtual = sessao
      ouvintes.forEach((ouvinte) => ouvinte(sessao, motivo))
    },
  }
  return falso
}
