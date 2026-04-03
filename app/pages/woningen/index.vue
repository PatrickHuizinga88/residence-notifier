<script setup lang="ts">
import type { Listing, PropertyType } from '~~/types/listing'

const route = useRoute()
const supabase = useSupabaseClient()

const cityOptions = [
  { label: 'Eindhoven', value: 'Eindhoven' },
  { label: 'Boxtel', value: 'Boxtel' },
  { label: 'Veghel', value: 'Veghel' },
]

const filters = reactive({
  cities: ['Eindhoven', 'Boxtel', 'Veghel'] as string[],
  maxPrice: route.query.max_price ? Number(route.query.max_price) : undefined,
  minSurface: undefined as number | undefined,
  minRooms: undefined as number | undefined,
  propertyType: '' as PropertyType | '',
})

const { data: listings, status } = useAsyncData('listings', async () => {
  let query = supabase
    .from('listings')
    .select('*')
    .eq('status', 'active')
    .order('first_seen_at', { ascending: false })
    .limit(50)

  if (filters.cities.length) {
    query = query.in('city', filters.cities)
  }
  if (filters.maxPrice) {
    query = query.lte('price_monthly', filters.maxPrice * 100)
  }
  if (filters.minSurface) {
    query = query.gte('surface_m2', filters.minSurface)
  }
  if (filters.minRooms) {
    query = query.gte('rooms', filters.minRooms)
  }
  if (filters.propertyType) {
    query = query.eq('property_type', filters.propertyType)
  }

  const { data, error } = await query

  if (error) throw error
  return data as Listing[]
}, {
  watch: [() => [...filters.cities], () => filters.maxPrice, () => filters.minSurface, () => filters.minRooms, () => filters.propertyType],
})

const propertyTypeOptions = [
  { label: 'Alle types', value: '' },
  { label: 'Appartement', value: 'apartment' },
  { label: 'Huis', value: 'house' },
  { label: 'Kamer', value: 'room' },
  { label: 'Studio', value: 'studio' },
]

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}
</script>

<template>
  <UContainer class="py-8">
    <h1 class="text-2xl font-bold mb-6">Huurwoningen</h1>

    <!-- Filters -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8 items-end">
      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Steden</span>
        <div class="flex flex-wrap gap-3">
          <UCheckbox
            v-for="city in cityOptions"
            :key="city.value"
            :label="city.label"
            :model-value="filters.cities.includes(city.value)"
            @update:model-value="(checked: boolean) => {
              if (checked) filters.cities.push(city.value)
              else filters.cities = filters.cities.filter(c => c !== city.value)
            }"
          />
        </div>
      </div>
      <UInput
        v-model="filters.maxPrice"
        type="number"
        placeholder="Max. prijs (€)"
        icon="i-lucide-euro"
      />
      <UInput
        v-model="filters.minSurface"
        type="number"
        placeholder="Min. m²"
        icon="i-lucide-maximize"
      />
      <UInput
        v-model="filters.minRooms"
        type="number"
        placeholder="Min. kamers"
        icon="i-lucide-door-open"
      />
      <USelect
        v-model="filters.propertyType"
        :items="propertyTypeOptions"
      />
    </div>

    <!-- Results -->
    <div v-if="status === 'pending'" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
    </div>

    <div v-else-if="!listings?.length" class="text-center py-12 text-gray-500">
      <UIcon name="i-lucide-search-x" class="size-12 mx-auto mb-4" />
      <p>Geen woningen gevonden. Pas je filters aan.</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <UCard
        v-for="listing in listings"
        :key="listing.id"
        class="hover:shadow-lg transition-shadow cursor-pointer"
        @click="navigateTo(`/woningen/${listing.id}`)"
      >
        <!-- Listing image -->
        <div class="aspect-video bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden mb-4">
          <img
            v-if="listing.images?.length"
            :src="listing.images[0]"
            :alt="listing.title"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon name="i-lucide-image" class="size-12 text-gray-400" />
          </div>
        </div>

        <!-- Content -->
        <div class="space-y-2">
          <div class="flex items-start justify-between">
            <h3 class="font-semibold line-clamp-1">{{ listing.title }}</h3>
            <UBadge
              v-if="listing.ai_score"
              :color="listing.ai_score >= 0.7 ? 'success' : listing.ai_score >= 0.4 ? 'warning' : 'error'"
              variant="subtle"
            >
              {{ Math.round(listing.ai_score * 100) }}%
            </UBadge>
          </div>

          <p class="text-2xl font-bold text-primary">
            {{ formatPrice(listing.price_monthly) }}
            <span class="text-sm font-normal text-gray-500">/mnd</span>
          </p>

          <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-map-pin" class="size-4" />
              {{ listing.city }}
            </span>
            <span v-if="listing.surface_m2" class="flex items-center gap-1">
              <UIcon name="i-lucide-maximize" class="size-4" />
              {{ listing.surface_m2 }} m²
            </span>
            <span v-if="listing.rooms" class="flex items-center gap-1">
              <UIcon name="i-lucide-door-open" class="size-4" />
              {{ listing.rooms }} kamers
            </span>
          </div>

          <div class="flex items-center gap-2">
            <UBadge variant="subtle" color="neutral" size="sm">
              {{ listing.source }}
            </UBadge>
            <UBadge variant="subtle" color="neutral" size="sm">
              {{ listing.property_type }}
            </UBadge>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
