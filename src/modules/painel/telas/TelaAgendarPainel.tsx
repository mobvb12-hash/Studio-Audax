// ============================================================================
// Agendar pelo painel (FASE F) — cliente logado escolhe serviço/profissional/
// horário na MESMA base da Agenda oficial.
//
// Espelha a página pública `#/agendar` (catálogo/horários das RPCs 012), com
// três diferenças:
//   • nome e telefone vêm do CADASTRO vinculado (identidade da sessão) —
//     nunca são editados aqui;
//   • seção de complementos sugeridos pelo serviço escolhido (config da
//     coluna `servicos.complementos`), NUNCA pré-marcados;
//   • a criação vai pela RPC `painel_agendamento_criar` (019).
// ============================================================================
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import {
  carregarCatalogo,
  horariosPublicos,
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

type Confirmacao = {
  servico: string
  complementos: string[]
  profissional: string
  data: string
  horario: string
}

export default function TelaAgendarPainel() {
  const [catalogo, setCatalogo] = useState<CatalogoPublico | null>(null)
  const [servicosComComplementos, setServicosComComplementos] = useState<
    ServicoComComplementos[]
  >([])
  const [cadastro, setCadastro] = useState<CadastroPainel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [tentativaCarga, setTentativaCarga] = useState(0)

  const [servicoNome, setServicoNome] = useState('')
  const [profissionalNome, setProfissionalNome] = useState('')
  const [data, setData] = useState('')
  const [horario, setHorario] = useState('')
  const [observacao, setObservacao] = useState('')
  const [complementosEscolhidos, setComplementosEscolhidos] = useState<
    string[]
  >([])

  const [horarios, setHorarios] = useState<string[]>([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)

  const servicoCatalogo = catalogo?.servicos.find(
    (s) => s.nome === servicoNome,
  )
  const servicoComComplementos = servicosComComplementos.find(
    (s) =>
      (servicoCatalogo?.id && s.id === servicoCatalogo.id) ||
      s.nome === servicoNome,
  )
  const complementos = servicoComComplementos?.complementos ?? []
  const complementosAtivos = complementos.filter((c) =>
    complementosEscolhidos.includes(c.id),
  )
  const duracaoTotal = (servicoCatalogo?.duracaoMin ?? 0)
  + complementosAtivos.reduce((soma, c) => soma + c.duracaoMin, 0)

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
          e instanceof Error
            ? e.message
            : 'Não foi possível carregar os serviços.',
        )
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [tentativaCarga])

  // Horários livres do dia/profissional com a duração TOTAL (base +
  // complementos) — a mesma folga que a criação exige no servidor.
  useEffect(() => {
    if (!data || !profissionalNome || !servicoCatalogo || !duracaoTotal) return
    let vivo = true
    horariosPublicos(data, profissionalNome, duracaoTotal)
      .then((lista) => {
        if (vivo) setHorarios(lista)
      })
      .catch((e: unknown) => {
        if (vivo) {
          setErroCarga(
            e instanceof Error
              ? e.message
              : 'Não foi possível carregar os horários.',
          )
        }
      })
      .finally(() => {
        if (vivo) setCarregandoHorarios(false)
      })
    return () => {
      vivo = false
    }
  }, [data, profissionalNome, servicoCatalogo, duracaoTotal])

  function limparHorario() {
    setHorario('')
    setHorarios([])
    setCarregandoHorarios(true)
    setErro('')
  }

  function alternarComplemento(id: string) {
    setErro('')
    setComplementosEscolhidos((atual) =>
      atual.includes(id)
        ? atual.filter((item) => item !== id)
        : [...atual, id],
    )
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setErro('')
    setEnviando(true)
    try {
      const resultado = await criarAgendamentoPainel({
        servico: servicoNome,
        profissional: profissionalNome,
        data,
        horario,
        observacao,
        complementos: complementosEscolhidos,
      })
      if (!resultado.ok) {
        setErro(resultado.erro)
        // Horário tomado por outra pessoa: lista os livres de novo
        if (/ocupado|conflito/i.test(resultado.erro) && servicoCatalogo) {
          try {
            setHorarios(
              await horariosPublicos(data, profissionalNome, duracaoTotal),
            )
          } catch {
            // falha ao recarregar: a mensagem do servidor já foi exibida
          }
        }
        return
      }
      setConfirmacao({
        servico: servicoNome,
        complementos: complementosAtivos.map((c) => c.nome),
        profissional: profissionalNome,
        data,
        horario,
      })
    } finally {
      setEnviando(false)
    }
  }

  function recomecar() {
    setConfirmacao(null)
    setServicoNome('')
    setProfissionalNome('')
    setData('')
    setHorario('')
    setObservacao('')
    setComplementosEscolhidos([])
    setHorarios([])
    setCarregandoHorarios(false)
    setErro('')
  }

  if (confirmacao) {
    return (
      <div className="rounded-xl border border-[#E5DCC3] bg-white p-6 shadow-sm">
        <p className="text-center text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
          Studio Audax
        </p>
        <div
          className="mx-auto mt-3 h-px w-16 bg-[#8A6A14]"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-center text-xl font-bold text-[#1C1A15]">
          Pedido de agendamento enviado!
        </h1>
        <p className="mt-3 text-center text-sm text-[#4A4436]">
          Recebemos seu pedido. A equipe vai confirmar o horário com você.
        </p>
        <dl className="mt-5 flex flex-col gap-2 rounded-lg border border-[#E5DCC3] bg-[#FAF6EB]/60 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#8A8171]">Serviço</dt>
            <dd className="text-right font-medium text-[#1C1A15]">
              {confirmacao.servico}
            </dd>
          </div>
          {confirmacao.complementos.length > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#8A8171]">Complementos</dt>
              <dd className="text-right font-medium text-[#1C1A15]">
                {confirmacao.complementos.join(', ')}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-[#8A8171]">Profissional</dt>
            <dd className="text-right font-medium text-[#1C1A15]">
              {confirmacao.profissional}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#8A8171]">Data e hora</dt>
            <dd className="text-right font-medium text-[#1C1A15]">
              {formatarDataLonga(confirmacao.data)} · {confirmacao.horario}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-center text-xs text-[#8A8171]">
          Status: <strong className="text-[#8A6A14]">Pendente</strong> — a
          confirmação chega pelo telefone do seu cadastro.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => navegarPainel('')}
            className="flex-1 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Voltar ao painel
          </button>
          <button
            type="button"
            onClick={recomecar}
            className="flex-1 rounded-lg border border-[#E5DCC3] bg-white px-4 py-2.5 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
          >
            Agendar outro horário
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <header className="text-center">
        <h1 className="text-2xl font-bold text-[#1C1A15]">
          Agende seu horário
        </h1>
        <p className="mt-1 text-sm text-[#8A8171]">
          Escolha o serviço, o profissional e o melhor horário para você.
        </p>
        <div
          className="mx-auto mt-3 h-px w-16 bg-[#8A6A14]"
          aria-hidden="true"
        />
      </header>

      <form
        onSubmit={enviar}
        className="mt-6 rounded-xl border border-[#E5DCC3] bg-white p-6 shadow-sm"
      >
        {carregando && (
          <p className="py-6 text-center text-sm text-[#8A8171]">
            Carregando serviços…
          </p>
        )}

        {!carregando && erroCarga && (
          <div className="flex flex-col gap-3">
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {erroCarga}
            </p>
            <button
              type="button"
              onClick={() => {
                setErroCarga('')
                setCarregando(true)
                setTentativaCarga((n) => n + 1)
              }}
              className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {!carregando && !erroCarga && catalogo && cadastro && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-[#E5DCC3] bg-[#FAF6EB]/60 px-3 py-2 text-[13px] text-[#4A4436]">
              Agendando como <strong>{cadastro.nome}</strong>
              {cadastro.telefone ? ` · ${cadastro.telefone}` : ''}
            </div>

            <div>
              <label className={rotulo} htmlFor="pn-servico">
                Serviço *
              </label>
              <select
                id="pn-servico"
                className={campo}
                value={servicoNome}
                onChange={(e) => {
                  setServicoNome(e.target.value)
                  setComplementosEscolhidos([])
                  limparHorario()
                }}
              >
                <option value="">Selecione um serviço...</option>
                {catalogo.servicos.map((s) => (
                  <option key={s.id ?? s.nome} value={s.nome}>
                    {s.nome} · {formatarBRL(s.preco)} · {s.duracaoMin} min
                  </option>
                ))}
              </select>
            </div>

            {complementos.length > 0 && (
              <div>
                <p className={rotulo}>Complementos (opcional)</p>
                <p className="mb-2 text-xs text-[#A99E85]">
                  Some tempo ao atendimento — nada é marcado automaticamente.
                </p>
                <div className="flex flex-col gap-2">
                  {complementos.map((c) => {
                    const marcado = complementosEscolhidos.includes(c.id)
                    return (
                      <label
                        key={c.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                          marcado
                            ? 'border-[#8A6A14] bg-[#FAF6EB]'
                            : 'border-[#E5DCC3] bg-white hover:bg-[#F3ECDA]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternarComplemento(c.id)}
                          className="h-4 w-4 accent-[#8A6A14]"
                        />
                        <span className="flex-1 text-[#1C1A15]">
                          {c.nome}
                        </span>
                        <span className="text-xs text-[#8A8171]">
                          +{formatarBRL(c.preco)} · {c.duracaoMin} min
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <label className={rotulo} htmlFor="pn-profissional">
                Profissional *
              </label>
              <select
                id="pn-profissional"
                className={campo}
                value={profissionalNome}
                onChange={(e) => {
                  setProfissionalNome(e.target.value)
                  limparHorario()
                }}
              >
                <option value="">Selecione o profissional...</option>
                {catalogo.profissionais.map((p) => (
                  <option key={p.id ?? p.nome} value={p.nome}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={rotulo} htmlFor="pn-data">
                Data *
              </label>
              <input
                id="pn-data"
                type="date"
                className={campo}
                min={hojeISO()}
                value={data}
                onChange={(e) => {
                  setData(e.target.value)
                  limparHorario()
                }}
              />
            </div>

            <div>
              <p className={rotulo}>Horário *</p>
              {!data || !profissionalNome || !servicoCatalogo ? (
                <p className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-3 py-2 text-xs text-[#A99E85]">
                  Escolha serviço, profissional e data para ver os horários
                  livres.
                </p>
              ) : carregandoHorarios ? (
                <p className="text-xs text-[#8A8171]">
                  Verificando horários…
                </p>
              ) : horarios.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-3 py-2 text-xs text-[#A99E85]">
                  Nenhum horário livre nesta data. Escolha outro dia.
                </p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-2">
                  {horarios.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setHorario(h)
                        setErro('')
                      }}
                      aria-pressed={horario === h}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        horario === h
                          ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
                          : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:bg-[#F3ECDA]'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {servicoCatalogo && duracaoTotal > 0 && (
              <p className="text-xs text-[#8A8171]">
                Duração total: <strong>{duracaoTotal} min</strong>
                {complementosAtivos.length > 0
                  ? ` (${servicoCatalogo.duracaoMin} min + ${complementosAtivos
                      .map((c) => c.nome)
                      .join(', ')})`
                  : ''}
              </p>
            )}

            <div>
              <label className={rotulo} htmlFor="pn-obs">
                Observação (opcional)
              </label>
              <input
                id="pn-obs"
                className={campo}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Alguma preferência? Ex.: máquina 2"
              />
            </div>

            {erro && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Confirmar agendamento'}
            </button>

            <p className="text-center text-xs text-[#A99E85]">
              O horário é confirmado pela equipe — você recebe a resposta no
              telefone do seu cadastro.
            </p>
          </div>
        )}
      </form>
    </div>
  )
}
