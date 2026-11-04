# DimAgent 接入 CC Switch

<img src="page/icon.png" width="72" alt="DimAgent">

通过 CC Switch 的供应商导入功能，在 CC Switch 支持的客户端中使用 DimAgent。支持账号登录、模型选择，以及套餐和用量管理。

本指南按 CC Switch 官方的 [添加供应商](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.1-add.md)、[切换供应商](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.2-switch.md) 和 [深链接导入指南](https://github.com/farion1231/cc-switch/blob/main/docs/guides/deeplink-site-integration-guide-zh.md) 整理。**本项目采用 OAuth 登录，需要在本机运行配套程序；使用期间请保持程序运行。**

### 开始前需要准备什么？

准备好 DimAgent 账号，以及 [CC Switch](https://github.com/farion1231/cc-switch/releases)、[Git](https://git-scm.com/downloads) 和 [Bun](https://bun.sh)。本机已验证的 CC Switch 安装版为 macOS 4.0.25，其他版本与系统尚未完成实机验证。

首次配置分为三步：

```text
启动并登录 DimAgent → 导入供应商 → 在对应客户端中启用
```

### 第一步：怎么启动并登录 DimAgent？

在终端下载并启动本项目：

```bash
git clone https://github.com/arcships/cc-switch-dim-oauth.git
cd cc-switch-dim-oauth
bun install --frozen-lockfile
bun start
```

看到 `DimAgent: http://127.0.0.1:3489` 后，打开 [DimAgent 账户页](http://127.0.0.1:3489)。选择站点，点击「登录」→「前往授权页面」，在 DimAgent 网页完成授权，再返回账户页。

登录成功后，账户页会提供当前账号的模型目录、套餐与用量。终端保持运行，继续下一步。

### 第二步：怎么导入供应商？

1. 在账户页选择要使用的**客户端、模型和接口**。接口只从该模型提供的选项中选择。
2. 使用 Codex 的 OpenAI 类接口时，可以同时选择目录提供的推理强度；留空表示使用客户端默认行为。
3. 点击「生成导入链接」→「打开 CC Switch 导入」。浏览器询问是否打开 CC Switch 时，选择打开。
4. 在 CC Switch 的「确认导入供应商」窗口核对以下内容，再点击「导入」。

| CC Switch 字段 | DimAgent 对应内容 |
| --- | --- |
| 应用类型 | 所选客户端；当前提供 9 个导入入口，每次导入对应一个客户端 |
| 供应商名称 | `DimAgent · 模型显示名` |
| API 端点 | `http://127.0.0.1:3489/relay/...`，由本程序按站点、接口和客户端生成，保留完整路径 |
| API Key | 自动生成的本地连接 Key；无需手动填写 DimAgent 密码或 OAuth 令牌 |
| 模型 | 目录中的完整模型 ID，不删除前缀、不另起请求名称 |
| 接口格式 | 所选模型提供的协议，见下表 |
| 导入后切换 / 添加到配置 | 本项目默认关闭，可以在确认框中开启；也可以导入后再启用 |

CC Switch 会对本机端点显示提示。确认它是自己启动的 `127.0.0.1:3489` 服务即可；API Key 与地址都会随导入链接一起带入，不需要另找一份 Key。

同一链接重复导入会新增卡片。请先处理完当前确认框，再导入下一个客户端或模型。

### 接口格式怎么选？

以账户页为当前模型提供的接口选项为准。导入链接会按 CC Switch 官方约定填写格式：

| 账户页接口 | CC Switch 格式 | 本项目提供的客户端入口 |
| --- | --- | --- |
| OpenAI Chat Completions | `openai_chat` | Claude Code、Codex、OpenCode、Grok Build、OpenClaw、Hermes、Pi |
| OpenAI Responses | `openai_responses` | Claude Code、Codex、OpenCode、Grok Build、OpenClaw、Hermes、Pi |
| Anthropic Messages | `anthropic` | Claude Code、Codex、OpenCode、Grok Build、OpenClaw、Hermes、Pi |
| Gemini | `gemini_native` | Claude Code、OpenCode、Gemini CLI、Antigravity CLI、OpenClaw、Pi |

客户端列表按 CC Switch 的深链接支持范围提供。Claude Desktop、MiniMax Code、Kimi Code、DeepSeek Harness、Oh My Pi 暂不支持通过此页面导入。所选模型没有客户端支持的协议时，页面会提示换模型或客户端。

**Claude Code 的原生格式是 Messages，Codex 和 Grok Build 的原生格式是 Responses。** 所选接口与客户端原生格式不一致时，CC Switch 会显示「需要路由 / Needs routing」，需要启用其本地路由来转换格式。OpenCode 按导入的接口格式连接。

不要仅凭模型名称猜测接口，也不要手动把生成地址的 `/v1` 或其他路径删掉。地址和格式需要配套使用。

### 第三步：导入后怎么启用？

导入和启用是两个步骤；在确认框中开启相应开关，可以一起完成。

| 客户端 | 在 CC Switch 中的操作 | 完成后在哪里选模型 |
| --- | --- | --- |
| Claude Code、Codex、Grok Build | 在对应应用的供应商列表中找到 DimAgent，点击「切换 / Switch」。如提示需要路由，按提示启用「路由 / Routing」 | 重新打开客户端，按其模型选择入口选择或确认模型 |
| OpenCode、OpenClaw、Pi | 在导入确认框开启「导入后添加到应用配置」，或导入后在对应列表添加 / 启用 | 在对应客户端内选择模型 |
| Hermes | 先添加到应用配置，再按 Hermes 供应商页的「启用」操作选择供应商 | 在 Hermes 内使用所选模型 |
| Gemini CLI | 导入后在对应供应商页切换，仅支持 Gemini 原生接口 | 重新打开 Gemini CLI |
| Antigravity CLI | 导入到对应供应商页，后续配置按该页面提供的操作进行；不套用其他应用的切换流程 | 在 Antigravity CLI 内使用所选模型 |

使用 CC Switch 路由时，同时保持 CC Switch 与本项目的本地程序运行。OpenCode 可以同时添加多个供应商，不需要把它当作单选供应商来切换。

### 以后怎么使用、更新模型和停止？

以后进入已经下载的项目目录，运行 `bun start`，即可继续使用 CC Switch 中保存的供应商。有效的登录会保留并按需续期，不需要每次重新安装、登录或导入。浏览器账户页可以关闭。

账户页的「刷新模型」读取最新目录，**不会自动覆盖 CC Switch 中的卡片**。需要更新时，可重新导入，或在 CC Switch 编辑供应商时使用「拉取模型 / Fetch Models」；旧卡片按需手动删除。推理强度与 ZDR 以最新目录为准，卡片备注只记录导入时的 ZDR 状态。

在终端按 `Ctrl+C` 停止本程序后，该 DimAgent 供应商会暂时无法连接；重新运行后可继续使用。本项目暂未提供开机自动启动。关闭 CC Switch 也不会替你启动本程序。

### 怎么更新本程序？

在原终端按 `Ctrl+C` 停止程序，在项目目录执行 `git pull` 和 `bun install --frozen-lockfile`，再运行 `bun start`，最后刷新浏览器账户页。登录信息保留；页面与后台需要一起更新，运行期间修改页面文件不会立即切换已启动实例的版本。

### 用量、购买和额度重置在哪里？

在 [DimAgent 账户页](http://127.0.0.1:3489) 查看套餐与用量，点击「刷新」读取最新数据。账户剩余包含套餐余额，不与套餐额度相加；未提供总量时只显示余额。当前接入不向 CC Switch 卡片提供用量查询。

购买或续期可点击账户页入口，也可以直接打开 [订阅管理](https://dimagent.cn/console/subscription) 和 [套餐价格](https://dimagent.cn/console/pricing)，在官方控制台完成交易。

重置时选择「重置限流窗口」或「重置月度额度」，核对账号、套餐、订阅和剩余次数，再确认执行。**成功重置会消耗一次对应次数，无法撤销。** 网络中断时在同一个确认框内重试，会复用原幂等标识；程序重启后应先刷新用量，确认上一次结果，再决定是否重新发起。

### 常见问题

**能在 CC Switch 里直接安装这个仓库吗？**

本项目通过官方的 `ccswitch://` 供应商导入方式接入。CC Switch 当前没有供它使用的外部 OAuth 服务商插件接口，所以需要先运行本地程序；登录入口在本地账户页。仓库通过 GitHub 分发，未发布 npm。有关宿主原生 OAuth 接入的范围见 [接入说明](docs/integration.md)。

**点击导入后没有反应？**

确认已安装 CC Switch，并检查浏览器是否还在等待「打开 CC Switch？」确认。如果 CC Switch 已有导入窗口，先处理完它。不要连续点击，以免重复添加。

**导入成功，但客户端无法连接？**

依次检查：本地程序是否仍在运行；供应商是否已切换或添加到客户端配置；「需要路由」的供应商是否已经启用路由。配置变更后按客户端要求重新打开客户端。授权过期时回到账户页重新登录。

**提示端口被占用？**

`3489` 是本地程序端口，先打开账户页确认是否已经运行了一份。`54322` 是固定登录回调端口；如果 Magpie 等程序正在使用同一端口登录，结束另一个登录流程后再试，不要修改回调地址。

**图标和登录信息怎么管理？**

编辑 CC Switch 供应商时，可上传本项目的 `page/icon.png`。账户页已使用同一张 DimAgent 原图。

登录信息保存在 `~/.local/share/cc-switch-dim-oauth/`，凭据文件只供当前用户读取。每个站点保留一个账号，同站点重新登录会替换旧账号。「退出登录」只删除所选站点的本地凭据，不删除 CC Switch 卡片；服务端授权由 DimAgent 控制台管理。

停止程序后删除该目录会同时清除本地连接 Key，之后需要重新登录并重新导入。不要分享这个目录或包含连接 Key 的导入链接。

### 哪些流程已经验证？

已在 macOS 安装版 CC Switch 4.0.25 中，以隔离配置和模拟 DimAgent 账号验证 Codex 导入、完整模型 ID 与推理强度保留、模型拉取，以及 OpenCode 配置写入。模拟流程还覆盖登录、续期、流式转发和幂等重置。

两站授权参数已通过匿名预检；真实账号登录、续期与付费模型生成尚未完成端到端实测。新增客户端已通过 CC Switch 原生导入代码验证，尚未逐个完成真实客户端模型生成实测。详细证据与开发检查方式见 [验证记录](docs/verification.md)。
