// Regressão do falso positivo de "dado local corrompido" no Clube.
//
// A chave `studio-audax:clube:v1` guarda um ESTADO
// (`{assinaturas, pagamentos}`), não uma lista solta. A migração de clientes,
// ao varrer as chaves que podem citar `clienteId`, validava TODAS com
// `Array.isArray` — inclusive a do Clube. O estado vazio legítimo
// `{"assinaturas":[],"pagamentos":[]}` era rejeitado, o que fazia o
// `carregarJSON` chamar `preservarCorrompido` e emitir o aviso — em TODA
// migração, para sempre (o backup já existente nunca é sobrescrito, então o
// conteúdo preserved continuava sendo o mesmo e parecia que nada mudava).
//
// Este arquivo trava os dois lados:
//   - o estado vazio do Clube NÃO gera falso positivo nem backup;
//   - corrupção real (JSON quebrado ou forma inválida) CONTINUA sendo
//     detectada, com backup em `<chave>:corrompido` e aviso visível.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import * as repositorio from '@/services/supabase/clientes'
import { migrarClientes } from './migracao'
import type { Cliente } from './types'

const CHAVE_CLUBE = 'studio-audax:clube:v1'
const BACKUP_CLUBE = `${CHAVE_CLUBE}:corrompido`
const CHAVE_CRM = 'studio-audax:crm:v1'
const BACKUP_CRM = `${CHAVE_CRM}:corrompido`
const CHAVE_CAIXA = 'studio-audax:caixa:lancamentos:v1'
const BACKUP_CAIXA = `${CHAVE_CAIXA}:corrompido`

vi.mock('@/services/supabase/clientes', () => ({
  listarClientes: vi.fn(async () => []),
  criarClientes: vi.fn(async () => true),
  removerClientes: vi.fn(async () => 0),
}))

function clienteLocal(id: string): Cliente {
  return {
    id,
    nome: `Cliente ${id}`,
    telefone: '(11) 90000-0000',
    email: `${id}@email.com`,
    observacao: '',
    ativo: true,
    genero: 'nao_informado',
    cpf: '',
    cnpj: '',
    nascimento: '',
    etiquetas: [],
    instagram: '',
    comoNosConheceu: '',
    telefones: [],
    endereco: null,
    preferencias: {
      emailAgendamentos: true,
      smsLembrete: true,
      smsMarketing: true,
      emailMarketing: true,
    },
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
  }
}

/** Roda a migração e devolve o relatório, que lista as referências problemáticas. */
async function migrar(): Promise<{ referenciasProblematicas: string[] }> {
  return migrarClientes([clienteLocal('cl-1')])
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('studio-audax:clientes:v1', JSON.stringify([clienteLocal('cl-1')]))
  limparAvisosPersistencia()
  vi.mocked(repositorio.listarClientes).mockResolvedValue([])
})

describe('migração de clientes — varredura de referências por clienteId', () => {
  it('estado vazio do Clube NÃO é marcado como corrompido', async () => {
    localStorage.setItem(CHAVE_CLUBE, '{"assinaturas":[],"pagamentos":[]}')

    await migrar()

    expect(localStorage.getItem(BACKUP_CLUBE)).toBeNull()
  })

  it('estado do Clube só com assinaturas NÃO é marcado como corrompido', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [{ id: 'as-1', clienteId: 'cl-1' }],
        pagamentos: [],
      }),
    )

    const relatorio = await migrar()

    expect(localStorage.getItem(BACKUP_CLUBE)).toBeNull()
    // a referência continua sendo lida de verdade
    expect(relatorio.referenciasProblematicas).toEqual([])
  })

  it('assinatura com clienteId inexistente AINDA é apontada (a varredura funciona)', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [{ id: 'as-1', clienteId: 'cl-fantasma' }],
        pagamentos: [],
      }),
    )

    const relatorio = await migrar()

    expect(relatorio.referenciasProblematicas.some((p) => p.includes('cl-fantasma'))).toBe(
      true,
    )
    expect(localStorage.getItem(BACKUP_CLUBE)).toBeNull()
  })

  it('estado do Clube só com pagamentos NÃO é marcado como corrompido', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [],
        pagamentos: [{ id: 'pg-1', assinaturaId: 'as-1' }],
      }),
    )

    await migrar()

    expect(localStorage.getItem(BACKUP_CLUBE)).toBeNull()
  })

  it('legado :corrompido do Clube existente não dispara aviso novo', async () => {
    // cenário real do navegador: o backup histórico já está no localStorage
    localStorage.setItem(CHAVE_CLUBE, '{"assinaturas":[],"pagamentos":[]}')
    localStorage.setItem(BACKUP_CLUBE, '{"assinaturas":[],"pagamentos":[]}')

    await migrar()

    // nenhum aviso de dado corrompido é emitido por causa do Clube
    expect(
      avisosPersistencia().filter(
        (a) => a.tipo === 'dado_corrompido' && a.chave === CHAVE_CLUBE,
      ),
    ).toEqual([])
    // e o backup legado segue intacto, sem sobrescrita
    expect(localStorage.getItem(BACKUP_CLUBE)).toBe('{"assinaturas":[],"pagamentos":[]}')
  })
})

describe('migração de clientes — corrupção real continua sendo detectada', () => {
  it('JSON quebrado no Clube ainda gera backup e aviso', async () => {
    localStorage.setItem(CHAVE_CLUBE, '{quebrado')

    await migrar()

    expect(localStorage.getItem(BACKUP_CLUBE)).toBe('{quebrado')
    expect(
      avisosPersistencia().some(
        (a) => a.tipo === 'dado_corrompido' && a.chave === CHAVE_CLUBE,
      ),
    ).toBe(true)
  })

  it('lista do Clube com a forma errada ainda gera backup e aviso', async () => {
    const invalido = '{"assinaturas":"nao-e-array","pagamentos":[]}'
    localStorage.setItem(CHAVE_CLUBE, invalido)

    await migrar()

    expect(localStorage.getItem(BACKUP_CLUBE)).toBe(invalido)
    expect(
      avisosPersistencia().some(
        (a) => a.tipo === 'dado_corrompido' && a.chave === CHAVE_CLUBE,
      ),
    ).toBe(true)
  })

  it('Clube gravado como array (forma que o Clube nunca usa) ainda é detectado', async () => {
    localStorage.setItem(CHAVE_CLUBE, '[{"id":"as-1"}]')

    await migrar()

    expect(localStorage.getItem(BACKUP_CLUBE)).toBe('[{"id":"as-1"}]')
  })

  it('corrupção nas chaves de lista segue sendo detectada (não regredi)', async () => {
    localStorage.setItem(CHAVE_CRM, '{quebrado')
    localStorage.setItem(CHAVE_CAIXA, '"nao-e-lista"')

    await migrar()

    expect(localStorage.getItem(BACKUP_CRM)).toBe('{quebrado')
    expect(localStorage.getItem(BACKUP_CAIXA)).toBe('"nao-e-lista"')
  })
})
