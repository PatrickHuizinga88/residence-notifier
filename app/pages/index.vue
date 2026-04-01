<script setup lang="ts">
const city = ref('')
const maxPrice = ref<number | undefined>()

function search() {
  const query: Record<string, string> = {}
  if (city.value) query.city = city.value
  if (maxPrice.value) query.max_price = String(maxPrice.value)
  navigateTo({ path: '/woningen', query })
}
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-24 bg-gradient-to-b from-primary-50 to-white dark:from-primary-950 dark:to-gray-950">
      <UContainer>
        <div class="max-w-2xl mx-auto text-center">
          <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">
            Vind je huurwoning sneller met
            <span class="text-primary">HuurRadar</span>
          </h1>
          <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Alle huurwoningen van de grootste platforms op één plek. Met AI-matching en slimme notificaties mis je nooit meer een woning.
          </p>

          <!-- Search bar -->
          <form class="mt-8 flex flex-col sm:flex-row gap-3" @submit.prevent="search">
            <UInput
              v-model="city"
              placeholder="Stad (bijv. Amsterdam)"
              icon="i-lucide-map-pin"
              size="lg"
              class="flex-1"
            />
            <UInput
              v-model="maxPrice"
              type="number"
              placeholder="Max. huurprijs"
              icon="i-lucide-euro"
              size="lg"
              class="flex-1"
            />
            <UButton
              type="submit"
              label="Zoeken"
              icon="i-lucide-search"
              size="lg"
            />
          </form>
        </div>
      </UContainer>
    </section>

    <!-- Features -->
    <section class="py-16">
      <UContainer>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div class="text-center">
            <div class="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900 mb-4">
              <UIcon name="i-lucide-layers" class="size-6 text-primary" />
            </div>
            <h3 class="font-semibold text-lg">5 Bronnen, 1 Platform</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              Funda, Pararius, Huurwoningen.nl, Kamernet en HuurStunt — alles op één plek.
            </p>
          </div>
          <div class="text-center">
            <div class="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900 mb-4">
              <UIcon name="i-lucide-brain" class="size-6 text-primary" />
            </div>
            <h3 class="font-semibold text-lg">AI-powered Matching</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              Slimme scores op basis van jouw zoekprofiel. Meer dan alleen filters.
            </p>
          </div>
          <div class="text-center">
            <div class="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900 mb-4">
              <UIcon name="i-lucide-bell" class="size-6 text-primary" />
            </div>
            <h3 class="font-semibold text-lg">WhatsApp & E-mail Alerts</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              Ontvang dagelijks of wekelijks een overzicht van nieuwe matches.
            </p>
          </div>
        </div>
      </UContainer>
    </section>
  </div>
</template>
