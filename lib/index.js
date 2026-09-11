/**
 * dsh-effort-declare — 让第三方模型也有思考档位（默认 DeepSeek 同款 off / low / high / max）。
 *
 * 背景：dsh 的模型选择器只为「声明了 reasoningEfforts 的模型」显示 Effort 菜单。
 * 内置目录的模型自带声明；手填的第三方模型默认没有档位，请求路径也会按目录校验
 * （未声明的档位一律 UNSUPPORTED_REASONING_EFFORT）。DeepSeek 自家路由已自带
 * off / low / high / max——本插件把同一套档位补给第三方模型：
 *
 *   读取 settings 里的 llm-pi-ai 用户分节 → 给指定 provider 的模型条目补上
 *   `reasoningEfforts`（缺省才补，不覆盖已有）→ 经 settings 服务写回，live 生效。
 *
 * 只增不改：不碰其它 provider，不新增/删除模型条目；写入失败时把待并片段写到
 * ~/.dsh-effort-declare.guide.json，可手动并入 settings.yaml。
 *
 * @module dsh-effort-declare
 */

import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-effort-declare'

/** 强依赖：settings 服务就绪后才 apply。 */
export const inject = ['settings']

/** 目标命名空间：第三方模型走 llm-pi-ai。 */
const NS = 'llm-pi-ai'

/** DeepSeek 同款四档：显示档位 → 发送值（off 空值 = 不发送该参数）。 */
const DEFAULT_LEVELS = { off: null, low: 'low', high: 'high', max: 'max' }

const DEFAULTS = {
  enabled: true,
  /** apply = 自动写入；guide = 只生成片段不写入。 */
  mode: 'apply',
  /**
   * 要处理的 provider 路由（settings.yaml 里 llm-pi-ai.providers 的键）：
   *   providers:
   *     my-gateway:
   *       models: '*'            # '*' | ['id1', 'id2'] | 'id'
   *       # levels: { off: null, low: low, high: high, max: max }
   */
  providers: {},
  /** 默认档位（可被 provider 级 levels 覆盖）。 */
  levels: DEFAULT_LEVELS,
  /** 已有 reasoningEfforts 的模型是否覆盖。 */
  overwrite: false,
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 深合并：对象递归合并，数组与标量直接覆盖。 */
function merge(base, patch) {
  if (patch === undefined) return base
  if (!isObject(base) || !isObject(patch)) return patch
  const out = { ...base }
  for (const [key, value] of Object.entries(patch)) out[key] = merge(base[key], value)
  return out
}

/** Cordis 插件入口。 */
export function apply(ctx, config) {
  const cfg = merge(DEFAULTS, isObject(config) ? config : {})
  if (cfg.enabled === false) return

  const log = (message) => {
    try {
      console.log(`[dsh-effort-declare] ${message}`)
    } catch {}
  }

  const settings = ctx?.get?.('settings')
  if (!settings || typeof settings.describe !== 'function' || typeof settings.update !== 'function') {
    log('settings 服务不可用，跳过')
    return
  }

  const providers = isObject(cfg.providers) ? cfg.providers : {}
  if (Object.keys(providers).length === 0) {
    log('未配置 providers；示例：providers: { my-gateway: { models: "*" } }')
    return
  }

  let attempts = 0
  let running = false

  function scheduleRetry() {
    if (attempts >= 5) return
    attempts += 1
    const delay = Math.min(2000 * 2 ** (attempts - 1), 30000)
    try {
      const timer = setTimeout(() => {
        void scan(`retry#${attempts}`)
      }, delay)
      timer.unref?.()
    } catch {}
  }

  async function scan(reason) {
    if (running) return
    running = true
    try {
      let row
      try {
        row = settings.describe().find((candidate) => isObject(candidate) && candidate.ns === NS)
      } catch (error) {
        log(`读取设置失败：${error instanceof Error ? error.message : String(error)}`)
        return
      }
      const user = isObject(row?.user) ? row.user : undefined
      const userProviders = isObject(user?.providers) ? user.providers : undefined
      if (row === undefined || userProviders === undefined) {
        log(`等待 ${NS} 命名空间（${reason}）`)
        scheduleRetry()
        return
      }

      const patchProviders = {}
      const touched = []
      for (const [providerName, rawProviderCfg] of Object.entries(providers)) {
        const providerCfg = isObject(rawProviderCfg) ? rawProviderCfg : {}
        const route = userProviders[providerName]
        const models = isObject(route) && Array.isArray(route.models) ? route.models : undefined
        if (models === undefined) {
          log(`跳过「${providerName}」：用户分节里没有手填的 models 列表`)
          continue
        }

        const levels = isObject(providerCfg.levels) ? providerCfg.levels : cfg.levels
        const filter = providerCfg.models
        const matches = (id) => {
          if (filter === undefined || filter === null || filter === '*') return true
          if (typeof filter === 'string') return id === filter
          return Array.isArray(filter) && filter.includes(id)
        }

        let changed = false
        const nextModels = models.map((entry) => {
          if (!isObject(entry) || typeof entry.id !== 'string' || !matches(entry.id)) return entry
          if (cfg.overwrite !== true && entry.reasoningEfforts !== undefined) return entry
          changed = true
          touched.push(`${providerName}/${entry.id}`)
          return { ...entry, reasoningEfforts: { ...levels } }
        })
        if (changed) patchProviders[providerName] = { models: nextModels }
      }

      if (Object.keys(patchProviders).length === 0) {
        log('没有需要补档位的模型（都已有声明或未命中）')
        return
      }

      const patch = { providers: patchProviders }

      if (cfg.mode === 'guide') {
        log(`guide 模式（未写入）。请手动把以下片段并入 settings.yaml：\n${JSON.stringify(patch, null, 2)}`)
        return
      }

      try {
        await settings.update(NS, patch, row.revision)
        log(`已为 ${touched.length} 个模型补上思考档位：${touched.join(', ')}（live 生效）`)
      } catch (error) {
        const errorName = isObject(error) && typeof error.name === 'string' ? error.name : ''
        if (/conflict/i.test(errorName) && attempts < 5) {
          scheduleRetry()
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        log(`写入未成功：${message}`)
        try {
          const guideFile = join(homedir(), '.dsh-effort-declare.guide.json')
          writeFileSync(guideFile, `${JSON.stringify(patch, null, 2)}\n`)
          log(`已把待并片段写到 ${guideFile}（可手动并入 settings.yaml）`)
        } catch {}
      }
    } finally {
      running = false
    }
  }

  void scan('initial')

  // llm-pi-ai 晚注册 / 用户新增模型后自动补扫；写入幂等，不会反复触发。
  for (const event of ['settings/updated', 'settings/document-updated']) {
    try {
      ctx?.on?.(event, (ns) => {
        if (ns === NS) void scan(`event:${event}`)
      })
    } catch {}
  }
}
