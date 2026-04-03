import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ============================================================================
// Config
// ============================================================================

const scrapeFilters = {
  cities: ["eindhoven", "boxtel", "veghel"],
  minPrice: 800,
  maxPrice: 1500,
  minSurface: 25,
}

const APIFY_BASE_URL = "https://api.apify.com/v2"

// ============================================================================
// Apify helpers
// ============================================================================

async function startApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apiToken: string,
  webhookUrl: string,
): Promise<{ runId: string; datasetId: string }> {
  const webhooks = [{ eventTypes: ["ACTOR.RUN.SUCCEEDED"], requestUrl: webhookUrl }]
  const params = new URLSearchParams({
    token: apiToken,
    webhooks: btoa(JSON.stringify(webhooks)),
  })

  const response = await fetch(`${APIFY_BASE_URL}/acts/${actorId}/runs?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Apify actor ${actorId} start failed (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  return {
    runId: result.data.id,
    datasetId: result.data.defaultDatasetId,
  }
}

async function getDatasetItems(datasetId: string, apiToken: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${apiToken}`)
  if (!response.ok) throw new Error(`Dataset fetch failed: ${response.status}`)
  return await response.json()
}

// ============================================================================
// Funda normalizer
// ============================================================================

function unwrap(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function toInt(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value)
  return isNaN(n) ? undefined : Math.round(n)
}

function toFloat(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const n = Number(value)
  return isNaN(n) ? undefined : n
}

function parsePriceToCents(value: unknown): number {
  if (typeof value === "number") return Math.round(value * 100)
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".")
    return Math.round(parseFloat(cleaned) * 100) || 0
  }
  return 0
}

type PropertyType = "apartment" | "house" | "room" | "studio"
type FurnishedStatus = "furnished" | "unfurnished" | "negotiable"

function parsePropertyType(text: string): PropertyType {
  const lower = (text || "").toLowerCase()
  if (lower.includes("appartement") || lower.includes("apartment")) return "apartment"
  if (lower.includes("huis") || lower.includes("woning") || lower.includes("house")) return "house"
  if (lower.includes("kamer") || lower.includes("room")) return "room"
  if (lower.includes("studio")) return "studio"
  return "apartment"
}

function parseFurnished(text: string): FurnishedStatus | undefined {
  const lower = (text || "").toLowerCase()
  if (lower.includes("gemeubileerd") || lower.includes("furnished")) return "furnished"
  if (lower.includes("ongemeubileerd") || lower.includes("unfurnished")) return "unfurnished"
  if (lower.includes("bespreekbaar") || lower.includes("negotiable")) return "negotiable"
  return undefined
}

interface RawListing {
  source_listing_id: string
  source_url: string
  title: string
  description?: string
  price_monthly: number
  city: string
  neighborhood?: string
  postal_code?: string
  address?: string
  latitude?: number
  longitude?: number
  surface_m2?: number
  rooms?: number
  bedrooms?: number
  property_type: PropertyType
  furnished?: FurnishedStatus
  available_from?: string
  energy_label?: string
  images?: string[]
  landlord_type?: string
  pets_allowed?: boolean
  income_requirement?: number
}

function normalizeFundaItem(raw: Record<string, unknown>): RawListing | null {
  const addr = (raw.address || {}) as Record<string, unknown>
  const city = (addr.city || "") as string
  const neighborhood = (addr.neighbourhood || addr.wijk || "") as string

  const rawPrice = raw.price as Record<string, unknown> | undefined
  let price = 0
  if (rawPrice && typeof rawPrice === "object") {
    price = parsePriceToCents(unwrap(rawPrice.rent_price) || unwrap(rawPrice.amount) || unwrap(rawPrice.value))
  }

  const relativeUrl = (raw.object_detail_page_relative_url || "") as string
  const url = relativeUrl ? `https://www.funda.nl${relativeUrl}` : (raw.url || "") as string

  const streetName = (addr.street_name || "") as string
  const houseNumber = (addr.house_number || "") as string
  const houseNumberSuffix = (addr.house_number_suffix || "") as string
  const street = streetName
    ? `${streetName} ${houseNumber}${houseNumberSuffix ? " " + houseNumberSuffix : ""}`.trim()
    : ""
  const title = (raw.title || raw.name || street || `${city} woning`) as string

  if (!url || !title) return null

  const sourceListingId = String(raw.id || relativeUrl.split("/").filter(Boolean).pop() || url)
  const agents = raw.agent as Array<Record<string, unknown>> | undefined
  const photoIds = raw.photo_image_id as string[] | undefined
  const images = photoIds?.length ? photoIds.map((p) => `https://cloud.funda.nl/${p}`) : undefined

  return {
    source_listing_id: sourceListingId,
    source_url: url,
    title,
    price_monthly: price,
    city: city || "Onbekend",
    neighborhood: neighborhood || undefined,
    postal_code: (addr.postal_code || addr.postcode) as string | undefined,
    address: street || undefined,
    latitude: toFloat(addr.lat || addr.latitude),
    longitude: toFloat(addr.lng || addr.longitude),
    surface_m2: toInt(unwrap(raw.floor_area) || unwrap(raw.living_area)),
    rooms: toInt(raw.number_of_rooms),
    bedrooms: toInt(raw.number_of_bedrooms),
    property_type: parsePropertyType((raw.object_type || raw.type || "") as string),
    furnished: parseFurnished((raw.interior || "") as string),
    available_from: (raw.offered_since || raw.publish_date) as string | undefined,
    energy_label: raw.energy_label as string | undefined,
    images,
    landlord_type: agents?.length ? "agency" : undefined,
  }
}

// ============================================================================
// Huurwoningen normalizer
// ============================================================================

function normalizeHuurwoningenItem(raw: Record<string, unknown>): RawListing | null {
  const title = (raw.title || "") as string
  const price = raw.price as number
  const url = (raw.url || "") as string

  if (!title || !price || !url) return null

  let city = "Onbekend"
  try {
    const urlParts = new URL(url).pathname.split("/").filter(Boolean)
    const citySlug = urlParts.length >= 2 ? urlParts[1] : ""
    if (citySlug) {
      city = citySlug.charAt(0).toUpperCase() + citySlug.slice(1).replace(/-/g, " ")
    }
  } catch { /* ignore */ }

  return {
    source_listing_id: (raw.sourceId || "") as string,
    source_url: url,
    title,
    price_monthly: price * 100,
    city,
    surface_m2: (raw.surface as number) || undefined,
    rooms: (raw.rooms as number) || undefined,
    property_type: parsePropertyType(title),
    images: raw.image ? [raw.image as string] : undefined,
  }
}

// ============================================================================
// Adapter configs
// ============================================================================

const FUNDA_ACTOR = "easyapi~funda-nl-scraper"

const HUURWONINGEN_ACTOR = "apify~puppeteer-scraper"

const HUURWONINGEN_PAGE_FUNCTION = `
async function pageFunction(context) {
  const { page, enqueueRequest } = context;
  await page.waitForSelector('.listing-search-item--for-rent', { timeout: 15000 });

  const nextPageUrl = await page.evaluate(() => {
    const nextLink = document.querySelector('.pagination__item--next a');
    if (!nextLink) return null;
    const dataPage = nextLink.getAttribute('data-page');
    if (!dataPage) return null;
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('page', dataPage);
    return currentUrl.toString();
  });

  if (nextPageUrl) {
    await enqueueRequest({ url: nextPageUrl });
  }

  const listings = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('.listing-search-item--for-rent').forEach(el => {
      const titleEl = el.querySelector('.listing-search-item__title');
      const linkEl = titleEl?.closest('a') || el.querySelector('a');
      const href = linkEl?.getAttribute('href');
      if (!href) return;

      const title = titleEl?.textContent?.trim();
      if (!title) return;

      const priceText = el.querySelector('.listing-search-item__price-main')?.textContent?.trim() || '';
      const priceMatch = priceText.replace(/[^0-9]/g, '');
      const price = parseInt(priceMatch, 10);
      if (!price) return;

      const url = href.startsWith('http') ? href : 'https://www.huurwoningen.nl' + href;
      const sourceId = href.split('/').filter(Boolean).pop() || href;

      const surfaceText = el.querySelector('.illustrated-features__item--surface-area')?.textContent || '';
      const surfaceMatch = surfaceText.match(/(\\\\d+)\\\\s*m/);

      const roomsText = el.querySelector('.illustrated-features__item--number-of-rooms')?.textContent || '';
      const roomsMatch = roomsText.match(/(\\\\d+)/);

      const imgEl = el.querySelector('.picture__image');
      const sourceEl = el.querySelector('wc-picture source, picture source');
      let imgSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');

      if (!imgSrc && sourceEl) {
        const srcset = sourceEl.getAttribute('srcset') || '';
        const match = srcset.match(/(https?:\\\\/\\\\/[^\\\\s]+width=600[^\\\\s]*)/);
        if (match) imgSrc = match[1];
        else {
          const firstMatch = srcset.match(/(https?:\\\\/\\\\/[^\\\\s,]+)/);
          if (firstMatch) imgSrc = firstMatch[1];
        }
      }

      results.push({
        sourceId,
        url,
        title,
        price,
        surface: surfaceMatch ? parseInt(surfaceMatch[1], 10) : null,
        rooms: roomsMatch ? parseInt(roomsMatch[1], 10) : null,
        image: imgSrc && imgSrc.startsWith('http') ? imgSrc : null,
      });
    });
    return results;
  });

  return listings;
}
`

function getFundaInput() {
  return {
    searchUrls: scrapeFilters.cities.map(
      (city) =>
        `https://www.funda.nl/zoeken/huur/?selected_area=[%22${city}%22]&price=%22${scrapeFilters.minPrice}-${scrapeFilters.maxPrice}%22&availability=[%22available%22]`
    ),
    maxItems: 100,
  }
}

function getHuurwoningenInput() {
  const startUrls = scrapeFilters.cities.map((city) => ({
    url: `https://www.huurwoningen.nl/in/${city}/?price=${scrapeFilters.minPrice}-${scrapeFilters.maxPrice}`,
  }))
  return {
    startUrls,
    pageFunction: HUURWONINGEN_PAGE_FUNCTION,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    useChrome: true,
    launchContext: { useChrome: true, stealth: true },
    maxPagesPerCrawl: startUrls.length * 10,
  }
}

// ============================================================================
// Upsert logic
// ============================================================================

async function upsertListings(
  supabase: ReturnType<typeof createClient>,
  source: string,
  listings: RawListing[],
) {
  let newCount = 0
  let updatedCount = 0

  for (const listing of listings) {
    const { data: existing } = await supabase
      .from("listings")
      .select("id")
      .eq("source", source)
      .eq("source_listing_id", listing.source_listing_id)
      .maybeSingle()

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
        .eq("id", existing.id)
      updatedCount++
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
      })

      if (error) {
        console.error(`[scrape] Insert failed for "${listing.title}":`, error.message)
      } else {
        newCount++
      }
    }
  }

  return { newCount, updatedCount }
}

// ============================================================================
// Edge Function handler
// ============================================================================

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )
  const apifyToken = Deno.env.get("APIFY_API_TOKEN")!

  if (!apifyToken) {
    return new Response(JSON.stringify({ error: "APIFY_API_TOKEN not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const url = new URL(req.url)
  const mode = url.searchParams.get("mode") || "start"

  // ---- MODE: start (kick off async Apify runs) ----
  if (mode === "start") {
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/scrape?mode=webhook`

    const adapters = [
      { source: "funda", actorId: FUNDA_ACTOR, input: getFundaInput() },
      { source: "huurwoningen", actorId: HUURWONINGEN_ACTOR, input: getHuurwoningenInput() },
    ]

    const runs: { source: string; runId: string }[] = []

    for (const adapter of adapters) {
      try {
        const { runId, datasetId } = await startApifyActor(
          adapter.actorId,
          adapter.input,
          apifyToken,
          webhookUrl,
        )
        console.log(`[scrape] ${adapter.source} started: runId=${runId}`)

        await supabase.from("scrape_logs").insert({
          source: adapter.source,
          status: "running",
          errors: [`runId:${runId}`, `datasetId:${datasetId}`],
        })

        runs.push({ source: adapter.source, runId })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`[scrape] ${adapter.source} failed:`, msg)

        await supabase.from("scrape_logs").insert({
          source: adapter.source,
          status: "failed",
          errors: [msg],
          finished_at: new Date().toISOString(),
        })
      }
    }

    return new Response(JSON.stringify({ success: true, runs }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  // ---- MODE: webhook (Apify callback) ----
  if (mode === "webhook") {
    const body = await req.json()
    const { resource } = body || {}

    if (!resource) {
      return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { actId, defaultDatasetId, id: runId, status } = resource
    console.log(`[webhook] actId=${actId}, runId=${runId}, status=${status}`)

    if (status !== "SUCCEEDED") {
      return new Response(JSON.stringify({ success: false, reason: `Run status: ${status}` }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Determine source by actId
    let source: string | null = null
    let normalize: (items: Record<string, unknown>[]) => RawListing[]

    if (actId?.includes("easyapi") || actId?.includes("funda")) {
      source = "funda"
      normalize = (items) => items.map(normalizeFundaItem).filter(Boolean) as RawListing[]
    } else if (actId?.includes("apify") || actId?.includes("puppeteer")) {
      source = "huurwoningen"
      normalize = (items) => {
        // Unwrap nested arrays from puppeteer-scraper
        const flat: Record<string, unknown>[] = []
        for (const item of items) {
          if (Array.isArray(item)) flat.push(...item)
          else if (item && typeof item === "object" && !(item as Record<string, unknown>)["#error"]) flat.push(item)
        }
        return flat.map(normalizeHuurwoningenItem).filter(Boolean) as RawListing[]
      }
    }

    if (!source) {
      // Fallback: check scrape_logs
      const { data: logEntry } = await supabase
        .from("scrape_logs")
        .select("source")
        .filter("errors", "cs", `{runId:${runId}}`)
        .eq("status", "running")
        .maybeSingle()

      if (logEntry?.source === "funda") {
        source = "funda"
        normalize = (items) => items.map(normalizeFundaItem).filter(Boolean) as RawListing[]
      } else if (logEntry?.source === "huurwoningen") {
        source = "huurwoningen"
        normalize = (items) => {
          const flat: Record<string, unknown>[] = []
          for (const item of items) {
            if (Array.isArray(item)) flat.push(...item)
            else if (item && typeof item === "object" && !(item as Record<string, unknown>)["#error"]) flat.push(item)
          }
          return flat.map(normalizeHuurwoningenItem).filter(Boolean) as RawListing[]
        }
      } else {
        console.error(`[webhook] Unknown actId: ${actId}`)
        return new Response(JSON.stringify({ error: "Unknown actor" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
    }

    // Fetch and process
    const items = await getDatasetItems(defaultDatasetId, apifyToken)
    console.log(`[webhook] ${source}: ${items.length} items from dataset`)

    const rawListings = normalize!(items)

    // Apply min surface filter
    const filtered = scrapeFilters.minSurface
      ? rawListings.filter((l) => !l.surface_m2 || l.surface_m2 >= scrapeFilters.minSurface)
      : rawListings

    const { newCount, updatedCount } = await upsertListings(supabase, source, filtered)
    console.log(`[webhook] ${source}: ${newCount} new, ${updatedCount} updated`)

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
      .eq("status", "running")

    return new Response(
      JSON.stringify({ success: true, source, newListings: newCount, updatedListings: updatedCount }),
      { headers: { "Content-Type": "application/json" } },
    )
  }

  return new Response(JSON.stringify({ error: "Unknown mode. Use ?mode=start or ?mode=webhook" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  })
})
