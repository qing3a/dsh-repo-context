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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "dsh-repo-context";
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    /** 是否注入 git 状态 context（分支/脏文件数/最近提交） */
    gitContext: boolean;
    /** 是否注入仓库规范指引 section */
    repoRules: boolean;
    /** git 状态缓存刷新间隔（秒），0 = 仅启动时取一次 */
    refreshSeconds: number;
    /** 最近提交展示条数 */
    recentCommits: number;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): void;
