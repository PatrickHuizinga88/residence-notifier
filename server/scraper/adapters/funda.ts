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
  const title = (raw.title || raw.name || raw.address || '') as string
  const price = parsePriceToCents(raw.price || raw.rentPrice || raw.pricePerMonth || raw.sellingPrice)
  const url = (raw.url || raw.link || raw.propertyUrl || '') as string

  if (!title || !price || !url) return null

  const city = (raw.city || raw.plaats || raw.location || '') as string
  const sourceListingId = url.split('/').filter(Boolean).pop() || url

  return {
    source_listing_id: sourceListingId,
    source_url: url,
    title,
    description: (raw.description || raw.text || raw.fullDescription) as string | undefined,
    price_monthly: price,
    city: city || 'Onbekend',
    neighborhood: (raw.neighborhood || raw.district || raw.buurt) as string | undefined,
    postal_code: (raw.postalCode || raw.zipCode || raw.postcode) as string | undefined,
    address: (raw.address || raw.street || raw.adres) as string | undefined,
    latitude: raw.latitude as number | undefined || raw.lat as number | undefined,
    longitude: raw.longitude as number | undefined || raw.lng as number | undefined || raw.lon as number | undefined,
    surface_m2: raw.livingArea as number | undefined || raw.surfaceArea as number | undefined || raw.woonoppervlakte as number | undefined,
    rooms: raw.rooms as number | undefined || raw.numberOfRooms as number | undefined || raw.aantalKamers as number | undefined,
    bedrooms: raw.bedrooms as number | undefined || raw.numberOfBedrooms as number | undefined,
    property_type: parsePropertyType((raw.propertyType || raw.type || raw.soortWoning || '') as string),
    furnished: parseFurnished((raw.interior || raw.furnished || raw.interieur || '') as string),
    available_from: (raw.availableFrom || raw.availability || raw.aanvaarding) as string | undefined,
    energy_label: (raw.energyLabel || raw.energyRating || raw.energielabel) as string | undefined,
    images: Array.isArray(raw.images) ? raw.images as string[]
      : Array.isArray(raw.photos) ? raw.photos as string[]
      : undefined,
    landlord_type: (raw.realEstateAgent || raw.makelaar) ? 'agency' : undefined,
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
      // Scrape per stad met prijsfilter
      const allItems: Record<string, unknown>[] = []

      for (const city of scrapeFilters.cities) {
        const searchUrl = `https://www.funda.nl/zoeken/huur/?selected_area=%5B%22${city}%22%5D&price=%22-${scrapeFilters.maxPrice}%22&availability=%5B%22available%22%5D`
        console.log(`[funda] Scraping ${city}...`)

        try {
          const items = await runApifyActor(ACTOR_ID, {
            searchUrl,
            maxItems: 50,
          }, apiToken)
          allItems.push(...items)
          console.log(`[funda] ${city}: ${items.length} items`)
        } catch (error) {
          console.error(`[funda] ${city} failed:`, error)
        }
      }

      const items = allItems

      console.log(`[funda] Apify returned ${items.length} items`)

      const listings: RawListing[] = []
      for (const item of items) {
        const normalized = normalizeResult(item)
        if (normalized) listings.push(normalized)
      }

      console.log(`[funda] Normalized ${listings.length} listings`)
      return listings
    },
  }
}
