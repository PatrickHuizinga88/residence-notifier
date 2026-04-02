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
  // Nested address object
  const addr = (raw.address || {}) as Record<string, unknown>
  const city = (addr.city || '') as string
  const neighborhood = (addr.neighbourhood || addr.wijk || '') as string

  // Price: can be a number, string, or object like { amount: 1500, currency: "EUR" }
  const rawPrice = raw.price as unknown
  let price = 0
  if (typeof rawPrice === 'object' && rawPrice !== null) {
    const priceObj = rawPrice as Record<string, unknown>
    price = parsePriceToCents(priceObj.amount || priceObj.value || priceObj.asking_price || priceObj.rent)
  } else {
    price = parsePriceToCents(rawPrice)
  }

  // URL: object_detail_page_relative_url is the actual field name
  const relativeUrl = (raw.object_detail_page_relative_url || raw.relative_url || '') as string
  const url = relativeUrl
    ? `https://www.funda.nl${relativeUrl}`
    : (raw.url || '') as string

  // Title from address parts
  const street = (addr.street && addr.house_number
    ? `${addr.street} ${addr.house_number}`
    : (addr.street || '')) as string
  const title = (raw.title || raw.name || street || `${city} woning`) as string

  if (!url) return null
  // Allow price 0 temporarily — some listings may have price in detail only
  if (!title) return null

  // Source ID
  const sourceListingId = String(raw.id || relativeUrl.split('/').filter(Boolean).pop() || url)

  // Agent info
  const agents = raw.agent as Array<Record<string, unknown>> | undefined

  // Thumbnail image
  const photoId = raw.photo_image_id || raw.thumbnail_id
  const images = photoId
    ? [`https://cloud.funda.nl/valentina_media/resize/720x480/${photoId}.jpg`]
    : undefined

  return {
    source_listing_id: sourceListingId,
    source_url: url,
    title,
    description: undefined,
    price_monthly: price,
    city: city || 'Onbekend',
    neighborhood: neighborhood || undefined,
    postal_code: (addr.postal_code || addr.postcode) as string | undefined,
    address: street || undefined,
    latitude: (addr.lat || addr.latitude) as number | undefined,
    longitude: (addr.lng || addr.longitude) as number | undefined,
    surface_m2: (raw.floor_area || raw.living_area) as number | undefined,
    rooms: raw.number_of_rooms as number | undefined,
    bedrooms: raw.number_of_bedrooms as number | undefined,
    property_type: parsePropertyType((raw.object_type || raw.type || '') as string),
    furnished: parseFurnished((raw.interior || '') as string),
    available_from: (raw.offered_since || raw.publish_date) as string | undefined,
    energy_label: (raw.energy_label) as string | undefined,
    images,
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
        `https://www.funda.nl/zoeken/huur/?selected_area=[%22${city}%22]&price=%22-${scrapeFilters.maxPrice}%22&availability=[%22available%22]`
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
