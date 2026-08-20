import { GameShell } from './_components/game-shell'

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams
  return <GameShell studio={query.studio !== undefined} />
}
