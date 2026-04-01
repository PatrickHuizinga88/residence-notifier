<script setup lang="ts">
const user = useSupabaseUser()

watch(user, (val) => {
  if (val) {
    navigateTo('/dashboard')
  }
}, { immediate: true })
</script>

<template>
  <UContainer class="py-16">
    <div class="text-center">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary mx-auto" />
      <p class="mt-4 text-gray-500">Bezig met inloggen...</p>
    </div>
  </UContainer>
</template>
