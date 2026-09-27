// Migração localStorage → Supabase do módulo Clientes.
//
// Ordem garantida: leitura local → validação → backup (snapshot) → upsert
// preservando ids → comparação do que ficou no remoto → relatório.
//
// Regras:
// • nada local é apagado nem sobrescrito (a chave original continua intacta);
// • id é a identidade: o upsert usa o mesmo id do cadastro local;
// • em conflito vence o registro mais recente (`atualizadoEm`), o outro fica
//   preservado no backup;
// • falha de leitura/escrita interrompe a migração sem tocar em dado algum.
import { carregarJSON } from '@/lib/persistencia'
import { importarClientes, listarClientes } from '@/services/supabase/clientes'
import { normalizarCliente, ordenarClientes } from './regras'
import { digitosDosTelefones, type Cliente } from './types'

export const CHAVE_STORAGE_CLIENTES = 'studio-audax:clientes:v1'

export type RelatorioMigracaoClientes = {
  /** ISO do início e do fim da migração */
  inicio: string
  fim: string
  /** false quando algo não foi enviado/confirmado (dado local preservado) */
  ok: boolean
  /** registros lidos do localStorage */
  encontrados: number
  inseridos: number
  atualizados: number
  /** não enviados: inválidos, id repetido, idênticos ou superados pelo remoto */
  ignorados: number
  erros: string[]
  /** avisos de repetição local (id repetido é recusado; nome/telefone segue) */
  duplicidades: string[]
  /** clienteId citado em outro módulo sem correspondência no cadastro */
  referenciasProblematicas: string[]
  /** lista final considerada oficial (remoto + pendências locais válidas) */
  clientes: Cliente[]
}

let ultimoRelatorio: RelatorioMigracaoClientes | null = null

/** Relatório da última migração executada nesta sessão (testes/diagnóstico). */
export function ultimoRelatorioMigracao(): RelatorioMigracaoClientes | null {
  return ultimoRelatorio
}

/** Ids do conteúdo (sem timestamps) — diferença de horário não é conflito. */
function assinaturaConteudo(c: Cliente): string {
  return JSON.stringify([
    c.id,
    c.nome,
    c.telefone,
    c.email,
    c.observacao,
    c.ativo,
    c.genero,
    c.cpf,
    c.cnpj,
    c.nascimento,
    c.etiquetas,
    c.instagram,
    c.comoNosConheceu,
    c.telefones,
    c.endereco,
    c.preferencias,
  ])
}

type ValidacaoLocal = {
  validos: Cliente[]
  invalidos: number
  duplicidades: string[]
}

/**
 * Valida e conferencia o que existe localamente. Id repetido não pode ser
 * migrado (mesma chave); nome/telefone repetido é apenas reportado — são
 * registros distintos que já convivem no cadastro e continuarão visíveis.
 */
function validarLocais(locais: Cliente[]): ValidacaoLocal {
  const ids = new Set<string>()
  const nomes = new Set<string>()
  const telefones = new Set<string>()
  const validos: Cliente[] = []
  const duplicidades: string[] = []
  let invalidos = 0

  for (const bruto of locais) {
    const cliente = normalizarCliente(bruto)
    if (!cliente.id || !cliente.nome.trim()) {
      invalidos += 1
      continue
    }
    if (ids.has(cliente.id)) {
      duplicidades.push(`id repetido: ${cliente.id} (${cliente.nome})`)
      continue
    }
    ids.add(cliente.id)

    const nome = cliente.nome.trim().toLowerCase()
    if (nomes.has(nome)) {
      duplicidades.push(`nome repetido: ${cliente.nome}`)
    }
    nomes.add(nome)

    const digitos = digitosDosTelefones(cliente.telefone, cliente.telefones)
    if (digitos.some((d) => telefones.has(d))) {
      duplicidades.push(`telefone repetido: ${digitos[0]} (${cliente.nome})`)
    }
    digitos.forEach((d) => telefones.add(d))
    validos.push(cliente)
  }

  return { validos, invalidos, duplicidades }
}

/** Chave de citação em outros módulos: `clienteId`. */
const CHAVES_REFERENCIAS: { chave: string; rotulo: string }[] = [
  { chave: 'studio-audax:crm:v1', rotulo: 'CRM' },
  { chave: 'studio-audax:whatsapp:v1', rotulo: 'WhatsApp' },
  { chave: 'studio-audax:clube:v1', rotulo: 'Clube' },
  { chave: 'studio-audax:caixa:lancamentos:v1', rotulo: 'Caixa' },
]

/**
 * `clienteId` citado em outros módulos que não existe no cadastro. Só lê
 * (nunca escreve) e não impede a migração: é um apontamento para a etapa
 * correspondente.
 */
function referenciasProblematicas(conhecidos: Set<string>): string[] {
  const problemas: string[] = []
  for (const { chave, rotulo } of CHAVES_REFERENCIAS) {
    const bruto = carregarJSON<unknown>(chave, null, Array.isArray)
    if (!Array.isArray(bruto)) continue
    for (const item of bruto) {
      if (!item || typeof item !== 'object') continue
      const id = (item as Record<string, unknown>).clienteId
      if (typeof id !== 'string' || !id) continue
      if (!conhecidos.has(id)) {
        problemas.push(`${rotulo}: clienteId "${id}" sem cadastro`)
      }
    }
  }
  return problemas
}

function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Snapshot dos dados locais antes de qualquer escrita. null = não gravou. */
function criarBackup(locais: Cliente[]): string | null {
  const chave = `${CHAVE_STORAGE_CLIENTES}:backup:${carimbo()}`
  try {
    localStorage.setItem(chave, JSON.stringify(locais))
    return localStorage.getItem(chave) === null ? null : chave
  } catch {
    return null
  }
}

function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

/**
 * Executa a migração completa dos dados locais para o Supabase.
 * Nunca lança: qualquer falha vira item do relatório e a lista local é
 * devolvida intacta.
 */
export async function migrarClientes(
  locais: Cliente[],
): Promise<RelatorioMigracaoClientes> {
  const inicio = new Date().toISOString()
  const { validos, invalidos, duplicidades } = validarLocais(locais)
  const relatorio: RelatorioMigracaoClientes = {
    inicio,
    fim: inicio,
    ok: true,
    encontrados: locais.length,
    inseridos: 0,
    atualizados: 0,
    ignorados: 0,
    erros: [],
    duplicidades,
    referenciasProblematicas: [],
    clientes: ordenarClientes(validos),
  }

  let remotos: Cliente[]
  try {
    remotos = await listarClientes()
  } catch (erro) {
    relatorio.ok = false
    relatorio.erros.push(`Falha ao ler clientes no Supabase: ${mensagemDeErro(erro)}`)
    relatorio.ignorados = relatorio.encontrados
    relatorio.referenciasProblematicas = referenciasProblematicas(
      new Set(validos.map((c) => c.id)),
    )
    relatorio.fim = new Date().toISOString()
    ultimoRelatorio = relatorio
    return relatorio
  }

  const remotoPorId = new Map(remotos.map((c) => [c.id, c]))
  const pendencias = new Map<string, Cliente>()
  for (const local of validos) {
    const remoto = remotoPorId.get(local.id)
    if (!remoto) {
      pendencias.set(local.id, local)
      continue
    }
    if (assinaturaConteudo(local) === assinaturaConteudo(remoto)) continue
    if ((local.atualizadoEm || '') > (remoto.atualizadoEm || '')) {
      pendencias.set(local.id, local)
    }
    // remoto mais recente: mantém a versão oficial, a local fica no backup
  }

  const aEnviar = [...pendencias.values()]
  const superados = validos.filter(
    (local) =>
      remotoPorId.has(local.id) &&
      !pendencias.has(local.id) &&
      assinaturaConteudo(local) !==
        assinaturaConteudo(remotoPorId.get(local.id)!),
  ).length
  const novos = aEnviar.filter((c) => !remotoPorId.has(c.id)).length
  const alterados = aEnviar.length - novos
  let enviado = true

  // Snapshot obrigatório antes de qualquer mudança visível: envio de
  // pendência ou substituição por versão remota mais nova.
  if (aEnviar.length > 0 || superados > 0) {
    const backup = criarBackup(locais)
    if (!backup) {
      // sem snapshot nada é aplicado — a migração tenta de novo depois
      relatorio.ok = false
      relatorio.erros.push(
        'Não foi possível criar o snapshot local; migração adiada sem alterar nada.',
      )
      relatorio.ignorados = relatorio.encontrados
      relatorio.referenciasProblematicas = referenciasProblematicas(
        new Set(validos.map((c) => c.id)),
      )
      relatorio.fim = new Date().toISOString()
      ultimoRelatorio = relatorio
      return relatorio
    }
  }

  if (aEnviar.length > 0) {
    try {
      const enviados = await importarClientes(aEnviar)
      if (enviados < aEnviar.length) {
        enviado = false
        relatorio.erros.push(
          `Envio incompleto: ${enviados} de ${aEnviar.length} registros.`,
        )
      }
    } catch (erro) {
      enviado = false
      relatorio.erros.push(
        `Falha ao enviar clientes para o Supabase: ${mensagemDeErro(erro)}`,
      )
    }
    if (enviado) {
      // comparação: o enviado precisa estar confirmado no remoto
      try {
        const confirmados = await listarClientes()
        const idsConfirmados = new Set(confirmados.map((c) => c.id))
        const faltando = aEnviar.filter((c) => !idsConfirmados.has(c.id))
        if (faltando.length > 0) {
          enviado = false
          relatorio.erros.push(
            `Não confirmado no Supabase após a migração: ${faltando
              .map((c) => c.id)
              .join(', ')}`,
          )
        }
      } catch (erro) {
        enviado = false
        relatorio.erros.push(
          `Falha ao confirmar a migração: ${mensagemDeErro(erro)}`,
        )
      }
    }
  }

  // lista final: remoto oficial + tudo que era pendência local (nada some)
  const finalPorId = new Map(remotos.map((c) => [c.id, c]))
  pendencias.forEach((cliente, id) => finalPorId.set(id, cliente))
  relatorio.clientes = ordenarClientes([...finalPorId.values()])
  relatorio.inseridos = enviado ? novos : 0
  relatorio.atualizados = enviado ? alterados : 0
  relatorio.ignorados = Math.max(
    0,
    relatorio.encontrados - relatorio.inseridos - relatorio.atualizados,
  )
  relatorio.referenciasProblematicas = referenciasProblematicas(
    new Set(relatorio.clientes.map((c) => c.id)),
  )
  if (invalidos > 0) {
    relatorio.erros.push(
      `${invalidos} registro(s) local(is) inválido(s) ignorado(s).`,
    )
  }
  relatorio.ok = relatorio.erros.length === 0
  relatorio.fim = new Date().toISOString()
  ultimoRelatorio = relatorio
  return relatorio
}
