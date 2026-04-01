import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const url = query.url as string || 'https://www.pararius.nl/huurwoningen/nederland'

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    },
  })

  const html = await response.text()

  const cheerio = await import('cheerio')
  const $ = cheerio.load(html)

  // Try to find listing elements with various selectors
  const selectors = [
    'li.search-list__item--listing',
    '.listing-search-item',
    '.search-list__item',
    'section.listing-search-item',
    '[class*="listing-search"]',
    '[class*="search-list"]',
    '[data-listing-id]',
    'a[href*="/huurwoning"]',
  ]

  const selectorResults: Record<string, number> = {}
  for (const selector of selectors) {
    selectorResults[selector] = $(selector).length
  }

  // Get a sample of the HTML structure to help debug
  const bodyClasses = $('body').attr('class') || 'none'
  const mainContent = $('main').length ? 'found' : 'not found'

  // Get the first few elements that look like listing containers
  const potentialListings: string[] = []
  $('[class*="listing"], [class*="search-list"], [class*="property"]').each((i, el) => {
    if (i < 5) {
      const tag = el.tagName
      const className = $(el).attr('class') || ''
      const childCount = $(el).children().length
      potentialListings.push(`<${tag} class="${className}"> (${childCount} children)`)
    }
  })

  // Get all links that contain "huurwoning"
  const huurwoningLinks: string[] = []
  $('a[href*="/huurwoning"]').each((i, el) => {
    if (i < 10) {
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim().slice(0, 80)
      const parentClass = $(el).parent().attr('class') || ''
      huurwoningLinks.push({ href, text, parentClass } as any)
    }
  })

  return {
    status: response.status,
    htmlLength: html.length,
    title: $('title').text(),
    bodyClasses,
    mainContent,
    selectorResults,
    potentialListings,
    huurwoningLinks,
    // First 2000 chars of body for manual inspection
    htmlSnippet: $('body').html()?.slice(0, 3000),
  }
})
