const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_URL,
  REDIS_TLS,
} = process.env

const {
  MONGO_URI,
  MONGODB_URI,
  MONGODB_HOST,
  MONGODB_PORT,
  MONGODB_USERNAME,
  MONGODB_PASSWORD,
} = process.env

const {
  JWT_SECRET,
  INTERNAL_TOKEN,
} = process.env

const {
  VOLCENGINE_API_KEY,
  VOLCENGINE_ACCESS_KEY_ID,
  VOLCENGINE_SECRET_ACCESS_KEY,
  VOLCENGINE_VOD_SPACE_NAME,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  ANTHROPIC_API_KEY,
  GROQ_API_KEY,
  GROK_API_KEY,
  AICSO_API_KEY,
  AICSO_BASE_URL,
  POLLINATIONS_IMAGE_BASE_URL,
  POLLINATIONS_VIDEO_BASE_URL,
  POLLINATIONS_APP_URL,
  POLLINATIONS_SECRET_KEY,
  POLLINATIONS_PUBLISHABLE_KEY,
  GOOGLE_FLOW_BROWSER_BASE_URL,
  GOOGLE_FLOW_BROWSER_API_KEY,
  GOOGLE_FLOW_BROWSER_TIMEOUT_MS,
  GOOGLE_FLOW_BROWSER_IMAGE_PATH,
  GOOGLE_FLOW_BROWSER_VIDEO_PATH,
  GOOGLE_FLOW_BROWSER_TASK_STATUS_PATH,
  GOOGLE_FLOW_BROWSER_LOGIN_URL_PATH,
  GOOGLE_FLOW_BROWSER_SESSION_STATUS_PATH,
  GOOGLE_FLOW_BROWSER_RELOGIN_PATH,
  GOOGLE_FLOW_BROWSER_PROFILES_PATH,
  GOOGLE_FLOW_BROWSER_PROFILE_BY_ID_PATH,
  GOOGLE_FLOW_BROWSER_LOGIN_START_PATH,
  GOOGLE_FLOW_BROWSER_LOGIN_OPEN_PATH,
  GOOGLE_FLOW_BROWSER_LOGIN_STATUS_PATH,
  GOOGLE_FLOW_BROWSER_LOGIN_VERIFY_PATH,
  GOOGLE_FLOW_BROWSER_LOGIN_RESUME_PATH,
  GOOGLE_FLOW_BROWSER_LOGIN_RESET_PATH,
  GOOGLE_FLOW_BROWSER_LOGIN_CREDENTIALS_PATH,
  GOOGLE_FLOW_BROWSER_PROFILE_DEBUG_PATH,
  GOOGLE_FLOW_BROWSER_KILL_ALL_PROCESSES_PATH,
  PLAYWRIGHT_CREDENTIALS_SECRET,
} = process.env

const {
  ASSETS_CONFIG,
  ASSETS_PUBLIC_ENDPOINT,
  ASSETS_CDN_ENDPOINT,
} = process.env

const {
  GEMINI_KEY_PAIRS,
  GEMINI_LOCATION,
  AI_PROXY_URL,
} = process.env

const {
  SERVER_URL,
} = process.env

function parseGeminiKeyPairs() {
  if (!GEMINI_KEY_PAIRS) {
    throw new Error('GEMINI_KEY_PAIRS 环境变量必须配置')
  }

  try {
    return JSON.parse(GEMINI_KEY_PAIRS)
  }
  catch (e) {
    console.error('Failed to parse GEMINI_KEY_PAIRS:', e)
    throw new Error('GEMINI_KEY_PAIRS 格式错误')
  }
}

function parseAssetsConfig() {
  let parsed
  try {
    parsed = JSON.parse(ASSETS_CONFIG)
  }
  catch (e) {
    console.error('Failed to parse ASSETS_CONFIG:', e)
    throw new Error('ASSETS_CONFIG 格式错误')
  }

  if (ASSETS_PUBLIC_ENDPOINT) {
    parsed.publicEndpoint = ASSETS_PUBLIC_ENDPOINT
  }

  if (ASSETS_CDN_ENDPOINT) {
    parsed.cdnEndpoint = ASSETS_CDN_ENDPOINT
  }

  return parsed
}

function parseRedisUrl() {
  if (!REDIS_URL) {
    return null
  }
  try {
    const url = new URL(REDIS_URL)
    const username = url.username ? decodeURIComponent(url.username) : undefined
    const password = url.password ? decodeURIComponent(url.password) : undefined
    const useTls = url.protocol === 'rediss:'
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: username || (password ? 'default' : undefined),
      password,
      tls: useTls ? {} : undefined,
    }
  }
  catch (err) {
    console.error('Invalid REDIS_URL:', err)
    return null
  }
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
}

function buildMongoUri() {
  if (MONGODB_URI) {
    return MONGODB_URI
  }
  if (MONGO_URI) {
    return MONGO_URI
  }

  const user = MONGODB_USERNAME || ''
  const pass = encodeURIComponent(MONGODB_PASSWORD || '')
  const auth = user ? `${user}:${pass}@` : ''
  return `mongodb://${auth}${MONGODB_HOST}:${MONGODB_PORT}/?authSource=admin&directConnection=true`
}

const redisFromUrl = parseRedisUrl()
const redisBaseConfig = redisFromUrl || {
  host: REDIS_HOST,
  port: Number(REDIS_PORT),
  username: 'default',
  password: REDIS_PASSWORD,
  tls: parseBoolean(REDIS_TLS) ? {} : undefined,
}

module.exports = {
  port: 3010,
  logger: {
    console: {
      enable: true,
      level: 'debug',
      pretty: false,
    },
  },
  redis: {
    ...redisBaseConfig,
  },
  redlock: {
    redis: {
      ...redisBaseConfig,
    },
  },
  mongodb: {
    uri: buildMongoUri(),
    dbName: 'aitoearn',
  },
  auth: {
    secret: JWT_SECRET,
    expiresIn: 7 * 24 * 60 * 60,
    internalToken: INTERNAL_TOKEN,
  },
  serverClient: {
    baseUrl: SERVER_URL,
    token: INTERNAL_TOKEN,
  },
  assets: parseAssetsConfig(),
  ai: {
    volcengine: {
      baseUrl: 'https://ark.cn-beijing.volces.com/',
      apiKey: VOLCENGINE_API_KEY,
      accessKeyId: VOLCENGINE_ACCESS_KEY_ID,
      secretAccessKey: VOLCENGINE_SECRET_ACCESS_KEY,
      spaceName: VOLCENGINE_VOD_SPACE_NAME,
      playbackBaseUrl: 'http://vod.assets.aitoearn.ai',
      urlAuthPrimaryKey: 'd8eea018341d4e9687ead69bea628271',
    },
    openai: {
      baseUrl: AI_PROXY_URL
        ? `${AI_PROXY_URL}/${OPENAI_BASE_URL || 'https://api.openai.com/v1'}`
        : (OPENAI_BASE_URL || 'https://api.openai.com/v1'),
      apiKey: OPENAI_API_KEY || '',
    },
    grok: {
      baseUrl: 'https://api.x.ai',
      // Backward compatible:
      // - GROQ_API_KEY is used for Groq OpenAI-compatible routing
      // - GROK_API_KEY kept as fallback for existing deployments
      apiKey: GROQ_API_KEY || GROK_API_KEY || '',
      ...(AI_PROXY_URL && { proxyUrl: AI_PROXY_URL }),
    },
    anthropic: {
      baseUrl: AI_PROXY_URL ? `${AI_PROXY_URL}/${ANTHROPIC_BASE_URL}` : ANTHROPIC_BASE_URL,
      apiKey: ANTHROPIC_API_KEY,
    },
    gemini: {
      keyPairs: parseGeminiKeyPairs(),
      location: GEMINI_LOCATION || 'us-central1',
      apiKey: AICSO_API_KEY,
      baseUrl: AICSO_BASE_URL,
      ...(AI_PROXY_URL && { proxyUrl: AI_PROXY_URL }),
    },
    aicso: {
      apiKey: AICSO_API_KEY,
      ...(AICSO_BASE_URL && { baseUrl: AICSO_BASE_URL }),
    },
    pollinations: {
      imageBaseUrl: POLLINATIONS_IMAGE_BASE_URL || 'https://gen.pollinations.ai/image',
      videoBaseUrl: POLLINATIONS_VIDEO_BASE_URL || 'https://gen.pollinations.ai/video',
      appUrl: POLLINATIONS_APP_URL || 'https://api.piiblog.net',
      secretKey: POLLINATIONS_SECRET_KEY || '',
      publishableKey: POLLINATIONS_PUBLISHABLE_KEY || '',
    },
    googleFlowBrowser: {
      baseUrl: GOOGLE_FLOW_BROWSER_BASE_URL || '',
      apiKey: GOOGLE_FLOW_BROWSER_API_KEY || '',
      timeoutMs: Number(GOOGLE_FLOW_BROWSER_TIMEOUT_MS || 60000),
      imageGeneratePath: GOOGLE_FLOW_BROWSER_IMAGE_PATH || '/v1/image/generate',
      videoGeneratePath: GOOGLE_FLOW_BROWSER_VIDEO_PATH || '/v1/video/generate',
      taskStatusPath: GOOGLE_FLOW_BROWSER_TASK_STATUS_PATH || '/v1/tasks/{taskId}',
      loginUrlPath: GOOGLE_FLOW_BROWSER_LOGIN_URL_PATH || '/v1/auth/login-url',
      sessionStatusPath: GOOGLE_FLOW_BROWSER_SESSION_STATUS_PATH || '/v1/auth/session-status',
      reloginPath: GOOGLE_FLOW_BROWSER_RELOGIN_PATH || '/v1/auth/relogin',
      profilesPath: GOOGLE_FLOW_BROWSER_PROFILES_PATH || '/v1/profiles',
      profileByIdPath: GOOGLE_FLOW_BROWSER_PROFILE_BY_ID_PATH || '/v1/profiles/{profileId}',
      loginStartPath: GOOGLE_FLOW_BROWSER_LOGIN_START_PATH || '/v1/profiles/{profileId}/login/start',
      loginOpenPath: GOOGLE_FLOW_BROWSER_LOGIN_OPEN_PATH || '/v1/profiles/{profileId}/login/open',
      loginStatusPath: GOOGLE_FLOW_BROWSER_LOGIN_STATUS_PATH || '/v1/profiles/{profileId}/login/status',
      loginVerifyPath: GOOGLE_FLOW_BROWSER_LOGIN_VERIFY_PATH || '/v1/profiles/{profileId}/login/verify',
      loginResumePath: GOOGLE_FLOW_BROWSER_LOGIN_RESUME_PATH || '/v1/profiles/{profileId}/login/resume',
      loginResetPath: GOOGLE_FLOW_BROWSER_LOGIN_RESET_PATH || '/v1/profiles/{profileId}/login/reset',
      loginCredentialsPath: GOOGLE_FLOW_BROWSER_LOGIN_CREDENTIALS_PATH || '/v1/profiles/{profileId}/login/credentials',
      profileDebugPath: GOOGLE_FLOW_BROWSER_PROFILE_DEBUG_PATH || '/v1/profiles/{profileId}/debug',
      killAllProcessesPath: GOOGLE_FLOW_BROWSER_KILL_ALL_PROCESSES_PATH || '/v1/processes/kill-all',
      credentialsSecret: PLAYWRIGHT_CREDENTIALS_SECRET || '',
    },
    aideo: {
      vCreative: {
        basePrice: 0,
      },
      vision: {
        basePrice: 0,
      },
      highlight: {
        basePrice: 0,
      },
      aiTranslation: {
        facialTranslation: 0,
      },
      erase: {
        basePrice: 0,
      },
      videoEdit: {
        basePrice: 0,
      },
      dramaRecap: {
        basePrice: 0,
      },
      styleTransfer: {
        basePrice: 0,
      },
    },
    models: {
      chat: [
        {
          name: 'gemini-3.1-pro-preview',
          description: 'Gemini 3.1 Pro Preview',
          inputModalities: ['text', 'image', 'audio', 'video'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                maxInputTokens: 200000,
                input: { text: '0', image: '0', video: '0', audio: '0' },
                output: { text: '0' },
              },
              {
                input: { text: '0', image: '0', video: '0', audio: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'gemini-3-flash-preview',
          description: 'Gemini 3 Flash Preview',
          inputModalities: ['text', 'image', 'audio', 'video'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0', video: '0', audio: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'gpt-5.1-all',
          description: 'GPT 5.1',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'gpt-5',
          description: 'GPT 5',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'llama-3.3-70b-versatile',
          description: 'Groq Llama 3.3 70B Versatile',
          inputModalities: ['text'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'llama-3.1-70b-versatile',
          description: 'Groq Llama 3.1 70B Versatile',
          inputModalities: ['text'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'mixtral-8x7b-32768',
          description: 'Groq Mixtral 8x7B',
          inputModalities: ['text'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'gemini-3.1-flash-image-preview',
          description: 'Nano Banana 2',
          inputModalities: ['text', 'image'],
          outputModalities: ['image'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0' },
                output: { text: '0', image: '0' },
              },
            ],
          },
        },
        {
          name: 'gemini-3-pro-image-preview',
          description: 'Nano Banana Pro',
          inputModalities: ['text', 'image'],
          outputModalities: ['image'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0' },
                output: { text: '0', image: '0' },
              },
            ],
          },
        },
        {
          name: 'claude-opus-4-5-20251101',
          description: 'Claude Opus 4.5',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'claude-opus-4-6',
          description: 'Claude Opus 4.6',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'claude-sonnet-4-5-20250929',
          description: 'Claude Sonnet 4.5',
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
        {
          name: 'gemini-2.5-flash',
          description: 'Gemini 2.5 Flash',
          inputModalities: ['text', 'image', 'audio', 'video'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0', image: '0', video: '0', audio: '0' },
                output: { text: '0' },
              },
            ],
          },
        },
      ],
      image: {
        generation: [
          {
            name: 'gpt-image-1.5',
            description: 'gpt-image-1.5',
            sizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
            qualities: ['high', 'medium', 'low'],
            styles: [],
            pricing: '0',
          },
          {
            name: 'pollinations-flux',
            description: 'Pollinations Flux',
            sizes: ['1024x1024', '1280x720', '720x1280'],
            qualities: ['standard'],
            styles: [],
            pricing: '0',
          },
          {
            name: 'pollinations-gptimage',
            description: 'Pollinations GPT Image',
            sizes: ['1024x1024', '1280x720', '720x1280'],
            qualities: ['standard'],
            styles: [],
            pricing: '0',
          },
          {
            name: 'pollinations-zimage',
            description: 'Pollinations Z-Image',
            sizes: ['1024x1024', '1280x720', '720x1280'],
            qualities: ['standard'],
            styles: [],
            pricing: '0',
          },
          {
            name: 'google-flow-browser-image',
            description: 'Google Flow - Nano Banana 2',
            sizes: ['1280x720', '1024x768', '1024x1024', '768x1024', '720x1280'],
            qualities: ['standard'],
            styles: [],
            pricing: '0',
          },
          {
            name: 'google-flow-browser-image-nano-banana-pro',
            description: 'Google Flow - Nano Banana Pro',
            sizes: ['1280x720', '1024x768', '1024x1024', '768x1024', '720x1280'],
            qualities: ['standard'],
            styles: [],
            pricing: '0',
          },
          {
            name: 'google-flow-browser-image-imagen-4',
            description: 'Google Flow - Imagen 4',
            sizes: ['1280x720', '1024x768', '1024x1024', '768x1024', '720x1280'],
            qualities: ['standard'],
            styles: [],
            pricing: '0',
          },
        ],
        edit: [
          {
            name: 'gpt-image-1.5',
            description: 'gpt-image-1.5',
            sizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
            qualities: ['high', 'medium', 'low'],
            styles: [],
            pricing: '0',
            maxInputImages: 16,
          },
        ],
      },
      video: {
        generation: [
          {
            name: 'grok-video-3-15s',
            description: 'Grok Video 15s',
            channel: 'aicso-grok',
            modes: ['text2video', 'image2video'],
            resolutions: ['720p'],
            durations: [15],
            maxInputImages: 1,
            aspectRatios: ['2:3', '3:2', '1:1'],
            tags: [{ 'en-US': 'Sale', 'zh-CN': '促销' }],
            defaults: {
              duration: 15,
              aspectRatio: '9:16',
            },
            pricing: [
              { duration: 15, price: 0 },
            ],
          },
          {
            name: 'veo3.1-components-4k',
            description: 'Veo 3.1 4K',
            channel: 'aicso-veo',
            modes: ['text2video', 'image2video'],
            resolutions: ['4k'],
            durations: [8],
            maxInputImages: 3,
            aspectRatios: ['9:16', '16:9', '1:1'],
            tags: [{ 'en-US': 'Sale', 'zh-CN': '促销' }],
            defaults: {
              duration: 8,
              aspectRatio: '9:16',
            },
            pricing: [
              { duration: 8, price: 0 },
            ],
          },
          {
            name: 'veo3.1-components',
            description: 'Veo 3.1',
            channel: 'aicso-veo',
            modes: ['text2video', 'image2video'],
            resolutions: ['720p'],
            durations: [8],
            maxInputImages: 3,
            aspectRatios: ['9:16', '16:9', '1:1'],
            tags: [{ 'en-US': 'Sale', 'zh-CN': '促销' }],
            defaults: {
              duration: 8,
              aspectRatio: '9:16',
            },
            pricing: [
              { duration: 8, price: 0 },
            ],
          },
          {
            name: 'grok-imagine-video',
            description: 'Grok Video',
            channel: 'grok',
            modes: ['text2video', 'image2video', 'video2video'],
            resolutions: ['720p'],
            durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            maxInputImages: 1,
            aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
            defaults: {
              duration: 8,
              aspectRatio: '9:16',
            },
            pricing: [
              { duration: 1, price: 0 },
              { duration: 2, price: 0 },
              { duration: 3, price: 0 },
              { duration: 4, price: 0 },
              { duration: 5, price: 0 },
              { duration: 6, price: 0 },
              { duration: 7, price: 0 },
              { duration: 8, price: 0 },
              { duration: 9, price: 0 },
              { duration: 10, price: 0 },
              { duration: 11, price: 0 },
              { duration: 12, price: 0 },
              { duration: 13, price: 0 },
              { duration: 14, price: 0 },
              { duration: 15, price: 0 },
              { mode: 'video2video', duration: 1, price: 0 },
              { mode: 'video2video', duration: 2, price: 0 },
              { mode: 'video2video', duration: 3, price: 0 },
              { mode: 'video2video', duration: 4, price: 0 },
              { mode: 'video2video', duration: 5, price: 0 },
              { mode: 'video2video', duration: 6, price: 0 },
              { mode: 'video2video', duration: 7, price: 0 },
              { mode: 'video2video', duration: 8, price: 0 },
            ],
          },
          {
            name: 'pollinations-veo',
            description: 'Pollinations Veo',
            channel: 'pollinations',
            modes: ['text2video', 'image2video'],
            resolutions: ['720p'],
            durations: [8],
            maxInputImages: 1,
            aspectRatios: ['1:1', '16:9', '9:16'],
            defaults: {
              duration: 8,
              aspectRatio: '9:16',
            },
            pricing: [{ duration: 8, price: 0 }],
          },
          {
            name: 'pollinations-seedance',
            description: 'Pollinations Seedance',
            channel: 'pollinations',
            modes: ['text2video', 'image2video'],
            resolutions: ['720p'],
            durations: [8],
            maxInputImages: 1,
            aspectRatios: ['1:1', '16:9', '9:16'],
            defaults: {
              duration: 8,
              aspectRatio: '9:16',
            },
            pricing: [{ duration: 8, price: 0 }],
          },
          {
            name: 'google-flow-browser-video',
            description: 'Google Flow Video - Nano Banana 2',
            channel: 'google-flow-browser',
            modes: ['text2video', 'image2video'],
            resolutions: ['1280x720', '1024x768', '1024x1024', '768x1024', '720x1280'],
            durations: [8],
            maxInputImages: 1,
            aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
            defaults: {
              duration: 8,
              aspectRatio: '16:9',
              resolution: '1280x720',
            },
            pricing: [{ duration: 8, price: 0 }],
          },
          {
            name: 'google-flow-browser-video-nano-banana-pro',
            description: 'Google Flow Video - Nano Banana Pro',
            channel: 'google-flow-browser',
            modes: ['text2video', 'image2video'],
            resolutions: ['1280x720', '1024x768', '1024x1024', '768x1024', '720x1280'],
            durations: [8],
            maxInputImages: 1,
            aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
            defaults: {
              duration: 8,
              aspectRatio: '16:9',
              resolution: '1280x720',
            },
            pricing: [{ duration: 8, price: 0 }],
          },
        ],
      },
    },
    draftGeneration: {
      imageModels: [
        {
          model: 'gemini-3.1-flash-image-preview',
          displayName: 'NanoBanana 2',
          supportedAspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'],
          maxInputImages: 14,
          pricing: [
            { resolution: '1K', pricePerImage: 0 },
            { resolution: '2K', pricePerImage: 0 },
            { resolution: '4K', pricePerImage: 0 },
          ],
        },
        {
          model: 'gemini-3-pro-image-preview',
          displayName: 'NanoBanana Pro',
          supportedAspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'],
          maxInputImages: 14,
          pricing: [
            { resolution: '1K', pricePerImage: 0 },
            { resolution: '2K', pricePerImage: 0 },
            { resolution: '4K', pricePerImage: 0 },
          ],
        },
      ],
    },
  },
  agent: {
    baseUrl: AI_PROXY_URL ? `${AI_PROXY_URL}/${OPENAI_BASE_URL}/messages` : `${OPENAI_BASE_URL}/messages`,
    apiKey: OPENAI_API_KEY,
  },
}
