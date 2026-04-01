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
  const value = parseInt(cleaned, 10)
  if (isNaN(value)) return 0
  return value * 100
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

async function fetchListingDetails($: cheerio.CheerioAPI): Promise<Partial<RawListing>> {
  const details: Partial<RawListing> = {}

  // Surface area from detail page
  const surfaceEl = $('li.illustrated-features__item--surface-area')
  const surfaceMatch = surfaceEl.text().match(/(\d+)\s*m²/)
  if (surfaceMatch) details.surface_m2 = parseInt(surfaceMatch[1], 10)

  // Bedrooms from detail page
  const bedroomsEl = $('dd.listing-features__description--number_of_bedrooms span')
  const bedroomsMatch = bedroomsEl.text().match(/(\d+)/)
  if (bedroomsMatch) details.bedrooms = parseInt(bedroomsMatch[1], 10)

  // Pets allowed
  const petsEl = $('dd.listing-features__description--pets_allowed span')
  if (petsEl.length) {
    const petsText = petsEl.text().toLowerCase()
    details.pets_allowed = petsText.includes('ja') || petsText.includes('yes') || petsText.includes('toegestaan')
  }

  // Coordinates from map element
  const mapEl = $('wc-detail-map')
  if (mapEl.length) {
    const lat = parseFloat(mapEl.attr('data-latitude') || '')
    const lng = parseFloat(mapEl.attr('data-longitude') || '')
    if (!isNaN(lat) && !isNaN(lng)) {
      details.latitude = lat
      details.longitude = lng
    }
  }

  // Description
  const description = $('.listing-detail-description__content').text().trim()
  if (description) details.description = description.slice(0, 5000)

  // Energy label
  const energyText = $('[class*="energy-label"], dd.listing-features__description--energy_label span').text()
  const energyMatch = energyText.match(/[A-G](\+{0,3})/)
  if (energyMatch) details.energy_label = energyMatch[0]

  // Furnished status
  const furnishedEl = $('dd.listing-features__description--furnished span, dd.listing-features__description--interior span')
  if (furnishedEl.length) details.furnished = parseFurnished(furnishedEl.text())

  // Images
  const images: string[] = []
  $('img[data-src], .listing-detail-media img, picture source, .carousel img').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('srcset')?.split(' ')[0] || $(el).attr('src')
    if (src && src.startsWith('http') && !images.includes(src)) images.push(src)
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
      const response = await fetch(BASE_URL, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
      })
      // 200 or 403 (bot protection) both mean the server is reachable
      return response.status < 500
    } catch {
      return false
    }
  },

  async fetchListings(): Promise<RawListing[]> {
    const listings: RawListing[] = []
    const maxPages = 3

    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}/page-${page}`

      let html: string
      try {
        html = await fetchPage(url)
      } catch (error) {
        console.error(`[pararius] Failed to fetch page ${page}:`, error)
        break
      }

      const $ = cheerio.load(html)

      // Primary selector: section.listing-search-item
      const listingElements = $('section.listing-search-item')

      console.log(`[pararius] Page ${page}: found ${listingElements.length} listings`)

      if (listingElements.length === 0) {
        // Log what we do find for debugging
        const bodyText = $('body').text().slice(0, 200)
        console.warn(`[pararius] No listings found. Page title: "${$('title').text()}", body preview: "${bodyText}"`)
        break
      }

      listingElements.each((_, element) => {
        try {
          const el = $(element)

          // Title link: .listing-search-item__link--title
          const linkEl = el.find('.listing-search-item__link--title, a.listing-search-item__link').first()
          const href = linkEl.attr('href')
          if (!href) return

          const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
          const sourceListingId = href.split('/').filter(Boolean).pop() || href

          // Title text from the link
          const title = linkEl.text().trim()
          if (!title) return

          // Price: .listing-search-item__price
          const priceText = el.find('.listing-search-item__price').text().trim()
          const priceCents = parsePriceToCents(priceText)
          if (!priceCents) return

          // Location: extract from URL structure or subtitle
          const subtitle = el.find('.listing-search-item__sub-title, .listing-search-item__location').text().trim()
          const urlParts = href.split('/').filter(Boolean)
          // URL pattern: /huurwoning/[city]/[...]/[id]
          const cityFromUrl = urlParts.length >= 2 ? urlParts[1] : undefined
          const city = cityFromUrl
            ? cityFromUrl.charAt(0).toUpperCase() + cityFromUrl.slice(1).replace(/-/g, ' ')
            : subtitle.split(',').pop()?.trim() || 'Onbekend'

          const neighborhood = subtitle.split(',').length > 1
            ? subtitle.split(',')[0].trim()
            : undefined

          const postalMatch = subtitle.match(/\d{4}\s?[A-Z]{2}/)
          const postalCode = postalMatch ? postalMatch[0].replace(/\s/, '') : undefined

          // Surface area: .illustrated-features__item--surface-area
          const surfaceText = el.find('.illustrated-features__item--surface-area, [class*="surface"]').text()
          const surfaceMatch = surfaceText.match(/(\d+)\s*m²/)
          const surface_m2 = surfaceMatch ? parseInt(surfaceMatch[1], 10) : undefined

          // Rooms: .illustrated-features__item--number-of-rooms
          const roomsText = el.find('.illustrated-features__item--number-of-rooms, [class*="rooms"]').text()
          const roomsMatch = roomsText.match(/(\d+)/)
          const rooms = roomsMatch ? parseInt(roomsMatch[1], 10) : undefined

          // Property type from subtitle or features
          const property_type = parsePropertyType(subtitle || title)

          // Image
          const imgEl = el.find('img').first()
          const imgSrc = imgEl.attr('data-src') || imgEl.attr('srcset')?.split(' ')[0] || imgEl.attr('src')
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
        } catch (error) {
          console.error('[pararius] Error parsing listing:', error)
        }
      })

      // Respect rate limiting
      if (page < maxPages) {
        await delay(REQUEST_DELAY_MS)
      }
    }

    console.log(`[pararius] Total listings scraped: ${listings.length}`)
    return listings
  },
}
