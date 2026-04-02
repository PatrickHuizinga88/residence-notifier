import type { RawListing, ScraperAdapter } from "~~/types/listing";
import { createParariusAdapter } from "./adapters/pararius";
import { createFundaAdapter } from "./adapters/funda";
import { createHuurwoningenAdapter } from "./adapters/huurwoningen";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ScrapeResult {
  source: string;
  newListings: number;
  updatedListings: number;
  errors: string[];
}

function createAdapters(apifyToken: string): ScraperAdapter[] {
  return [
    // createParariusAdapter(apifyToken),
    createFundaAdapter(apifyToken),
    createHuurwoningenAdapter(apifyToken),
  ];
}

async function upsertListings(
  supabase: SupabaseClient,
  source: string,
  listings: RawListing[],
): Promise<{ newCount: number; updatedCount: number }> {
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
        console.error(
          `[scraper] Insert failed for "${listing.title}":`,
          error.message,
          error.details,
        );
      } else {
        newCount++;
      }
    }
  }

  return { newCount, updatedCount };
}

export async function runScraper(
  supabase: SupabaseClient,
  apifyToken: string,
): Promise<ScrapeResult[]> {
  const adapters = createAdapters(apifyToken);
  const results: ScrapeResult[] = [];

  for (const adapter of adapters) {
    const source = adapter.getSourceId();
    const errors: string[] = [];

    // Log scrape start
    const { data: logEntry } = await supabase
      .from("scrape_logs")
      .insert({ source, status: "running" })
      .select("id")
      .single();

    try {
      const isHealthy = await adapter.healthCheck();
      if (!isHealthy) {
        throw new Error(`${source} health check failed — is APIFY_API_TOKEN set?`);
      }

      const rawListings = await adapter.fetchListings();
      const { newCount, updatedCount } = await upsertListings(supabase, source, rawListings);

      if (logEntry) {
        await supabase
          .from("scrape_logs")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
            listings_new: newCount,
            listings_updated: updatedCount,
          })
          .eq("id", logEntry.id);
      }

      results.push({
        source,
        newListings: newCount,
        updatedListings: updatedCount,
        errors,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      if (logEntry) {
        await supabase
          .from("scrape_logs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            errors: [errorMessage],
          })
          .eq("id", logEntry.id);
      }

      results.push({
        source,
        newListings: 0,
        updatedListings: 0,
        errors,
      });
    }
  }

  return results;
}
