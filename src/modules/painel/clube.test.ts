import { describe, expect, it } from 'vitest'
import type { AssinaturaClube } from '@/modules/clube/types'
import { assinaturaVigente, statusAssinatura } from '@/modules/clube/regras'
import {
  avisoDoStatus,
  beneficioLiberado,
  beneficiosDoPlano,
  normalizarBeneficios,
  rotuloDoPlano,
  statusDoCliente,
  statusParaCliente,
  STATUS_CLIENTE_ROTULO,
  type StatusParaCliente,
} from './clube'

const HOJE = '2026-10-03'

function assinatura(parcial: Partial<AssinaturaClube> = {}): AssinaturaClube {
  return {
    id: 'a1',
    clienteId: 'c1',
    cliente: 'Ana',
    plano: 'cabelo',
    valorMensal: 90,
    dataAssinatura: '2026-09-03',
    // 30 dias de vigência: bem depois de hoje, então VIGENTE.
    proximoVencimento: '2026-11-03',
    cancelada: false,
    criadoEm: '2026-09-03T12:00:00Z',
    atualizadoEm: '2026-09-03T12:00:00Z',
    ...parcial,
  }
}

/** Os quatro estados que o dono pediu para o cliente ler. */
const QUATRO: StatusParaCliente[] = ['ativo', 'em_atraso', 'cancelado', 'expirado']

describe('status do plano visto pelo cliente', () => {
  it('são exatamente quatro palavras, todas com rótulo', () => {
    expect(Object.keys(STATUS_CLIENTE_ROTULO).sort()).toEqual([...QUATRO].sort())
    for (const status of QUATRO) {
      expect(STATUS_CLIENTE_ROTULO[status]).toBeTruthy()
    }
  })

  it('assinatura vigente = ATIVO', () => {
    expect(statusDoCliente(assinatura(), HOJE)).toBe('ativo')
  })

  it('o dia do vencimento ainda é ATIVO (o ciclo pago não acabou)', () => {
    // É a mesma fronteira do backend: o benefício morre DEPOIS do vencimento.
    const hojeVencimento = assinatura({ proximoVencimento: HOJE })
    expect(statusAssinatura(hojeVencimento, HOJE)).toBe('proxima_vencimento')
    expect(statusDoCliente(hojeVencimento, HOJE)).toBe('ativo')
    expect(beneficioLiberado(hojeVencimento, HOJE)).toBe(true)
  })

  it('pagamento pendente = EM ATRASO e NÃO libera benefício', () => {
    const atrasada = assinatura({ proximoVencimento: '2026-10-01' })
    expect(statusDoCliente(atrasada, HOJE)).toBe('em_atraso')
    expect(beneficioLiberado(atrasada, HOJE)).toBe(false)
  })

  it('ciclo pago acabado = EXPIRADO e NÃO libera benefício', () => {
    const expirada = assinatura({ proximoVencimento: '2026-08-01' })
    expect(statusDoCliente(expirada, HOJE)).toBe('expirado')
    expect(beneficioLiberado(expirada, HOJE)).toBe(false)
  })

  it('plano cancelado = CANCELADO e NÃO libera benefício, mesmo antes do vencimento', () => {
    const cancelada = assinatura({ cancelada: true, canceladaEm: '2026-10-01' })
    expect(statusDoCliente(cancelada, HOJE)).toBe('cancelado')
    expect(beneficioLiberado(cancelada, HOJE)).toBe(false)
    // Cancelar vence a data: um plano cancelado hoje não volta a valer amanhã
    // só porque o vencimento ainda não chegou.
    expect(assinaturaVigente(cancelada, HOJE)).toBe(false)
  })

  it('a tradução do status é só apresentação — a regra vem do módulo do Club', () => {
    // Trava o contrato: se `clube/regras` mudar o significado de um status,
    // esta projeção tem de mudar junto, senão a tela mente sobre o atendimento.
    const cenarios: [AssinaturaClube, StatusParaCliente][] = [
      [assinatura(), 'ativo'],
      [assinatura({ proximoVencimento: HOJE }), 'ativo'],
      [assinatura({ proximoVencimento: '2026-10-01' }), 'em_atraso'],
      [assinatura({ proximoVencimento: '2026-08-01' }), 'expirado'],
      [assinatura({ cancelada: true }), 'cancelado'],
    ]
    for (const [caso, esperado] of cenarios) {
      expect(statusParaCliente(statusAssinatura(caso, HOJE))).toBe(esperado)
      // Benefício liberado = EXATAMENTE o que a regra do Club diz.
      expect(beneficioLiberado(caso, HOJE)).toBe(assinaturaVigente(caso, HOJE))
    }
  })

  it('cliente atrasado continua sendo cliente: o aviso não proíbe o avulso', () => {
    // O benefício some; o cadastro e o agendamento continuam. A tela diz isso
    // em vez de sembrar que o cliente perdeu a casa.
    expect(avisoDoStatus('em_atraso')).toMatch(/pagamento pendente/i)
    expect(avisoDoStatus('em_atraso')).toMatch(/marcando horário/i)
    expect(avisoDoStatus('cancelado')).toMatch(/avulsos/i)
    expect(avisoDoStatus('expirado')).toMatch(/não está disponível/i)
    expect(avisoDoStatus('ativo')).toMatch(/ativo/i)
  })
})

describe('benefícios vêm da configuração oficial', () => {
  const CONFIG = {
    coberturas: { cabelo: ['Cabelo'], barba: ['Barba'], cabelo_barba: ['Cabelo', 'Barba'] },
    desconto: { quimicos: 0.1, produtos: 0.1, categorias: ['Quimico'] },
  }

  it('normaliza o JSON do banco', () => {
    const lista = normalizarBeneficios(CONFIG)
    expect(lista.coberturas.cabelo_barba).toEqual(['Cabelo', 'Barba'])
    expect(lista.desconto.quimicos).toBe(0.1)
    expect(lista.desconto.produtos).toBe(0.1)
  })

  it('lixo do banco não vira tela quebrada', () => {
    for (const bruto of [null, undefined, 0, 'texto', [], { coberturas: 7 }]) {
      const lista = normalizarBeneficios(bruto)
      expect(lista.coberturas).toEqual({})
      expect(lista.desconto.quimicos).toBe(0)
      expect(lista.desconto.produtos).toBe(0)
    }
  })

  it('desconto fora de 0..1 é ignorado em vez de virar 400%', () => {
    const lista = normalizarBeneficios({ desconto: { quimicos: 4, produtos: -1 } })
    expect(lista.desconto.quimicos).toBe(0)
    expect(lista.desconto.produtos).toBe(0)
  })

  it('Audax Corte: corte ilimitado + 10% químicos e produtos', () => {
    const lista = normalizarBeneficios(CONFIG)
    expect(beneficiosDoPlano('cabelo', lista)).toEqual([
      'cabelo ilimitado durante a vigência',
      '10% em procedimentos químicos',
      '10% em produtos',
    ])
  })

  it('Audax Barba: barba ilimitada + os mesmos descontos', () => {
    const lista = normalizarBeneficios(CONFIG)
    expect(beneficiosDoPlano('barba', lista)[0]).toBe('barba ilimitado durante a vigência')
  })

  it('Audax Corte + Barba: as duas ilimitadas', () => {
    const lista = normalizarBeneficios(CONFIG)
    expect(beneficiosDoPlano('cabelo_barba', lista)[0]).toBe(
      'cabelo e barba ilimitados durante a vigência',
    )
  })

  it('se a casa mudar a configuração, a lista muda junto', () => {
    // Nada é digitado aqui: o texto vem do config oficial.
    const outra = normalizarBeneficios({
      coberturas: { cabelo: ['Cabelo', 'Sobrancelha'] },
      desconto: { quimicos: 0.15, produtos: 0.05 },
    })
    expect(beneficiosDoPlano('cabelo', outra)).toEqual([
      'cabelo e sobrancelha ilimitados durante a vigência',
      '15% em procedimentos químicos',
      '5% em produtos',
    ])
  })

  it('sem desconto configurado, nenhum desconto é prometido', () => {
    const semDesconto = normalizarBeneficios({
      coberturas: { cabelo: ['Cabelo'] },
      desconto: { quimicos: 0, produtos: 0 },
    })
    expect(beneficiosDoPlano('cabelo', semDesconto)).toEqual([
      'cabelo ilimitado durante a vigência',
    ])
  })

  it('o texto oficial da casa tem prioridade sobre a derivação', () => {
    // A cobertura do plano combinado inclui o serviço combo, e remontar a
    // frase daria "cabelo, barba e cabelo e barba ilimitados". O texto da casa
    // (o mesmo `clube.beneficios` que a IA lê) entra na frente.
    const comTexto = normalizarBeneficios({
      coberturas: {
        cabelo: ['Cabelo'],
        barba: ['Barba'],
        cabelo_barba: ['Cabelo', 'Barba', 'Cabelo e barba'],
      },
      desconto: { quimicos: 0.1, produtos: 0.1 },
      textos: {
        cabelo_barba: [
          'Corte ilimitado durante a vigência',
          'Barba ilimitada durante a vigência',
          '10% em procedimentos químicos',
          '10% em produtos',
        ],
      },
    })
    expect(beneficiosDoPlano('cabelo_barba', comTexto)).toEqual([
      'Corte ilimitado durante a vigência',
      'Barba ilimitada durante a vigência',
      '10% em procedimentos químicos',
      '10% em produtos',
    ])
    // Plano sem texto oficial continua derivando do config.
    expect(beneficiosDoPlano('barba', comTexto)).toEqual([
      'barba ilimitado durante a vigência',
      '10% em procedimentos químicos',
      '10% em produtos',
    ])
  })

  it('o texto oficial também normaliza lixo', () => {
    const ruim = normalizarBeneficios({ textos: { cabelo: 'não é lista', barba: [1, 'Barba'] } })
    expect(ruim.textos.cabelo).toBeUndefined()
    expect(ruim.textos.barba).toEqual(['Barba'])
    // Texto válido passa; e sem cobertura/desconto configurados a lista fica
    // VAZIA de propósito — a tela mostra "fal com a equipe" em vez de chutar
    // uma cobertura que o servidor não vai aplicar.
    expect(beneficiosDoPlano('barba', ruim)).toEqual(['Barba'])
    expect(beneficiosDoPlano('cabelo', ruim)).toEqual([])
  })

  it('o rótulo do plano é o da casa quando existe, senão o do módulo', () => {
    const daCasa = normalizarBeneficios({ rotulos: { cabelo: 'Audax Corte Mensal' } })
    expect(rotuloDoPlano('cabelo', daCasa)).toBe('Audax Corte Mensal')
    expect(rotuloDoPlano('cabelo', null)).toBe('Audax Corte')
    expect(rotuloDoPlano('barba', null)).toBe('Audax Barba')
    expect(rotuloDoPlano('cabelo_barba', null)).toBe('Audax Corte + Barba')
    // Plano fora do conjunto: rótulo honesto, sem inventar nome.
    expect(rotuloDoPlano('desconhecido', null)).toBe('Audax Club')
  })
})
