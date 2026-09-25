import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { arquivoParaFoto } from '@/lib/imagem'
import { useProfissionais } from '@/modules/profissionais/store'
import type { Profissional } from '@/modules/profissionais/types'

type Props = {
  profissional?: Profissional | null
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (!partes[0]) return '??'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export default function ProfissionalFormModal({
  profissional,
  onFechar,
}: Props) {
  const { adicionar, atualizar } = useProfissionais()
  const [nome, setNome] = useState(() => profissional?.nome ?? '')
  const [telefone, setTelefone] = useState(() => profissional?.telefone ?? '')
  const [email, setEmail] = useState(() => profissional?.email ?? '')
  const [foto, setFoto] = useState(() => profissional?.foto ?? '')
  const [erro, setErro] = useState('')
  const [processandoFoto, setProcessandoFoto] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const editando = Boolean(profissional)

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  async function aoEscolherArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite reescolher o mesmo arquivo
    if (!arquivo) return
    setErro('')
    try {
      setProcessandoFoto(true)
      setFoto(await arquivoParaFoto(arquivo))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao processar a imagem.')
    } finally {
      setProcessandoFoto(false)
    }
  }

  function salvar() {
    if (nome.trim().length < 2) {
      setErro('Informe o nome completo do profissional.')
      return
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro('Informe um e-mail válido ou deixe em branco.')
      return
    }
    const dados = { nome, telefone, email, foto }
    if (profissional) atualizar(profissional.id, dados)
    else adicionar(dados)
    onFechar()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1C1A15]">
              {editando ? 'Editar profissional' : 'Novo profissional'}
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Foto, telefone e e-mail ficam salvos no cadastro.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#8A8171] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <input
          ref={arquivoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={aoEscolherArquivo}
        />

        <div className="mt-4 flex flex-col gap-5 sm:flex-row">
          {/* Foto */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            <div className="h-24 w-24 overflow-hidden rounded-full border border-[#E5DCC3] bg-[#F3ECDA]">
              {foto ? (
                <img
                  src={foto}
                  alt={`Foto de ${nome || 'profissional'}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl font-bold text-[#8A6A14]">
                  {iniciais(nome)}
                </div>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={processandoFoto}
                onClick={() => arquivoRef.current?.click()}
                className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA] disabled:opacity-60"
              >
                {processandoFoto
                  ? 'Processando...'
                  : foto
                    ? 'Trocar foto'
                    : 'Adicionar foto'}
              </button>
              {foto && (
                <button
                  type="button"
                  onClick={() => setFoto('')}
                  className="rounded-lg px-2 py-1 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                >
                  Remover foto
                </button>
              )}
            </div>
          </div>

          {/* Campos */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <label className={rotulo} htmlFor="prof-nome">
                Nome completo *
              </label>
              <input
                id="prof-nome"
                className={campo}
                placeholder="Ex.: Audax Ferreira"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="prof-tel">
                Telefone / WhatsApp
              </label>
              <input
                id="prof-tel"
                className={campo}
                placeholder="(11) 99999-9999"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="prof-email">
                E-mail
              </label>
              <input
                id="prof-email"
                type="email"
                className={campo}
                placeholder="profissional@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
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
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={processandoFoto}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F] disabled:opacity-60"
          >
            {editando ? 'Salvar alterações' : 'Cadastrar profissional'}
          </button>
        </div>
      </div>
    </div>
  )
}
