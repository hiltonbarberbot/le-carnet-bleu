'use client'

import dynamic from 'next/dynamic'

const GameRoot = dynamic(
  () => import('../../ui/root').then(module => module.Root),
  { ssr: false },
)

export function GameShell({ studio }: { studio: boolean }) {
  return <GameRoot studio={studio} />
}
