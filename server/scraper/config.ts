/**
 * Standaard scraping filters voor HuurRadar.
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

  /** Maximale huurprijs in euro's */
  maxPrice: 1500,

  /** Minimale oppervlakte in m² */
  minSurface: 25,
}
