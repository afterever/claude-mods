# cupertino skin and Apple-tuned prompt theme

A macOS/iOS dark-mode colour scheme for Claude Code (the `skins` mod) and a matching Oh My Posh
theme. Neither is a patch of third-party code; this doc records what they are, where the numbers
came from, and how to rebuild them.

- **Skin:** `cupertino`, a *made* skin (base `noir`), stored in the skins plugin's own store, **not
  in git**. If it is lost, rebuild it from the table below.
- **Prompt theme:** `powerlevel10k_rainbow_apple.omp.json` (repo root), a colour-only copy of
  `powerlevel10k_rainbow.omp.json`. **Not wired into the PowerShell profile.**
- **Depends on:** skins Patch 1 (empty `spinner`/`done` lists), see `skins-patches.md`.

## Palette

Source: Apple Human Interface Guidelines, *Color*, system colours, **dark, default contrast**
(iOS table), read on 2026-10-10 from
`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/color.json`.
The HIG page is JS-rendered; the swatch values exist only as image alt text
(e.g. `R-255, G-66, B-69`), so a plain page fetch returns just the title.

| slot | hex | Apple source | used for |
|---|---|---|---|
| user | `#0091FF` | Blue | accent: rail, prompt marker, spinner |
| read | `#3CD3FE` | Cyan | Read |
| write | `#FF9230` | Orange | Edit / Write |
| run | `#FFD600` | Yellow | Bash / PowerShell |
| search | `#DB34F2` | Purple | Glob / Grep |
| web | `#6D7CFF` | Indigo | WebFetch / WebSearch |
| mcp | `#B78A66` | Brown | MCP tools |
| ok | `#30D158` | Green | finished call |
| err | `#FF4245` | Red | failed call |
| **warn** | `#FF6A00` | *none* | interrupted call |
| fg | `#FFFFFF` | label (white) | body text |
| muted | `#8E8E93` | systemGray | secondary text |
| surface | `#2C2C2E` | systemGray5 | table header band |
| zebra | `#1C1C1E` | systemGray6 | alternate table rows |
| other | `#AEAEB2` | systemGray, increased contrast | anything else |

Words: `spinner: []` and `done: []`, so Claude Code's own 185 spinner / 8 done words show.

### Decisions worth remembering

- **`warn` is the only non-Apple value.** Apple's system colours have no orange-red, and `run`
  (yellow), `write` (orange) and `err` (red) already sit around it. `#FF6A00` maximises the minimum
  CIE76 distance: 21 from `write`, 34 from `err`. The Apple-sourced alternative that is clearly
  distinct is the increased-contrast pink `#FF8AC4`, rejected as odd for "interrupted".
- **`run` stays yellow** (Terminal/Xcode convention) and `warn` moved, chosen over giving `run` a
  mint or teal, which land 14-29 from `read`.
- **The earlier palette was iOS 13-17** (`#0A84FF`, `#FF9F0A`, `#FFD60A`, `#BF5AF2`, `#7D7AFF`,
  `#AC8E68`, `#FF453A`, ...). It averaged 5.6 CIE76 from the current HIG values; the largest gaps
  were Purple 19.4, Orange 13.9, Blue 10.6.
- **Unverified:** the HIG page lists no numbers for `label` / `secondaryLabel` / `tertiaryLabel`,
  and no numeric macOS table. `fg` and `muted` are judged against the gray scale only. Apple
  says these values change between releases.
- **`zebra` `#1C1C1E`** is a step off a pure black background. On a `#1E1E1E`-style terminal
  background it is nearly invisible; `tables` is `off` today so it is not seen.

### Rebuild

```
mcp__skins__design  action=save  name=cupertino  base=noir  spinner=[]  done=[]
  palette={"user":"#0091FF","fg":"#FFFFFF","muted":"#8E8E93","surface":"#2C2C2E","zebra":"#1C1C1E",
           "ok":"#30D158","err":"#FF4245","warn":"#FF6A00","read":"#3CD3FE","write":"#FF9230",
           "run":"#FFD600","search":"#DB34F2","web":"#6D7CFF","mcp":"#B78A66","other":"#AEAEB2"}
```

`save` also applies the skin and overwrites a skin of the same name. `/skin list` then shows
`cupertino` as `●`.

### Applying changes

A palette save takes effect **immediately in the running session**; no restart. Only the
`custom.ts` code patch (Patch 1) needs a Claude Code restart, and a plugin update that replaces
`skins\0.5.1` removes it. Check with `mcp__skins__design {"action":"show"}`: `cupertino` must
report `"spinner":[]` and `"done":[]`.

## powerlevel10k_rainbow_apple.omp.json

Same structure as `powerlevel10k_rainbow.omp.json`; only colour values differ (34 changed, 111
unchanged, verified by comparing the parsed JSON, all 19 icon glyphs intact). One addition: a
`foreground_templates` entry on the `status` segment.

| segment | original | Apple-tuned |
|---|---|---|
| os, time bar | `#d3d7cf` | `#AEAEB2` (systemGray, increased contrast) |
| path | `#3465a4` | `#0091FF` Blue |
| git clean / behind | `#4e9a06` | `#30D158` Green |
| git dirty | `#c4a000` | `#FFD600` Yellow |
| git ahead+behind | `#f26d50` | `#FF9230` Orange |
| git ahead | `#89d1dc` | `#3CD3FE` Cyan |
| node | `#689f63` | `#30D158` Green |
| go | `#00acd7` | `#00D2E0` Teal |
| julia | `#4063D8` | `#6D7CFF` Indigo |
| python | `#FFDE57` | `#FFD600` Yellow |
| ruby | `#AE1401` | `#FF4245` Red |
| azfunc | `#FEAC19` | `#FF9230` Orange |
| aws default / jan | `#FFA400` / `#f1184c` | `#FFA056` (Orange, increased contrast) / `#FF375F` Pink |
| root | `#ffff66` | `#FEDF43` (Yellow, increased contrast) |
| sysinfo | `#0A84FF` | `#0091FF` Blue |
| exec time | `#c4a000` | `#FFD600` Yellow |
| status error | `#cc2222` | `#FF4245` Red |
| box-drawing glyphs | `#d3d7cf` | `#AEAEB2` |

- **Text is black on every bar.** White on Apple's colours measures 1.3-3.6:1 (WCAG); black is at
  least 5.8:1 everywhere. Apple pairs white with blue and red chips, but at prompt size the
  contrast decided it. To go white on blue/red/indigo/purple, change those segments'
  `foreground` (3.2-3.6:1).
- **`status`:** black background with white text normally; on a non-zero exit code
  `foreground_templates` switches the text to black over the Red background.
- **Not activated:** to try it, point the Oh My Posh init line in the PowerShell profile at this
  file. The original theme stays the default until then.

## Colour comparison (CIE76, for reference)

The original `powerlevel10k_rainbow.omp.json` against the pre-update `cupertino`: mean 16.4,
median 15.1, max 36.4. Furthest: node `#689f63` 36, path `#3465a4` 35, git clean `#4e9a06` 28.
CIE76 overstates differences in saturated colours relative to CIEDE2000.
