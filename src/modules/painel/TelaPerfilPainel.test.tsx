import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obterMeuCadastro } from '@/services/supabase/painel'
import type { CadastroPainel } from '@/services/supabase/painel'
import { PainelAuthProvider } from './PainelAuthProvider'
import {
  criarClientePainelFalso,
  sessaoValidaPainel,
} from './clientePainelFalso'
import type { ClientePainelFalso } from './clientePainelFalso'
import TelaPerfilPainel from './telas/TelaPerfilPainel'

vi.mock('@/services/supabase/painel', () => ({
  clientePainel: () => null,
  obterMeuCadastro: vi.fn(),
}))

const cadastro = vi.mocked(obterMeuCadastro)

const MEU_CADASTRO: CadastroPainel = {
  id: 'cli-1',
  nome: 'Ana Silva',
  telefone: '(11) 98888-7777',
  email: 'ana@studio.com',
  nascimento: '1990-05-20',
  genero: 'feminino',
}

function renderizar(
  cliente: ClientePainelFalso = criarClientePainelFalso(
    sessaoValidaPainel(),
  ),
) {
  const utils = render(
    <PainelAuthProvider cliente={cliente}>
      <TelaPerfilPainel />
    </PainelAuthProvider>,
  )
  return { ...utils, cliente }
}

function campo(id: string): HTMLInputElement | HTMLSelectElement {
  return screen.getByLabelText(id) as HTMLInputElement | HTMLSelectElement
}

beforeEach(() => {
  cadastro.mockReset()
  cadastro.mockResolvedValue(MEU_CADASTRO)
})

describe('TelaPerfilPainel', () => {
  it('pré-preenche o formulário com o cadastro próprio', async () => {
    renderizar()
    await waitFor(() =>
      expect((campo('Nome completo') as HTMLInputElement).value).toBe(
        'Ana Silva',
      ),
    )
    expect((campo('Telefone com DDD') as HTMLInputElement).value).toBe(
      '(11) 98888-7777',
    )
    expect((campo('Data de nascimento') as HTMLInputElement).value).toBe(
      '1990-05-20',
    )
    expect(campo('Gênero').value).toBe('feminino')
    expect(screen.getByText('ana@studio.com')).toBeTruthy()
  })

  it('salvar envia os dados editados e mostra confirmação', async () => {
    const { cliente } = renderizar()
    await waitFor(() =>
      expect((campo('Nome completo') as HTMLInputElement).value).toBe(
        'Ana Silva',
      ),
    )

    fireEvent.change(campo('Nome completo'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.change(campo('Telefone com DDD'), {
      target: { value: '11977776666' },
    })
    fireEvent.change(campo('Gênero'), { target: { value: 'outro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() =>
      expect(cliente.chamadasAtualizar[0]).toEqual({
        nome: 'Ana Souza',
        telefone: '11977776666',
        nascimento: '1990-05-20',
        genero: 'outro',
      }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(
        /atualizados com sucesso/,
      ),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('erro da RPC vira alerta e não mostra confirmação', async () => {
    const { cliente } = renderizar()
    cliente.erroAtualizar = new Error('Informe um telefone válido com DDD.')
    await waitFor(() =>
      expect((campo('Nome completo') as HTMLInputElement).value).toBe(
        'Ana Silva',
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Informe um telefone válido com DDD.',
      ),
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('falha de carga vira alerta com "Tentar de novo"', async () => {
    cadastro.mockRejectedValueOnce(new Error('sem rede agora'))
    renderizar()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('sem rede agora'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() =>
      expect((campo('Nome completo') as HTMLInputElement).value).toBe(
        'Ana Silva',
      ),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
