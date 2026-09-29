import { useMemo, useState } from 'react'
import Avatar from '@/components/Avatar'
import ConfirmarModal from '@/components/ConfirmarModal'
import ProfissionalFormModal from '@/components/ProfissionalFormModal'
import { normalizarTexto } from '@/lib/moeda'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import { useComissoesOpcional } from '@/modules/comissoes/store'
import { useEsperaOpcional } from '@/modules/espera/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { profissionalEmUso } from '@/modules/profissionais/regras'
import type { Profissional } from '@/modules/profissionais/types'

/** Rótulo único para botões de cadastros que dividem o mesmo nome. */
function identificacao(prof: Profissional): string {
  const criado = new Date(prof.criadoEm)
  const quando = Number.isNaN(criado.getTime())
    ? ''
    : `criado em ${criado.toLocaleDateString('pt-BR')} · `
  return `${quando}id ${prof.id}`
}

function rotuloAcao(
  acao: string,
  prof: Profissional,
  repetido: boolean,
): string {
  return repetido ? `${acao} ${prof.nome} (${identificacao(prof)})` : `${acao} ${prof.nome}`
}

export default function Profissionais() {
  const { profissionais, remover, alternarAtivo } = useProfissionais()
  const { agendamentos, renomearProfissional: renomearNaAgenda } = useAgenda()
  const { lancamentos, renomearProfissional: renomearNoCaixa } = useCaixa()
  const {
    fechamentos,
    configs,
    renomearProfissional: renomearNasComissoes,
  } = useComissoesOpcional()
  const { renomearProfissional: renomearNaEspera } = useEsperaOpcional()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Profissional | null>(null)
  const [excluindo, setExcluindo] = useState<Profissional | null>(null)

  const contagem = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const ag of agendamentos) {
      if (ag.status !== 'concluido') continue
      mapa.set(ag.profissional, (mapa.get(ag.profissional) ?? 0) + 1)
    }
    return mapa
  }, [agendamentos])

  // Cadastros que dividem o mesmo nome (duplicidade legada): recebem
  // identificação visual e aria-label próprios para o usuário nunca
  // excluir/inativar o registro errado. O nome histórico não muda.
  const repetidos = useMemo(() => {
    const porNome = new Map<string, number>()
    for (const p of profissionais) {
      const chave = normalizarTexto(p.nome)
      porNome.set(chave, (porNome.get(chave) ?? 0) + 1)
    }
    return new Set(
      profissionais
        .filter((p) => (porNome.get(normalizarTexto(p.nome)) ?? 0) > 1)
        .map((p) => p.id),
    )
  }, [profissionais])

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Profissionais
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {profissionais.length} profissional(is) ·{' '}
            {profissionais.filter((p) => p.ativo).length} ativo(s) · cada um
            vira uma coluna na Agenda
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditando(null)
            setModalAberto(true)
          }}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
        >
          + Novo profissional
        </button>
      </div>

      {profissionais.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          Nenhum profissional cadastrado. A Agenda precisa de pelo menos um.
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {profissionais.map((prof) => (
            <li
              key={prof.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
            >
              <Avatar nome={prof.nome} foto={prof.foto} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#1C1A15]">
                  {prof.nome}
                </p>
                {repetidos.has(prof.id) && (
                  <p className="mt-0.5 text-[11px] font-semibold text-[#8A6A14]">
                    Nome repetido · {identificacao(prof)}
                  </p>
                )}
                <p className="mt-0.5 text-[13px] text-[#4A4436]">
                  {prof.telefone || 'Sem telefone'}
                  {prof.email ? ` · ${prof.email}` : ''}
                </p>
                <div className="mt-1.5">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      prof.ativo
                        ? 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                    }`}
                  >
                    {prof.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-[#E5DCC3] bg-white px-3 py-1 text-xs font-medium text-[#4A4436]">
                {contagem.get(prof.nome) ?? 0} atendimento(s)
              </span>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditando(prof)
                    setModalAberto(true)
                  }}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                  aria-label={rotuloAcao('Editar', prof, repetidos.has(prof.id))}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => alternarAtivo(prof.id)}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                  aria-label={rotuloAcao(
                    prof.ativo ? 'Inativar' : 'Reativar',
                    prof,
                    repetidos.has(prof.id),
                  )}
                >
                  {prof.ativo ? 'Inativar' : 'Reativar'}
                </button>
                <button
                  type="button"
                  onClick={() => setExcluindo(prof)}
                  className="rounded-lg px-2 py-1.5 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                  aria-label={rotuloAcao('Excluir', prof, repetidos.has(prof.id))}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalAberto && (
        <ProfissionalFormModal
          profissional={editando}
          aoRenomear={(antigo, novo) => {
            renomearNaAgenda(antigo, novo)
            renomearNoCaixa(antigo, novo)
            renomearNaEspera(antigo, novo)
            renomearNasComissoes(antigo, novo)
          }}
          onFechar={() => setModalAberto(false)}
        />
      )}

      {excluindo && (
        <ConfirmarModal
          titulo="Excluir profissional"
          texto={`Excluir “${excluindo.nome}”${
            repetidos.has(excluindo.id) ? ` (${identificacao(excluindo)})` : ''
          }? Os agendamentos e recebimentos já feitos são preservados no histórico.`}
          rotuloConfirmar="Sim, excluir"
          perigo
          onConfirmar={() => {
            // Sempre o ID exato da tela: com nome duplicado, o histórico
            // por nome é compartilhado e as referências por ID (fechamento
            // e configuração de comissão) pertencem só a este cadastro.
            const uso = profissionalEmUso(excluindo, {
              agendamentos,
              lancamentos,
              fechamentos,
              configs,
            })
            if (uso.emUso) {
              throw new Error(
                `“${excluindo.nome}” já aparece em ${uso.agendamentos} agendamento(s), ${uso.lancamentos} lançamento(oes) do caixa, ${uso.comissoes} fechamento(s) de comissão e ${uso.configuracoes} configuração(ões) de comissão — não é possível excluí-lo. Use “Inativar” para retirá-lo de novos agendamentos.`,
              )
            }
            remover(excluindo.id)
            setExcluindo(null)
          }}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </div>
  )
}
