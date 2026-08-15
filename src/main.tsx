import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// StrictMode fica desligado de propósito: o engine WebGL não deve ser montado duas vezes.
createRoot(document.getElementById('root')!).render(<App />)
