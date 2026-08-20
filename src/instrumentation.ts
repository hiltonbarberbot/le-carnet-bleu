/** Start the durable local Workflow worker when Next boots in the Node runtime. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return

  const { getWorld } = await import('workflow/runtime')
  await getWorld().start?.()
}
