import { test, expect } from 'claude-code/testing'

import { classifyTask, kindOfUse } from './kinds'

const use = (tool: string, path?: string) => ({ tool, ...(path ? { path } : {}) })

test('a mail tool makes the task an email, whatever else it did', () => {
  expect(classifyTask([use('mcp__claude_ai_Gmail__search_threads')])).toBe('emails')
  expect(classifyTask([use('mcp__claude_ai_Gmail__create_draft')])).toBe('emails')
  expect(classifyTask([use('mcp__outlook__send')])).toBe('emails')
  // searched the web, then wrote the email: the email is the task
  expect(classifyTask([use('WebSearch'), use('mcp__claude_ai_Gmail__send_message')])).toBe('emails')
})

test('image and video tools, and image and video files, make it images and video', () => {
  expect(classifyTask([use('mcp__x__generate_image')])).toBe('images')
  expect(classifyTask([use('mcp__x__edit_video')])).toBe('images')
  expect(classifyTask([use('mcp__claude-in-chrome__upload_image')])).toBe('images')
  expect(classifyTask([use('Write', 'C:/art/logo.svg')])).toBe('images')
  expect(classifyTask([use('Read', 'shots/before.PNG')])).toBe('images')
  expect(classifyTask([use('Edit', 'clips/intro.mp4')])).toBe('images')
})

test('document, slide and spreadsheet tools, and writing a document file, make it a document', () => {
  expect(classifyTask([use('mcp__claude_ai_Google_Docs__update_doc')])).toBe('documents')
  expect(classifyTask([use('mcp__claude_ai_Google_Slides__update_presentation')])).toBe('documents')
  expect(classifyTask([use('mcp__claude_ai_Google_Sheets__update_values')])).toBe('documents')
  expect(classifyTask([use('mcp__claude_ai_Claude_Docs__create')])).toBe('documents')
  expect(classifyTask([use('Write', 'notes/plan.md')])).toBe('documents')
  expect(classifyTask([use('Write', 'report.docx')])).toBe('documents')
  // reading a document is not writing one
  expect(classifyTask([use('Read', 'notes/plan.md')])).toBe('other')
})

test('web search, page reading and transcripts make it research', () => {
  expect(classifyTask([use('WebSearch')])).toBe('research')
  expect(classifyTask([use('WebFetch')])).toBe('research')
  expect(classifyTask([use('mcp__claude-in-chrome__get_page_text')])).toBe('research')
  expect(classifyTask([use('mcp__claude-in-chrome__read_page')])).toBe('research')
  expect(classifyTask([use('mcp__x__get_transcript')])).toBe('research')
})

test('everything else, and a task with no tools, is other', () => {
  expect(classifyTask([])).toBe('other')
  expect(classifyTask([use('Bash'), use('Grep'), use('Edit', 'src/app.ts')])).toBe('other')
  expect(kindOfUse(use('mcp__claude_ai_Todoist__add-tasks'))).toBeNull()
})

test('a tool whose name only contains a kind inside another word is not that kind', () => {
  // "docker" is not a doc tool, "pagerduty" is not a page reader
  expect(kindOfUse(use('mcp__x__docker_run'))).toBeNull()
  expect(kindOfUse(use('mcp__x__pagerduty_list'))).toBeNull()
})

test('when a task touched several kinds the order emails, images, documents, research decides', () => {
  expect(classifyTask([use('WebSearch'), use('Write', 'brief.md')])).toBe('documents')
  expect(classifyTask([use('Write', 'brief.md'), use('mcp__x__generate_image')])).toBe('images')
  expect(classifyTask([use('Bash'), use('WebFetch')])).toBe('research')
})
