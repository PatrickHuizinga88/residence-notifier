import type { RawListing, ScraperAdapter, PropertyType, FurnishedStatus } from '~~/types/listing'
import { runApifyActor } from '~~/server/utils/apify'
import { scrapeFilters } from '../config'

// Apify Actor: easyapi/funda-nl-scraper
const ACTOR_ID = 'easyapi~funda-nl-scraper'

function parsePropertyType(text: string): PropertyType {
  const lower = (text || '').toLowerCase()
  if (lower.includes('appartement') || lower.includes('apartment')) return 'apartment'
  if (lower.includes('huis') || lower.includes('woning') || lower.includes('house')) return 'house'
  if (lower.includes('kamer') || lower.includes('room')) return 'room'
  if (lower.includes('studio')) return 'studio'
  return 'apartment'
}

function parseFurnished(text: string): FurnishedStatus | undefined {
  const lower = (text || '').toLowerCase()
  if (lower.includes('gemeubileerd') || lower.includes('furnished')) return 'furnished'
  if (lower.includes('ongemeubileerd') || lower.includes('unfurnished')) return 'unfurnished'
  if (lower.includes('bespreekbaar') || lower.includes('negotiable')) return 'negotiable'
  return undefined
}

function parsePriceToCents(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 100)
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.')
    return Math.round(parseFloat(cleaned) * 100) || 0
  }
  return 0
}

function normalizeResult(raw: Record<string, unknown>): RawListing | null {
  // Funda uses nested address object
  const addr = (raw.address || {}) as Record<string, unknown>
  const city = (addr.city || '') as string
  const neighborhood = (addr.neighbourhood || addr.wijk || '') as string
  const province = (addr.province || '') as string

  // Price can be nested or flat
  const price = parsePriceToCents(raw.rent_price || raw.price || raw.offered_since)

  // URL
  const relativeUrl = (raw.relative_url || '') as string
  const url = relativeUrl
    ? `https://www.funda.nl${relativeUrl}`
    : (raw.url || raw.link || '') as string

  // Title: Funda often uses address as title
  const street = (addr.street || addr.house_number
    ? `${addr.street || ''} ${addr.house_number || ''}`.trim()
    : '') as string
  const title = (raw.title || raw.name || street || '') as string

  if (!title || !price || !url) return null

  // Source listing ID from URL or Funda's internal ID
  const sourceListingId = (raw.id || raw.global_id || relativeUrl.split('/').filter(Boolean).pop() || url) as string

  // Agent info
  const agents = raw.agent as Array<Record<string, unknown>> | undefined

  // Images
  const mediaItems = raw.media_items as Array<Record<string, unknown>> | undefined
  const images = mediaItems
    ?.filter(m => m.type === 'image' || m.url)
    .map(m => (m.url || m.relative_url) as string)
    .filter(Boolean)

  return {
    source_listing_id: String(sourceListingId),
    source_url: url,
    title,
    description: (raw.description || raw.text || '') as string | undefined,
    price_monthly: price,
    city: city || 'Onbekend',
    neighborhood: neighborhood || undefined,
    postal_code: (addr.postal_code || addr.postcode || raw.postal_code) as string | undefined,
    address: street || undefined,
    latitude: (addr.lat || raw.latitude) as number | undefined,
    longitude: (addr.lng || raw.longitude) as number | undefined,
    surface_m2: (raw.living_area || raw.surface_area || raw.plot_area) as number | undefined,
    rooms: (raw.number_of_rooms || raw.rooms) as number | undefined,
    bedrooms: (raw.number_of_bedrooms || raw.bedrooms) as number | undefined,
    property_type: parsePropertyType((raw.property_type || raw.type || raw.category || '') as string),
    furnished: parseFurnished((raw.interior || raw.furnished || '') as string),
    available_from: (raw.available_from || raw.availability || raw.offered_since) as string | undefined,
    energy_label: (raw.energy_label || raw.energy_rating) as string | undefined,
    images: images?.length ? images : undefined,
    landlord_type: agents?.length ? 'agency' : undefined,
  }
}

export function createFundaAdapter(apiToken: string): ScraperAdapter {
  return {
    getSourceId() {
      return 'funda'
    },

    async healthCheck(): Promise<boolean> {
      return !!apiToken
    },

    async fetchListings(): Promise<RawListing[]> {
      // Build search URLs per city with price filter
      const searchUrls = scrapeFilters.cities.map(city =>
        `https://www.funda.nl/zoeken/huur?selected_area=["${city}"]&price="-${scrapeFilters.maxPrice}"&availability=["available"]`
      )

      console.log(`[funda] Scraping ${searchUrls.length} cities...`)

      const allItems: Record<string, unknown>[] = []

      try {
        const items = await runApifyActor(ACTOR_ID, {
          searchUrls,
          maxItems: 200,
        }, apiToken)
        allItems.push(...items)
        console.log(`[funda] Apify returned ${items.length} items`)
        if (items.length > 0) {
          console.log(`[funda] Sample item keys:`, Object.keys(items[0]))
          console.log(`[funda] Sample item:`, JSON.stringify(items[0]).slice(0, 500))
        }
      } catch (error) {
        console.error(`[funda] Scraping failed:`, error)
      }

      const listings: RawListing[] = []
      for (const item of allItems) {
        const normalized = normalizeResult(item)
        if (normalized) listings.push(normalized)
      }

      console.log(`[funda] Normalized ${listings.length} listings`)
      return listings
    },
  }
}
