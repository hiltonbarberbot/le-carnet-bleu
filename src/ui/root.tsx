import { lazy, Suspense } from 'react'
import { LaColombeIssue } from './issue/la-colombe'

const Studio = lazy(() => import('./App').then(module => ({ default: module.App })))

export function Root() {
  if (new URLSearchParams(window.location.search).has('studio')) {
    return <Suspense fallback={null}><Studio /></Suspense>
  }
  return <LaColombeIssue />
}
