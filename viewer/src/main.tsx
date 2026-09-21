import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { StandalonePickerProvider } from './providers/standalone-picker-provider.ts';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App provider={new StandalonePickerProvider()} />);
}
