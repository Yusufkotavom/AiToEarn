/**
 * navigation.ts - 导航栏数据
 * Welcome 页面的 Navigation 使用
 */

import { DOCS_URL } from '@/app/layout/shared/constants'

export interface NavItem {
  type: 'link'
  labelKey: string // i18n key
  href: string
  external?: boolean
}

export const navigation: NavItem[] = [
  { type: 'link', labelKey: 'docs', href: DOCS_URL, external: true },
  { type: 'link', labelKey: 'aiSocial', href: '/ai-social' },
]
