import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './style.css'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
