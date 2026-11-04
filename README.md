# DimAgent for CC Switch

<img src="page/icon.png" width="72" alt="DimAgent">

### 这是做什么的？

用你的 DimAgent 账号登录，选好模型，再点一下导入 CC Switch。登录后可以查看套餐和用量，也能确认后重置额度。

### 怎么安装？

先安装 [Bun](https://bun.sh) 和 [CC Switch](https://github.com/farion1231/cc-switch/releases)。当前按 CC Switch 4.0.25 源码接入；建议使用该版本或更新版本。

下载项目并启动：

```bash
git clone https://github.com/arcships/cc-switch-dim-oauth.git
cd cc-switch-dim-oauth
bun install --frozen-lockfile
bun start
```

浏览器打开 [DimAgent 账户页](http://127.0.0.1:3489)。使用导入的供应商时，保持这个终端运行。按 `Ctrl+C` 退出。

### 怎么登录和导入？

1. 选择站点，点击「登录」，再点「前往授权页面」。用 DimAgent 账号完成授权，然后返回账户页。
2. 选择模型、客户端和接口。目录会显示当前可用的推理强度与 ZDR；Codex 支持的推理强度可以一起导入。
3. 点击「生成导入链接」，再点「打开 CC Switch 导入」。在 CC Switch 的确认框里核对模型与本机地址，确认导入后，自己切换到这个供应商。

目前提供 Claude Code、Codex、OpenCode 的导入入口。Claude Code 和 Codex 使用非原生接口时，请按 CC Switch 的提示开启本地路由。Gemini 原生模型请选择 OpenCode。

同一站点只保留一个账号，再次登录会替换。模型目录变化后，点击「刷新模型」再导入需要的模型；重复导入会新增卡片，可以在 CC Switch 删除不再需要的旧卡片。ZDR 以刷新后的目录为准。

### 用量在哪里看？

在账户页点击「刷新」。账户剩余包含套餐余额，不要把它和套餐总量加在一起。没有提供总量的额度只显示余额，不显示使用百分比。

CC Switch 卡片暂时不会自动显示这份用量，请使用账户页。

### 怎么购买或续期？

点击账户页的「购买 / 续期」，或直接打开 [订阅管理](https://dimagent.cn/console/subscription)。想先看看套餐，打开 [套餐价格](https://dimagent.cn/console/pricing)。

### 怎么重置额度？

在账户页选择「重置限流窗口」或「重置月度额度」。先核对账号、套餐、订阅和可用次数，再点「确认并重置」。确认后会消耗一次对应的重置次数，无法撤销。

如果网络中断，在同一个确认框里重试；不要重新发起一份重置。退出程序会丢失未完成的确认，此时请先刷新用量，确认上一次是否已生效。

### 图标怎么设置？

账户页已经使用 DimAgent 原图。要让 CC Switch 卡片也显示原图，可以在编辑供应商时上传本项目的 `page/icon.png`。

### 登录失败，或者提示端口被占用？

授权使用本机 `54322` 端口，账户页使用 `3489`。同时打开其他使用这个授权端口的登录窗口会冲突；关闭其他正在进行的登录后重试。不要修改回调地址。

导入后无法连接时，先检查运行 `bun start` 的终端是否还在，再回到账户页刷新模型和用量。授权失效时重新登录；不要把网页账号密码或真实令牌填到 CC Switch 中。

### 登录信息保存在哪？怎么清理？

保存在 `~/.local/share/cc-switch-dim-oauth/`，凭据文件只供当前用户读取。点击「退出登录」会删除所选站点的本地凭据；服务器上的授权管理由 DimAgent 控制台负责。

要使用隔离目录，可以运行：

```bash
DIM_CC_STATE_DIR="$PWD/.state" bun start
```

停止程序后可删除这个目录，但会清除登录和本地连接 Key，之后需要重新登录和导入。不要把这个目录分享、提交或放入公开备份。

### 怎么检查代码？

```bash
bun test
bun run check
```

项目通过 GitHub 分发，未发布 npm。模拟测试不会调用付费模型或消耗真实重置次数。
