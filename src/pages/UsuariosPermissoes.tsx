// Usuários e permissões — quem entra no painel e o que cada um pode fazer.
//
// A tela não inventa uma segunda regra de acesso: ela EDITA as exceções da
// mesma fonte que UI, rota e RLS leem (`perfis_permissoes`, migration 042).
// O que aparece aqui é sempre "padrão do papel" + exceção, e a exceção é
// gravada no banco — esconder um botão não é a segurança, a RLS é.
//
// Regras visíveis na tela:
//   • dono: acesso total, travado, nenhuma exceção é aceita (nem no banco);
//   • ninguém marca as próprias permissões (a RLS recusa a escrita);
//   • voltar ao padrão do papel APAGA a exceção, em vez de gravar o mesmo
//     valor — assim uma futura troca de papel não herda uma exceção morta.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ROTULO_FORM, CAMPO_FORM } from '@/lib/apresentacao'
import { useAuth } from '@/modules/auth/useAuth'
import { useAuthPermissao } from '@/modules/auth/useAuthPermissao'
import { papelTemPermissao, type AcaoPermissao, type PermissoesIndividuais } from '@/modules/auth/permissoes'
import type { PapelPerfil } from '@/modules/auth/tipos'
import { useProfissionais } from '@/modules/profissionais/store'
import type { Perfil } from '@/services/supabase/perfis'
import {
  atualizarPerfilDoUsuario,
  carregarPermissoesDaEquipe,
  criarUsuarioEquipe,
  definirPermissaoDoPerfil,
  listarPerfisEquipe,
} from '@/services/supabase/permissoes'

/**
 * Cada ação com o seu grupo e rótulo de leitura. `Record<AcaoPermissao, …>`
 * força o TypeScript a cobrir TODA a ação do mapa central: uma permissão
 * nova em `permissoes.ts` não compila aqui até ganhar nome na tela.
 */
const ACOES: Record<AcaoPermissao, { grupo: string; rotulo: string }> = {
  'agenda:ver_todas': { grupo: 'Agenda', rotulo: 'Ver a agenda de todos' },
  'agenda:ver_propria': { grupo: 'Agenda', rotulo: 'Ver a própria agenda' },
  'agenda:criar': { grupo: 'Agenda', rotulo: 'Criar agendamentos' },
  'agenda:editar': { grupo: 'Agenda', rotulo: 'Editar agendamentos' },
  'agenda:cancelar': { grupo: 'Agenda', rotulo: 'Cancelar agendamentos' },
  'agenda:concluir': { grupo: 'Agenda', rotulo: 'Concluir atendimentos' },
  'agenda:reagendar': { grupo: 'Agenda', rotulo: 'Reagendar atendimentos' },
  'agenda:bloqueios_gerenciar': { grupo: 'Agenda', rotulo: 'Gerenciar bloqueios' },
  'agenda:expediente_gerenciar': { grupo: 'Agenda', rotulo: 'Gerenciar expediente' },

  'clientes:ver': { grupo: 'Clientes', rotulo: 'Ver clientes' },
  'clientes:criar': { grupo: 'Clientes', rotulo: 'Cadastrar clientes' },
  'clientes:editar': { grupo: 'Clientes', rotulo: 'Editar clientes' },
  'clientes:excluir': { grupo: 'Clientes', rotulo: 'Excluir clientes' },
  'clientes:historico': { grupo: 'Clientes', rotulo: 'Ver o histórico do cliente' },

  'servicos:ver': { grupo: 'Serviços', rotulo: 'Ver serviços' },
  'servicos:criar': { grupo: 'Serviços', rotulo: 'Cadastrar serviços' },
  'servicos:editar': { grupo: 'Serviços', rotulo: 'Editar serviços' },
  'servicos:excluir': { grupo: 'Serviços', rotulo: 'Excluir serviços' },
  'servicos:ativar_inativar': { grupo: 'Serviços', rotulo: 'Ativar / inativar serviços' },

  'profissionais:ver': { grupo: 'Profissionais', rotulo: 'Ver profissionais' },
  'profissionais:criar': { grupo: 'Profissionais', rotulo: 'Cadastrar profissionais' },
  'profissionais:editar': { grupo: 'Profissionais', rotulo: 'Editar profissionais' },
  'profissionais:excluir': { grupo: 'Profissionais', rotulo: 'Excluir profissionais' },
  'profissionais:ativar_inativar': { grupo: 'Profissionais', rotulo: 'Ativar / inativar profissionais' },
  'profissionais:comissoes_configurar': { grupo: 'Profissionais', rotulo: 'Configurar comissões' },

  'caixa:ver': { grupo: 'Caixa e PDV', rotulo: 'Ver o caixa' },
  'caixa:lancar_receita': { grupo: 'Caixa e PDV', rotulo: 'Lançar receitas' },
  'caixa:lancar_despesa': { grupo: 'Caixa e PDV', rotulo: 'Lançar despesas' },
  'caixa:fechar': { grupo: 'Caixa e PDV', rotulo: 'Fechar o caixa' },
  'caixa:reabrir': { grupo: 'Caixa e PDV', rotulo: 'Reabrir o caixa' },
  'caixa:estornar': { grupo: 'Caixa e PDV', rotulo: 'Estornar lançamentos' },
  'caixa:auditoria_ver': { grupo: 'Caixa e PDV', rotulo: 'Ver a auditoria do caixa' },
  'pdv:vender': { grupo: 'Caixa e PDV', rotulo: 'Vender no PDV' },

  'comissoes:ver_todas': { grupo: 'Comissões', rotulo: 'Ver comissões de todos' },
  'comissoes:ver_proprias': { grupo: 'Comissões', rotulo: 'Ver as próprias comissões' },
  'comissoes:fechar': { grupo: 'Comissões', rotulo: 'Fechar comissões' },
  'comissoes:reabrir': { grupo: 'Comissões', rotulo: 'Reabrir comissões' },
  'comissoes:auditoria_ver': { grupo: 'Comissões', rotulo: 'Ver a auditoria de comissões' },

  'relatorios:ver': { grupo: 'Relatórios e financeiro', rotulo: 'Ver relatórios' },
  'financeiro:ver': { grupo: 'Relatórios e financeiro', rotulo: 'Ver o financeiro' },

  'estoque:ver': { grupo: 'Produtos e estoque', rotulo: 'Ver produtos e estoque' },
  'estoque:entrada': { grupo: 'Produtos e estoque', rotulo: 'Registrar entradas' },
  'estoque:ajuste': { grupo: 'Produtos e estoque', rotulo: 'Fazer ajustes de estoque' },
  'estoque:movimentacoes_ver': { grupo: 'Produtos e estoque', rotulo: 'Ver movimentações' },

  'clube:ver': { grupo: 'Audax Club', rotulo: 'Ver o clube de assinaturas' },
  'clube:assinatura_criar': { grupo: 'Audax Club', rotulo: 'Criar assinaturas' },
  'clube:assinatura_editar': { grupo: 'Audax Club', rotulo: 'Editar assinaturas' },
  'clube:pagamento_registrar': { grupo: 'Audax Club', rotulo: 'Registrar pagamentos' },
  'clube:pote_ver': { grupo: 'Audax Club', rotulo: 'Ver o fechamento do pote' },
  'clube:pote_fechar': { grupo: 'Audax Club', rotulo: 'Fechar o pote' },

  'crm:ver': { grupo: 'CRM', rotulo: 'Ver o CRM' },
  'crm:interacao_registrar': { grupo: 'CRM', rotulo: 'Registrar interações' },
  'crm:reativacao': { grupo: 'CRM', rotulo: 'Reativar clientes' },
  'crm:marketing': { grupo: 'CRM', rotulo: 'Campanhas de marketing' },
  'crm:automacoes': { grupo: 'CRM', rotulo: 'Automações' },

  'whatsapp:ver': { grupo: 'WhatsApp', rotulo: 'Ver o WhatsApp' },
  'whatsapp:mensagem_criar': { grupo: 'WhatsApp', rotulo: 'Criar mensagens' },
  'whatsapp:mensagem_enviar': { grupo: 'WhatsApp', rotulo: 'Enviar mensagens' },
  'whatsapp:falha_registrar': { grupo: 'WhatsApp', rotulo: 'Ver falhas de envio' },

  'ia:ver': { grupo: 'Central de IA', rotulo: 'Ver a central de IA' },
  'ia:analisar': { grupo: 'Central de IA', rotulo: 'Analisar conversas' },
  'ia:acao_confirmar': { grupo: 'Central de IA', rotulo: 'Confirmar ações da IA' },

  'config:ver': { grupo: 'Configurações', rotulo: 'Ver configurações' },
  'config:perfis_gerenciar': { grupo: 'Configurações', rotulo: 'Gerenciar usuários' },
  'config:permissoes_ver': { grupo: 'Configurações', rotulo: 'Ver e alterar permissões' },

  'espera:ver': { grupo: 'Fila de espera', rotulo: 'Ver a fila' },
  'espera:pedido_criar': { grupo: 'Fila de espera', rotulo: 'Criar pedidos' },
  'espera:pedido_editar': { grupo: 'Fila de espera', rotulo: 'Editar pedidos' },
  'espera:pedido_atender': { grupo: 'Fila de espera', rotulo: 'Atender pedidos' },
  'espera:pedido_cancelar': { grupo: 'Fila de espera', rotulo: 'Cancelar pedidos' },

  'fechamento:ver': { grupo: 'Fechamento de atendimento', rotulo: 'Ver o fechamento' },
  'fechamento:produtos_adicionar': { grupo: 'Fechamento de atendimento', rotulo: 'Adicionar produtos' },
  'fechamento:pagamento_processar': { grupo: 'Fechamento de atendimento', rotulo: 'Processar pagamento' },
  'fechamento:concluir': { grupo: 'Fechamento de atendimento', rotulo: 'Concluir o atendimento' },
}

const PAPEIS: { valor: PapelPerfil; rotulo: string; resumo: string }[] = [
  { valor: 'dono', rotulo: 'Dono', resumo: 'Acesso total, sem exceção possível' },
  { valor: 'admin', rotulo: 'Administrador', resumo: 'Gerencia usuários, permissões e exclusões' },
  { valor: 'gerente', rotulo: 'Gerente', resumo: 'Opera o negócio, sem gestão de acesso' },
  { valor: 'recepcao', rotulo: 'Recepção', resumo: 'Atendimento, clientes e caixa do dia' },
  { valor: 'profissional', rotulo: 'Profissional', resumo: 'A própria agenda e o próprio fechamento' },
]

type GrupoAcoes = { nome: string; acoes: AcaoPermissao[] }

function agruparAcoes(): GrupoAcoes[] {
  const ordem: string[] = []
  const porGrupo = new Map<string, AcaoPermissao[]>()
  for (const [acao, info] of Object.entries(ACOES) as [
    AcaoPermissao,
    { grupo: string; rotulo: string },
  ][]) {
    const lista = porGrupo.get(info.grupo)
    if (lista) {
      lista.push(acao)
    } else {
      porGrupo.set(info.grupo, [acao])
      ordem.push(info.grupo)
    }
  }
  return ordem.map((nome) => ({ nome, acoes: porGrupo.get(nome) ?? [] }))
}

function mensagem(erro: unknown): string {
  if (erro instanceof Error && erro.message) return erro.message
  return 'Não foi possível concluir a operação. Tente novamente.'
}

function Botao({
  children,
  onClick,
  desabilitado,
  secundario,
  perigo,
  rotuloAcessivel,
}: {
  children: React.ReactNode
  onClick: () => void
  desabilitado?: boolean
  secundario?: boolean
  perigo?: boolean
  /** Nome acessível quando o mesmo rótulo aparece em vários cartões. */
  rotuloAcessivel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-label={rotuloAcessivel}
      className={
        perigo
          ? 'rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50'
          : secundario
            ? 'rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA] disabled:opacity-50'
            : 'rounded-lg bg-[#C9A24A] px-4 py-2 text-sm font-semibold text-[#121110] hover:bg-[#A8842C] disabled:opacity-50'
      }
    >
      {children}
    </button>
  )
}

function Selo({ children, tom }: { children: React.ReactNode; tom: 'ativo' | 'inativo' | 'excecao' }) {
  const cores =
    tom === 'ativo'
      ? 'bg-emerald-50 text-emerald-700'
      : tom === 'excecao'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-[#F3ECDA] text-[#7C7469]'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cores}`}>
      {children}
    </span>
  )
}

export default function UsuariosPermissoes() {
  const { perfil: perfilLogado } = useAuth()
  const { pode } = useAuthPermissao()
  const { profissionais } = useProfissionais()

  const podeGerenciar = pode('config:perfis_gerenciar')
  const grupos = useMemo(() => agruparAcoes(), [])

  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [porPerfil, setPorPerfil] = useState<Record<string, PermissoesIndividuais>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)

  const [novoAberto, setNovoAberto] = useState(false)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [papelNovo, setPapelNovo] = useState<PapelPerfil>('profissional')
  const [profissionalVinculo, setProfissionalVinculo] = useState('')

  /**
   * Recarga manual (depois de criar um usuário). Dentro do efeito a carga
   * roda direto, para que o setState fique só no callback assíncrono —
   * padrão do projeto, sem setState síncrono no corpo do efeito.
   */
  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [lista, excecoes] = await Promise.all([
        listarPerfisEquipe(),
        carregarPermissoesDaEquipe(),
      ])
      setPerfis(lista)
      setPorPerfil(excecoes)
    } catch (falha) {
      setErro(mensagem(falha))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    let vivo = true
    void Promise.all([listarPerfisEquipe(), carregarPermissoesDaEquipe()])
      .then(([lista, excecoes]) => {
        if (!vivo) return
        setPerfis(lista)
        setPorPerfil(excecoes)
        setCarregando(false)
      })
      .catch((falha) => {
        if (!vivo) return
        setErro(mensagem(falha))
        setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [])

  const perfilSelecionado = perfis.find((p) => p.id === detalhe) ?? null

  const efetiva = useCallback(
    (perfil: Perfil, acao: AcaoPermissao): boolean => {
      if (perfil.papel === 'dono') return true
      const sobrescreve = porPerfil[perfil.id]?.[acao]
      if (sobrescreve !== undefined) return sobrescreve
      return papelTemPermissao(perfil.papel, acao)
    },
    [porPerfil],
  )

  async function alternar(perfil: Perfil, acao: AcaoPermissao) {
    const padrao = papelTemPermissao(perfil.papel, acao)
    const atual = porPerfil[perfil.id]?.[acao] ?? padrao
    const novo = !atual
    // igual ao padrão do papel = não é exceção: apaga a linha em vez de
    // gravar o mesmo valor.
    const destino = novo === padrao ? null : novo
    const chave = `${perfil.id}:${acao}`
    setSalvando(chave)
    setErro(null)
    setAviso(null)
    try {
      await definirPermissaoDoPerfil(perfil.id, acao, destino)
      setPorPerfil((atualPorPerfil) => {
        const doPerfil = { ...(atualPorPerfil[perfil.id] ?? {}) }
        if (destino === null) delete doPerfil[acao]
        else doPerfil[acao] = destino
        return { ...atualPorPerfil, [perfil.id]: doPerfil }
      })
    } catch (falha) {
      setErro(mensagem(falha))
    } finally {
      setSalvando(null)
    }
  }

  async function trocarPapel(perfil: Perfil, papel: PapelPerfil) {
    setSalvando(perfil.id)
    setErro(null)
    setAviso(null)
    try {
      const atualizado = await atualizarPerfilDoUsuario(perfil.id, { papel })
      setPerfis((lista) => lista.map((p) => (p.id === perfil.id ? atualizado : p)))
      setAviso(
        papel === 'dono'
          ? 'Dono passou a ter acesso total. As exceções antigas deixam de valer.'
          : 'Papel alterado. As exceções desta pessoa continuam valendo e aparecem marcadas abaixo.',
      )
    } catch (falha) {
      setErro(mensagem(falha))
    } finally {
      setSalvando(null)
    }
  }

  async function alternarAtivo(perfil: Perfil) {
    setSalvando(perfil.id)
    setErro(null)
    setAviso(null)
    try {
      const atualizado = await atualizarPerfilDoUsuario(perfil.id, { ativo: !perfil.ativo })
      setPerfis((lista) => lista.map((p) => (p.id === perfil.id ? atualizado : p)))
      if (!atualizado.ativo) {
        setAviso(
          'Usuário desativado: ele é deslogado na próxima verificação de sessão e não volta sem ser reativado.',
        )
      }
    } catch (falha) {
      setErro(mensagem(falha))
    } finally {
      setSalvando(null)
    }
  }

  async function criar() {
    setErro(null)
    setAviso(null)
    if (!nome.trim() || !email.trim()) {
      setErro('Preencha nome e e-mail do novo usuário.')
      return
    }
    if (senha.length < 8) {
      setErro('A senha precisa de pelo menos 8 caracteres.')
      return
    }
    setCriando(true)
    try {
      const resultado = await criarUsuarioEquipe({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        papel: papelNovo,
        profissionalId: profissionalVinculo || null,
      })
      setAviso(resultado.aviso ?? 'Usuário criado.')
      setNome('')
      setEmail('')
      setSenha('')
      setProfissionalVinculo('')
      setNovoAberto(false)
      await carregar()
    } catch (falha) {
      setErro(mensagem(falha))
    } finally {
      setCriando(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#121110]">
            Usuários e permissões
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#6B6353]">
            Cada pessoa entra com um papel, que é o padrão dela. Marque abaixo
            só o que fugir desse padrão — a exceção é gravada no servidor e
            vale na interface e no banco ao mesmo tempo.
          </p>
        </div>
        {podeGerenciar && (
          <Botao onClick={() => setNovoAberto((a) => !a)}>
            {novoAberto ? 'Cancelar' : '+ Novo usuário'}
          </Botao>
        )}
      </header>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{aviso}</p>
      )}

      {novoAberto && podeGerenciar && (
        <section className="rounded-xl border border-[#E5DCC3] bg-white p-5">
          <h2 className="text-base font-semibold text-[#121110]">Novo usuário</h2>
          <p className="mt-0.5 max-w-xl text-[13px] text-[#6B6353]">
            Cria o acesso de entrada e a linha de equipe ao mesmo tempo. A senha
            só é definida aqui — não fica guardada no painel.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={ROTULO_FORM} htmlFor="novo-nome">Nome</label>
              <input
                id="novo-nome"
                className={CAMPO_FORM}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={ROTULO_FORM} htmlFor="novo-email">E-mail</label>
              <input
                id="novo-email"
                type="email"
                className={CAMPO_FORM}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={ROTULO_FORM} htmlFor="novo-senha">Senha (mínimo 8)</label>
              <input
                id="novo-senha"
                type="password"
                className={CAMPO_FORM}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={ROTULO_FORM} htmlFor="novo-papel">Papel</label>
              <select
                id="novo-papel"
                className={CAMPO_FORM}
                value={papelNovo}
                onChange={(e) => setPapelNovo(e.target.value as PapelPerfil)}
              >
                {PAPEIS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo} — {p.resumo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={ROTULO_FORM} htmlFor="novo-profissional">
                Vincular a um profissional (opcional)
              </label>
              <select
                id="novo-profissional"
                className={CAMPO_FORM}
                value={profissionalVinculo}
                onChange={(e) => setProfissionalVinculo(e.target.value)}
              >
                <option value="">Sem vínculo</option>
                {profissionais
                  .filter((p) => p.ativo)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Botao onClick={criar} desabilitado={criando}>
              {criando ? 'Criando…' : 'Criar usuário'}
            </Botao>
            <Botao secundario onClick={() => setNovoAberto(false)}>
              Voltar
            </Botao>
          </div>
        </section>
      )}

      {carregando && (
        <p className="rounded-xl border border-[#E5DCC3] bg-white p-5 text-sm text-[#7C7469]">
          Carregando equipe…
        </p>
      )}

      {!carregando && !perfilSelecionado && (
        <section className="space-y-3">
          {perfis.length === 0 && (
            <p className="rounded-xl border border-[#E5DCC3] bg-white p-5 text-sm text-[#7C7469]">
              Nenhum usuário com acesso ao painel.
            </p>
          )}
          {perfis.map((p) => {
            const excecoes = Object.keys(porPerfil[p.id] ?? {}).length
            return (
              <article
                key={p.id}
                className="rounded-xl border border-[#E5DCC3] bg-white p-4"
                data-testid={`usuario-${p.email}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-[#121110]">
                      {p.nome}
                      {p.id === perfilLogado?.id && (
                        <span className="ml-2 text-[11px] font-normal text-[#7C7469]">(você)</span>
                      )}
                    </p>
                    <p className="truncate text-[13px] text-[#6B6353]">{p.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Selo tom={p.ativo ? 'ativo' : 'inativo'}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </Selo>
                      <Selo tom={excecoes > 0 ? 'excecao' : 'inativo'}>
                        {excecoes > 0
                          ? `${excecoes} exceção(ões) ao papel`
                          : 'Segue o padrão do papel'}
                      </Selo>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {podeGerenciar && (
                      <>
                        <select
                          aria-label={`Papel de ${p.nome}`}
                          className={`${CAMPO_FORM} w-auto`}
                          value={p.papel}
                          disabled={salvando === p.id}
                          onChange={(e) => trocarPapel(p, e.target.value as PapelPerfil)}
                        >
                          {PAPEIS.map((opcao) => (
                            <option key={opcao.valor} value={opcao.valor}>
                              {opcao.rotulo}
                            </option>
                          ))}
                        </select>
                        <Botao
                          secundario
                          perigo={p.ativo}
                          desabilitado={salvando === p.id}
                          rotuloAcessivel={`${p.ativo ? 'Desativar' : 'Reativar'} ${p.nome}`}
                          onClick={() => alternarAtivo(p)}
                        >
                          {p.ativo ? 'Desativar' : 'Reativar'}
                        </Botao>
                      </>
                    )}
                    <Botao
                      secundario
                      rotuloAcessivel={`Permissões de ${p.nome}`}
                      onClick={() => setDetalhe(p.id)}
                    >
                      Permissões
                    </Botao>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {!carregando && perfilSelecionado && (
        <section className="rounded-xl border border-[#E5DCC3] bg-white p-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#121110]">
                Permissões de {perfilSelecionado.nome}
              </h2>
              <p className="mt-0.5 max-w-2xl text-[13px] text-[#6B6353]">
                Papel atual: <strong>{PAPEIS.find((p) => p.valor === perfilSelecionado.papel)?.rotulo}</strong>.
                {perfilSelecionado.papel === 'dono'
                  ? ' O dono tem acesso total e não aceita exceção.'
                  : ' Desmarque para revogar, marque para conceder além do papel.'}
              </p>
            </div>
            <Botao secundario onClick={() => setDetalhe(null)}>
              Voltar para a equipe
            </Botao>
          </header>

          <div className="mt-4 space-y-5">
            {grupos.map((grupo) => (
              <div key={grupo.nome}>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-[#7C7469] uppercase">
                  {grupo.nome}
                </p>
                <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {grupo.acoes.map((acao) => {
                    const excecao = porPerfil[perfilSelecionado.id]?.[acao]
                    const marcada = efetiva(perfilSelecionado, acao)
                    const ehExcecao = excecao !== undefined && perfilSelecionado.papel !== 'dono'
                    const trava = perfilSelecionado.papel === 'dono' || !podeGerenciar
                    return (
                      <label
                        key={acao}
                        className={`flex items-start justify-between gap-3 rounded-lg border border-[#EFE7D3] bg-[#FDFBF3] px-3 py-2 ${
                          trava ? 'opacity-70' : 'cursor-pointer'
                        }`}
                      >
                        <span className="text-[13px] text-[#3A352C]">
                          {ACOES[acao].rotulo}
                          {ehExcecao && (
                            <span className="ml-2 text-[11px] font-semibold text-amber-700">
                              exceção
                            </span>
                          )}
                        </span>
                        <input
                          type="checkbox"
                          aria-label={`${ACOES[acao].rotulo} — ${perfilSelecionado.nome}`}
                          className="mt-0.5 h-4 w-4 accent-[#8A6A14]"
                          checked={marcada}
                          disabled={trava || salvando === `${perfilSelecionado.id}:${acao}`}
                          onChange={() => alternar(perfilSelecionado, acao)}
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
