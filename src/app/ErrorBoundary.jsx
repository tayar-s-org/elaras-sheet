import React from 'react';
import { isChunkLoadError } from './chunkLoadError.js';

// Evita a tela em branco quando uma parte do app falha (ex.: o site foi republicado e o arquivo da aba aberta nao existe mais).
// Depois de uma falha de carregamento o React guarda o erro do import: so recarregar a pagina resolve.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const needsReload = isChunkLoadError(error);
    return <div className={this.props.className} role="alert">
      <h2>{needsReload ? 'Não foi possível carregar esta parte do app' : 'Algo deu errado'}</h2>
      <p className="muted">{needsReload ? 'O app pode ter sido atualizado ou a conexão caiu. Recarregue a página para continuar.' : 'Tente de novo. Se continuar, recarregue a página.'}</p>
      <div className="cta-row">
        {!needsReload && <button type="button" className="primary" onClick={this.retry}>Tentar de novo</button>}
        <button type="button" className={needsReload ? 'primary' : 'outline'} onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    </div>;
  }
}
