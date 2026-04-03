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

/** Safely parse a value to integer or return undefined */
function toInt(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value)
  return isNaN(n) ? undefined : Math.round(n)
}

/** Safely parse to float or return undefined */
function toFloat(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const n = Number(value)
  return isNaN(n) ? undefined : n
}

/** Extract first element if value is an array, otherwise return as-is */
function unwrap(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function normalizeResult(raw: Record<string, unknown>): RawListing | null {
  // Nested address object
  const addr = (raw.address || {}) as Record<string, unknown>
  const city = (addr.city || '') as string
  const neighborhood = (addr.neighbourhood || addr.wijk || '') as string

  // Price: rent_price is an array like [1140]
  const rawPrice = raw.price as Record<string, unknown> | undefined
  let price = 0
  if (rawPrice && typeof rawPrice === 'object') {
    price = parsePriceToCents(unwrap(rawPrice.rent_price) || unwrap(rawPrice.amount) || unwrap(rawPrice.value))
  }

  // URL
  const relativeUrl = (raw.object_detail_page_relative_url || '') as string
  const url = relativeUrl
    ? `https://www.funda.nl${relativeUrl}`
    : (raw.url || '') as string

  // Title from address parts — field is street_name, not street
  const streetName = (addr.street_name || '') as string
  const houseNumber = (addr.house_number || '') as string
  const houseNumberSuffix = (addr.house_number_suffix || '') as string
  const street = streetName
    ? `${streetName} ${houseNumber}${houseNumberSuffix ? ' ' + houseNumberSuffix : ''}`.trim()
    : ''
  const title = (raw.title || raw.name || street || `${city} woning`) as string

  if (!url) return null
  if (!title) return null

  // Source ID
  const sourceListingId = String(raw.id || relativeUrl.split('/').filter(Boolean).pop() || url)

  // Agent info
  const agents = raw.agent as Array<Record<string, unknown>> | undefined

  // Images: photo_image_id is an array of path strings like "valentina_media/224/909/334.jpg"
  const photoIds = raw.photo_image_id as string[] | undefined
  const images = photoIds?.length
    ? photoIds.map(p => `https://cloud.funda.nl/${p}`)
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
    latitude: toFloat(addr.lat || addr.latitude),
    longitude: toFloat(addr.lng || addr.longitude),
    surface_m2: toInt(unwrap(raw.floor_area) || unwrap(raw.living_area)),
    rooms: toInt(raw.number_of_rooms),
    bedrooms: toInt(raw.number_of_bedrooms),
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
        `https://www.funda.nl/zoeken/huur/?selected_area=[%22${city}%22]&price=%22${scrapeFilters.minPrice}-${scrapeFilters.maxPrice}%22&availability=[%22available%22]`
      )

      console.log(`[funda] Scraping ${searchUrls.length} cities...`)

      const allItems: Record<string, unknown>[] = []

      try {
        const items = await runApifyActor(ACTOR_ID, {
          searchUrls,
          maxItems: 100,
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
