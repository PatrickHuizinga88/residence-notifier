import { createClient } from "@supabase/supabase-js";
import { runScraper } from "../scraper";

export default defineEventHandler(async () => {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    throw createError({ statusCode: 500, message: "APIFY_API_TOKEN is not configured" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY!,
  );

  const results = await runScraper(supabase, apifyToken);

  return {
    success: true,
    results,
    timestamp: new Date().toISOString(),
  };
});
