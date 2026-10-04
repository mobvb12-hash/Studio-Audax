// ============================================================================
// Camada central de autorização do Studio Audax.
// Regras únicas de permissão por papel — usada na UI, rotas, ações e RLS.
// ============================================================================

import type { PapelPerfil } from './tipos'

/** Ações/recursos do sistema que podem ser protegidos. */
export type AcaoPermissao =
  // Agenda
  | 'agenda:ver_todas'
  | 'agenda:ver_propria'
  | 'agenda:criar'
  | 'agenda:editar'
  | 'agenda:cancelar'
  | 'agenda:concluir'
  | 'agenda:reagendar'
  | 'agenda:bloqueios_gerenciar'
  | 'agenda:expediente_gerenciar'

  // Clientes
  | 'clientes:ver'
  | 'clientes:criar'
  | 'clientes:editar'
  | 'clientes:excluir'
  | 'clientes:historico'

  // Serviços
  | 'servicos:ver'
  | 'servicos:criar'
  | 'servicos:editar'
  | 'servicos:excluir'
  | 'servicos:ativar_inativar'

  // Profissionais
  | 'profissionais:ver'
  | 'profissionais:criar'
  | 'profissionais:editar'
  | 'profissionais:excluir'
  | 'profissionais:ativar_inativar'
  | 'profissionais:comissoes_configurar'

  // Caixa / PDV
  | 'caixa:ver'
  | 'caixa:lancar_receita'
  | 'caixa:lancar_despesa'
  | 'caixa:fechar'
  | 'caixa:reabrir'
  | 'caixa:estornar'
  | 'caixa:auditoria_ver'
  | 'pdv:vender'

  // Comissões
  | 'comissoes:ver_todas'
  | 'comissoes:ver_proprias'
  | 'comissoes:fechar'
  | 'comissoes:reabrir'
  | 'comissoes:auditoria_ver'

  // Relatórios / Financeiro
  | 'relatorios:ver'
  | 'financeiro:ver'

  // Estoque / Produtos
  | 'estoque:ver'
  | 'estoque:entrada'
  | 'estoque:ajuste'
  | 'estoque:movimentacoes_ver'

  // Clube
  | 'clube:ver'
  | 'clube:assinatura_criar'
  | 'clube:assinatura_editar'
  | 'clube:pagamento_registrar'
  // Pote do Audax Club: calcular é leitura; fechar/reabrir é gerente+
  | 'clube:pote_ver'
  | 'clube:pote_fechar'

  // CRM
  | 'crm:ver'
  | 'crm:interacao_registrar'
  | 'crm:reativacao'
  | 'crm:marketing'
  | 'crm:automacoes'

  // WhatsApp
  | 'whatsapp:ver'
  | 'whatsapp:mensagem_criar'
  | 'whatsapp:mensagem_enviar'
  | 'whatsapp:falha_registrar'

  // IA
  | 'ia:ver'
  | 'ia:analisar'
  | 'ia:acao_confirmar'

  // Configurações / Admin
  | 'config:ver'
  | 'config:perfis_gerenciar'
  | 'config:permissoes_ver'

  // Fila de espera
  | 'espera:ver'
  | 'espera:pedido_criar'
  | 'espera:pedido_editar'
  | 'espera:pedido_atender'
  | 'espera:pedido_cancelar'

  // Fechamento de atendimento
  | 'fechamento:ver'
  | 'fechamento:produtos_adicionar'
  | 'fechamento:pagamento_processar'
  | 'fechamento:concluir'

// Mapa de permissões por papel.
// REGRA: dono = admin + barbeiro (acesso total + agenda própria)
const PERMISSOES_POR_PAPEL: Record<PapelPerfil, AcaoPermissao[]> = {
  dono: [
    // Acesso total (herda de admin)
    'agenda:ver_todas', 'agenda:ver_propria', 'agenda:criar', 'agenda:editar',
    'agenda:cancelar', 'agenda:concluir', 'agenda:reagendar', 'agenda:bloqueios_gerenciar',
    'agenda:expediente_gerenciar',
    'clientes:ver', 'clientes:criar', 'clientes:editar', 'clientes:excluir', 'clientes:historico',
    'servicos:ver', 'servicos:criar', 'servicos:editar', 'servicos:excluir', 'servicos:ativar_inativar',
    'profissionais:ver', 'profissionais:criar', 'profissionais:editar', 'profissionais:excluir',
    'profissionais:ativar_inativar', 'profissionais:comissoes_configurar',
    'caixa:ver', 'caixa:lancar_receita', 'caixa:lancar_despesa', 'caixa:fechar',
    'caixa:reabrir', 'caixa:estornar', 'caixa:auditoria_ver', 'pdv:vender',
    'comissoes:ver_todas', 'comissoes:ver_proprias', 'comissoes:fechar',
    'comissoes:reabrir', 'comissoes:auditoria_ver',
    'relatorios:ver', 'financeiro:ver',
    'estoque:ver', 'estoque:entrada', 'estoque:ajuste', 'estoque:movimentacoes_ver',
    'clube:ver', 'clube:pote_ver', 'clube:assinatura_criar', 'clube:assinatura_editar', 'clube:pagamento_registrar',
    'crm:ver', 'crm:interacao_registrar', 'crm:reativacao', 'crm:marketing', 'crm:automacoes',
    'whatsapp:ver', 'whatsapp:mensagem_criar', 'whatsapp:mensagem_enviar', 'whatsapp:falha_registrar',
    'ia:ver', 'ia:analisar', 'ia:acao_confirmar',
    'config:ver', 'config:perfis_gerenciar', 'config:permissoes_ver',
    'espera:ver', 'espera:pedido_criar', 'espera:pedido_editar', 'espera:pedido_atender', 'espera:pedido_cancelar',
    'fechamento:ver', 'fechamento:produtos_adicionar', 'fechamento:pagamento_processar', 'fechamento:concluir',
  ],
  admin: [
    'agenda:ver_todas', 'agenda:ver_propria', 'agenda:criar', 'agenda:editar',
    'agenda:cancelar', 'agenda:concluir', 'agenda:reagendar', 'agenda:bloqueios_gerenciar',
    'agenda:expediente_gerenciar',
    'clientes:ver', 'clientes:criar', 'clientes:editar', 'clientes:excluir', 'clientes:historico',
    'servicos:ver', 'servicos:criar', 'servicos:editar', 'servicos:excluir', 'servicos:ativar_inativar',
    'profissionais:ver', 'profissionais:criar', 'profissionais:editar', 'profissionais:excluir',
    'profissionais:ativar_inativar', 'profissionais:comissoes_configurar',
    'caixa:ver', 'caixa:lancar_receita', 'caixa:lancar_despesa', 'caixa:fechar',
    'caixa:reabrir', 'caixa:estornar', 'caixa:auditoria_ver', 'pdv:vender',
    'comissoes:ver_todas', 'comissoes:ver_proprias', 'comissoes:fechar',
    'comissoes:reabrir', 'comissoes:auditoria_ver',
    'relatorios:ver', 'financeiro:ver',
    'estoque:ver', 'estoque:entrada', 'estoque:ajuste', 'estoque:movimentacoes_ver',
    'clube:ver', 'clube:pote_ver', 'clube:assinatura_criar', 'clube:assinatura_editar', 'clube:pagamento_registrar',
    'crm:ver', 'crm:interacao_registrar', 'crm:reativacao', 'crm:marketing', 'crm:automacoes',
    'whatsapp:ver', 'whatsapp:mensagem_criar', 'whatsapp:mensagem_enviar', 'whatsapp:falha_registrar',
    'ia:ver', 'ia:analisar', 'ia:acao_confirmar',
    'config:ver', 'config:perfis_gerenciar', 'config:permissoes_ver',
    'espera:ver', 'espera:pedido_criar', 'espera:pedido_editar', 'espera:pedido_atender', 'espera:pedido_cancelar',
    'fechamento:ver', 'fechamento:produtos_adicionar', 'fechamento:pagamento_processar', 'fechamento:concluir',
  ],
  gerente: [
    'agenda:ver_todas', 'agenda:ver_propria', 'agenda:criar', 'agenda:editar',
    'agenda:cancelar', 'agenda:concluir', 'agenda:reagendar', 'agenda:bloqueios_gerenciar',
    'agenda:expediente_gerenciar',
    'clientes:ver', 'clientes:criar', 'clientes:editar', 'clientes:historico',
    'servicos:ver', 'servicos:criar', 'servicos:editar', 'servicos:ativar_inativar',
    'profissionais:ver', 'profissionais:criar', 'profissionais:editar', 'profissionais:ativar_inativar',
    'profissionais:comissoes_configurar',
    'caixa:ver', 'caixa:lancar_receita', 'caixa:lancar_despesa', 'caixa:fechar',
    'caixa:reabrir', 'caixa:estornar', 'caixa:auditoria_ver', 'pdv:vender',
    'comissoes:ver_todas', 'comissoes:ver_proprias', 'comissoes:fechar',
    'comissoes:reabrir', 'comissoes:auditoria_ver',
    'relatorios:ver', 'financeiro:ver',
    'estoque:ver', 'estoque:entrada', 'estoque:ajuste', 'estoque:movimentacoes_ver',
    'clube:ver', 'clube:pote_ver', 'clube:assinatura_criar', 'clube:assinatura_editar', 'clube:pagamento_registrar',
    'crm:ver', 'crm:interacao_registrar', 'crm:reativacao', 'crm:marketing', 'crm:automacoes',
    'whatsapp:ver', 'whatsapp:mensagem_criar', 'whatsapp:mensagem_enviar', 'whatsapp:falha_registrar',
    'ia:ver', 'ia:analisar', 'ia:acao_confirmar',
    'config:ver',
    'espera:ver', 'espera:pedido_criar', 'espera:pedido_editar', 'espera:pedido_atender', 'espera:pedido_cancelar',
    'fechamento:ver', 'fechamento:produtos_adicionar', 'fechamento:pagamento_processar', 'fechamento:concluir',
  ],
  recepcao: [
    'agenda:ver_todas', 'agenda:ver_propria', 'agenda:criar', 'agenda:editar',
    'agenda:cancelar', 'agenda:concluir', 'agenda:reagendar',
    'clientes:ver', 'clientes:criar', 'clientes:editar', 'clientes:historico',
    'servicos:ver',
    'profissionais:ver',
    'caixa:ver', 'caixa:lancar_receita', 'caixa:lancar_despesa', 'caixa:fechar',
    'pdv:vender',
    'comissoes:ver_proprias',
    'estoque:ver',
    'clube:ver', 'clube:pagamento_registrar',
    'crm:ver', 'crm:interacao_registrar', 'crm:reativacao',
    'whatsapp:ver', 'whatsapp:mensagem_criar', 'whatsapp:mensagem_enviar',
    'ia:ver',
    'espera:ver', 'espera:pedido_criar', 'espera:pedido_editar', 'espera:pedido_atender', 'espera:pedido_cancelar',
    'fechamento:ver', 'fechamento:produtos_adicionar', 'fechamento:pagamento_processar', 'fechamento:concluir',
  ],
  profissional: [
    'agenda:ver_propria', 'agenda:criar', 'agenda:editar', 'agenda:concluir', 'agenda:reagendar',
    'clientes:ver', 'clientes:historico',
    'servicos:ver',
    'profissionais:ver',
    'comissoes:ver_proprias',
    'fechamento:ver', 'fechamento:concluir',
  ],
}

/**
 * Permissões individuais de UMA pessoa (overrides gravados em
 * `perfis_permissoes`). Ausente a chave = a regra é a do papel.
 *
 * É o terceiro nível do sistema: papel (padrão) → override (exceção) →
 * RLS (banco). O mesmo valor decide a UI, a rota e o acesso de verdade.
 */
export type PermissoesIndividuais = Partial<Record<AcaoPermissao, boolean>>

/** Verifica se um papel tem uma permissão específica. */
export function papelTemPermissao(papel: PapelPerfil, acao: AcaoPermissao): boolean {
  return PERMISSOES_POR_PAPEL[papel]?.includes(acao) ?? false
}

/** Verifica se o usuário (com papel) tem permissão para uma ação. */
export function usuarioTemPermissao(papel: PapelPerfil | null | undefined, acao: AcaoPermissao): boolean {
  if (!papel) return false
  return papelTemPermissao(papel, acao)
}

/**
 * Permissão EFETIVA: papel + exceção individual.
 *
 * - sem exceção → exatamente a regra do papel (nenhuma mudança para quem
 *   ainda não gravou override);
 * - exceção `false` → nega mesmo que o papel permita (revogação);
 * - exceção `true` → concede mesmo que o papel negue (concessão);
 * - `dono` → sempre `true`: o dono é invariável e nunca é limitado.
 *
 * Sem sessão (`papel` nulo) continua negando — um override nunca cria
 * acesso sozinho, ele só ajusta quem já tem papel.
 */
export function usuarioTemPermissaoEfetiva(
  papel: PapelPerfil | null | undefined,
  acao: AcaoPermissao,
  individuais?: PermissoesIndividuais | null,
): boolean {
  if (!papel) return false
  if (papel === 'dono') return true
  const sobrescreve = individuais?.[acao]
  if (sobrescreve !== undefined) return sobrescreve
  return papelTemPermissao(papel, acao)
}

/** Retorna todas as permissões de um papel. */
export function permissoesDoPapel(papel: PapelPerfil): readonly AcaoPermissao[] {
  return PERMISSOES_POR_PAPEL[papel] ?? []
}

/** Verifica se o papel é administrativo (dono, admin, gerente). */
export function ehPapelAdministrativo(papel: PapelPerfil): boolean {
  return papel === 'dono' || papel === 'admin' || papel === 'gerente'
}

/** Verifica se o papel é operacional (recepção, profissional). */
export function ehPapelOperacional(papel: PapelPerfil): boolean {
  return papel === 'recepcao' || papel === 'profissional'
}

/** Ações que liberam cada página. Uma página sem restrição específica é aberta. */
const PAGINAS_ACOES: Record<string, AcaoPermissao[]> = {
  painel: [],
  agenda: ['agenda:ver_todas', 'agenda:ver_propria'],
  fila: ['espera:ver'],
  pdv: ['pdv:vender'],
  caixa: ['caixa:ver'],
  clientes: ['clientes:ver'],
  crm: ['crm:ver'],
  whatsapp: ['whatsapp:ver'],
  profissionais: ['profissionais:ver'],
  servicos: ['servicos:ver'],
  comissoes: ['comissoes:ver_todas', 'comissoes:ver_proprias'],
  clube: ['clube:ver'],
  pote: ['clube:pote_ver'],
  estoque: ['estoque:ver'],
  financeiro: ['financeiro:ver'],
  relatorios: ['relatorios:ver'],
  ia: ['ia:ver'],
  configuracoes: ['config:ver'],
  usuarios: ['config:permissoes_ver'],
}

/** Verifica se o usuário pode acessar uma página/rota. */
export function podeAcessarPagina(papel: PapelPerfil | null | undefined, pagina: string): boolean {
  return podeAcessarPaginaEfetiva(papel, pagina)
}

/**
 * Acesso à página considerando as permissões individuais — é a regra que
 * o menu e a rota usam, então um item escondido e uma URL digitada à mão
 * passam pelo mesmo crivo.
 */
export function podeAcessarPaginaEfetiva(
  papel: PapelPerfil | null | undefined,
  pagina: string,
  individuais?: PermissoesIndividuais | null,
): boolean {
  if (!papel) return false

  const permissoesNecessarias = PAGINAS_ACOES[pagina]
  if (!permissoesNecessarias || permissoesNecessarias.length === 0) return true // páginas sem restrição específica

  return permissoesNecessarias.some((acao) =>
    usuarioTemPermissaoEfetiva(papel, acao, individuais),
  )
}

/** Verifica se o profissional pode ver/editar dados de outro profissional. */
export function profissionalPodeAcessarDadosDe(
  papel: PapelPerfil,
  profissionalIdLogado: string | null | undefined,
  profissionalIdAlvo: string
): boolean {
  if (ehPapelAdministrativo(papel)) return true
  if (papel === 'profissional') return profissionalIdLogado === profissionalIdAlvo
  return false
}

/** Verifica se pode ver dados financeiros/comissões de outro profissional. */
export function podeVerFinanceiroDeOutro(papel: PapelPerfil): boolean {
  return ehPapelAdministrativo(papel)
}