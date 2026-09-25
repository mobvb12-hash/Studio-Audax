// Profissionais — tipos (sem backend: estado local + localStorage)
export type Profissional = {
  id: string
  nome: string
  telefone: string
  email: string
  /** Foto em data URL (JPEG compactado) ou string vazia */
  foto: string
  criadoEm: string
}

export type NovoProfissionalInput = {
  nome: string
  telefone: string
  email: string
  foto: string
}
