import { createClient } from '@supabase/supabase-js'
import { runScraper } from '../scraper'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // This endpoint should only be called by cron jobs or admin
  // In production, add proper authentication (e.g., secret header)
  const authHeader = getHeader(event, 'authorization')
  const expectedToken = process.env.SCRAPE_API_SECRET

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!,
  )

  const results = await runScraper(supabase)

  return {
    success: true,
    results,
    timestamp: new Date().toISOString(),
  }
})
