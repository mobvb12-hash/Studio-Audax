// Catálogo inicial — vira cadastro real nos módulos Serviços/Profissionais
export const SERVICOS = [
  { nome: 'Corte Degradê', preco: 70, duracaoMin: 40 },
  { nome: 'Corte + Barba', preco: 110, duracaoMin: 70 },
  { nome: 'Barba', preco: 50, duracaoMin: 30 },
  { nome: 'Corte Infantil', preco: 60, duracaoMin: 35 },
  { nome: 'Platinado / Luzes', preco: 180, duracaoMin: 120 },
  { nome: 'Sobrancelha', preco: 25, duracaoMin: 15 },
]

export const PROFISSIONAIS = ['Audax', 'Diego']

export const HORARIOS = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
]

export function hojeISO(): string {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function somarDias(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const base = new Date(ano, mes - 1, dia)
  base.setDate(base.getDate() + dias)
  const a = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${a}-${m}-${d}`
}

export function formatarDataLonga(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const texto = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
