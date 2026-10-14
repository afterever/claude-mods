// Sorting a finished task into one kind, by the tools it used. Pure: the
// register module collects the tool uses, this decides.
import type { Kind } from '../types'

// The order the rows are stored and shown in; a tie in the pane keeps it.
export const KINDS: readonly Kind[] = ['emails', 'images', 'code', 'documents', 'research', 'other']

// Which kind wins when a task touched several. Code is first on purpose: a
// source file that was written says what the task was, and outweighs a
// screenshot that was looked at or an email that was sent along the way.
const PRIORITY: readonly Kind[] = ['code', 'emails', 'images', 'documents', 'research']

export const KIND_LABEL: Record<Kind, string> = {
  emails: 'Emails',
  images: 'Images and video',
  code: 'Code',
  documents: 'Documents',
  research: 'Research',
  other: 'Other',
}

/** The same kinds in a narrow pane. */
export const KIND_SHORT: Record<Kind, string> = {
  emails: 'Emails',
  images: 'Images',
  code: 'Code',
  documents: 'Docs',
  research: 'Research',
  other: 'Other',
}

/**
 * One tool call of the turn: its name, for a file tool the path it worked on,
 * and for a shell tool the start of its command. Kept in memory until the turn
 * ends, to be sorted; none of it is stored.
 */
export type ToolUse = { tool: string; path?: string; command?: string }

const IMAGE_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff', 'ico', 'psd',
  'mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'wmv', 'gifv',
])
const DOCUMENT_EXT = new Set([
  'md', 'txt', 'rtf', 'doc', 'docx', 'odt', 'pdf', 'tex',
  'ppt', 'pptx', 'odp', 'key',
  'xls', 'xlsx', 'ods', 'csv', 'tsv',
])
// Source and the files that configure it. Writing one is code.
const CODE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte', 'astro',
  'py', 'ipynb', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'swift', 'dart', 'lua', 'r',
  'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'm', 'mm',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'sql', 'graphql', 'proto',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'xml', 'gradle',
])

// The built-in tools that read or write one file by path
const READ_TOOLS = new Set(['read'])
const WRITE_TOOLS = new Set(['write', 'edit', 'multiedit', 'notebookedit'])
// The weak signals, looked at only when nothing stronger was found, in this
// order (see classifyTask): writing a file nothing else recognised, or running
// a command, is code; looking at an image is images; reading or searching
// files, or using the browser, is research.
const SHELL_TOOLS = new Set(['bash', 'powershell'])
const EXPLORE_TOOLS = new Set(['read', 'grep', 'glob', 'notebookread'])
// A command that works on pictures or video is images, whatever tool ran it
const MEDIA_COMMAND = /\b(ffmpeg|ffprobe|magick|imagemagick|handbrakecli|yt-dlp|youtube-dl)\b/i
// A tool of a browser server: navigating and reading pages is looking things up
const isBrowserWord = (w: string) => w === 'chrome' || w === 'browser'

// What a document tool does, from its name: `read_doc`, `query-docs` and
// `search_apify_docs` look something up; `update_doc` and `create` write one.
// A name with a writing verb is a document whatever else it says.
const LOOKUP_VERBS = new Set([
  'get', 'read', 'list', 'search', 'query', 'find', 'fetch', 'resolve', 'lookup', 'show', 'view', 'describe', 'download', 'inspect',
])
const WRITE_VERBS = new Set([
  'create', 'update', 'write', 'edit', 'append', 'insert', 'delete', 'remove', 'set', 'batch', 'replace', 'upload', 'add', 'copy',
  'duplicate', 'move', 'share', 'clear', 'trash', 'import', 'export', 'convert', 'send', 'publish', 'save', 'apply', 'patch',
  'rename', 'format', 'merge', 'restore', 'generate',
])

const IMAGE_WORDS = new Set([
  'image', 'images', 'img', 'video', 'videos', 'photo', 'photos', 'picture', 'pictures',
  'imagen', 'dalle', 'midjourney', 'ffmpeg',
])
const DOCUMENT_WORDS = new Set([
  'doc', 'docs', 'document', 'documents', 'docx', 'slide', 'slides', 'deck', 'pptx',
  'sheet', 'sheets', 'spreadsheet', 'spreadsheets', 'xlsx', 'presentation', 'presentations', 'pdf',
])
const SCRAPE_WORDS = new Set(['transcript', 'transcripts', 'scrape', 'crawl', 'websearch', 'webfetch'])

/** A tool name as lower-case words: `mcp__claude_ai_Gmail__send_message` is mcp, claude, ai, gmail, send, message. */
function words(tool: string): string[] {
  return tool.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function extOf(path: string | undefined): string {
  if (!path) return ''
  const name = path.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

const isMailWord = (w: string) => w.startsWith('mail') || w.endsWith('mail') || w === 'outlook' || w === 'imap' || w === 'smtp'

/** The kind one tool call points to, or null when it says nothing. */
export function kindOfUse(use: ToolUse): Kind | null {
  const name = use.tool.toLowerCase()
  const w = words(use.tool)
  const ext = extOf(use.path)

  if (w.some(isMailWord)) return 'emails'

  if (w.some(x => IMAGE_WORDS.has(x))) return 'images'
  // writing a picture or video is images; only looking at one is a weak signal (classifyTask)
  if (WRITE_TOOLS.has(name) && IMAGE_EXT.has(ext)) return 'images'
  if (SHELL_TOOLS.has(name) && MEDIA_COMMAND.test(use.command ?? '')) return 'images'

  if (WRITE_TOOLS.has(name) && CODE_EXT.has(ext)) return 'code'

  if (w.some(x => DOCUMENT_WORDS.has(x))) {
    const isWriting = w.some(x => WRITE_VERBS.has(x))
    const isLookup = w.some(x => LOOKUP_VERBS.has(x))
    return isLookup && !isWriting ? 'research' : 'documents'
  }
  if (WRITE_TOOLS.has(name) && DOCUMENT_EXT.has(ext)) return 'documents'

  if (w.some(x => SCRAPE_WORDS.has(x))) return 'research'
  if (w.includes('web') && (w.includes('search') || w.includes('fetch'))) return 'research'
  // reading a page in the browser: read_page, get_page_text
  if (w.includes('page') && (w.includes('text') || w.includes('read') || w.includes('get'))) return 'research'

  return null
}

/**
 * One kind for the whole task. When a task touched several, PRIORITY decides:
 * a task that searched the web and then wrote an email is an email, and one
 * that also wrote a source file is code.
 *
 * Only when no kind was found are the weak signals looked at, in this order:
 *   1. a file was written that nothing recognised (a Makefile, a .env), or a
 *      command was run: code
 *   2. an image was looked at: images
 *   3. files were read or searched, or the browser was used: research
 * Anything else, a task that used no tools included, is other.
 */
export function classifyTask(uses: readonly ToolUse[]): Kind {
  const seen = new Set<Kind>()
  for (const use of uses) {
    const kind = kindOfUse(use)
    if (kind) seen.add(kind)
  }
  const found = PRIORITY.find(k => seen.has(k))
  if (found) return found

  const names = uses.map(u => u.tool.toLowerCase())
  if (names.some(n => WRITE_TOOLS.has(n) || SHELL_TOOLS.has(n))) return 'code'
  if (uses.some(u => READ_TOOLS.has(u.tool.toLowerCase()) && IMAGE_EXT.has(extOf(u.path)))) return 'images'
  if (names.some(n => EXPLORE_TOOLS.has(n)) || uses.some(u => words(u.tool).some(isBrowserWord))) return 'research'
  return 'other'
}
