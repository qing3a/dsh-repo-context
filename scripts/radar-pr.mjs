// Create a registration PR on awesome-dsh-plugins via gh api (works when git push is blocked).
// Flow: fork → new branch → edit PLUGINS.md via Contents API → create PR.
// 用法：node scripts/radar-pr.mjs（参数化：改下方常量）
import { execFileSync } from 'node:child_process'

const OWNER = 'AdamPlatin123'
const REPO = 'awesome-dsh-plugins'
const FORK = 'qing3a/awesome-dsh-plugins'
const BRANCH = 'docs/register-dsh-repo-context'
const PLUGINS_PATH = 'PLUGINS.md'

// —— 待登记插件（改这里即可复用）——
const PLUGIN_NAME = 'dsh-repo-context'
const PLUGIN_REPO = 'https://github.com/qing3a/dsh-repo-context'
const PLUGIN_DESC = '把 git 状态与仓库规范动态注入 system prompt（section/context/variable，官方 system-prompt 缝隙插件）；dsh-plugin-verify 0.1.2 实测 7/7 waterfall + 工具真实执行（R3 isError:false）'
const PLUGIN_VERSION = '0.1.0'

function gh(args, input) {
  const opts =
    input === undefined
      ? { encoding: 'utf8' }
      : { input: JSON.stringify(input), encoding: 'utf8' }
  const full = input === undefined ? args : [...args, '--input', '-']
  return execFileSync('gh', ['api', ...full], opts)
}

// 1. Fork main head sha
const forkRef = JSON.parse(gh([`repos/${FORK}/git/ref/heads/main`]))
const baseSha = forkRef.object.sha
console.log('fork main sha:', baseSha.slice(0, 7))

// 2. Create branch (delete if exists)
try {
  gh([`repos/${FORK}/git/refs/heads/${BRANCH}`, '--method', 'DELETE'])
  console.log('deleted existing branch')
} catch { /* not exists */ }
gh([`repos/${FORK}/git/refs`, '--method', 'POST'], {
  ref: `refs/heads/${BRANCH}`,
  sha: baseSha,
})
console.log('branch created:', BRANCH)

// 3. Get current PLUGINS.md blob sha
const current = JSON.parse(gh([`repos/${FORK}/contents/${PLUGINS_PATH}?ref=${BRANCH}`]))
const currentContent = Buffer.from(current.content, 'base64').toString('utf8')
console.log('current PLUGINS.md bytes:', currentContent.length)

// 4. Insert our row into the 单插件 (single plugin) table, after the header row
const ROW = `| ${PLUGIN_NAME} | [qing3a/${PLUGIN_NAME}](https://github.com/qing3a/${PLUGIN_NAME}) | ${PLUGIN_DESC} | ✅ |\n`
const ANCHOR = '| 插件 | 仓库 | 说明 | 运行级 |\n'
if (!currentContent.includes(PLUGIN_NAME)) {
  const updated = currentContent.replace(ANCHOR, ANCHOR + ROW)
  gh([`repos/${FORK}/contents/${PLUGINS_PATH}`, '--method', 'PUT'], {
    message: `docs: 登记 ${PLUGIN_NAME}（含运行时验证证据）`,
    content: Buffer.from(updated, 'utf8').toString('base64'),
    sha: current.sha,
    branch: BRANCH,
  })
  console.log(`PLUGINS.md updated with ${PLUGIN_NAME} row`)
} else {
  console.log('row already present')
}

// 5. Create PR
const body = `## 插件信息

| 项 | 值 |
|---|---|
| 插件名 | ${PLUGIN_NAME} |
| 仓库 | ${PLUGIN_REPO} |
| 一句话说明 | ${PLUGIN_DESC} |
| 版本 | ${PLUGIN_VERSION} |

## 自检清单

- [x] package.json name 使用 @qing3a scope（合法小写，未占用 @deepseek-ai/* 保留命名空间）
- [x] 仓库已打 dsh-plugin / dsh / deepseek-harness / system-prompt / git topic
- [x] 所有运行时依赖已声明（@deepseek-ai/schemastery deps + @deepseek-ai/dsh-system-prompt peerDeps）
- [x] README 含概述/安装卸载/Quick start/配置/权限数据/兼容性/验证/开发/License
- [x] 运行时验证实测（dsh-plugin-verify 0.1.2，mock 平台感知修正后）：**7/7 waterfall 链完整 + tools/result 工具真实执行成功（isError:false，非空转）；R1/R2/R3 全过**。报告：https://github.com/qing3a/dsh-plugin-verify/blob/main/reports/repo-context-2026-08-14.json ；判定站已收录：https://github.com/qing3a/dsh-plugin-verify

## 改动内容
- PLUGINS.md 单插件表新增一行（运行级 ✅，基于完整运行时验证）
`
const pr = JSON.parse(gh([`repos/${OWNER}/${REPO}/pulls`, '--method', 'POST'], {
  title: `docs: 登记 ${PLUGIN_NAME}`,
  head: `${FORK.split('/')[0]}:${BRANCH}`,
  base: 'main',
  body,
}))
console.log('PR created:', pr.html_url)
