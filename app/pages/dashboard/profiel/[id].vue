<script setup lang="ts">
import type { PropertyType, FurnishedStatus } from '~~/types/listing'

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const isNew = route.params.id === 'nieuw'
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  name: '',
  city: '',
  min_price: undefined as number | undefined,
  max_price: undefined as number | undefined,
  min_surface_m2: undefined as number | undefined,
  min_rooms: undefined as number | undefined,
  min_bedrooms: undefined as number | undefined,
  property_types: [] as PropertyType[],
  furnished: [] as FurnishedStatus[],
})

const propertyTypeOptions = [
  { label: 'Appartement', value: 'apartment' as const },
  { label: 'Huis', value: 'house' as const },
  { label: 'Kamer', value: 'room' as const },
  { label: 'Studio', value: 'studio' as const },
]

const furnishedOptions = [
  { label: 'Gemeubileerd', value: 'furnished' as const },
  { label: 'Ongemeubileerd', value: 'unfurnished' as const },
  { label: 'Bespreekbaar', value: 'negotiable' as const },
]

// Load existing profile
if (!isNew) {
  loading.value = true
  const { data } = await supabase
    .from('search_profiles')
    .select('*')
    .eq('id', route.params.id)
    .eq('user_id', user.value!.id)
    .single()

  if (data) {
    form.name = data.name
    form.city = data.city || ''
    form.min_price = data.min_price ? data.min_price / 100 : undefined
    form.max_price = data.max_price ? data.max_price / 100 : undefined
    form.min_surface_m2 = data.min_surface_m2 || undefined
    form.min_rooms = data.min_rooms || undefined
    form.min_bedrooms = data.min_bedrooms || undefined
    form.property_types = data.property_types || []
    form.furnished = data.furnished || []
  }
  loading.value = false
}

async function save() {
  saving.value = true

  const payload = {
    user_id: user.value!.id,
    name: form.name,
    city: form.city || null,
    min_price: form.min_price ? form.min_price * 100 : null,
    max_price: form.max_price ? form.max_price * 100 : null,
    min_surface_m2: form.min_surface_m2 || null,
    min_rooms: form.min_rooms || null,
    min_bedrooms: form.min_bedrooms || null,
    property_types: form.property_types.length ? form.property_types : null,
    furnished: form.furnished.length ? form.furnished : null,
  }

  if (isNew) {
    await supabase.from('search_profiles').insert(payload)
  } else {
    await supabase
      .from('search_profiles')
      .update(payload)
      .eq('id', route.params.id)
  }

  saving.value = false
  navigateTo('/dashboard')
}

async function remove() {
  if (!isNew) {
    await supabase.from('search_profiles').delete().eq('id', route.params.id)
    navigateTo('/dashboard')
  }
}
</script>

<template>
  <UContainer class="py-8">
    <UButton
      to="/dashboard"
      icon="i-lucide-arrow-left"
      label="Terug naar dashboard"
      variant="ghost"
      color="neutral"
      class="mb-6"
    />

    <h1 class="text-2xl font-bold mb-6">
      {{ isNew ? 'Nieuw zoekprofiel' : 'Zoekprofiel bewerken' }}
    </h1>

    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
    </div>

    <form v-else class="max-w-lg space-y-6" @submit.prevent="save">
      <UFormField label="Naam profiel" required>
        <UInput v-model="form.name" placeholder="Bijv. Amsterdam Centrum" required />
      </UFormField>

      <UFormField label="Stad">
        <UInput v-model="form.city" placeholder="Bijv. Amsterdam" icon="i-lucide-map-pin" />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Min. prijs (€)">
          <UInput v-model="form.min_price" type="number" placeholder="0" />
        </UFormField>
        <UFormField label="Max. prijs (€)">
          <UInput v-model="form.max_price" type="number" placeholder="2500" />
        </UFormField>
      </div>

      <UFormField label="Min. oppervlakte (m²)">
        <UInput v-model="form.min_surface_m2" type="number" placeholder="30" />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Min. kamers">
          <UInput v-model="form.min_rooms" type="number" placeholder="2" />
        </UFormField>
        <UFormField label="Min. slaapkamers">
          <UInput v-model="form.min_bedrooms" type="number" placeholder="1" />
        </UFormField>
      </div>

      <UFormField label="Woningtype">
        <div class="flex flex-wrap gap-2">
          <UCheckbox
            v-for="opt in propertyTypeOptions"
            :key="opt.value"
            v-model="form.property_types"
            :value="opt.value"
            :label="opt.label"
          />
        </div>
      </UFormField>

      <UFormField label="Inrichting">
        <div class="flex flex-wrap gap-2">
          <UCheckbox
            v-for="opt in furnishedOptions"
            :key="opt.value"
            v-model="form.furnished"
            :value="opt.value"
            :label="opt.label"
          />
        </div>
      </UFormField>

      <div class="flex gap-3">
        <UButton
          type="submit"
          :label="isNew ? 'Aanmaken' : 'Opslaan'"
          icon="i-lucide-save"
          :loading="saving"
        />
        <UButton
          v-if="!isNew"
          label="Verwijderen"
          icon="i-lucide-trash-2"
          color="error"
          variant="outline"
          @click="remove"
        />
      </div>
    </form>
  </UContainer>
</template>
