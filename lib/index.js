/**
 * dsh-repo-context — 把 git 状态与仓库规范动态注入 system prompt。
 *
 * 基于官方 system-prompt 缝隙（docs/subsystems/system-prompt.md，mainline 2026-08-14）：
 *  - ctx.systemPrompt.context()：user-role durable snapshot（"Current runtime context"），
 *    变化才记录，不破坏前缀 KV cache——git 状态适合放这里
 *  - ctx.systemPrompt.section()：按 order 拼接的静态/动态指引——仓库规范指引适合
 *  - ctx.systemPrompt.variable()：插值变量——gitBranch 等
 *
 * 官方坑（已对照）：
 *  - text/variable provider 是**同步签名** → git 状态必须在 apply 时预取缓存，
 *    不能 await exec；用 spawnSync + 定时/事件刷新
 *  - variable provider 返回 undefined 且被 section 引用会渲染抛错 → git 拿不到时
 *    不注册该 variable、context 返回空串
 *  - 重名 section 同层抛错 → 命名统一 `repo:*` 前缀
 *  - 入口必须 namespace 形式（name/inject/Config/apply），**禁止 export default**
 *    （postmortem 0001：unwrapExports 会丢 inject）
 *  - 条件启用用 config 而非 `!!js`（postmortem 0002）
 */
import { spawnSync } from 'node:child_process';
import z from '@deepseek-ai/schemastery';
export const name = 'dsh-repo-context';
export const inject = ['systemPrompt'];
export const Config = z.object({
    enabled: z.boolean().default(true),
    gitContext: z.boolean().default(true),
    repoRules: z.boolean().default(true),
    refreshSeconds: z.number().default(0),
    recentCommits: z.number().default(1),
});
/** 同步读取 git 状态（text provider 是同步签名，只能预取缓存） */
function readGitState(cwd, recentCommits) {
    const empty = { inRepo: false, branch: '', dirtyFiles: 0, stagedFiles: 0, lastCommit: '' };
    const run = (args) => {
        try {
            const res = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5_000 });
            if (res.status !== 0)
                return '';
            return (res.stdout ?? '').trim();
        }
        catch {
            return '';
        }
    };
    const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch)
        return empty; // 非 git 仓库或无 HEAD → 不注入
    const porc = run(['status', '--porcelain']);
    const lines = porc ? porc.split('\n').filter(Boolean) : [];
    const dirty = lines.filter((l) => !l.startsWith('??')).length;
    const staged = lines.filter((l) => l.startsWith('M') || l.startsWith('A') || l.startsWith('D') || l.startsWith('R')).length;
    const lastCommit = run(['log', '-1', `--pretty=%h %s`, `-n`, String(recentCommits)]);
    return { inRepo: true, branch, dirtyFiles: dirty, stagedFiles: staged, lastCommit };
}
function formatGitState(s) {
    return [
        `Git repository: branch \`${s.branch}\``,
        s.dirtyFiles > 0 ? `, ${s.dirtyFiles} dirty files (${s.stagedFiles} staged)` : `, working tree clean`,
        s.lastCommit ? `, last commit ${s.lastCommit}` : '',
    ].join('');
}
export function apply(ctx, config) {
    const resolved = {
        enabled: config?.enabled ?? true,
        gitContext: config?.gitContext ?? true,
        repoRules: config?.repoRules ?? true,
        refreshSeconds: config?.refreshSeconds ?? 0,
        recentCommits: config?.recentCommits ?? 1,
    };
    if (!resolved.enabled)
        return;
    // systemPrompt 由 dsh 包声明合并（@deepseek-ai/dsh-core-system-prompt），
    // 裸 @deepseek-ai/cordis 无该声明 → 鸭子类型最小接口（对齐 dsh-tray WebServerLike 模式）
    const systemPrompt = ctx.systemPrompt;
    // 缓存：apply 时同步取一次；refreshSeconds>0 时定时刷新
    let state = readGitState(process.cwd(), resolved.recentCommits);
    const disposers = [];
    ctx.effect(() => () => disposers.forEach((d) => d()), 'dsh-repo-context: dispose all');
    const refresh = () => {
        state = readGitState(process.cwd(), resolved.recentCommits);
    };
    if (resolved.refreshSeconds > 0) {
        const timer = setInterval(refresh, resolved.refreshSeconds * 1_000);
        ctx.effect(() => () => clearInterval(timer), 'dsh-repo-context: refresh timer');
    }
    // 1) git 状态 → durable context（user-role snapshot，变化才记录）
    if (resolved.gitContext && state.inRepo) {
        disposers.push(systemPrompt.context({
            name: 'repo:git-state',
            order: 10,
            text: () => formatGitState(state),
        }));
        // 2) 分支变量（供 section/其他插件插值）；拿不到 git 就不注册（防渲染抛错）
        // 变量名须匹配 ^[a-z][a-z0-9_]*$（官方坑：大写/连字符直接抛错，已实测）
        disposers.push(systemPrompt.variable('git_branch', () => (state.inRepo ? state.branch : undefined)));
    }
    // 3) 仓库规范指引 section（静态文本，order 60 在 identity/persona 之后、tool 指引之前）
    if (resolved.repoRules) {
        disposers.push(systemPrompt.section({
            name: 'repo:rules',
            order: 60,
            text: '遵循当前仓库根目录的 AGENTS.md / README / CONTRIBUTING 中的项目规范与约定；'
                + '不确定时先读这些文件再动手。',
        }));
    }
    ctx.logger.info(`[dsh-repo-context] ${state.inRepo ? `注入 git 上下文: branch=${state.branch} dirty=${state.dirtyFiles}` : '非 git 仓库，仅注入规范指引'}`);
}
