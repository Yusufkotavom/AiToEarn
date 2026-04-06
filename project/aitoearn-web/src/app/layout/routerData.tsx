/**
 * 路由/导航数据配置
 * 包含导航项的图标、路径、翻译键等信息
 */
import {
  Bot,
  CalendarClock,
  Images,
  Wrench,
  LayoutPanelTop,
  HardDrive,
  History,
  Home,
  PanelsTopLeft,
  Sparkles,
  Upload,
  } from 'lucide-react'
import { AI_FEATURE_ENABLED } from '@/app/layout/shared/constants'

export interface IRouterDataItem {
  // 导航标题
  name: string
  // 翻译键
  translationKey: string
  // 跳转链接
  path?: string
  // 图标
  icon?: React.ReactNode
  // 子导航
  children?: IRouterDataItem[]
}

export const routerData: IRouterDataItem[] = [
  {
    name: 'Content Management',
    translationKey: 'header.draftBox',
    path: '/',
    icon: <Home size={20} />,
  },
  ...(AI_FEATURE_ENABLED
    ? [
        {
          name: 'AI Publish',
          translationKey: 'aiSocial',
          path: '/ai-social',
          icon: <Sparkles size={20} />,
        },
        {
          name: 'Task History',
          translationKey: 'tasksHistory',
          path: '/tasks-history',
          icon: <History size={20} />,
        },
      ]
    : []),
  {
    name: 'Publish',
    translationKey: 'accounts',
    path: '/accounts',
    icon: <Upload size={20} />,
  },
  // Tasks moved to notification panel
  {
    name: 'Agent Assets',
    translationKey: 'header.agentAssets',
    path: '/agent-assets',
    icon: <Bot size={20} />,
  },
  {
    name: 'Drive Explorer',
    translationKey: 'driveExplorer',
    path: '/drive-explorer',
    icon: <HardDrive size={20} />,
  },
  {
    name: 'Internal Tools',
    translationKey: 'internalToolsHub',
    path: '/internal-tools',
    icon: <PanelsTopLeft size={20} />,
  },
  {
    name: 'Content Manager',
    translationKey: 'contentManager',
    path: '/new-page-content',
    icon: <LayoutPanelTop size={20} />,
  },
  {
    name: 'Content Scheduler',
    translationKey: 'contentScheduler',
    path: '/content-scheduler',
    icon: <CalendarClock size={20} />,
  },
  {
    name: 'Playwright Manager',
    translationKey: 'playwrightManager',
    path: '/playwright-manager',
    icon: <Wrench size={20} />,
  },
  {
    name: 'Playwright Batch',
    translationKey: 'playwrightBatch',
    path: '/playwright-batch',
    icon: <Images size={20} />,
  },
  {
    name: 'System Logs',
    translationKey: 'systemLogs',
    path: '/system-logs',
    icon: <History size={20} />,
  },
]
