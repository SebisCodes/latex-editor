/**
 * Commands of the LaTeX reader for inline code, space, rules and boxes: \verb, \hspace, \vspace, \rule,
 * \fbox, \parbox, \raisebox, \scalebox …, \ding and filler text (\lipsum, \blindtext).
 *
 * The file is longer than the usual guide: it holds a table of commands keyed by their LaTeX
 * names, each entry with its doc comment; splitting it further would scatter one topic.
 */

import { escapeHtml } from './latex-units.js?v=3';
import { createScanner } from './latex-scan.js?v=3';
import { handleSkippedCommand } from './latex-skipped-commands.js?v=2';

/** @type {Object<string, CommandHandler>} */
export const BOX_COMMANDS = {
    /**
     * \verb: inline code between two equal characters on one line (\verb* shows spaces).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    verb(flow, scan, pos) {
        const s = scan.s;
        const star = this.readStar(scan);
        const dch = s[scan.i];
        const e = s.indexOf(dch, scan.i + 1);
        if (!dch || e < 0 || e > scan.end || s.slice(scan.i + 1, e).includes('\n')) { this.doc.addProblem(pos, '\\verb needs a closing character on the same line, e.g. \\verb|text|', 'error'); return; }
        let t = s.slice(scan.i + 1, e);
        if (star) t = t.replace(/ /g, '␣');
        scan.i = e + 1;
        flow.addHtml(`<code class="verb">${escapeHtml(t)}</code>`, pos);
    },
    /**
     * \lstinline: inline code in braces or between two equal characters.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    lstinline(flow, scan, pos) {
        this.readOption(scan);
        const s = scan.s;
        const dch = s[scan.i];
        if (dch === '{') { const r = this.readArgument(scan, 'lstinline'); flow.addHtml(`<code class="verb">${escapeHtml(this.getRawText(scan, r))}</code>`, pos); return; }
        const e = s.indexOf(dch, scan.i + 1);
        if (e < 0) return;
        flow.addHtml(`<code class="verb">${escapeHtml(s.slice(scan.i + 1, e))}</code>`, pos);
        scan.i = e + 1;
    },
    /**
     * \mintinline: inline code; the language is read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    mintinline(flow, scan, pos) { this.readOption(scan); this.readArgument(scan, 'mintinline'); const r = this.readArgument(scan, 'mintinline'); flow.addHtml(`<code class="verb">${escapeHtml(this.getRawText(scan, r))}</code>`, pos); },
    /**
     * \hspace: horizontal space, \fill stretches.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    hspace(flow, scan, pos) {
        this.readStar(scan);
        const r = this.readArgument(scan, 'hspace');
        const l = this.getLength(this.getRawText(scan, r));
        if (l === 'fill') { flow.addHtml('<span class="hfill"></span>', pos); if (flow.para) flow.para.hasFill = true; return; }
        flow.addHtml(`<span class="hsp" style="width:${l || 0}${l && l.startsWith('-') ? ';margin-right:' + l : ''}"></span>`, pos);
    },
    /**
     * \vspace: vertical space, \fill stretches on the page.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    vspace(flow, scan, pos) {
        this.readStar(scan);
        const r = this.readArgument(scan, 'vspace');
        const l = this.getLength(this.getRawText(scan, r));
        if (l === 'fill') { flow.addBlock('<div class="vfill"></div>', pos, 'vfill'); return; }
        if (flow.mode === 'inline' || flow.para) { flow.addHtml(`<span class="vsp" style="height:${l || 0}"></span>`, pos); return; }
        flow.addBlock(`<div class="vsp" style="height:${l || 0}"></div>`, pos, 'space');
    },
    /**
     * \vfill: vertical space that fills the page.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    vfill(flow, scan, pos) { flow.addBlock('<div class="vfill"></div>', pos, 'vfill'); },
    /**
     * \hfill: horizontal space that fills the line.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    hfill(flow, scan, pos) { flow.addHtml('<span class="hfill"></span>', pos); },
    /**
     * \hfil: horizontal space that fills the line.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    hfil(flow, scan, pos) { flow.addHtml('<span class="hfill"></span>', pos); },
    /**
     * \hrulefill: a rule that fills the line.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    hrulefill(flow, scan, pos) { flow.addHtml('<span class="hfill hrule"></span>', pos); },
    /**
     * \dotfill: dots that fill the line.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    dotfill(flow, scan, pos) { flow.addHtml('<span class="hfill dots"></span>', pos); },
    /**
     * \smallskip: a small vertical space (3 pt).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    smallskip(flow, scan, pos) { flow.addBlock('<div class="vsp" style="height:3pt"></div>', pos, 'space'); },
    /**
     * \medskip: a medium vertical space (6 pt).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    medskip(flow, scan, pos) { flow.addBlock('<div class="vsp" style="height:6pt"></div>', pos, 'space'); },
    /**
     * \bigskip: a big vertical space (12 pt).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    bigskip(flow, scan, pos) { flow.addBlock('<div class="vsp" style="height:12pt"></div>', pos, 'space'); },
    /**
     * \hrule: a horizontal rule across the text.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    hrule(flow, scan, pos) { flow.addBlock('<hr class="hrule">', pos, 'rule'); },
    /**
     * \rule: a filled box of a width and height, optionally raised.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    rule(flow, scan, pos) {
        const o = this.readOption(scan);
        const w = this.getLength(this.getRawText(scan, this.readArgument(scan, 'rule'))) || '0';
        const h = this.getLength(this.getRawText(scan, this.readArgument(scan, 'rule'))) || '0';
        const raise = o ? this.getLength(this.getRawText(scan, o)) : null;
        flow.addHtml(`<span class="rule" style="width:${w};height:${h}${raise ? ';vertical-align:' + raise : ''}" data-p="${pos}"></span>`, pos);
    },
    /**
     * \fbox: its text in a frame.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    fbox(flow, scan, pos) { const r = this.readArgument(scan, 'fbox'); flow.addHtml(`<span class="fbox">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \framebox: its text in a frame of an optional width and alignment.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    framebox(flow, scan, pos) { const o = this.readOption(scan); const o2 = this.readOption(scan); const r = this.readArgument(scan, 'framebox'); const w = o ? this.getLength(this.getRawText(scan, o)) : null; const al = o2 ? this.getRawText(scan, o2).trim() : 'c'; flow.addHtml(`<span class="fbox"${w ? ` style="display:inline-block;width:${w};text-align:${al === 'l' ? 'left' : al === 'r' ? 'right' : 'center'}"` : ''}>${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \makebox: its text in a box of an optional width and alignment.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    makebox(flow, scan, pos) { const o = this.readOption(scan); const o2 = this.readOption(scan); const r = this.readArgument(scan, 'makebox'); const w = o ? this.getLength(this.getRawText(scan, o)) : null; const al = o2 ? this.getRawText(scan, o2).trim() : 'c'; flow.addHtml(`<span class="nobr"${w ? ` style="display:inline-block;width:${w};text-align:${al === 'l' ? 'left' : al === 'r' ? 'right' : 'center'}"` : ''}>${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \parbox: a box of paragraphs of a width.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    parbox(flow, scan, pos) {
        const o = this.readOption(scan); this.readOption(scan); this.readOption(scan);
        const w = this.getLength(this.getRawText(scan, this.readArgument(scan, 'parbox'))) || '100%';
        const r = this.readArgument(scan, 'parbox');
        const v = o ? this.getRawText(scan, o).trim() : 'c';
        flow.addHtml(`<span class="minipage" style="width:${w};vertical-align:${v === 't' ? 'top' : v === 'b' ? 'bottom' : 'middle'}">${this.runAtWidth(w, () => this.renderBlockHtml(scan, r, { noindentAll: true }))}</span>`, pos);
    },
    /**
     * \raisebox: its text raised by a length.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    raisebox(flow, scan, pos) { const l = this.getLength(this.getRawText(scan, this.readArgument(scan, 'raisebox'))); this.readOption(scan); this.readOption(scan); const r = this.readArgument(scan, 'raisebox'); flow.addHtml(`<span style="display:inline-block;position:relative;bottom:${l || 0}">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \phantom: invisible text that takes its space.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    phantom(flow, scan, pos) { const r = this.readArgument(scan, 'phantom'); flow.addHtml(`<span style="visibility:hidden">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \hphantom: invisible text that takes its width only.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    hphantom(flow, scan, pos) { const r = this.readArgument(scan, 'hphantom'); flow.addHtml(`<span style="visibility:hidden;display:inline-block;height:0;overflow:hidden">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \vphantom: reads its argument; it adds no width.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    vphantom(flow, scan) { this.readArgument(scan, 'vphantom'); },
    /**
     * \resizebox: its text in a box of the width given.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    resizebox(flow, scan, pos) { this.readStar(scan); const w = this.getLength(this.getRawText(scan, this.readArgument(scan, 'resizebox'))); this.readArgument(scan, 'resizebox'); const r = this.readArgument(scan, 'resizebox'); flow.addHtml(`<span style="display:inline-block;${w && w !== '!' ? 'width:' + w + ';' : ''}overflow:hidden">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \scalebox: its text scaled by a factor.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    scalebox(flow, scan, pos) { const f = parseFloat(this.getRawText(scan, this.readArgument(scan, 'scalebox'))) || 1; this.readOption(scan); const r = this.readArgument(scan, 'scalebox'); flow.addHtml(`<span style="display:inline-block;font-size:${f}em">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \rotatebox: its text turned by an angle.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    rotatebox(flow, scan, pos) { this.readOption(scan); const a = parseFloat(this.getRawText(scan, this.readArgument(scan, 'rotatebox'))) || 0; const r = this.readArgument(scan, 'rotatebox'); flow.addHtml(`<span style="display:inline-block;transform:rotate(${-a}deg)">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \reflectbox: its text mirrored.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    reflectbox(flow, scan, pos) { const r = this.readArgument(scan, 'reflectbox'); flow.addHtml(`<span style="display:inline-block;transform:scaleX(-1)">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \ensuremath: its argument as math.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    ensuremath(flow, scan, pos) { const r = this.readArgument(scan, 'ensuremath'); flow.addHtml(this.renderMath(this.getRawText(scan, r), false, pos), pos); },
    /**
     * \textsuperscript: its text raised as a superscript.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    textsuperscript(flow, scan, pos) { this.renderFontCommand(flow, scan, 'sup', pos, 'textsuperscript'); },
    /**
     * \ding: a dingbat of the pifont number, a bullet for an unknown number.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    ding(flow, scan, pos) { const n = parseInt(this.getRawText(scan, this.readArgument(scan, 'ding')), 10); flow.addHtml({ 51: '✓', 52: '✔', 55: '✗', 56: '✘', 72: '★', 108: '●', 110: '■', 117: '◆', 182: '①', 192: '①', 212: '➔', 220: '➜', 228: '➤', 232: '➨', 43: '☛', 41: '✆', 37: '☎', 73: '☆' }[n] || '•', pos); },
    /** \faIcon: no icon: the command is read and dropped. */
    faIcon: handleSkippedCommand,
    /**
     * \lipsum: filler paragraphs (lipsum), as many as the range asks for, at most 20.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    lipsum(flow, scan, pos) {
        const o = this.readOption(scan);
        const [a, b] = (o ? this.getRawText(scan, o) : '1-7').split('-').map(Number);
        const n = Math.max(1, Math.min(20, (b || a) - (a || 1) + 1));
        const t = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Ut purus elit, vestibulum ut, placerat ac, adipiscing vitae, felis. Curabitur dictum gravida mauris. Nam arcu libero, nonummy eget, consectetuer id, vulputate a, magna. Donec vehicula augue eu neque. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Mauris ut leo. Cras viverra metus rhoncus sem. Nulla et lectus vestibulum urna fringilla ultrices. Phasellus eu tellus sit amet tortor gravida placerat.';
        for (let k = 0; k < n; k++) { flow.addHtml(t, pos); flow.closeParagraph(); }
    },
    /**
     * \blindtext: filler text (as \lipsum).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    blindtext(flow, scan, pos) { BOX_COMMANDS.lipsum.call(this, flow, createScanner('', 0, 0), pos); },
    /**
     * \Blindtext: more filler text (as \lipsum[1-3]).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    Blindtext(flow, scan, pos) { BOX_COMMANDS.lipsum.call(this, flow, createScanner('[1-3]', 0, 5), pos); },
};
