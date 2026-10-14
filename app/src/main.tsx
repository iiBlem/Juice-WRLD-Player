import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './styles/theme.css';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

if (import.meta.hot) {
  import.meta.hot.accept('./App', updated => {
    if (updated) root.render(<updated.default />);
  });
}
