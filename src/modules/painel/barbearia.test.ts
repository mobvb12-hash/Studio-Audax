import { describe, expect, it } from 'vitest'
import {
  digitosDoTelefone,
  linkInstagram,
  linkMapa,
  linkWhatsapp,
  rotuloInstagram,
  rotuloTelefone,
  temDadosDaBarbearia,
} from './barbearia'
import type { BarbeariaPublica } from '@/services/supabase/agendaPublica'

/**
 * Regras dos links públicos.
 *
 * O ponto central: campo vazio = link vazio. Nenhum número de telefone é
 * inventado para "preencher" a tela.
 */

const CASA: BarbeariaPublica = {
  endereco: 'Rua Ecoporanga, 60 - Ibura de Baixo - Recife/PE',
  telefone: '(81) 99737-3593',
  instagram: '@studioaudax__',
  mapa: '',
}

const VAZIA: BarbeariaPublica = {
  endereco: '',
  telefone: '',
  instagram: '',
  mapa: '',
}

describe('telefone da barbearia', () => {
  it('normaliza para o wa.me com DDI', () => {
    expect(digitosDoTelefone('(81) 99737-3593')).toBe('5581997373593')
    expect(linkWhatsapp(CASA)).toContain('https://wa.me/5581997373593')
  })

  it('não duplica o DDI quando o dono já digitou com 55', () => {
    expect(digitosDoTelefone('+55 81 99737-3593')).toBe('5581997373593')
  })

  it('sem telefone oficial, o link NÃO é inventado', () => {
    expect(linkWhatsapp(VAZIA)).toBe('')
    expect(linkWhatsapp({ ...CASA, telefone: '' })).toBe('')
    expect(rotuloTelefone({ ...CASA, telefone: '' })).toBe('')
  })

  it('mostra o telefone legível no formato brasileiro', () => {
    expect(rotuloTelefone(CASA)).toBe('(81) 99737-3593')
  })

  it('a mensagem do WhatsApp já vai pronta', () => {
    expect(linkWhatsapp(CASA, 'Quero barba')).toContain(
      encodeURIComponent('Quero barba'),
    )
  })
})

describe('Instagram da barbearia', () => {
  it('normaliza @perfil para o endereço público', () => {
    expect(linkInstagram(CASA)).toBe('https://instagram.com/studioaudax__')
    expect(rotuloInstagram(CASA)).toBe('@studioaudax__')
  })

  it('aceita a URL completa sem mexer nela', () => {
    const comUrl = { ...CASA, instagram: 'https://instagram.com/studioaudax__' }
    expect(linkInstagram(comUrl)).toBe('https://instagram.com/studioaudax__')
    expect(rotuloInstagram(comUrl)).toBe('@studioaudax__')
  })

  it('sem Instagram configurado não gera link', () => {
    expect(linkInstagram(VAZIA)).toBe('')
  })
})

describe('mapa da barbearia', () => {
  it('usa o link oficial quando configurado', () => {
    const comMapa = { ...CASA, mapa: 'https://maps.app.goo.gl/xyz' }
    expect(linkMapa(comMapa)).toBe('https://maps.app.goo.gl/xyz')
  })

  it('sem link oficial, monta a busca pelo endereço cadastrado', () => {
    const url = linkMapa(CASA)
    expect(url).toContain('google.com/maps/search')
    expect(url).toContain(encodeURIComponent('Rua Ecoporanga, 60'))
  })

  it('sem endereço NEM link, não inventa rota', () => {
    expect(linkMapa(VAZIA)).toBe('')
  })
})

describe('temDadosDaBarbearia', () => {
  it('só mostra a seção quando existe dado oficial', () => {
    expect(temDadosDaBarbearia(CASA)).toBe(true)
    expect(temDadosDaBarbearia(VAZIA)).toBe(false)
    expect(temDadosDaBarbearia({ ...VAZIA, instagram: '@x' })).toBe(true)
  })
})