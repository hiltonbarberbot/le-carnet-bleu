import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './ui/App'
import './ui/style.css'
import './ui/aesthetic/classified.css'
import { productNaming } from './product/naming'

document.title = productNaming.documentTitle

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
