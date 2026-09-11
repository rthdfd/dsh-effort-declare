# dsh-effort-declare

让**第三方模型**拥有思考档位——**零配置，装完即用**。默认档位就是 **DeepSeek 同款
`off` / `low` / `high` / `max`**，模型选择器里随即出现 **Effort 菜单**，随时调整思考强度。

## 装完自动做什么

1. 读取 settings 里的 `llm-pi-ai` 用户分节；
2. 给所有**手填了 `models` 列表**的 provider 的模型补上 `reasoningEfforts`
   （缺省才补，不覆盖已有声明）；
3. 经 settings 服务写回并持久化，**live 生效**，不需要重启。

只增不改：不碰其它字段，不新增 / 删除模型条目；写入失败时把待并片段写到
`~/.dsh-effort-declare.guide.json`，可手动并入 `settings.yaml`。

## 为什么需要

dsh 的模型选择器只为「声明了 `reasoningEfforts` 的模型」显示 Effort 菜单：

- 内置目录的模型自带声明；
- **手填的第三方模型默认没有任何档位** → 菜单里没有 Effort 项；
- 请求路径还会按目录校验档位（未声明的档位一律 `UNSUPPORTED_REASONING_EFFORT`）。

DeepSeek 自家路由已自带 `off` / `low` / `high` / `max`——本插件把同一套补给第三方模型。

## 安装

- **DSHA**：插件市场粘贴本仓库链接安装；
- **命令行**：`dsh plugin add github:rthdfd/dsh-effort-declare`

装完重启 Web，日志出现 `[dsh-effort-declare] 已为 N 个模型补上思考档位：…` 即生效。

## 可选配置（一般不用动）

| 字段 | 默认 | 说明 |
|---|---|---|
| `providers` | `'auto'` | 默认处理所有手填 models 的 provider；也可写成对象收窄 |
| `levels` | `{off: null, low: low, high: high, max: max}` | 默认档位（**档位 → 发送值**，`off` 空值 = 不发送参数） |
| `overwrite` | `false` | 是否覆盖已有声明 |
| `mode` | `apply` | `guide` = 只输出片段、不写入 |

收窄 + 改发送值示例（比如网关只认 `xhigh`）：

```yaml
providers:
  my-gateway:
    models: '*'
    levels:
      off:
      low: low
      high: high
      max: xhigh
```

## 已知限制

- 补的档位是否被网关接受，取决于端点本身对 `reasoning_effort`（或 responses 的 `reasoning`）的支持；
  发出去报错时，用 `levels` 改成网关真实认的拼写即可。
- DeepSeek 官方路由不需要本插件（自带四档）。
- `reasoning` 与 `tools` 的**出站配对**不在本插件职责内（见 dsh-codex-mask 之类的请求层插件）。

## 开发

```bash
node test/smoke.mjs
```
