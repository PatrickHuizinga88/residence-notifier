import type { RawListing, ScraperAdapter, PropertyType, FurnishedStatus } from '~~/types/listing'
import { runApifyActor } from '~~/server/utils/apify'

// Apify Actor: lexis-solutions/pararius
const ACTOR_ID = 'lexis-solutions~pararius'

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
  if (lower.includes('gemeubileerd') || lower.includes('furnished') || lower.includes('upholstered')) return 'furnished'
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
  const title = (raw.title || raw.name || '') as string
  const price = parsePriceToCents(raw.price || raw.rentPrice || raw.pricePerMonth)
  const url = (raw.url || raw.link || '') as string

  if (!title || !price || !url) return null

  const city = (raw.city || raw.location || '') as string
  const sourceListingId = url.split('/').filter(Boolean).pop() || url

  return {
    source_listing_id: sourceListingId,
    source_url: url,
    title,
    description: (raw.description || raw.text) as string | undefined,
    price_monthly: price,
    city: city || 'Onbekend',
    neighborhood: (raw.neighborhood || raw.district || raw.area) as string | undefined,
    postal_code: (raw.postalCode || raw.zipCode) as string | undefined,
    address: (raw.address || raw.street) as string | undefined,
    latitude: raw.latitude as number | undefined,
    longitude: raw.longitude as number | undefined,
    surface_m2: raw.surfaceArea as number | undefined || raw.livingArea as number | undefined,
    rooms: raw.rooms as number | undefined || raw.numberOfRooms as number | undefined,
    bedrooms: raw.bedrooms as number | undefined || raw.numberOfBedrooms as number | undefined,
    property_type: parsePropertyType((raw.propertyType || raw.type || '') as string),
    furnished: parseFurnished((raw.interior || raw.furnished || '') as string),
    available_from: (raw.availableFrom || raw.availability) as string | undefined,
    energy_label: (raw.energyLabel || raw.energyRating) as string | undefined,
    images: Array.isArray(raw.images) ? raw.images as string[] : undefined,
    pets_allowed: raw.petsAllowed as boolean | undefined,
  }
}

export function createParariusAdapter(apiToken: string): ScraperAdapter {
  return {
    getSourceId() {
      return 'pararius'
    },

    async healthCheck(): Promise<boolean> {
      return !!apiToken
    },

    async fetchListings(): Promise<RawListing[]> {
      const items = await runApifyActor(ACTOR_ID, {
        searchUrl: 'https://www.pararius.nl/huurwoningen/nederland',
        maxItems: 100,
      }, apiToken)

      console.log(`[pararius] Apify returned ${items.length} items`)

      const listings: RawListing[] = []
      for (const item of items) {
        const normalized = normalizeResult(item)
        if (normalized) listings.push(normalized)
      }

      console.log(`[pararius] Normalized ${listings.length} listings`)
      return listings
    },
  }
}
