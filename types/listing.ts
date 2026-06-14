export type PropertyType = 'apartment' | 'house' | 'room' | 'studio'
export type ListingStatus = 'active' | 'sold' | 'expired'

export interface Listing {
  id: string
  source: string
  source_url: string
  source_listing_id: string
  title: string
  description: string | null
  price: number
  city: string
  neighborhood: string | null
  postal_code: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  surface_m2: number | null
  rooms: number | null
  bedrooms: number | null
  property_type: PropertyType
  energy_label: string | null
  images: string[] | null
  ai_score: number | null
  ai_summary: string | null
  status: ListingStatus
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface RawListing {
  source_listing_id: string
  source_url: string
  title: string
  description?: string
  price: number
  city: string
  neighborhood?: string
  postal_code?: string
  address?: string
  latitude?: number
  longitude?: number
  surface_m2?: number
  rooms?: number
  bedrooms?: number
  property_type: PropertyType
  energy_label?: string
  images?: string[]
}

export interface ScraperAdapter {
  fetchListings(): Promise<RawListing[]>
  startAsync(webhookUrl: string): Promise<{ runId: string; datasetId: string }>
  normalizeResults(items: Record<string, unknown>[]): RawListing[]
  getSourceId(): string
  healthCheck(): Promise<boolean>
  getActorInput(): Record<string, unknown>
}
