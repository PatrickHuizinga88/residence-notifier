<script setup lang="ts">
const user = useSupabaseUser()

const navLinks = [
  { label: 'Woningen', to: '/woningen', icon: 'i-lucide-home' },
]

const userMenuItems = computed(() => {
  if (user.value) {
    return [[
      { label: 'Dashboard', to: '/dashboard', icon: 'i-lucide-layout-dashboard' },
      { label: 'Uitloggen', icon: 'i-lucide-log-out', click: logout },
    ]]
  }
  return [[
    { label: 'Inloggen', to: '/login', icon: 'i-lucide-log-in' },
  ]]
})

const supabase = useSupabaseClient()

async function logout() {
  await supabase.auth.signOut()
  navigateTo('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <UContainer>
      <header class="flex items-center justify-between py-4">
        <NuxtLink to="/" class="flex items-center gap-2 text-xl font-bold text-primary">
          <UIcon name="i-lucide-radar" class="size-6" />
          HuurRadar
        </NuxtLink>

        <nav class="flex items-center gap-1">
          <UButton
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            :label="link.label"
            :icon="link.icon"
            variant="ghost"
            color="neutral"
          />

          <!-- Ingelogd: dropdown met dashboard/uitloggen -->
          <UDropdownMenu v-if="user" :items="userMenuItems">
            <UButton
              icon="i-lucide-user"
              variant="ghost"
              color="neutral"
            />
          </UDropdownMenu>

          <!-- Niet ingelogd: directe link -->
          <UButton
            v-else
            to="/login"
            label="Inloggen"
            icon="i-lucide-log-in"
            variant="ghost"
            color="neutral"
          />
        </nav>
      </header>
    </UContainer>

    <main>
      <slot />
    </main>

    <footer class="border-t border-gray-200 dark:border-gray-800 mt-16">
      <UContainer>
        <div class="py-8 text-center text-sm text-gray-500">
          &copy; {{ new Date().getFullYear() }} HuurRadar — Open source huurwoning aggregator
        </div>
      </UContainer>
    </footer>
  </div>
</template>
