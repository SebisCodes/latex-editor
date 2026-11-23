# Using the LaTeX Editor

The LaTeX Editor shows your LaTeX code and the typeset pages side by side. Whatever you type
appears on the pages right away: headings, lists, tables, math, footnotes and references. A
click on any text in the preview takes you to its place in the code, and you can edit the
text right on the page. It typesets LaTeX itself in the browser (with KaTeX for math and the
Latin Modern fonts), so no TeX installation is needed.

Open it at https://latex.giit.ch/. It is free, needs no sign-up, and runs in your browser:
your documents stay there unless you send them somewhere yourself.

## What it can do

- Code with highlighting: commands, environments, math and comments in their own colors,
  line numbers, automatic `\end{…}`, and a list of problems (missing braces, unknown
  commands, undefined references) with their line.
- Pages as they will print: A4, Letter or your own paper size, the margins of the standard
  classes (article, report, book) or of `geometry`, page numbers, footnotes at the bottom of
  the page.
- Math: inline and displayed, numbered `equation`, `align` and `gather`, matrices and the
  symbols of amsmath.
- Tables, figures and references: `tabular` and `tabularx` with rules and merged cells,
  figures with captions, `\label` / `\ref` / `\pageref`, table of contents, bibliography
  (`thebibliography`, `\cite`), theorems, `\newcommand` and `\newenvironment`.
- Packages such as xcolor, graphicx, hyperref, multicol, listings, verbatim, minted,
  algorithm2e and algorithmic, babel.
- Document settings on the right that edit the preamble: class, font size, paper (also
  square and story formats), margins, font, line spacing, language, title.
- Templates: article, letter, exercise sheet, social media post.

## Getting started

1. **Start**: choose a template under **New**, open a `.tex` file or paste LaTeX code.
2. **Write**: type in the code; the pages on the right follow. **Insert** has ready-made
   pieces for lists, tables, math and symbols.
3. **Export**: save a PDF, pictures of the pages or the `.tex` file.

## Side panel

The side panel holds the document settings, Insert, Pictures and the Outline. The button at the top right of the work area opens it over the
preview and closes it again (Escape too); it is closed when the editor opens. On a phone it is the
view **Edit**.

## Templates with placeholders

A website that edits templates opens the editor with `?template=mustache` or `?template=angle`.
The preview then shows the document filled with the website's examples; **Template** in the preview's
bar shows the placeholders as written, **Examples** brings the examples back. A placeholder without
an example shows its label in brackets. The **Placeholders** box below the code lists them: a click
puts one at the cursor, a section around the selected text. Text that comes from an example cannot
be edited in the preview. Saving, downloading and exporting the code keep the placeholders; print
follows the view shown.

## Editing on the page

Click text in the preview to edit it right there: the cursor is where you clicked, and the
code's cursor goes to the same place. **Enter** starts a new paragraph (in a list a new
`\item`), **Shift+Enter** inserts a line break (`\\`). **Ctrl+Enter** (Cmd+Enter on macOS)
or a click elsewhere applies the edit; **Escape** cancels. A click on math, a picture or
text made by a command jumps to its place in the code instead. The place of the code cursor
gets a frame in the preview.

The right side panel has four tabs: **Document** sets paper, font, margins and title by
editing the preamble; **Insert** adds snippets at the cursor together with the packages they
need; **Pictures** holds the pictures of the document; **Outline** lists the sections. Every
change is one step for Undo.

**Tidy** puts `\begin`, `\end`, `\item`, the sectioning commands, `\documentclass` and
`\usepackage` on lines of their own and indents the content of every environment. Comments
and verbatim text stay as they are.

## Limits of the preview

The preview is the editor's own typesetting and understands the commands most documents use.
It does not display TikZ drawings or fontspec fonts, and line and page breaks can differ
from a TeX engine. Your source stays unchanged: for a thesis or another submission, compile
the `.tex` file with an engine supported by its packages (fontspec needs XeLaTeX or
LuaLaTeX). Unknown commands and packages are reported once each, and the arguments of an
unknown command are still shown.

## Your documents

Your documents are kept only in your browser (in `localStorage`, their pictures in
IndexedDB), not on a server, and stay there after you close the page. **My documents** (the
folder button at the top left) lists every document of this browser: open, rename,
duplicate, download (`.tex`, or a ZIP with its pictures) and delete them.

Clearing the browser's site data removes them, so download the ones you want to keep, or let
the editor send them to your own server: **Save to server** (the cloud button) sets up a
webhook, an address that gets every saved version (see [EMBEDDING.md](EMBEDDING.md#webhook)
for what it receives). Nothing is sent until you enter an address there.

**Opening files:** `.tex` files become new documents; a ZIP with a `.tex` file and its
pictures opens as one document. Pictures dropped or pasted go into the open document.

## Pictures

Pictures are stored with their document and used by `\includegraphics{name}`. Drag or paste
a picture into the editor, or add it in the **Pictures** tab. The tab shows every picture
with its size and where the code uses it ("used 2×" jumps there), and lists the pictures the
code asks for but that are missing ("Add file…" stores one under that name). From there you
can insert a picture, insert it as a figure, rename it (the `\includegraphics` references
follow), replace, download or remove it. You can also drag a picture on the pages to move it
in the code.

## Export

**Export** offers:

- **PDF** through the print dialog: choose "Save as PDF" as the printer. The PDF shows the
  pages exactly as in the preview, with selectable text.
- Every page as a **PNG**, **JPG** or **WebP** picture.
- One **HTML** file with the fonts inside.
- **Plain text**.
- The **`.tex`** source with its pictures as a ZIP, or everything as one ZIP.

**Download .tex** in the bar saves the code.

**Export > Open in another editor** converts the document in the browser to Markdown, Typst
or HTML and opens the result as a new document in that editor. Anything the other format
cannot hold is listed first. Pictures do not travel.

## AI Assistant

Any AI can work with you: ChatGPT, Claude, Gemini, Copilot or the AI in your coding tool.
Nothing to install and no key needed. Click **AI Assistant**, then **Copy prompt**, paste it
into your AI and say what it should do. The prompt holds the instructions and the current
document.

The prompt also contains the pictures of the document and the problems the preview found.

The AI answers with a link that carries the document after the `#`; click it and the
document appears in your editor. **Undo** takes every change back. The links look like this:

- `https://latex.giit.ch/#b64=<base64url of the UTF-8 text>`
- `https://latex.giit.ch/#tex=<URL-encoded text>`
- `https://latex.giit.ch/#z=<base64url of the zlib-compressed text>` (shortest)
- `&mode=add` adds text before `\end{document}` of the open document.
- `&file=new&name=<name>` makes a new document next to your others, `&file=<name>` changes
  that one; without `&file=` the open document changes.
- `&part=N&of=M&id=<name>` sends a long document in several links; the editor collects the
  parts.

A tab opened with such a link hands the document to the editor tab you used last. You can
also paste the AI's whole answer into the editor (Ctrl+V outside the code); links that a
terminal broke over several lines are joined. When the editor is embedded in another
website, links cannot reach it, so paste the answer there. A website that embeds the
editor may give its own instructions for how the AI answers, or show its own AI dialog
when you press the button; the dialog names the website and shows its instructions.

**Browser agents (WebMCP):** in browsers that offer WebMCP, the page registers tools for AI
agents that run in the page itself: `get_document`, `get_problems`, `list_sections`,
`set_document`, `insert_text`, `replace_text`, `show_line`, `undo`, and `list_files`,
`open_file`, `new_file` for your other documents. Every change is one step for Undo.

## Languages

The editor speaks English at `/`, German `/de/`, French `/fr/`, Italian `/it/`, Spanish
`/es/`, Portuguese `/pt/`, Dutch `/nl/`, Polish `/pl/`, Turkish `/tr/`, Russian `/ru/`,
Ukrainian `/uk/`, Chinese `/zh/`, Japanese `/ja/` and Korean `/ko/`. Opening
`https://latex.giit.ch/` leads to the language you picked before in a language menu, or else
to your browser's language. A language picked in the menu holds for every giit.ch site. The
prompt for the AI is always in English.

## Color theme

Light, dark or automatic (following your system): the theme switch in the bar sets it, and
the editor remembers your choice.

## Keyboard shortcuts

On macOS use Cmd instead of Ctrl. The **Help** dialog in the editor lists them as well.

| Keys | Action |
|---|---|
| Ctrl + B / I / U | Bold / italic / underline the selected text |
| Ctrl + M | Math: `$…$` around the selection |
| Ctrl + / | Comment lines in or out (`%`) |
| Ctrl + Enter | Show the cursor's place in the preview |
| Tab / Shift + Tab | Indent / outdent |
| Ctrl + Z / Y | Undo / redo |
| Ctrl + S | Save (download `.tex`, or to your server) |
| Ctrl + E | Export |
| Ctrl + O | My documents |
| Ctrl + P | Print / save as PDF |
| Ctrl + mouse wheel, Ctrl + + / - | Zoom the preview |
| Page Up / Page Down | Previous / next page (in the preview) |
| ? | Help |

Typing `\begin{name}` and pressing Enter adds the matching `\end{name}`. Brackets `{ [ (`
and `$` close by themselves around a selection.

## On your own website

The editor can be embedded in other websites with an iframe, opened in a window of its own
or used as a read-only viewer. See [EMBEDDING.md](EMBEDDING.md).
