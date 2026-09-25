import { APP_DESCRIPTION, APP_NAME } from '@/config/app'

const PROXIMOS_MODULOS = [
  'Dashboard',
  'Agenda',
  'Clientes',
  'Serviços',
  'Profissionais',
  'Financeiro',
  'Caixa',
  'Estoque',
  'Relatórios',
  'Configurações',
]

export default function Home() {
  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_-30px_rgba(0,0,0,0.3)]">
      <div className="border-b border-black/10 bg-gradient-to-b from-white to-[#F7F6F3] px-8 py-12 text-center sm:px-12">
        <p className="mb-4 inline-block rounded-full bg-black px-4 py-1 text-[11px] font-semibold tracking-[0.25em] text-[#C6A15B] uppercase">
          Barbearia
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-[#0A0A0A] sm:text-5xl">
          {APP_NAME}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#6b7280]">
          {APP_DESCRIPTION}. Fundação do projeto criada com sucesso — pronta
          para receber os próximos módulos.
        </p>

        <div className="mx-auto mt-8 h-px w-24 bg-[#C6A15B]" aria-hidden="true" />

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <div className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white">
            Projeto funcionando
          </div>
          <div className="rounded-lg border border-black/15 bg-white px-6 py-3 text-sm font-medium text-[#0A0A0A]">
            Tailwind ativo
          </div>
        </div>
      </div>

      <div className="px-8 py-8 sm:px-12">
        <h2 className="text-sm font-semibold tracking-[0.2em] text-[#6b7280] uppercase">
          Módulos futuros (não implementados)
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {PROXIMOS_MODULOS.map((modulo) => (
            <li
              key={modulo}
              className="rounded-lg border border-black/10 bg-[#F7F6F3] px-3 py-2.5 text-center text-sm text-[#2b2b2b]"
            >
              {modulo}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-[#6b7280]">
          Esta é apenas a tela provisória de confirmação. Nenhuma regra de
          negócio, banco de dados ou integração foi criada nesta etapa.
        </p>
      </div>
    </section>
  )
}
