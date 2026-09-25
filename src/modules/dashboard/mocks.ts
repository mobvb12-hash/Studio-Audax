import type { DadosDashboard, PeriodoDashboard } from './types'

export const PERIODOS: { id: PeriodoDashboard; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'semana', rotulo: 'Semana' },
  { id: 'mes', rotulo: 'Mês' },
]

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const DADOS_MOCK: Record<PeriodoDashboard, DadosDashboard> = {
  hoje: {
    kpis: [
      {
        id: 'faturamento',
        rotulo: 'Faturamento',
        valor: formatarBRL(1240),
        variacao: '+12% vs. ontem',
        variacaoPositiva: true,
        descricao: 'Serviços concluídos e pagos',
      },
      {
        id: 'agendamentos',
        rotulo: 'Agendamentos',
        valor: '14',
        variacao: '+3 vs. ontem',
        variacaoPositiva: true,
        descricao: 'Confirmados + pendentes',
      },
      {
        id: 'ticket',
        rotulo: 'Ticket médio',
        valor: formatarBRL(88.57),
        variacao: '+5% vs. ontem',
        variacaoPositiva: true,
        descricao: 'Valor médio por atendimento',
      },
      {
        id: 'ocupacao',
        rotulo: 'Ocupação',
        valor: '78%',
        variacao: '6 de 8 cadeiras',
        variacaoPositiva: true,
        descricao: 'Capacidade ocupada hoje',
      },
    ],
    proximosAgendamentos: [
      {
        id: '1',
        cliente: 'Lucas Mendes',
        servico: 'Corte + Barba',
        profissional: 'Audax',
        horario: '14:00',
        status: 'confirmado',
      },
      {
        id: '2',
        cliente: 'Rafael Souza',
        servico: 'Corte Degradê',
        profissional: 'Diego',
        horario: '14:30',
        status: 'confirmado',
      },
      {
        id: '3',
        cliente: 'Thiago Lima',
        servico: 'Barba + Sobrancelha',
        profissional: 'Audax',
        horario: '15:00',
        status: 'pendente',
      },
      {
        id: '4',
        cliente: 'Bruno Alves',
        servico: 'Corte Infantil',
        profissional: 'Diego',
        horario: '15:30',
        status: 'confirmado',
      },
      {
        id: '5',
        cliente: 'Paulo Henrique',
        servico: 'Platinado',
        profissional: 'Audax',
        horario: '16:00',
        status: 'pendente',
      },
    ],
    topServicos: [
      { nome: 'Corte Degradê', quantidade: 6, faturamento: 420 },
      { nome: 'Corte + Barba', quantidade: 4, faturamento: 440 },
      { nome: 'Barba', quantidade: 3, faturamento: 150 },
    ],
    ocupacaoPercentual: 78,
    metaMensal: 30000,
    faturamentoAtual: 18450,
  },
  semana: {
    kpis: [
      {
        id: 'faturamento',
        rotulo: 'Faturamento',
        valor: formatarBRL(7850),
        variacao: '+8% vs. semana anterior',
        variacaoPositiva: true,
        descricao: 'Total da semana',
      },
      {
        id: 'agendamentos',
        rotulo: 'Agendamentos',
        valor: '86',
        variacao: '+11 vs. anterior',
        variacaoPositiva: true,
        descricao: 'Todos os status',
      },
      {
        id: 'ticket',
        rotulo: 'Ticket médio',
        valor: formatarBRL(91.28),
        variacao: '+2% vs. anterior',
        variacaoPositiva: true,
        descricao: 'Valor médio por atendimento',
      },
      {
        id: 'ocupacao',
        rotulo: 'Ocupação',
        valor: '72%',
        variacao: 'Média estável',
        variacaoPositiva: true,
        descricao: 'Média da semana',
      },
    ],
    proximosAgendamentos: [
      {
        id: '1',
        cliente: 'Lucas Mendes',
        servico: 'Corte + Barba',
        profissional: 'Audax',
        horario: 'Hoje 14:00',
        status: 'confirmado',
      },
      {
        id: '2',
        cliente: 'João Pedro',
        servico: 'Corte Degradê',
        profissional: 'Diego',
        horario: 'Amanhã 10:00',
        status: 'pendente',
      },
      {
        id: '3',
        cliente: 'Carlos Silva',
        servico: 'Barba',
        profissional: 'Audax',
        horario: 'Amanhã 11:30',
        status: 'confirmado',
      },
      {
        id: '4',
        cliente: 'Felipe Rocha',
        servico: 'Corte + Luzes',
        profissional: 'Diego',
        horario: 'Sex 09:00',
        status: 'pendente',
      },
    ],
    topServicos: [
      { nome: 'Corte Degradê', quantidade: 34, faturamento: 2380 },
      { nome: 'Corte + Barba', quantidade: 22, faturamento: 2420 },
      { nome: 'Barba', quantidade: 18, faturamento: 900 },
    ],
    ocupacaoPercentual: 72,
    metaMensal: 30000,
    faturamentoAtual: 18450,
  },
  mes: {
    kpis: [
      {
        id: 'faturamento',
        rotulo: 'Faturamento',
        valor: formatarBRL(18450),
        variacao: '+15% vs. mês anterior',
        variacaoPositiva: true,
        descricao: 'Acumulado do mês',
      },
      {
        id: 'agendamentos',
        rotulo: 'Agendamentos',
        valor: '312',
        variacao: '+28 vs. anterior',
        variacaoPositiva: true,
        descricao: 'Total do mês',
      },
      {
        id: 'ticket',
        rotulo: 'Ticket médio',
        valor: formatarBRL(89.5),
        variacao: '-1% vs. anterior',
        variacaoPositiva: false,
        descricao: 'Valor médio por atendimento',
      },
      {
        id: 'ocupacao',
        rotulo: 'Ocupação',
        valor: '69%',
        variacao: 'Média estável',
        variacaoPositiva: true,
        descricao: 'Média do mês',
      },
    ],
    proximosAgendamentos: [
      {
        id: '1',
        cliente: 'Lucas Mendes',
        servico: 'Corte + Barba',
        profissional: 'Audax',
        horario: 'Hoje 14:00',
        status: 'confirmado',
      },
      {
        id: '2',
        cliente: 'Marcos Vinicius',
        servico: 'Corte Degradê',
        profissional: 'Diego',
        horario: 'Amanhã 09:30',
        status: 'confirmado',
      },
      {
        id: '3',
        cliente: 'André Santos',
        servico: 'Platinado',
        profissional: 'Audax',
        horario: 'Sáb 08:00',
        status: 'pendente',
      },
    ],
    topServicos: [
      { nome: 'Corte Degradê', quantidade: 128, faturamento: 8960 },
      { nome: 'Corte + Barba', quantidade: 84, faturamento: 9240 },
      { nome: 'Barba', quantidade: 62, faturamento: 3100 },
    ],
    ocupacaoPercentual: 69,
    metaMensal: 30000,
    faturamentoAtual: 18450,
  },
}

export function obterDadosDashboard(periodo: PeriodoDashboard): DadosDashboard {
  return DADOS_MOCK[periodo]
}

export function formatarMoeda(valor: number): string {
  return formatarBRL(valor)
}
