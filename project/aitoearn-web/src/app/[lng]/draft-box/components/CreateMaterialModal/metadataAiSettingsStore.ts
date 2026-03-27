import { createPersistStore } from '@/utils/createPersistStore'

export type MetadataAiProvider = 'auto' | 'groq' | 'gemini'
export type MetadataApplyStrategy = 'replace_empty' | 'replace_all'

export interface MetadataAiSettings {
  provider: MetadataAiProvider
  promptTemplate: string
  strategy: MetadataApplyStrategy
}

export const DEFAULT_METADATA_PROMPT_TEMPLATE = `You are a social media metadata assistant.

Expand and improve metadata using the context below.
Return strict JSON with keys: title, description, tags.

Context:
- Title: {{title}}
- Description: {{description}}
- Tags: {{tags}}
- Platforms: {{platforms}}

Rules:
1) Keep tone engaging and natural.
2) Do not invent false claims.
3) Keep title concise and platform-friendly.
4) Return 5-10 relevant tags.`

const DEFAULT_SETTINGS: MetadataAiSettings = {
  provider: 'auto',
  promptTemplate: DEFAULT_METADATA_PROMPT_TEMPLATE,
  strategy: 'replace_empty',
}

interface MetadataAiSettingsState {
  settings: MetadataAiSettings
}

export const useMetadataAiSettingsStore = createPersistStore(
  {
    settings: DEFAULT_SETTINGS,
  } as MetadataAiSettingsState,
  (set, get) => ({
    updateSettings(partial: Partial<MetadataAiSettings>) {
      set({
        settings: {
          ...get().settings,
          ...partial,
        },
      })
    },
    resetSettings() {
      set({ settings: { ...DEFAULT_SETTINGS } })
    },
  }),
  {
    name: 'create-material-metadata-ai-settings',
    version: 1,
  },
  'localStorage',
)
