'use client'

import { lazy, Suspense, useEffect } from 'react'
import { productNaming } from '../product/naming'
import { LaColombeIssue } from './issue/la-colombe'

const Studio = lazy(() => import('./App').then(module => ({ default: module.App })))

export function Root({ studio }: { studio?: boolean } = {}) {
  const showStudio = studio ?? (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('studio')
  )

  useEffect(() => {
    if (showStudio) document.title = productNaming.documentTitle
  }, [showStudio])

  if (showStudio) {
    return <Suspense fallback={null}><Studio /></Suspense>
  }
  return <LaColombeIssue />
}
