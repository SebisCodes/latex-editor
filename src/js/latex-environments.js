/**
 * Environments of the LaTeX reader: lists, alignment, quotes, tables, floats, algorithms, minipages,
 * columns, theorem-like boxes, size environments and verbatim. Each entry is called with the
 * renderer as this and a scanner over the body; the keys are the LaTeX names.
 *
 * The file is longer than the usual guide: it holds a table of environments keyed by their LaTeX
 * names, each entry with its doc comment; splitting it further would scatter one topic.
 */

import { escapeHtml, getColorValue } from './latex-units.js?v=3';
import { VERBATIM_ENVIRONMENTS } from './latex-names.js?v=2';
import { createScanner, parseKeyValues } from './latex-scan.js?v=2';

/** @type {Object<string, CommandHandler>} */
export const ENVIRONMENTS = {
    /**
     * document: the body of the document, on the top level.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    document(flow, scan) { for (const b of this.renderRange(createScanner(scan.s, scan.i, scan.end, scan.v), 'block', { top: true })) flow.addFlowBlock(b); },
    /**
     * itemize: a bulleted list.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    itemize(flow, scan, pos) { this.renderList(flow, scan, pos, 'itemize'); },
    /**
     * enumerate: a numbered list.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    enumerate(flow, scan, pos) { this.renderList(flow, scan, pos, 'enumerate'); },
    /**
     * description: a list of terms and descriptions.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    description(flow, scan, pos) { this.renderList(flow, scan, pos, 'description'); },
    /**
     * compactitem: a bulleted list.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    compactitem(flow, scan, pos) { this.renderList(flow, scan, pos, 'itemize'); },
    /**
     * compactenum: a numbered list.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    compactenum(flow, scan, pos) { this.renderList(flow, scan, pos, 'enumerate'); },
    /**
     * center: centered paragraphs.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    center(flow, scan, pos) { this.renderAlignment(flow, scan, pos, 'c'); },
    /**
     * flushleft: paragraphs aligned left.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    flushleft(flow, scan, pos) { this.renderAlignment(flow, scan, pos, 'l'); },
    /**
     * flushright: paragraphs aligned right.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    flushright(flow, scan, pos) { this.renderAlignment(flow, scan, pos, 'r'); },
    /**
     * Center: centered paragraphs.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    Center(flow, scan, pos) { this.renderAlignment(flow, scan, pos, 'c'); },
    /**
     * FlushLeft: paragraphs aligned left.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    FlushLeft(flow, scan, pos) { this.renderAlignment(flow, scan, pos, 'l'); },
    /**
     * FlushRight: paragraphs aligned right.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    FlushRight(flow, scan, pos) { this.renderAlignment(flow, scan, pos, 'r'); },
    /**
     * quote: an indented quote.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    quote(flow, scan, pos) { this.renderBox(flow, scan, pos, 'quote', { noindentAll: true }); },
    /**
     * quotation: an indented quote with indented paragraphs.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    quotation(flow, scan, pos) { this.renderBox(flow, scan, pos, 'quote quotation', {}); },
    /**
     * verse: an indented poem.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    verse(flow, scan, pos) { this.renderBox(flow, scan, pos, 'quote verse', { noindentAll: true }); },
    /**
     * abstract: the abstract with its heading.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the environment's body.
     * @param {number} pos - the offset of the \begin in the code.
     * @returns {void}
     */
    abstract(flow, scan, pos) {
        const inner = this.renderBlockHtml(scan, { a: scan.i, b: scan.end }, {});
        flow.addBlock(`<div class="abstract" data-p="${pos}"><div class="abstract-title">${this.doc.names?.abstractname ? escapeHtml(this.doc.names.abstractname) : this.doc.getWord('abstract')}</div>${inner}</div>`, pos, 'abstract');
        flow.noindent = false;
    },
    /**
     * titlepage: a page of its own without page number.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the environment's body.
     * @param {number} pos - the offset of the \begin in the code.
     * @returns {void}
     */
    titlepage(flow, scan, pos) {
        const inner = this.renderBlocks(scan, { a: scan.i, b: scan.end }, { top: true });
        flow.addBlock('', pos, 'break', { pageBreak: true });
        for (const b of inner) flow.addFlowBlock(b);
        flow.addBlock('', pos, 'mark', { nopagenum: true });
        flow.addBlock('', pos, 'break', { pageBreak: true });
    },
    /**
     * tabular: a table.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    tabular(flow, scan, pos, name) { this.renderTabular(flow, scan, pos, name); },
    /**
     * tabular*: a table of a width.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    'tabular*'(flow, scan, pos) { this.renderTabular(flow, scan, pos, 'tabular*'); },
    /**
     * tabularx: a table of a width with X columns.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    tabularx(flow, scan, pos) { this.renderTabular(flow, scan, pos, 'tabularx'); },
    /**
     * xltabular: a table of a width with X columns.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    xltabular(flow, scan, pos) { this.renderTabular(flow, scan, pos, 'xltabular'); },
    /**
     * tabulary: a table of a width.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    tabulary(flow, scan, pos) { this.renderTabular(flow, scan, pos, 'tabulary'); },
    /**
     * longtable: a table on a centered line of its own.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    longtable(flow, scan, pos) { this.renderAlignedTable(flow, scan, pos, 'tabular'); },
    /**
     * supertabular: a table on a centered line of its own.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    supertabular(flow, scan, pos) { this.renderAlignedTable(flow, scan, pos, 'tabular'); },
    /**
     * array: a table (array outside math).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    array(flow, scan, pos) { this.renderTabular(flow, scan, pos, 'tabular'); },
    /**
     * figure: a figure float.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    figure(flow, scan, pos, name) { this.renderFloat(flow, scan, pos, name); },
    /**
     * table: a table float.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    table(flow, scan, pos, name) { this.renderFloat(flow, scan, pos, name); },
    /**
     * wrapfigure: a figure; its placement and width are read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    wrapfigure(flow, scan, pos) { this.readOption(scan); this.readArgument(scan, 'wrapfigure'); this.readOption(scan); this.readArgument(scan, 'wrapfigure'); this.renderFloat(flow, scan, pos, 'figure'); },
    /**
     * wraptable: a table; its placement and width are read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    wraptable(flow, scan, pos) { this.readOption(scan); this.readArgument(scan, 'wraptable'); this.readOption(scan); this.readArgument(scan, 'wraptable'); this.renderFloat(flow, scan, pos, 'table'); },
    /**
     * subfigure: a box of a width (as minipage).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    subfigure(flow, scan, pos) { this.renderMinipage(flow, scan, pos, 'subfigure'); },
    /**
     * Programmcode: a listing float.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    Programmcode(flow, scan, pos) { this.renderFloat(flow, scan, pos, 'Programmcode'); },
    /**
     * Algorithmus: an algorithm float.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    Algorithmus(flow, scan, pos) { this.renderFloat(flow, scan, pos, 'algorithm'); },
    /**
     * listing: a listing float.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    listing(flow, scan, pos) { this.renderFloat(flow, scan, pos, 'listing'); },
    /**
     * algorithm: an algorithm: a float around algorithmic, else algorithm2e lines.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the environment's body.
     * @param {number} pos - the offset of the \begin in the code.
     * @returns {void}
     */
    algorithm(flow, scan, pos) {
        // algorithm2e writes the algorithm itself; the algorithm package only floats algorithmic.
        if (/\\begin\{algorithmic\}/.test(scan.s.slice(scan.i, scan.end))) { this.renderFloat(flow, scan, pos, 'algorithm'); return; }
        if (flow.ctx.float === 'algorithm') {
            this.readOption(scan);
            const inner = this.renderAlgorithmLines(scan, { a: scan.i, b: scan.end }, false);
            flow.addBlock(`<div class="algo" data-p="${pos}">${inner.html}</div>${inner.caption}`, pos, 'algo');
            return;
        }
        this.renderAlgorithm(flow, scan, pos);
    },
    /**
     * algorithm2e: an algorithm2e algorithm.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    algorithm2e(flow, scan, pos) { this.renderAlgorithm(flow, scan, pos); },
    /**
     * algorithmic: algpseudocode lines.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    algorithmic(flow, scan, pos) { this.renderAlgorithmic(flow, scan, pos); },
    /**
     * minipage: a box of paragraphs of a width.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    minipage(flow, scan, pos, name) { this.renderMinipage(flow, scan, pos, name); },
    /**
     * multicols: text in columns, with an optional heading.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the environment's body.
     * @param {number} pos - the offset of the \begin in the code.
     * @returns {void}
     */
    multicols(flow, scan, pos) {
        const n = parseInt(this.getRawText(scan, this.readArgument(scan, 'multicols')), 10) || 2;
        const pre = this.readOption(scan);
        const inner = this.renderBlockHtml(scan, { a: scan.i, b: scan.end }, {});
        flow.addBlock(`${pre ? `<div class="p ni">${this.renderInline(scan, pre)}</div>` : ''}<div class="multicols" style="column-count:${n}" data-p="${pos}">${inner}</div>`, pos, 'cols');
    },
    /**
     * multicols*: text in columns (as multicols).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    'multicols*'(flow, scan, pos) { ENVIRONMENTS.multicols.call(this, flow, scan, pos); },
    /**
     * thebibliography: the bibliography.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    thebibliography(flow, scan, pos) { this.renderBibliography(flow, scan, pos); },
    /**
     * proof: a proof with its heading and the end mark.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the environment's body.
     * @param {number} pos - the offset of the \begin in the code.
     * @returns {void}
     */
    proof(flow, scan, pos) {
        const o = this.readOption(scan);
        const inner = this.renderBlockHtml(scan, { a: scan.i, b: scan.end }, { noindent: true });
        flow.addBlock(`<div class="proof" data-p="${pos}"><i>${o ? this.renderInline(scan, o) : this.doc.getWord('proof')}.</i> ${inner.replace(/^<div class="p( ni)?"/, '<div class="p ni inl"')}<span class="qed">□</span></div>`, pos);
        flow.noindent = true;
    },
    /**
     * tikzpicture: a TikZ drawing: shown as a placeholder and reported.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    tikzpicture(flow, scan, pos) { flow.addBlock(`<div class="p ni al-c">${this.renderUnsupported('TikZ', pos)}</div>`, pos); },
    /**
     * pspicture: a PSTricks drawing: shown as a placeholder and reported.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    pspicture(flow, scan, pos) { flow.addBlock(`<div class="p ni al-c">${this.renderUnsupported('PSTricks', pos)}</div>`, pos); },
    /**
     * picture: a picture drawing: shown as a placeholder and reported.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    picture(flow, scan, pos) { flow.addBlock(`<div class="p ni al-c">${this.renderUnsupported('picture', pos)}</div>`, pos); },
    /**
     * axis: a pgfplots plot: shown as a placeholder and reported.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    axis(flow, scan, pos) { flow.addBlock(this.renderUnsupported('pgfplots', pos), pos); },
    /**
     * small: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    small(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'small'); },
    /**
     * footnotesize: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    footnotesize(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'footnotesize'); },
    /**
     * scriptsize: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    scriptsize(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'scriptsize'); },
    /**
     * tiny: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    tiny(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'tiny'); },
    /**
     * large: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    large(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'large'); },
    /**
     * Large: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    Large(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'Large'); },
    /**
     * LARGE: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    LARGE(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'LARGE'); },
    /**
     * huge: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    huge(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'huge'); },
    /**
     * Huge: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    Huge(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'Huge'); },
    /**
     * normalsize: its content in this size.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    normalsize(flow, scan, pos) { this.renderSizeEnvironment(flow, scan, pos, 'normalsize'); },
    /**
     * framed: its content in a frame.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    framed(flow, scan, pos) { this.renderBox(flow, scan, pos, 'frame', {}); },
    /**
     * mdframed: its content in a frame; the options are read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    mdframed(flow, scan, pos) { this.readOption(scan); this.renderBox(flow, scan, pos, 'frame', {}); },
    /**
     * tcolorbox: a colored box with an optional title (colback, colframe, title).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the environment's body.
     * @param {number} pos - the offset of the \begin in the code.
     * @returns {void}
     */
    tcolorbox(flow, scan, pos) {
        const o = this.readOption(scan);
        const kv = parseKeyValues(o ? this.getRawText(scan, o) : '');
        const bg = kv.get('colback') ? getColorValue(kv.get('colback'), this.doc.colors) : null;
        const fr = kv.get('colframe') ? getColorValue(kv.get('colframe'), this.doc.colors) : null;
        const title = kv.get('title');
        const inner = this.renderBlockHtml(scan, { a: scan.i, b: scan.end }, { noindentAll: true });
        flow.addBlock(`<div class="tcb" style="${bg ? 'background:' + bg + ';' : ''}${fr ? 'border-color:' + fr : ''}" data-p="${pos}">${title ? `<div class="tcb-title" style="${fr ? 'background:' + fr : ''}">${escapeHtml(title)}</div>` : ''}<div class="tcb-content">${inner}</div></div>`, pos);
    },
    /**
     * letter: the letter's content; the address is read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    letter(flow, scan, pos) { this.readArgument(scan, 'letter'); for (const b of this.renderBlocks(scan, { a: scan.i, b: scan.end }, {})) flow.addFlowBlock(b); },
    /**
     * adjustwidth: its content; the widths are read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    adjustwidth(flow, scan, pos) { this.readArgument(scan, 'adjustwidth'); this.readArgument(scan, 'adjustwidth'); this.renderBox(flow, scan, pos, '', {}); },
    /**
     * landscape: its content.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    landscape(flow, scan, pos) { for (const b of this.renderBlocks(scan, { a: scan.i, b: scan.end }, {})) flow.addFlowBlock(b); },
    /**
     * spacing: its content; the spacing is read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    spacing(flow, scan, pos) { this.readArgument(scan, 'spacing'); for (const b of this.renderBlocks(scan, { a: scan.i, b: scan.end }, {})) flow.addFlowBlock(b); },
    /**
     * onehalfspace: its content.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    onehalfspace(flow, scan) { for (const b of this.renderBlocks(scan, { a: scan.i, b: scan.end }, {})) flow.addFlowBlock(b); },
    /**
     * singlespace: its content.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    singlespace(flow, scan) { for (const b of this.renderBlocks(scan, { a: scan.i, b: scan.end }, {})) flow.addFlowBlock(b); },
    /**
     * otherlanguage: its content; the language is read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    otherlanguage(flow, scan) { this.readArgument(scan, 'otherlanguage'); for (const b of this.renderBlocks(scan, { a: scan.i, b: scan.end }, {})) flow.addFlowBlock(b); },
    /**
     * threeparttable: its content.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    threeparttable(flow, scan) { for (const b of this.renderBlocks(scan, { a: scan.i, b: scan.end }, {})) flow.addFlowBlock(b); },
    /**
     * tablenotes: the notes of a table as a list.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    tablenotes(flow, scan, pos) { this.renderList(flow, scan, pos, 'itemize'); },
    /**
     * subequations: its content.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    subequations(flow, scan) { for (const b of this.renderBlocks(scan, { a: scan.i, b: scan.end }, {})) flow.addFlowBlock(b); },
    /**
     * cases: cases as math.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    cases(flow, scan, pos) { flow.addHtml(this.renderMath(`\\begin{cases}${scan.s.slice(scan.i, scan.end)}\\end{cases}`, false, pos), pos); },
};

for (const name of VERBATIM_ENVIRONMENTS) {
    /**
     * A verbatim environment: renders its content as it is (renderVerbatim()).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    ENVIRONMENTS[name] = function (flow, scan, pos) { this.renderVerbatim(flow, scan, pos, name); };
}

/** The renderer methods of this part, mixed into Renderer (latex.js). */
export const ENVIRONMENT_METHODS = {
    /**
     * Renders a table on a centered line of its own.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the table environment.
     * @returns {void}
     */
    renderAlignedTable(flow, scan, pos, name) {
        flow.closeParagraph();
        this.renderTabular(flow, scan, pos, name);
        const p = flow.para;
        if (p) { p.noindent = true; flow.align = flow.align || 'c'; flow.closeParagraph(); flow.align = null; }
    },

    /**
     * Renders aligned paragraphs (center, flushleft, flushright); on the top level each block stays
     * separate so long parts can break across pages.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} alignment - "c", "l" or "r".
     * @returns {void}
     */
    renderAlignment(flow, scan, pos, alignment) {
        flow.closeParagraph();
        const inner = this.renderBlocks(scan, { a: scan.i, b: scan.end }, { align: alignment, noindentAll: true, noindent: true, top: flow.ctx.top });
        const html = inner.map(b => b.html).join('');
        if (flow.ctx.top) {
            // Keep the blocks separate on the top level so long centered parts can break across pages.
            for (const b of inner) { b.html = `<div class="al-${alignment}">${b.html}</div>`; flow.addFlowBlock(b); }
        } else flow.addBlock(`<div class="al-${alignment}" data-p="${pos}">${html}</div>`, pos);
        flow.noindent = true;
    },

    /**
     * Renders the content of an environment in a box with a class.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} cls - the class of the box.
     * @param {object} context - the context of the new flow (top, float, listDepth, noindent …).
     * @returns {void}
     */
    renderBox(flow, scan, pos, cls, context) {
        const inner = this.renderBlockHtml(scan, { a: scan.i, b: scan.end }, context);
        flow.addBlock(`<div class="${cls}" data-p="${pos}">${inner}</div>`, pos);
        flow.noindent = true;
    },

    /**
     * Renders the content of a size environment in that size.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} size - the size command.
     * @returns {void}
     */
    renderSizeEnvironment(flow, scan, pos, size) {
        flow.closeParagraph();
        flow.openGroup();
        this.addSizeDeclaration(flow, size);
        flow.stack.push({ marker: f => { f.closeParagraph(); f.closeGroup(); } });
        flow.stack.push(createScanner(scan.s, scan.i, scan.end, scan.v));
    },
};
