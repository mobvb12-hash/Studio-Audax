import { beforeEach, describe, expect, it } from 'vitest'
import { limparPreenchimento, lerPreenchimento } from './regras'

/**
 * A PONTE entre as duas áreas: quem vem da Área do Cliente chega no
 * agendamento oficial com o cadastro já preenchido.
 *
 * A peça é o par `irParaAgendamentoOficial` (escreve) e
 * `lerPreenchimento`/`limparPreenchimento` (lê e apaga). O preenchimento vale
 * para UMA visita: se sobrasse, o formulário abriria preenchido sozinho na vez
 * seguinte, sem o cliente pedir.
 */
const CHAVE = 'studio-audax:agendar:preenchimento'

function escreve(bruto: unknown): void {
  window.sessionStorage.setItem(CHAVE, JSON.stringify(bruto))
}

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('ponte Área do Cliente → agendamento oficial', () => {
  it('sem nada guardado, não há preenchimento', () => {
    expect(lerPreenchimento()).toBeNull()
  })

  it('lê exatamente o que o painel deixou', () => {
    escreve({ nome: 'Ana Souza', telefone: '81999737359' })
    expect(lerPreenchimento()).toEqual({
      nome: 'Ana Souza',
      telefone: '81999737359',
    })
  })

  it('lixo no storage não derruba o formulário', () => {
    // O `AgendarPublico` chama isto no estado inicial: se lançar aqui, a
    // página inteira do agendamento não abre.
    for (const bruto of ['isto não é json', '{"nome":', '[1,2,3]', 'null', '{}']) {
      window.sessionStorage.setItem(CHAVE, bruto)
      const leitura = lerPreenchimento()
      expect(leitura === null || typeof leitura.nome === 'string').toBe(true)
    }
  })

  it('campo que falta no storage vira string vazia, nunca undefined', () => {
    // `undefined` num input controlado é o valor "não controlado": o React
    // avisa e o campo trava.
    escreve({ nome: 'Ana Souza' })
    expect(lerPreenchimento()).toEqual({ nome: 'Ana Souza', telefone: '' })
  })

  it('limpar apaga de vez: a próxima visita começa em branco', () => {
    escreve({ nome: 'Ana Souza', telefone: '81999737359' })
    expect(lerPreenchimento()).not.toBeNull()
    limparPreenchimento()
    expect(lerPreenchimento()).toBeNull()
    // Limpar duas vezes não explode (o efeito roda mesmo sem preenchimento).
    expect(() => limparPreenchimento()).not.toThrow()
  })

  it('o preenchimento NÃO viaja pela URL', () => {
    // A URL é o que o cliente copia, imprime e manda no WhatsApp: nome e
    // telefone nunca podem aparecer nela.
    window.history.replaceState(null, '', '/agendar')
    escreve({ nome: 'Ana Souza', telefone: '81999737359' })
    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe('/agendar')
  })
})
