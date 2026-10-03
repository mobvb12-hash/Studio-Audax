// ============================================================================
// Agendamento pelo cliente (§16) — página PÚBLICA, fora do login.
//
// Autocontida: não usa nenhum provider do painel (rota `#/agendar` abre
// antes do portão de sessão). Lê o MESMO catálogo/ocupação da Agenda interna
// via `agendaPublica` — com Supabase usa as funções públicas da migration 012;
// sem Supabase, o localStorage da própria Agenda. NENHUM horário ou preço é
// inventado aqui: tudo vem do catálogo e da Agenda oficiais.
//
// Fluxo em uma única página, na ordem em que a pessoa decide:
//   Serviço → Profissional → Data → Horário → Seus dados → Resumo → Confirmar
// O progresso é mostrado de forma discreta e cada etapa só aparece quando faz
// sentido — nada de formulário gigante nem de rolagem infinita no celular.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatarBRL } from '@/lib/moeda'
import { hojeISO, formatarDataLonga } from '@/modules/agenda/catalogo'
import { CX_CLIENTE, dataLocal } from '@/lib/apresentacao'
import {
  carregarCatalogo,
  criarAgendamentoPublico,
  horariosPublicos,
  type CatalogoPublico,
} from '@/services/supabase/agendaPublica'
import {
  Aviso,
  Bloco,
  Botao,
  BotaoHorario,
  Cabecalho,
  Campo,
  Carregando,
  Confirmacao,
  EstadoVazio,
  GradeOpcoes,
  LinhaResumo,
  Opcao,
  Passos,
  Resumo,
} from '@/modules/painel/ui'

function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const ETAPAS = ['Serviço', 'Profissional', 'Data', 'Horário', 'Resumo']

type Confirmado = {
  cliente: string
  servico: string
  profissional: string
  data: string
  horario: string
}

/** Próximos dias úteis a partir de hoje — atalho de data sem calendário. */
function proximosDias(quantidade = 10): { iso: string; curto: string; dia: string }[] {
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
  const [erroCarga, setErroCarga] = useState('')
  const [tentativa, setTentativa] = useState(0)

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [servicoNome, setServicoNome] = useState('')
  const [profissionalNome, setProfissionalNome] = useState('')
  const [data, setData] = useState('')
  const [horario, setHorario] = useState('')
  const [observacao, setObservacao] = useState('')

  const [horarios, setHorarios] = useState<string[]>([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState<Confirmado | null>(null)

  const servico = catalogo?.servicos.find((s) => s.nome === servicoNome) ?? null
  const dias = useMemo(() => proximosDias(), [])

  useEffect(() => {
    let vivo = true
    carregarCatalogo()
      .then((c) => {
        if (!vivo) return
        setCatalogo(c)
        setErroCarga(
          c.servicos.length === 0 || c.profissionais.length === 0
            ? 'Não há serviços ou profissionais disponíveis no momento. Tente mais tarde.'
            : '',
        )
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErroCarga(
          e instanceof Error ? e.message : 'Não foi possível carregar os serviços.',
        )
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [tentativa])

  /**
   * Horários livres do dia/serviço/profissional — sempre da fonte oficial da
   * Agenda (expediente, bloqueios e ocupação reais).
   */
  useEffect(() => {
    if (!data || !profissionalNome || !servico) return
    let vivo = true
    horariosPublicos(data, profissionalNome, servico.duracaoMin)
      .then((lista) => {
        if (vivo) setHorarios(lista)
      })
      .catch(() => {
        if (vivo) setHorarios([])
      })
      .finally(() => {
        if (vivo) setCarregandoHorarios(false)
      })
    return () => {
      vivo = false
    }
  }, [data, profissionalNome, servico])

  const etapaAtual = !servicoNome
    ? 0
    : !profissionalNome
      ? 1
      : !data
        ? 2
        : !horario
          ? 3
          : 4

  /**
   * Trocar de serviço/profissional/data invalida o horário escolhido. O
   * estado "carregando" é ligado aqui (no evento), não dentro do efeito — é o
   * que evita o render em cascata que o lint penaliza.
   */
  const limparHorario = useCallback(() => {
    setHorario('')
    setHorarios([])
    setCarregandoHorarios(true)
    setErro('')
  }, [])

  async function confirmar() {
    if (enviando) return
    setErro('')
    setEnviando(true)
    try {
      const resultado = await criarAgendamentoPublico({
        cliente: nome,
        telefone,
        servico: servicoNome,
        profissional: profissionalNome,
        data,
        horario,
        observacao,
      })
      if (!resultado.ok) {
        setErro(resultado.erro)
        // Horario tomado entre a lista e o envio: oferecemos os livres de novo,
        // sem perder o que a pessoa já escolheu.
        if (/ocupado|conflito/i.test(resultado.erro) && servico) {
          try {
            setHorarios(await horariosPublicos(data, profissionalNome, servico.duracaoMin))
          } catch {
            /* a mensagem do servidor já está na tela */
          }
        }
        return
      }
      setConfirmado({
        cliente: nome.trim(),
        servico: servicoNome,
        profissional: profissionalNome,
        data,
        horario,
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
    setProfissionalNome('')
    setData('')
    setHorario('')
    setObservacao('')
    setHorarios([])
    setErro('')
  }

  /* ---------------------------------------------------------------- */
  /* Confirmação                                                        */
  /* ---------------------------------------------------------------- */

  if (confirmado) {
    return (
      <main className={CX_CLIENTE.tela}>
        <div className={CX_CLIENTE.conteudo}>
          <Confirmacao
            titulo="Agendamento confirmado!"
            frase="Seu horário foi registrado na agenda do Studio Audax."
            acoes={
              <>
                <Botao aoClicar={recomecar}>Agendar outro horário</Botao>
                <Botao variante="secundario" aoClicar={recomecar}>
                  Fechar
                </Botao>
              </>
            }
          >
            <Resumo>
              <LinhaResumo rotulo="Cliente" valor={confirmado.cliente} />
              <LinhaResumo rotulo="Serviço" valor={confirmado.servico} />
              <LinhaResumo rotulo="Profissional" valor={confirmado.profissional} />
              <LinhaResumo
                rotulo="Data"
                valor={formatarDataLonga(confirmado.data)}
              />
              <LinhaResumo rotulo="Horário" valor={confirmado.horario} />
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

  if (erroCarga || !catalogo) {
    return (
      <main className={CX_CLIENTE.tela}>
        <div className={CX_CLIENTE.conteudo}>
          <EstadoVazio
            titulo="Não foi possível carregar a agenda"
            texto={erroCarga || 'Tente novamente em instantes.'}
          >
            <Botao
              aoClicar={() => {
                setErroCarga('')
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

  const podeConfirmar =
    !!servico && !!profissionalNome && !!data && !!horario && nome.trim().length >= 2 && telefone.replace(/\D/g, '').length >= 10

  return (
    <main className={CX_CLIENTE.tela}>
      <div className={CX_CLIENTE.conteudo}>
        <Cabecalho
          titulo="Agende seu horário"
          subtitulo="Escolha o serviço, o profissional e o melhor horário para você."
        />
        <Passos etapas={ETAPAS} atual={etapaAtual} />

        <div className="flex flex-col gap-4">
          {/* -------------------------------------------------- SERVIÇO */}
          <Bloco
            numero={1}
            titulo="Serviço"
            descricao="Preço e duração exatamente como cadastrados na agenda."
          >
            <div className="flex flex-col gap-2">
              {catalogo.servicos.map((s) => (
                <Opcao
                  key={s.id ?? s.nome}
                  item={{
                    id: s.nome,
                    titulo: s.nome,
                    descricao: `${s.duracaoMin} min`,
                    preco: formatarBRL(s.preco),
                  }}
                  selecionado={servicoNome === s.nome}
                  aoEscolher={() => {
                    setServicoNome(s.nome)
                    setProfissionalNome('')
                    setData('')
                    limparHorario()
                  }}
                />
              ))}
            </div>
          </Bloco>

          {/* ----------------------------------------------- PROFISSIONAL */}
          {servico && (
            <Bloco
              numero={2}
              titulo="Profissional"
              descricao="Atendido por quem você preferir."
              acao={
                <button
                  type="button"
                  onClick={() => {
                    setProfissionalNome('')
                    setData('')
                    limparHorario()
                  }}
                  className="shrink-0 text-[12.5px] font-medium text-noir-400 hover:text-noir-800"
                >
                  Trocar
                </button>
              }
            >
              <div className="flex flex-col gap-2">
                <Opcao
                  item={{
                    id: '',
                    titulo: 'Qualquer profissional',
                    descricao: 'Mostramos quem tiver livre',
                  }}
                  selecionado={!profissionalNome && !data}
                  aoEscolher={() => {
                    setProfissionalNome('')
                    setData('')
                    limparHorario()
                  }}
                />
                {catalogo.profissionais.map((p) => (
                  <Opcao
                    key={p.id ?? p.nome}
                    item={{ id: p.nome, titulo: p.nome }}
                    selecionado={profissionalNome === p.nome}
                    aoEscolher={() => {
                      setProfissionalNome(p.nome)
                      setData('')
                      limparHorario()
                    }}
                  />
                ))}
              </div>
              {!profissionalNome && (
                <p className="mt-2 rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-3 text-[13.5px] leading-relaxed text-noir-500">
                  Escolha um profissional para ver os horários livres. Sem
                  profissional definido, a Agenda oficial não tem como dizer
                  quais vagas existem.
                </p>
              )}
            </Bloco>
          )}

          {/* ------------------------------------------------------- DATA */}
          {servico && profissionalNome && (
            <Bloco numero={3} titulo="Data" descricao="Escolha o dia da semana.">
              <div className="flex flex-col gap-2">
                <GradeOpcoes
                  colunas={3}
                  items={dias.map((d) => ({
                    id: d.iso,
                    titulo: d.dia,
                    descricao: d.curto,
                  }))}
                >
                  {(item) => (
                    <Opcao
                      key={item.id}
                      item={item}
                      multilinha
                      selecionado={data === item.id}
                      aoEscolher={() => {
                        setData(item.id)
                        limparHorario()
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
                      min={hojeISO()}
                      value={data}
                      onChange={(e) => {
                        setData(e.target.value)
                        limparHorario()
                      }}
                      className="min-h-[48px] w-full rounded-xl border border-cream-300 bg-cream-50 px-4 text-[14px] text-noir-900 outline-none focus:border-gold-500"
                    />
                  </div>
                </details>
              </div>
            </Bloco>
          )}

          {/* ----------------------------------------------------- HORÁRIO */}
          {data && (
            <Bloco
              numero={4}
              titulo="Horário"
              descricao={
                profissionalNome
                  ? `Horários livres em ${formatarDataLonga(data)}.`
                  : undefined
              }
              acao={
                <button
                  type="button"
                  onClick={() => setData('')}
                  className="shrink-0 text-[12.5px] font-medium text-noir-400 hover:text-noir-800"
                >
                  Trocar
                </button>
              }
            >
              {!profissionalNome ? (
                <p className="rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-4 text-[13.5px] text-noir-500">
                  Escolha um profissional para ver a disponibilidade.
                </p>
              ) : carregandoHorarios ? (
                <Carregando texto="Buscando horários livres…" />
              ) : horarios.length === 0 ? (
                <p className="rounded-xl border border-dashed border-cream-400 bg-cream-100 px-4 py-4 text-[13.5px] text-noir-500">
                  Nenhum horário livre neste dia. Escolha outra data.
                </p>
              ) : (
                <GradeOpcoes
                  colunas={3}
                  items={horarios.map((h) => ({ id: h, titulo: h }))}
                >
                  {(item) => (
                    <BotaoHorario
                      key={item.id}
                      hora={item.titulo}
                      selecionado={horario === item.id}
                      aoEscolher={() => {
                        setHorario(item.id)
                        setErro('')
                      }}
                    />
                  )}
                </GradeOpcoes>
              )}
            </Bloco>
          )}

          {/* -------------------------------------------- DADOS + RESUMO */}
          {horario && (
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

          {/* ---------------------------------------------------- RESUMO */}
          {servico && profissionalNome && data && horario && (
            <Bloco numero={6} titulo="Resumo" descricao="Confira antes de confirmar.">
              <Resumo>
                <LinhaResumo rotulo="Cliente" valor={nome.trim() || '—'} />
                <LinhaResumo rotulo="Serviço" valor={servico.nome} />
                <LinhaResumo rotulo="Profissional" valor={profissionalNome} />
                <LinhaResumo rotulo="Data" valor={formatarDataLonga(data)} />
                <LinhaResumo rotulo="Horário" valor={horario} />
                <LinhaResumo rotulo="Duração" valor={`${servico.duracaoMin} min`} />
                <LinhaResumo
                  rotulo="Valor"
                  valor={formatarBRL(servico.preco)}
                  destaque
                />
              </Resumo>
            </Bloco>
          )}

          {erro && <Aviso texto={erro} />}

          {horario && (
            <div className="sticky bottom-0 -mx-4 border-t border-cream-300 bg-cream-100/95 px-4 pt-3 pb-4 backdrop-blur sm:-mx-6 sm:px-6">
              <Botao
                tipo="button"
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
        </div>
      </div>
    </main>
  )
}
