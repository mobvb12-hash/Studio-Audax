#!/usr/bin/env node
// ============================================================================
// Studio Audax — teste de concorrência da Agenda (migration 021)
//
// Prova que duas transações concorrentes NUNCA confirmam o mesmo
// profissional/data/horário. Usa a API de Management do Supabase, que abre
// uma conexão nova por requisição — por isso as transações são realmente
// simultâneas (é exatamente o cenário que reproduzia o TOCTOU).
//
// Uso:
//   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/testar-concorrencia-agenda.mjs
//
// O script cria SOMENTE dados temporários (marcados com `CONC TESTE`), não
// toca em clientes reais, não envia WhatsApp e não chama IA. Ao final (inclusive
// em caso de falha) ele apaga tudo o que criou.
// ============================================================================

const token = process.env.SUPABASE_ACCESS_TOKEN
const projeto = process.env.SUPABASE_PROJECT_REF

if (!token || !projeto) {
  console.error(
    'Defina SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF antes de rodar.\n' +
      'Exemplo (PowerShell):\n' +
      '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."\n' +
      '  $env:SUPABASE_PROJECT_REF  = "xxxxxxxxxxxx"\n' +
      '  node scripts/testar-concorrencia-agenda.mjs',
  )
  process.exit(2)
}

const MARCA = 'CONC TESTE'
const API = `https://api.supabase.com/v1/projects/${projeto}/database/query`

/** Executa um SQL numa nova conexão (a API abre uma por requisição). */
async function sql(comando) {
  const resposta = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ query: comando }),
  })
  const texto = await resposta.text()
  if (!resposta.ok) throw new Error(texto)
  return JSON.parse(texto)
}

/** Executa vários SQLs ao mesmo tempo e devolve o resultado de cada um. */
async function emParalelo(comandos) {
  return Promise.all(
    comandos.map(async (comando) => {
      try {
        await sql(comando)
        return { ok: true }
      } catch (erro) {
        return { ok: false, erro: erro.message }
      }
    }),
  )
}

const primeiroValor = async (comando, coluna) => {
  const linhas = await sql(comando)
  return linhas?.[0]?.[coluna]
}

const contar = async (comando) => Number(await primeiroValor(comando, 'n'))

const resultados = []
function registrar(cenario, descricao, obtidos, esperado) {
  const ok =
    obtidos.sucessos === esperado.sucessos &&
    obtidos.conflitos === esperado.conflitos &&
    obtidos.linhas === esperado.linhas
  resultados.push({ cenario, descricao, ...obtidos, veredito: ok ? 'PASS' : 'FALHA' })
  console.log(
    `${ok ? 'OK ' : '!! '}[${cenario}] ${descricao}\n` +
      `        sucessos=${obtidos.sucessos}/${esperado.sucessos} ` +
      `conflitos=${obtidos.conflitos}/${esperado.conflitos} ` +
      `linhas=${obtidos.linhas}/${esperado.linhas}`,
  )
}

const somar = (rs) => ({
  sucessos: rs.filter((r) => r.ok).length,
  conflitos: rs.filter((r) => !r.ok).length,
})

const criar = (nome, fone, servico, prof, data, hora) =>
  `select public.agendamento_publico_criar('${MARCA} ${nome}','${fone}','${servico}','${prof}','${data}'::date,'${hora}','${MARCA}')`

const inserirCru = (id, nome, fone, servico, prof, data, hora, duracao) =>
  `insert into public.agendamentos (id,cliente,telefone,servico,profissional,data,horario,status,duracao_min,observacao,remarcacoes,criado_em,atualizado_em) ` +
  `values ('${id}','${MARCA} ${nome}','${fone}','${servico}','${prof}','${data}'::date,'${hora}','pendente',${duracao},'${MARCA}','[]'::jsonb,now(),now())`

const somarMinutos = (hora, minutos) => {
  const [h, m] = hora.split(':').map(Number)
  const total = h * 60 + m + minutos
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function main() {
  const prof1 = await primeiroValor(
    "select nome from public.profissionais where ativo order by nome limit 1",
    'nome',
  )
  const prof2 = await primeiroValor(
    `select nome from public.profissionais where ativo and nome <> '${prof1}' order by nome limit 1`,
    'nome',
  )
  const servico = await primeiroValor(
    "select nome from public.servicos where ativo order by nome limit 1",
    'nome',
  )
  const duracao = Number(
    (await primeiroValor(
      `select duracao_min from public.servicos where nome = '${servico}'`,
      'duracao_min',
    )) || 30,
  )
  if (!prof1 || !servico) throw new Error('sem profissional/serviço ativo para testar')

  // Datas bem futuras: não encosta em nenhum agendamento real.
  const base = new Date()
  base.setUTCDate(base.getUTCDate() + 400)
  const data = (n) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  console.log(
    `Profissionais: ${prof1} | ${prof2}\nServiço: ${servico} (${duracao}min)\n`,
  )

  const limpar = async () => {
    await sql(`delete from public.agendamentos where observacao = '${MARCA}'`)
  }

  try {
    // ---- A: janela TOCTOU determinística -----------------------------------
    // A transação 1 fica com a transação aberta; a 2 tenta o MESMO horário
    // antes do commit da 1. Sem lock, as duas gravariam (o bug original).
    await limpar()
    const dA = data(1)
    // a transação 1 segura o commit aberto; a 2 chega enquanto isso
    const [rA1, rA2] = await Promise.all([
      sql(
        `begin; ${criar('A1', '11900099001', servico, prof1, dA, '15:00')}; ` +
          'select pg_sleep(3); commit;',
      ).then(() => ({ ok: true })).catch((e) => ({ ok: false, erro: e.message })),
      new Promise((r) => setTimeout(r, 800)).then(() =>
        sql(criar('A2', '11900099002', servico, prof1, dA, '15:00'))
          .then(() => ({ ok: true }))
          .catch((e) => ({ ok: false, erro: e.message })),
      ),
    ])
    registrar('A', 'janela TOCTOU: 2 transações, mesmo slot (a 2ª espera o commit)', {
      ...somar([rA1, rA2]),
      linhas: await contar(
        `select count(*)::text as n from public.agendamentos where data = '${dA}'::date and profissional = '${prof1}'`,
      ),
    }, { sucessos: 1, conflitos: 1, linhas: 1 })

    // ---- B: quatro criações simultâneas ------------------------------------
    await limpar()
    const dB = data(2)
    const rB = await emParalelo(
      [1, 2, 3, 4].map((i) =>
        criar(`B${i}`, `1190009901${i}`, servico, prof1, dB, '15:00'),
      ),
    )
    registrar('B', '4 criações simultâneas, mesmo slot', {
      ...somar(rB),
      linhas: await contar(
        `select count(*)::text as n from public.agendamentos where data = '${dB}'::date and profissional = '${prof1}'`,
      ),
    }, { sucessos: 1, conflitos: 3, linhas: 1 })

    // ---- C: dois clientes, mesmo slot --------------------------------------
    await limpar()
    const dC = data(3)
    const rC = await emParalelo([
      criar('C1', '11900099021', servico, prof1, dC, '15:00'),
      criar('C2', '11900099022', servico, prof1, dC, '15:00'),
    ])
    registrar('C', '2 clientes diferentes, mesmo slot', {
      ...somar(rC),
      linhas: await contar(
        `select count(*)::text as n from public.agendamentos where data = '${dC}'::date and profissional = '${prof1}'`,
      ),
    }, { sucessos: 1, conflitos: 1, linhas: 1 })

    // ---- D: profissionais diferentes podem usar o mesmo horário ------------
    if (prof2) {
      await limpar()
      const dD = data(4)
      const rD = await emParalelo([
        criar('D1', '11900099031', servico, prof1, dD, '15:00'),
        criar('D2', '11900099032', servico, prof2, dD, '15:00'),
      ])
      registrar('D', 'mesmo horário, 2 profissionais diferentes', {
        ...somar(rD),
        linhas: await contar(
          `select count(*)::text as n from public.agendamentos where data = '${dD}'::date`,
        ),
      }, { sucessos: 2, conflitos: 0, linhas: 2 })
    }

    // ---- E: horários adjacentes continuam permitidos ------------------------
    await limpar()
    const dE = data(5)
    const rE = await emParalelo([
      criar('E1', '11900099041', servico, prof1, dE, '15:00'),
      criar('E2', '11900099042', servico, prof1, dE, somarMinutos('15:00', duracao)),
    ])
    registrar('E', `adjacentes (15:00 e ${somarMinutos('15:00', duracao)})`, {
      ...somar(rE),
      linhas: await contar(
        `select count(*)::text as n from public.agendamentos where data = '${dE}'::date and profissional = '${prof1}'`,
      ),
    }, { sucessos: 2, conflitos: 0, linhas: 2 })

    // ---- F: duração diferente sobrepõe e é barrada -------------------------
    await limpar()
    const dF = data(6)
    const rF = await emParalelo([
      criar('F1', '11900099051', servico, prof1, dF, '15:00'),
      criar('F2', '11900099052', servico, prof1, dF, somarMinutos('15:00', Math.max(1, Math.floor(duracao / 2)))),
    ])
    registrar('F', 'serviços com durações diferentes se sobrepondo', {
      ...somar(rF),
      linhas: await contar(
        `select count(*)::text as n from public.agendamentos where data = '${dF}'::date and profissional = '${prof1}'`,
      ),
    }, { sucessos: 1, conflitos: 1, linhas: 1 })

    // ---- J: INSERT direto e concorrente (sem passar por RPC) ---------------
    await limpar()
    const dJ = data(7)
    const rJ = await emParalelo([
      inserirCru('conc-teste-j1', 'J1', '11900099061', servico, prof1, dJ, '15:00', duracao),
      inserirCru('conc-teste-j2', 'J2', '11900099062', servico, prof1, dJ, '15:00', duracao),
    ])
    registrar('J', 'INSERT direto e concorrente (sem RPC)', {
      ...somar(rJ),
      linhas: await contar(
        `select count(*)::text as n from public.agendamentos where data = '${dJ}'::date and profissional = '${prof1}'`,
      ),
    }, { sucessos: 1, conflitos: 1, linhas: 1 })

    // ---- H: remarcações concorrentes para o mesmo slot novo -----------------
    await limpar()
    const dH1 = data(8)
    const dH2 = data(9)
    await sql(criar('H1', '11900099071', servico, prof1, dH1, '15:00'))
    await sql(criar('H2', '11900099072', servico, prof1, dH1, somarMinutos('15:00', duracao)))
    const ids = String(
      await primeiroValor(
        `select string_agg(telefone || '|' || id, ' ;; ' order by cliente) as x from public.agendamentos where observacao = '${MARCA}'`,
        'x',
      ),
    ).split(' ;; ')
    const rem = (par) => {
      const [telefone, id] = par.split('|')
      return `select public.ia_agendamento_remarcar('${id}','${telefone}','${dH2}'::date,'17:00','${prof1}')`
    }
    const rH = await emParalelo([rem(ids[0]), rem(ids[1])])
    registrar('H', 'remarcações concorrentes para o mesmo slot novo', {
      ...somar(rH),
      linhas: await contar(
        `select count(*)::text as n from public.agendamentos where data = '${dH2}'::date and profissional = '${prof1}' and status <> 'cancelado'`,
      ),
    }, { sucessos: 1, conflitos: 1, linhas: 1 })
  } finally {
    await limpar()
    const resto = await contar(
      `select count(*)::text as n from public.agendamentos where observacao = '${MARCA}'`,
    )
    console.log(`\nLimpeza: ${resto === 0 ? 'sem resíduo' : `ATENÇÃO — restaram ${resto} linhas`}`)
  }

  const falhas = resultados.filter((r) => r.veredito === 'FALHA')
  console.log('\n================ RESUMO ================')
  for (const r of resultados) {
    console.log(`${r.cenario}  ${r.descricao.padEnd(52)} ${r.veredito}`)
  }
  if (falhas.length > 0) {
    console.log(`\nFALHAS: ${falhas.length}`)
    process.exit(1)
  }
  console.log('\nTODOS OS CENÁRIOS DE CONCORRÊNCIA PASSARAM')
}

main().catch((erro) => {
  console.error('Falha ao rodar o teste:', erro.message)
  process.exit(1)
})