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
  // reading a document is not writing one: it is looking something up
  expect(classifyTask([use('Read', 'notes/plan.md')])).toBe('research')
})

test('web search, page reading and transcripts make it research', () => {
  expect(classifyTask([use('WebSearch')])).toBe('research')
  expect(classifyTask([use('WebFetch')])).toBe('research')
  expect(classifyTask([use('mcp__claude-in-chrome__get_page_text')])).toBe('research')
  expect(classifyTask([use('mcp__claude-in-chrome__read_page')])).toBe('research')
  expect(classifyTask([use('mcp__x__get_transcript')])).toBe('research')
})

test('writing a source file, or only running commands, makes it code', () => {
  expect(classifyTask([use('Edit', 'src/app.ts')])).toBe('code')
  expect(classifyTask([use('Write', 'C:/proj/server.py')])).toBe('code')
  expect(classifyTask([use('MultiEdit', 'lib/main.go')])).toBe('code')
  expect(classifyTask([use('NotebookEdit', 'analysis.ipynb')])).toBe('code')
  // the files that configure code are code too
  expect(classifyTask([use('Edit', 'package.json')])).toBe('code')
  expect(classifyTask([use('Edit', '.github/workflows/ci.yml')])).toBe('code')
  // a task that did only commands: builds, tests, git
  expect(classifyTask([use('Bash')])).toBe('code')
  expect(classifyTask([use('PowerShell'), use('Grep')])).toBe('code')
  // reading code to explain it is not writing it
  expect(classifyTask([use('Read', 'src/app.ts'), use('Grep'), use('Glob')])).not.toBe('code')
})

test('writing a file nothing recognised is code, never research', () => {
  // no extension, or a dotfile: nothing says what it is, but a file was written
  for (const path of ['Makefile', 'Dockerfile', '.env', '.gitignore', 'LICENSE', 'build/output.log']) {
    expect(kindOfUse(use('Edit', path))).toBeNull()
    expect(classifyTask([use('Edit', path)])).toBe('code')
    // reading around first does not turn it into a lookup
    expect(classifyTask([use('Grep'), use('Read', 'src/app.ts'), use('Write', path)])).toBe('code')
  }
  // a document is still a document
  expect(classifyTask([use('Grep'), use('Write', 'notes.md')])).toBe('documents')
})

test('only reading or searching your own files is research, and anything more makes it that instead', () => {
  expect(classifyTask([use('Read', 'src/cache.ts')])).toBe('research')
  expect(classifyTask([use('Grep'), use('Glob'), use('Read', 'src/cache.ts')])).toBe('research')
  expect(kindOfUse(use('Grep'))).toBeNull()
  // ran a command: code
  expect(classifyTask([use('Read', 'package.json'), use('Bash')])).toBe('code')
  // wrote something: that kind
  expect(classifyTask([use('Grep'), use('Edit', 'src/cache.ts')])).toBe('code')
  expect(classifyTask([use('Read', 'a.md'), use('Write', 'b.md')])).toBe('documents')
  // a web lookup is research whatever else was read
  expect(classifyTask([use('Read', 'src/cache.ts'), use('WebFetch')])).toBe('research')
})

test('running a command is a weak signal: any other kind the task touched wins', () => {
  expect(kindOfUse(use('Bash'))).toBeNull()
  expect(classifyTask([use('Bash'), use('WebFetch')])).toBe('research')
  expect(classifyTask([use('PowerShell'), use('Write', 'notes/plan.md')])).toBe('documents')
  expect(classifyTask([use('Bash'), use('mcp__claude_ai_Gmail__send_message')])).toBe('emails')
  // but a source edit is a strong one
  expect(classifyTask([use('Bash'), use('Edit', 'src/app.ts')])).toBe('code')
})

test('everything else, and a task with no tools, is other', () => {
  expect(classifyTask([])).toBe('other')
  expect(classifyTask([use('mcp__claude_ai_Todoist__add-tasks')])).toBe('other')
  expect(kindOfUse(use('mcp__claude_ai_Todoist__add-tasks'))).toBeNull()
})

test('a tool whose name only contains a kind inside another word is not that kind', () => {
  // "docker" is not a doc tool, "pagerduty" is not a page reader
  expect(kindOfUse(use('mcp__x__docker_run'))).toBeNull()
  expect(kindOfUse(use('mcp__x__pagerduty_list'))).toBeNull()
})

test('when a task touched several kinds the order code, emails, images, documents, research decides', () => {
  expect(classifyTask([use('WebSearch'), use('Write', 'brief.md')])).toBe('documents')
  expect(classifyTask([use('Write', 'brief.md'), use('mcp__x__generate_image')])).toBe('images')
  expect(classifyTask([use('Bash'), use('WebFetch')])).toBe('research')
  expect(classifyTask([use('mcp__claude_ai_Gmail__send_message'), use('mcp__x__generate_image')])).toBe('emails')
  // a change to the source and to its README is code
  expect(classifyTask([use('Edit', 'README.md'), use('Edit', 'src/app.ts')])).toBe('code')
  // code and a web search: the code is the task
  expect(classifyTask([use('WebSearch'), use('Edit', 'src/app.ts')])).toBe('code')
})

test('a source file that was written outweighs an email sent or an image made along the way', () => {
  // an email sent mid-task does not turn a coding task into an email
  expect(classifyTask([use('Edit', 'src/app.ts'), use('mcp__claude_ai_Gmail__send_message')])).toBe('code')
  // nor does an image written into the project
  expect(classifyTask([use('Edit', 'src/app.ts'), use('Write', 'public/logo.png')])).toBe('code')
  // but without a source file they are what they were
  expect(classifyTask([use('mcp__claude_ai_Gmail__send_message'), use('Write', 'public/logo.png')])).toBe('emails')
  expect(classifyTask([use('Write', 'public/logo.png')])).toBe('images')
})

test('looking at a screenshot is a weak signal: images only when nothing else was done', () => {
  // the picture alone
  expect(classifyTask([use('Read', 'shots/before.PNG')])).toBe('images')
  expect(classifyTask([use('Read', 'shots/before.png'), use('Grep')])).toBe('images')
  // read a screenshot to debug the UI, then changed the code, or ran the tests
  expect(classifyTask([use('Read', 'shots/bug.png'), use('Edit', 'src/button.tsx')])).toBe('code')
  expect(classifyTask([use('Read', 'shots/bug.png'), use('Bash')])).toBe('code')
  // writing one is still strong
  expect(kindOfUse(use('Read', 'shots/before.png'))).toBeNull()
  expect(kindOfUse(use('Write', 'shots/after.png'))).toBe('images')
})

test('a document tool that only looks something up is research; one that writes is a document', () => {
  // looking things up
  expect(classifyTask([use('mcp__plugin_context7__query-docs')])).toBe('research')
  expect(classifyTask([use('mcp__Apify__search-apify-docs')])).toBe('research')
  expect(classifyTask([use('mcp__Apify__fetch-apify-docs')])).toBe('research')
  expect(classifyTask([use('mcp__33a75045__read_doc')])).toBe('research')
  expect(classifyTask([use('mcp__claude_ai_Google_Sheets__get_values')])).toBe('research')
  expect(classifyTask([use('mcp__claude_ai_Google_Slides__read_presentation')])).toBe('research')
  // writing them
  expect(classifyTask([use('mcp__claude_ai_Google_Docs__update_doc')])).toBe('documents')
  expect(classifyTask([use('mcp__claude_ai_Claude_Docs__batch')])).toBe('documents')
  expect(classifyTask([use('mcp__claude_ai_Google_Sheets__append_values')])).toBe('documents')
  // read then write: the writing is the task
  expect(classifyTask([use('mcp__x__read_doc'), use('mcp__x__update_doc')])).toBe('documents')
  // a name that says nothing about what it does stays a document
  expect(classifyTask([use('mcp__x__docs')])).toBe('documents')
})

test('using the browser is research, and anything more makes it that instead', () => {
  expect(classifyTask([use('mcp__claude-in-chrome__navigate')])).toBe('research')
  expect(classifyTask([use('mcp__Claude_Browser__navigate'), use('mcp__Claude_Browser__computer')])).toBe('research')
  // a browser task that also ran a command, or wrote code
  expect(classifyTask([use('mcp__claude-in-chrome__navigate'), use('Bash')])).toBe('code')
  expect(classifyTask([use('mcp__Claude_Browser__navigate'), use('Edit', 'src/app.ts')])).toBe('code')
  // a desktop-control tool is not the browser
  expect(classifyTask([use('mcp__computer-use__screenshot')])).toBe('other')
})

test('a command that works on pictures or video is images, whatever ran it', () => {
  const run = (tool: string, command: string) => ({ tool, command })
  expect(classifyTask([run('Bash', 'ffmpeg -i in.mov -vf scale=1280:-1 out.mp4')])).toBe('images')
  expect(classifyTask([run('PowerShell', 'magick convert a.png -resize 50% b.png')])).toBe('images')
  expect(classifyTask([run('Bash', 'yt-dlp https://example.com/v')])).toBe('images')
  // an ordinary command is still only code
  expect(classifyTask([run('Bash', 'git status')])).toBe('code')
  expect(classifyTask([run('Bash', 'npm run build')])).toBe('code')
  // the name alone has to be a whole word: this is not ffmpeg
  expect(classifyTask([run('Bash', 'echo ffmpegger')])).toBe('code')
  // and a source file written alongside still makes it code
  expect(classifyTask([run('Bash', 'ffmpeg -i a.mov b.mp4'), use('Edit', 'render.py')])).toBe('code')
})
