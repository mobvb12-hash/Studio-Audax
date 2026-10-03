import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  obterMeuCadastro,
  type CadastroPainel,
} from '@/services/supabase/painel'
import { usePainelAuth } from '../usePainelAuth'
import { AvisoPainel, BotaoPrimario, Campo, ErroPainel } from './comum'
import { submeterFormulario } from './submissao'

const GENEROS: { valor: string; rotulo: string }[] = [
  { valor: 'nao_informado', rotulo: 'Não informado' },
  { valor: 'masculino', rotulo: 'Masculino' },
  { valor: 'feminino', rotulo: 'Feminino' },
  { valor: 'outro', rotulo: 'Outro' },
]

/**
 * Aba Perfil: edição do PRÓPRIO cadastro via RPC `painel_cliente_atualizar`
 * (018) — mesma base da Agenda, RLS de posse no servidor. O e-mail de
 * acesso fica só informativo: a troca de e-mail não acontece pelo painel.
 */
export default function TelaPerfilPainel() {
  const { erro, processando, atualizar } = usePainelAuth()
  const [cadastro, setCadastro] = useState<CadastroPainel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  // Clique em "Tentar de novo" muda a tentativa e o effect recarrega.
  const [tentativa, setTentativa] = useState(0)
  const [salvo, setSalvo] = useState(false)

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [genero, setGenero] = useState('nao_informado')

  useEffect(() => {
    let vivo = true
    obterMeuCadastro()
      .then((cad) => {
        if (!vivo) return
        setCadastro(cad)
        setErroCarga(
          cad === null
            ? 'Não foi possível localizar seu cadastro. Tente novamente.'
            : '',
        )
        if (cad !== null) {
          setNome(cad.nome)
          setTelefone(cad.telefone)
          setNascimento(cad.nascimento)
          setGenero(cad.genero)
        }
        setCarregando(false)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErroCarga(
          e instanceof Error && e.message
            ? e.message
            : 'Não foi possível carregar seu cadastro.',
        )
        setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [tentativa])

  function enviar(evento: FormEvent) {
    submeterFormulario(evento, () => {
      setSalvo(false)
      void atualizar({ nome, telefone, nascimento, genero }).then((ok) => {
        if (ok) {
          setSalvo(true)
          // recarrega para refletir o que o servidor normalizou
          setTentativa((atual) => atual + 1)
        }
      })
    })
  }

  if (carregando) {
    return (
      <p className="py-10 text-center text-sm text-noir-500">
        Carregando seu cadastro…
      </p>
    )
  }

  if (erroCarga) {
    return (
      <div className="rounded-xl border border-cream-300 bg-white p-6 text-center">
        <p role="alert" className="text-sm text-red-700">
          {erroCarga}
        </p>
        <button
          type="button"
          onClick={() => {
            setErroCarga('')
            setTentativa((atual) => atual + 1)
          }}
          className="mt-4 rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium text-noir-700 hover:border-gold-700"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="text-center">
        <h1 className="text-[22px] font-bold text-noir-900">Seu perfil</h1>
        <div
          className="mx-auto mt-3 h-px w-16 bg-gold-700"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm text-noir-500">
          Mantenha seus dados de contato sempre atualizados.
        </p>
      </header>

      <form
        onSubmit={enviar}
        className="space-y-4 rounded-xl border border-cream-300 bg-white p-5"
      >
        <div className="rounded-lg border border-cream-300 bg-cream-50 px-3 py-2">
          <p className="text-[13px] font-medium text-noir-700">
            E-mail de acesso
          </p>
          <p className="mt-0.5 text-sm text-noir-900">{cadastro?.email}</p>
          <p className="mt-1 text-[12px] text-noir-500">
            Para trocar o e-mail, fale com o Studio Audax.
          </p>
        </div>

        <Campo
          id="perfil-nome"
          label="Nome completo"
          tipo="text"
          valor={nome}
          aoMudar={setNome}
          autocomplete="name"
        />
        <Campo
          id="perfil-telefone"
          label="Telefone com DDD"
          tipo="tel"
          valor={telefone}
          aoMudar={setTelefone}
          autocomplete="tel"
          placeholder="(11) 99999-9999"
        />
        <Campo
          id="perfil-nascimento"
          label="Data de nascimento"
          tipo="date"
          valor={nascimento}
          aoMudar={setNascimento}
          obrigatorio={false}
          autocomplete="bday"
        />
        <div>
          <label
            htmlFor="perfil-genero"
            className="block text-[13px] font-medium text-noir-700"
          >
            Gênero
          </label>
          <select
            id="perfil-genero"
            value={genero}
            onChange={(evento) => setGenero(evento.target.value)}
            className="mt-1 w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-noir-900 outline-none focus:border-gold-700"
          >
            {GENEROS.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </div>

        <BotaoPrimario
          processando={processando}
          rotulo="Salvar alterações"
          processandoRotulo="Salvando…"
        />
      </form>

      <AvisoPainel texto={salvo ? 'Dados atualizados com sucesso.' : ''} />
      <ErroPainel texto={erro} />
    </div>
  )
}
