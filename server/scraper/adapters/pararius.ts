import type { RawListing, ScraperAdapter, PropertyType, FurnishedStatus } from '~~/types/listing'
import { runApifyActor } from '~~/server/utils/apify'
import { scrapeFilters } from '../config'

// Apify's free generic Web Scraper (pay only for compute units)
const ACTOR_ID = 'apify~web-scraper'

// JavaScript that runs in the browser on each Pararius search page
const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { jQuery: $ } = context;
  const listings = [];

  $('section.listing-search-item').each((i, el) => {
    const $el = $(el);

    const linkEl = $el.find('.listing-search-item__link--title, a.listing-search-item__link').first();
    const href = linkEl.attr('href');
    if (!href) return;

    const title = linkEl.text().trim();
    if (!title) return;

    const priceText = $el.find('.listing-search-item__price').text().trim();
    const priceMatch = priceText.replace(/[^\\d]/g, '');
    const price = parseInt(priceMatch, 10);
    if (!price) return;

    const url = href.startsWith('http') ? href : 'https://www.pararius.nl' + href;
    const sourceId = href.split('/').filter(Boolean).pop() || href;

    // Extract city from URL: /huurwoning/[city]/...
    const urlParts = href.split('/').filter(Boolean);
    const cityFromUrl = urlParts.length >= 2 ? urlParts[1] : '';

    const subtitle = $el.find('.listing-search-item__sub-title, .listing-search-item__location').text().trim();

    const surfaceText = $el.find('.illustrated-features__item--surface-area, [class*="surface"]').text();
    const surfaceMatch = surfaceText.match(/(\\d+)\\s*m/);

    const roomsText = $el.find('.illustrated-features__item--number-of-rooms, [class*="rooms"]').text();
    const roomsMatch = roomsText.match(/(\\d+)/);

    const imgEl = $el.find('img').first();
    const imgSrc = imgEl.attr('data-src') || imgEl.attr('srcset')?.split(' ')[0] || imgEl.attr('src');

    listings.push({
      sourceId,
      url,
      title,
      price,
      city: cityFromUrl,
      subtitle,
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

  const citySlug = (raw.city || '') as string
  const city = citySlug
    ? citySlug.charAt(0).toUpperCase() + citySlug.slice(1).replace(/-/g, ' ')
    : 'Onbekend'

  const subtitle = (raw.subtitle || '') as string
  const neighborhood = subtitle.split(',').length > 1 ? subtitle.split(',')[0].trim() : undefined
  const postalMatch = subtitle.match(/\d{4}\s?[A-Z]{2}/)

  return {
    source_listing_id: (raw.sourceId || '') as string,
    source_url: url,
    title,
    price_monthly: price * 100,
    city,
    neighborhood,
    postal_code: postalMatch ? postalMatch[0].replace(/\s/, '') : undefined,
    surface_m2: (raw.surface as number) || undefined,
    rooms: (raw.rooms as number) || undefined,
    property_type: parsePropertyType(subtitle || title),
    images: raw.image ? [raw.image as string] : undefined,
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
      const startUrls = scrapeFilters.cities.map(city => ({
        url: `https://www.pararius.nl/huurwoningen/${city}/0-${scrapeFilters.maxPrice}`,
      }))

      console.log(`[pararius] Scraping ${startUrls.length} cities via Web Scraper...`)

      let allResults: Record<string, unknown>[] = []

      try {
        const items = await runApifyActor(ACTOR_ID, {
          startUrls,
          pageFunction: PAGE_FUNCTION,
          proxyConfiguration: { useApifyProxy: true },
          maxPagesPerCrawl: startUrls.length,
        }, apiToken)

        // Web Scraper wraps pageFunction results — each item contains the returned array
        for (const item of items) {
          if (Array.isArray(item)) {
            allResults.push(...item)
          } else if (item && typeof item === 'object') {
            allResults.push(item)
          }
        }
      } catch (error) {
        console.error('[pararius] Web Scraper failed:', error)
      }

      console.log(`[pararius] Web Scraper returned ${allResults.length} total items`)

      const listings: RawListing[] = []
      for (const item of allResults) {
        const normalized = normalizeResult(item)
        if (normalized) listings.push(normalized)
      }

      console.log(`[pararius] Normalized ${listings.length} listings`)
      return listings
    },
  }
}
