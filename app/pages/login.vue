<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
const loading = ref(false)
const sent = ref(false)
const error = ref('')

async function loginWithMagicLink() {
  loading.value = true
  error.value = ''

  const { error: authError } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: {
      emailRedirectTo: `${window.location.origin}/confirm`,
    },
  })

  if (authError) {
    error.value = authError.message
  } else {
    sent.value = true
  }

  loading.value = false
}

async function loginWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/confirm`,
    },
  })
}
</script>

<template>
  <UContainer class="py-16">
    <div class="max-w-sm mx-auto">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold">Inloggen bij HuurRadar</h1>
        <p class="mt-2 text-gray-500">Log in om zoekprofielen en notificaties te beheren.</p>
      </div>

      <UCard>
        <div v-if="sent" class="text-center space-y-4">
          <UIcon name="i-lucide-mail-check" class="size-12 mx-auto text-primary" />
          <p class="font-medium">Check je e-mail!</p>
          <p class="text-sm text-gray-500">
            We hebben een inloglink gestuurd naar <strong>{{ email }}</strong>.
          </p>
        </div>

        <form v-else class="space-y-4" @submit.prevent="loginWithMagicLink">
          <UFormField label="E-mailadres">
            <UInput
              v-model="email"
              type="email"
              placeholder="je@email.nl"
              icon="i-lucide-mail"
              required
              class="w-full"
            />
          </UFormField>

          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

          <UButton
            type="submit"
            label="Stuur inloglink"
            icon="i-lucide-send"
            :loading="loading"
            block
          />

          <USeparator label="of" />

          <UButton
            label="Inloggen met Google"
            icon="i-lucide-chrome"
            color="neutral"
            variant="outline"
            block
            @click="loginWithGoogle"
          />
        </form>
      </UCard>
    </div>
  </UContainer>
</template>
