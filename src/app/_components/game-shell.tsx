'use client'

import dynamic from 'next/dynamic'

const GameRoot = dynamic(
  () => import('../../ui/root').then(module => module.Root),
  { ssr: false },
)

export function GameShell({ issuePreview = false }: { issuePreview?: boolean }) {
  return <GameRoot issuePreview={issuePreview} />
}
