<script setup lang="ts">
import type { SearchProfile, NotificationSettings } from '~~/types/search-profile'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const { data: profiles } = await useAsyncData('notif-profiles', async () => {
  const { data } = await supabase
    .from('search_profiles')
    .select('*, notification_settings(*)')
    .eq('user_id', user.value!.id)

  return data as Array<SearchProfile & { notification_settings: NotificationSettings[] }>
})

const frequencyOptions = [
  { label: 'Dagelijks', value: 'daily' },
  { label: 'Wekelijks', value: 'weekly' },
]

async function toggleChannel(profileId: string, channel: 'email' | 'whatsapp', active: boolean) {
  if (active) {
    await supabase.from('notification_settings').upsert({
      search_profile_id: profileId,
      channel,
      frequency: 'daily',
      active: true,
    }, { onConflict: 'search_profile_id,channel' })
  } else {
    await supabase
      .from('notification_settings')
      .update({ active: false })
      .eq('search_profile_id', profileId)
      .eq('channel', channel)
  }
}

async function updateFrequency(profileId: string, channel: 'email' | 'whatsapp', frequency: string) {
  await supabase
    .from('notification_settings')
    .update({ frequency })
    .eq('search_profile_id', profileId)
    .eq('channel', channel)
}

function getSettingForChannel(settings: NotificationSettings[], channel: string): NotificationSettings | undefined {
  return settings.find(s => s.channel === channel)
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

    <h1 class="text-2xl font-bold mb-6">Notificatie-instellingen</h1>

    <div v-if="!profiles?.length" class="text-center py-12 text-gray-500">
      <UIcon name="i-lucide-bell-off" class="size-12 mx-auto mb-4" />
      <p>Maak eerst een zoekprofiel aan om notificaties in te stellen.</p>
      <UButton to="/dashboard/profiel/nieuw" label="Maak zoekprofiel" class="mt-4" />
    </div>

    <div v-else class="space-y-6 max-w-lg">
      <UCard v-for="profile in profiles" :key="profile.id">
        <h3 class="font-semibold mb-4">{{ profile.name }}</h3>

        <!-- Email -->
        <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-mail" class="size-5 text-gray-500" />
            <span>E-mail</span>
          </div>
          <div class="flex items-center gap-3">
            <USelect
              v-if="getSettingForChannel(profile.notification_settings, 'email')?.active"
              :model-value="getSettingForChannel(profile.notification_settings, 'email')?.frequency || 'daily'"
              :items="frequencyOptions"
              size="sm"
              @update:model-value="updateFrequency(profile.id, 'email', $event as string)"
            />
            <USwitch
              :model-value="getSettingForChannel(profile.notification_settings, 'email')?.active || false"
              @update:model-value="toggleChannel(profile.id, 'email', $event)"
            />
          </div>
        </div>

        <!-- WhatsApp -->
        <div class="flex items-center justify-between py-3">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-message-circle" class="size-5 text-gray-500" />
            <span>WhatsApp</span>
          </div>
          <div class="flex items-center gap-3">
            <USelect
              v-if="getSettingForChannel(profile.notification_settings, 'whatsapp')?.active"
              :model-value="getSettingForChannel(profile.notification_settings, 'whatsapp')?.frequency || 'daily'"
              :items="frequencyOptions"
              size="sm"
              @update:model-value="updateFrequency(profile.id, 'whatsapp', $event as string)"
            />
            <USwitch
              :model-value="getSettingForChannel(profile.notification_settings, 'whatsapp')?.active || false"
              @update:model-value="toggleChannel(profile.id, 'whatsapp', $event)"
            />
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
