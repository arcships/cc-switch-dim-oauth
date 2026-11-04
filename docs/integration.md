# CC Switch 接入依据与交付边界

调查日期：2026-11-04。官方 main：`51fce968bca807aeee93be9420c651afb582c2c8`，源码版本 4.0.25。

## 源码结论

- [站长接入指南](https://github.com/farion1231/cc-switch/blob/51fce968bca807aeee93be9420c651afb582c2c8/docs/guides/deeplink-site-integration-guide-zh.md)：官方支持 `ccswitch://v1/import?resource=provider`；必需地址与 Key；支持 `apiFormat`、完整模型 ID、备注与 Codex TOML 配置。
- [导入解析器](https://github.com/farion1231/cc-switch/blob/51fce968bca807aeee93be9420c651afb582c2c8/src-tauri/src/deeplink/parser.rs) 和 [服务商构建](https://github.com/farion1231/cc-switch/blob/51fce968bca807aeee93be9420c651afb582c2c8/src-tauri/src/deeplink/provider.rs)：支持 HTTP loopback；导入通过用户确认完成；不提供外部 OAuth hooks。`enabled=false` 默认仅保存，由用户决定切换。
- [服务商凭据分支](https://github.com/farion1231/cc-switch/blob/51fce968bca807aeee93be9420c651afb582c2c8/src-tauri/src/provider.rs)：托管 OAuth 类型硬编码为 Codex、xAI、Copilot 等，不能通过包注册 DimAgent 续期器。
- [插件命令](https://github.com/farion1231/cc-switch/blob/51fce968bca807aeee93be9420c651afb582c2c8/src-tauri/src/commands/plugin.rs)：管理 Claude 配置，不是 Magpie/OpenCode 服务商插件加载器。
- [模型获取入口](https://github.com/farion1231/cc-switch/blob/51fce968bca807aeee93be9420c651afb582c2c8/src-tauri/src/commands/model_fetch.rs)：通用服务商可以手动拉取 OpenAI `/v1/models`，不存在通用外部 provider.models hook。
- [用量脚本](https://github.com/farion1231/cc-switch/blob/51fce968bca807aeee93be9420c651afb582c2c8/src-tauri/src/usage_script.rs)：QuickJS 只描述单次请求；必须同源 HTTPS，不能在 HTTP 本地接入中续期或原生查询用量。
- [Codex 导入白名单](https://github.com/farion1231/cc-switch/blob/51fce968bca807aeee93be9420c651afb582c2c8/src-tauri/src/deeplink/codex_link.rs)：可保留 `model_reasoning_effort`；不能通过链接执行凭据命令。
- 图标链接必须是公网 HTTPS，不能放 loopback 或 data URI。账户页直接复用 Desktop `packages/desktop/build/icon.png`，CC Switch 卡片可通过现有界面手动上传同一原图。

调查未发现公开的外部服务商插件加载协议；不能把 Magpie 插件伪装成 CC Switch 插件。

## 本次设计

独立 Bun 本地程序，使用官方导入协议，无需修改 CC Switch。生产只监听 `127.0.0.1:3489`；OAuth 使用已注册的 `http://127.0.0.1:54322/oauth/callback`，scope `openid profile email`，public client、PKCE S256，无 secret。回调端口被占用时登录失败，不静默换端口。

| 站点 | issuer | client ID |
| --- | --- | --- |
| 国内站 | `https://dimagent.cn` | `271706aab9b74b15a7140b228a419e4a` |
| 海外站 | `https://dimagent.com` | `91975f99125f42bc88859100a1769ea4` |

```text
DimAgent 账户页
├─ 站点、账号、登录 / 退出
├─ 当前套餐                 购买 / 续期、价格、刷新
│  ├─ 账户剩余（含套餐余额，不与套餐配额相加）
│  ├─ 套餐 / 限流窗口 / 功能用量
│  └─ 重置 → 账号、订阅、批次确认 → 幂等执行
└─ 模型、客户端、协议、可导入的 effort
   └─ 生成链接 → 点击导入 → CC Switch 确认 → 用户切换
```

每个站点保存一个账号；同站点重新登录替换旧账号。凭据独立存放于 `~/.local/share/cc-switch-dim-oauth/auth.json`（目录 0700、文件 0600，原子替换）。`DIM_CC_STATE_DIR` 可选择隔离目录。固定生产监听端口先于凭据读取绑定，阻止多个本程序实例并行续期；单实例内共享续期 Promise，轮换结果先持久化再返回；磁盘写入失败时保留内存中的新令牌，并在下次访问前重试落盘，避免再次使用已被轮换的旧 refresh token。不得与其他程序共享此凭据文件。

CC Switch 只接收稳定的本地随机 Key，真实 access/refresh token 不进入链接、网页、CC Switch 配置或日志。退出删除该站点的本地凭据，不隐式撤销服务端授权；后台程序退出时转发停止。账户页校验 Host、Origin 与随机会话头，禁止嵌入，不开放跨域。转发校验本地 Key、站点、固定路径、目录中的模型及其协议；不代理任意 URL，不转发调用方的 Cookie、Key 和任意头。

复用 Magpie 项目中已经核对的 Dim OAuth、用量与重置业务协议，移除 Magpie hooks 和宿主账户依赖。转发本身不做协议转换；Claude Code / Codex 的非原生格式使用 CC Switch 现有本地路由。客户端入口扩展到官方深链接支持的 9 类：Claude Code、Codex、OpenCode、Gemini CLI、Antigravity CLI、Grok Build、OpenClaw、Hermes、Pi。客户端与协议约束使用一份服务端定义，页面从状态接口读取；仅显示当前模型与客户端共同支持的协议，无兼容协议时禁止生成并说明原因。Gemini CLI / Antigravity CLI 仅支持 Gemini；Codex / Grok Build / Hermes 支持三种非 Gemini 协议；其余支持四种协议。推理强度仍仅对已经验证的 Codex OpenAI 类接口导入。CC Switch 侧栏更多入口不等于其深链接都可用，Claude Desktop、MiniMax Code、Kimi Code、DeepSeek Harness、Oh My Pi 暂不进入本项目导入列表。

Anthropic 的 OpenCode / OpenClaw SDK 地址带 `/v1`，其他客户端使用协议根地址。Gemini CLI / Antigravity CLI 及 Claude 的 Gemini 路由使用根地址，由客户端附加版本；OpenCode / OpenClaw / Pi 使用带 `/v1beta` 的 SDK 地址。地址约定来自 CC Switch 的服务商配置与客户端 SDK；不在转发端补偿重复版本路径。模型请求流直接透传状态、响应流、Retry-After 和取消；不重试任何付费请求，包括 401。

动态目录每次从 `/v1/models?type=dim` 读取，按服务端协议分组；未声明 endpoint 时默认 OpenAI-compatible，显式未知协议不改写为默认。模型 ID 原样传递；ZDR 仅检查条目顶层 `zdr === true`。账户页展示目录的 effort；Codex 的 OpenAI 类接口可以把选中的 effort 写入导入配置，其他客户端由其自身设置，不伪造通用 effort 接口。Codex 始终附带最小服务商 TOML，避免上游无 config 时自动写入 `high`，把未指定的推理强度误写成服务端不支持的值。

导入每次产生新卡片，并非自动更新现有卡片；服务端目录变化通过账户页重新获取并重新导入，或使用 CC Switch 原有的手动模型拉取入口。目录接口和账户页显示 ZDR，但宿主没有通用独立 ZDR 徽章字段，导入备注记录生成时状态；实际隐私承诺始终以最新目录为准。

账户剩余直接展示 `credits.remaining_units`，注明包含套餐余额；无总量时不生成百分比。只有真实套餐和窗口总量生成进度条。重置读取 `/api/me/usage` 与 `/api/me/usage-resets`，确认限定账号、站点和订阅；有效期 5 分钟；执行 `/api/me/usage-resets/apply` 复用幂等键，同一确认的重复点击共享结果，网络失败重试不新建键。成功后重新读取完整用量，不把套餐余额当成账户汇总。

## 上游原生支持的最小范围

若希望在授权中心直接显示 DimAgent，而不运行独立进程，需要上游增加：DimAgent OAuth 凭据类型与存储、PKCE loopback 登录、串行刷新、请求凭据注入、账号绑定、模型能力投影、原生用量查询及账户入口。单独添加静态品牌预设无法实现这些行为。账户页可继续复用官方控制台，额度重置需要额外的确认与幂等动作入口；不应通过余额查询脚本发起写操作。

项目通过公开 GitHub 仓库 `arcships/cc-switch-dim-oauth` 分发；用户已授权创建公开仓库并推送。保持不发布 npm、不提交上游 PR、不修改用户现有 CC Switch / Magpie 配置。

## 页面选择控件

五个选择控件使用页面内自定义面板，不调用系统 select。参考 Nuxt UI v4 的 Select / SelectMenu 交互；模型支持搜索，短列表不额外加搜索框；选中勾号、悬停、禁用、上下方向键、Home/End、Enter、Escape、Tab、外部点击与边缘翻转由一个共享控件实现。选择值直接传给现有导入流程，前端不另存业务配置。当前页面保持原生 JavaScript，不引入 Vue / Nuxt 构建环境。

```text
[ 当前选项                ˅ ]
┌───────────────────────────┐
│ 搜索模型…（仅模型列表）   │
│ 选项一                    │
│ 选项二                  ✓ │
└───────────────────────────┘
```

## 运行中的资源版本

页面资源在进程启动时读取并固定，与该进程的 API 契约一起使用；更新源码后必须重启，再刷新页面。不在页面消费方用空列表补齐缺失的内部 clients 字段，以免把版本不一致伪装成没有可用客户端。脚本、样式、图标禁止缓存。

## 消融检查

保留本地转发是因为宿主不提供外部 OAuth 续期入口，导入一次 access token 会过期。保留独立账户页是因为宿主用量脚本不接受本地 HTTP，也没有通用写操作界面。移除了 Magpie 账号作用域、网关刷新、SDK 模型对象、无关服务层、宿主插件清单和已无消费者的宿主 callback 参数；不增加协议转换、启动守护、账号调度、自动修改宿主数据库或额外运行依赖。
