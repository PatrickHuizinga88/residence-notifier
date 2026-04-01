const APIFY_BASE_URL = 'https://api.apify.com/v2'

interface ApifyRunResult {
  items: Record<string, unknown>[]
}

/**
 * Starts an Apify Actor run and waits for it to complete.
 * Returns the dataset items.
 */
export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apiToken: string,
): Promise<Record<string, unknown>[]> {
  // Start the actor run and wait for it to finish (synchronous run)
  const runUrl = `${APIFY_BASE_URL}/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`

  const response = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Apify actor ${actorId} failed (${response.status}): ${errorText}`)
  }

  const items = await response.json() as Record<string, unknown>[]
  return items
}
