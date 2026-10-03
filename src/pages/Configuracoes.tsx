// Configurações do sistema — tela única de onde saem links, avaliação,
// chaves de notificação, benefícios do Clube e parâmetros da IA.
//
// Item 22 do pedido: a configuração para de estar espalhada pelo código e
// passa a ter UM lugar. Esta tela é a interface dessa fonte única — o
// servidor, os triggers e a IA leem exatamente os mesmos valores.
//
// Duas promessas que a tela deixa visíveis:
//   • desligar uma notificação NÃO impede agendamento (só o envio);
//   • benefício e link de avaliação só existem depois de configurados aqui.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CAMPO_FORM,
  ROTULO_FORM,
} from '@/lib/apresentacao'
import {
  carregarConfiguracoes,
  salvarConfiguracao,
} from '@/services/supabase/configuracoes'
import {
  CHAVES_CONFIG,
  CONFIG_PADRAO,
  DESCRICAO_CHAVE,
  problemaNaConfig,
  ROTULO_CHAVE,
  valorDaChave,
  type ChaveConfig,
  type Configuracoes,
} from '@/modules/configuracoes/types'

function Botao({
  children,
  onClick,
  desabilitado,
  secundario,
}: {
  children: React.ReactNode
  onClick: () => void
  desabilitado?: boolean
  secundario?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      className={
        secundario
          ? 'rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA] disabled:opacity-50'
          : 'rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F] disabled:opacity-50'
      }
    >
      {children}
    </button>
  )
}

function Caixa({
  titulo,
  descricao,
  children,
  aoSalvar,
  salvando,
  erro,
  aviso,
}: {
  titulo: string
  descricao: string
  children: React.ReactNode
  aoSalvar: () => void
  salvando: boolean
  erro: string | null
  aviso: string | null
}) {
  return (
    <section className="rounded-xl border border-[#E5DCC3] bg-white p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#1C1A15]">{titulo}</h2>
          <p className="mt-0.5 max-w-xl text-[13px] text-[#6B6353]">{descricao}</p>
        </div>
        <Botao onClick={aoSalvar} desabilitado={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </header>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{erro}</p>
      )}
      {aviso && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {aviso}
        </p>
      )}
    </section>
  )
}

function Campo({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className={ROTULO_FORM}>{rotulo}</label>
      {children}
    </div>
  )
}

export default function Configuracoes() {
  const [dados, setDados] = useState<Configuracoes>(CONFIG_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<ChaveConfig | null>(null)
  const [erro, setErro] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<Record<string, string>>({})
  const [doBanco, setDoBanco] = useState(false)

  /**
   * Recarga manual (usada pelo botão "recarregar"). Dentro do efeito a
   * carga usa `carregarConfiguracoes` direto, para que o setState fique só
   * no callback assíncrono — padrão do projeto, sem setState síncrono no
   * corpo do efeito.
   */
  const recarregar = useCallback(async () => {
    setCarregando(true)
    const resultado = await carregarConfiguracoes()
    setDados(resultado.dados)
    setDoBanco(resultado.doBanco)
    if (resultado.erro) setAviso((atual) => ({ ...atual, geral: resultado.erro as string }))
    setCarregando(false)
  }, [])

  useEffect(() => {
    let vivo = true
    void carregarConfiguracoes().then((resultado) => {
      if (!vivo) return
      setDados(resultado.dados)
      setDoBanco(resultado.doBanco)
      if (resultado.erro) setAviso((atual) => ({ ...atual, geral: resultado.erro as string }))
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [])

  const salvar = useCallback(
    async (chave: ChaveConfig) => {
      setSalvando(chave)
      setErro((atual) => ({ ...atual, [chave]: '' }))
      setAviso((atual) => ({ ...atual, [chave]: '' }))
      const problema = problemaNaConfig(chave, valorDaChave(chave, dados))
      if (problema) {
        setErro((atual) => ({ ...atual, [chave]: problema }))
        setSalvando(null)
        return
      }
      const motivo = await salvarConfiguracao(chave, valorDaChave(chave, dados))
      if (motivo) {
        setErro((atual) => ({ ...atual, [chave]: motivo }))
      } else {
        setAviso((atual) => ({ ...atual, [chave]: 'Configuração salva.' }))
      }
      setSalvando(null)
    },
    [dados],
  )

  const definirLinks = (campo: 'painel' | 'avaliacao', valor: string) =>
    setDados((atual) => ({ ...atual, links: { ...atual.links, [campo]: valor } }))
  const definirAvaliacao = (campo: 'ativa' | 'link' | 'mensagem', valor: string | boolean) =>
    setDados((atual) => ({
      ...atual,
      avaliacao: { ...atual.avaliacao, [campo]: valor } as typeof atual.avaliacao,
    }))
  const definirNotificacao = (campo: keyof Configuracoes['notificacoes'], valor: boolean) =>
    setDados((atual) => ({
      ...atual,
      notificacoes: { ...atual.notificacoes, [campo]: valor },
    }))
  const definirIa = <K extends keyof Configuracoes['ia']>(campo: K, valor: Configuracoes['ia'][K]) =>
    setDados((atual) => ({ ...atual, ia: { ...atual.ia, [campo]: valor } }))
  const definirBarbearia = <K extends keyof Configuracoes['barbearia']>(
    campo: K,
    valor: Configuracoes['barbearia'][K],
  ) =>
    setDados((atual) => ({
      ...atual,
      barbearia: { ...atual.barbearia, [campo]: valor },
    }))

  const listaPlanos = useMemo(() => Object.keys(dados.clube.beneficios), [dados.clube.beneficios])

  if (carregando) {
    return (
      <div className="flex h-64 items-center justify-center text-[#8A8171]">
        Carregando configurações…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[#1C1A15]">Configurações</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#6B6353]">
          Uma fonte única para links, avaliação, avisos automáticos e o comportamento
          da IA do WhatsApp. O servidor, a agenda e a IA leem estes mesmos valores.
        </p>
        {!doBanco && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            Sem Supabase conectado: exibindo os valores padrão e nada é gravado.
          </p>
        )}
      </header>

      <div className="flex justify-end">
        <Botao secundario onClick={() => void recarregar()} desabilitado={carregando}>
          Recarregar do servidor
        </Botao>
      </div>

      <Caixa
        titulo={ROTULO_CHAVE.links}
        descricao={DESCRICAO_CHAVE.links}
        aoSalvar={() => void salvar('links')}
        salvando={salvando === 'links'}
        erro={erro.links || null}
        aviso={aviso.links || null}
      >
        <Campo rotulo="Painel do cliente">
          <input
            className={CAMPO_FORM}
            placeholder="https://.../painel"
            value={dados.links.painel}
            onChange={(e) => definirLinks('painel', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Avaliação (mesma chave de avaliacao.link)">
          <input
            className={CAMPO_FORM}
            placeholder="https://..."
            value={dados.links.avaliacao}
            onChange={(e) => definirLinks('avaliacao', e.target.value)}
          />
        </Campo>
      </Caixa>

      <Caixa
        titulo={ROTULO_CHAVE.barbearia}
        descricao={DESCRICAO_CHAVE.barbearia}
        aoSalvar={() => void salvar('barbearia')}
        salvando={salvando === 'barbearia'}
        erro={erro.barbearia || null}
        aviso={aviso.barbearia || null}
      >
        <Campo rotulo="Endereço">
          <input
            className={CAMPO_FORM}
            placeholder="Rua, número - bairro - cidade/UF"
            value={dados.barbearia.endereco}
            onChange={(e) => definirBarbearia('endereco', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Telefone / WhatsApp">
          <input
            className={CAMPO_FORM}
            placeholder="(81) 90000-0000"
            value={dados.barbearia.telefone}
            onChange={(e) => definirBarbearia('telefone', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Instagram">
          <input
            className={CAMPO_FORM}
            placeholder="@perfil"
            value={dados.barbearia.instagram}
            onChange={(e) => definirBarbearia('instagram', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Link do mapa (opcional)">
          <input
            className={CAMPO_FORM}
            placeholder="Sem isso, o botão usa o endereço acima"
            value={dados.barbearia.mapa}
            onChange={(e) => definirBarbearia('mapa', e.target.value)}
          />
        </Campo>
        <p className="text-xs text-[#8A8171]">
          O telefone é o botão de WhatsApp da página pública e a resposta da IA.
          Enquanto estiver vazio, nenhum dos dois mostra número — o sistema não
          inventa telefone. O mapa, se vazio, é montado a partir do endereço.
        </p>
      </Caixa>

      <Caixa
        titulo={ROTULO_CHAVE.avaliacao}
        descricao={DESCRICAO_CHAVE.avaliacao}
        aoSalvar={() => void salvar('avaliacao')}
        salvando={salvando === 'avaliacao'}
        erro={erro.avaliacao || null}
        aviso={aviso.avaliacao || null}
      >
        <Campo rotulo="Enviar avaliação (ativa/desativa)">
          <select
            className={CAMPO_FORM}
            value={dados.avaliacao.ativa ? 'sim' : 'nao'}
            onChange={(e) => definirAvaliacao('ativa', e.target.value === 'sim')}
          >
            <option value="nao">Não enviar</option>
            <option value="sim">Enviar</option>
          </select>
        </Campo>
        <Campo rotulo="Link da avaliação">
          <input
            className={CAMPO_FORM}
            placeholder="https://..."
            value={dados.avaliacao.link}
            onChange={(e) => definirAvaliacao('link', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Mensagem personalizada (opcional)">
          <input
            className={CAMPO_FORM}
            placeholder="Deixe vazio para usar o texto padrão"
            value={dados.avaliacao.mensagem}
            onChange={(e) => definirAvaliacao('mensagem', e.target.value)}
          />
        </Campo>
        {dados.avaliacao.ativa && !dados.avaliacao.link && !dados.links.avaliacao && (
          <p className="sm:col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            Sem link configurado, a IA não envia avaliação — por segurança ela não
            inventa endereço.
          </p>
        )}
      </Caixa>

      <Caixa
        titulo={ROTULO_CHAVE.notificacoes}
        descricao={DESCRICAO_CHAVE.notificacoes}
        aoSalvar={() => void salvar('notificacoes')}
        salvando={salvando === 'notificacoes'}
        erro={erro.notificacoes || null}
        aviso={aviso.notificacoes || null}
      >
        {(
          [
            ['profissionalAgendamento', 'Avisar o profissional de novo agendamento'],
            ['confirmacaoCliente', 'Confirmar ao cliente (agendamento feito pelo painel)'],
            ['posAtendimento', 'Agradecer depois do atendimento concluído'],
            ['avaliacao', 'Enviar link de avaliação depois do atendimento'],
          ] as const
        ).map(([chave, rotulo]) => (
          <label key={chave} className="flex items-center gap-2 text-[13px] text-[#4A4436]">
            <input
              type="checkbox"
              checked={dados.notificacoes[chave]}
              onChange={(e) => definirNotificacao(chave, e.target.checked)}
            />
            {rotulo}
          </label>
        ))}
        <p className="sm:col-span-2 text-xs text-[#8A8171]">
          O número do profissional é configurado na tela Profissionais, em cada
          ficha. Sem número configurado, o agendamento continua normalmente.
        </p>
      </Caixa>

      <Caixa
        titulo={ROTULO_CHAVE.clube}
        descricao={DESCRICAO_CHAVE.clube}
        aoSalvar={() => void salvar('clube')}
        salvando={salvando === 'clube'}
        erro={erro.clube || null}
        aviso={aviso.clube || null}
      >
        {listaPlanos.length ? (
          listaPlanos.map((plano) => (
            <Campo key={plano} rotulo={`Benefícios do plano ${plano}`}>
              <textarea
                className={`${CAMPO_FORM} min-h-24`}
                placeholder="Um benefício por linha"
                value={(dados.clube.beneficios[plano] ?? []).join('\n')}
                onChange={(e) =>
                  setDados((atual) => ({
                    ...atual,
                    clube: {
                      ...atual.clube,
                      beneficios: {
                        ...atual.clube.beneficios,
                        [plano]: e.target.value
                          .split('\n')
                          .map((linha) => linha.trim())
                          .filter(Boolean)
                          .slice(0, 10),
                      },
                    },
                  }))
                }
              />
            </Campo>
          ))
        ) : (
          <p className="text-[13px] text-[#6B6353]">
            Nenhum plano cadastrado em benefícios — a IA não vai informar benefício
            algum.
          </p>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {['cabelo', 'barba', 'cabelo_barba'].map((plano) => (
            <Botao
              key={plano}
              secundario
              onClick={() =>
                setDados((atual) => ({
                  ...atual,
                  clube: {
                    ...atual.clube,
                    beneficios: {
                      ...atual.clube.beneficios,
                      [plano]: atual.clube.beneficios[plano] ?? [],
                    },
                  },
                }))
              }
            >
              + {plano}
            </Botao>
          ))}
        </div>
      </Caixa>

      <Caixa
        titulo={ROTULO_CHAVE.ia}
        descricao={DESCRICAO_CHAVE.ia}
        aoSalvar={() => void salvar('ia')}
        salvando={salvando === 'ia'}
        erro={erro.ia || null}
        aviso={aviso.ia || null}
      >
        <Campo rotulo="Nome da atendente">
          <input
            className={CAMPO_FORM}
            value={dados.ia.nomeAtendente}
            onChange={(e) => definirIa('nomeAtendente', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Máximo de complementos sugeridos (0 a 3)">
          <input
            type="number"
            min={0}
            max={3}
            className={CAMPO_FORM}
            value={dados.ia.maxSugestoes}
            onChange={(e) => definirIa('maxSugestoes', Number(e.target.value))}
          />
        </Campo>
        <label className="flex items-center gap-2 text-[13px] text-[#4A4436] sm:col-span-2">
          <input
            type="checkbox"
            checked={dados.ia.botoesInterativos}
            onChange={(e) => definirIa('botoesInterativos', e.target.checked)}
          />
          Oferecer botões interativos de horário no WhatsApp (quando o provedor
          suportar; senão a lista numerada continua funcionando)
        </label>
      </Caixa>

      <p className="pb-4 text-xs text-[#8A8171]">
        Chaves disponíveis: {CHAVES_CONFIG.join(', ')}. Toda alteração é validada
        novamente pelo servidor antes de gravar.
      </p>
    </div>
  )
}
