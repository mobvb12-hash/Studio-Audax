// ============================================================================
// Agendamento público — o orquestrador do fluxo passo a passo.
//
// Uma etapa por vez. A pessoa escolhe, a tela avança. Ela volta quando quiser e
// o que já foi escolhido continua lá — a menos que a troca tenha tornado a
// escolha seguinte inválida (trocar o serviço zera o dia; trocar o dia zera o
// horário; complemento que não cabe devolve o horário).
//
// NENHUMA REGRA DE DISPONIBILIDADE AQUI.
//
// Horário livre é sempre `horariosLivresPorProfissional`, com expediente, almoço,
// bloqueio e ocupação da Agenda. Este arquivo só lembra o que a pessoa escolheu
// e pergunta à Agenda o que está livre.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BlocoBarbearia from '@/modules/painel/telas/BlocoBarbearia'
import { SecaoAudaxClub } from './club'
import {
  irParaAreaDoCliente,
  lerPreenchimento,
  lerRetomadaAgendamento,
  limparPreenchimento,
  limparRetomadaAgendamento,
  mensagemErroCadastro,
  nomeValido,
  nascimentoValido,
  salvarRetomadaAgendamento,
  senhaValida,
  telefoneValido,
} from '@/modules/painel/regras'
import { mensagemErroEntrada } from '@/modules/auth/regras'
import { clientePainel, obterMeuCadastro } from '@/services/supabase/painel'
import { formatarBRL } from '@/lib/moeda'
import {
  carregarCatalogo,
  criarAgendamentoPublico,
  horariosPublicosPorProfissional,
  type CatalogoPublico,
} from '@/services/supabase/agendaPublica'
import {
  alternarComplemento as alternarComplementoEstado,
  complementosDisponiveis,
  dadosValidos,
  escolherData as escolherDataEstado,
  escolherHorario as escolherHorarioEstado,
  escolherProfissional as escolherProfissionalEstado,
  escolherServico as escolherServicoEstado,
  etapaAnterior,
  etapaBloqueia,
  ESTADO_VAZIO,
  invalidateHorarioSeNaoCabe,
  selecao,
  servicosAdicionais,
  type EstadoAgendamento,
  type Etapa,
  type ItemCatalogo,
} from './estado'
import {
  Aviso,
  Botao,
  BotaoDia,
  BotaoEntrar,
  BotaoHora,
  Campo,
  CarrosselDestaques,
  CartaoProfissional,
  Carregando,
  Confirmacao,
  EquipeVitrine,
  GaleriaBarbearia,
  LinhaResumo,
  Marca,
  Progresso,
  Resumo,
  ListaServicos,
  Tela,
  dataPorExtenso,
} from './ui'

/** Quantos dias à frente oferecemos, na grade de datas. */
const DIAS_A_FRENTE = 21

/**
 * Chave da linha do Audax Club dentro de `abertos`.
 *
 * Vive no mesmo conjunto das linhas de serviço porque é a MESMA mecânica: uma
 * linha fechada que abre as opções abaixo. Se um dia o Club virar outro
 * accordion, esta constante é o único lugar a mudar.
 */
const AUDAX_CLUB = '__club__'

/** Próximos dias a partir de hoje — atalho de data sem calendário nativo. */
function proximosDias(quantidade: number): string[] {
  const dias: string[] = []
  const base = new Date()
  for (let passo = 0; passo < 45 && dias.length < quantidade; passo += 1) {
    const d = new Date(base.getTime() + passo * 86400000)
    // Data LOCAL (America/Recife), nunca `toISOString()`: em UTC-3, à noite,
    // o UTC já virou o dia seguinte e ofereceríamos "hoje" como "amanhã".
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    const dia = String(d.getDate()).padStart(2, '0')
    dias.push(`${d.getFullYear()}-${mes}-${dia}`)
  }
  return dias
}

export default function FluxoAgendamento() {
  const [catalogo, setCatalogo] = useState<CatalogoPublico | null>(null)
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true)
  const [tentativa] = useState(0)

  const [estado, setEstado] = useState<EstadoAgendamento>(ESTADO_VAZIO)
  const [etapa, setEtapa] = useState<Etapa>('servico')

  /*
   * Linhas que a pessoa abriu na vitrine (serviço ou Club).
   *
   * É apresentação, e por isso mora aqui e não na máquina de estados — mas
   * mora NESTE componente, que não desmonta entre etapas. Sem isso, voltar do
   * barbeiro remontaria a vitrine com tudo fechado e a pessoa perderia de vista
   * o serviço que acabou de escolher.
   */
  const [abertos, setAbertos] = useState<string[]>([])

  const alternarAberto = useCallback((chave: string) => {
    setAbertos((atual) =>
      atual.includes(chave)
        ? atual.filter((c) => c !== chave)
        : [...atual, chave],
    )
  }, [])

  /*
   * A identificação: a pessoa pode concluir o agendamento sem conta?
   *
   * Não pode. Serviço, profissional, data e horário são escolhidos antes —
   * é o que o fluxo pede — e na hora de sair daí a conta é obrigatória.
   *
   * `verificando` existe para não decidir às cegas: a sessão mora no
   * `localStorage` do Supabase e leva milissegundos, mas o primeiro clique
   * pode chegar antes. Preferimos segurar um instante a mandar para o cadastro
   * alguém que já está logado.
   *
   * A sessão é lida pelo MESMO contrato da Área do Cliente
   * (`ClientePainel`): um único sistema de autenticação, não dois.
   */
  const [identificacao, setIdentificacao] = useState<
    'verificando' | 'autenticado' | 'anonimo'
  >('verificando')
  /*
   * O portão está aberto de propósito — a pessoa tentou seguir sem conta.
   *
   * Separado de `identificacao` porque é uma intenção, não um fato: ela pode
   * ter clicado em "Voltar" e voltado a escolher horário.
   */
  const [portaoAberto, setPortaoAberto] = useState(false)

  /*
   * Ao montar: descobre se há sessão e, se houver, se há um rascunho para
   * restaurar. É o ponto de retorno de quem foi identificar-se: o fluxo salvou
   * as escolhas, mandou para `/cliente`, e a conta pronta volta para cá.
   */
  useEffect(() => {
    let vivo = true
    const db = clientePainel()

    const decidir = (autenticado: boolean) => {
      if (!vivo) return
      setIdentificacao(autenticado ? 'autenticado' : 'anonimo')
      if (!autenticado) return

      const rascunho = lerRetomadaAgendamento()
      if (rascunho) {
        limparRetomadaAgendamento()
        setEstado(rascunho)
        setEtapa('complementos')
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      // Sem rascunho é uma visita normal logada. O formulário nasce
      // preenchido com o que a casa já sabe — mas só quando está vazio: quem
      // já digitou não tem o que foi digitado trocado por baixo.
      //
      // Duas fontes, nessa ordem: o preenchimento que a ÁREA DO CLIENTE
      // deixou ao mandar a pessoa para cá (o intento mais recente), e senão o
      // cadastro ligado à sessão. A primeira é de uma visita só; a segunda é
      // sempre atual.
      const preenchimento = lerPreenchimento()
      if (preenchimento) {
        limparPreenchimento()
        setEstado((atual) =>
          atual.nome.trim()
            ? atual
            : { ...atual, nome: preenchimento.nome, telefone: preenchimento.telefone },
        )
        return
      }

      void obterMeuCadastro()
        .then((cad) => {
          if (!vivo || !cad) return
          setEstado((atual) =>
            atual.nome.trim()
              ? atual
              : { ...atual, nome: cad.nome, telefone: cad.telefone },
          )
        })
        .catch(() => {
          // Sem cadastro vinculado ou rede fora: o formulário continua vazio.
        })
    }

    // Tudo assíncrono de propósito: `setState` no corpo do efeito é proibido
    // pelas regras do lint, e sem Supabase também precisa sair de
    // `verificando` — senão o portão ficaria carregando para sempre.
    Promise.resolve(db ? db.sessao() : null)
      .then((sessao) => decidir(Boolean(sessao)))
      .catch(() => decidir(false))
    const cancelar = db ? db.observar((sessao) => decidir(Boolean(sessao))) : () => {}
    return () => {
      vivo = false
      cancelar()
    }
  }, [])

  // Horários do dia escolhido — sempre da Agenda, nunca calculados aqui.
  const [slots, setSlots] = useState<string[]>([])
  const [carregandoSlots, setCarregandoSlots] = useState(false)

  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState<{
    cliente: string
    servico: string
    complementos: string[]
    profissional: string
    data: string
    horario: string
    valor: number
  } | null>(null)

  // Guarda a escolha do passo anterior sem mostrar (o React estrita monta duas
  // vezes em dev): só o valor importa.
  const redirecionarPara = useRef<Etapa | null>(null)

  useEffect(() => {
    let vivo = true
    carregarCatalogo()
      .then((c) => {
        if (!vivo) return
        setCatalogo(c)
        setCarregandoCatalogo(false)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErro(
          e instanceof Error ? e.message : 'Não foi possível carregar os serviços.',
        )
        setCarregandoCatalogo(false)
      })
    return () => {
      vivo = false
    }
  }, [tentativa])

  const servicos = useMemo(() => catalogo?.servicos ?? [], [catalogo])
  /*
   * A vitrine é a página que o dono divulga no Instagram: ela NÃO pode quebrar
   * por um campo a menos. `destaques` e `foto` são as únicas coisas novas aqui,
   * então ambos caem no padrão (lista vazia / sem imagem) em vez de derrubar a
   * tela inteira.
   */
  const { base, complementos, duracaoMin, valor } = useMemo(
    () => selecao(estado, servicos),
    [estado, servicos],
  )
  const disponiveis = useMemo(
    () => complementosDisponiveis(servicos, estado.servicoNome),
    [servicos, estado.servicoNome],
  )

  /* ---------------------------------------------------------------- */
  /* Navegação                                                          */
  /* ---------------------------------------------------------------- */

  const avancar = useCallback((destino: Etapa) => {
    redirecionarPara.current = destino
    setEtapa(destino)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    // Aplica a navegação pedida no clique (fora do setState do handler, para
    // não quebrar a cascata de render que o lint penaliza).
    if (redirecionarPara.current === null) return
    const destino = redirecionarPara.current
    redirecionarPara.current = null
    if (destino !== etapa) setEtapa(destino)
  }, [etapa])

  const voltar = useCallback(() => {
    avancar(etapaAnterior(etapa))
  }, [avancar, etapa])

  /**
   * Desiste da identificação e volta para onde ela foi pedida.
   *
   * Não mexe em `etapa`: o portão é uma moldura sobre a etapa que estava na
   * tela — horário quando a pessoa tentou seguir, resumo quando faltou um
   * detalhe na hora de confirmar. Fechar é devolver a mesma tela, com as
   * escolhas intactas.
   *
   * O rascunho é que sai do ar: ele existe para atravessar este portão, e sem
   * sessão não há quem o guarde depois.
   */
  const desistirDaIdentificacao = useCallback(() => {
    limparRetomadaAgendamento()
    setPortaoAberto(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /* ---------------------------------------------------------------- */
  /* Horários: sempre a regra da Agenda                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Recarrega a grade sob demanda — quando o servidor diz que o horário
   * acabou de ser ocupado. O efeito da etapa é quem busca a lista ao abrir; aqui
   * só repetimos a busca, e é por isso que ligar o "carregando" é seguro.
   */
  const recarregarSlots = useCallback(async () => {
    if (!estado.data || !estado.profissional || !duracaoMin) {
      setSlots([])
      return
    }
    setCarregandoSlots(true)
    try {
      const livres = await horariosPublicosPorProfissional(
        estado.data,
        duracaoMin,
        [estado.profissional],
      )
      setSlots(livres.map((s) => s.horario))
    } catch (e: unknown) {
      setSlots([])
      setErro(
        e instanceof Error ? e.message : 'Não foi possível carregar os horários.',
      )
    } finally {
      setCarregandoSlots(false)
    }
  }, [estado.data, estado.profissional, duracaoMin])

  useEffect(() => {
    if (etapa !== 'horario' && etapa !== 'complementos') return
    if (!estado.data || !estado.profissional || !duracaoMin) return
    // O estado "carregando" é ligado no EVENTO (o clique que abriu a etapa),
    // não no corpo do efeito: é o que evita o render em cascata que o lint
    // penaliza. Aqui só Assíncrono.
    let vivo = true
    void horariosPublicosPorProfissional(estado.data, duracaoMin, [
      estado.profissional,
    ])
      .then((livres) => {
        if (vivo) setSlots(livres.map((s) => s.horario))
      })
      .catch(() => {
        if (vivo) setSlots([])
      })
    return () => {
      vivo = false
    }
  }, [etapa, estado.data, estado.profissional, duracaoMin])

  /**
   * Complemento escolhido: a duração muda, então o horário pode ter deixado de
   * caber. Buscamos a lista de novo e, se o horário sumiu, devolvemos para a
   * pessoa escolher outro — em vez de prometer um horário que o servidor recusa.
   */
  const alternarComplemento = useCallback(
    (id: string) => {
      setErro('')
      const proximo = alternarComplementoEstado(estado, id)
      setEstado(proximo)
      const novaDuracao = selecao(proximo, servicos).duracaoMin
      if (!estado.data || !estado.profissional || !novaDuracao) return
      void (async () => {
        setCarregandoSlots(true)
        try {
          const livres = await horariosPublicosPorProfissional(
            estado.data,
            novaDuracao,
            [estado.profissional],
          )
          const horas = livres.map((s) => s.horario)
          setSlots(horas)
          const revisto = invalidateHorarioSeNaoCabe(proximo, horas)
          if (revisto.horario === '') {
            setEstado(revisto)
            setErro(
              'Esse complemento não cabe mais no horário escolhido. Escolha outro horário.',
            )
          }
        } catch {
          setSlots([])
        } finally {
          setCarregandoSlots(false)
        }
      })()
    },
    [estado, servicos],
  )

  /* ---------------------------------------------------------------- */
  /* Escolhas                                                           */
  /* ---------------------------------------------------------------- */

  function escolherServico(nome: string) {
    const proximo = escolherServicoEstado(estado, nome, [])
    setEstado(proximo)
    setErro('')
    avancar('profissional')
  }

  function escolherProfissional(nome: string) {
    setEstado(escolherProfissionalEstado(estado, nome))
    setErro('')
    avancar('data')
  }

  function escolherData(iso: string) {
    setEstado(escolherDataEstado(estado, iso))
    setErro('')
    avancar('horario')
  }

  function escolherHorario(hora: string) {
    const proximo = escolherHorarioEstado(estado, hora)
    setEstado(proximo)
    setErro('')
    avancar('complementos')
  }

  async function confirmar() {
    if (enviando || !base || !dadosValidos(estado)) return
    /*
     * Última trincheira antes do banco, por via das dúvidas: se alguma porta
     * de trás deixou a sessão cair no meio do caminho, não se reserva hora de
     * ninguém no escuro. O rascunho fica salvo — ao entrar, a pessoa pega
     * exatamente de onde parou.
     */
    if (identificacao !== 'autenticado') {
      salvarRetomadaAgendamento(estado)
      setPortaoAberto(true)
      return
    }
    setErro('')
    setEnviando(true)
    try {
      const resultado = await criarAgendamentoPublico({
        cliente: estado.nome,
        telefone: estado.telefone,
        servico: base.nome,
        profissional: estado.profissional,
        data: estado.data,
        horario: estado.horario,
        observacao: estado.observacao,
        complementos: estado.complementoIds,
      })
      if (!resultado.ok) {
        setErro(resultado.erro)
        // Horário tomado entre a lista e o envio: volta para a etapa de
        // horário com a lista nova, sem perder o que a pessoa escolheu.
        if (/ocupado|conflito|indispon/i.test(resultado.erro)) {
          avancar('horario')
          await recarregarSlots()
        }
        return
      }
      setConfirmado({
        cliente: estado.nome.trim(),
        servico: base.nome,
        complementos: complementos.map((c) => c.nome),
        profissional: estado.profissional,
        data: estado.data,
        horario: estado.horario,
        valor,
      })
      avancar('confirmacao')
    } finally {
      setEnviando(false)
    }
  }

  function recomecar() {
    setConfirmado(null)
    setEstado(ESTADO_VAZIO)
    setSlots([])
    setErro('')
    avancar('servico')
  }

  /* ---------------------------------------------------------------- */
  /* Telas                                                              */
  /* ---------------------------------------------------------------- */

  if (carregandoCatalogo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-100">
        <Carregando texto="Carregando os serviços…" />
      </div>
    )
  }

  if (!catalogo || catalogo.servicos.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-cream-50 p-6 text-center">
          <h1 className="font-display text-[20px] font-semibold text-noir-900">
            Studio Audax
          </h1>
          <p className="mt-2 text-[14px] text-noir-500">
            Nenhum serviço disponível no momento. Tente mais tarde.
          </p>
        </div>
      </div>
    )
  }

  /*
   * O portão manda na página inteira, não só na etapa: ele não faz sentido
   * junto do rodapé de serviços nem do resumo de quem está prestes a reservar.
   * Fica depois dos guardas de catálogo — sem serviços não há que reservar.
   */
  if (portaoAberto && identificacao !== 'autenticado') {
    return (
      <EtapaIdentificacao
        identificacao={identificacao}
        aoDesistir={desistirDaIdentificacao}
        aoIdentificado={(dados) => {
          setIdentificacao('autenticado')
          setPortaoAberto(false)
          setEstado((atual) => ({
            ...atual,
            nome: dados.nome.trim() || atual.nome,
            telefone: dados.telefone.trim() || atual.telefone,
          }))
          avancar('complementos')
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    )
  }

  return (
    <EtapaConteudo
      etapa={etapa}
      catalogo={catalogo}
      estado={estado}
      base={base}
      complementos={complementos}
      disponiveis={disponiveis}
      duracaoMin={duracaoMin}
      valor={valor}
      valorBase={base?.preco ?? 0}
      slots={slots}
      carregandoSlots={carregandoSlots}
      erro={erro}
      enviando={enviando}
      confirmado={confirmado}
      abertos={abertos}
      aoAlternar={alternarAberto}
      aoEscolherServico={escolherServico}
      aoEscolherProfissional={escolherProfissional}
      aoEscolherData={escolherData}
      aoEscolherHorario={escolherHorario}
      aoAlternarComplemento={alternarComplemento}
      aoConfirmar={() => void confirmar()}
      aoRecomecar={recomecar}
      aoVoltar={voltar}
      aoAvancar={avancar}
      identificacao={identificacao}
      aoIdentificado={(dados) => {
        setIdentificacao('autenticado')
        setPortaoAberto(false)
        setEstado((atual) => ({
          ...atual,
          nome: dados.nome.trim() || atual.nome,
          telefone: dados.telefone.trim() || atual.telefone,
        }))
        if (etapa !== 'dados') avancar('complementos')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }}
      aoDefinir={(campo, novo) =>
        setEstado((atual) => ({ ...atual, [campo]: novo }))
      }
    />
  )
}

/* ------------------------------------------------------------------ */
/* As telas, separadas para o arquivo não ficar gigante                  */
/* ------------------------------------------------------------------ */

type PropsEtapa = {
  etapa: Etapa
  catalogo: CatalogoPublico
  estado: EstadoAgendamento
  base: ReturnType<typeof selecao>['base']
  complementos: ReturnType<typeof selecao>['complementos']
  disponiveis: ReturnType<typeof selecao>['complementos']
  duracaoMin: number
  valor: number
  /** Preco do servico base sozinho, para o total dos extras na tela de extras. */
  valorBase: number
  slots: string[]
  carregandoSlots: boolean
  erro: string
  enviando: boolean
  confirmado: {
    cliente: string
    servico: string
    complementos: string[]
    profissional: string
    data: string
    horario: string
    valor: number
  } | null
  /** Categorias abertas na sanfona — sobrevive ao `voltar` entre etapas. */
  /** Linhas abertas na vitrine (serviços e Club). Sobrevive ao `voltar`. */
  abertos: string[]
  aoAlternar: (chave: string) => void
  aoEscolherServico: (nome: string) => void
  aoEscolherProfissional: (nome: string) => void
  aoEscolherData: (iso: string) => void
  aoEscolherHorario: (hora: string) => void
  aoAlternarComplemento: (id: string) => void
  aoConfirmar: () => void
  aoRecomecar: () => void
  aoVoltar: () => void
  /** Avanço explícito: "Continuar" na etapa de complementos e de dados. */
  aoAvancar: (destino: Etapa) => void
  aoDefinir: (campo: 'nome' | 'telefone' | 'observacao', valor: string) => void
  identificacao: 'verificando' | 'autenticado' | 'anonimo'
  aoIdentificado: (dados: { nome: string; telefone: string }) => void
}

function EtapaConteudo(props: PropsEtapa) {
  const { etapa } = props
  if (etapa === 'servico') return <EtapaServicos {...props} />
  if (etapa === 'profissional') return <EtapaProfissional {...props} />
  if (etapa === 'data') return <EtapaData {...props} />
  if (etapa === 'horario') return <EtapaHorario {...props} />
  if (etapa === 'complementos') return <EtapaComplementos {...props} />
  if (etapa === 'dados') return <EtapaDados {...props} />
  if (etapa === 'resumo') return <EtapaResumo {...props} />
  return <EtapaConfirmacao {...props} />
}

/**
 * O portão: a pessoa escolheu hora e agora precisa ser alguém.
 *
 * Não é uma etapa numerada do fluxo — é o ponto exato onde a sessão é
 * exigida. Por isso mantém a mesma moldura das outras telas (progresso,
 * título, voltar) e só troca o conteúdo por duas portas: criar conta ou
 * entrar. Os dois caminhos levam à ÁREA DO CLIENTE, que é quem cuida de
 * sessão, cadastro e vínculo; aqui não se abre uma segunda porta de
 * autenticação.
 *
 * Ao voltar, o horário escolhido continua escolhido — ele está em `estado`,
 * intacto, e o rascunho é que é descartado (sem sessão não há quem guarde).
 */
function EtapaIdentificacao({
  identificacao,
  aoDesistir,
  aoIdentificado,
}: {
  identificacao: 'verificando' | 'autenticado' | 'anonimo'
  aoDesistir: () => void
  aoIdentificado: (dados: { nome: string; telefone: string }) => void
}) {
  const [modo, setModo] = useState<'inicial' | 'cadastro' | 'entrar'>('inicial')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [processando, setProcessando] = useState(false)
  const [tentou, setTentou] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    email: '',
    nascimento: '',
    senha: '',
    confirmarSenha: '',
  })

  async function criarConta() {
    setTentou(true)
    if (!nomeValido(form.nome)) {
      setErro('Informe seu nome completo.')
      return
    }
    if (!telefoneValido(form.telefone)) {
      setErro('Informe um telefone válido com DDD.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setErro('Informe um e-mail válido.')
      return
    }
    if (!nascimentoValido(form.nascimento)) {
      setErro('Informe uma data de nascimento válida (não pode ser futura).')
      return
    }
    if (!senhaValida(form.senha)) {
      setErro('A senha precisa de pelo menos 6 caracteres.')
      return
    }
    if (form.senha !== form.confirmarSenha) {
      setErro('As senhas não conferem.')
      return
    }

    setErro('')
    setAviso('')
    setProcessando(true)
    try {
      const db = clientePainel()
      if (!db) {
        setErro('Disponível apenas com Supabase configurado.')
        return
      }
      const sessao = await db.cadastrar({
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        nascimento: form.nascimento.trim(),
        senha: form.senha,
      })
      if (!sessao) {
        setAviso('Conta criada. Confirme seu e-mail para ativar seu acesso.')
        return
      }
      if (!(await db.confirmar())) {
        setErro('Sua sessão expirou. Tente novamente.')
        return
      }
      const vinculo = await db.vincular(
        form.nome.trim(),
        form.telefone.trim(),
        form.nascimento.trim(),
      )
      if (!vinculo.clienteId) {
        setErro('Não foi possível associar o perfil ao agendamento.')
        return
      }
      aoIdentificado({ nome: form.nome.trim(), telefone: form.telefone.trim() })
    } catch (erro) {
      setErro(mensagemErroCadastro(erro))
    } finally {
      setProcessando(false)
    }
  }

  async function entrar() {
    setErro('')
    setAviso('')
    setProcessando(true)
    try {
      const db = clientePainel()
      if (!db) {
        setErro('Disponível apenas com Supabase configurado.')
        return
      }
      await db.entrar(form.email.trim(), form.senha)
      if (!(await db.confirmar())) {
        setErro('Sua sessão expirou. Tente novamente.')
        return
      }
      const cad = await obterMeuCadastro().catch(() => null)
      aoIdentificado({
        nome: cad && 'nome' in cad && cad.nome ? String(cad.nome) : '',
        telefone:
          cad && 'telefone' in cad && cad.telefone ? String(cad.telefone) : '',
      })
    } catch (erro) {
      setErro(mensagemErroEntrada(erro))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-16 sm:px-6">
      <Progresso etapa="horario" />
      <Tela
        etapa="horario"
        titulo={
          modo === 'inicial'
            ? 'Falta pouco'
            : modo === 'cadastro'
              ? 'Crie seu acesso'
              : 'Entrar'
        }
        descricao={
          modo === 'inicial'
            ? 'Para reservar seu horário, crie seu acesso ou entre na sua conta.'
            : modo === 'cadastro'
              ? 'Precisamos de alguns dados para criar sua conta.'
              : 'Use seu e-mail e senha para continuar.'
        }
        voltar={modo === 'inicial' ? aoDesistir : () => setModo('inicial')}
      >
        {identificacao === 'verificando' ? (
          <Carregando texto="Verificando seu acesso…" />
        ) : modo === 'inicial' ? (
          <>
            <div className="flex flex-col gap-2.5">
              <Botao
                variante="primario"
                aoClicar={() => {
                  setModo('cadastro')
                  setTentou(false)
                  setErro('')
                  setAviso('')
                }}
              >
                Criar conta
              </Botao>
              <Botao
                aoClicar={() => {
                  setModo('entrar')
                  setTentou(false)
                  setErro('')
                  setAviso('')
                }}
              >
                Já tenho conta — entrar
              </Botao>
            </div>
            <p className="mt-5 text-[12.5px] leading-relaxed text-noir-500">
              Serviço, profissional, dia e horário já estão guardados. Depois de
              entrar, você volta direto para os adicionais e confirma a reserva.
            </p>
          </>
        ) : modo === 'cadastro' ? (
          <>
            {erro && <Aviso texto={erro} />}
            {aviso && <Aviso texto={aviso} />}
            <div className="flex flex-col gap-3">
              <Campo
                id="cadastro-nome"
                rotulo="Nome completo"
                valor={form.nome}
                autoComplete="name"
                aoMudar={(v) => setForm((c) => ({ ...c, nome: v }))}
              />
              <Campo
                id="cadastro-fone"
                rotulo="Telefone"
                valor={form.telefone}
                placeholder="(81) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
                aoMudar={(v) => setForm((c) => ({ ...c, telefone: v }))}
              />
              <Campo
                id="cadastro-email"
                rotulo="Email"
                valor={form.email}
                tipo="email"
                autoComplete="email"
                aoMudar={(v) => setForm((c) => ({ ...c, email: v }))}
              />
              <Campo
                id="cadastro-nascimento"
                rotulo="Data de nascimento"
                valor={form.nascimento}
                tipo="date"
                aoMudar={(v) => setForm((c) => ({ ...c, nascimento: v }))}
              />
              <Campo
                id="cadastro-senha"
                rotulo="Senha"
                valor={form.senha}
                tipo="password"
                autoComplete="new-password"
                aoMudar={(v) => setForm((c) => ({ ...c, senha: v }))}
              />
              <Campo
                id="cadastro-confirmar"
                rotulo="Confirmar senha"
                valor={form.confirmarSenha}
                tipo="password"
                autoComplete="new-password"
                aoMudar={(v) => setForm((c) => ({ ...c, confirmarSenha: v }))}
              />
            </div>
            {tentou && erro && (
              <p role="alert" className="mt-3 text-[13px] text-red-700">
                {erro}
              </p>
            )}
            <div className="mt-5">
              <Botao
                variante="primario"
                desabilitado={processando}
                aoClicar={criarConta}
              >
                {processando ? 'Criando…' : 'Criar acesso e continuar'}
              </Botao>
            </div>
            <button
              type="button"
              onClick={() => {
                setModo('entrar')
                setErro('')
                setAviso('')
              }}
              className="mt-3 text-[13px] font-medium text-gold-700 underline-offset-2 hover:underline"
            >
              Já tenho conta — entrar
            </button>
          </>
        ) : (
          <>
            {erro && <Aviso texto={erro} />}
            <div className="flex flex-col gap-3">
              <Campo
                id="entrar-email"
                rotulo="Email"
                valor={form.email}
                tipo="email"
                autoComplete="email"
                aoMudar={(v) => setForm((c) => ({ ...c, email: v }))}
              />
              <Campo
                id="entrar-senha"
                rotulo="Senha"
                valor={form.senha}
                tipo="password"
                autoComplete="current-password"
                aoMudar={(v) => setForm((c) => ({ ...c, senha: v }))}
              />
            </div>
            <div className="mt-5">
              <Botao
                variante="primario"
                desabilitado={processando}
                aoClicar={entrar}
              >
                {processando ? 'Entrando…' : 'Entrar e continuar'}
              </Botao>
            </div>
            <button
              type="button"
              onClick={() => {
                setModo('cadastro')
                setErro('')
                setAviso('')
              }}
              className="mt-3 text-[13px] font-medium text-gold-700 underline-offset-2 hover:underline"
            >
              Criar conta
            </button>
          </>
        )}
      </Tela>
    </main>
  )
}

/**
 * Resolve os destaques do dono contra o catálogo.
 *
 * `destaques` é uma lista de NOMES escolhida pelo dono. Se um nome não existir
 * mais no catálogo (serviço desativado ou renomeado), ele simplesmente não
 * aparece — a vitrine nunca mostra um card que aponta para nada.
 *
 * Aceita lista vazia e `undefined`: é o estado normal de quem ainda não
 * configurou, e a vitrine só esconde a seção.
 */
function normalizarDestaques(
  nomes: string[] | undefined,
  servicos: ItemCatalogo[],
): ItemCatalogo[] {
  return (nomes ?? [])
    .map((nome) => servicos.find((s) => s.nome === nome))
    .filter((s): s is ItemCatalogo => Boolean(s))
}

/**
 * A vitrine: onde a pessoa começa a agendar.
 *
 * A ordem é a de uma vitrine de verdade — photos da casa, o que a casa
 * recomenda, a lista completa, o Club, quem faz o serviço e onde a casa fica:
 *
 *   1. Galeria da casa          (só se o dono cadastrou foto)
 *   2. Destaques da casa        (carrossel; só se o dono escolheu destaques)
 *   3. Todos os serviços       (sanfona, agrupada pela categoria da casa)
 *   4. Audax Club               (linha fechada; os planos abrem num toque)
 *   5. Nossa equipe             (quem trabalha aqui)
 *   6. Onde fica a casa         (endereço, WhatsApp, Instagram, mapa)
 *
 * SERVIÇOS ANTES DO CLUB, e isso é deliberado. Com os cards de plano abertos, o
 * Club ocupava mais do que a tela inteira e empurrava a lista de serviços para
 * fora da primeira dobra: a pessoa saía da página sem ver serviço nenhum. O
 * trabalho de agendar vem primeiro; o Club vem logo abaixo, agora fechado.
 *
 * Duas colunas no desktop (a sexta vira a lateral que gruda enquanto a pessoa
 * rola) e uma coluna no celular, que é onde isso é usado.
 *
 * Tudo que aparece aqui vem do catálogo oficial e da configuração do dono. Se
 * a casa não configurou destaques, fotos ou categoria, a seção correspondente
 * simplesmente não existe — a vitrine não inventa conteúdo para parecer cheia.
 */
function EtapaServicos({
  catalogo,
  estado,
  abertos,
  aoAlternar,
  aoEscolherServico,
}: PropsEtapa) {
  const destaques = normalizarDestaques(catalogo.destaques, catalogo.servicos)

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-16 sm:px-6">
      {/*
        * TOPO: marca à esquerda, "Entrar" à direita.
        *
        * Agendar e entrar são as duas coisas que a pessoa quer quando abre a
        * link, e as duas ficam na mesma tela — por isso a porta do cliente
        * entra no cabeçalho, e não no fim da rolagem.
        */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <Marca />
        <BotaoEntrar aoEntrar={() => irParaAreaDoCliente()} />
      </div>

      <header className="mb-7">
        <h1 className="font-display text-[28px] leading-tight font-semibold text-noir-900 sm:text-[34px]">
          Agende seu horário
        </h1>
        <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-noir-500">
          Escolha o serviço e a gente cuida do resto. Dá para incluir outro no
          mesmo horário — você escolhe depois.
        </p>
      </header>

      <GaleriaBarbearia fotos={catalogo.barbearia.fotos} />

      {/*
        * GRADE DA VITRINE.
        *
        * `items-start` para a lateral não esticar até o fim da coluna: sem ele,
        * o cartão da casa esticava pela altura toda da lista de serviços e a
        * caixa virava uma coluna de metros de creme vazio.
        *
        * A coluna do meio é `minmax(0, 1fr)` para poder encolher — sem o `0`, o
        * carrossel (que é mais largo que a coluna) estica a grade e empurra a
        * lateral para fora da tela.
        */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {destaques.length > 0 && (
            <section className="mb-7">
              <CarrosselDestaques
                servicos={destaques}
                selecionado={estado.servicoNome}
                aoEscolher={aoEscolherServico}
              />
            </section>
          )}

          <section className="mb-7">
            <h2 className="mb-2.5 text-[12px] font-semibold tracking-[0.12em] text-noir-500 uppercase">
              Todos os serviços
            </h2>
            {/*
             * O CATÁLOGO INTEIRO, sem tirar os destaques.
             *
             * A lista anterior escondia os serviços que já apareciam no
             * carrossel. Quando os destaques cobrem o catálogo — que foi o que
             * aconteceu — a lista "todos os serviços" ficava vazia, e era
             * exatamente ali que a pessoa procurava o serviço que não via.
             * Destaque é atalho, não filtro.
             */}
            <ListaServicos
              servicos={catalogo.servicos}
              abertos={abertos}
              selecionado={estado.servicoNome}
              aoAlternar={aoAlternar}
              aoEscolher={aoEscolherServico}
            />
          </section>

          <div className="mb-7">
            <SecaoAudaxClub
              barbearia={catalogo.barbearia}
              aberto={abertos.includes(AUDAX_CLUB)}
              aoAlternar={() => aoAlternar(AUDAX_CLUB)}
            />
          </div>

          <EquipeVitrine profissionais={catalogo.profissionais ?? []} />
        </div>

        {/* Onde fica a casa: coluna lateral no desktop, bloco no fim no
            celular. É o mesmo `BlocoBarbearia` da Área do Cliente — os dados
            públicos da casa têm uma tela só. */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <BlocoBarbearia barbearia={catalogo.barbearia} />
        </aside>
      </div>
    </main>
  )
}

function EtapaProfissional({ catalogo, estado, aoEscolherProfissional, aoVoltar }: PropsEtapa) {
  const servico = catalogo.servicos.find((s) => s.nome === estado.servicoNome)
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-16 sm:px-6">
      <Progresso etapa="profissional" />
      <Tela
        etapa="profissional"
        titulo="Escolha seu barbeiro"
        descricao={
          servico
            ? `Para ${servico.nome}. Quem estiver disponível aparece aqui.`
            : undefined
        }
        voltar={aoVoltar}
      >
        <div className="flex flex-col gap-2">
          {(catalogo.profissionais ?? []).map((p) => (
            <CartaoProfissional
              key={p.id ?? p.nome}
              nome={p.nome}
              foto={p.foto}
              selecionado={estado.profissional === p.nome}
              aoEscolher={() => aoEscolherProfissional(p.nome)}
            />
          ))}
        </div>
      </Tela>
    </main>
  )
}

function EtapaData({ estado, aoEscolherData, aoVoltar }: PropsEtapa) {
  const dias = useMemo(() => proximosDias(DIAS_A_FRENTE), [])
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-16 sm:px-6">
      <Progresso etapa="data" />
      <Tela
        etapa="data"
        titulo="Escolha o dia"
        descricao={`Com ${estado.profissional}.`}
        voltar={aoVoltar}
      >
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {dias.map((iso) => (
            <BotaoDia
              key={iso}
              iso={iso}
              selecionado={estado.data === iso}
              aoEscolher={() => aoEscolherData(iso)}
            />
          ))}
        </div>
      </Tela>
    </main>
  )
}

function EtapaHorario({
  estado,
  slots,
  carregandoSlots,
  erro,
  aoEscolherHorario,
  aoVoltar,
}: PropsEtapa) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-16 sm:px-6">
      <Progresso etapa="horario" />
      <Tela
        etapa="horario"
        titulo="Horários disponíveis"
        descricao={`${estado.profissional} · ${dataPorExtenso(estado.data)}`}
        voltar={aoVoltar}
      >
        {erro && <Aviso texto={erro} />}
        {carregandoSlots && <Carregando texto="Buscando horários…" />}
        {!carregandoSlots && slots.length === 0 && (
          <p className="rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-4 text-[13.5px] text-noir-500">
            Não há horário livre neste dia para este profissional. Escolha outro
            dia.
          </p>
        )}
        {!carregandoSlots && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((hora) => (
              <BotaoHora
                key={hora}
                hora={hora}
                selecionado={estado.horario === hora}
                aoEscolher={() => aoEscolherHorario(hora)}
              />
            ))}
          </div>
        )}
      </Tela>
    </main>
  )
}

/**
 * "Quer completar seu atendimento?" — o "adicionar também".
 *
 * A pergunta aqui é "quero fazer mais alguma coisa hoje?", e a resposta honesta
 * é QUALQUER serviço do catálogo. A configuração `servicos.complementos` deixa
 * de ser uma lista fechada — quando estava vazia (que era o caso), a etapa não
 * oferecia nada e quem queria corte + barba + sobrancelha não tinha como pedir
 * os três. Agora a configuração decide a ORDEM de leitura: o que a casa sugeriu
 * vem primeiro, e o resto do catálogo vem logo abaixo.
 *
 * Três coisas que fazem isso_reviewar bem em vez de virar uma lista de compras:
 *
 *   • NADA vem marcado. Extra pré-marcado é taxa escondida, e a pessoa
 *     descobriria o valor dobrado só no resumo.
 *   • O preço e a duração de cada extra aparecem na linha, e o total é
 *     recalculado na hora — com aviso quando o horário escolhido deixa de
 *     caber, em vez de prometer um horário que o servidor recusa.
 *   • Quem não quiser nada leva o botão "Continuar" sem penalidade: pular
 *     extras é uma escolha legítima, não um erro de caminho.
 */
function EtapaComplementos({
  estado,
  erro,
  aoAlternarComplemento,
  aoVoltar,
  aoAvancar,
  catalogo,
  valor,
  valorBase,
}: PropsEtapa) {
  const prosseguir = () => aoAvancar('dados')
  const base = catalogo.servicos.find((s) => s.nome === estado.servicoNome)
  const { sugeridos, outros } = useMemo(
    () => servicosAdicionais(catalogo.servicos, estado.servicoNome),
    [catalogo.servicos, estado.servicoNome],
  )
  // O que a CASA marcou para este serviço vem primeiro; o resto do catálogo
  // abaixo. A lista nunca fica vazia enquanto houver outro serviço cadastrado.
  const grupos = [
    { titulo: 'Sugestões da casa', itens: sugeridos },
    { titulo: 'Outros serviços', itens: outros },
  ].filter((g) => g.itens.length > 0)

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-16 sm:px-6">
      <Progresso etapa="complementos" />
      <Tela
        etapa="complementos"
        titulo="Quer completar seu atendimento?"
        descricao={
          grupos.length === 0
            ? 'Este é o único serviço do catálogo por enquanto.'
            : `Além de ${base?.nome ?? 'o serviço escolhido'}, você pode incluir outro no mesmo horário. Nada é cobrado sem você escolher.`
        }
        voltar={aoVoltar}
      >
        {erro && <Aviso texto={erro} />}

        {/*
          * O total ANTES de continuar, e o que os extras acrescentam.
          *
          * A pessoa não deve descobrir o preço final no resumo: se a soma só
          * aparece no fim, o "adicione mais um" vira uma surpresa e a taxa
          * parece terdobrado sozinha.
          */}
        {grupos.length > 0 && (
          <div
            role="group"
            aria-label="Total do atendimento"
            className="mb-4 rounded-xl border border-cream-300 bg-cream-100 px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-noir-600">
                {base?.nome ?? 'Serviço'}{' '}
                <span className="tabular-nums">
                  {formatarBRL(valorBase)}
                </span>
              </span>
              <span className="text-[15px] font-semibold tabular-nums text-noir-900">
                {formatarBRL(valor)}
              </span>
            </div>
            {valor > valorBase && (
              <p className="mt-1 text-[12.5px] text-noir-500">
                Incluindo o que você adicionou. O horário continua o mesmo se
                der tempo; se não der, a gente pede outro.
              </p>
            )}
          </div>
        )}

        {grupos.map((grupo) => (
          <section key={grupo.titulo} className="mb-4">
            <h2 className="mb-2 text-[11.5px] font-semibold tracking-[0.12em] text-noir-500 uppercase">
              {grupo.titulo}
            </h2>
            <div className="flex flex-col gap-2">
              {grupo.itens.map((c) => {
                const marcado =
                  Boolean(c.id) && estado.complementoIds.includes(c.id as string)
                return (
                  <button
                    key={c.id ?? c.nome}
                    type="button"
                    onClick={() => c.id && aoAlternarComplemento(c.id)}
                    aria-pressed={marcado}
                    aria-label={`${marcado ? 'Remover' : 'Adicionar'} ${c.nome}`}
                    className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      marcado
                        ? 'border-gold-600 bg-gold-200/50'
                        : 'border-cream-300 bg-cream-50 hover:border-gold-400'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-noir-900">
                        {c.nome}
                      </span>
                      <span className="block text-[12.5px] text-noir-500">
                        {c.duracaoMin} min
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[14px] font-semibold tabular-nums text-noir-800">
                        {formatarBRL(c.preco)}
                      </span>
                      <span className="block text-[10.5px] font-bold tracking-[0.1em] text-gold-700 uppercase">
                        {marcado ? 'Adicionado' : 'Adicionar'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}

        <div className="mt-5">
          <Botao aoClicar={prosseguir} variante="primario">
            Continuar
          </Botao>
        </div>
        <p className="mt-3 text-[12px] text-noir-500">
          Studio Audax · {catalogo.barbearia.endereco}
        </p>
      </Tela>
    </main>
  )
}

function EtapaDados({
  estado,
  erro,
  aoDefinir,
  aoVoltar,
  aoAvancar,
  identificacao,
  aoIdentificado,
}: PropsEtapa) {
  const [tentou, setTentou] = useState(false)
  const valido = dadosValidos(estado)

  // A conta é pré-condição para reservar; se ainda não temos sessão, aqui
  // mesmo acontece o login ou o cadastro completo com e-mail + senha.
  if (identificacao !== 'autenticado') {
    return (
      <EtapaIdentificacao
        identificacao={identificacao}
        aoDesistir={aoVoltar}
        aoIdentificado={aoIdentificado}
      />
    )
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-16 sm:px-6">
      <Progresso etapa="dados" />
      <Tela
        etapa="dados"
        titulo="Seus dados"
        descricao="Para confirmar e para a gente falar com você."
        voltar={aoVoltar}
      >
        {erro && <Aviso texto={erro} />}
        <div className="flex flex-col gap-3">
          <Campo
            id="ag-nome"
            rotulo="Nome"
            valor={estado.nome}
            autoComplete="name"
            aoMudar={(v) => aoDefinir('nome', v)}
          />
          <Campo
            id="ag-fone"
            rotulo="Telefone com DDD"
            valor={estado.telefone}
            placeholder="(81) 99999-9999"
            inputMode="tel"
            autoComplete="tel"
            aoMudar={(v) => aoDefinir('telefone', v)}
          />
        </div>
        {tentou && !valido && (
          <p role="alert" className="mt-3 text-[13px] text-red-700">
            Informe um nome e um telefone com DDD para continuar.
          </p>
        )}
        <div className="mt-5">
          <Botao
            variante="primario"
            aoClicar={() => {
              setTentou(true)
              if (valido) aoAvancar('resumo')
            }}
          >
            Continuar
          </Botao>
        </div>
      </Tela>
    </main>
  )
}

function EtapaResumo({
  estado,
  catalogo,
  base,
  complementos,
  duracaoMin,
  valor,
  erro,
  enviando,
  aoConfirmar,
  aoVoltar,
}: PropsEtapa) {
  const bloqueado = etapaBloqueia(estado, 'resumo')
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-16 sm:px-6">
      <Progresso etapa="resumo" />
      <Tela
        etapa="resumo"
        titulo="Confira seu horário"
        descricao="Confira antes de confirmar."
        voltar={aoVoltar}
      >
        {erro && <Aviso texto={erro} />}
        <Resumo>
          <LinhaResumo rotulo="Serviço" valor={base?.nome ?? ''} />
          {complementos.length > 0 && (
            <LinhaResumo
              rotulo="Complementos"
              valor={complementos.map((c) => c.nome).join(', ')}
            />
          )}
          <LinhaResumo rotulo="Profissional" valor={estado.profissional} />
          <LinhaResumo rotulo="Data" valor={dataPorExtenso(estado.data)} />
          <LinhaResumo rotulo="Horário" valor={estado.horario} />
          <LinhaResumo rotulo="Duração" valor={`${duracaoMin} min`} />
          <LinhaResumo
            rotulo="Valor"
            valor={`R$ ${valor.toFixed(2).replace('.', ',')}`}
          />
        </Resumo>
        {catalogo.barbearia.endereco && (
          <p className="mt-3 text-[13px] leading-relaxed text-noir-600">
            Studio Audax
            <br />
            {catalogo.barbearia.endereco}
          </p>
        )}
        <div className="mt-5">
          <Botao
            variante="primario"
            aoClicar={aoConfirmar}
            desabilitado={bloqueado || enviando}
          >
            {enviando ? 'Confirmando…' : 'Confirmar agendamento'}
          </Botao>
        </div>
      </Tela>
    </main>
  )
}

function EtapaConfirmacao({ confirmado, catalogo, aoRecomecar }: PropsEtapa) {
  if (!confirmado) return null
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-16 sm:px-6">
      <Confirmacao
        titulo="Agendamento confirmado!"
        frase={`${confirmado.cliente}, seu horário com ${confirmado.profissional} está reservado.`}
        acoes={
          <>
            {/* Vai para a ÁREA DO CLIENTE pela URL oficial — não para o
                painel nem para um hash que ninguém pode divulgar. */}
            <Botao variante="primario" aoClicar={() => irParaAreaDoCliente('agendamentos')}>
              Ver meu agendamento
            </Botao>
            <Botao aoClicar={aoRecomecar}>Voltar ao início</Botao>
          </>
        }
      >
        <div className="mt-4 space-y-1.5 text-left">
          <LinhaResumo rotulo="Serviço" valor={confirmado.servico} />
          {confirmado.complementos.length > 0 && (
            <LinhaResumo
              rotulo="Complementos"
              valor={confirmado.complementos.join(', ')}
            />
          )}
          <LinhaResumo rotulo="Profissional" valor={confirmado.profissional} />
          <LinhaResumo rotulo="Data" valor={dataPorExtenso(confirmado.data)} />
          <LinhaResumo rotulo="Horário" valor={confirmado.horario} />
        </div>
        {catalogo.barbearia.endereco && (
          <p className="mt-4 text-left text-[13px] leading-relaxed text-noir-600">
            Studio Audax
            <br />
            {catalogo.barbearia.endereco}
          </p>
        )}
      </Confirmacao>
    </main>
  )
}

