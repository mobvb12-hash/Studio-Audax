// Clientes — tipos (sem backend: estado local + localStorage)
export type ClienteGenero =
  | 'nao_informado'
  | 'masculino'
  | 'feminino'
  | 'outro'

export type TipoTelefone = 'celular' | 'residencial' | 'comercial'

export type TelefoneCliente = {
  tipo: TipoTelefone
  numero: string
}

export type EnderecoCliente = {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export type PreferenciasCliente = {
  /** Cliente recebe e-mails sobre seus agendamentos */
  emailAgendamentos: boolean
  /** Cliente recebe SMS/Notificação Push de lembrete */
  smsLembrete: boolean
  /** Cliente recebe SMS marketing */
  smsMarketing: boolean
  /** Cliente recebe e-mail marketing */
  emailMarketing: boolean
}

/** Padrão: todas as permissões de notificações/campanhas ativas. */
export function preferenciasPadrao(): PreferenciasCliente {
  return {
    emailAgendamentos: true,
    smsLembrete: true,
    smsMarketing: true,
    emailMarketing: true,
  }
}

export type Cliente = {
  id: string
  nome: string
  /** Telefone principal (formatado). Os demais ficam em `telefones`. */
  telefone: string
  email: string
  observacao: string
  /**
   * Status ativo/inativo. Inativar nunca apaga dados: histórico,
   * pagamentos e assinaturas permanecem. Registros antigos sem o campo
   * ganham `true` ao serem carregados.
   */
  ativo: boolean
  genero: ClienteGenero
  cpf: string
  cnpj: string
  /** '' ou 'YYYY-MM-DD' */
  nascimento: string
  etiquetas: string[]
  /** Instagram (com ou sem @) */
  instagram: string
  comoNosConheceu: string
  /** Telefones adicionais além do principal */
  telefones: TelefoneCliente[]
  endereco: EnderecoCliente | null
  preferencias: PreferenciasCliente
  criadoEm: string
  atualizadoEm: string
}

/**
 * Dígitos (sem formatação) de todos os telefones de um cadastro: principal
 * + adicionais. Vazios são ignorados. Usado na busca e na trava de
 * duplicidade pelo telefone.
 */
export function digitosDosTelefones(
  telefone: string,
  telefones: TelefoneCliente[] = [],
): string[] {
  return [telefone, ...telefones.map((t) => t.numero)]
    .map((numero) => numero.replace(/\D/g, ''))
    .filter(Boolean)
}

export type NovoClienteInput = {
  nome: string
  telefone: string
  email: string
  observacao: string
  /** Omitido = cliente nasce ativo */
  ativo?: boolean
  genero?: ClienteGenero
  cpf?: string
  cnpj?: string
  nascimento?: string
  etiquetas?: string[]
  instagram?: string
  comoNosConheceu?: string
  telefones?: TelefoneCliente[]
  endereco?: EnderecoCliente | null
  preferencias?: PreferenciasCliente
}
