# dsh-repo-context

> 把 **git 状态与仓库规范** 动态注入 system prompt——DSH 的 system-prompt 缝隙插件
> （官方 `docs/subsystems/system-prompt.md` 能力，生态真空位）。

模型每轮组装 prompt 时，自动带上当前仓库的分支/脏文件/最近提交，以及"遵循仓库规范"的指引——不用人肉重复，也不污染历史（走 durable context，变化才记录）。

## 安装 / 卸载

```sh
# 安装（web profile 示例）
dsh plugin --profile web add @qing3a/dsh-repo-context
# 卸载
dsh plugin --profile web remove @qing3a/dsh-repo-context
```

重启 DSH 后生效。源码安装：`dsh plugin add link:<本仓库路径>`。

## Quick start

默认配置即用：在任意 git 仓库内运行，插件自动注入分支/脏文件数/最近提交 + 仓库规范指引。

```sh
dsh web --profile web
# 会话中模型即可看到 "Git repository: branch `main`, working tree clean, last commit ..."
```

## Configuration

| 配置 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `gitContext` | `true` | 注入 git 状态 context（分支/脏文件/最近提交） |
| `repoRules` | `true` | 注入仓库规范指引 section |
| `refreshSeconds` | `0` | git 状态缓存刷新间隔（秒），`0` = 仅启动时取一次 |
| `recentCommits` | `1` | 最近提交展示条数 |

```yaml
# profile 的 cordis.patch.yml 覆盖
- update:
    - id: dsh-repo-context
      config:
        refreshSeconds: 60
```

## Permissions & data

- **只读**：仅执行 `git rev-parse` / `git status --porcelain` / `git log`，不写文件、不改配置、无网络请求
- git 信息只在进程内缓存，不持久化、不外发

## Compatibility

- DSH mainline `47f94385`（rc.5 + npm-public 后）实测通过
- 依赖 `ctx.systemPrompt`（`@deepseek-ai/dsh-system-prompt`，base bundle 默认挂载）

## Verification

dsh-plugin-verify 0.1.2（mock 平台感知修正后）实测：

```
✅ 通过 | 捕获事件: 13 | waterfall: 7/7 | tools/result: 是
R1-entry-shape ✓  R2-patch-yaml ✓  R3-tools-result ✓（工具真实执行成功，isError:false）
```

报告：https://github.com/qing3a/dsh-plugin-verify/blob/main/reports/repo-context-2026-08-14.json
（判定站已收录 ✅ Verified：https://github.com/qing3a/dsh-plugin-verify）

## Development

```bash
pnpm install        # 或 npm install
pnpm build          # tsc → lib/
```

源码要点：text/variable provider 是官方同步签名，git 状态在 apply 时预取缓存（`refreshSeconds` 定时刷新）；变量名 `git_branch` 满足官方 `^[a-z][a-z0-9_]*$` 约束；namespace 入口无 `export default`（postmortem 0001）。

## License

MIT
