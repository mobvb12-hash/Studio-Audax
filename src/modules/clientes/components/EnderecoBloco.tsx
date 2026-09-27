import type { Dispatch, SetStateAction } from 'react'
import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import type { EnderecoCliente } from '@/modules/clientes/types'

export default function EnderecoBloco({
  endereco,
  aoMudar,
}: {
  endereco: EnderecoCliente
  aoMudar: Dispatch<SetStateAction<EnderecoCliente>>
}) {
  return (
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
          onChange={(e) => aoMudar((a) => ({ ...a, cep: e.target.value }))}
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
          onChange={(e) => aoMudar((a) => ({ ...a, numero: e.target.value }))}
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
            aoMudar((a) => ({ ...a, logradouro: e.target.value }))
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
            aoMudar((a) => ({ ...a, complemento: e.target.value }))
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
          onChange={(e) => aoMudar((a) => ({ ...a, bairro: e.target.value }))}
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
          onChange={(e) => aoMudar((a) => ({ ...a, cidade: e.target.value }))}
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
            aoMudar((a) => ({
              ...a,
              uf: e.target.value.toUpperCase().slice(0, 2),
            }))
          }
        />
      </div>
    </>
  )
}
