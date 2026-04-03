import type { RawListing, ScraperAdapter, PropertyType } from '~~/types/listing'
import { runApifyActor, startApifyActor } from '~~/server/utils/apify'
import { scrapeFilters } from '../config'

const ACTOR_ID = 'apify~puppeteer-scraper'

const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { page, request, enqueueRequest } = context;
  await page.waitForSelector('.listing-search-item--for-rent', { timeout: 15000 });

  // Enqueue next page if it exists
  const nextPageUrl = await page.evaluate(() => {
    const nextLink = document.querySelector('.pagination__item--next a');
    if (!nextLink) return null;
    // The site has a bug with double '?' in pagination hrefs, so build URL manually
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
      const surfaceMatch = surfaceText.match(/(\\d+)\\s*m/);

      const roomsText = el.querySelector('.illustrated-features__item--number-of-rooms')?.textContent || '';
      const roomsMatch = roomsText.match(/(\\d+)/);

      const imgEl = el.querySelector('.picture__image');
      const sourceEl = el.querySelector('wc-picture source, picture source');
      let imgSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');

      // Fallback: extract a usable URL from srcset (pick ~600w)
      if (!imgSrc && sourceEl) {
        const srcset = sourceEl.getAttribute('srcset') || '';
        const match = srcset.match(/(https?:\\/\\/[^\\s]+width=600[^\\s]*)/);
        if (match) imgSrc = match[1];
        else {
          // Just grab the first URL from srcset
          const firstMatch = srcset.match(/(https?:\\/\\/[^\\s,]+)/);
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

function unwrapApifyItems(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = []
  for (const item of items) {
    if (Array.isArray(item)) {
      results.push(...item)
    } else if (item && typeof item === 'object' && !item['#error']) {
      results.push(item)
    }
  }
  return results
}

export function createHuurwoningenAdapter(apiToken: string): ScraperAdapter {
  const getActorInput = () => {
    const startUrls = scrapeFilters.cities.map(city => ({
      url: `https://www.huurwoningen.nl/in/${city}/?price=${scrapeFilters.minPrice}-${scrapeFilters.maxPrice}`,
    }))
    return {
      startUrls,
      pageFunction: PAGE_FUNCTION,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
      },
      useChrome: true,
      launchContext: {
        useChrome: true,
        stealth: true,
      },
      maxPagesPerCrawl: startUrls.length * 10,
    }
  }

  return {
    getSourceId() {
      return 'huurwoningen'
    },

    getActorInput,

    async healthCheck(): Promise<boolean> {
      return !!apiToken
    },

    async startAsync(webhookUrl: string) {
      console.log(`[huurwoningen] Starting async run...`)
      return startApifyActor(ACTOR_ID, getActorInput(), apiToken, webhookUrl)
    },

    normalizeResults(items: Record<string, unknown>[]): RawListing[] {
      const allResults = unwrapApifyItems(items)
      console.log(`[huurwoningen] Unwrapped ${allResults.length} items from ${items.length} raw`)
      const listings: RawListing[] = []
      for (const item of allResults) {
        const normalized = normalizeResult(item)
        if (normalized) listings.push(normalized)
      }
      console.log(`[huurwoningen] Normalized ${listings.length} listings`)
      return listings
    },

    async fetchListings(): Promise<RawListing[]> {
      console.log(`[huurwoningen] Scraping ${scrapeFilters.cities.length} cities...`)
      try {
        const items = await runApifyActor(ACTOR_ID, getActorInput(), apiToken)
        console.log(`[huurwoningen] Apify returned ${items.length} items`)
        return this.normalizeResults(items)
      } catch (error) {
        console.error('[huurwoningen] Scraping failed:', error)
        return []
      }
    },
  }
}
