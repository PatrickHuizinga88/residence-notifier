import type { PropertyType, FurnishedStatus } from './listing'

export interface SearchProfile {
  id: string
  user_id: string
  name: string
  city: string | null
  neighborhoods: string[] | null
  min_price: number | null
  max_price: number | null
  min_surface_m2: number | null
  min_rooms: number | null
  min_bedrooms: number | null
  property_types: PropertyType[] | null
  furnished: FurnishedStatus[] | null
  radius_km: number | null
  center_latitude: number | null
  center_longitude: number | null
  created_at: string
  updated_at: string
}

export type NotificationChannel = 'email' | 'whatsapp'
export type NotificationFrequency = 'daily' | 'weekly'

export interface NotificationSettings {
  id: string
  search_profile_id: string
  channel: NotificationChannel
  frequency: NotificationFrequency
  active: boolean
  created_at: string
  updated_at: string
}
