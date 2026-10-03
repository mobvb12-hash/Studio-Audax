// ============================================================================
// Agendar pelo painel do cliente — a MESMA experiência da página pública.
//
// Espelha `#/agendar`, com três diferenças:
//   • nome e telefone vêm do CADASTRO vinculado (identidade da sessão) —
//     nunca são editados aqui;
//   • a criação vai pela RPC `painel_agendamento_criar` (019), que valida os
//     complementos contra a coluna oficial e delega a `agendamento_publico_criar`;
//   • a disponibilidade é a MESMA função da página pública
//     (`horariosPublicosPorProfissional`), que consulta TODOS os profissionais
//     de uma vez a partir das regras da Agenda.
//
// Nada aqui inventa preço ou horário: o valor total é a soma dos serviços do
// catálogo oficial e as vagas vêm da Agenda.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { formatarBRL } from '@/lib/moeda'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import type { SlotLivre } from '@/modules/agenda/regras'
import { dataLocal } from '@/lib/apresentacao'
import {
  carregarCatalogo,
  horariosPublicosPorProfissional,
  type CatalogoPublico,
} from '@/services/supabase/agendaPublica'
import {
  criarAgendamentoPainel,
  listarServicosComComplementos,
  obterMeuCadastro,
  type CadastroPainel,
  type ServicoComComplementos,
} from '@/services/supabase/painel'
import { navegarPainel } from '../regras'
import {
  Aviso,
  Bloco,
  Botao,
  BotaoSlot,
  Cabecalho,
  Carregando,
  CartaoServico,
  Confirmacao,
  EstadoVazio,
  GradeOpcoes,
  LinhaResumo,
  Opcao,
  Passos,
  Resumo,
} from '../ui'

const ETAPAS = ['Serviço', 'Data', 'Horário', 'Confirmação']

/** Um par horário × profissional — é isso que o cliente vê e toca. */
type SlotEscolhido = { horario: string; profissional: string }

type Confirmado = {
  servico: string
  complementos: string[]
  profissional: string
  data: string
  horario: string
  valor: number
}

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

export default function TelaAgendarPainel() {
  const [catalogo, setCatalogo] = useState<CatalogoPublico | null>(null)
  const [servicosComComplementos, setServicosComComplementos] = useState<
    ServicoComComplementos[]
  >([])
  const [cadastro, setCadastro] = useState<CadastroPainel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [tentativa, setTentativa] = useState(0)

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

  const servicoCatalogo = catalogo?.servicos.find((s) => s.nome === servicoNome) ?? null
  const servicoComComplementos = servicosComComplementos.find(
    (s) =>
      (servicoCatalogo?.id && s.id === servicoCatalogo.id) || s.nome === servicoNome,
  )
  const complementos = servicoComComplementos?.complementos ?? []
  const complementosAtivos = complementos.filter((c) =>
    complementosEscolhidos.includes(c.id),
  )
  const duracaoTotal =
    (servicoCatalogo?.duracaoMin ?? 0) +
    complementosAtivos.reduce((soma, c) => soma + c.duracaoMin, 0)
  const valorTotal =
    (servicoCatalogo?.preco ?? 0) +
    complementosAtivos.reduce((soma, c) => soma + c.preco, 0)

  const dias = useMemo(() => proximosDias(), [])
  const nomesProfissionais = useMemo(
    () => (catalogo?.profissionais ?? []).map((p) => p.nome),
    [catalogo],
  )

  useEffect(() => {
    let vivo = true
    Promise.all([
      carregarCatalogo(),
      listarServicosComComplementos(),
      obterMeuCadastro(),
    ])
      .then(([c, sc, cad]) => {
        if (!vivo) return
        setCatalogo(c)
        setServicosComComplementos(sc)
        setCadastro(cad)
        setErroCarga(
          c.servicos.length === 0 || c.profissionais.length === 0
            ? 'Não há serviços ou profissionais disponíveis no momento. Tente mais tarde.'
            : cad === null
              ? 'Seu acesso ainda não está vinculado a um cadastro. Abra o Perfil para concluir o vínculo.'
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

  // Disponibilidade de TODOS os profissionais para serviço + data, com a
  // duração TOTAL (base + complementos) — a mesma folga que a criação exige
  // no servidor.
  useEffect(() => {
    if (!data || !servicoCatalogo || !duracaoTotal) return
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
  }, [data, servicoCatalogo, duracaoTotal, nomesProfissionais])

  const etapaAtual = !servicoNome ? 0 : !data ? 1 : !slot ? 2 : 3

  /**
   * Trocar de serviço/data/complemento invalida o horário. O estado
   * "carregando" é ligado aqui (no evento), não dentro do efeito — é o que
   * evita o render em cascata que o lint penaliza.
   */
  function limparSlot() {
    setSlot(null)
    setSlots([])
    setCarregandoHorarios(true)
    setErro('')
  }

  function alternarComplemento(id: string) {
    setErro('')
    setComplementosEscolhidos((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id],
    )
  }

  async function confirmar() {
    if (enviando || !slot) return
    setErro('')
    setEnviando(true)
    try {
      const resultado = await criarAgendamentoPainel({
        servico: servicoNome,
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
        if (/ocupado|conflito/i.test(resultado.erro)) {
          try {
            setSlots(
              await horariosPublicosPorProfissional(
                data,
                duracaoTotal,
                nomesProfissionais,
              ),
            )
          } catch {
            /* a mensagem do servidor já está na tela */
          }
        }
        return
      }
      setConfirmado({
        servico: servicoNome,
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
    setServicoNome('')
    setData('')
    setSlot(null)
    setObservacao('')
    setComplementosEscolhidos([])
    setSlots([])
    setErro('')
  }

  if (confirmado) {
    return (
      <Confirmacao
        titulo="Agendamento confirmado!"
        frase={`Seu horário com ${confirmado.profissional} está reservado.`}
        acoes={
          <>
            <Botao aoClicar={() => navegarPainel('agendamentos')}>
              Ver meus agendamentos
            </Botao>
            <Botao variante="secundario" aoClicar={recomecar}>
              Agendar outro horário
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
          A equipe confirma o horário pelo telefone do seu cadastro. Para mudar ou
          cancelar, é só usar a aba Agendamentos.
        </p>
      </Confirmacao>
    )
  }

  if (carregando) {
    return (
      <>
        <Cabecalho titulo="Agende seu horário" />
        <Carregando texto="Carregando serviços…" />
      </>
    )
  }

  if (erroCarga || !catalogo || !cadastro) {
    return (
      <EstadoVazio
        alerta={Boolean(erroCarga)}
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
    )
  }

  return (
    <div>
      <Cabecalho
        marca={false}
        titulo="Agende seu horário"
        subtitulo={`Agendando como ${cadastro.nome}. Escolha o serviço e o melhor horário.`}
      />
      <Passos etapas={ETAPAS} atual={etapaAtual} />

      <div className="flex flex-col gap-4">
        {/* --------------------------------------------------- SERVIÇO */}
        <Bloco numero={1} titulo="Serviço" descricao="Preço e duração do catálogo oficial.">
          <div className="flex flex-col gap-2">
            {catalogo.servicos.map((s) => (
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
                const marcado = complementosEscolhidos.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => alternarComplemento(c.id)}
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
          {!servicoNome ? (
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
                          slot?.horario === s.horario && slot?.profissional === nome
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

        {/* ---------------------------------------------------- RESUMO */}
        {servicoCatalogo && slot && (
          <Bloco numero={5} titulo="Resumo" descricao="Confira antes de confirmar.">
            <Resumo>
              <LinhaResumo rotulo="Cliente" valor={cadastro.nome} />
              <LinhaResumo rotulo="Serviço" valor={servicoCatalogo.nome} />
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
            <div className="mt-4">
              <label
                htmlFor="pn-obs"
                className="mb-1.5 block text-[12px] font-semibold tracking-[0.1em] text-noir-600 uppercase"
              >
                Observação (opcional)
              </label>
              <input
                id="pn-obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Alguma preferência? Ex.: máquina 2"
                className="min-h-[52px] w-full rounded-xl border border-cream-300 bg-cream-50 px-4 text-[15px] text-noir-900 outline-none placeholder:text-noir-300 focus:border-gold-500"
              />
            </div>
          </Bloco>
        )}

        {erro && <Aviso texto={erro} />}

        {slot && (
          <div className="sticky bottom-0 -mx-4 border-t border-cream-300 bg-cream-100/95 px-4 pt-3 pb-4 backdrop-blur sm:-mx-6 sm:px-6">
            <Botao tamanho="lg" desabilitado={enviando} aoClicar={() => void confirmar()}>
              {enviando ? 'Confirmando…' : 'Confirmar agendamento'}
            </Botao>
          </div>
        )}
      </div>
    </div>
  )
}