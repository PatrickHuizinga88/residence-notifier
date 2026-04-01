<script setup lang="ts">
import type { Listing } from '~~/types/listing'

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const { data: listing, status } = useAsyncData(`listing-${route.params.id}`, async () => {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', route.params.id)
    .single()

  if (error) throw error
  return data as Listing
})

const isFavorited = ref(false)

watch([user, listing], async () => {
  if (user.value && listing.value) {
    const { data } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.value.id)
      .eq('listing_id', listing.value.id)
      .maybeSingle()
    isFavorited.value = !!data
  }
}, { immediate: true })

async function toggleFavorite() {
  if (!user.value || !listing.value) {
    navigateTo('/login')
    return
  }

  if (isFavorited.value) {
    await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.value.id)
      .eq('listing_id', listing.value.id)
    isFavorited.value = false
  } else {
    await supabase
      .from('favorites')
      .insert({ user_id: user.value.id, listing_id: listing.value.id })
    isFavorited.value = true
  }
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

const propertyTypeLabels: Record<string, string> = {
  apartment: 'Appartement',
  house: 'Huis',
  room: 'Kamer',
  studio: 'Studio',
}

const furnishedLabels: Record<string, string> = {
  furnished: 'Gemeubileerd',
  unfurnished: 'Ongemeubileerd',
  negotiable: 'Bespreekbaar',
}
</script>

<template>
  <UContainer class="py-8">
    <div v-if="status === 'pending'" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
    </div>

    <div v-else-if="listing">
      <!-- Back button -->
      <UButton
        to="/woningen"
        icon="i-lucide-arrow-left"
        label="Terug naar overzicht"
        variant="ghost"
        color="neutral"
        class="mb-6"
      />

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Main content -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Images -->
          <div class="aspect-video bg-gray-200 dark:bg-gray-800 rounded-xl overflow-hidden">
            <img
              v-if="listing.images?.length"
              :src="listing.images[0]"
              :alt="listing.title"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-lucide-image" class="size-16 text-gray-400" />
            </div>
          </div>

          <!-- Image thumbnails -->
          <div v-if="listing.images && listing.images.length > 1" class="flex gap-2 overflow-x-auto">
            <img
              v-for="(img, i) in listing.images.slice(1, 6)"
              :key="i"
              :src="img"
              :alt="`${listing.title} foto ${i + 2}`"
              class="w-24 h-16 object-cover rounded-lg flex-shrink-0"
            />
          </div>

          <!-- Description -->
          <div v-if="listing.description">
            <h2 class="text-lg font-semibold mb-2">Beschrijving</h2>
            <p class="text-gray-600 dark:text-gray-400 whitespace-pre-line">{{ listing.description }}</p>
          </div>

          <!-- AI Summary -->
          <UCard v-if="listing.ai_summary">
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-brain" class="size-5 text-primary mt-0.5" />
              <div>
                <h3 class="font-semibold text-sm text-primary mb-1">AI Analyse</h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ listing.ai_summary }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <UCard>
            <div class="space-y-4">
              <div class="flex items-start justify-between">
                <div>
                  <h1 class="text-xl font-bold">{{ listing.title }}</h1>
                  <p class="text-gray-500 mt-1">
                    {{ listing.address || listing.neighborhood || listing.city }}
                    <span v-if="listing.postal_code">, {{ listing.postal_code }}</span>
                  </p>
                </div>
                <UBadge
                  v-if="listing.ai_score"
                  :color="listing.ai_score >= 0.7 ? 'success' : listing.ai_score >= 0.4 ? 'warning' : 'error'"
                  size="lg"
                >
                  {{ Math.round(listing.ai_score * 100) }}% match
                </UBadge>
              </div>

              <p class="text-3xl font-bold text-primary">
                {{ formatPrice(listing.price_monthly) }}
                <span class="text-sm font-normal text-gray-500">/mnd</span>
              </p>

              <USeparator />

              <!-- Details -->
              <dl class="space-y-3 text-sm">
                <div v-if="listing.surface_m2" class="flex justify-between">
                  <dt class="text-gray-500">Oppervlakte</dt>
                  <dd class="font-medium">{{ listing.surface_m2 }} m²</dd>
                </div>
                <div v-if="listing.rooms" class="flex justify-between">
                  <dt class="text-gray-500">Kamers</dt>
                  <dd class="font-medium">{{ listing.rooms }}</dd>
                </div>
                <div v-if="listing.bedrooms" class="flex justify-between">
                  <dt class="text-gray-500">Slaapkamers</dt>
                  <dd class="font-medium">{{ listing.bedrooms }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-gray-500">Type</dt>
                  <dd class="font-medium">{{ propertyTypeLabels[listing.property_type] }}</dd>
                </div>
                <div v-if="listing.furnished" class="flex justify-between">
                  <dt class="text-gray-500">Inrichting</dt>
                  <dd class="font-medium">{{ furnishedLabels[listing.furnished] }}</dd>
                </div>
                <div v-if="listing.energy_label" class="flex justify-between">
                  <dt class="text-gray-500">Energielabel</dt>
                  <dd class="font-medium">{{ listing.energy_label }}</dd>
                </div>
                <div v-if="listing.available_from" class="flex justify-between">
                  <dt class="text-gray-500">Beschikbaar vanaf</dt>
                  <dd class="font-medium">{{ new Date(listing.available_from).toLocaleDateString('nl-NL') }}</dd>
                </div>
                <div v-if="listing.pets_allowed !== null" class="flex justify-between">
                  <dt class="text-gray-500">Huisdieren</dt>
                  <dd class="font-medium">{{ listing.pets_allowed ? 'Toegestaan' : 'Niet toegestaan' }}</dd>
                </div>
              </dl>

              <USeparator />

              <div class="flex flex-col gap-2">
                <UButton
                  :to="listing.source_url"
                  target="_blank"
                  label="Bekijk op bron"
                  icon="i-lucide-external-link"
                  block
                />
                <UButton
                  :icon="isFavorited ? 'i-lucide-heart' : 'i-lucide-heart'"
                  :label="isFavorited ? 'Verwijder uit favorieten' : 'Opslaan als favoriet'"
                  :color="isFavorited ? 'error' : 'neutral'"
                  variant="outline"
                  block
                  @click="toggleFavorite"
                />
              </div>

              <div class="flex items-center gap-2 text-xs text-gray-400">
                <UBadge variant="subtle" color="neutral" size="xs">{{ listing.source }}</UBadge>
                <span>Gezien op {{ new Date(listing.first_seen_at).toLocaleDateString('nl-NL') }}</span>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </UContainer>
</template>
