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
