# 验证记录

日期：2026-11-04。本地运行时 Bun 1.4.3、TypeScript 5.9.3。测试不读取其他程序的账号配置。

## 接入程序

`bun test`：7 个用户流程全部通过，覆盖 145 项断言。`bun run check` 通过。

流程包括 PKCE S256、state/重复参数拒绝、取消并释放回调端口、凭据持久化与权限、并发续期、轮换后落盘及落盘失败恢复、跨站点凭据隔离、目录错误不转发、缺省 OpenAI 协议、显式协议、完整模型 ID、两种 effort 字段格式、关闭 reasoning、顶层 ZDR、真实用量语义、三种客户端导入、四种协议的模拟请求、流式工具事件与取消、401/429 不重放、Host/Origin/会话校验、重置先确认与同一幂等键重试、旧账号确认拒绝。

所有模型请求和重置都发向临时本机模拟服务，不消耗真实额度。

## 两站匿名授权预检

分别访问两站 OIDC discovery，issuer 均与配置一致并声明 S256。使用下列注册及固定回调发起匿名授权请求：

| 站点 | client ID | 回调 | 结果 |
| --- | --- | --- | --- |
| `https://dimagent.cn` | `271706aab9b74b15a7140b228a419e4a` | `http://127.0.0.1:54322/oauth/callback` | HTTP 302 → 本站 `/oauth-login` |
| `https://dimagent.com` | `91975f99125f42bc88859100a1769ea4` | 同上 | HTTP 302 → 本站 `/oauth-login` |

没有真实登录、交换真实授权码或续期真实令牌。预检证明注册参数可进入授权流程，不等于已验证授权后发放 refresh token、模型服务对新客户端身份的放行、真实账号 API 权限或端到端模型生成。

## 浏览器

使用隔离的模拟账号页面检查：首次加载、模型选择、Codex effort 选择、生成导入入口、重置确认与执行后刷新、普通视口与 390px 窄屏。

发现并修复首次加载在站点列表初始化前发送空站点请求的问题；账户余额只显示真实总额，套餐与窗口按真实总量显示进度。窄屏无横向溢出；使用 Desktop 原图、浅深色 brand-green。截图均为模拟账号：

- [普通视口](verification/account-mock.png)
- [窄屏](verification/account-narrow-mock.png)

没有点击链接修改用户的真实 CC Switch 配置；导入由源码级测试验证。

## CC Switch 原生导入

使用官方源码提交 `51fce968bca807aeee93be9420c651afb582c2c8` 的实际 `parse_deeplink_url` 和 `import_provider_from_deeplink`，内存数据库与上游隔离测试 HOME。

复现方式（`CC_SOURCE` 指独立上游 checkout，测试文件只复制到该 checkout）：

```bash
bun test/generate-host-fixtures.ts
cp test/cc-switch-contract.rs "$CC_SOURCE/src-tauri/tests/dimagent_contract.rs"
cd "$CC_SOURCE/src-tauri"
DIM_IMPORT_FIXTURES=/absolute/path/cc-switch-dim-oauth/.state/host-imports.json cargo test --locked --test dimagent_contract --no-default-features
```

生成的 fixtures 全是模拟 Key；`enabled=false`。验证三种客户端、十种客户端/协议组合、完整模型 ID、本机前缀地址、OpenCode SDK 包选择、Codex 指定 effort 和不擅自强制 high 的默认配置。

结果：通过。`dimagent_generated_links_import_with_actual_host_code` 使用 10 组本地生成链接，实际导入到 CC Switch 的内存数据库，全部断言通过。额外复用上游 `deeplink_import` 的 4 个现有流程，全部通过。两套测试均使用隔离 HOME，未打开用户安装的 CC Switch 或修改其数据库。

## 本机安装版界面验证

2026-11-04 10:26–10:32，使用 `/Applications/CC Switch.app` 4.0.25 和 Chrome，从本项目账户页实际点击导入链接。按 `blackbox-testing` 工作流执行，测试记录保留在本机 `.state/desktop-test-plan.md`。

先退出日常实例，再以 `CC_SWITCH_TEST_HOME` 指向独立 `.state/desktop-home` 启动同一安装包。账户页使用临时本机模拟 DimAgent 服务与模拟账号，不读取已有 DimAgent / Magpie 凭据。

- Codex 导入确认框正确显示完整模型 ID、本机前缀地址、OpenAI Chat Completions 和自动切换关闭；保存后出现成功提示。供应商卡片显示 `Needs routing`，编辑页保留 `model_reasoning_effort = "low"`。
- 点击实际 `Fetch Models` 得到两个 OpenAI-compatible 模型，包括未声明 endpoint 的模型；选择完整模型 ID 后能够应用到编辑草稿，随后取消草稿。
- OpenCode 确认框可以开启「导入后添加到配置」；导入后卡片显示 `Added · 1`。只读检查隔离客户端文件，确认 SDK 为 `@ai-sdk/openai-compatible`，地址和 `vendor/full-model-id` 完整保留。
- Chrome 的外部应用确认需要用户式确认。本次不设置永久允许；首次重复唤起未立即显示桌面窗口，检查 Chrome 原生提示并确认后继续，没有把等待确认当成导入失败。
- 未完成的项目：未进行真实账号授权、真实模型生成、额度重置，以及 Claude Code 安装版导入和取消导入流程。对应模拟与源码级证据仍见上文，不把它们计作安装版实测。

测试结束后退出隔离实例，恢复正常 CC Switch 并回到原来的 Claude Code `default` 供应商。原用户数据库的 providers/settings 行内容以及 Claude Code、Codex、OpenCode 客户端配置与测试前只读基线一致。模拟接入进程与浏览器测试页均已关闭。

截图仅包含隔离数据：

- [Codex 导入卡片](verification/desktop-codex-import.png)
- [安装版原生模型拉取](verification/desktop-fetch-models.png)
- [OpenCode 已添加](verification/desktop-opencode-added.png)


## 客户端列表扩展与更新期间页面一致性

2026-11-04，将三个客户端入口扩展至官方深链接支持的九个客户端，单一客户端定义由服务端随 `/api/state` 返回，页面据此显示并筛选兼容协议。API 流程覆盖九个客户端、27 个可用客户端/协议组合，以及不支持的客户端与协议拒绝。CC Switch 实际 `parse_deeplink_url` / `import_provider_from_deeplink` 对全部 27 组链接验证通过；包括 Gemini 环境配置、Antigravity 的 `config.model.name`、Grok Build 路由格式、Hermes 的 `api_mode` 与 OpenClaw / Pi 的 `api` 字段。

宿主测试先暴露了测试夹具的两个问题：Antigravity 使用独立的模型字段路径；快速批量导入相同名称会碰到宿主毫秒时间戳 ID 冲突。夹具改为按客户端/协议命名，并按各自公开配置检查。没有通过放宽生产约束掩盖不兼容。

用户在开发过程中遇到 `Cannot read properties of undefined (reading 'map')`：旧后台仍运行，但从磁盘读到了新版页面脚本，新脚本依赖旧 API 没有的 clients。先恢复与旧进程匹配的页面，再保留凭据重启为完整新版本。启动时固定页面资源，并设置脚本、样式和图标 `Cache-Control: no-store`，避免后续运行期间混入不同版本的磁盘文件。流程回归验证修改磁盘页面后，已运行实例仍返回与其 API 匹配的资源。

8 个流程测试和类型检查通过。浏览器只读实测确认用户现有登录被保留、真实模型及用量可读、九个客户端可见；选中不兼容客户端时禁用导入并给出明确提示。未调用付费模型或执行真实重置。新增客户端的模型生成链路尚未逐个实测，不将导入成功等同于端到端完成。


## 页面内自定义下拉

2026-11-04，参考 Nuxt UI v4 的 [Select](https://ui.nuxt.com/docs/components/select) 与 [SelectMenu](https://ui.nuxt.com/docs/components/select-menu)，将站点、模型、客户端、协议和推理强度改为页面内控件。实际实现保留原生 JavaScript，没有安装或声称直接使用 Nuxt UI Vue 组件。

使用隔离模拟账号在浏览器完成：鼠标选择 OpenCode 后推理强度禁用；End 后 Escape 取消保持原值；模型搜索无结果与筛选后 Enter 选择；Home 选择 Codex、模型搜索回选、Space / ArrowDown / Enter 选择 low，生成的链接保留 `vendor/full-model-id` 和 `model_reasoning_effort = "low"`；Tab 离开与点击外部关闭。390px 视口页面宽度为 390px，无横向溢出，下拉列表可滚动。菜单按可用空间计算方向与高度；本次截图覆盖向下展开，未单独证明向上展开分支。

现有 8 个流程测试、TypeScript 检查和浏览器脚本语法检查通过。未调用真实付费模型或执行额度重置。消融检查删除了旧 select 箭头伪元素与失去使用位置的 label 样式；共享控件仅承担实际需要的弹层、选择、搜索与键盘状态，不引入框架、构建依赖或额外业务状态。

截图为模拟账号：[普通视口](verification/custom-dropdown-mock.png)、[窄屏](verification/custom-dropdown-narrow-mock.png)。
