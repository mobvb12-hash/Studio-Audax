import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { erro: Error | null }

/**
 * Barreira de render: um erro inesperado mostra este painel em vez de
 * deixar a tela em branco (sem barreira, o React desmonta a árvore inteira
 * e o #root fica vazio). Usada na raiz (main.tsx) e por página (App.tsx).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro não capturado na interface:', erro, info.componentStack)
  }

  private tentarDeNovo = () => {
    this.setState({ erro: null })
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 text-center shadow-sm">
            <h1 className="text-lg font-bold text-[#1C1A15]">
              Algo deu errado
            </h1>
            <p className="mt-2 text-sm text-[#4A4436]">
              A tela encontrou um erro inesperado. Seus dados locais continuam
              salvos — tente novamente ou recarregue a página.
            </p>
            <p className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {this.state.erro.message}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={this.tentarDeNovo}
                className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
              >
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
