import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_VAZIO } from '@/modules/agendamento/estado'
import {
  areaPelaUrl,
  CAMINHO_AGENDAR,
  CAMINHO_CLIENTE,
  ehRotaPainel,
  ehRotaPublica,
  irParaAgendamentoOficial,
  irParaAreaDoCliente,
  lerPreenchimento,
  lerRetomadaAgendamento,
  limparPreenchimento,
  limparRetomadaAgendamento,
  navegarPainel,
  nascimentoValido,
  rotaPainelAtual,
  salvarRetomadaAgendamento,
  temRetomadaAgendamento,
  urlAgendamentoOficial,
  urlAreaDoCliente,
} from './regras'

/**
 * As DUAS URLs públicas são o produto que se divulga em Instagram, WhatsApp,
 * status e QR Code. Estes testes travam três coisas:
 *
 *   1. cada URL oficial abre a área certa;
 *   2. as duas áreas são independentes — trocar de uma para a outra nunca leva
 *      de volta para a anterior (não existe ciclo);
 *   3. `/agendar` e `/cliente` NUNCA abrem o app interno (que exige login
 *      profissional).
 */

function ficaEm(url: string): void {
  window.history.replaceState(null, '', url)
}

// A URL oficial é sempre `origem + caminho`; o caminho é o que se divulga.
const origem = () => window.location.origin

describe('rotas públicas oficiais', () => {
  beforeEach(() => {
    ficaEm('/')
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('os caminhos oficiais são os que o dono divulga', () => {
    expect(CAMINHO_AGENDAR).toBe('/agendar')
    expect(CAMINHO_CLIENTE).toBe('/cliente')
    expect(urlAgendamentoOficial()).toBe(`${origem()}/agendar`)
    expect(urlAreaDoCliente()).toBe(`${origem()}/cliente`)
  })

  it('/agendar abre o agendamento público, sem login e sem dashboard', () => {
    ficaEm('/agendar')
    expect(ehRotaPublica()).toBe(true)
    expect(ehRotaPainel()).toBe(false)
    expect(areaPelaUrl()).toBe('agendar')
  })

  it('/cliente abre a Área do Cliente, sem o app interno', () => {
    ficaEm('/cliente')
    expect(ehRotaPainel()).toBe(true)
    expect(ehRotaPublica()).toBe(false)
    expect(areaPelaUrl()).toBe('cliente')
  })

  it('a raiz abre o app interno (que exige login profissional)', () => {
    ficaEm('/')
    expect(areaPelaUrl()).toBe('app')
  })

  it('uma página que não é das áreas públicas NÃO vira área de cliente', () => {
    // A segurança do app interno é o portão de sessão do App.tsx; o roteador
    // não pode transformar um caminho qualquer em painel do cliente.
    for (const caminho of ['/admin', '/clientes', '/caixa', '/comissoes', '/pote']) {
      ficaEm(caminho)
      expect(areaPelaUrl(), caminho).toBe('app')
    }
  })

  it('o nome antigo /painel continua abrindo a Área do Cliente', () => {
    ficaEm('/painel')
    expect(ehRotaPainel()).toBe(true)
  })

  it('o hash legado continua valendo', () => {
    ficaEm('/#/agendar')
    expect(ehRotaPublica()).toBe(true)
    ficaEm('/#/painel')
    expect(ehRotaPainel()).toBe(true)
  })

  it('trailing slash não muda a área', () => {
    ficaEm('/agendar/')
    expect(ehRotaPublica()).toBe(true)
    ficaEm('/cliente/')
    expect(ehRotaPainel()).toBe(true)
  })
})

describe('a troca entre as áreas não cria ciclo', () => {
  beforeEach(() => {
    ficaEm('/')
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('de /agendar, "já sou cliente" vai para /cliente (não para /agendar de novo)', () => {
    ficaEm('/agendar')
    const assign = vi.fn()
    // jsdom não navega de verdade: substituímos e conferimos o destino.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/agendar', hash: '', assign },
    })

    irParaAreaDoCliente()

    expect(assign).toHaveBeenCalledWith(`${origem()}/cliente`)
  })

  it('de /agendar, "ver meus agendamentos" leva à aba certa, mantendo /cliente', () => {
    ficaEm('/agendar')
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/agendar', hash: '', assign },
    })

    irParaAreaDoCliente('agendamentos')

    expect(assign).toHaveBeenCalledWith(`${origem()}/cliente#/painel/agendamentos`)
  })

  it('de /cliente, agendar leva para /agendar (e não para o painel de novo)', () => {
    ficaEm('/cliente')
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/cliente', hash: '', assign },
    })

    irParaAgendamentoOficial({ nome: 'Ana', telefone: '11999999999' })

    expect(assign).toHaveBeenCalledWith(`${origem()}/agendar`)
  })

  it('de /cliente, "ver meus agendamentos" navega dentro da área (sem sair dela)', () => {
    ficaEm('/cliente')
    // Sem `assign`: se o código tentasse trocar de URL, o teste falharia.
    irParaAreaDoCliente('agendamentos')
    expect(rotaPainelAtual()).toBe('agendamentos')
  })

  it('dentro de /cliente a URL oficial sobrevive à navegação entre abas', () => {
    ficaEm('/cliente')
    navegarPainel('clube')
    expect(window.location.pathname).toBe('/cliente')
    expect(rotaPainelAtual()).toBe('clube')
    navegarPainel('')
    expect(window.location.pathname).toBe('/cliente')
    expect(rotaPainelAtual()).toBe('inicio')
  })
})

describe('o hash manda no pathname (/agendar não sequestra o painel)', () => {
  beforeEach(() => {
    ficaEm('/')
    vi.restoreAllMocks()
  })

  it('/agendar#/painel abre a Área do Cliente, não a Agenda', () => {
    // Sem a precedência do hash, o pathname /agendar venceria e o cliente
    // que pulou do agendamento para a área veria a Agenda de novo.
    ficaEm('/agendar#/painel')
    expect(ehRotaPainel()).toBe(true)
    expect(ehRotaPublica()).toBe(false)
  })

  it('/cliente#/painel/clube abre a área do cliente na aba do Clube', () => {
    ficaEm('/cliente')
    // O hash é escrito pelo próprio navegador (é assim que `navegarPainel`
    // funciona): `replaceState` não propaga o fragmento para `location.hash`.
    window.location.hash = '#/painel/clube'
    expect(areaPelaUrl()).toBe('cliente')
    expect(rotaPainelAtual()).toBe('clube')
  })
})

describe('identidade que viaja do painel para o agendamento', () => {
  beforeEach(() => {
    ficaEm('/')
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('o nome e o telefone NÃO vão na URL', () => {
    // Vazam em print, histórico e link compartilhado: vão por sessionStorage.
    ficaEm('/cliente')
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/cliente', hash: '', assign },
    })

    irParaAgendamentoOficial({ nome: 'Ana Souza', telefone: '11988887777' })

    const destino = String(assign.mock.calls[0][0])
    expect(destino).toBe(`${origem()}/agendar`)
    expect(destino).not.toContain('Ana')
    expect(destino).not.toContain('11988887777')
  })

  it('o preenchimento é lido uma vez e some depois', () => {
    ficaEm('/cliente')
    irParaAgendamentoOficial({ nome: 'Ana Souza', telefone: '11988887777' })

    expect(lerPreenchimento()).toEqual({ nome: 'Ana Souza', telefone: '11988887777' })
    limparPreenchimento()
    expect(lerPreenchimento()).toBeNull()
  })

  it('sessionStorage indisponível não quebra a navegação', () => {
    ficaEm('/cliente')
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/cliente', hash: '', assign },
    })
    const erro = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sem storage')
    })

    expect(() =>
      irParaAgendamentoOficial({ nome: 'Ana', telefone: '119' }),
    ).not.toThrow()
    expect(assign).toHaveBeenCalledWith(`${origem()}/agendar`)
    erro.mockRestore()
  })
})

/**
 * O rascunho do agendamento: a ponte entre o fluxo público e a Área do
 * Cliente.
 *
 * Sem sessão a pessoa não reserva — mas as escolhas feitas até então não podem
 * se perder, ou ela recomeça do zero depois de criar a conta. Este rascunho é
 * o que faz a frase "você continua de onde parou" ser verdade.
 *
 * Duas coisas aqui precisam ser confiáveis: ele só restaura o que dá para
 * restaurar (um rascunho incompleto jogaria a pessoa numa etapa sem nada
 * escolhido), e ele nunca derruba a tela quando o `sessionStorage` está fora
 * do ar.
 */
describe('o rascunho do agendamento (retomada)', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  /** Uma escolha que chegou até o horário — o mínimo para valer a pena. */
  function escolhaCompleta() {
    return {
      ...ESTADO_VAZIO,
      servicoNome: 'Corte Audax',
      profissional: 'Cleiton Silva',
      data: '2026-10-10',
      horario: '08:00',
      complementoIds: ['srv-barba'],
    }
  }

  it('guarda a escolha e a devolve igual', () => {
    expect(lerRetomadaAgendamento()).toBeNull()

    salvarRetomadaAgendamento(escolhaCompleta())

    expect(temRetomadaAgendamento()).toBe(true)
    expect(lerRetomadaAgendamento()).toEqual(escolhaCompleta())
  })

  it('apagar duas vezes não explode', () => {
    salvarRetomadaAgendamento(escolhaCompleta())
    limparRetomadaAgendamento()
    limparRetomadaAgendamento()
    expect(lerRetomadaAgendamento()).toBeNull()
    expect(temRetomadaAgendamento()).toBe(false)
  })

  it('rascunho incompleto não restaura — seria cair na etapa vazia', () => {
    // Escrito à mão ou por uma versão antiga do fluxo: sem horário não há o
    // que continuar, e restaurar jogaria a pessoa nos extras sem nada.
    window.sessionStorage.setItem(
      'studio-audax:agendar:retomada',
      JSON.stringify({
        estado: { servicoNome: 'Corte Audax' },
        salvoEm: Date.now(),
      }),
    )

    expect(lerRetomadaAgendamento()).toBeNull()
    // E a tentativa é descartada: não fica esperando para atrapalhar depois.
    expect(window.sessionStorage.getItem('studio-audax:agendar:retomada')).toBeNull()
  })

  it('rascunho velho não restaura', () => {
    window.sessionStorage.setItem(
      'studio-audax:agendar:retomada',
      JSON.stringify({
        estado: escolhaCompleta(),
        salvoEm: Date.now() - 31 * 60 * 1000,
      }),
    )

    expect(lerRetomadaAgendamento()).toBeNull()
  })

  it('rascunho malformado devolve null, não erro', () => {
    window.sessionStorage.setItem('studio-audax:agendar:retomada', '{não é json')

    expect(lerRetomadaAgendamento()).toBeNull()
  })

  it('sessionStorage fora do ar não derruba o fluxo', () => {
    const salvar = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('sem storage')
      })
    const ler = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('sem storage')
    })
    const apagar = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('sem storage')
      })

    expect(() => salvarRetomadaAgendamento(escolhaCompleta())).not.toThrow()
    expect(lerRetomadaAgendamento()).toBeNull()
    expect(() => limparRetomadaAgendamento()).not.toThrow()

    salvar.mockRestore()
    ler.mockRestore()
    apagar.mockRestore()
  })
})

describe('data de nascimento (prova de vínculo da RPC 018)', () => {
  it('aceita o formato que o campo type=date entrega', () => {
    expect(nascimentoValido('1995-06-15')).toBe(true)
    expect(nascimentoValido('  1995-06-15  ')).toBe(true)
  })

  it('recusa vazio, formato errado e data que não existe', () => {
    expect(nascimentoValido('')).toBe(false)
    expect(nascimentoValido('   ')).toBe(false)
    expect(nascimentoValido('15/06/1995')).toBe(false)
    expect(nascimentoValido('1995-13-01')).toBe(false)
    expect(nascimentoValido('1995-02-30')).toBe(false)
    expect(nascimentoValido('nada')).toBe(false)
  })

  it('recusa data futura: ninguém nasceu amanhã', () => {
    expect(nascimentoValido('2999-01-01')).toBe(false)
  })
})
