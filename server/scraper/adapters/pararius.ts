import * as cheerio from 'cheerio'
import type { RawListing, ScraperAdapter, PropertyType, FurnishedStatus } from '~~/types/listing'

const BASE_URL = 'https://www.pararius.nl'
const SEARCH_URL = `${BASE_URL}/huurwoningen/nederland`
const REQUEST_DELAY_MS = 2000

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parsePropertyType(text: string): PropertyType {
  const lower = text.toLowerCase()
  if (lower.includes('appartement') || lower.includes('apartment')) return 'apartment'
  if (lower.includes('huis') || lower.includes('woning') || lower.includes('house')) return 'house'
  if (lower.includes('kamer') || lower.includes('room')) return 'room'
  if (lower.includes('studio')) return 'studio'
  return 'apartment'
}

function parseFurnished(text: string): FurnishedStatus | undefined {
  const lower = text.toLowerCase()
  if (lower.includes('gemeubileerd') || lower.includes('furnished')) return 'furnished'
  if (lower.includes('ongemeubileerd') || lower.includes('unfurnished')) return 'unfurnished'
  if (lower.includes('bespreekbaar') || lower.includes('negotiable')) return 'negotiable'
  return undefined
}

function parsePriceToCents(priceText: string): number {
  const cleaned = priceText.replace(/[^\d]/g, '')
  return parseInt(cleaned, 10) * 100
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HuurRadar/1.0; +https://huurradar.nl)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'nl-NL,nl;q=0.9',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

function parseListingPage($: cheerio.CheerioAPI, url: string): Partial<RawListing> {
  const details: Partial<RawListing> = {}

  // Description
  const description = $('.listing-detail-description__content').text().trim()
  if (description) details.description = description.slice(0, 5000)

  // Surface area
  const surfaceText = $('li:contains("Oppervlakte")').text()
  const surfaceMatch = surfaceText.match(/(\d+)\s*m²/)
  if (surfaceMatch) details.surface_m2 = parseInt(surfaceMatch[1], 10)

  // Rooms
  const roomsText = $('li:contains("Kamers")').text()
  const roomsMatch = roomsText.match(/(\d+)/)
  if (roomsMatch) details.rooms = parseInt(roomsMatch[1], 10)

  // Furnished status
  const interiorText = $('li:contains("Interieur"), li:contains("Gemeubileerd")').text()
  if (interiorText) details.furnished = parseFurnished(interiorText)

  // Energy label
  const energyText = $('li:contains("Energielabel")').text()
  const energyMatch = energyText.match(/[A-G](\+{0,3})/)
  if (energyMatch) details.energy_label = energyMatch[0]

  // Images
  const images: string[] = []
  $('img[data-src], .listing-detail-media img').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src')
    if (src && src.startsWith('http')) images.push(src)
  })
  if (images.length) details.images = images

  return details
}

export const parariusAdapter: ScraperAdapter = {
  getSourceId() {
    return 'pararius'
  },

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(BASE_URL, { method: 'HEAD' })
      return response.ok
    } catch {
      return false
    }
  },

  async fetchListings(): Promise<RawListing[]> {
    const listings: RawListing[] = []
    const maxPages = 3

    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}/page-${page}`
      const html = await fetchPage(url)
      const $ = cheerio.load(html)

      const listingElements = $('li.search-list__item--listing, .listing-search-item')

      if (listingElements.length === 0) break

      listingElements.each((_, element) => {
        try {
          const el = $(element)

          const linkEl = el.find('a.listing-search-item__link, a[href*="/huurwoning"]').first()
          const href = linkEl.attr('href')
          if (!href) return

          const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
          const sourceListingId = href.split('/').filter(Boolean).pop() || href

          const title = el.find('.listing-search-item__title, h2').text().trim()
          if (!title) return

          const priceText = el.find('.listing-search-item__price, .price').text().trim()
          const priceCents = parsePriceToCents(priceText)
          if (!priceCents || isNaN(priceCents)) return

          const locationText = el.find('.listing-search-item__sub-title, .listing-search-item__location').text().trim()
          const locationParts = locationText.split(',').map(s => s.trim())
          const city = locationParts[locationParts.length - 1] || 'Onbekend'
          const neighborhood = locationParts.length > 1 ? locationParts[0] : undefined

          const postalMatch = locationText.match(/\d{4}\s?[A-Z]{2}/)
          const postalCode = postalMatch ? postalMatch[0].replace(/\s/, '') : undefined

          const surfaceText = el.find('.illustrated-features__item--surface-area, .surface-area').text()
          const surfaceMatch = surfaceText.match(/(\d+)\s*m²/)
          const surface_m2 = surfaceMatch ? parseInt(surfaceMatch[1], 10) : undefined

          const roomsText = el.find('.illustrated-features__item--number-of-rooms, .rooms').text()
          const roomsMatch = roomsText.match(/(\d+)/)
          const rooms = roomsMatch ? parseInt(roomsMatch[1], 10) : undefined

          const typeText = el.find('.listing-search-item__sub-title').text()
          const property_type = parsePropertyType(typeText)

          const imgEl = el.find('img').first()
          const imgSrc = imgEl.attr('data-src') || imgEl.attr('src')
          const images = imgSrc && imgSrc.startsWith('http') ? [imgSrc] : undefined

          listings.push({
            source_listing_id: sourceListingId,
            source_url: sourceUrl,
            title,
            price_monthly: priceCents,
            city,
            neighborhood,
            postal_code: postalCode,
            surface_m2,
            rooms,
            property_type,
            images,
          })
        } catch {
          // Skip individual listing errors
        }
      })

      // Respect rate limiting
      if (page < maxPages) {
        await delay(REQUEST_DELAY_MS)
      }
    }

    return listings
  },
}
