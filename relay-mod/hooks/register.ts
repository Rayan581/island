import type { Register, EngineInterface } from 'claude-code'

// Island's mailbox: one small file (state.json) in a private repo, overwritten with the latest status. Island polls it.
const REPO = 'Rayan581/island-relay'
const DIR = '/home/claude/island-relay' // the session's clone of the repo; re-cloned below if the container was reset
const LABEL = 'Claude chat' // shown as the "project" in the pill
const MIN_GAP_MS = 4000 // at most one push per 4 s (tool bursts are coalesced to the latest)
const HOURLY_CAP = 360 // pushes per hour; tool updates beyond this are dropped, turn start/end never are
const SECRET = /(token|secret|passw|api[_-]?key|authorization|bearer|credential|private[_-]?key)/i

type Kind = 'start' | 'tool' | 'stop'
interface Payload {
  v: 1; seq: number; ts: number; kind: Kind; project: string
  tool: string; detail: string; toolCount: number; startedAt: number
}

const clean = (s: string, n: number) => s.replace(/\s+/g, ' ').replace(/[^\x20-\x7e]/g, '?').slice(0, n)

function detailOf(a: Record<string, unknown>): string {
  const cmd = typeof a.command === 'string' ? a.command : ''
  if (cmd) return SECRET.test(cmd) ? '$ (hidden)' : '$ ' + clean(cmd, 70)
  const f = a.file_path ?? a.notebook_path ?? a.path
  if (typeof f === 'string') return clean(f.split(/[\\/]/).pop() || f, 60)
  const q = a.pattern ?? a.query ?? a.url ?? a.description
  return typeof q === 'string' && !SECRET.test(q) ? clean(q, 60) : ''
}

// State lives at module level (not inside register) so the helpers below can take `$` as the plugin validator requires.
// A reload starts it over, which only costs one extra "read the current sha" round trip.
let seq = 0
let toolCount = 0
let startedAt = 0
let latest: Payload | null = null
let pumping = false
let lastWrite = 0
const writes: number[] = []

// Commit + push is the one write path this session's proxy allows for an attached repo (its REST write API is blocked).
const WHO = ['-c', 'user.name=island-relay', '-c', 'user.email=island-relay@users.noreply.github.com']

async function put($: EngineInterface, p: Payload) {
  const git = (args: string[], stdin?: string) => $.process.run(['git', '-C', DIR, ...args], { stdin, timeoutMs: 30000 })
  if ((await git(['rev-parse', 'HEAD'])).exitCode !== 0) {
    await $.process.run(['git', 'clone', '--depth', '1', `https://github.com/${REPO}`, DIR], { timeoutMs: 120000 })
  }
  await $.process.run(['sh', '-c', 'cat > state.json'], { cwd: DIR, stdin: JSON.stringify(p), timeoutMs: 10000 })
  await git(['add', 'state.json'])
  await git([...WHO, 'commit', '-q', '-m', 'relay'])
  if ((await git(['push', '-q', 'origin', 'HEAD:main'])).exitCode !== 0) {
    // Someone else touched the repo: line up on its tip, keep our file, push once more.
    await git(['fetch', '-q', '--depth', '1', 'origin', 'main'])
    await git(['reset', '-q', '--soft', 'FETCH_HEAD'])
    await git(['add', 'state.json'])
    await git([...WHO, 'commit', '-q', '-m', 'relay'])
    await git(['push', '-q', 'origin', 'HEAD:main'])
  }
}

async function pump($: EngineInterface) {
  if (pumping) return
  pumping = true
  try {
    while (latest) {
      const wait = lastWrite + MIN_GAP_MS - (await $.clock.now())
      if (wait > 0) await $.clock.sleep(wait)
      const p = latest
      latest = null
      if (!p) break
      await put($, p)
      lastWrite = await $.clock.now()
    }
  } catch { /* never let the relay disturb the chat */ } finally { pumping = false }
}

function emit($: EngineInterface, kind: Kind, tool = '', detail = '') {
  const now = Date.now()
  while (writes.length && writes[0] < now - 3600e3) writes.shift()
  if (kind === 'tool' && writes.length >= HOURLY_CAP) return
  if (kind === 'start') { startedAt = now; toolCount = 0 }
  if (!startedAt) startedAt = now
  writes.push(now)
  latest = { v: 1, seq: ++seq, ts: now, kind, project: LABEL, tool, detail, toolCount, startedAt }
  void pump($)
}

export const register: Register = (on) => {
  on('turn.start', ($, e, next) => {
    if (!e.agentId) emit($, 'start', 'Thinking')
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    toolCount++
    emit($, 'tool', String(e.tool), detailOf(e as unknown as Record<string, unknown>))
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (!e.agentId) emit($, 'stop')
    return next(e)
  })
}
