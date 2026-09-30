// ============================================================================
// Agendamento pelo cliente (§16) — página PÚBLICA, fora do login.
//
// Autocontida: não usa nenhum provider do painel (rota `#/agendar` abre
// antes do portão de sessão). Lê o MESMO catálogo/ocupação da Agenda
// interna via `agendaPublica` — com Supabase usa as funções públicas da
// migration 012; sem Supabase, o localStorage da própria Agenda.
// ============================================================================
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { hojeISO, formatarDataLonga } from '@/modules/agenda/catalogo'
import { formatarBRL } from '@/lib/moeda'
import {
  carregarCatalogo,
  criarAgendamentoPublico,
  horariosPublicos,
  type CatalogoPublico,
} from '@/services/supabase/agendaPublica'
import { supabase } from '@/lib/supabase'

function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

type Confirmacao = {
  cliente: string
  servico: string
  profissional: string
  data: string
  horario: string
}

export default function AgendarPublico() {
  const [catalogo, setCatalogo] = useState<CatalogoPublico | null>(null)
  const [erroCatalogo, setErroCatalogo] = useState('')
  const [carregando, setCarregando] = useState(true)

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
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)

  const servico = catalogo?.servicos.find((s) => s.nome === servicoNome)
  const temSupabase = supabase() !== null

  useEffect(() => {
    let vivo = true
    carregarCatalogo()
      .then((c) => {
        if (!vivo) return
        setCatalogo(c)
        setErroCatalogo(
          c.servicos.length === 0 || c.profissionais.length === 0
            ? 'Não há serviços ou profissionais disponíveis no momento. Tente mais tarde.'
            : '',
        )
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErroCatalogo(
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
  }, [])

  // Horários livres do dia/serviço/profissional — recarrega a cada troca
  useEffect(() => {
    if (!data || !profissionalNome || !servico) return
    let vivo = true
    horariosPublicos(data, profissionalNome, servico.duracaoMin)
      .then((lista) => {
        if (vivo) setHorarios(lista)
      })
      .catch((e: unknown) => {
        if (vivo) {
          setErroCatalogo(
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
  }, [data, profissionalNome, servico])

  async function enviar(e: FormEvent) {
    e.preventDefault()
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
        // Horário tomado por outra pessoa: lista os livres de novo
        if (/ocupado|conflito/i.test(resultado.erro) && servico) {
          try {
            setHorarios(
              await horariosPublicos(data, profissionalNome, servico.duracaoMin),
            )
          } catch {
            // falha ao recarregar: a mensagem do servidor já foi exibida
          }
        }
        return
      }
      setConfirmacao({
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
    setConfirmacao(null)
    setNome('')
    setTelefone('')
    setServicoNome('')
    setProfissionalNome('')
    setData('')
    setHorario('')
    setObservacao('')
    setHorarios([])
    setCarregandoHorarios(false)
    setErro('')
  }

  if (confirmacao) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FDFBF3] px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-[#E5DCC3] bg-white p-8 shadow-xl">
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
            {temSupabase
              ? 'Recebemos seu pedido. A equipe vai confirmar o horário com você.'
              : 'Seu pedido foi registrado na agenda do Studio. A equipe vai confirmar o horário com você.'}
          </p>
          <dl className="mt-5 flex flex-col gap-2 rounded-lg border border-[#E5DCC3] bg-[#FAF6EB]/60 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[#8A8171]">Cliente</dt>
              <dd className="text-right font-medium text-[#1C1A15]">
                {confirmacao.cliente}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#8A8171]">Serviço</dt>
              <dd className="text-right font-medium text-[#1C1A15]">
                {confirmacao.servico}
              </dd>
            </div>
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
            confirmação chega pelo contato que você informou.
          </p>
          <button
            type="button"
            onClick={recomecar}
            className="mt-5 w-full rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Agendar outro horário
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FDFBF3] px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <header className="text-center">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8A8171] uppercase">
            Studio Audax
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#1C1A15]">
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

          {!carregando && erroCatalogo && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {erroCatalogo}
            </p>
          )}

          {!carregando && !erroCatalogo && catalogo && (
            <div className="flex flex-col gap-4">
              <div>
                <label className={rotulo} htmlFor="pub-nome">
                  Seu nome *
                </label>
                <input
                  id="pub-nome"
                  className={campo}
                  autoComplete="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome e sobrenome"
                />
              </div>

              <div>
                <label className={rotulo} htmlFor="pub-telefone">
                  Telefone / WhatsApp *
                </label>
                <input
                  id="pub-telefone"
                  className={campo}
                  inputMode="numeric"
                  autoComplete="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                  placeholder="(11) 98888-7777"
                />
              </div>

              <div>
                <label className={rotulo} htmlFor="pub-servico">
                  Serviço *
                </label>
                <select
                  id="pub-servico"
                  className={campo}
                  value={servicoNome}
                  onChange={(e) => {
                    setServicoNome(e.target.value)
                    setHorario('')
                    setHorarios([])
                    setCarregandoHorarios(true)
                    setErro('')
                  }}
                >
                  <option value="">Selecione um serviço...</option>
                  {catalogo.servicos.map((s) => (
                    <option key={s.id ?? s.nome} value={s.nome}>
                      {s.nome} · {formatarBRL(s.preco)} ·{' '}
                      {s.duracaoMin} min
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={rotulo} htmlFor="pub-profissional">
                  Profissional *
                </label>
                <select
                  id="pub-profissional"
                  className={campo}
                  value={profissionalNome}
                  onChange={(e) => {
                    setProfissionalNome(e.target.value)
                    setHorario('')
                    setHorarios([])
                    setCarregandoHorarios(true)
                    setErro('')
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
                <label className={rotulo} htmlFor="pub-data">
                  Data *
                </label>
                <input
                  id="pub-data"
                  type="date"
                  className={campo}
                  min={hojeISO()}
                  value={data}
                  onChange={(e) => {
                    setData(e.target.value)
                    setHorario('')
                    setHorarios([])
                    setCarregandoHorarios(true)
                    setErro('')
                  }}
                />
              </div>

              <div>
                <p className={rotulo}>Horário *</p>
                {!data || !profissionalNome || !servico ? (
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

              <div>
                <label className={rotulo} htmlFor="pub-obs">
                  Observação (opcional)
                </label>
                <input
                  id="pub-obs"
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
                telefone informado.
              </p>
            </div>
          )}
        </form>
      </div>
    </main>
  )
}
