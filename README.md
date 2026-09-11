# dsh-effort-declare

给 dsh 的**第三方模型**补上思考档位声明——默认就是 **DeepSeek 同款的 `off` / `low` / `high` / `max`**。
补上之后，模型选择器里出现 **Effort 菜单**，随时可以调整思考强度。

## 为什么需要

dsh 的模型选择器只为「声明了 `reasoningEfforts` 的模型」显示 Effort 菜单：

- 内置目录的模型自带声明；
- **手填的第三方模型默认没有任何档位** → 菜单里没有 Effort 项；
- 请求路径还会按目录校验档位（未声明的档位一律 `UNSUPPORTED_REASONING_EFFORT`）。

DeepSeek 自家路由已自带 `off` / `low` / `high` / `max`——本插件把同一套补给第三方模型。

## 工作原理

1. 读取本机 settings 的 `llm-pi-ai` **用户分节**（未脱敏原始值）；
2. 给配置指定的 provider / 模型条目补上 `reasoningEfforts`（**缺省才补**，不覆盖已有声明）；
3. 经 settings 服务写回并持久化，**live 生效**（不需要重启）。

只增不改：不碰其它 provider，不新增 / 删除模型条目；写入失败时会把待并片段写到
`~/.dsh-effort-declare.guide.json`，可手动并入 `settings.yaml`。

## 安装

- **DSHA**：在插件市场粘贴本仓库链接安装（或下载发布包后用「导入插件包」）。
- **其他 dsh 环境**：把包安装进 profile 依赖，由 `cordis.patch.yml` 自动挂载。

## 配置

```yaml
- id: effort-declare
  name: 'dsh-effort-declare'
  config:
    providers:
      my-gateway:              # settings.yaml 里 llm-pi-ai.providers 的键
        models: '*'            # '*' | ['id1', 'id2'] | 'id'
        # levels:              # 该 provider 单独覆盖档位（可不填）
        #   off:
        #   low: low
        #   high: high
        #   max: max
    # overwrite: false         # 已有 reasoningEfforts 的模型是否覆盖
    # mode: apply              # apply = 自动写入；guide = 只生成片段
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `providers` | `{}` | 要处理的 provider 路由与模型范围 |
| `providers.<p>.models` | `'*'` | `'*'` 全部 / `['id',…]` 指定 / `'id'` 单个 |
| `providers.<p>.levels` | 见下 | 该 provider 的档位覆盖 |
| `levels` | `{off: null, low: low, high: high, max: max}` | 默认档位（**档位 → 发送值**，`off` 空值 = 不发送参数） |
| `overwrite` | `false` | 是否覆盖已有声明 |
| `mode` | `apply` | `apply` 自动写入；`guide` 只输出片段不写入 |

### 档位与发送值

键是**菜单里显示的档位**，值是**真正发出去的拼写**。网关词汇不同就在 `levels` 里改名，例如：

```yaml
        levels:
          off:
          low: low
          high: high
          max: xhigh        # 网关只认 xhigh 时：max 档发送 xhigh
```

## 已知限制

- 只处理**用户分节里手填了 `models` 列表**的 provider；完全依赖内置目录的 provider 无处可补。
- 补的档位是否被网关接受，取决于端点本身对 `reasoning_effort`（或 responses 的 `reasoning`）的支持；
  发出去报错时，用 `levels` 改成网关真实认的拼写即可。
- DeepSeek 官方路由不需要本插件（自带四档）。
- `reasoning` 与 `tools` 的**出站配对**不在本插件职责内（见 dsh-codex-mask 之类的请求层插件）。

## 开发

```bash
node test/smoke.mjs
```

冒烟测试覆盖：补档位 / 跳过已有声明 / 过滤器 / overwrite / guide 模式 / 未配置 provider 不写入。
