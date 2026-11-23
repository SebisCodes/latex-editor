/**
 * Commands of the LaTeX reader for the text: structure (\par, \newpage, \maketitle …), alignment,
 * colors (xcolor), links, footnotes, labels and references, citations, pictures and captions.
 * Each entry is called with the renderer as this; the keys are the LaTeX names.
 *
 * The file is longer than the usual guide: it holds a table of commands keyed by their LaTeX
 * names, each entry with its doc comment; splitting it further would scatter one topic.
 */

import { escapeHtml, getModelColor } from './latex-units.js?v=3';
import { getFootnoteSymbol } from './latex-scan.js?v=3';

/** @type {Object<string, CommandHandler>} */
export const TEXT_COMMANDS = {
    /**
     * \begin: renders the environment that starts here.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    begin(flow, scan, pos) { this.renderBegin(flow, scan, pos); },
    /**
     * \end: an \end without its \begin is an error; \end{document} ends the reading.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    end(flow, scan, pos) {
        const r = this.readArgument(scan, 'end');
        const n = this.getRawText(scan, r);
        if (n !== 'document') this.doc.addProblem(pos, `\\end{${n}} without a matching \\begin{${n}}`, 'error');
        else scan.i = scan.end;
    },
    /**
     * \par: ends the paragraph.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    par(flow) { flow.closeParagraph(); },
    /**
     * \indent: ends the paragraph.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    indent(flow) { flow.closeParagraph(); },
    /**
     * \noindent: the next paragraph starts without indent.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    noindent(flow) { if (flow.para) return; flow.noindent = true; },
    /**
     * \item: an \item outside a list is an error; its label is read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    item(flow, scan, pos) { this.doc.addProblem(pos, '\\item outside a list - put it in \\begin{itemize} … \\end{itemize}', 'error'); this.readOption(scan); },
    /**
     * \newline: a line break.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    newline(flow, scan, pos) { flow.addHtml('<br>', pos); },
    /**
     * \linebreak: a line break; its option is read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    linebreak(flow, scan, pos) { this.readOption(scan); flow.addHtml('<br>', pos); },
    /**
     * \break: a line break.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    break(flow, scan, pos) { flow.addHtml('<br>', pos); },
    /**
     * \nolinebreak: reads its option; the preview breaks lines itself.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    nolinebreak(flow, scan) { this.readOption(scan); },
    /**
     * \newpage: a page break.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    newpage(flow, scan, pos) { flow.addBlock('', pos, 'break', { pageBreak: true }); },
    /**
     * \clearpage: a page break.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    clearpage(flow, scan, pos) { flow.addBlock('', pos, 'break', { pageBreak: true }); },
    /**
     * \cleardoublepage: a page break.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    cleardoublepage(flow, scan, pos) { flow.addBlock('', pos, 'break', { pageBreak: true }); },
    /**
     * \pagebreak: a page break; its option is read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    pagebreak(flow, scan, pos) { this.readOption(scan); flow.addBlock('', pos, 'break', { pageBreak: true }); },
    /**
     * \nopagebreak: reads its option; the page layout decides.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    nopagebreak(flow, scan) { this.readOption(scan); },
    /**
     * \enlargethispage: reads its arguments; the page layout decides.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    enlargethispage(flow, scan) { this.readStar(scan); this.readArgument(scan, 'enlargethispage'); },
    /**
     * \maketitle: the title block from \title, \author and \date.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    maketitle(flow, scan, pos) { this.renderTitle(flow, pos); },
    /**
     * \tableofcontents: the table of contents.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    tableofcontents(flow, scan, pos) { this.renderContents(flow, pos); },
    /**
     * \listoffigures: the list of figures.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    listoffigures(flow, scan, pos) { this.renderContents(flow, pos, 'lof'); },
    /**
     * \listoftables: the list of tables.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    listoftables(flow, scan, pos) { this.renderContents(flow, pos, 'lot'); },
    /**
     * \appendix: starts the appendix: chapters (report, book) or sections count A, B, … from here.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    appendix(flow) { this.doc.appendix = true; const isBook = /report|book/.test(this.doc.meta.cls); this.doc.counters[isBook ? 'chapter' : 'section'] = 0; },
    /**
     * \centering: centers the following paragraphs of the group.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    centering(flow) { flow.align = 'c'; },
    /**
     * \raggedright: aligns the following paragraphs of the group left.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    raggedright(flow) { flow.align = 'l'; },
    /**
     * \raggedleft: aligns the following paragraphs of the group right.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    raggedleft(flow) { flow.align = 'r'; },
    /**
     * \RaggedRight: aligns the following paragraphs of the group left.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    RaggedRight(flow) { flow.align = 'l'; },
    /**
     * \RaggedLeft: aligns the following paragraphs of the group right.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    RaggedLeft(flow) { flow.align = 'r'; },
    /**
     * \Centering: centers the following paragraphs of the group.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    Centering(flow) { flow.align = 'c'; },
    /**
     * \justifying: justifies the following paragraphs of the group.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    justifying(flow) { flow.align = null; },
    /**
     * \selectfont: no effect: \fontsize carries the size.
     * @returns {void}
     */
    selectfont() {},
    /**
     * \fontsize: a font size and line height for the rest of the group.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    fontsize(flow, scan) {
        const a = this.getRawText(scan, this.readArgument(scan, 'fontsize'));
        const b = this.getRawText(scan, this.readArgument(scan, 'fontsize'));
        const size = this.getLength(/^[\d.]+$/.test(a.trim()) ? a + 'pt' : a);
        const lh = this.getLength(/^[\d.]+$/.test(b.trim()) ? b + 'pt' : b);
        flow.addDeclaration(`<span class="dk fs" style="${size ? 'font-size:' + size + ';' : ''}${lh ? 'line-height:' + lh : ''}">`, '</span>');
    },
    /**
     * \color: a text color for the rest of the group.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    color(flow, scan, pos) {
        const mo = this.readOption(scan);
        const r = this.readArgument(scan, 'color');
        const c = mo ? '#' + (getModelColor(this.getRawText(scan, mo), this.getRawText(scan, r)) || '000000') : this.doc.getResolvedColor(this.getRawText(scan, r), pos);
        if (c) flow.addDeclaration(`<span class="dk" style="color:${c}">`, '</span>');
    },
    /**
     * \textcolor: its text in a color.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    textcolor(flow, scan, pos) {
        const mo = this.readOption(scan);
        const r = this.readArgument(scan, 'textcolor');
        const t = this.readArgument(scan, 'textcolor');
        const c = mo ? '#' + (getModelColor(this.getRawText(scan, mo), this.getRawText(scan, r)) || '000000') : this.doc.getResolvedColor(this.getRawText(scan, r), pos);
        flow.addHtml(`<span${c ? ` style="color:${c}"` : ''}>${this.renderInline(scan, t)}</span>`, pos);
    },
    /**
     * \colorbox: its text on a colored background.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    colorbox(flow, scan, pos) {
        const mo = this.readOption(scan);
        const r = this.readArgument(scan, 'colorbox');
        const t = this.readArgument(scan, 'colorbox');
        const c = mo ? '#' + (getModelColor(this.getRawText(scan, mo), this.getRawText(scan, r)) || 'ffffff') : this.doc.getResolvedColor(this.getRawText(scan, r), pos);
        flow.addHtml(`<span class="cbox" style="background:${c || 'transparent'}">${this.renderInline(scan, t)}</span>`, pos);
    },
    /**
     * \fcolorbox: its text in a frame of one color on a background of another.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    fcolorbox(flow, scan, pos) {
        const mo = this.readOption(scan);
        const f = this.readArgument(scan, 'fcolorbox');
        const b = this.readArgument(scan, 'fcolorbox');
        const t = this.readArgument(scan, 'fcolorbox');
        const model = mo ? this.getRawText(scan, mo) : null;
        const cf = model ? '#' + getModelColor(model, this.getRawText(scan, f)) : this.doc.getResolvedColor(this.getRawText(scan, f), pos);
        const cb = model ? '#' + getModelColor(model, this.getRawText(scan, b)) : this.doc.getResolvedColor(this.getRawText(scan, b), pos);
        flow.addHtml(`<span class="cbox fbox" style="background:${cb || 'transparent'};border-color:${cf || 'currentColor'}">${this.renderInline(scan, t)}</span>`, pos);
    },
    /**
     * \pagecolor: the color of the pages.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    pagecolor(flow, scan, pos) {
        const mo = this.readOption(scan);
        const r = this.readArgument(scan, 'pagecolor');
        this.doc.meta.pagecolor = mo ? '#' + getModelColor(this.getRawText(scan, mo), this.getRawText(scan, r)) : this.doc.getResolvedColor(this.getRawText(scan, r), pos);
    },
    /**
     * \nopagecolor: white pages again.
     * @returns {void}
     */
    nopagecolor() { this.doc.meta.pagecolor = null; },
    /**
     * \definecolor: defines a color by model and value; a wrong value is an error.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    definecolor(flow, scan, pos) {
        const n = this.getRawText(scan, this.readArgument(scan, 'definecolor')).trim();
        const model = this.getRawText(scan, this.readArgument(scan, 'definecolor')).trim();
        const v = this.getRawText(scan, this.readArgument(scan, 'definecolor'));
        const c = getModelColor(model, v);
        if (!c) this.doc.addProblem(pos, `\\definecolor: "${v}" is not a valid ${model} color`, 'error');
        else this.doc.colors[n] = c;
    },
    /**
     * \colorlet: defines a color from a color expression.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    colorlet(flow, scan, pos) {
        const n = this.getRawText(scan, this.readArgument(scan, 'colorlet')).trim();
        const v = this.doc.getResolvedColor(this.getRawText(scan, this.readArgument(scan, 'colorlet')), pos);
        if (v) this.doc.colors[n] = v.slice(1);
    },
    /**
     * \arrayrulecolor (colortbl, xcolor with the option table): the color of the rules of the
     * tables that follow, in the preamble and in the body; inside a table it colors the rules after it.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    arrayrulecolor(flow, scan, pos) { this.readRuleColor(scan, pos); },
    /**
     * \href: a link; only http, https, mailto, tel and # addresses are taken, any other links to "#".
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    href(flow, scan, pos) {
        const address = this.readArgument(scan, 'href');
        const u = this.getRawText(scan, address).trim().replace(/\\([#%&_~])/g, '$1');
        const t = this.readArgument(scan, 'href');
        const safe = /^(https?:|mailto:|tel:|#)/i.test(u) && this.isAddressLinkable(scan, address) ? u : '#';
        flow.addHtml(`<a href="${escapeHtml(safe)}" target="_blank" rel="noopener">${this.renderInline(scan, t)}</a>`, pos);
    },
    /**
     * \url: an address shown and linked; only http, https, mailto and www. addresses are linked.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    url(flow, scan, pos) {
        const address = this.readArgument(scan, 'url');
        const u = this.getRawText(scan, address).trim();
        const linked = /^(https?:|mailto:)/i.test(u) ? u : /^www\./i.test(u) ? 'https://' + u : '#';
        const safe = this.isAddressLinkable(scan, address) ? linked : '#';
        flow.addHtml(`<a class="url" href="${escapeHtml(safe)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`, pos);
    },
    /**
     * \nolinkurl: an address shown, not linked.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    nolinkurl(flow, scan, pos) { flow.addHtml(`<span class="url">${escapeHtml(this.getRawText(scan, this.readArgument(scan, 'nolinkurl')))}</span>`, pos); },
    /**
     * \footnote: a footnote mark here and the note at the bottom of the page.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    footnote(flow, scan, pos) {
        const doc = this.doc;
        const o = this.readOption(scan);
        const r = this.readArgument(scan, 'footnote');
        const n = o ? parseInt(this.getRawText(scan, o), 10) || doc.counters.footnote + 1 : ++doc.counters.footnote;
        if (o) doc.counters.footnote = n;
        const mark = doc.footSymbols ? getFootnoteSymbol(n) : n;
        const html = this.renderInline(scan, r);
        doc.notes.push({ mark, html, pos });
        flow.addHtml(`<sup class="fn-mark" data-p="${pos}">${mark}</sup>`, pos);
    },
    /**
     * \footnotemark: a footnote mark without note.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    footnotemark(flow, scan, pos) { const o = this.readOption(scan); const n = o ? this.getRawText(scan, o) : ++this.doc.counters.footnote; flow.addHtml(`<sup class="fn-mark">${escapeHtml(n)}</sup>`, pos); },
    /**
     * \footnotetext: a footnote without mark in the text.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    footnotetext(flow, scan, pos) { const o = this.readOption(scan); const r = this.readArgument(scan, 'footnotetext'); this.doc.notes.push({ mark: o ? this.getRawText(scan, o) : this.doc.counters.footnote, html: this.renderInline(scan, r), pos }); },
    /**
     * \thanks: a footnote of the title with a symbol.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    thanks(flow, scan, pos) { const r = this.readArgument(scan, 'thanks'); const n = ++this.doc.counters.footnote; this.doc.notes.push({ mark: getFootnoteSymbol(n), html: this.renderInline(scan, r), pos }); flow.addHtml(`<sup class="fn-mark">${getFootnoteSymbol(n)}</sup>`, pos); },
    /**
     * \label: names the current number (section, equation, figure …) for \ref.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    label(flow, scan, pos) {
        const n = this.getRawText(scan, this.readArgument(scan, 'label')).trim();
        flow.addHtml(this.renderLabel(n, pos), pos);
    },
    /**
     * \ref: the number of a label (\eqref in parentheses), linked to its place.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @param {string} name - the command name as used (the handler serves several names).
     * @returns {void}
     */
    ref(flow, scan, pos, name) {
        this.readStar(scan);
        const n = this.getRawText(scan, this.readArgument(scan, name)).trim();
        const l = (this.doc.prev?.labels || {})[n] || this.doc.labels[n];
        const t = this.getReferenceText(n, pos);
        flow.addHtml(`<a class="ref${t === '??' ? ' missing' : ''}" href="#${l ? l.id : ''}" data-p="${pos}">${name === 'eqref' ? '(' + escapeHtml(t) + ')' : escapeHtml(t)}</a>`, pos);
    },
    /**
     * \autoref: the number of a label with the word of its kind ("Figure 2"), linked.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @param {string} name - the command name as used (the handler serves several names).
     * @returns {void}
     */
    autoref(flow, scan, pos, name) {
        this.readStar(scan);
        const n = this.getRawText(scan, this.readArgument(scan, name)).trim();
        const l = (this.doc.prev?.labels || {})[n] || this.doc.labels[n];
        const t = this.getReferenceText(n, pos);
        const kind = l ? l.kind : '';
        const w = { section: this.doc.getWord('section'), subsection: this.doc.getWord('section'), subsubsection: this.doc.getWord('section'), chapter: this.doc.getWord('chapter'),
            figure: this.doc.getWord('figure'), table: this.doc.getWord('table'), equation: this.doc.getWord('equation'), algorithm: this.doc.getWord('algorithm') }[kind] || '';
        const cap = name === 'Cref' || name === 'autoref';
        const word = cap ? w : w.toLowerCase();
        flow.addHtml(`<a class="ref${t === '??' ? ' missing' : ''}" href="#${l ? l.id : ''}" data-p="${pos}">${word ? escapeHtml(word) + '\u00a0' : ''}${kind === 'equation' ? '(' + escapeHtml(t) + ')' : escapeHtml(t)}</a>`, pos);
    },
    /**
     * \pageref: the page of a label, filled in by the page layout.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    pageref(flow, scan, pos) {
        this.readStar(scan);
        const n = this.getRawText(scan, this.readArgument(scan, 'pageref')).trim();
        const l = (this.doc.prev?.labels || {})[n] || this.doc.labels[n];
        flow.addHtml(`<span class="pageref" data-target="${l ? l.id : ''}" data-p="${pos}">${l ? '?' : '??'}</span>`, pos);
    },
    /**
     * \nameref: the title of the section of a label.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    nameref(flow, scan, pos) {
        const n = this.getRawText(scan, this.readArgument(scan, 'nameref')).trim();
        const l = (this.doc.prev?.labels || {})[n];
        const o = l && (this.doc.prev.outline || []).find(x => x.id === l.secId);
        flow.addHtml(`<a class="ref" href="#${l ? l.id : ''}">${o ? escapeHtml(o.title) : escapeHtml(l ? l.num : '??')}</a>`, pos);
    },
    /**
     * \cite: the numbers of bibliography entries, with an optional note.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @param {string} name - the command name as used (the handler serves several names).
     * @returns {void}
     */
    cite(flow, scan, pos, name) {
        const o = this.readOption(scan);
        const o2 = this.readOption(scan);
        const keys = this.getRawText(scan, this.readArgument(scan, name)).split(',').map(x => x.trim()).filter(Boolean);
        const labels = { ...(this.doc.prev?.labels || {}) };
        const nums = keys.map(k => {
            const l = labels['cite:' + k] || this.doc.labels['cite:' + k];
            if (!l && this.doc.prev) this.doc.addProblem(pos, `\\cite{${k}}: there is no \\bibitem{${k}}`, 'warning');
            return l ? `<a class="ref" href="#${l.id}">${escapeHtml(l.num)}</a>` : '<b>?</b>';
        });
        const note = o2 ? this.renderInline(scan, o2) : o ? this.renderInline(scan, o) : '';
        flow.addHtml(`<span class="cite" data-p="${pos}">[${nums.join(', ')}${note ? ', ' + note : ''}]</span>`, pos);
    },
    /**
     * \bibliographystyle: reads its argument; the bibliography is numbered.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    bibliographystyle(flow, scan) { this.readArgument(scan, 'bibliographystyle'); },
    /**
     * \bibliography: BibTeX files cannot be read here: reported once.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    bibliography(flow, scan, pos) { this.readArgument(scan, 'bibliography'); this.doc.addProblem(pos, 'BibTeX files cannot be read here - write the entries in \\begin{thebibliography}{9} … \\end{thebibliography}', 'warning', 'bibtex'); },
    /**
     * \printbibliography: biblatex cannot run here: reported once.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    printbibliography(flow, scan, pos) { this.readOption(scan); this.doc.addProblem(pos, 'biblatex cannot run here - write the entries in \\begin{thebibliography}{9} … \\end{thebibliography}', 'warning', 'bibtex'); },
    /**
     * \addbibresource: reads its arguments; biblatex is reported at \printbibliography.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    addbibresource(flow, scan) { this.readOption(scan); this.readArgument(scan, 'addbibresource'); },
    /**
     * \today: today's date in the document's language.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    today(flow, scan, pos) { flow.addHtml(escapeHtml(this.doc.getToday()), pos); },
    /**
     * \includegraphics: a picture of the document.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    includegraphics(flow, scan, pos) { this.renderGraphic(flow, scan, pos); },
    /**
     * \caption: the numbered caption of a float.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    caption(flow, scan, pos) { this.renderCaption(flow, scan, pos); },
    /**
     * \captionof: a caption for the kind of float its argument names.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    captionof(flow, scan, pos) { const k = this.getRawText(scan, this.readArgument(scan, 'captionof')).trim(); const save = flow.ctx.float; flow.ctx.float = k; this.renderCaption(flow, scan, pos); flow.ctx.float = save; },
    /**
     * \subcaption: a caption.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    subcaption(flow, scan, pos) { this.renderCaption(flow, scan, pos); },
    /**
     * \nocite: reads its argument; the entries are listed anyway.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    nocite(flow, scan) { this.readArgument(scan, 'nocite'); },
};

/* Commands that work as another. */
TEXT_COMMANDS.eqref = TEXT_COMMANDS.ref; TEXT_COMMANDS.cref = TEXT_COMMANDS.autoref; TEXT_COMMANDS.Cref = TEXT_COMMANDS.autoref;
TEXT_COMMANDS.vref = TEXT_COMMANDS.ref; TEXT_COMMANDS.citep = TEXT_COMMANDS.cite; TEXT_COMMANDS.citet = TEXT_COMMANDS.cite;
TEXT_COMMANDS.parencite = TEXT_COMMANDS.cite; TEXT_COMMANDS.textcite = TEXT_COMMANDS.cite; TEXT_COMMANDS.autocite = TEXT_COMMANDS.cite;
TEXT_COMMANDS.footcite = TEXT_COMMANDS.cite;
