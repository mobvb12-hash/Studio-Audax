import { describe, expect, it } from 'vitest'
import {
  RPCS_AUTORIZADAS,
  interpretarAgendamentos,
  interpretarRpc,
  montarRpcSecreto,
  motivoSeguro,
} from './acoes'
import type { RpcAutorizada } from './acoes'

const BASE = 'https://ydrfzbffxoklvnschlfy.supabase.co'
const CHAVE = 'sb_secret_ABCDEF1234567890abcdefghijklmnop'

describe('montarRpcSecreto — credencial somente nos headers', () => {
  it('monta URL, headers e corpo JSON sem a chave fora do header', () => {
    const { url, init } = montarRpcSecreto(BASE, CHAVE, 'ia_agendamentos_do_telefone', {
      p_telefone: '5581997373593',
    })
    expect(url).toBe(`${BASE}/rest/v1/rpc/ia_agendamentos_do_telefone`)
    expect(url).not.toContain('sb_secret')
    const headers = init.headers as Record<string, string>
    expect(headers.apikey).toBe(CHAVE)
    expect(headers.Authorization).toBe(`Bearer ${CHAVE}`)
    expect(init.body).not.toContain('sb_secret')
    const corpo = JSON.parse(init.body as string)
    expect(corpo).toEqual({ p_telefone: '5581997373593' })
    expect(init.method).toBe('POST')
  })

  it('aceita base com barra final sem duplicar', () => {
    const { url } = montarRpcSecreto(`${BASE}/`, CHAVE, 'ia_cliente_por_telefone', {
      p_telefone: '5581997373593',
    })
    expect(url).toBe(`${BASE}/rest/v1/rpc/ia_cliente_por_telefone`)
  })

  it('recusa base inválida', () => {
    expect(() =>
      montarRpcSecreto('', CHAVE, 'ia_cliente_por_telefone', { p_telefone: '5581997373593' }),
    ).toThrow(/SUPABASE_URL/)
    expect(() =>
      montarRpcSecreto('javascript:alert(1)', CHAVE, 'ia_cliente_por_telefone', {
        p_telefone: '5581997373593',
      }),
    ).toThrow(/SUPABASE_URL/)
  })

  it('recusa credencial fora do padrão sb_secret_', () => {
    expect(() =>
      montarRpcSecreto(BASE, 'sb_publish_outra', 'ia_cliente_por_telefone', {
        p_telefone: '5581997373593',
      }),
    ).toThrow(/Credencial/)
    expect(() =>
      montarRpcSecreto(BASE, '', 'ia_cliente_por_telefone', { p_telefone: '5581997373593' }),
    ).toThrow(/Credencial/)
  })

  it('lista branca: nome fora de RPCS_AUTORIZADAS nunca é montado', () => {
    const fora = 'excluir_tudo' as RpcAutorizada
    expect(RPCS_AUTORIZADAS).not.toContain(fora)
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, fora, { p_telefone: '5581997373593' }),
    ).toThrow(/não autorizada/)
  })

  it('valida telefone, id, data e horário', () => {
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_cliente_por_telefone', { p_telefone: '123' }),
    ).toThrow(/Telefone/)
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_agendamento_cancelar', { p_id: 'abc' }),
    ).toThrow(/Identificador/)
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_agendamento_cancelar', { p_id: '../etc' }),
    ).toThrow(/Identificador/)
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_agendamento_remarcar', {
        p_id: 'ag-0001',
        p_telefone: '5581997373593',
        p_data: 'amanha',
        p_horario: '15:00',
        p_profissional: 'Ítalo',
      }),
    ).toThrow(/Data/)
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_agendamento_remarcar', {
        p_id: 'ag-0001',
        p_telefone: '5581997373593',
        p_data: '2026-10-02',
        p_horario: '15h',
        p_profissional: 'Ítalo',
      }),
    ).toThrow(/Horário/)
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_agendamento_remarcar', {
        p_id: 'ag-0001',
        p_telefone: '5581997373593',
        p_data: '2026-10-02',
        p_horario: '15:00',
        p_profissional: '   ',
      }),
    ).toThrow(/Profissional/)
  })

  it('parâmetros não-string são recusados (tipagem do corpo)', () => {
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_cliente_por_telefone', {
        p_telefone: '5581997373593',
        extra: 1 as unknown as string,
      }),
    ).toThrow(/Parâmetro/)
  })

  it('id legado não-hex passa, valores maliciosos não', () => {
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_agendamento_cancelar', {
        p_id: 'aGVsbG8td29ybGQ',
      }),
    ).not.toThrow()
    expect(() =>
      montarRpcSecreto(BASE, CHAVE, 'ia_agendamento_cancelar', {
        p_id: "1; drop table",
      }),
    ).toThrow(/Identificador/)
  })

  it('o nome do RPC vira caminho da URL, nunca query string', () => {
    const { url } = montarRpcSecreto(BASE, CHAVE, 'ia_agendamentos_do_telefone', {
      p_telefone: '5581997373593',
    })
    expect(url).not.toContain('?')
    expect(url).not.toContain('#')
  })
})

describe('motivoSeguro — sanitização antes de log/resposta', () => {
  it('remove credenciais conhecidas', () => {
    expect(motivoSeguro('falha com Bearer abc.def-123 ao chamar')).toContain('Bearer [oculto]')
    expect(motivoSeguro('chave AIzaSyABCDEFG1234567890 expirada')).toBe(
      'chave [oculto] expirada',
    )
    expect(motivoSeguro('usa sb_secret_abcdef123 aqui')).toBe('usa [oculto] aqui')
    expect(motivoSeguro('token sbp_abcdef123')).toContain('[oculto]')
    expect(motivoSeguro('sk-abcdef123456789 foi vazada')).toContain('[oculto]')
  })

  it('entrada vazia ou não-string vira mensagem genérica', () => {
    expect(motivoSeguro('')).toBe('Não foi possível concluir a operação.')
    expect(motivoSeguro(null)).toBe('Não foi possível concluir a operação.')
    expect(motivoSeguro({ hack: true })).toBe('Não foi possível concluir a operação.')
  })

  it('corta em 300 caracteres', () => {
    expect(motivoSeguro('x'.repeat(500))).toHaveLength(300)
  })
})

describe('interpretarRpc — sem vazar corpo arbitrário', () => {
  it('2xx devolve os dados como JSON', () => {
    const r = interpretarRpc(200, '{"id":"ag-1"}')
    expect(r).toEqual({ ok: true, dados: { id: 'ag-1' } })
  })

  it('erro com message usa a mensagem sanitizada', () => {
    const r = interpretarRpc(400, JSON.stringify({ message: 'Horário ocupado' }))
    expect(r).toEqual({ ok: false, motivo: 'Horário ocupado' })
  })

  it('message com credencial é sanitizada', () => {
    const r = interpretarRpc(
      400,
      JSON.stringify({ message: 'api sb_secret_vazou aqui' }),
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).not.toContain('sb_secret_vazou')
    expect(r.ok === false && r.motivo).toContain('[oculto]')
  })

  it('sem JSON válido cai em mensagem genérica com status', () => {
    const r = interpretarRpc(502, '<html>bad gateway</html>')
    expect(r).toEqual({ ok: false, motivo: 'A operação não foi confirmada (HTTP 502).' })
  })

  it('ordem de preferência: message > error > hint', () => {
    const comHint = interpretarRpc(400, JSON.stringify({ hint: 'dica' }))
    expect(comHint).toEqual({ ok: false, motivo: 'dica' })
    const comTudo = interpretarRpc(400, JSON.stringify({ message: 'm', error: 'e', hint: 'h' }))
    expect(comTudo).toEqual({ ok: false, motivo: 'm' })
  })

  it('2xx com corpo não-JSON não é tratado como erro', () => {
    const r = interpretarRpc(204, '')
    expect(r.ok).toBe(true)
  })
})

describe('interpretarAgendamentos — mapeamento defensivo', () => {
  it('converte linhas válidas e descarta o resto', () => {
    const linhas = interpretarAgendamentos([
      { id: 'ag-1', servico: 'Corte', profissional: 'Ítalo', data: '2026-10-02', horario: '10:00', status: 'pendente' },
      null,
      'texto solto',
      [1, 2],
      { servico: 'sem id' },
      { id: 42, servico: 'id não-string' },
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toEqual({
      id: 'ag-1',
      servico: 'Corte',
      profissional: 'Ítalo',
      data: '2026-10-02',
      horario: '10:00',
      status: 'pendente',
    })
  })

  it('não-array vira lista vazia', () => {
    expect(interpretarAgendamentos({ message: 'erro' })).toEqual([])
    expect(interpretarAgendamentos(null)).toEqual([])
    expect(interpretarAgendamentos('[]')).toEqual([])
  })
})
