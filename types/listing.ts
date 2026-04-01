export type PropertyType = 'apartment' | 'house' | 'room' | 'studio'
export type FurnishedStatus = 'furnished' | 'unfurnished' | 'negotiable'
export type LandlordType = 'agency' | 'private' | 'housing_corp'
export type ListingStatus = 'active' | 'rented' | 'expired'

export interface Listing {
  id: string
  source: string
  source_url: string
  source_listing_id: string
  title: string
  description: string | null
  price_monthly: number
  price_includes: string[] | null
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
  furnished: FurnishedStatus | null
  available_from: string | null
  minimum_stay_months: number | null
  energy_label: string | null
  images: string[] | null
  landlord_type: LandlordType | null
  pets_allowed: boolean | null
  income_requirement: number | null
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
  price_monthly: number
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
  furnished?: FurnishedStatus
  available_from?: string
  minimum_stay_months?: number
  energy_label?: string
  images?: string[]
  landlord_type?: LandlordType
  pets_allowed?: boolean
  income_requirement?: number
}

export interface ScraperAdapter {
  fetchListings(): Promise<RawListing[]>
  getSourceId(): string
  healthCheck(): Promise<boolean>
}
