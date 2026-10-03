// ============================================================================
// Agendamento público — a porta de entrada do Studio Audax.
//
// Esta página é a ROTA, não o fluxo. O fluxo passo a passo vive em
// `@/modules/agendamento/FluxoAgendamento`; aqui mora apenas o comentário que
// explica por que a rota existe e o que ela NÃO faz.
//
// Mesma fonte de dados da Agenda interna (NUNCA uma segunda agenda):
//   • com Supabase: as funções SECURITY DEFINER das migrations 012/027/036 —
//     catálogo (com foto do profissional, complementos e destaques da casa),
//     ocupação do dia e criação, que revalida tudo no servidor;
//   • sem Supabase: localStorage da própria Agenda + as MESMAS regras de
//     `horariosLivresPorProfissional` (expediente → almoço → bloqueio → conflito).
//
// Privacidade: só nome/preço/duração dos serviços, nome e foto dos
// profissionais, os destaques escolhidos pelo dono e os dados públicos da casa.
// Nenhum telefone, e-mail ou nome de cliente.
// ============================================================================
import FluxoAgendamento from '@/modules/agendamento/FluxoAgendamento'

export default function AgendarPublico() {
  return <FluxoAgendamento />
}
