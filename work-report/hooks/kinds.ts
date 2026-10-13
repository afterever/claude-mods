// Sorting a finished task into one kind, by the tools it used. Pure: the
// register module collects the tool uses, this decides.
import type { Kind } from '../types'

export const KINDS: readonly Kind[] = ['emails', 'images', 'documents', 'research', 'other']

export const KIND_LABEL: Record<Kind, string> = {
  emails: 'Emails',
  images: 'Images and video',
  documents: 'Documents',
  research: 'Research',
  other: 'Other',
}

/** The same kinds in a narrow pane. */
export const KIND_SHORT: Record<Kind, string> = {
  emails: 'Emails',
  images: 'Images',
  documents: 'Docs',
  research: 'Research',
  other: 'Other',
}

/** One tool call of the turn: its name and, for a file tool, the path it worked on. */
export type ToolUse = { tool: string; path?: string }

const IMAGE_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff', 'ico', 'psd',
  'mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'wmv', 'gifv',
])
const DOCUMENT_EXT = new Set([
  'md', 'txt', 'rtf', 'doc', 'docx', 'odt', 'pdf', 'tex',
  'ppt', 'pptx', 'odp', 'key',
  'xls', 'xlsx', 'ods', 'csv', 'tsv',
])

// The built-in tools that read or write one file by path
const READ_TOOLS = new Set(['read'])
const WRITE_TOOLS = new Set(['write', 'edit', 'multiedit', 'notebookedit'])

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
  if ((READ_TOOLS.has(name) || WRITE_TOOLS.has(name)) && IMAGE_EXT.has(ext)) return 'images'

  if (w.some(x => DOCUMENT_WORDS.has(x))) return 'documents'
  if (WRITE_TOOLS.has(name) && DOCUMENT_EXT.has(ext)) return 'documents'

  if (w.some(x => SCRAPE_WORDS.has(x))) return 'research'
  if (w.includes('web') && (w.includes('search') || w.includes('fetch'))) return 'research'
  // reading a page in the browser: read_page, get_page_text
  if (w.includes('page') && (w.includes('text') || w.includes('read') || w.includes('get'))) return 'research'

  return null
}

/**
 * One kind for the whole task. When a task touched several, the order of KINDS
 * decides: a task that searched the web and then wrote an email is an email.
 */
export function classifyTask(uses: readonly ToolUse[]): Kind {
  const seen = new Set<Kind>()
  for (const use of uses) {
    const kind = kindOfUse(use)
    if (kind) seen.add(kind)
  }
  return KINDS.find(k => seen.has(k)) ?? 'other'
}
