// 冒烟测试：node test/smoke.mjs
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

const DS_LEVELS = { off: null, low: 'low', high: 'high', max: 'max' }

function makeCtx() {
  const writes = []
  const rows = [{
    ns: 'llm-pi-ai',
    revision: 7,
    user: {
      providers: {
        'my-gateway': {
          api: 'openai-completions',
          baseURL: 'https://gw.example/v1',
          models: [
            { id: 'gpt-5.6-sol' },
            { id: 'gpt-5.6-luna', reasoningEfforts: { low: 'low' } },
          ],
        },
        'relay-b': { baseURL: 'https://b.example/v1', models: [{ id: 'm1' }] },
        'no-models': { baseURL: 'https://c.example/v1' },
      },
    },
  }]
  const settings = {
    describe: () => rows,
    update: (ns, patch, revision) => {
      writes.push({ ns, patch, revision })
      return Promise.resolve()
    },
  }
  const ctx = {
    get: (key) => (key === 'settings' ? settings : undefined),
    on: () => {},
  }
  return { ctx, writes }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 30))

// 1) 零配置（默认 auto）：所有带 models 的 provider 都被补档位
{
  const { ctx, writes } = makeCtx()
  apply(ctx)
  await tick()
  assert.equal(writes.length, 1)
  const { ns, patch, revision } = writes[0]
  assert.equal(ns, 'llm-pi-ai')
  assert.equal(revision, 7)
  assert.deepEqual(Object.keys(patch.providers).sort(), ['my-gateway', 'relay-b'])
  assert.deepEqual(patch.providers['my-gateway'].models[0].reasoningEfforts, DS_LEVELS)
  assert.deepEqual(patch.providers['my-gateway'].models[1].reasoningEfforts, { low: 'low' })
  assert.deepEqual(patch.providers['relay-b'].models[0].reasoningEfforts, DS_LEVELS)
  assert.equal(patch.providers['my-gateway'].models.length, 2, 'no entries added/removed')
}

// 2) 收窄：只处理指定的 provider
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { providers: { 'relay-b': { models: '*' } } })
  await tick()
  assert.deepEqual(Object.keys(writes[0].patch.providers), ['relay-b'])
}

// 3) overwrite: true 覆盖已有声明
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { overwrite: true })
  await tick()
  assert.deepEqual(writes[0].patch.providers['my-gateway'].models[1].reasoningEfforts, DS_LEVELS)
}

// 4) guide 模式不写入
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { mode: 'guide' })
  await tick()
  assert.equal(writes.length, 0)
}

// 5) 自定义档位（含改名映射）
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { levels: { off: '', low: 'low', high: 'high', max: 'xhigh' } })
  await tick()
  assert.deepEqual(writes[0].patch.providers['relay-b'].models[0].reasoningEfforts, {
    off: '',
    low: 'low',
    high: 'high',
    max: 'xhigh',
  })
}

console.log('all smoke tests passed ✓')
