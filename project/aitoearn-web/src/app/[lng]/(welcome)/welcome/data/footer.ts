/**
 * footer.ts - 页脚数据
 * 包含页脚链接和配置信息
 */

import { DOCS_URL } from '@/app/layout/shared/constants'

export interface FooterLink {
  label: string
  href: string
  external?: boolean
}

// CTA 区块配置
export const footerCTA = {
  href: '/auth/login',
}

// 法律与协议
export const footerLegal: FooterLink[] = [
  { label: 'privacy', href: '/websit/privacy-policy' },
  { label: 'terms', href: '/websit/terms-of-service' },
  { label: 'dataProtection', href: '/websit/data-protection-agreement' },
  { label: 'dataDeletion', href: '/websit/data-deletion' },
  { label: 'pluginGuide', href: '/websit/plugin-guide' },
  { label: 'extensionPrivacy', href: '/websit/extension-privacy-policy' },
]

// 资源链接
export const footerResources: FooterLink[] = [
  { label: 'docs', href: DOCS_URL, external: true },
]

// 账户链接
export const footerAccount: FooterLink[] = [
  { label: 'login', href: '/auth/login' },
]

// 联系信息
export const footerContact = {
  email: 'hello@aiearn.ai',
  emailHref: 'mailto:hello@aiearn.ai',
  github: 'https://github.com/yikart/aitoearn',
}
