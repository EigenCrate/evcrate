import { createRoot } from 'react-dom/client';
import { App } from '../../viewer/src/app.js';
import { DamHopperPortProvider } from '../../viewer/src/providers/dam-hopper-port-provider.ts';
import '../../viewer/src/styles.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const provider = new DamHopperPortProvider(true);
  const root = createRoot(rootElement);
  root.render(<App provider={provider} />);
}
