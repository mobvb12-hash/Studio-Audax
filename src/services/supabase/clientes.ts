// Acesso ao Supabase — clientes (única camada que fala com a tabela
// `public.clientes`). Sem regra de negócio da UI aqui: só leitura/escrita.
//
// Ausência de Supabase (VITE_SUPABASE_URL / ANON_KEY vazias) segue o padrão
// dos módulos já migrados: leituras devolvem [] e escritas devolvem null/false
// — o app permanece 100% local. Falha de rede/consulta NÃO é silenciosa em
// `listarClientes` (lança), porque a migração precisa distinguir "banco vazio"
// de "não consegui ler" para nunca sobrescrever dado remoto mais novo.
import { supabase } from '@/lib/supabase'
import { normalizarCliente } from '@/modules/clientes/regras'
import type {
  Cliente,
  ClienteGenero,
  EnderecoCliente,
  TelefoneCliente,
} from '@/modules/clientes/types'

const GENEROS: ClienteGenero[] = [
  'nao_informado',
  'masculino',
  'feminino',
  'outro',
]


type ClienteRow = {
  id: string
  nome: string
  telefone?: string | null
  email?: string | null
  observacao?: string | null
  ativo?: boolean | null
  genero?: string | null
  cpf?: string | null
  cnpj?: string | null
  nascimento?: string | null
  etiquetas?: unknown
  instagram?: string | null
  como_nos_conheceu?: unknown
  telefones?: unknown
  endereco?: unknown
  preferencias?: unknown
  criado_em?: string | null
  atualizado_em?: string | null
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

function paraTelefones(valor: unknown): TelefoneCliente[] {
  if (!Array.isArray(valor)) return []
  return valor
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      tipo: (texto(item.tipo) || 'celular') as TelefoneCliente['tipo'],
      numero: texto(item.numero),
    }))
    .filter((t) => t.numero)
}

function paraEndereco(valor: unknown): EnderecoCliente | null {
  if (!valor || typeof valor !== 'object') return null
  const bruto = valor as Record<string, unknown>
  return {
    cep: texto(bruto.cep),
    logradouro: texto(bruto.logradouro),
    numero: texto(bruto.numero),
    complemento: texto(bruto.complemento),
    bairro: texto(bruto.bairro),
    cidade: texto(bruto.cidade),
    uf: texto(bruto.uf),
  }
}

function paraCliente(row: ClienteRow): Cliente {
  const genero = texto(row.genero)
  return normalizarCliente({
    id: texto(row.id),
    nome: texto(row.nome),
    telefone: texto(row.telefone),
    email: texto(row.email),
    observacao: texto(row.observacao),
    ativo: typeof row.ativo === 'boolean' ? row.ativo : undefined,
    genero: GENEROS.includes(genero as ClienteGenero)
      ? (genero as ClienteGenero)
      : undefined,
    cpf: texto(row.cpf),
    cnpj: texto(row.cnpj),
    nascimento: texto(row.nascimento),
    etiquetas: Array.isArray(row.etiquetas)
      ? row.etiquetas.filter((e): e is string => typeof e === 'string')
      : [],
    instagram: texto(row.instagram),
    comoNosConheceu: texto(row.como_nos_conheceu),
    telefones: paraTelefones(row.telefones),
    endereco: paraEndereco(row.endereco),
    preferencias:
      row.preferencias && typeof row.preferencias === 'object'
        ? (row.preferencias as Cliente['preferencias'])
        : undefined,
    criadoEm: texto(row.criado_em) || undefined,
    atualizadoEm: texto(row.atualizado_em) || undefined,
  })
}

function paraLinha(cliente: Cliente) {
  return {
    id: cliente.id,
    nome: cliente.nome,
    telefone: cliente.telefone,
    email: cliente.email,
    observacao: cliente.observacao,
    ativo: cliente.ativo,
    genero: cliente.genero,
    cpf: cliente.cpf,
    cnpj: cliente.cnpj,
    nascimento: cliente.nascimento,
    etiquetas: cliente.etiquetas,
    instagram: cliente.instagram,
    como_nos_conheceu: cliente.comoNosConheceu,
    telefones: cliente.telefones,
    endereco: cliente.endereco,
    preferencias: cliente.preferencias,
    criado_em: cliente.criadoEm,
    atualizado_em: cliente.atualizadoEm,
  }
}

/** Todos os clientes, em ordem de nome. Lança quando a consulta falha. */
export async function listarClientes(): Promise<Cliente[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('clientes')
    .select('*')
    .order('nome', { ascending: true })
  if (error || !data) {
    throw new Error(error?.message ?? 'Falha ao ler clientes no Supabase.')
  }
  return data.map(paraCliente)
}

/**
 * Busca server-side por nome, e-mail ou telefone. Mantida na camada de
 * repositório (consulta), mas a UI continua filtrando a lista local com
 * `filtrarClientes` — a busca remota existe para chamadas pontuais.
 */
export async function buscarClientes(termo: string): Promise<Cliente[]> {
  const cliente = supabase()
  if (!cliente) return []
  const chave = termo.trim()
  if (!chave) return listarClientes()
  const { data, error } = await cliente
    .from('clientes')
    .select('*')
    .or(`nome.ilike.%${chave}%,email.ilike.%${chave}%,telefone.ilike.%${chave}%`)
    .order('nome', { ascending: true })
  if (error || !data) {
    throw new Error(error?.message ?? 'Falha ao buscar clientes no Supabase.')
  }
  return data.map(paraCliente)
}

/** Insere um cliente com o id já gerado (ids existentes são preservados). */
export async function criarCliente(
  entrada: Cliente,
): Promise<Cliente | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('clientes')
    .insert(paraLinha(entrada))
    .select()
    .maybeSingle()
  if (error || !data) return null
  return paraCliente(data as ClienteRow)
}

/** Sobrescreve um cliente existente pelo id. */
export async function atualizarCliente(
  id: string,
  entrada: Cliente,
): Promise<Cliente | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('clientes')
    .update(paraLinha(entrada))
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error || !data) return null
  return paraCliente(data as ClienteRow)
}

/** Inativa/reativa sem apagar nada: histórico e vínculos permanecem. */
export async function alternarAtivoCliente(
  id: string,
  ativo: boolean,
): Promise<Cliente | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('clientes')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error || !data) return null
  return paraCliente(data as ClienteRow)
}

export async function removerCliente(id: string): Promise<boolean> {
  const cliente = supabase()
  if (!cliente) return false
  const { error } = await cliente.from('clientes').delete().eq('id', id)
  return !error
}

/**
 * Importação/migração: upsert por `id` (nada é recriado com outro id).
 * Devolve quantas linhas foram efetivamente enviadas; 0 = indisponível ou
 * falha — quem chama compara com o esperado para sinalizar o erro.
 */
export async function importarClientes(lista: Cliente[]): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('clientes')
    .upsert(lista.map(paraLinha), { onConflict: 'id' })
  return error ? 0 : lista.length
}
