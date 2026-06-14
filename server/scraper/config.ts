/**
 * Standaard scraping filters voor KoopRadar.
 * Pas deze aan naar je eigen voorkeuren.
 */
export const scrapeFilters = {
  /**
   * Steden / gemeentes om te scrapen (URL-slugs).
   * Let op: voor gemeentes die meerdere plaatsen bundelen (bijv. Meierijstad,
   * Bernheze) kan de exacte slug per bron (Funda/Pararius) afwijken.
   */
  cities: [
    'eindhoven',
    'best',
    'son-en-breugel',
    'nuenen',
    'meierijstad',
    'boxtel',
    'sint-michielsgestel',
    'vught',
    'oirschot',
    'bernheze',
    // 'den-bosch',
    // 'helmond',
    // 'geldrop',
    // 'veldhoven',
  ],

  /** Minimale koopprijs in euro's */
  minPrice: 200000,

  /** Maximale koopprijs in euro's */
  maxPrice: 270000,

  /** Minimale oppervlakte in m² */
  minSurface: 50,
}
