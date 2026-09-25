import { act, useEffect } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'
import ClienteFormModal from './ClienteFormModal'

let ctx: ReturnType<typeof useClientes>

function Captura() {
  const clientes = useClientes()
  useEffect(() => {
    ctx = clientes
  })
  return null
}

function montar(cliente?: Cliente | null) {
  const onFechar = vi.fn()
  const view = render(
    <ClientesProvider>
      <Captura />
      <ClienteFormModal cliente={cliente ?? null} onFechar={onFechar} />
    </ClientesProvider>,
  )
  return { onFechar, ...view }
}

function preencherBasico(nome: string, telefone: string) {
  fireEvent.change(screen.getByLabelText('Nome *'), {
    target: { value: nome },
  })
  fireEvent.change(screen.getByLabelText('Telefone *'), {
    target: { value: telefone },
  })
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useClientes>
})

describe('Formulário de cliente — cadastro completo', () => {
  it('persiste todas as informações da tela de cadastro', () => {
    const { onFechar, unmount } = montar()

    preencherBasico('Lucas Mendes', '(81) 98888-7777')

    // Telefone adicional (tipo + adicionar)
    fireEvent.change(screen.getByLabelText('Tipo de telefone'), {
      target: { value: 'residencial' },
    })
    fireEvent.change(screen.getByLabelText('Telefone *'), {
      target: { value: '(81) 3232-1111' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar telefone' }))
    fireEvent.change(screen.getByLabelText('Telefone *'), {
      target: { value: '(81) 98888-7777' },
    })

    fireEvent.change(screen.getByLabelText('Gênero'), {
      target: { value: 'feminino' },
    })
    fireEvent.change(screen.getByLabelText('CPF'), {
      target: { value: '123.456.789-00' },
    })
    fireEvent.change(screen.getByLabelText('CNPJ'), {
      target: { value: '12.345.678/0001-90' },
    })
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'lucas@email.com' },
    })
    fireEvent.change(screen.getByLabelText('Dia do nascimento'), {
      target: { value: '15' },
    })
    fireEvent.change(screen.getByLabelText('Mês do nascimento'), {
      target: { value: '3' },
    })
    fireEvent.change(screen.getByLabelText('Ano do nascimento'), {
      target: { value: '1995' },
    })

    // Etiquetas
    fireEvent.change(screen.getByLabelText('Etiquetas'), {
      target: { value: 'VIP' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar etiqueta' }))
    fireEvent.change(screen.getByLabelText('Etiquetas'), {
      target: { value: 'fiel' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar etiqueta' }))

    fireEvent.change(screen.getByLabelText('Redes sociais'), {
      target: { value: '@lucasbarb' },
    })
    fireEvent.change(screen.getByLabelText('Como nos conheceu'), {
      target: { value: 'Instagram' },
    })
    fireEvent.change(screen.getByLabelText('Observações'), {
      target: { value: 'Prefere cadeira 3' },
    })

    // Preferências: desliga campanhas de SMS e e-mail
    fireEvent.click(screen.getByLabelText('Cliente recebe SMS marketing'))
    fireEvent.click(screen.getByLabelText('Cliente recebe e-mail marketing'))

    // Endereço
    fireEvent.click(screen.getByText('Incluir Endereço do Cliente'))
    fireEvent.change(screen.getByLabelText('CEP'), {
      target: { value: '55000-000' },
    })
    fireEvent.change(screen.getByLabelText('Logradouro'), {
      target: { value: 'Rua das Flores' },
    })
    fireEvent.change(screen.getByLabelText('Número'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Complemento'), {
      target: { value: 'Casa' },
    })
    fireEvent.change(screen.getByLabelText('Bairro'), {
      target: { value: 'Centro' },
    })
    fireEvent.change(screen.getByLabelText('Cidade'), {
      target: { value: 'Caruaru' },
    })
    fireEvent.change(screen.getByLabelText('UF'), {
      target: { value: 'pe' },
    })

    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(onFechar).toHaveBeenCalledTimes(1)

    const salvo = ctx.clientes[0]
    expect(salvo.nome).toBe('Lucas Mendes')
    expect(salvo.telefone).toBe('(81) 98888-7777')
    expect(salvo.telefones).toEqual([
      { tipo: 'residencial', numero: '(81) 3232-1111' },
    ])
    expect(salvo.genero).toBe('feminino')
    expect(salvo.cpf).toBe('123.456.789-00')
    expect(salvo.cnpj).toBe('12.345.678/0001-90')
    expect(salvo.email).toBe('lucas@email.com')
    expect(salvo.nascimento).toBe('1995-03-15')
    expect(salvo.etiquetas).toEqual(['VIP', 'fiel'])
    expect(salvo.instagram).toBe('@lucasbarb')
    expect(salvo.comoNosConheceu).toBe('Instagram')
    expect(salvo.observacao).toBe('Prefere cadeira 3')
    expect(salvo.preferencias).toEqual({
      emailAgendamentos: true,
      smsLembrete: true,
      smsMarketing: false,
      emailMarketing: false,
    })
    expect(salvo.endereco).toEqual({
      cep: '55000-000',
      logradouro: 'Rua das Flores',
      numero: '10',
      complemento: 'Casa',
      bairro: 'Centro',
      cidade: 'Caruaru',
      uf: 'PE',
    })

    // Persistência (localStorage) e F5: dados continuam ao remontar
    const gravado = JSON.parse(
      localStorage.getItem('studio-audax:clientes:v1') ?? '[]',
    )
    expect(gravado[0].etiquetas).toEqual(['VIP', 'fiel'])

    unmount()
    render(
      <ClientesProvider>
        <Captura />
        <ClienteFormModal cliente={null} onFechar={vi.fn()} />
      </ClientesProvider>,
    )
    expect(ctx.clientes[0].nascimento).toBe('1995-03-15')
  })
})

describe('Formulário de cliente — validações', () => {
  it('exige nome, telefone e formats válidos, e valida nascimento', () => {
    const { onFechar } = montar()

    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(screen.getByText('Informe o nome do cliente.')).toBeTruthy()

    preencherBasico('Ana Souza', '')
    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(screen.getByText('Informe o telefone do cliente.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Telefone *'), {
      target: { value: '(81) 99999-9999' },
    })
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'errado' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(
      screen.getByText('Informe um e-mail válido ou deixe em branco.'),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('CPF'), {
      target: { value: '123' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(
      screen.getByText('Informe um CPF com 11 dígitos ou deixe em branco.'),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('CNPJ'), {
      target: { value: '123' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(
      screen.getByText('Informe um CNPJ com 14 dígitos ou deixe em branco.'),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Dia do nascimento'), {
      target: { value: '15' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(
      screen.getByText(
        'Informe dia, mês e ano do nascimento ou deixe em branco.',
      ),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Mês do nascimento'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(
      screen.getByText(
        'Informe dia, mês e ano do nascimento ou deixe em branco.',
      ),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Ano do nascimento'), {
      target: { value: '1990' },
    })
    fireEvent.change(screen.getByLabelText('Dia do nascimento'), {
      target: { value: '31' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(screen.getByText('Data de nascimento inválida.')).toBeTruthy()

    expect(onFechar).not.toHaveBeenCalled()
    expect(screen.getByText('* Campos obrigatórios')).toBeTruthy()

    // Corrige o dia e salva
    fireEvent.change(screen.getByLabelText('Dia do nascimento'), {
      target: { value: '15' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))
    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(ctx.clientes[0].nascimento).toBe('1990-02-15')
  })

  it('etiqueta não pode ser adicionada vazia', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar etiqueta' }))
    expect(ctx.clientes).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Etiquetas'), {
      target: { value: 'VIP' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar etiqueta' }))
    expect(
      screen.getByLabelText('Remover etiqueta VIP'),
    ).toBeTruthy()
  })
})

describe('Formulário de cliente — edição', () => {
  it('pré-preenche os dados e atualiza sem perder o restante', async () => {
    // Semeia num provider temporário e guarda o objeto
    const semente = render(
      <ClientesProvider>
        <Captura />
      </ClientesProvider>,
    )
    act(() => {
      ctx.adicionar({
        nome: 'Lucas Mendes',
        telefone: '(81) 98888-7777',
        email: 'lucas@email.com',
        observacao: 'Prefere cadeira 3',
        genero: 'feminino',
        nascimento: '1995-03-15',
        etiquetas: ['VIP', 'fiel'],
        instagram: '@lucasbarb',
        comoNosConheceu: 'Instagram',
        preferencias: {
          emailAgendamentos: true,
          smsLembrete: true,
          smsMarketing: false,
          emailMarketing: true,
        },
      })
    })
    const cliente = ctx.clientes[0]
    semente.unmount()

    const { onFechar } = montar(cliente)

    // Pré-preenchimento
    expect(screen.getByLabelText('Nome *')).toHaveProperty(
      'value',
      'Lucas Mendes',
    )
    expect(screen.getByLabelText('Gênero')).toHaveProperty(
      'value',
      'feminino',
    )
    expect(screen.getByLabelText('Dia do nascimento')).toHaveProperty(
      'value',
      '15',
    )
    expect(screen.getByLabelText('Mês do nascimento')).toHaveProperty(
      'value',
      '3',
    )
    expect(screen.getByLabelText('Ano do nascimento')).toHaveProperty(
      'value',
      '1995',
    )
    expect(screen.getByLabelText('Redes sociais')).toHaveProperty(
      'value',
      '@lucasbarb',
    )
    expect(screen.getByLabelText('Como nos conheceu')).toHaveProperty(
      'value',
      'Instagram',
    )
    expect(screen.getByLabelText('Remover etiqueta VIP')).toBeTruthy()
    expect(
      (screen.getByLabelText('Cliente recebe SMS marketing') as HTMLInputElement)
        .checked,
    ).toBe(false)
    expect(
      (
        screen.getByLabelText(
          'Cliente recebe e-mails sobre seus agendamentos',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true)

    // Alterações
    fireEvent.change(screen.getByLabelText('Gênero'), {
      target: { value: 'masculino' },
    })
    fireEvent.click(screen.getByLabelText('Remover etiqueta VIP'))
    fireEvent.change(screen.getByLabelText('Etiquetas'), {
      target: { value: 'novo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar etiqueta' }))
    fireEvent.click(screen.getByLabelText('Cliente recebe SMS marketing'))

    fireEvent.click(screen.getByText('Salvar alterações'))
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1))

    const atualizado = ctx.clientes[0]
    expect(atualizado.genero).toBe('masculino')
    expect(atualizado.etiquetas).toEqual(['fiel', 'novo'])
    expect(atualizado.preferencias.smsMarketing).toBe(true)
    expect(atualizado.preferencias.emailAgendamentos).toBe(true)
    // Campos não alterados preservados
    expect(atualizado.telefone).toBe('(81) 98888-7777')
    expect(atualizado.email).toBe('lucas@email.com')
    expect(atualizado.observacao).toBe('Prefere cadeira 3')
    expect(atualizado.nascimento).toBe('1995-03-15')
    expect(atualizado.instagram).toBe('@lucasbarb')
    expect(atualizado.comoNosConheceu).toBe('Instagram')
  })
})

describe('Modelo de cliente — padrões e retrocompatibilidade', () => {
  it('adicionar sem campos novos aplica os padrões', () => {
    render(
      <ClientesProvider>
        <Captura />
      </ClientesProvider>,
    )
    act(() => {
      ctx.adicionar({
        nome: 'Simples',
        telefone: '(81) 90000-0000',
        email: '',
        observacao: '',
      })
    })
    const c = ctx.clientes[0]
    expect(c.genero).toBe('nao_informado')
    expect(c.cpf).toBe('')
    expect(c.nascimento).toBe('')
    expect(c.etiquetas).toEqual([])
    expect(c.instagram).toBe('')
    expect(c.telefones).toEqual([])
    expect(c.endereco).toBeNull()
    expect(c.preferencias).toEqual({
      emailAgendamentos: true,
      smsLembrete: true,
      smsMarketing: true,
      emailMarketing: true,
    })
  })

  it('registros antigos no localStorage ganham os campos novos ao carregar', () => {
    localStorage.setItem(
      'studio-audax:clientes:v1',
      JSON.stringify([
        {
          id: 'legado-1',
          nome: 'Cliente Legado',
          telefone: '(11) 91111-2222',
          email: '',
          observacao: '',
          criadoEm: '2024-01-01T00:00:00.000Z',
          atualizadoEm: '2024-01-01T00:00:00.000Z',
        },
      ]),
    )
    render(
      <ClientesProvider>
        <Captura />
      </ClientesProvider>,
    )
    expect(ctx.clientes[0].genero).toBe('nao_informado')
    expect(ctx.clientes[0].etiquetas).toEqual([])
    expect(ctx.clientes[0].preferencias.emailAgendamentos).toBe(true)
    expect(ctx.clientes[0].endereco).toBeNull()
  })
})
