import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BridgeMissing } from './components/BridgeMissing';
import './theme/cyberpunk.css';
import './theme/themes.css';

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<StrictMode>{window.api ? <App /> : <BridgeMissing />}</StrictMode>);
}
