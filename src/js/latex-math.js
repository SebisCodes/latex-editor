/**
 * Math of the LaTeX reader: $ … $, $$ … $$, \( \), \[ \] and the math environments (equation, align,
 * gather …) go to KaTeX, with equation numbers as \tag and \label inside math naming that number.
 */

import { escapeHtml } from './latex-units.js?v=3';
import { getPosition, splitTopLevel } from './latex-scan.js?v=3';
import { escapeTemplateTagsAsKatexText } from './template-tags.js?v=1';

/** The renderer methods of this part, mixed into Renderer (latex.js). */
export const MATH_METHODS = {
    /**
     * Renders math with KaTeX: \label names the current equation, \ref and \eqref show the number,
     * comments are removed, template placeholders show as their text. A KaTeX error is reported
     * and the code shown in its place.
     * @this {Renderer}
     * @param {string} tex - the math code.
     * @param {boolean} display - true for displayed math.
     * @param {number} pos - the offset in the code to report.
     * @param {object} [options] - unused options (tagged).
     * @returns {string} the HTML of the math.
     */
    renderMath(tex, display, pos, { tagged = false } = {}) {
        const doc = this.doc;
        tex = escapeTemplateTagsAsKatexText(tex, doc.templateSyntax);
        tex = tex.replace(/(^|[^\\])%[^\n]*/g, '$1');
        // \label inside math names the current equation.
        tex = tex.replace(/\\label\s*\{([^}]*)\}/g, (m, l) => { this.renderLabel(l.trim(), pos); return ''; });
        tex = tex.replace(/\\(nonumber|notag)\b/g, '');
        tex = tex.replace(/\\text(bf|it|tt|sf|rm|normal|up|md)?\s*\{/g, (m, k) => `\\text${k || ''}{`);
        tex = tex.replace(/\\(eqref|ref)\s*\{([^}]*)\}/g, (m, k, l) => {
            const t = this.getReferenceText(l.trim(), pos);
            return `\\text{${k === 'eqref' ? '(' + t + ')' : t}}`;
        });
        const katex = typeof window !== 'undefined' ? window.katex : null;
        if (!katex) return `<code class="mathsrc">${escapeHtml(tex)}</code>`;
        try {
            return katex.renderToString(tex, {
                displayMode: display, throwOnError: true, strict: 'ignore', trust: false, macros: doc.getMathMacros(),
                output: 'htmlAndMathml', globalGroup: false, fleqn: false, leqno: false,
            }).replace(/^<span class="katex/, `<span data-p="${pos}" class="katex`);
        } catch (e) {
            const msg = String(e.message || e).replace(/^KaTeX parse error: /, '').replace(/ at position \d+:[\s\S]*$/, '');
            doc.addProblem(pos, `Math: ${msg}`, 'error');
            return `<code class="math-error" data-p="${pos}" title="${escapeHtml(msg)}">${escapeHtml(tex.trim())}</code>`;
        }
    },

    /**
     * Renders math between $ … $ or $$ … $$; an unclosed one is reported and ends the range.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner at the $.
     * @returns {void}
     */
    renderDollarMath(flow, scan) {
        const s = scan.s, i = scan.i, pos = getPosition(scan, i);
        if (s[i + 1] === '$') {
            const e = this.findMathEnd(s, i + 2, scan.end, '$$');
            if (e < 0) { this.doc.addProblem(pos, '$$ is never closed - add the closing $$', 'error'); scan.i = scan.end; return; }
            scan.i = e + 2;
            this.renderDisplayMath(flow, s.slice(i + 2, e), pos, false);
            return;
        }
        const e = this.findMathEnd(s, i + 1, scan.end, '$');
        if (e < 0) { this.doc.addProblem(pos, '$ is never closed - every $ that starts math needs a $ that ends it', 'error'); scan.i = scan.end; return; }
        scan.i = e + 1;
        flow.addHtml(this.renderMath(s.slice(i + 1, e), false, pos), pos);
    },

    /**
     * Returns where math that started before an index ends; for $ a blank line ends the search.
     * @this {Renderer}
     * @param {string} text - the text.
     * @param {number} start - where the math content starts.
     * @param {number} end - where the search stops.
     * @param {string} close - "$" or "$$".
     * @returns {number} the index of the closing delimiter, or -1.
     */
    findMathEnd(text, start, end, close) {
        for (let k = start; k < end; k++) {
            if (text[k] === '\\') { k++; continue; }
            if (text.startsWith(close, k)) return k;
            if (close === '$' && text[k] === '\n' && /^\n[ \t]*\n/.test(text.slice(k, k + 40))) return -1;
        }
        return -1;
    },

    /**
     * Renders displayed math; a numbered one gets the next equation number as \tag.
     * The paragraph goes on after it without indent.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {string} tex - the math code.
     * @param {number} pos - the offset in the code to report.
     * @param {boolean} numbered - true to number it.
     * @returns {void}
     */
    renderDisplayMath(flow, tex, pos, numbered) {
        let t = tex;
        if (numbered && !/\\tag\b/.test(t) && !/\\(nonumber|notag)\b/.test(t)) {
            this.doc.counters.equation++;
            const n = this.doc.getChapterPrefix() + this.doc.counters.equation;
            this.setTarget(n, 'equation');
            t += `\\tag{${n}}`;
        }
        // The paragraph goes on after displayed math (no indent).
        const html = `<span class="dm" data-p="${pos}">${this.renderMath(t, true, pos)}</span>`;
        if (flow.mode === 'inline') { flow.addHtml(html, pos); return; }
        if (flow.para) { flow.para.html += html; return; }
        flow.addHtml(html, pos);
    },

    /**
     * Renders a math environment (equation, align, gather …): each row of a numbered one gets
     * its own number.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {string} name - the command or environment name.
     * @param {string} body - the environment's content.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderMathEnvironment(flow, name, body, pos) {
        const star = name.endsWith('*') || name === 'displaymath' || name === 'math';
        const base = name.replace(/\*$/, '');
        if (base === 'equation' || base === 'displaymath' || base === 'dmath') { this.renderDisplayMath(flow, body, pos, !star); return; }
        if (base === 'math') { flow.addHtml(this.renderMath(body, false, pos), pos); return; }
        let env = { align: 'align*', flalign: 'align*', alignat: 'alignat*', gather: 'gather*', multline: 'gather*', eqnarray: 'align*' }[base];
        let pre = '';
        if (base === 'alignat') {
            const m = /^\s*\{(\d+)\}/.exec(body);
            if (m) { pre = `{${m[1]}}`; body = body.slice(m[0].length); }
        }
        if (base === 'eqnarray') body = body.replace(/&\s*([^&\\]*?)\s*&/g, '&$1 ');
        const rows = splitTopLevel(body, 0, body.length, (s, k) => (s.startsWith('\\\\', k) ? 2 : 0));
        const out = [];
        for (const [idx, r] of rows.entries()) {
            let t = body.slice(r.a, r.b);
            if (idx > 0) t = t.replace(/^\s*\*?\s*\[[^\]]*\]/, '');
            if (!t.trim() && idx === rows.length - 1 && idx > 0) continue;
            if (!star && !/\\(nonumber|notag)\b/.test(t) && !/\\tag\b/.test(t)) {
                this.doc.counters.equation++;
                const n = this.doc.getChapterPrefix() + this.doc.counters.equation;
                this.setTarget(n, 'equation');
                t = t.replace(/\\label\s*\{([^}]*)\}/g, (m, l) => { this.renderLabel(l.trim(), pos); return ''; });
                t += ` \\tag{${n}}`;
            }
            out.push(t);
        }
        this.renderDisplayMath(flow, `\\begin{${env}}${pre}${out.join('\\\\')}\\end{${env}}`, pos, false);
    },
};
