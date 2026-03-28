'use client'

import type { MetadataAiProvider, MetadataApplyStrategy } from './metadataAiSettingsStore'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DEFAULT_METADATA_PROMPT_TEMPLATE, METADATA_PROVIDER_MODELS } from './metadataAiSettingsStore'

interface MetadataAiSettingsDialogProps {
  open: boolean
  provider: MetadataAiProvider
  model?: string
  strategy: MetadataApplyStrategy
  promptTemplate: string
  onOpenChange: (open: boolean) => void
  onProviderChange: (provider: MetadataAiProvider) => void
  onModelChange: (model: string) => void
  onStrategyChange: (strategy: MetadataApplyStrategy) => void
  onPromptTemplateChange: (value: string) => void
  onSave: () => void
}

const providerOptions: MetadataAiProvider[] = ['auto', 'groq', 'gemini']
const strategyOptions: MetadataApplyStrategy[] = ['replace_empty', 'replace_all']

const MetadataAiSettingsDialog = memo(({
  open,
  provider,
  model,
  strategy,
  promptTemplate,
  onOpenChange,
  onProviderChange,
  onModelChange,
  onStrategyChange,
  onPromptTemplateChange,
  onSave,
}: MetadataAiSettingsDialogProps) => {
  const { t } = useTranslation('brandPromotion')
  const modelOptions = provider === 'auto' ? [] : METADATA_PROVIDER_MODELS[provider]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{t('createMaterial.metadataAiSettingsTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            {t('createMaterial.apiKeyLocationHint')}
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('createMaterial.metadataProviderLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {providerOptions.map(option => (
                <Button
                  key={option}
                  type="button"
                  variant={provider === option ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onProviderChange(option)}
                  className="capitalize"
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('createMaterial.metadataModelLabel')}</p>
            <input
              value={model || ''}
              onChange={e => onModelChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t('createMaterial.metadataModelPlaceholder')}
            />
            {modelOptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {modelOptions.map(option => (
                  <Button
                    key={option}
                    type="button"
                    variant={model === option ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onModelChange(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('createMaterial.metadataApplyStrategyLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {strategyOptions.map(option => (
                <Button
                  key={option}
                  type="button"
                  variant={strategy === option ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onStrategyChange(option)}
                >
                  {option === 'replace_empty'
                    ? t('createMaterial.metadataApplyReplaceEmpty')
                    : t('createMaterial.metadataApplyReplaceAll')}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t('createMaterial.metadataPromptTemplateLabel')}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onPromptTemplateChange(DEFAULT_METADATA_PROMPT_TEMPLATE)}
              >
                {t('createMaterial.metadataResetPrompt')}
              </Button>
            </div>
            <textarea
              value={promptTemplate}
              onChange={e => onPromptTemplateChange(e.target.value)}
              className="w-full min-h-[190px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t('createMaterial.metadataPromptTemplatePlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onSave}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

MetadataAiSettingsDialog.displayName = 'MetadataAiSettingsDialog'

export default MetadataAiSettingsDialog
