import { createRoot } from 'react-dom/client';
import App from './App';
import AuthGate from './components/Auth/AuthGate';
import './styles.css';
createRoot(document.getElementById('root')!).render(<AuthGate><App /></AuthGate>);
