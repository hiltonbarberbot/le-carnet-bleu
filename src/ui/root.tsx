'use client'

import { lazy, Suspense, useEffect } from 'react'
import { productNaming } from '../product/naming'
import { App } from './App'

const IssuePreview = lazy(() => import('./issue/la-colombe').then(module => ({ default: module.LaColombeIssue })))

export function Root({ issuePreview = false }: { issuePreview?: boolean } = {}) {
  useEffect(() => {
    if (!issuePreview) document.title = productNaming.documentTitle
  }, [issuePreview])

  if (issuePreview) {
    return <Suspense fallback={null}><IssuePreview /></Suspense>
  }
  return <App />
}
