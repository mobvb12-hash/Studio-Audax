import {
  CAMPO_FORM as campo,
  CAMPO_SELECT as campoSelect,
  ROTULO_FORM as rotulo,
  mascararTelefone,
} from '@/lib/apresentacao'
import { useEffect, useState } from 'react'
import EnderecoBloco from '@/modules/clientes/components/EnderecoBloco'
import PreferenciasBloco from '@/modules/clientes/components/PreferenciasBloco'
import {
  digitos,
  montarNascimento,
  validarDadosCliente,
} from '@/modules/clientes/regras'
import { useClientes } from '@/modules/clientes/store'
import type {
  Cliente,
  ClienteGenero,
  EnderecoCliente,
  TipoTelefone,
} from '@/modules/clientes/types'
import { preferenciasPadrao } from '@/modules/clientes/types'

type Props = {
  cliente?: Cliente | null
  onFechar: () => void
  /** Chamado quando o nome muda, para propagar aos módulos (Agenda/Caixa) */
  aoRenomear?: (antigo: string, novo: string) => void
}

const GENEROS: { valor: ClienteGenero; texto: string }[] = [
  { valor: 'nao_informado', texto: 'Não informado' },
  { valor: 'masculino', texto: 'Masculino' },
  { valor: 'feminino', texto: 'Feminino' },
  { valor: 'outro', texto: 'Outro' },
]

const TIPOS_TELEFONE: { valor: TipoTelefone; texto: string }[] = [
  { valor: 'celular', texto: 'Celular' },
  { valor: 'residencial', texto: 'Residencial' },
  { valor: 'comercial', texto: 'Comercial' },
]

const ORIGENS = [
  'Indicação de amigo',
  'Instagram',
  'Facebook',
  'Google',
  'Passou na porta',
  'Outro',
]

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export default function ClienteFormModal({
  cliente,
  onFechar,
  aoRenomear,
}: Props) {
  const { adicionar, atualizar } = useClientes()
  const [nome, setNome] = useState(() => cliente?.nome ?? '')
  // Somente dígitos aqui; a máscara `DD NNNNN-NNNN` é aplicada só na exibição.
  const [telefone, setTelefone] = useState(() => digitos(cliente?.telefone ?? ''))
  const [tipoTelefone, setTipoTelefone] = useState<TipoTelefone>('celular')
  const [telefones, setTelefones] = useState(
    () => cliente?.telefones ?? [],
  )
  const [genero, setGenero] = useState<ClienteGenero>(
    () => cliente?.genero ?? 'nao_informado',
  )
  const [cpf, setCpf] = useState(() => cliente?.cpf ?? '')
  const [cnpj, setCnpj] = useState(() => cliente?.cnpj ?? '')
  const [email, setEmail] = useState(() => cliente?.email ?? '')
  const nasc = (cliente?.nascimento ?? '').split('-')
  const [dia, setDia] = useState(() => (nasc[2] ? String(Number(nasc[2])) : ''))
  const [mes, setMes] = useState(() => (nasc[1] ? String(Number(nasc[1])) : ''))
  const [ano, setAno] = useState(() => nasc[0] ?? '')
  const [etiquetas, setEtiquetas] = useState(() => cliente?.etiquetas ?? [])
  const [novaEtiqueta, setNovaEtiqueta] = useState('')
  const [instagram, setInstagram] = useState(() => cliente?.instagram ?? '')
  const [comoNosConheceu, setComoNosConheceu] = useState(
    () => cliente?.comoNosConheceu ?? '',
  )
  const [observacao, setObservacao] = useState(() => cliente?.observacao ?? '')
  const [preferencias, setPreferencias] = useState(() => ({
    ...preferenciasPadrao(),
    ...cliente?.preferencias,
  }))
  const [comEndereco, setComEndereco] = useState(() =>
    Boolean(cliente?.endereco),
  )
  const [endereco, setEndereco] = useState<EnderecoCliente>(
    () =>
      cliente?.endereco ?? {
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: '',
      },
  )
  const [erro, setErro] = useState('')

  const editando = Boolean(cliente)
  const anoAtual = new Date().getFullYear()

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function adicionarTelefone() {
    const numero = digitos(telefone)
    if (!numero) {
      setErro('Digite o telefone antes de adicionar.')
      return
    }
    if (telefones.some((t) => digitos(t.numero) === numero)) {
      setErro('Este telefone já foi adicionado.')
      return
    }
    setTelefones((atual) => [...atual, { tipo: tipoTelefone, numero }])
    setTelefone('')
    setErro('')
  }

  function removerTelefone(numero: string) {
    setTelefones((atual) => atual.filter((t) => t.numero !== numero))
  }

  function adicionarEtiqueta() {
    const valor = novaEtiqueta.trim()
    if (!valor) return
    setEtiquetas((atual) =>
      atual.includes(valor) ? atual : [...atual, valor],
    )
    setNovaEtiqueta('')
  }

  function removerEtiqueta(nome: string) {
    setEtiquetas((atual) => atual.filter((e) => e !== nome))
  }

  function salvar() {
    const erroForm = validarDadosCliente({ nome, telefone, email, cpf, cnpj })
    if (erroForm) {
      setErro(erroForm)
      return
    }
    const nascimento = montarNascimento({ dia, mes, ano }, anoAtual)
    if (nascimento.erro) {
      setErro(nascimento.erro)
      return
    }
    const dados = {
      nome: nome.trim(),
      telefone: digitos(telefone),
      email: email.trim(),
      observacao,
      genero,
      cpf: cpf.trim(),
      cnpj: cnpj.trim(),
      nascimento: nascimento.iso,
      etiquetas,
      instagram: instagram.trim(),
      comoNosConheceu,
      telefones,
      endereco: comEndereco ? endereco : null,
      preferencias,
    }
    try {
      if (cliente) {
        const antigo = cliente.nome
        const destino = nome.trim()
        atualizar(cliente.id, dados)
        if (antigo !== destino) aoRenomear?.(antigo, destino)
      } else {
        adicionar(dados)
      }
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#121110]">
              {editando ? 'Editar cliente' : 'Novo cliente'}
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
            <label className={rotulo} htmlFor="cli-nome">
              Nome *
            </label>
            <input
              id="cli-nome"
              className={campo}
              placeholder="Ex.: Lucas Mendes"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="cli-tel">
              Telefone *
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex shrink-0 items-center gap-2">
                <select
                  aria-label="Tipo de telefone"
                  className={`${campoSelect} w-[7rem] shrink-0 px-2!`}
                  value={tipoTelefone}
                  onChange={(e) => setTipoTelefone(e.target.value as TipoTelefone)}
                >
                  {TIPOS_TELEFONE.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.texto}
                    </option>
                  ))}
                </select>
                <span className="flex shrink-0 items-center rounded-lg border border-[#E5DCC3] bg-[#FAF6EB] px-2.5 py-2 text-sm text-[#3A352C]">
                  +55
                </span>
              </div>
              <div className="flex min-w-0 grow basis-[20rem] items-center gap-2 max-sm:flex-wrap">
                <input
                  id="cli-tel"
                  className={`${campo} min-w-[13.75rem] grow basis-[13.75rem]`}
                  inputMode="numeric"
                  placeholder="81 99999-9999"
                  value={mascararTelefone(telefone)}
                  onChange={(e) => setTelefone(digitos(e.target.value))}
                />
                <button
                  type="button"
                  aria-label="Adicionar telefone"
                  onClick={adicionarTelefone}
                  className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA] max-sm:w-full max-sm:text-center"
                >
                  + adicionar
                </button>
              </div>
            </div>
            {telefones.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {telefones.map((t) => (
                  <li
                    key={`${t.tipo}-${t.numero}`}
                    className="flex items-center gap-1.5 rounded-full border border-[#E5DCC3] bg-[#FAF6EB] px-2.5 py-1 text-xs text-[#3A352C]"
                  >
                    {TIPOS_TELEFONE.find((x) => x.valor === t.tipo)?.texto}:{' '}
                    {mascararTelefone(t.numero)}
                    <button
                      type="button"
                      aria-label={`Remover telefone ${mascararTelefone(t.numero)}`}
                      onClick={() => removerTelefone(t.numero)}
                      className="font-bold text-[#A99E85] hover:text-red-600"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sm:col-span-2 border-t border-dashed border-[#E5DCC3]" />

          <div>
            <label className={rotulo} htmlFor="cli-genero">
              Gênero
            </label>
            <select
              id="cli-genero"
              className={campo}
              value={genero}
              onChange={(e) => setGenero(e.target.value as ClienteGenero)}
            >
              {GENEROS.map((g) => (
                <option key={g.valor} value={g.valor}>
                  {g.texto}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="cli-cpf">
              CPF
            </label>
            <input
              id="cli-cpf"
              className={campo}
              placeholder="000.000.000-00"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="cli-cnpj">
              CNPJ
            </label>
            <input
              id="cli-cnpj"
              className={campo}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="cli-email">
              E-mail
            </label>
            <input
              id="cli-email"
              type="email"
              className={campo}
              placeholder="cliente@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <span className={rotulo}>Nascimento</span>
            <div className="flex gap-2">
              <select
                aria-label="Dia do nascimento"
                className={campo}
                value={dia}
                onChange={(e) => setDia(e.target.value)}
              >
                <option value="">Dia</option>
                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ),
                )}
              </select>
              <select
                aria-label="Mês do nascimento"
                className={campo}
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              >
                <option value="">Mês</option>
                {MESES.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                aria-label="Ano do nascimento"
                className={campo}
                value={ano}
                onChange={(e) => setAno(e.target.value)}
              >
                <option value="">Ano</option>
                {Array.from(
                  { length: anoAtual - 1899 },
                  (_, i) => String(anoAtual - i),
                ).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="cli-etiqueta">
              Etiquetas
            </label>
            {etiquetas.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {etiquetas.map((e) => (
                  <li
                    key={e}
                    className="flex items-center gap-1.5 rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-2.5 py-1 text-xs font-medium text-[#8A6A14]"
                  >
                    {e}
                    <button
                      type="button"
                      aria-label={`Remover etiqueta ${e}`}
                      onClick={() => removerEtiqueta(e)}
                      className="font-bold text-[#A99E85] hover:text-red-600"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                id="cli-etiqueta"
                className={campo}
                placeholder="Ex.: fiel, VIP"
                value={novaEtiqueta}
                onChange={(e) => setNovaEtiqueta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') adicionarEtiqueta()
                }}
              />
              <button
                type="button"
                aria-label="Adicionar etiqueta"
                onClick={adicionarEtiqueta}
                className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-3 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
              >
                +
              </button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="cli-instagram">
              Redes sociais
            </label>
            <input
              id="cli-instagram"
              className={campo}
              placeholder="@instacliente"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="cli-origem">
              Como nos conheceu
            </label>
            <select
              id="cli-origem"
              className={campo}
              value={comoNosConheceu}
              onChange={(e) => setComoNosConheceu(e.target.value)}
            >
              <option value="">Selecione...</option>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="cli-obs">
              Observações
            </label>
            <textarea
              id="cli-obs"
              className={`${campo} min-h-[64px] resize-y`}
              placeholder="Ex.: alergia a produtos com amônia..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          <PreferenciasBloco
            preferencias={preferencias}
            aoMudar={setPreferencias}
          />

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setComEndereco((v) => !v)}
              className="text-sm font-semibold text-[#8A6A14] underline"
            >
              {comEndereco
                ? 'Ocultar endereço do cliente'
                : 'Incluir Endereço do Cliente'}
            </button>
          </div>

          {comEndereco && (
            <EnderecoBloco endereco={endereco} aoMudar={setEndereco} />
          )}
        </div>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-red-600">* Campos obrigatórios</p>
          <div className="flex gap-2">
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
              {editando ? 'Salvar alterações' : 'Cadastrar cliente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
