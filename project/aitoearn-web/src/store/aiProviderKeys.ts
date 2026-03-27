import { createPersistStore } from '@/utils/createPersistStore'

export interface AiProviderKeys {
  groqApiKey: string
  geminiApiKey: string
}

interface AiProviderKeysState {
  keys: AiProviderKeys
}

const DEFAULT_KEYS: AiProviderKeys = {
  groqApiKey: '',
  geminiApiKey: '',
}

export const useAiProviderKeysStore = createPersistStore(
  {
    keys: DEFAULT_KEYS,
  } as AiProviderKeysState,
  (set, get) => ({
    updateKeys(partial: Partial<AiProviderKeys>) {
      set({
        keys: {
          ...get().keys,
          ...partial,
        },
      })
    },
    clearKeys() {
      set({ keys: { ...DEFAULT_KEYS } })
    },
  }),
  {
    name: 'ai-provider-keys',
    version: 1,
  },
  'localStorage',
)
