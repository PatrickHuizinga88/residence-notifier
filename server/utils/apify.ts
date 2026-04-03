const APIFY_BASE_URL = 'https://api.apify.com/v2'

/**
 * Starts an Apify Actor run asynchronously.
 * Returns the run ID immediately without waiting for completion.
 */
export async function startApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apiToken: string,
  webhookUrl?: string,
): Promise<{ runId: string; datasetId: string }> {
  const url = `${APIFY_BASE_URL}/acts/${actorId}/runs?token=${apiToken}`

  const webhooks = webhookUrl
    ? [{
        eventTypes: ['ACTOR.RUN.SUCCEEDED'],
        requestUrl: webhookUrl,
      }]
    : undefined

  const body: Record<string, unknown> = { ...input }

  const params = new URLSearchParams({ token: apiToken })
  if (webhooks) {
    params.set('webhooks', btoa(JSON.stringify(webhooks)))
  }

  const response = await fetch(`${APIFY_BASE_URL}/acts/${actorId}/runs?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Apify actor ${actorId} start failed (${response.status}): ${errorText}`)
  }

  const result = await response.json() as { data: { id: string; defaultDatasetId: string } }
  return {
    runId: result.data.id,
    datasetId: result.data.defaultDatasetId,
  }
}

/**
 * Fetches dataset items from a completed Apify run.
 */
export async function getApifyDatasetItems(
  datasetId: string,
  apiToken: string,
): Promise<Record<string, unknown>[]> {
  const response = await fetch(
    `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${apiToken}`,
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Apify dataset fetch failed (${response.status}): ${errorText}`)
  }

  return await response.json() as Record<string, unknown>[]
}

/**
 * Starts an Apify Actor run and waits for it to complete (synchronous).
 * Returns the dataset items. Use only for short-running actors.
 */
export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apiToken: string,
): Promise<Record<string, unknown>[]> {
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

  return await response.json() as Record<string, unknown>[]
}
