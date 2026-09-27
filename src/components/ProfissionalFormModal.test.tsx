import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfissionalFormModal from './ProfissionalFormModal'
import {
  ProfissionaisProvider,
  useProfissionais,
} from '@/modules/profissionais/store'
import type { Profissional } from '@/modules/profissionais/types'
import { arquivoParaFoto } from '@/lib/imagem'

vi.mock('@/lib/imagem', () => ({
  arquivoParaFoto: vi.fn(),
}))

const FOTO_NOVA = 'data:image/jpeg;base64,NOVA'
const FOTO_ANTIGA = 'data:image/jpeg;base64,ANTIGA'

function Lista() {
  const { profissionais } = useProfissionais()
  return <output data-testid="lista">{JSON.stringify(profissionais)}</output>
}

function lerLista(): Profissional[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

function montar(profissional?: Profissional | null) {
  const onFechar = vi.fn()
  const view = render(
    <ProfissionaisProvider>
      <Lista />
      <ProfissionalFormModal
        profissional={profissional ?? null}
        onFechar={onFechar}
      />
    </ProfissionaisProvider>,
  )
  return { ...view, onFechar }
}

function arquivoImagem() {
  return new File(['conteudo'], 'foto.png', { type: 'image/png' })
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(arquivoParaFoto).mockReset()
})

describe('ProfissionalFormModal — foto, telefone e e-mail', () => {
  it('cria funcionário com pré-visualização da foto e persiste tudo', async () => {
    vi.mocked(arquivoParaFoto).mockResolvedValue(FOTO_NOVA)
    const { container, onFechar } = montar()

    fireEvent.change(screen.getByLabelText(/nome completo/i), {
      target: { value: 'Luan Costa' },
    })
    fireEvent.change(screen.getByLabelText(/telefone/i), {
      target: { value: '(11) 98888-7777' },
    })
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'luan@email.com' },
    })

    const input = container.querySelector('input[type="file"]')
    expect(input).toBeTruthy()
    fireEvent.change(input!, { target: { files: [arquivoImagem()] } })

    // pré-visualização antes de salvar
    const previa = await screen.findByAltText('Foto de Luan Costa')
    expect(previa.getAttribute('src')).toBe(FOTO_NOVA)
    expect(screen.getByText('Trocar foto')).toBeTruthy()
    expect(screen.getByText('Remover foto')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Cadastrar profissional'))
    })
    await waitFor(() => expect(onFechar).toHaveBeenCalled())

    await waitFor(() =>
      expect(lerLista().find((p) => p.nome === 'Luan Costa')).toBeTruthy(),
    )
    const salvo = lerLista().find((p) => p.nome === 'Luan Costa')
    expect(salvo).toBeTruthy()
    expect(salvo?.telefone).toBe('(11) 98888-7777')
    expect(salvo?.email).toBe('luan@email.com')
    expect(salvo?.foto).toBe(FOTO_NOVA)

    // persistência imediata no localStorage (F5)
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('studio-audax:profissionais:v1') ?? '[]').find(
          (p: Profissional) => p.nome === 'Luan Costa',
        )?.telefone,
      ).toBe('(11) 98888-7777'),
    )
  })

  it('edita funcionário: troca telefone, e-mail e foto; depois remove a foto', async () => {
    const existente: Profissional = {
      id: 'p1',
      nome: 'Audax Ferreira',
      telefone: '',
      email: '',
      foto: FOTO_ANTIGA,
      ativo: true,
      criadoEm: '2026-01-01T00:00:00.000Z',
    }
    localStorage.setItem(
      'studio-audax:profissionais:v1',
      JSON.stringify([existente]),
    )

    // 1) editar dados + trocar foto
    vi.mocked(arquivoParaFoto).mockResolvedValueOnce(FOTO_NOVA)
    const primeiro = montar(existente)
    expect(
      screen.getByAltText('Foto de Audax Ferreira').getAttribute('src'),
    ).toBe(FOTO_ANTIGA)

    fireEvent.change(screen.getByLabelText(/telefone/i), {
      target: { value: '(11) 91111-2222' },
    })
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'audax@email.com' },
    })
    fireEvent.click(screen.getByText('Trocar foto'))
    fireEvent.change(primeiro.container.querySelector('input[type="file"]')!, {
      target: { files: [arquivoImagem()] },
    })
    await waitFor(() =>
      expect(
        screen.getByAltText('Foto de Audax Ferreira').getAttribute('src'),
      ).toBe(FOTO_NOVA),
    )

    await act(async () => {
      fireEvent.click(screen.getByText('Salvar alterações'))
    })
    await waitFor(() =>
      expect(lerLista().find((p) => p.id === 'p1')?.telefone).toBe('(11) 91111-2222'),
    )
    await waitFor(() => expect(primeiro.onFechar).toHaveBeenCalled())
    const atualizado = lerLista().find((p) => p.id === 'p1')
    expect(atualizado?.email).toBe('audax@email.com')
    expect(atualizado?.foto).toBe(FOTO_NOVA)
    primeiro.unmount()

    // 2) reabrir e remover a foto
    const segundo = montar(atualizado ?? null)
    fireEvent.click(screen.getByText('Remover foto'))
    expect(screen.queryByAltText('Foto de Audax Ferreira')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByText('Salvar alterações'))
    })
    await waitFor(() =>
      expect(
        JSON.parse(screen.getByTestId('lista').textContent ?? '[]').find(
          (p: Profissional) => p.id === 'p1',
        )?.foto,
      ).toBe(''),
    )
    segundo.unmount()

    // 3) F5: confere persistência final
    montar()
    await waitFor(() =>
      expect(
        JSON.parse(
          localStorage.getItem('studio-audax:profissionais:v1') ?? '[]',
        ).find((p: Profissional) => p.id === 'p1')?.telefone,
      ).toBe('(11) 91111-2222'),
    )
    await waitFor(() =>
      expect(
        JSON.parse(
          localStorage.getItem('studio-audax:profissionais:v1') ?? '[]',
        ).find((p: Profissional) => p.id === 'p1')?.foto,
      ).toBe(''),
    )
    const final = JSON.parse(
      localStorage.getItem('studio-audax:profissionais:v1') ?? '[]',
    ).find((p: Profissional) => p.id === 'p1')
    expect(final?.nome).toBe('Audax Ferreira')
    expect(final?.email).toBe('audax@email.com')
  })

  it('rejeita e-mail inválido sem salvar', () => {
    const { onFechar } = montar()
    fireEvent.change(screen.getByLabelText(/nome completo/i), {
      target: { value: 'Diego Santos' },
    })
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'nao-e-email' },
    })
    fireEvent.click(screen.getByText('Cadastrar profissional'))
    expect(onFechar).not.toHaveBeenCalled()
    expect(screen.getByText(/e-mail válido/i)).toBeTruthy()
  })
})
