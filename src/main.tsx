import React from 'react'
import ReactDOM from 'react-dom/client'
import { Root } from './ui/root'
import { productNaming } from './product/naming'

document.title = new URLSearchParams(window.location.search).has('studio')
  ? productNaming.documentTitle
  : 'La Colombe'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
