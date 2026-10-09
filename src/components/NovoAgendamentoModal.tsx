import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { hojeISO } from '@/modules/agenda/catalogo'
import { slotsDoExpediente } from '@/modules/agenda/regras'
import { verificarConflito } from '@/modules/agenda/regras'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { useClientes } from '@/modules/clientes/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { useServicos } from '@/modules/servicos/store'
import { ContextoAuth } from '@/modules/auth/contexto'
import { useAuthPermissao } from '@/modules/auth/useAuthPermissao'
import { normalizarTexto } from '@/lib/moeda'
import { useWhats } from '@/modules/whatsapp/store'
import { dadosDoAgendamento, textoTemplate } from '@/modules/whatsapp/templates'

type Props = {
  /** Pré-preenche o cliente (ação "Agendar" vinda da página Clientes) */
  clienteInicial?: string
  dataInicial?: string
  horarioInicial?: string
  profissionalInicial?: string
  onFechar: () => void
}

export default function NovoAgendamentoModal({
  clienteInicial,
  dataInicial,
  horarioInicial,
  profissionalInicial,
  onFechar,
}: Props) {
  const { adicionar, agendamentos, expediente } = useAgenda()
  const { clientes, porNome } = useClientes()
  const { servicos } = useServicos()
  const { profissionais } = useProfissionais()
  const whats = useWhats()
  // Último contexto do WhatsApp, atualizado a cada render: criar() re-renderiza
  // o provedor dentro do flushSync e a modal logo desmonta — sem isto o
  // enviar() enxergaria só a lista anterior à mensagem criada.
  const whatsRef = useRef(whats)
  useEffect(() => {
    whatsRef.current = whats
  })
  // Permissões de ação (mesmo mapa único do RLS). Fora do AuthProvider
  // (testes/render isolado) não há papel a consultar — mantém o
  // comportamento atual; em produção a modal só abre dentro do AuthProvider.
  const auth = useContext(ContextoAuth)
  const { pode } = useAuthPermissao()
  const comSessao = auth !== null
  const podeVerTodas = !comSessao || pode('agenda:ver_todas')
  // Mesma posse da RLS (014/059): quem só tem `agenda:ver_propria` escolhe
  // somente o cadastro vinculado à própria conta (`profissionais.user_id`).
  const meuProfissional = profissionais.find(
    (p) => p.userId && p.userId === auth?.perfil?.userId,
  )?.nome
  // Novos agendamentos só podem usar serviços/profissionais ativos
  const servicosAtivos = useMemo(
    () => servicos.filter((s) => s.ativo),
    [servicos],
  )
  const profissionaisAtivos = useMemo(() => {
    // Uma opção por nome: com duplicidade de cadastro, o registro ativo
    // é o representante da escolha (o select e o agendamento usam nome).
    const vistos = new Set<string>()
    const ativos = profissionais.filter((p) => {
      if (!p.ativo || vistos.has(p.nome)) return false
      vistos.add(p.nome)
      return true
    })
    if (podeVerTodas || !meuProfissional) return ativos
    return ativos.filter((p) => p.nome === meuProfissional)
  }, [profissionais, podeVerTodas, meuProfissional])
  const [cliente, setCliente] = useState(clienteInicial ?? '')
  const [telefone, setTelefone] = useState(
    () => (clienteInicial ? porNome(clienteInicial)?.telefone ?? '' : ''),
  )
  const [servico, setServico] = useState(() => servicosAtivos[0]?.nome ?? '')
  const [profissional, setProfissional] = useState(() => {
    const inicial = profissionalInicial ?? profissionaisAtivos[0]?.nome ?? ''
    if (podeVerTodas || !meuProfissional) return inicial
    // `profissionalInicial` pode vir de outra tela: se não está entre as
    // opções próprias, cai no próprio cadastro.
    return profissionaisAtivos.some((p) => p.nome === inicial)
      ? inicial
      : meuProfissional
  })
  const [data, setData] = useState(() => dataInicial ?? hojeISO())
  const [horario, setHorario] = useState(() => horarioInicial ?? '14:00')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')
  // Segunda proteção contra clique duplo: em fluxo normal a modal desmonta
  // no mesmo evento, mas se a janela pai não fechar, o segundo clique não
  // pode criar um segundo agendamento.
  const salvandoRef = useRef(false)

  const horarios = useMemo(() => {
    const slots = slotsDoExpediente(expediente).filter((s) => !s.intervalo)
    if (horarioInicial && !slots.some((s) => s.hora === horarioInicial)) {
      return [{ hora: horarioInicial, intervalo: false }, ...slots]
    }
    return slots
  }, [expediente, horarioInicial])

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  /**
   * Confirmação automática no ato do agendamento: cria a mensagem com o
   * template `confirmacao` e dispara o envio pelo provedor já existente.
   * Sempre depois do adicionar() e nunca trava o salvamento — sem cliente
   * cadastrado, sem telefone ou com falha de envio, o agendamento segue salvo.
   */
  function confirmarPorWhatsApp(novo: Agendamento) {
    try {
      const cadastrado = porNome(novo.cliente)
      if (!cadastrado?.telefone.trim()) return
      // Duplicidade: uma confirmação já criada para o mesmo agendamento
      // (pendente/enviada) não gera segunda; `falhou` pode tentar de novo.
      const jaConfirmada = whats.mensagens.some(
        (m) =>
          m.agendamentoId === novo.id &&
          m.template === 'confirmacao' &&
          m.status !== 'falhou',
      )
      if (jaConfirmada) return
      // criar() enfileira o estado: só o flushSync conclui essa renderização
      // (e o efeito que atualiza o ref) antes da modal fechar.
      const mensagem = flushSync(() =>
        whats.criar({
          clienteId: cadastrado.id,
          cliente: novo.cliente,
          template: 'confirmacao',
          texto: textoTemplate('confirmacao', dadosDoAgendamento(novo)),
          origem: 'automacao',
          agendamentoId: novo.id,
        }),
      )
      enviarConfirmacao(mensagem.id)
    } catch {
      // Dados incompletos ou Integração ausente: o agendamento já está salvo
      // e apenas nenhuma mensagem sai do sistema.
    }
  }

  /** Envia sem bloquear a UI; erro vira `falhou` com o motivo do sistema. */
  function enviarConfirmacao(id: string) {
    void whatsRef.current.enviar(id).catch((e) => {
      const motivo =
        e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.'
      try {
        whatsRef.current.registrarFalha(id, motivo)
      } catch {
        // Mensagem removida antes da resposta: nada a registrar.
      }
    })
  }

  function salvar() {
    if (salvandoRef.current) return
    if (cliente.trim().length < 2) {
      setErro('Informe o nome do cliente.')
      return
    }
    if (!data) {
      setErro('Escolha a data.')
      return
    }
    if (data < hojeISO()) {
      setErro('Escolha uma data a partir de hoje.')
      return
    }
    if (!horario) {
      setErro('Escolha o horário.')
      return
    }
    if (!servico) {
      setErro('Cadastre um serviço no módulo Serviços antes de agendar.')
      return
    }
    const servicoSel = servicos.find((s) => s.nome === servico)
    if (!servicoSel) {
      setErro('Cadastre um serviço no módulo Serviços antes de agendar.')
      return
    }
    if (!servicoSel.ativo) {
      setErro('Serviço inativo — escolha outro serviço.')
      return
    }
    if (!profissional) {
      setErro('Cadastre um profissional no módulo Profissionais antes de agendar.')
      return
    }
    // Com duplicidade de nome, o cadastro ativo resolve a escolha — o
    // inativo não pode bloquear o agendamento do registro ativo, nem
    // sumir da validação (só quando NENHUM registro está ativo é recusa).
    const profSel =
      profissionais.find((p) => p.nome === profissional && p.ativo) ??
      profissionais.find((p) => p.nome === profissional)
    if (!profSel) {
      setErro('Cadastre um profissional no módulo Profissionais antes de agendar.')
      return
    }
    if (!profSel.ativo) {
      setErro('Profissional inativo — escolha outro profissional.')
      return
    }
    const duracaoDo = (nome: string) =>
      servicos.find((s) => s.nome === nome)?.duracaoMin ?? 30
    const conflito = verificarConflito(
      agendamentos,
      {
        data,
        horario,
        profissional,
        duracaoMin: duracaoDo(servico),
      },
      duracaoDo,
    )
    if (conflito.conflito) {
      setErro(
        `Conflito: ${conflito.agendamento.cliente} ocupa ${conflito.agendamento.horario}–${conflito.fimExistente} com ${profissional} (duração de ${duracaoDo(conflito.agendamento.servico)} min).`,
      )
      return
    }
    const clienteChave = normalizarTexto(cliente)
    const jaAgendado = agendamentos.find(
      (ag) =>
        ag.data === data &&
        ag.horario === horario &&
        normalizarTexto(ag.cliente) === clienteChave &&
        ag.status !== 'cancelado' &&
        ag.status !== 'nao_compareceu',
    )
    if (jaAgendado) {
      setErro(
        `Cliente já tem agendamento neste horário com ${jaAgendado.profissional} (${jaAgendado.servico}).`,
      )
      return
    }
    let novo: Agendamento
    salvandoRef.current = true
    try {
      novo = adicionar({
        cliente,
        telefone,
        servico,
        profissional,
        data,
        horario,
        observacao,
        duracaoMin: duracaoDo(servico),
      })
    } catch (e) {
      salvandoRef.current = false
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
      return
    }
    confirmarPorWhatsApp(novo)
    onFechar()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#121110]">
              Novo agendamento
            </h2>
            <p className="mt-1 text-[13px] text-[#7C7469]">
              Salvo neste navegador (localStorage) até o backend chegar.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#7C7469] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="ag-cliente">
              Cliente *
            </label>
            <input
              id="ag-cliente"
              className={campo}
              placeholder="Ex.: Lucas Mendes"
              list="ag-lista-clientes"
              value={cliente}
              onChange={(e) => {
                const valor = e.target.value
                setCliente(valor)
                const existente = porNome(valor)
                if (existente?.telefone) setTelefone(existente.telefone)
              }}
            />
            <datalist id="ag-lista-clientes">
              {clientes
                .filter((c) => c.ativo)
                .map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.telefone}
                  </option>
                ))}
            </datalist>
          </div>
          <div>
            <label className={rotulo} htmlFor="ag-tel">
              Telefone / WhatsApp
            </label>
            <input
              id="ag-tel"
              className={campo}
              placeholder="(11) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="ag-servico">
              Serviço
            </label>
            <select
              id="ag-servico"
              className={campo}
              value={servico}
              onChange={(e) => setServico(e.target.value)}
            >
              {servicosAtivos.length === 0 && (
                <option value="">Sem serviços ativos</option>
              )}
              {servicosAtivos.map((s) => (
                <option key={s.id} value={s.nome}>
                  {s.nome} — R$ {s.preco}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="ag-prof">
              Profissional
            </label>
            <select
              id="ag-prof"
              className={campo}
              value={profissional}
              onChange={(e) => setProfissional(e.target.value)}
            >
              {profissionaisAtivos.length === 0 && (
                <option value="">Sem profissionais ativos</option>
              )}
              {profissionaisAtivos.map((p) => (
                <option key={p.id} value={p.nome}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="ag-data">
              Data *
            </label>
            <input
              id="ag-data"
              type="date"
              className={campo}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="ag-hora">
              Horário *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {horarios.map((h) => (
                <button
                  key={h.hora}
                  type="button"
                  onClick={() => setHorario(h.hora)}
                  className={`rounded-md border px-2.5 py-1.5 text-[13px] font-medium ${
                    horario === h.hora
                      ? 'border-[#8A6A14] bg-[#C9A24A] text-[#121110]'
                      : 'border-[#E5DCC3] bg-white text-[#3A352C] hover:border-[#8A6A14]'
                  }`}
                >
                  {h.hora}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="ag-obs">
              Observação
            </label>
            <textarea
              id="ag-obs"
              className={`${campo} min-h-[64px] resize-y`}
              placeholder="Ex.: primeira vez, prefere tesoura..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            className="rounded-lg bg-[#C9A24A] px-4 py-2 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
          >
            Salvar agendamento
          </button>
        </div>
      </div>
    </div>
  )
}
