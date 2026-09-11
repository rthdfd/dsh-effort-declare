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
            { id: 'keep-me' },
          ],
        },
        other: { models: [{ id: 'x' }] },
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

// 1) '*'：缺省才补（luna 已有声明被跳过），keep-me 也补
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { providers: { 'my-gateway': { models: '*' } } })
  await tick()
  assert.equal(writes.length, 1)
  const { ns, patch, revision } = writes[0]
  assert.equal(ns, 'llm-pi-ai')
  assert.equal(revision, 7)
  const models = patch.providers['my-gateway'].models
  assert.deepEqual(models[0].reasoningEfforts, DS_LEVELS)
  assert.deepEqual(models[1].reasoningEfforts, { low: 'low' })
  assert.deepEqual(models[2].reasoningEfforts, DS_LEVELS)
  assert.equal(Object.keys(patch.providers).length, 1, 'other provider untouched')
  assert.equal(patch.providers['my-gateway'].models.length, 3, 'no entries added/removed')
}

// 2) 过滤器只处理命中的模型
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { providers: { 'my-gateway': { models: ['gpt-5.6-sol'] } } })
  await tick()
  const models = writes[0].patch.providers['my-gateway'].models
  assert.deepEqual(models[0].reasoningEfforts, DS_LEVELS)
  assert.deepEqual(models[1].reasoningEfforts, { low: 'low' })
  assert.equal(models[2].reasoningEfforts, undefined)
}

// 3) overwrite: true 覆盖已有声明
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { providers: { 'my-gateway': { models: '*' } }, overwrite: true })
  await tick()
  const models = writes[0].patch.providers['my-gateway'].models
  assert.deepEqual(models[1].reasoningEfforts, DS_LEVELS)
}

// 4) guide 模式不写入
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { providers: { 'my-gateway': { models: '*' } }, mode: 'guide' })
  await tick()
  assert.equal(writes.length, 0)
}

// 5) provider 不存在（或没有手填 models）时不写入
{
  const { ctx, writes } = makeCtx()
  apply(ctx, { providers: { 'no-such': { models: '*' } } })
  await tick()
  assert.equal(writes.length, 0)
}

// 6) 自定义档位覆盖（含改名映射）
{
  const { ctx, writes } = makeCtx()
  apply(ctx, {
    providers: {
      'my-gateway': { models: '*', levels: { off: '', low: 'low', high: 'high', max: 'xhigh' } },
    },
  })
  await tick()
  const models = writes[0].patch.providers['my-gateway'].models
  assert.deepEqual(models[0].reasoningEfforts, { off: '', low: 'low', high: 'high', max: 'xhigh' })
}

console.log('all smoke tests passed ✓')
