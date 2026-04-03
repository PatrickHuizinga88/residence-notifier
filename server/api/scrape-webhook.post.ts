import { createClient } from "@supabase/supabase-js";
import { getApifyDatasetItems } from "../utils/apify";
import { createFundaAdapter } from "../scraper/adapters/funda";
import { createHuurwoningenAdapter } from "../scraper/adapters/huurwoningen";
import { scrapeFilters } from "../scraper/config";
import type { RawListing, ScraperAdapter } from "~~/types/listing";

async function upsertListings(
  supabase: ReturnType<typeof createClient>,
  source: string,
  listings: RawListing[],
) {
  let newCount = 0;
  let updatedCount = 0;

  for (const listing of listings) {
    const { data: existing } = await supabase
      .from("listings")
      .select("id")
      .eq("source", source)
      .eq("source_listing_id", listing.source_listing_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("listings")
        .update({
          title: listing.title,
          description: listing.description,
          price_monthly: listing.price_monthly,
          city: listing.city,
          neighborhood: listing.neighborhood,
          postal_code: listing.postal_code,
          address: listing.address,
          surface_m2: listing.surface_m2,
          rooms: listing.rooms,
          bedrooms: listing.bedrooms,
          property_type: listing.property_type,
          furnished: listing.furnished,
          images: listing.images,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      updatedCount++;
    } else {
      const { error } = await supabase.from("listings").insert({
        source,
        source_url: listing.source_url,
        source_listing_id: listing.source_listing_id,
        title: listing.title,
        description: listing.description,
        price_monthly: listing.price_monthly,
        city: listing.city,
        neighborhood: listing.neighborhood,
        postal_code: listing.postal_code,
        address: listing.address,
        latitude: listing.latitude,
        longitude: listing.longitude,
        surface_m2: listing.surface_m2,
        rooms: listing.rooms,
        bedrooms: listing.bedrooms,
        property_type: listing.property_type,
        furnished: listing.furnished || null,
        available_from: listing.available_from,
        energy_label: listing.energy_label,
        images: listing.images,
        landlord_type: listing.landlord_type || null,
        pets_allowed: listing.pets_allowed,
        income_requirement: listing.income_requirement,
        status: "active",
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });

      if (error) {
        console.error(`[webhook] Insert failed for "${listing.title}":`, error.message, error.details);
      } else {
        newCount++;
      }
    }
  }

  return { newCount, updatedCount };
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  // Apify webhook payload
  const { resource } = body || {};
  if (!resource) {
    throw createError({ statusCode: 400, message: "Invalid webhook payload" });
  }

  const { actId, defaultDatasetId, id: runId, status } = resource;
  console.log(`[webhook] Received: actId=${actId}, runId=${runId}, status=${status}`);

  if (status !== "SUCCEEDED") {
    console.log(`[webhook] Run ${runId} did not succeed (status: ${status}), skipping`);
    return { success: false, reason: `Run status: ${status}` };
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    throw createError({ statusCode: 500, message: "APIFY_API_TOKEN not configured" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY!,
  );

  // Determine which adapter based on actId
  const adapters: Record<string, ScraperAdapter> = {
    "easyapi~funda-nl-scraper": createFundaAdapter(apifyToken),
    "apify~puppeteer-scraper": createHuurwoningenAdapter(apifyToken),
  };

  // actId from Apify is in format "username/actor-name" or the full ID
  // Match by checking if the actId contains the adapter key
  let adapter: ScraperAdapter | undefined;
  for (const [key, val] of Object.entries(adapters)) {
    if (actId?.includes(key.replace("~", "/")) || actId?.includes(key)) {
      adapter = val;
      break;
    }
  }

  if (!adapter) {
    console.log(`[webhook] Unknown actId: ${actId}, trying to match by scrape_logs`);
    // Fallback: check scrape_logs for this runId
    const { data: logEntry } = await supabase
      .from("scrape_logs")
      .select("source")
      .filter("errors", "cs", `{runId:${runId}}`)
      .eq("status", "running")
      .maybeSingle();

    if (logEntry?.source === "funda") {
      adapter = adapters["easyapi~funda-nl-scraper"];
    } else if (logEntry?.source === "huurwoningen") {
      adapter = adapters["apify~puppeteer-scraper"];
    }
  }

  if (!adapter) {
    console.error(`[webhook] Could not determine adapter for actId=${actId}, runId=${runId}`);
    return { success: false, reason: "Unknown actor" };
  }

  const source = adapter.getSourceId();
  console.log(`[webhook] Processing ${source} results from dataset ${defaultDatasetId}`);

  // Fetch dataset items
  const items = await getApifyDatasetItems(defaultDatasetId, apifyToken);
  console.log(`[webhook] Fetched ${items.length} items from dataset`);

  // Normalize
  const rawListings = adapter.normalizeResults(items);

  // Apply filters
  const filtered = scrapeFilters.minSurface
    ? rawListings.filter(l => !l.surface_m2 || l.surface_m2 >= scrapeFilters.minSurface)
    : rawListings;

  // Upsert
  const { newCount, updatedCount } = await upsertListings(supabase, source, filtered);
  console.log(`[webhook] ${source}: ${newCount} new, ${updatedCount} updated`);

  // Update scrape log
  await supabase
    .from("scrape_logs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      listings_new: newCount,
      listings_updated: updatedCount,
    })
    .filter("errors", "cs", `{runId:${runId}}`)
    .eq("status", "running");

  return {
    success: true,
    source,
    newListings: newCount,
    updatedListings: updatedCount,
  };
});
