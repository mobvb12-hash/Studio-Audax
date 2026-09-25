// Profissionais — tipos (sem backend: estado local + localStorage)
export type Profissional = {
  id: string
  nome: string
  criadoEm: string
}

export type NovoProfissionalInput = {
  nome: string
}
