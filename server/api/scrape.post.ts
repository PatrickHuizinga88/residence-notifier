import { createClient } from "@supabase/supabase-js";
import { createFundaAdapter } from "../scraper/adapters/funda";
import { createHuurwoningenAdapter } from "../scraper/adapters/huurwoningen";

export default defineEventHandler(async (event) => {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    throw createError({ statusCode: 500, message: "APIFY_API_TOKEN is not configured" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY!,
  );

  // Determine webhook URL from request
  const requestUrl = getRequestURL(event);
  const webhookUrl = `${requestUrl.origin}/api/scrape-webhook`;

  const adapters = [
    createFundaAdapter(apifyToken),
    createHuurwoningenAdapter(apifyToken),
  ];

  const runs: { source: string; runId: string; datasetId: string }[] = [];

  for (const adapter of adapters) {
    const source = adapter.getSourceId();

    try {
      const isHealthy = await adapter.healthCheck();
      if (!isHealthy) {
        console.error(`[scrape] ${source} health check failed`);
        continue;
      }

      const { runId, datasetId } = await adapter.startAsync(webhookUrl);
      console.log(`[scrape] ${source} started: runId=${runId}`);

      // Log scrape start
      await supabase
        .from("scrape_logs")
        .insert({
          source,
          status: "running",
          errors: [`runId:${runId}`, `datasetId:${datasetId}`],
        });

      runs.push({ source, runId, datasetId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[scrape] ${source} failed to start:`, msg);

      await supabase
        .from("scrape_logs")
        .insert({ source, status: "failed", errors: [msg], finished_at: new Date().toISOString() });
    }
  }

  return {
    success: true,
    message: `Started ${runs.length} scraper(s) async. Results will be processed via webhook.`,
    runs,
    timestamp: new Date().toISOString(),
  };
});
