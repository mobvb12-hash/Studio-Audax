import { useContext, useMemo, useState } from 'react'
import Avatar from '@/components/Avatar'
import BloqueiosModal from '@/components/BloqueiosModal'
import EditarAgendamentoModal from '@/components/EditarAgendamentoModal'
import ExpedienteModal from '@/components/ExpedienteModal'
import PagamentoModal from '@/components/PagamentoModal'
import RemarcarAgendamentoModal from '@/components/RemarcarAgendamentoModal'
import DetalheAgendamento from '@/modules/agenda/components/DetalheAgendamento'
import { ContextoAuth } from '@/modules/auth/contexto'
import { useAuthPermissao } from '@/modules/auth/useAuthPermissao'
import {
  formatarDataCurta,
  formatarDataLonga,
  hojeISO,
  inicioSemana,
  somarDias,
} from '@/modules/agenda/catalogo'
import { estiloStatus } from '@/modules/agenda/presentacao'
import {
  bloqueioCobre,
  paraMinutos,
  rotuloBloqueio,
  slotsDoExpediente,
  somaMinutos,
} from '@/modules/agenda/regras'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { useServicos } from '@/modules/servicos/store'

export type SlotAgendamento = {
  data: string
  horario: string
  profissional: string
}

type Coluna = { nome: string; foto: string }

type Props = {
  onNovo: (slot?: SlotAgendamento) => void
}

function rotuloDia(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const texto = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'short',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '')
}

export default function Agenda({ onNovo }: Props) {
  const { agendamentos, mudarStatus, remover, expediente, bloqueios } =
    useAgenda()
  const { jaPago } = useCaixa()
  const { profissionais } = useProfissionais()
  const { servicos } = useServicos()

  // Permissões de ação (mesmo mapa único do RLS). Fora do AuthProvider
  // (testes/render isolado) não há papel a consultar — mantém o comportamento
  // atual; em produção a página só existe dentro do AuthProvider.
  const auth = useContext(ContextoAuth)
  const { pode } = useAuthPermissao()
  const comSessao = auth !== null
  const podeVerTodas = !comSessao || pode('agenda:ver_todas')
  const podeExpediente = !comSessao || pode('agenda:expediente_gerenciar')
  const podeBloqueios = !comSessao || pode('agenda:bloqueios_gerenciar')
  // Nome do cadastro vinculado à conta (`profissionais.user_id`). É a mesma
  // posse do RLS: sem vínculo não há coluna a restringir — a grade fica como
  // está e os dados continuam protegidos pelo banco.
  const meuProfissional = profissionais.find(
    (p) => p.userId && p.userId === auth?.perfil?.userId,
  )?.nome
  const [data, setData] = useState(hojeISO())
  const [visual, setVisual] = useState<'dia' | 'semana'>('dia')
  const [selecionado, setSelecionado] = useState<Agendamento | null>(null)
  const [pagando, setPagando] = useState<Agendamento | null>(null)
  const [remarcando, setRemarcando] = useState<Agendamento | null>(null)
  const [expedienteAberto, setExpedienteAberto] = useState(false)
  const [bloqueiosAberto, setBloqueiosAberto] = useState(false)
  const [editando, setEditando] = useState<Agendamento | null>(null)

  const slots = useMemo(() => slotsDoExpediente(expediente), [expediente])

  const doDia = useMemo(
    () =>
      agendamentos
        .filter((ag) => ag.data === data)
        .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos, data],
  )

  const inicioSemanaISO = useMemo(() => inicioSemana(data), [data])
  const diasSemana = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => somarDias(inicioSemanaISO, i)),
    [inicioSemanaISO],
  )
  const doSemana = useMemo(
    () =>
      agendamentos
        .filter((ag) => ag.data >= diasSemana[0] && ag.data <= diasSemana[6])
        .sort((a, b) =>
          `${a.data} ${a.horario}`.localeCompare(`${b.data} ${b.horario}`),
        ),
    [agendamentos, diasSemana],
  )

  const colunas = useMemo<Coluna[]>(() => {
    // Uma coluna por nome: cadastros duplicados compartilham a coluna e o
    // registro ativo é o representante (foto e status). A ordem segue o
    // cadastro (nome); o histórico nunca é alterado.
    const escolhidos = new Map<string, { coluna: Coluna; ativo: boolean }>()
    for (const p of profissionais) {
      // Somente o cadastro ATIVO vira coluna operacional. Histórico continua
      // no banco mesmo quando o profissional é inativado (ativo=false).
      if (!p.ativo) continue
      const atual = escolhidos.get(p.nome)
      if (!atual) {
        escolhidos.set(p.nome, {
          coluna: { nome: p.nome, foto: p.foto ?? '' },
          ativo: p.ativo,
        })
        continue
      }
      if (p.ativo && !atual.ativo) {
        escolhidos.set(p.nome, {
          coluna: { nome: p.nome, foto: p.foto ?? '' },
          ativo: true,
        })
      }
    }
    const lista: Coluna[] = [...escolhidos.values()].map((e) => e.coluna)
    for (const ag of doDia) {
      if (escolhidos.has(ag.profissional)) continue
      // Profissional cadastrado inativo (ex.: TESTE) NÃO volta como coluna;
      // nome que não existe mais em profissionais segue visível como antes.
      if (profissionais.some((p) => p.nome === ag.profissional)) continue
      escolhidos.set(ag.profissional, {
        coluna: { nome: ag.profissional, foto: '' },
        ativo: false,
      })
      lista.push({ nome: ag.profissional, foto: '' })
    }
    // Somente a própria coluna para quem não tem `agenda:ver_todas` (a
    // profissional com conta vinculada) — mesma posse da RLS. Sem vínculo
    // não há o que restringir e o banco já devolve só a agenda própria.
    if (podeVerTodas || !meuProfissional) return lista
    return lista.filter((c) => c.nome === meuProfissional)
  }, [profissionais, doDia, podeVerTodas, meuProfissional])

  const duracaoDo = useMemo(() => {
    return (servico: string) =>
      servicos.find((s) => s.nome === servico)?.duracaoMin ?? 30
  }, [servicos])

  // Agendamentos que a grade não mostra: horário fora do expediente atual
  // (encaixados antes de uma mudança de configuração, por exemplo).
  // Somem da visualização — a lista abaixo da grade mantém o dado visível.
  const foraDaGrade = useMemo(() => {
    const lista = visual === 'dia' ? doDia : doSemana
    return lista.filter((ag) => !slots.some((s) => s.hora === ag.horario))
  }, [visual, doDia, doSemana, slots])

  const pendentes = doDia.filter((a) => a.status === 'pendente').length
  const confirmados = doDia.filter((a) => a.status === 'confirmado').length

  const linhaDe = (hora: string) => slots.findIndex((s) => s.hora === hora) + 2

  const celulaBloqueada = (profissional: string, hora: string) =>
    bloqueioCobre(bloqueios, {
      data,
      horario: hora,
      duracaoMin: 30,
      profissional,
    }) !== null

  const linhaAlmoco = slots.findIndex((s) => s.intervalo)
  const spanAlmoco = slots.filter((s) => s.intervalo).length
  const temAlmoco = linhaAlmoco >= 0

  const passo = visual === 'semana' ? 7 : 1
  // Clique rápido na semana agenda com o primeiro profissional ativo.
  // Quem só enxerga a própria agenda agenda sempre no próprio cadastro —
  // senão o clique rápido criaria um agendamento para um colega.
  const profissionalPadrao =
    podeVerTodas || !meuProfissional
      ? ((profissionais.find((p) => p.ativo) ?? profissionais[0])?.nome ?? '')
      : meuProfissional
  // Profissional inativo mantém coluna e histórico, apenas sinalizado.
  // Com duplicidade de nome, a marca só aparece quando NENHUM cadastro
  // ativo tem esse nome — o registro ativo representa a coluna. Nome que
  // só existe em agendamento (sem cadastro) segue sem marca, como antes.
  const profissionalInativo = (nome: string) =>
    profissionais.some((p) => p.nome === nome) &&
    !profissionais.some((p) => p.nome === nome && p.ativo)

  const botaoNav =
    'rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F3ECDA]'
  const chipToggle =
    'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors'
  const botaoToolbar =
    'rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]'

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#121110]">
            Agenda
          </h1>
          <p className="mt-2 text-[13px] text-[#3A352C]">
            {visual === 'dia'
              ? `${formatarDataLonga(data)} · ${doDia.length} atendimento(s) · ${pendentes} pendente(s) · ${confirmados} confirmado(s)`
              : `Semana de ${formatarDataCurta(diasSemana[0])} a ${formatarDataCurta(diasSemana[6])} · ${doSemana.length} atendimento(s)`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNovo()}
          className="shrink-0 rounded-lg bg-[#C9A24A] px-4 py-2.5 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
        >
          + Agendar
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        <button
          type="button"
          onClick={() => setData((d) => somarDias(d, -passo))}
          className={botaoNav}
          aria-label="Dia anterior"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setData(hojeISO())}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-medium hover:bg-[#F3ECDA]"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setData((d) => somarDias(d, passo))}
          className={botaoNav}
          aria-label="Próximo dia"
        >
          ›
        </button>
        <input
          type="date"
          aria-label="Data da agenda"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#E5DCC3] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setVisual('dia')}
              className={`${chipToggle} ${
                visual === 'dia'
                  ? 'bg-[#C9A24A] text-[#121110]'
                  : 'text-[#3A352C] hover:bg-[#F3ECDA]'
              }`}
            >
              Dia
            </button>
            <button
              type="button"
              onClick={() => setVisual('semana')}
              className={`${chipToggle} ${
                visual === 'semana'
                  ? 'bg-[#C9A24A] text-[#121110]'
                  : 'text-[#3A352C] hover:bg-[#F3ECDA]'
              }`}
            >
              Semana
            </button>
          </div>
          {podeExpediente && (
            <button
              type="button"
              onClick={() => setExpedienteAberto(true)}
              className={botaoToolbar}
            >
              Expediente
            </button>
          )}
          {podeBloqueios && (
            <button
              type="button"
              onClick={() => setBloqueiosAberto(true)}
              className={botaoToolbar}
            >
              Bloqueios
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-[11px] font-semibold tracking-[0.12em] text-[#7C7469] uppercase">
        Clique em um horário vazio para agendar
      </p>

      {visual === 'dia' && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3]">
          <div
            className="grid min-w-[640px]"
            style={{
              gridTemplateColumns: `56px repeat(${colunas.length}, minmax(0, 1fr))`,
              gridTemplateRows: `auto repeat(${slots.length}, minmax(52px, auto))`,
            }}
          >
            {/* Cabeçalho */}
            <div className="border-b border-r border-[#E5DCC3] bg-[#FAF6EB]" />
            {colunas.map((col) => (
              <div
                key={col.nome}
                className="flex items-center gap-2 border-b border-r border-[#E5DCC3] bg-[#FAF6EB] px-3 py-2"
              >
                <Avatar nome={col.nome} foto={col.foto} tamanho="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#121110]">
                    {col.nome}
                  </p>
                  <p className="text-[10px] text-[#7C7469]">
                    Barbeiro(a)
                    {profissionalInativo(col.nome) ? ' · inativo' : ''}
                  </p>
                </div>
              </div>
            ))}

            {/* Linhas de horário */}
            {slots.map((slot, i) => (
              <div
                key={`hora-${slot.hora}`}
                className="flex items-start justify-end border-r border-b border-[#E5DCC3] bg-[#FAF6EB] pr-2 pt-1.5 text-[11px] font-semibold text-[#7C7469]"
                style={{ gridColumn: 1, gridRow: i + 2 }}
              >
                {slot.hora}
              </div>
            ))}

            {/* Células clicáveis */}
            {slots.map((slot, i) =>
              colunas.map((col, c) => {
                if (slot.intervalo) return null
                const bloqueada = celulaBloqueada(col.nome, slot.hora)
                if (bloqueada)
                  return (
                    <div
                      key={`${slot.hora}-${col.nome}`}
                      className="cursor-default border-r border-b border-[#EFE7D3] bg-[#F5EFE0]"
                      style={{ gridColumn: c + 2, gridRow: i + 2 }}
                      aria-disabled="true"
                      aria-label={`Bloqueado ${slot.hora} com ${col.nome}`}
                    />
                  )
                if (profissionalInativo(col.nome))
                  return (
                    // Coluna só de inativos: mantém o histórico na grade,
                    // mas não abre novos agendamentos.
                    <div
                      key={`${slot.hora}-${col.nome}`}
                      className="cursor-default border-r border-b border-[#EFE7D3] bg-[#F5EFE0]"
                      style={{ gridColumn: c + 2, gridRow: i + 2 }}
                      aria-disabled="true"
                      aria-label={`Indisponível ${slot.hora} com ${col.nome} — inativo`}
                    />
                  )
                return (
                  <div
                    key={`${slot.hora}-${col.nome}`}
                    className="cursor-pointer border-r border-b border-[#EFE7D3] transition-colors hover:bg-[#F7F1E2]"
                    style={{ gridColumn: c + 2, gridRow: i + 2 }}
                    onClick={() =>
                      onNovo({
                        data,
                        horario: slot.hora,
                        profissional: col.nome,
                      })
                    }
                    aria-label={`Agendar ${slot.hora} com ${col.nome}`}
                  />
                )
              }),
            )}

            {/* Faixa de almoço (expediente) */}
            {temAlmoco && (
              <div
                className="flex items-center justify-center border-b border-[#E5DCC3] bg-[#EDE5D2] text-xs font-medium text-[#A99E85]"
                style={{
                  gridColumn: `2 / ${colunas.length + 2}`,
                  gridRow: `${linhaAlmoco + 2} / span ${spanAlmoco}`,
                }}
              >
                Almoço — {expediente.almocoInicio} às {expediente.almocoFim}
              </div>
            )}

            {/* Bloqueios do dia (por profissional) */}
            {colunas.flatMap((col, c) =>
              bloqueios
                .filter(
                  (b) =>
                    b.profissional === col.nome &&
                    data >= b.data &&
                    data <= (b.dataFim ?? b.data),
                )
                .map((b) => {
                  const ini = paraMinutos(b.inicio)
                  const fim = paraMinutos(b.fim)
                  let linha = -1
                  let span = 0
                  slots.forEach((slot, i) => {
                    const s = paraMinutos(slot.hora)
                    if (s < fim && s + 30 > ini) {
                      if (linha < 0) linha = i
                      span += 1
                    }
                  })
                  if (linha < 0 || span === 0) return null
                  return (
                    <div
                      key={`${b.id}-${col.nome}`}
                      className="z-10 m-[2px] flex flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-[#C9BFA4] bg-[#EDE5D2] px-1 text-center"
                      style={{
                        gridColumn: c + 2,
                        gridRow: `${linha + 2} / span ${span}`,
                      }}
                    >
                      <span className="w-full truncate text-[11px] leading-tight font-semibold text-[#7C7469]">
                        {rotuloBloqueio(b)}
                      </span>
                      <span className="text-[10px] leading-tight text-[#A99E85]">
                        {b.inicio}–{b.fim}
                      </span>
                    </div>
                  )
                }),
            )}

            {/* Agendamentos posicionados na grade */}
            {doDia.map((ag) => {
              const linha = linhaDe(ag.horario)
              if (linha < 2) return null
              const coluna = colunas.findIndex((c) => c.nome === ag.profissional)
              if (coluna < 0) return null
              const duracao = duracaoDo(ag.servico)
              const spanMax = slots.length + 2 - linha
              const span = Math.max(
                1,
                Math.min(Math.ceil(duracao / 30), spanMax),
              )
              return (
                <button
                  key={ag.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelecionado(ag)
                  }}
                  className={`z-10 m-[2px] flex flex-col items-center justify-center overflow-hidden rounded-md border px-1.5 text-center transition-colors ${estiloStatus(ag.status)}`}
                  style={{
                    gridColumn: coluna + 2,
                    gridRow: `${linha} / span ${span}`,
                  }}
                >
                  <span className="w-full truncate text-xs leading-tight font-bold">
                    {ag.cliente}
                  </span>
                  <span className="text-[10px] leading-tight opacity-90">
                    {ag.horario}–{somaMinutos(ag.horario, duracao)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {visual === 'semana' && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3]">
          <div
            className="grid min-w-[840px]"
            style={{
              gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))`,
              gridTemplateRows: `auto repeat(${slots.length}, minmax(56px, auto))`,
            }}
          >
            {/* Cabeçalho */}
            <div className="border-b border-r border-[#E5DCC3] bg-[#FAF6EB]" />
            {diasSemana.map((dia) => (
              <div
                key={dia}
                className={`border-b border-r border-[#E5DCC3] px-2 py-2 text-center ${
                  dia === hojeISO() ? 'bg-[#F7F1E2]' : 'bg-[#FAF6EB]'
                }`}
              >
                <p className="text-[11px] font-bold text-[#121110]">
                  {rotuloDia(dia)} · {formatarDataCurta(dia)}
                </p>
                {dia === hojeISO() && (
                  <p className="text-[10px] font-semibold text-[#8A6A14]">
                    Hoje
                  </p>
                )}
              </div>
            ))}

            {/* Linhas de horário */}
            {slots.map((slot, i) => (
              <div
                key={`w-hora-${slot.hora}`}
                className="flex items-start justify-end border-r border-b border-[#E5DCC3] bg-[#FAF6EB] pr-2 pt-1.5 text-[11px] font-semibold text-[#7C7469]"
                style={{ gridColumn: 1, gridRow: i + 2 }}
              >
                {slot.hora}
              </div>
            ))}

            {/* Células da semana */}
            {slots.map((slot, i) =>
              diasSemana.map((dia, d) => {
                if (slot.intervalo) return null
                const ags = agendamentos.filter(
                  (ag) => ag.data === dia && ag.horario === slot.hora,
                )
                const cobertos = bloqueios.filter(
                  (b) =>
                    dia >= b.data &&
                    dia <= (b.dataFim ?? b.data) &&
                    paraMinutos(slot.hora) < paraMinutos(b.fim) &&
                    paraMinutos(slot.hora) + 30 > paraMinutos(b.inicio),
                )
                const iniciando = cobertos.filter(
                  (b) =>
                    paraMinutos(b.inicio) >= paraMinutos(slot.hora) &&
                    paraMinutos(b.inicio) <
                      paraMinutos(slot.hora) + 30,
                )
                return (
                  <div
                    key={`${dia}-${slot.hora}`}
                    className={`flex flex-col gap-0.5 overflow-hidden border-r border-b border-[#EFE7D3] p-0.5 transition-colors ${
                      cobertos.length > 0
                        ? 'cursor-default bg-[#F5EFE0]'
                        : 'cursor-pointer hover:bg-[#F7F1E2]'
                    }`}
                    style={{ gridColumn: d + 2, gridRow: i + 2 }}
                    onClick={() => {
                      if (cobertos.length > 0 || slot.intervalo) return
                      onNovo({
                        data: dia,
                        horario: slot.hora,
                        profissional: profissionalPadrao,
                      })
                    }}
                    aria-label={
                      cobertos.length > 0
                        ? `Bloqueado ${slot.hora} em ${formatarDataCurta(dia)}`
                        : `Agendar ${slot.hora} em ${formatarDataCurta(dia)}`
                    }
                  >
                    {iniciando.map((b) => (
                      <span
                        key={b.id}
                        className="truncate rounded border border-dashed border-[#C9BFA4] bg-[#EDE5D2] px-1 text-[9px] leading-tight font-medium text-[#7C7469]"
                      >
                        {rotuloBloqueio(b)} · {b.inicio}–{b.fim}
                      </span>
                    ))}
                    {ags.map((ag) => (
                      <button
                        key={ag.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelecionado(ag)
                        }}
                        className={`flex w-full flex-col items-start overflow-hidden rounded border px-1 py-0.5 text-left transition-colors ${estiloStatus(ag.status)}`}
                      >
                        <span className="w-full truncate text-[10px] leading-tight font-bold">
                          {ag.cliente}
                        </span>
                        <span className="w-full truncate text-[9px] leading-tight opacity-90">
                          {ag.horario} · {ag.profissional}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              }),
            )}

            {/* Faixa de almoço (expediente) */}
            {temAlmoco && (
              <div
                className="flex items-center justify-center border-b border-[#E5DCC3] bg-[#EDE5D2] text-xs font-medium text-[#A99E85]"
                style={{
                  gridColumn: '2 / 9',
                  gridRow: `${linhaAlmoco + 2} / span ${spanAlmoco}`,
                }}
              >
                Almoço — {expediente.almocoInicio} às {expediente.almocoFim}
              </div>
            )}
          </div>
        </div>
      )}

      {foraDaGrade.length > 0 && (
        <div
          className="mt-3 rounded-xl border border-[#E5C9A0] bg-[#FBF3E4] p-3"
          data-testid="fora-do-expediente"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A6A14]">
            Fora do expediente atual ({expediente.inicio} às {expediente.fim})
          </p>
          <p className="mt-1 text-xs text-[#7C7469]">
            Estes agendamentos não aparecem na grade porque caem fora do
            horário configurado. Clique para abrir ou remarcar.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {foraDaGrade.map((ag) => (
              <button
                key={ag.id}
                type="button"
                onClick={() => setSelecionado(ag)}
                className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${estiloStatus(ag.status)}`}
              >
                <span className="font-bold">{ag.cliente}</span>
                <span className="ml-2 opacity-90">
                  {formatarDataCurta(ag.data)} · {ag.horario} · {ag.profissional}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selecionado && (
        <DetalheAgendamento
          ag={selecionado}
          duracaoDo={duracaoDo}
          mudarStatus={mudarStatus}
          remover={remover}
          pago={Boolean(jaPago(selecionado.id))}
          onPagar={() => {
            setPagando(selecionado)
            setSelecionado(null)
          }}
          onRemarcar={() => {
            setRemarcando(selecionado)
            setSelecionado(null)
          }}
          onEditar={() => {
            setEditando(selecionado)
            setSelecionado(null)
          }}
          onFechar={() => setSelecionado(null)}
        />
      )}

      {editando && (
        <EditarAgendamentoModal
          agendamento={editando}
          onFechar={() => setEditando(null)}
        />
      )}

      {pagando && (
        <PagamentoModal
          agendamento={pagando}
          onFechar={() => setPagando(null)}
        />
      )}

      {remarcando && (
        <RemarcarAgendamentoModal
          agendamento={remarcando}
          onFechar={() => setRemarcando(null)}
        />
      )}

      {expedienteAberto && (
        <ExpedienteModal onFechar={() => setExpedienteAberto(false)} />
      )}

      {bloqueiosAberto && (
        <BloqueiosModal onFechar={() => setBloqueiosAberto(false)} />
      )}
    </div>
  )
}
