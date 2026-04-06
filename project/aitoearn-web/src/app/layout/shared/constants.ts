/**
 * 导航共享常量
 * MobileNav 和 LayoutSidebar 共用的常量配置
 */

/** GitHub 仓库地址 */
export const GITHUB_REPO = 'yikart/AiToEarn'

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'api.piiblog.net'

/** 主站地址 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || `https://${APP_DOMAIN}`

/** 文档网站地址 */
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.aitoearn.ai'

/** AI 功能开关（no-ai 模式关闭） */
export const AI_FEATURE_ENABLED = !['1', 'true', 'yes'].includes(
  (process.env.NEXT_PUBLIC_DISABLE_AI || '').toLowerCase(),
)

/**
 * 导航菜单分组配置
 * MobileNav 中 "More" 折叠菜单包含的路由项
 */
export const NAV_GROUP_KEYS: readonly string[] = AI_FEATURE_ENABLED
  ? ['tasksHistory', 'header.materialLibrary']
  : ['header.materialLibrary']
