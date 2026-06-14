/**
 * Standaard scraping filters voor KoopRadar.
 * Pas deze aan naar je eigen voorkeuren.
 */
export const scrapeFilters = {
  /** Steden om te scrapen */
  cities: [
    'eindhoven',
    // 'son-en-breugel',
    // 'best',
    // 'oirschot',
    'boxtel',
    // 'sint-michielsgestel',
    // 'vught',
    // 'den-bosch',
    // 'helmond',
    // 'nuenen',
    // 'geldrop',
    // 'veldhoven',
    'veghel',
  ],

  /** Minimale koopprijs in euro's */
  minPrice: 200000,

  /** Maximale koopprijs in euro's */
  maxPrice: 500000,

  /** Minimale oppervlakte in m² */
  minSurface: 50,
}
