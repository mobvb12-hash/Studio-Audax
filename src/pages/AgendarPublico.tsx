// ============================================================================
// Agendamento público — a porta de entrada do Studio Audax.
//
// Mesma fonte de dados da Agenda interna (NUNCA uma segunda agenda):
//   • com Supabase: as funções SECURITY DEFINER da migration 012/027 —
//     catálogo (com os dados da casa), ocupação do dia e criação, que
//     revalida tudo no servidor;
//   • sem Supabase: localStorage da própria Agenda + as MESMAS regras de
//     `validarProposta` (expediente → almoço → bloqueio → conflito).
//
// Fluxo, na ordem em que a pessoa decide:
//
//   Serviço → Data → Horário (com profissional) → Seus dados → Confirmação
//
// O ponto central: o cliente NÃO escolhe profissional antes de ver os
// horários. A disponibilidade é consultada para TODOS os profissionais de uma
// vez (`horariosPublicosPorProfissional`), e cada par horário × profissional
// vira um botão clicável. Escolher o horário já define quem atende.
//
// Complementos são sugestão opcional, resolvidos contra a coluna oficial
// `servicos.complementos`; nada é pré-marcado.
//
// Privacidade: só nome/preço/duração dos serviços, nome dos profissionais e
// os dados públicos da casa. Nenhum telefone, e-mail ou nome de cliente.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatarBRL } from '@/lib/moeda'
import { hojeISO, formatarDataLonga } from '@/modules/agenda/catalogo'
import type { SlotLivre } from '@/modules/agenda/regras'
import { dataLocal, CX_CLIENTE } from '@/lib/apresentacao'
import {
  carregarCatalogo,
  criarAgendamentoPublico,
  horariosPublicosPorProfissional,
  type CatalogoPublico,
  type ServicoPublico,
} from '@/services/supabase/agendaPublica'
import BlocoBarbearia from '@/modules/painel/telas/BlocoBarbearia'
import { navegarPainel } from '@/modules/painel/regras'
import {
  Aviso,
  Bloco,
  Botao,
  BotaoSlot,
  Cabecalho,
  Campo,
  Carregando,
  CartaoServico,
  Confirmacao,
  EstadoVazio,
  GradeOpcoes,
  LinhaResumo,
  Opcao,
  Passos,
  Resumo,
} from '@/modules/painel/ui'

const ETAPAS = ['Serviço', 'Data', 'Horário', 'Seus dados', 'Confirmação']

/** Um par horário × profissional — é isso que o cliente vê e toca. */
type SlotEscolhido = { horario: string; profissional: string }

type Confirmado = {
  cliente: string
  servico: string
  complementos: string[]
  profissional: string
  data: string
  horario: string
  valor: number
}

function mascaraTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Próximos dias a partir de hoje — atalho de data sem calendário. */
function proximosDias(quantidade = 14): { iso: string; curto: string; dia: string }[] {
  const dias: { iso: string; curto: string; dia: string }[] = []
  const base = new Date()
  for (let passo = 0; passo < 30 && dias.length < quantidade; passo += 1) {
    const d = new Date(base.getTime() + passo * 86400000)
    dias.push({
      iso: dataLocal(d.toISOString()),
      curto: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      dia: String(d.getDate()).padStart(2, '0'),
    })
  }
  return dias
}

export default function AgendarPublico() {
  const [catalogo, setCatalogo] = useState<CatalogoPublico | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [tentativa, setTentativa] = useState(0)

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [servicoNome, setServicoNome] = useState('')
  const [data, setData] = useState('')
  const [slot, setSlot] = useState<SlotEscolhido | null>(null)
  const [observacao, setObservacao] = useState('')
  const [complementosEscolhidos, setComplementosEscolhidos] = useState<string[]>([])

  const [slots, setSlots] = useState<SlotLivre[]>([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState<Confirmado | null>(null)

  const servico: ServicoPublico | null =
    catalogo?.servicos.find((s) => s.nome === servicoNome) ?? null

  // Complementos: só os ids que a própria casa marcou para este serviço, e
  // nunca pré-marcados.
  const complementos = useMemo(() => {
    if (!servico || !catalogo) return []
    const permitidos = new Set(servico.complementos ?? [])
    return catalogo.servicos.filter(
      (c) => c.id && permitidos.has(c.id) && c.nome !== servico.nome,
    )
  }, [servico, catalogo])

  const complementosAtivos = complementos.filter((c) =>
    c.id ? complementosEscolhidos.includes(c.id) : false,
  )
  const duracaoTotal =
    (servico?.duracaoMin ?? 0) +
    complementosAtivos.reduce((soma, c) => soma + c.duracaoMin, 0)
  const valorTotal =
    (servico?.preco ?? 0) +
    complementosAtivos.reduce((soma, c) => soma + c.preco, 0)

  const dias = useMemo(() => proximosDias(), [])
  const nomesProfissionais = useMemo(
    () => (catalogo?.profissionais ?? []).map((p) => p.nome),
    [catalogo],
  )

  useEffect(() => {
    let vivo = true
    carregarCatalogo()
      .then((c) => {
        if (!vivo) return
        setCatalogo(c)
        setCarregando(false)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar os serviços.')
        setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [tentativa])

  /**
   * Disponibilidade de TODOS os profissionais para o serviço + data escolhidos.
   * O estado "carregando" é ligado no evento, não dentro do efeito — é o que
   * evita o render em cascata que o lint penaliza.
   */
  /**
   * Recarrega a grade de horários.
   *
   * NÃO limpa `erro`: quem chama decide a mensagem. Depois que o servidor diz
   * "este horário acabou de ser ocupado", recarregar a lista não pode apagar a
   * explicação que o cliente precisa ler.
   */
  const carregarSlots = useCallback(async () => {
    if (!data || !servico || !duracaoTotal) return
    setCarregandoHorarios(true)
    try {
      const lista = await horariosPublicosPorProfissional(
        data,
        duracaoTotal,
        nomesProfissionais,
      )
      setSlots(lista)
    } catch (e: unknown) {
      setSlots([])
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os horários.')
    } finally {
      setCarregandoHorarios(false)
    }
  }, [data, servico, duracaoTotal, nomesProfissionais])

  useEffect(() => {
    if (!data || !servico || !duracaoTotal) return
    let vivo = true
    horariosPublicosPorProfissional(data, duracaoTotal, nomesProfissionais)
      .then((lista) => {
        if (vivo) setSlots(lista)
      })
      .catch(() => {
        if (vivo) setSlots([])
      })
      .finally(() => {
        if (vivo) setCarregandoHorarios(false)
      })
    return () => {
      vivo = false
    }
  }, [data, servico, duracaoTotal, nomesProfissionais])

  const etapaAtual = !servicoNome
    ? 0
    : !data
      ? 1
      : !slot
        ? 2
        : !nome.trim()
          ? 3
          : 4

  /** Trocar serviço/data/complemento invalida o horário escolhido. */
  const limparSlot = useCallback(() => {
    setSlot(null)
    setSlots([])
    setCarregandoHorarios(true)
    setErro('')
  }, [])

  function alternarComplemento(id: string) {
    setErro('')
    setComplementosEscolhidos((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id],
    )
  }

  async function confirmar() {
    if (enviando || !slot || !servico) return
    setErro('')
    setEnviando(true)
    try {
      const resultado = await criarAgendamentoPublico({
        cliente: nome,
        telefone,
        servico: servico.nome,
        profissional: slot.profissional,
        data,
        horario: slot.horario,
        observacao,
        complementos: complementosEscolhidos,
      })
      if (!resultado.ok) {
        setErro(resultado.erro)
        // Horário tomado entre a lista e o envio: mostramos os livres de novo
        // sem perder o que a pessoa já escolheu.
        if (/ocupado|conflito/i.test(resultado.erro)) await carregarSlots()
        return
      }
      setConfirmado({
        cliente: nome.trim(),
        servico: servico.nome,
        complementos: complementosAtivos.map((c) => c.nome),
        profissional: slot.profissional,
        data,
        horario: slot.horario,
        valor: valorTotal,
      })
    } finally {
      setEnviando(false)
    }
  }

  function recomecar() {
    setConfirmado(null)
    setNome('')
    setTelefone('')
    setServicoNome('')
    setData('')
    setSlot(null)
    setObservacao('')
    setComplementosEscolhidos([])
    setSlots([])
    setErro('')
  }

  const podeConfirmar =
    !!servico && !!slot && nome.trim().length >= 2 && telefone.replace(/\D/g, '').length >= 10

  /* ---------------------------------------------------------------- */
  /* Confirmação                                                        */
  /* ---------------------------------------------------------------- */

  if (confirmado) {
    return (
      <main className={CX_CLIENTE.tela}>
        <div className={CX_CLIENTE.conteudo}>
          <Confirmacao
            titulo="Agendamento confirmado!"
            frase={`${confirmado.cliente}, seu horário com ${confirmado.profissional} está reservado.`}
            acoes={
              <>
                <Botao aoClicar={recomecar}>Agendar outro horário</Botao>
                <Botao
                  variante="secundario"
                  aoClicar={() => {
                    navegarPainel('agendamentos')
                  }}
                >
                  Ver meus agendamentos
                </Botao>
              </>
            }
          >
            <Resumo>
              <LinhaResumo rotulo="Serviço" valor={confirmado.servico} />
              {confirmado.complementos.length > 0 && (
                <LinhaResumo
                  rotulo="Complementos"
                  valor={confirmado.complementos.join(', ')}
                />
              )}
              <LinhaResumo rotulo="Profissional" valor={confirmado.profissional} />
              <LinhaResumo rotulo="Data" valor={formatarDataLonga(confirmado.data)} />
              <LinhaResumo rotulo="Horário" valor={confirmado.horario} />
              <LinhaResumo
                rotulo="Valor"
                valor={formatarBRL(confirmado.valor)}
                destaque
              />
            </Resumo>
            <p className="mt-4 text-center text-[13px] leading-relaxed text-noir-500">
              A equipe confirma o horário pelo telefone informado. Se precisar
              mudar ou cancelar, é só chamar.
            </p>
          </Confirmacao>
        </div>
      </main>
    )
  }

  /* ---------------------------------------------------------------- */
  /* Fluxo                                                              */
  /* ---------------------------------------------------------------- */

  if (carregando) {
    return (
      <main className={CX_CLIENTE.tela}>
        <div className={CX_CLIENTE.conteudo}>
          <Cabecalho titulo="Agende seu horário" />
          <Carregando texto="Carregando serviços…" />
        </div>
      </main>
    )
  }

  if (erro && !catalogo) {
    return (
      <main className={CX_CLIENTE.tela}>
        <div className={CX_CLIENTE.conteudo}>
          <EstadoVazio
            alerta
            titulo="Não foi possível carregar a agenda"
            texto={erro}
          >
            <Botao
              aoClicar={() => {
                setErro('')
                setTentativa((n) => n + 1)
              }}
            >
              Tentar de novo
            </Botao>
          </EstadoVazio>
        </div>
      </main>
    )
  }

  const semServicos = (catalogo?.servicos.length ?? 0) === 0
  const semProfissionais = (catalogo?.profissionais.length ?? 0) === 0

  return (
    <main className={CX_CLIENTE.tela}>
      <div className={CX_CLIENTE.conteudo}>
        <Cabecalho
          titulo="Agende seu horário"
          subtitulo="Escolha o serviço, o dia e o horário. A gente cuida do resto."
          direita={
            <button
              type="button"
              onClick={() => navegarPainel('')}
              className="min-h-[40px] shrink-0 rounded-xl border border-cream-300 px-3 text-[12.5px] font-semibold text-noir-700 hover:border-gold-400 hover:text-noir-900"
            >
              Área do Cliente
            </button>
          }
        />
        <Passos etapas={ETAPAS} atual={etapaAtual} />

        <div className="flex flex-col gap-4">
          {/* --------------------------------------------------- SERVIÇO */}
          <Bloco numero={1} titulo="Serviço" descricao="Preço e duração exatamente como cadastrados.">
            {semServicos ? (
              <p className="rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-4 text-[13.5px] text-noir-500">
                Nenhum serviço disponível no momento. Tente mais tarde.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {catalogo?.servicos.map((s) => (
                  <CartaoServico
                    key={s.id ?? s.nome}
                    nome={s.nome}
                    preco={formatarBRL(s.preco)}
                    duracaoMin={s.duracaoMin}
                    selecionado={servicoNome === s.nome}
                    aoEscolher={() => {
                      if (servicoNome === s.nome) return
                      setServicoNome(s.nome)
                      setComplementosEscolhidos([])
                      setData('')
                      limparSlot()
                    }}
                  />
                ))}
              </div>
            )}
          </Bloco>

          {/* ------------------------------------------------ COMPLEMENTOS */}
          {complementos.length > 0 && (
            <Bloco
              numero={2}
              titulo="Quer completar?"
              descricao="Sugestões da casa para o seu serviço. Tudo opcional."
            >
              <div className="flex flex-col gap-2">
                {complementos.map((c) => {
                  const marcado = c.id
                    ? complementosEscolhidos.includes(c.id)
                    : false
                  return (
                    <button
                      key={c.id ?? c.nome}
                      type="button"
                      onClick={() => c.id && alternarComplemento(c.id)}
                      aria-pressed={marcado}
                      aria-label={`${c.nome} — ${c.duracaoMin} minutos — mais ${formatarBRL(c.preco)}`}
                      className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                        marcado
                          ? 'border-gold-600 bg-gold-200/60 ring-1 ring-gold-600'
                          : 'border-cream-300 bg-cream-50 hover:border-gold-400 hover:bg-cream-100'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-noir-900">
                          + {c.nome}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-noir-500">
                          {c.duracaoMin} min
                        </span>
                      </span>
                      <span className="shrink-0 text-[14px] font-semibold tabular-nums text-noir-700">
                        {formatarBRL(c.preco)}
                      </span>
                    </button>
                  )
                })}
              </div>
              {complementosAtivos.length > 0 && (
                <p className="mt-3 text-[12.5px] text-noir-500">
                  Duração total do atendimento: {duracaoTotal} min ·{' '}
                  {formatarBRL(valorTotal)}
                </p>
              )}
            </Bloco>
          )}

          {/* ------------------------------------------------------ DATA */}
          <Bloco numero={3} titulo="Data" descricao="Escolha o dia da semana.">
            {!servico ? (
              <p className="rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-4 text-[13.5px] text-noir-500">
                Escolha um serviço para ver as datas.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <GradeOpcoes
                  colunas={3}
                  items={dias.map((d) => ({ id: d.iso, titulo: d.dia, descricao: d.curto }))}
                >
                  {(item) => (
                    <Opcao
                      key={item.id}
                      item={item}
                      multilinha
                      selecionado={data === item.id}
                      aoEscolher={() => {
                        setData(item.id)
                        limparSlot()
                      }}
                    />
                  )}
                </GradeOpcoes>
                <details className="mt-1">
                  <summary className="cursor-pointer list-none text-[12.5px] font-medium text-noir-400 hover:text-noir-800">
                    Escolher outra data
                  </summary>
                  <div className="mt-2">
                    <input
                      type="date"
                      aria-label="Escolher data"
                      min={hojeISO()}
                      value={data}
                      onChange={(e) => {
                        setData(e.target.value)
                        limparSlot()
                      }}
                      className="min-h-[48px] w-full rounded-xl border border-cream-300 bg-cream-50 px-4 text-[14px] text-noir-900 outline-none focus:border-gold-500"
                    />
                  </div>
                </details>
              </div>
            )}
          </Bloco>

          {/* ------------------------- HORÁRIO (TODOS OS PROFISSIONAIS) --- */}
          <Bloco
            numero={4}
            titulo="Horário"
            descricao={
              data
                ? `Livres em ${formatarDataLonga(data)} — todos os profissionais ao mesmo tempo.`
                : 'Escolha a data para ver os horários.'
            }
            acao={
              data ? (
                <button
                  type="button"
                  onClick={() => {
                    setData('')
                    limparSlot()
                  }}
                  className="shrink-0 text-[12.5px] font-medium text-noir-400 hover:text-noir-800"
                >
                  Trocar
                </button>
              ) : undefined
            }
          >
            {!data ? (
              <p className="rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-4 text-[13.5px] text-noir-500">
                Escolha a data para ver os horários livres.
              </p>
            ) : semProfissionais ? (
              <p className="rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-4 text-[13.5px] text-noir-500">
                Nenhum profissional disponível no momento.
              </p>
            ) : carregandoHorarios ? (
              <Carregando texto="Buscando horários livres…" />
            ) : slots.length === 0 ? (
              <p className="rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-4 text-[13.5px] text-noir-500">
                Nenhum horário livre neste dia. Escolha outra data.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {slots.map((s) => (
                  <div key={s.horario}>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-noir-400 uppercase">
                      {s.horario}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {s.profissionais.map((nome) => (
                        <BotaoSlot
                          key={`${s.horario}-${nome}`}
                          hora={s.horario}
                          profissional={nome}
                          selecionado={
                            slot?.horario === s.horario &&
                            slot?.profissional === nome
                          }
                          aoEscolher={() => {
                            setSlot({ horario: s.horario, profissional: nome })
                            setErro('')
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Bloco>

          {/* ------------------------------- CLIENTE + RESUMO + CONFIRMAÇÃO */}
          {slot && (
            <Bloco numero={5} titulo="Seus dados" descricao="Para confirmar o contato.">
              <div className="flex flex-col gap-4">
                <Campo
                  id="pub-nome"
                  rotulo="Nome completo"
                  valor={nome}
                  aoMudar={setNome}
                  placeholder="Nome e sobrenome"
                  autoComplete="name"
                />
                <Campo
                  id="pub-telefone"
                  rotulo="Telefone / WhatsApp"
                  valor={telefone}
                  aoMudar={(v) => setTelefone(mascaraTelefone(v))}
                  placeholder="(11) 98888-7777"
                  inputMode="tel"
                  autoComplete="tel"
                />

                <div className="mt-2">
                  <h3 className="mb-1.5 text-[12px] font-semibold tracking-[0.1em] text-noir-600 uppercase">
                    Resumo
                  </h3>
                  <Resumo>
                    <LinhaResumo rotulo="Cliente" valor={nome.trim() || '—'} />
                    <LinhaResumo rotulo="Serviço" valor={servico?.nome ?? '—'} />
                    {complementosAtivos.length > 0 && (
                      <LinhaResumo
                        rotulo="Complementos"
                        valor={complementosAtivos.map((c) => c.nome).join(', ')}
                      />
                    )}
                    <LinhaResumo rotulo="Profissional" valor={slot.profissional} />
                    <LinhaResumo rotulo="Data" valor={formatarDataLonga(data)} />
                    <LinhaResumo rotulo="Horário" valor={slot.horario} />
                    <LinhaResumo rotulo="Duração" valor={`${duracaoTotal} min`} />
                    <LinhaResumo
                      rotulo="Valor"
                      valor={formatarBRL(valorTotal)}
                      destaque
                    />
                  </Resumo>
                </div>

                <div>
                  <label
                    htmlFor="pub-obs"
                    className="mb-1.5 block text-[12px] font-semibold tracking-[0.1em] text-noir-600 uppercase"
                  >
                    Observação (opcional)
                  </label>
                  <input
                    id="pub-obs"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Alguma preferência? Ex.: máquina 2"
                    className="min-h-[52px] w-full rounded-xl border border-cream-300 bg-cream-50 px-4 text-[15px] text-noir-900 outline-none placeholder:text-noir-300 focus:border-gold-500"
                  />
                </div>
              </div>
            </Bloco>
          )}

          {erro && <Aviso texto={erro} />}

          {slot && (
            <div className="sticky bottom-0 -mx-4 border-t border-cream-300 bg-cream-100/95 px-4 pt-3 pb-4 backdrop-blur sm:-mx-6 sm:px-6">
              <Botao
                tamanho="lg"
                desabilitado={!podeConfirmar || enviando}
                aoClicar={() => void confirmar()}
              >
                {enviando ? 'Confirmando…' : 'Confirmar agendamento'}
              </Botao>
              {!podeConfirmar && (
                <p className="mt-2 text-center text-[12px] text-noir-400">
                  Preencha nome e telefone para confirmar.
                </p>
              )}
            </div>
          )}

          {/* ------------------------------------------------- A BARBEARIA */}
          {catalogo && <BlocoBarbearia barbearia={catalogo.barbearia} />}

          {/* -------------------------------------- ENTRADA DA ÁREA DO CLIENTE */}
          <section className="rounded-2xl border border-gold-300 bg-gold-200/30 p-5 text-center">
            <p className="font-serif-display text-[17px] font-semibold text-noir-900">
              Já é cliente?
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-noir-600">
              Entre na sua área para ver agendamentos, histórico e o Audax Club.
            </p>
            <div className="mt-4">
              <Botao aoClicar={() => navegarPainel('')}>Abrir Área do Cliente</Botao>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}