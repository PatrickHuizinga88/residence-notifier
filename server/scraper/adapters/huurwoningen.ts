import type { RawListing, ScraperAdapter, PropertyType } from '~~/types/listing'
import { runApifyActor } from '~~/server/utils/apify'
import { scrapeFilters } from '../config'

const ACTOR_ID = 'apify~web-scraper'

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { jQuery: $ } = context;
  const listings = [];

  $('.listing-search-item--for-rent').each((i, el) => {
    const $el = $(el);

    const linkEl = $el.find('.listing-search-item__title').closest('a');
    const href = linkEl.attr('href') || $el.find('a').first().attr('href');
    if (!href) return;

    const title = $el.find('.listing-search-item__title').text().trim();
    if (!title) return;

    const priceText = $el.find('.listing-search-item__price-main').text().trim();
    const priceMatch = priceText.replace(/[^\\d]/g, '');
    const price = parseInt(priceMatch, 10);
    if (!price) return;

    const url = href.startsWith('http') ? href : 'https://www.huurwoningen.nl' + href;
    const sourceId = href.split('/').filter(Boolean).pop() || href;

    const surfaceText = $el.find('.illustrated-features__item--surface-area').text();
    const surfaceMatch = surfaceText.match(/(\\d+)\\s*m/);

    const roomsText = $el.find('.illustrated-features__item--number-of-rooms').text();
    const roomsMatch = roomsText.match(/(\\d+)/);

    const imgEl = $el.find('.picture__image').first();
    const imgSrc = imgEl.attr('data-src') || imgEl.attr('srcset')?.split(' ')[0] || imgEl.attr('src');

    listings.push({
      sourceId,
      url,
      title,
      price,
      surface: surfaceMatch ? parseInt(surfaceMatch[1], 10) : null,
      rooms: roomsMatch ? parseInt(roomsMatch[1], 10) : null,
      image: imgSrc && imgSrc.startsWith('http') ? imgSrc : null,
    });
  });

  return listings;
}
`

function parsePropertyType(text: string): PropertyType {
  const lower = (text || '').toLowerCase()
  if (lower.includes('appartement') || lower.includes('apartment')) return 'apartment'
  if (lower.includes('huis') || lower.includes('woning') || lower.includes('house')) return 'house'
  if (lower.includes('kamer') || lower.includes('room')) return 'room'
  if (lower.includes('studio')) return 'studio'
  return 'apartment'
}

function normalizeResult(raw: Record<string, unknown>): RawListing | null {
  const title = (raw.title || '') as string
  const price = raw.price as number
  const url = (raw.url || '') as string

  if (!title || !price || !url) return null

  // Extract city from URL: /huurwoning/[city]/... or /in/[city]/...
  const urlParts = new URL(url).pathname.split('/').filter(Boolean)
  const citySlug = urlParts.length >= 2 ? urlParts[1] : ''
  const city = citySlug
    ? citySlug.charAt(0).toUpperCase() + citySlug.slice(1).replace(/-/g, ' ')
    : 'Onbekend'

  return {
    source_listing_id: (raw.sourceId || '') as string,
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

export function createHuurwoningenAdapter(apiToken: string): ScraperAdapter {
  return {
    getSourceId() {
      return 'huurwoningen'
    },

    async healthCheck(): Promise<boolean> {
      return !!apiToken
    },

    async fetchListings(): Promise<RawListing[]> {
      const startUrls = scrapeFilters.cities.map(city => ({
        url: `https://www.huurwoningen.nl/in/${city}/?price=0-${scrapeFilters.maxPrice}`,
      }))

      console.log(`[huurwoningen] Scraping ${startUrls.length} cities via Web Scraper...`)

      let allResults: Record<string, unknown>[] = []

      try {
        const items = await runApifyActor(ACTOR_ID, {
          startUrls,
          pageFunction: PAGE_FUNCTION,
          proxyConfiguration: { useApifyProxy: true },
          maxPagesPerCrawl: startUrls.length,
        }, apiToken)

        for (const item of items) {
          if (Array.isArray(item)) {
            allResults.push(...item)
          } else if (item && typeof item === 'object') {
            allResults.push(item)
          }
        }
      } catch (error) {
        console.error('[huurwoningen] Web Scraper failed:', error)
      }

      console.log(`[huurwoningen] Web Scraper returned ${allResults.length} total items`)

      const listings: RawListing[] = []
      for (const item of allResults) {
        const normalized = normalizeResult(item)
        if (normalized) listings.push(normalized)
      }

      console.log(`[huurwoningen] Normalized ${listings.length} listings`)
      return listings
    },
  }
}
