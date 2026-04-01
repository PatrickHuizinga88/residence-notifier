<script setup lang="ts">
import type { Listing } from '~~/types/listing'
import type { SearchProfile } from '~~/types/search-profile'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const { data: searchProfiles } = useAsyncData('search-profiles', async () => {
  const { data } = await supabase
    .from('search_profiles')
    .select('*')
    .eq('user_id', user.value!.id)
    .order('created_at', { ascending: false })

  return data as SearchProfile[]
})

const { data: favorites } = useAsyncData('favorites', async () => {
  const { data } = await supabase
    .from('favorites')
    .select('listing_id, created_at, listings(*)')
    .eq('user_id', user.value!.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return data as Array<{ listing_id: string; created_at: string; listings: Listing }>
})

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
    <h1 class="text-2xl font-bold mb-8">Dashboard</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Search Profiles -->
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Zoekprofielen</h2>
          <UButton
            to="/dashboard/profiel/nieuw"
            label="Nieuw profiel"
            icon="i-lucide-plus"
            size="sm"
          />
        </div>

        <div v-if="!searchProfiles?.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-lucide-search" class="size-8 mx-auto mb-2" />
          <p>Nog geen zoekprofielen. Maak er een aan om matches te ontvangen.</p>
        </div>

        <div v-else class="space-y-3">
          <UCard
            v-for="profile in searchProfiles"
            :key="profile.id"
            class="cursor-pointer hover:shadow-md transition-shadow"
            @click="navigateTo(`/dashboard/profiel/${profile.id}`)"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium">{{ profile.name }}</h3>
                <p class="text-sm text-gray-500">
                  {{ profile.city || 'Alle steden' }}
                  <span v-if="profile.max_price"> &middot; max {{ formatPrice(profile.max_price) }}</span>
                  <span v-if="profile.min_surface_m2"> &middot; {{ profile.min_surface_m2 }}+ m²</span>
                </p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-5 text-gray-400" />
            </div>
          </UCard>
        </div>
      </div>

      <!-- Favorites -->
      <div>
        <h2 class="text-lg font-semibold mb-4">Favorieten</h2>

        <div v-if="!favorites?.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-lucide-heart" class="size-8 mx-auto mb-2" />
          <p>Nog geen favorieten opgeslagen.</p>
        </div>

        <div v-else class="space-y-3">
          <UCard
            v-for="fav in favorites"
            :key="fav.listing_id"
            class="cursor-pointer hover:shadow-md transition-shadow"
            @click="navigateTo(`/woningen/${fav.listing_id}`)"
          >
            <div class="flex items-center gap-4">
              <div class="w-16 h-12 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden flex-shrink-0">
                <img
                  v-if="fav.listings.images?.length"
                  :src="fav.listings.images[0]"
                  class="w-full h-full object-cover"
                />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="font-medium truncate">{{ fav.listings.title }}</h3>
                <p class="text-sm text-gray-500">
                  {{ formatPrice(fav.listings.price_monthly) }}/mnd &middot; {{ fav.listings.city }}
                </p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </UContainer>
</template>
