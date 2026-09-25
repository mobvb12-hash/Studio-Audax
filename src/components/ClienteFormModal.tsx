import { useEffect, useState } from 'react'
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

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

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

function digitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

export default function ClienteFormModal({
  cliente,
  onFechar,
  aoRenomear,
}: Props) {
  const { adicionar, atualizar } = useClientes()
  const [nome, setNome] = useState(() => cliente?.nome ?? '')
  const [telefone, setTelefone] = useState(() => cliente?.telefone ?? '')
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
    const numero = telefone.trim()
    if (!digitos(numero)) {
      setErro('Digite o telefone antes de adicionar.')
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

  function montarNascimento(): { iso: string; erro?: string } {
    const algumPreenchido = Boolean(dia || mes || ano)
    if (!algumPreenchido) return { iso: '' }
    if (!dia || !mes || !ano) {
      return { iso: '', erro: 'Informe dia, mês e ano do nascimento ou deixe em branco.' }
    }
    const a = Number(ano)
    if (Number.isNaN(a) || a < 1900 || a > anoAtual) {
      return { iso: '', erro: 'Ano de nascimento inválido.' }
    }
    const d = Number(dia)
    const m = Number(mes)
    const testada = new Date(a, m - 1, d)
    if (
      testada.getFullYear() !== a ||
      testada.getMonth() !== m - 1 ||
      testada.getDate() !== d
    ) {
      return { iso: '', erro: 'Data de nascimento inválida.' }
    }
    const mm = String(m).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    return { iso: `${a}-${mm}-${dd}` }
  }

  function salvar() {
    if (nome.trim().length < 2) {
      setErro('Informe o nome do cliente.')
      return
    }
    if (!digitos(telefone)) {
      setErro('Informe o telefone do cliente.')
      return
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro('Informe um e-mail válido ou deixe em branco.')
      return
    }
    if (cpf.trim() && digitos(cpf).length !== 11) {
      setErro('Informe um CPF com 11 dígitos ou deixe em branco.')
      return
    }
    if (cnpj.trim() && digitos(cnpj).length !== 14) {
      setErro('Informe um CNPJ com 14 dígitos ou deixe em branco.')
      return
    }
    const nascimento = montarNascimento()
    if (nascimento.erro) {
      setErro(nascimento.erro)
      return
    }
    const dados = {
      nome: nome.trim(),
      telefone: telefone.trim(),
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
            <h2 className="text-lg font-bold text-[#1C1A15]">
              {editando ? 'Editar cliente' : 'Novo cliente'}
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Salvo neste navegador (localStorage) até o backend chegar.
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
            <div className="flex gap-2">
              <select
                aria-label="Tipo de telefone"
                className={`${campo} w-32 shrink-0`}
                value={tipoTelefone}
                onChange={(e) => setTipoTelefone(e.target.value as TipoTelefone)}
              >
                {TIPOS_TELEFONE.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.texto}
                  </option>
                ))}
              </select>
              <span className="flex shrink-0 items-center rounded-lg border border-[#E5DCC3] bg-[#FAF6EB] px-2.5 text-sm text-[#4A4436]">
                +55
              </span>
              <input
                id="cli-tel"
                className={campo}
                placeholder="(81) 99999-9999"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
              <button
                type="button"
                aria-label="Adicionar telefone"
                onClick={adicionarTelefone}
                className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-3 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
              >
                + adicionar
              </button>
            </div>
            {telefones.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {telefones.map((t) => (
                  <li
                    key={`${t.tipo}-${t.numero}`}
                    className="flex items-center gap-1.5 rounded-full border border-[#E5DCC3] bg-[#FAF6EB] px-2.5 py-1 text-xs text-[#4A4436]"
                  >
                    {TIPOS_TELEFONE.find((x) => x.valor === t.tipo)?.texto}:{' '}
                    {t.numero}
                    <button
                      type="button"
                      aria-label={`Remover telefone ${t.numero}`}
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
                className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-3 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
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

          <div className="sm:col-span-2">
            <p className={rotulo}>Notificações</p>
            <div className="flex flex-col gap-1.5">
              <label
                className="flex items-center gap-2 text-sm text-[#1C1A15]"
                htmlFor="cli-notif-email"
              >
                <input
                  id="cli-notif-email"
                  type="checkbox"
                  checked={preferencias.emailAgendamentos}
                  onChange={(e) =>
                    setPreferencias((p) => ({
                      ...p,
                      emailAgendamentos: e.target.checked,
                    }))
                  }
                />
                Cliente recebe e-mails sobre seus agendamentos
              </label>
              <label
                className="flex items-center gap-2 text-sm text-[#1C1A15]"
                htmlFor="cli-notif-sms"
              >
                <input
                  id="cli-notif-sms"
                  type="checkbox"
                  checked={preferencias.smsLembrete}
                  onChange={(e) =>
                    setPreferencias((p) => ({
                      ...p,
                      smsLembrete: e.target.checked,
                    }))
                  }
                />
                Cliente recebe SMS/Notificação Push de lembrete
              </label>
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className={rotulo}>Campanhas</p>
            <div className="flex flex-col gap-1.5">
              <label
                className="flex items-center gap-2 text-sm text-[#1C1A15]"
                htmlFor="cli-camp-sms"
              >
                <input
                  id="cli-camp-sms"
                  type="checkbox"
                  checked={preferencias.smsMarketing}
                  onChange={(e) =>
                    setPreferencias((p) => ({
                      ...p,
                      smsMarketing: e.target.checked,
                    }))
                  }
                />
                Cliente recebe SMS marketing
              </label>
              <label
                className="flex items-center gap-2 text-sm text-[#1C1A15]"
                htmlFor="cli-camp-email"
              >
                <input
                  id="cli-camp-email"
                  type="checkbox"
                  checked={preferencias.emailMarketing}
                  onChange={(e) =>
                    setPreferencias((p) => ({
                      ...p,
                      emailMarketing: e.target.checked,
                    }))
                  }
                />
                Cliente recebe e-mail marketing
              </label>
            </div>
          </div>

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
            <>
              <div>
                <label className={rotulo} htmlFor="cli-cep">
                  CEP
                </label>
                <input
                  id="cli-cep"
                  className={campo}
                  placeholder="00000-000"
                  inputMode="numeric"
                  value={endereco.cep}
                  onChange={(e) =>
                    setEndereco((a) => ({ ...a, cep: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={rotulo} htmlFor="cli-end-numero">
                  Número
                </label>
                <input
                  id="cli-end-numero"
                  className={campo}
                  value={endereco.numero}
                  onChange={(e) =>
                    setEndereco((a) => ({ ...a, numero: e.target.value }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className={rotulo} htmlFor="cli-logradouro">
                  Logradouro
                </label>
                <input
                  id="cli-logradouro"
                  className={campo}
                  placeholder="Rua, avenida..."
                  value={endereco.logradouro}
                  onChange={(e) =>
                    setEndereco((a) => ({ ...a, logradouro: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={rotulo} htmlFor="cli-complemento">
                  Complemento
                </label>
                <input
                  id="cli-complemento"
                  className={campo}
                  placeholder="Apto, bloco..."
                  value={endereco.complemento}
                  onChange={(e) =>
                    setEndereco((a) => ({ ...a, complemento: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={rotulo} htmlFor="cli-bairro">
                  Bairro
                </label>
                <input
                  id="cli-bairro"
                  className={campo}
                  value={endereco.bairro}
                  onChange={(e) =>
                    setEndereco((a) => ({ ...a, bairro: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={rotulo} htmlFor="cli-cidade">
                  Cidade
                </label>
                <input
                  id="cli-cidade"
                  className={campo}
                  value={endereco.cidade}
                  onChange={(e) =>
                    setEndereco((a) => ({ ...a, cidade: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={rotulo} htmlFor="cli-uf">
                  UF
                </label>
                <input
                  id="cli-uf"
                  className={campo}
                  maxLength={2}
                  placeholder="PE"
                  value={endereco.uf}
                  onChange={(e) =>
                    setEndereco((a) => ({
                      ...a,
                      uf: e.target.value.toUpperCase().slice(0, 2),
                    }))
                  }
                />
              </div>
            </>
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
              className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
            >
              {editando ? 'Salvar alterações' : 'Cadastrar cliente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
