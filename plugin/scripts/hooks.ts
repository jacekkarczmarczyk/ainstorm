import type { Api } from './lib.ts';

/**
 * What each Claude Code hook does with the map. Pure apart from the injected API, so every case is tested
 * without processes. Fail-open: any error means "do nothing"; only a mis-pasted ainstorm prompt is blocked.
 */

export interface HookInput {
  hook_event_name: string;
  session_id: string;
  cwd?: string;
  source?: string;
  /** The name Claude Code shows for the session (/rename, --name); absent while it has none */
  session_title?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
}

export interface HookOutput {
  decision?: 'block';
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: { hookEventName: string; additionalContext?: string; sessionTitle?: string };
}

export interface HookDeps {
  api: Api;
  ensureDaemon(): Promise<boolean>;
}

/** Context for Claude and, from SessionStart and UserPromptSubmit, a name for the session in Claude Code (like /rename) */
const context = (event: string, text: string | null | undefined, sessionTitle: unknown = null): HookOutput | null => {
  const title = typeof sessionTitle === 'string' && sessionTitle ? sessionTitle : null;
  if (!text && !title) return null;
  return { hookSpecificOutput: { hookEventName: event, ...(text ? { additionalContext: text } : {}), ...(title ? { sessionTitle: title } : {}) } };
};

// Sessions join the map only on request: until then Claude leaves the map alone
const NOT_REGISTERED = [
  'ainstorm: this directory belongs to no project in the task map, and this session is not tracked.',
  'Do not use the ainstorm tools here unless the user asks; /ainstorm:open offers to register the folder as a project.',
].join(' ');
const NOT_TRACKED = (project: string) => [
  `ainstorm: this directory is project ${project} in the task map, but this session is not tracked.`,
  'Do not use the ainstorm tools here unless the user asks; /ainstorm:open adds this session to the map,',
  'and /ainstorm:continue <session id> continues an earlier session here.',
].join(' ');

/** A prompt copied from the map for no particular session (`[ainstorm #N · project · …]`): the user wants this session tracked */
const PROJECT_PROMPT = /^\[ainstorm #\d+ · project · /m;

/** `[branch 1a2b3c4] message` printed by git commit */
export function parseCommit(output: string): { sha: string; message: string } | null {
  const match = /^\[[^\]\s]+(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.*)$/m.exec(output);
  return match ? { sha: match[1]!, message: match[2]!.slice(0, 500) } : null;
}

const responseText = (response: unknown): string => {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    return [r.stdout, r.output, r.result].filter(v => typeof v === 'string').join('\n');
  }
  return '';
};

/** The plan file of an approved ExitPlanMode: `filePath` in its result, `planFilePath` in its input */
export function planFile(input: HookInput): string | null {
  const response = input.tool_response && typeof input.tool_response === 'object' ? input.tool_response as Record<string, unknown> : {};
  const path = response.filePath ?? input.tool_input?.planFilePath;
  return typeof path === 'string' && path.trim() ? path : null;
}

const PLAN_UNATTACHED = (path: string) => [
  `ainstorm: the approved plan ${path} is attached to no task, as this session runs none.`,
  'Attach it with task_update (planPath) to the task it is for.',
].join(' ');

/** Short, single-line description of what a permission prompt is about (no file contents). */
export function permissionDetail(tool: string, input: Record<string, unknown> | undefined): string {
  const value = input?.command ?? input?.file_path ?? input?.url ?? input?.pattern ?? '';
  return String(value).replace(/\s+/g, ' ').slice(0, 200);
}

export async function runHook(input: HookInput, deps: HookDeps): Promise<HookOutput | null> {
  const { api } = deps;
  const session = `/api/sessions/${input.session_id}`;
  const op = (body: Record<string, unknown>) => api<Record<string, unknown>>('POST', `${session}/ops`, body);
  const deliveries = async () => (await api<{ context: string | null }>('POST', `${session}/deliveries`, {})).context;
  const event = input.hook_event_name;
  // The session's name in Claude Code wins in the map; a title only the map has goes to Claude Code (`push`)
  const syncTitle = async () => (await op({ op: 'claudeTitle', title: input.session_title?.trim().slice(0, 200) || null })).push;
  // A daemon that went down or was restarted during the session is started again by the next hook (one /health
  // call while it runs); when it cannot be started, the hook does nothing
  const up = await deps.ensureDaemon();

  if (event === 'SessionStart') {
    if (!up) return { systemMessage: 'ainstorm: the map service is not running; working without the task map.' };
    const started = await op({ op: 'start', cwd: input.cwd ?? '', source: input.source ?? 'startup' });
    if (started.project === null) return context(event, NOT_REGISTERED);
    if (!started.tracked) return context(event, NOT_TRACKED(String(started.project)));
    const push = await syncTitle();
    const [map, pending] = [(await api<{ context: string | null }>('GET', `${session}/context`)).context, await deliveries()];
    return context(event, [map, pending].filter(Boolean).join('\n\n'), push);
  }
  if (!up) return null;

  switch (event) {
    case 'UserPromptSubmit': {
      const { block } = await api<{ block: string | null }>('POST', `${session}/prompt`, { prompt: input.prompt ?? '' });
      if (block) return { decision: 'block', reason: block };
      // A prompt from the map for no particular session (Run for a task without one, pasted into a new session) adds
      // this session to the map
      if (PROJECT_PROMPT.test(input.prompt ?? '')) await op({ op: 'start', cwd: input.cwd ?? '', source: 'startup', register: true });
      await op({ op: 'active' });
      const push = await syncTitle();
      return context(event, await deliveries(), push);
    }
    case 'PostToolUse': {
      await op({ op: 'active' });
      if (input.tool_name === 'Bash' && /\bgit\b[^\n]*\bcommit\b/.test(String(input.tool_input?.command ?? ''))) {
        const commit = parseCommit(responseText(input.tool_response));
        if (commit) await op({ op: 'addCommit', ...commit });
      }
      // PostToolUse runs only for a plan the user approved; a rejected one ends in PostToolUseFailure
      const plan = input.tool_name === 'ExitPlanMode' ? planFile(input) : null;
      const unattached = plan && (await op({ op: 'attachPlan', path: plan })).taskId === undefined ? PLAN_UNATTACHED(plan) : null;
      return context(event, [unattached, await deliveries()].filter(Boolean).join('\n\n'));
    }
    case 'PermissionRequest': {
      const tool = input.tool_name ?? 'a tool';
      await op({ op: 'waitPermission', tool, detail: permissionDetail(tool, input.tool_input) });
      // No decision: Claude Code shows its usual prompt to the user
      return null;
    }
    // A refused permission ends the turn like an interrupt, without Stop; a failed or refused tool clears the wait
    case 'PostToolUseFailure':
      await op({ op: 'active' });
      return null;
    // Notification (permission_prompt) is not used: it arrives late, even after the prompt was answered and the
    // turn ended, and would mark the session waiting again. PermissionRequest comes exactly when the prompt opens.
    case 'Stop':
      await op({ op: 'stop' });
      return null;
    case 'SessionEnd':
      await op({ op: 'end' });
      return null;
    default:
      return null;
  }
}
