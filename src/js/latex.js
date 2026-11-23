/**
 * LaTeX to HTML in the browser, without a TeX installation.
 *
 * render() reads the code the way TeX would and returns the body as a list of blocks
 * (paragraphs, headings, lists, displayed math …) for the page layout in viewer.js, together
 * with the page settings, the outline, the labels and every problem found with its position:
 *   1. the preamble: class, packages, definitions, title fields (latex-preamble.js);
 *   2. the page layout: paper and margins (latex-document.js);
 *   3. the body: the Renderer reads it character by character into a Flow (latex-flow.js) -
 *      commands go to the tables of latex-commands.js and its sibling modules, environments to
 *      latex-environments.js, math to KaTeX (latex-math.js);
 *   4. documents with \ref, \cite or \tableofcontents are read twice, as LaTeX needs two runs:
 *      the second pass knows the labels, the outline and the captions of the first.
 *
 * Every block and many inline elements carry data-p="<offset>", the place in the code they come
 * from; text produced by a \newcommand points at the place where the command was used.
 * Unknown commands are reported and their arguments shown as plain text, so nothing silently
 * disappears.
 *
 * The Renderer is one class: its methods call each other all the time while they read. The core
 * of the reading (the loop, arguments, commands, headings, environments) stays in this file; the
 * methods of the other topics live in their modules and are mixed into the class below.
 */

import { escapeHtml, PAPERS, SIZE_NAMES, getCssLength } from './latex-units.js?v=3';
import { SYMBOLS, ACCENTS, SPACES, ESCAPED, FONT_COMMANDS, FONT_DECLARATIONS, SECTION_LEVELS, SECTION_ORDER, MATH_ENVIRONMENTS } from './latex-names.js?v=2';
import { LETTER, createScanner, getPosition, findClosingBrace, findClosingBracket, findEnvironmentEnd, formatRoman } from './latex-scan.js?v=2';
import { Flow } from './latex-flow.js?v=2';
import { TexDocument } from './latex-document.js?v=3';
import { SKIPPED_COMMANDS } from './latex-skipped-commands.js?v=2';
import { MATH_METHODS } from './latex-math.js?v=4';
import { TABLE_METHODS } from './latex-tables.js?v=3';
import { BLOCK_METHODS } from './latex-blocks.js?v=3';
import { ALGORITHM_METHODS } from './latex-algorithms.js?v=2';
import { ENVIRONMENTS, ENVIRONMENT_METHODS } from './latex-environments.js?v=3';
import { TEXT_COMMANDS } from './latex-commands.js?v=3';
import { BOX_COMMANDS } from './latex-box-commands.js?v=3';
import { PAGE_COMMANDS, PAGE_METHODS } from './latex-page-commands.js?v=3';
import { DEFINITION_COMMANDS, DEFINITION_METHODS } from './latex-definitions.js?v=2';
import { PREAMBLE_METHODS } from './latex-preamble.js?v=3';
import { getTemplateSyntax, findTemplateTagAt, checkTemplateSections, formatTemplateTagLabel } from './latex-template.js?v=1';

export { escapeHtml, PAPERS };

/**
 * A handler of a command or environment, called with the renderer as this.
 * @callback CommandHandler
 * @this {Renderer}
 * @param {Flow} flow - the flow to write into.
 * @param {Scanner} scan - the scanner after the command name, or over the environment's body.
 * @param {number} pos - the offset of the command in the code.
 * @param {string} name - the name as used.
 * @returns {void}
 */

/**
 * What render() returns.
 * @typedef {object} RenderResult
 * @property {Block[]} blocks - the body as blocks for the page layout.
 * @property {Meta} meta - the page settings.
 * @property {OutlineEntry[]} outline - the headings.
 * @property {Object<string, Label>} labels - the labels by name.
 * @property {Problem[]} problems - the problems, sorted by position.
 * @property {object[]} captions - the captions of floats.
 */

/** All commands of the tables, by LaTeX name. */
const COMMANDS = { ...TEXT_COMMANDS, ...BOX_COMMANDS, ...PAGE_COMMANDS, ...SKIPPED_COMMANDS, ...DEFINITION_COMMANDS };

/**
 * Reads the code of one pass into the flow; holds the document state and the line widths of
 * the boxes it is inside.
 */
class Renderer {
    /**
     * Creates the renderer of one pass.
     * @param {TexDocument} doc - the document state of the pass.
     * @returns {void}
     */
    constructor(doc) { this.doc = doc; this.widths = []; }

    /**
     * Returns a TeX length as CSS. Widths relative to the line (\linewidth, 0.5\textwidth) become
     * pixels: a percentage would shrink with a box as wide as its content (\colorbox, \fbox, a cell).
     * @param {string} tex - the TeX length.
     * @returns {?string} the CSS length, "fill", or null.
     */
    getLength(tex) {
        const css = getCssLength(tex, this.doc);
        if (!css || !css.endsWith('%')) return css;
        const textW = this.doc.getTextWidth();
        const base = /\\(textwidth|hsize)\b/.test(tex) ? textW : (this.widths.length ? this.widths[this.widths.length - 1] : this.doc.getLineWidth());
        return +(parseFloat(css) / 100 * base).toFixed(2) + 'px';
    }

    /**
     * Runs a render at a line width, so relative widths inside it refer to that width.
     * @param {?string} width - the width as CSS; only a pixel width changes the line width.
     * @param {function(): *} render - the render to run.
     * @returns {*} what the render returns.
     */
    runAtWidth(width, render) {
        const px = width && width.endsWith('px') ? parseFloat(width) : null;
        if (px == null) return render();
        this.widths.push(px);
        try { return render(); } finally { this.widths.pop(); }
    }

    /**
     * Renders a scanner's range into a new flow.
     * @param {Scanner} scan - the scanner over the range.
     * @param {string} mode - "block" or "inline".
     * @param {object} [context={}] - the context of the new flow (top, float, listDepth, noindent …).
     * @returns {(string|Block[])} the HTML in inline mode, the blocks in block mode.
     */
    renderRange(scan, mode, context = {}) {
        const flow = new Flow(this.doc, mode, context);
        flow.stack.push(scan);
        this.renderStack(flow);
        flow.closeAll();
        return flow.getResult();
    }

    /**
     * Renders a range of a scanner's text as inline HTML.
     * @param {Scanner} scan - the scanner the range belongs to.
     * @param {?Range} range - the range of the text, or null.
     * @param {object} [context={}] - the context of the new flow (top, float, listDepth, noindent …).
     * @returns {string} the HTML, empty for no range.
     */
    renderInline(scan, range, context = {}) { return range ? this.renderRange(createScanner(scan.s, range.a, range.b, scan.v), 'inline', context) : ''; }

    /**
     * Renders a range of a scanner's text as blocks.
     * @param {Scanner} scan - the scanner the range belongs to.
     * @param {Range} range - the range of the text.
     * @param {object} [context={}] - the context of the new flow (top, float, listDepth, noindent …).
     * @returns {Block[]} the blocks.
     */
    renderBlocks(scan, range, context = {}) { return this.renderRange(createScanner(scan.s, range.a, range.b, scan.v), 'block', context); }

    /**
     * Renders a range of a scanner's text as blocks and joins their HTML.
     * @param {Scanner} scan - the scanner the range belongs to.
     * @param {Range} range - the range of the text.
     * @param {object} [context={}] - the context of the new flow (top, float, listDepth, noindent …).
     * @returns {string} the HTML of the blocks.
     */
    renderBlockHtml(scan, range, context = {}) { return this.renderBlocks(scan, range, context).map(b => b.html).join(''); }

    /**
     * Returns the text of a range as it is written (for names, keys, colors, lengths).
     * @param {Scanner} scan - the scanner the range belongs to.
     * @param {?Range} range - the range of the text, or null.
     * @returns {string} the text, empty for no range.
     */
    getRawText(scan, range) { return range ? scan.s.slice(range.a, range.b) : ''; }

    /**
     * Reads the scanners on the flow's stack until all are done: comments, spaces and blank lines,
     * groups, math, special characters, commands and plain text. Plain text of the code itself goes
     * in as editable source text.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    renderStack(flow) {
        const doc = this.doc;
        while (flow.stack.length) {
            const scan = flow.stack[flow.stack.length - 1];
            if (scan.marker) { flow.stack.pop(); scan.marker(flow); continue; }
            if (scan.i >= scan.end) { flow.stack.pop(); continue; }
            const s = scan.s, i = scan.i, c = s[i];
            if (c === '%') {
                const n = s.indexOf('\n', i);
                scan.i = n < 0 || n >= scan.end ? scan.end : n + 1;
                while (scan.i < scan.end && (s[scan.i] === ' ' || s[scan.i] === '\t')) scan.i++;
                continue;
            }
            if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                let k = i, nl = 0;
                while (k < scan.end && /\s/.test(s[k])) { if (s[k] === '\n') nl++; k++; }
                scan.i = k;
                if (nl >= 2) flow.closeParagraph(); else flow.addSpace();
                continue;
            }
            const templateTag = findTemplateTagAt(s, i, doc.templateSyntax);
            if (templateTag && templateTag.end <= scan.end) { this.renderTemplateTag(flow, scan, templateTag); continue; }
            if (c === '{') { scan.i++; flow.openGroup(); continue; }
            if (c === '}') {
                scan.i++;
                if (!flow.closeGroup()) doc.addProblem(getPosition(scan, i), 'Extra } - there is no { that it closes', 'error');
                continue;
            }
            if (c === '$') { this.renderDollarMath(flow, scan); continue; }
            if (c === '~') { scan.i++; flow.addHtml('\u00a0', getPosition(scan, i)); continue; }
            if (c === '&') {
                scan.i++;
                doc.addProblem(getPosition(scan, i), 'Misplaced & - it only separates the columns of a table (tabular) or an align', 'error');
                continue;
            }
            if (c === '#') { scan.i++; doc.addProblem(getPosition(scan, i), 'A lone # - write \\# for the character #', 'error'); flow.addHtml('#', getPosition(scan, i)); continue; }
            if (c === '^' || c === '_') {
                scan.i++;
                doc.addProblem(getPosition(scan, i), `${c} only works in math - write $x${c}2$, or \\${c === '_' ? '_' : 'textasciicircum'} for the character`, 'error');
                continue;
            }
            if (c === '\\') { this.renderCommand(flow, scan); continue; }
            // Plain text up to the next special character.
            let k = i;
            while (k < scan.end && !'\\{}$%&~#^_ \t\n\r'.includes(s[k]) && !findTemplateTagAt(s, k, doc.templateSyntax)) k++;
            if (k === i) k++;
            scan.i = k;
            const t = s.slice(i, k), shown = this.getShownText(t);
            if (scan.v < 0 && s === doc.src && shown.length === t.length) flow.addSourceText(escapeHtml(shown), i, t.length, s);
            else flow.addHtml(escapeHtml(shown), getPosition(scan, i));
        }
    }

    /**
     * Renders a template placeholder (a page's server replaces it before LaTeX runs) as one small
     * box with its sign and name.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner at the tag; moved past it.
     * @param {import('./latex-template.js').TemplateTag} tag - the tag.
     * @returns {void}
     */
    renderTemplateTag(flow, scan, tag) {
        scan.i = tag.end;
        const pos = getPosition(scan, tag.start);
        const className = tag.kind === 'value' ? 'template-tag' : 'template-tag template-section';
        flow.addHtml(`<span class="${className}" data-p="${pos}">${escapeHtml(formatTemplateTagLabel(tag))}</span>`, pos);
    }

    /**
     * Returns plain text as TeX shows it: ligatures for dashes and quotes, and with ngerman the
     * shorthands "a, "s, "` and the like.
     * @param {string} text - the text as written.
     * @returns {string} the text as shown.
     */
    getShownText(text) {
        if (this.doc.meta.ngerman && text.includes('"')) {
            text = text.replace(/"([aouAOU])/g, (m, v) => ({ a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' }[v]))
                .replace(/"s/g, 'ß').replace(/"`/g, '„').replace(/"'/g, '“').replace(/"[-=~|]/g, m => (m === '"~' ? '-' : '')).replace(/"</g, '«').replace(/">/g, '»');
        }
        return (text.replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”').replace(/`/g, '‘')
            .replace(/'/g, '’').replace(/\?`/g, '¿').replace(/!`/g, '¡').replace(/,,/g, '„').replace(/<</g, '«').replace(/>>/g, '»'));
    }

    /**
     * Moves the scanner past spaces and comments; a blank line ends the arguments and stays.
     * @param {Scanner} scan - the scanner.
     * @param {boolean} [newlines=true] - true to skip line breaks too.
     * @returns {void}
     */
    moveOverSpace(scan, newlines = true) {
        const s = scan.s;
        for (;;) {
            while (scan.i < scan.end && (s[scan.i] === ' ' || s[scan.i] === '\t' || (newlines && (s[scan.i] === '\n' || s[scan.i] === '\r')))) {
                if (s[scan.i] === '\n' && /^\n[ \t]*\n/.test(s.slice(scan.i, scan.i + 40))) return;   // a blank line ends arguments
                scan.i++;
            }
            if (s[scan.i] === '%' && newlines) {
                const n = s.indexOf('\n', scan.i);
                scan.i = n < 0 || n >= scan.end ? scan.end : n + 1;
                continue;
            }
            return;
        }
    }

    /**
     * Reads a mandatory argument: {…} or a single token. A missing argument or an open brace is
     * reported (the reader collects problems as it reads).
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {string} [name=''] - the command name, for the problem.
     * @returns {?Range} the range of the argument's content, or null when there is none.
     */
    readArgument(scan, name = '') {
        this.moveOverSpace(scan);
        const s = scan.s;
        if (scan.i >= scan.end) { this.doc.addProblem(getPosition(scan, scan.i), `\\${name} needs an argument in { }`, 'error'); return null; }
        if (s[scan.i] === '{') {
            const j = findClosingBrace(s, scan.i, scan.end);
            if (j < 0) {
                this.doc.addProblem(getPosition(scan, scan.i), `The { after \\${name} is never closed - a } is missing`, 'error');
                const r = { a: scan.i + 1, b: scan.end };
                scan.i = scan.end;
                return r;
            }
            const r = { a: scan.i + 1, b: j };
            scan.i = j + 1;
            return r;
        }
        if (s[scan.i] === '}') { this.doc.addProblem(getPosition(scan, scan.i), `\\${name} needs an argument in { }`, 'error'); return null; }
        if (s[scan.i] === '\\') {
            let k = scan.i + 1;
            if (LETTER.test(s[k] || '')) while (k < scan.end && LETTER.test(s[k])) k++; else k++;
            const r = { a: scan.i, b: k };
            scan.i = k;
            return r;
        }
        const r = { a: scan.i, b: scan.i + 1 };
        scan.i++;
        return r;
    }

    /**
     * Reads an optional argument […], if there is one.
     * @param {Scanner} scan - the scanner, after the command name.
     * @returns {?Range} the range inside the brackets, or null.
     */
    readOption(scan) {
        const save = scan.i;
        this.moveOverSpace(scan, false);
        if (scan.s[scan.i] !== '[') { scan.i = save; return null; }
        const j = findClosingBracket(scan.s, scan.i, scan.end);
        if (j < 0) { scan.i = save; return null; }
        const r = { a: scan.i + 1, b: j };
        scan.i = j + 1;
        return r;
    }

    /**
     * Reads the star of a starred command, if there is one.
     * @param {Scanner} scan - the scanner, after the command name.
     * @returns {boolean} true when a star was read.
     */
    readStar(scan) { if (scan.s[scan.i] === '*') { scan.i++; return true; } return false; }

    /**
     * Makes a number the one the next \label refers to.
     * @param {(string|number)} num - the number.
     * @param {string} kind - what is numbered (section, equation …).
     * @returns {void}
     */
    setTarget(num, kind) { this.doc.target = { num: String(num), kind, id: '' }; }

    /**
     * Renders a \label: records the label for the current target and returns its anchor.
     * @param {string} name - the label's name.
     * @param {number} pos - the offset of the \label in the code.
     * @returns {string} the HTML of the anchor.
     */
    renderLabel(name, pos) {
        const doc = this.doc;
        if (doc.labels[name]) doc.addProblem(pos, `The label "${name}" is used twice`, 'warning');
        const id = 'lbl-' + (++doc.anchorId);
        doc.labels[name] = { num: doc.target.num, kind: doc.target.kind, id, pos };
        return `<span id="${id}" class="anchor" data-label="${escapeHtml(name)}"></span>`;
    }

    /**
     * Returns the number a label refers to, from the first pass; in the second pass a missing
     * label is reported.
     * @param {string} name - the label's name.
     * @param {number} pos - the offset in the code to report.
     * @returns {string} the number, or "??".
     */
    getReferenceText(name, pos) {
        const l = (this.doc.prev?.labels || {})[name] || this.doc.labels[name];
        if (!l) {
            if (this.doc.prev) this.doc.addProblem(pos, `Reference to "${name}" which has no \\label{${name}}`, 'warning');
            return '??';
        }
        return l.num || '??';
    }

    /**
     * Renders the command at the scanner: a macro of the document, a symbol, a command of the
     * tables, a font or size command, a heading; an unknown one is reported and its argument shown.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner at the backslash.
     * @returns {void}
     */
    renderCommand(flow, scan) {
        const doc = this.doc, s = scan.s, i = scan.i;
        let k = i + 1;
        if (k >= scan.end) { scan.i = k; return; }
        let name;
        if (LETTER.test(s[k])) { while (k < scan.end && LETTER.test(s[k])) k++; name = s.slice(i + 1, k); } else { name = s[k]; k++; }
        scan.i = k;
        const pos = getPosition(scan, i);
        const letters = LETTER.test(name[0]);
        if (letters) moveOverControlWordSpace(scan);
        const macro = doc.macros.get(name);
        if (macro) { this.expandMacro(flow, scan, macro, pos, name); return; }
        if (!letters) { this.renderSymbolCommand(flow, scan, name, pos); return; }
        const handler = COMMANDS[name];
        if (handler) { handler.call(this, flow, scan, pos, name); return; }
        if (name in SYMBOLS && SYMBOLS[name] != null) { flow.addHtml(SYMBOLS[name], pos); return; }
        if (name in SPACES && SPACES[name] != null) { flow.addHtml(SPACES[name], pos); return; }
        if (FONT_COMMANDS[name]) { this.renderFontCommand(flow, scan, FONT_COMMANDS[name], pos, name); return; }
        if (FONT_DECLARATIONS[name]) { this.addFontDeclaration(flow, FONT_DECLARATIONS[name]); return; }
        if (SIZE_NAMES.includes(name)) { this.addSizeDeclaration(flow, name); return; }
        if (name in SECTION_LEVELS) { this.renderSection(flow, scan, name, pos); return; }
        // Unknown: report it and show what is in its arguments.
        doc.addProblem(pos, `Unknown command \\${name} - the preview ignores it`, 'warning', 'cmd:' + name);
        this.readOption(scan);
        const save = scan.i;
        this.moveOverSpace(scan, false);
        if (scan.s[scan.i] === '{') {
            const r = this.readArgument(scan, name);
            flow.addHtml(`<span class="unknown" data-p="${pos}" title="\\${escapeHtml(name)} is not supported in the preview">${this.renderInline(scan, r)}</span>`, pos);
        } else scan.i = save;
    }

    /**
     * Renders a command of one non-letter: \\, escaped characters, accents, spaces, \( \) and \[ \].
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {string} name - the character after the backslash.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderSymbolCommand(flow, scan, name, pos) {
        const doc = this.doc;
        if (name === '\\') {
            this.readStar(scan);
            const o = this.readOption(scan);
            const extra = o ? this.getLength(this.getRawText(scan, o)) : null;
            flow.addHtml(extra ? `<br><span class="vsp" style="height:${extra}"></span>` : '<br>', pos);
            return;
        }
        if (name in ESCAPED) { flow.addHtml(ESCAPED[name], pos); return; }
        if (name in ACCENTS) { this.renderAccent(flow, scan, name, pos); return; }
        if (name in SPACES) { flow.addHtml(SPACES[name], pos); return; }
        if (name === '(') {
            const e = scan.s.indexOf('\\)', scan.i);
            if (e < 0 || e > scan.end) { doc.addProblem(pos, '\\( is never closed with \\)', 'error'); scan.i = scan.end; return; }
            flow.addHtml(this.renderMath(scan.s.slice(scan.i, e), false, pos), pos);
            scan.i = e + 2;
            return;
        }
        if (name === '[') {
            const e = scan.s.indexOf('\\]', scan.i);
            if (e < 0 || e > scan.end) { doc.addProblem(pos, '\\[ is never closed with \\]', 'error'); scan.i = scan.end; return; }
            this.renderDisplayMath(flow, scan.s.slice(scan.i, e), pos, false);
            scan.i = e + 2;
            return;
        }
        if (name === ')' || name === ']') { doc.addProblem(pos, `\\${name} without the opening \\${name === ')' ? '(' : '['}`, 'error'); return; }
        if (name === '-') return;
        if (name === '|') { flow.addHtml('‖', pos); return; }
        if (name === '\n' || name === ' ' || name === '\t') { flow.addHtml(' ', pos); return; }
        doc.addProblem(pos, `Unknown command \\${name}`, 'warning', 'cmd:' + name);
    }

    /**
     * Renders an accent on the character of its argument.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {string} name - the accent command (" ' ` ^ ~ = . u v H c k r d b t).
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderAccent(flow, scan, name, pos) {
        const r = this.readArgument(scan, name);
        let base = r ? this.getRawText(scan, r) : '';
        base = base.replace(/^\\i$/, 'ı').replace(/^\\j$/, 'ȷ').replace(/^\\([a-zA-Z]+)$/, (mm, n) => SYMBOLS[n] || '');
        flow.addHtml(escapeHtml((base.charAt(0) + ACCENTS[name] + base.slice(1)).normalize('NFC')), pos);
    }

    /**
     * Expands a macro of the document: its arguments go into the body, which is read on the spot.
     * A macro that calls itself without end is reported and stops.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {Macro} macro - the macro.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the macro's name.
     * @returns {void}
     */
    expandMacro(flow, scan, macro, pos, name) {
        const doc = this.doc;
        if (++doc.expansions > 20000 || flow.stack.length > 60) {
            doc.addProblem(pos, `\\${name} calls itself without end - the preview stops expanding it`, 'error', 'loop:' + name);
            return;
        }
        const args = [];
        for (let n = 0; n < macro.n; n++) {
            if (n === 0 && macro.def != null) {
                const o = this.readOption(scan);
                args.push(o ? this.getRawText(scan, o) : macro.def);
                continue;
            }
            const r = this.readArgument(scan, name);
            args.push(r ? this.getRawText(scan, r) : '');
        }
        const body = macro.body.replace(/#(\d)/g, (x, n) => args[n - 1] ?? '');
        flow.stack.push(createScanner(body, 0, body.length, pos));
    }

    /**
     * Renders a font command with an argument (\textbf{…}); \emph inside italics is upright.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {string} kind - the class suffix of the style.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    renderFontCommand(flow, scan, kind, pos, name) {
        const r = this.readArgument(scan, name);
        const inner = this.renderInline(scan, r);
        const tag = kind === 'sup' ? 'sup' : kind === 'sub' ? 'sub' : 'span';
        let cls = 'f-' + kind;
        if (kind === 'em' && flow.decls.some(x => /f-(it|em)/.test(x.open))) cls = 'f-up';
        flow.addHtml(`<${tag} class="${cls}">${inner}</${tag}>`, pos);
    }

    /**
     * Adds a font declaration (\bfseries …) for the rest of the group; \em inside italics is upright.
     * @param {Flow} flow - the flow to write into.
     * @param {string} kind - the class suffix of the style.
     * @returns {void}
     */
    addFontDeclaration(flow, kind) {
        if (kind === 'em' && flow.decls.some(x => /f-(it|em)/.test(x.open))) kind = 'up';
        flow.addDeclaration(`<span class="dk f-${kind}">`, '</span>');
    }

    /**
     * Adds a size declaration (\small …) for the rest of the group.
     * @param {Flow} flow - the flow to write into.
     * @param {string} name - the size command.
     * @returns {void}
     */
    addSizeDeclaration(flow, name) {
        const pt = this.doc.getSizePoints(name);
        flow.addDeclaration(`<span class="dk fs" style="font-size:${(pt / this.doc.meta.fs).toFixed(4)}em;line-height:1.2">`, '</span>');
        flow.sizeName = name;
    }

    /**
     * Renders a sectioning command: counts and numbers it, adds it to the outline and writes the
     * heading (\paragraph and \subparagraph run into their paragraph).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {string} name - the sectioning command.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderSection(flow, scan, name, pos) {
        const doc = this.doc;
        const star = this.readStar(scan);
        const short = this.readOption(scan);
        const range = this.readArgument(scan, name);
        const level = SECTION_LEVELS[name];
        const isBook = /report|book|scrreprt|scrbook/.test(doc.meta.cls);
        let num = '';
        if (!star && level <= doc.meta.secnumdepth && !(level === 0 && !isBook)) {
            this.updateSectionCounter(name, level, isBook);
            num = this.getSectionNumber(name, isBook);
            this.setTarget(num, name);
        }
        const title = this.renderInline(scan, range);
        const id = 'sec-' + (++doc.secId);
        doc.target.id = id;
        if (!star || flow.ctx.top) {
            const plain = title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
            doc.outline.push({ level, num, title: short ? this.renderInline(scan, short).replace(/<[^>]+>/g, '') : plain, pos, id, star, html: title });
        }
        const tag = level <= 0 ? 'h1' : level === 1 ? 'h2' : level === 2 ? 'h3' : level === 3 ? 'h4' : 'h5';
        const n = num ? `<span class="num">${num}</span>` : '';
        if (level === 4 || level === 5) {
            // \paragraph is run-in: the heading starts the next paragraph.
            flow.closeParagraph();
            flow.addHtml(`<b class="runin lv${level}" id="${id}" data-p="${pos}">${n}${title}</b>\u2003`, pos);
            flow.para.noindent = true;
            return;
        }
        let html;
        if (level === 0 && isBook) {
            html = `<h1 class="chapter" id="${id}" data-p="${pos}">${num ? `<span class="chapter-num">${doc.getWord('chapter')} ${num}</span>` : ''}<span class="chapter-title">${title}</span></h1>`;
            flow.addBlock(html, pos, 'h', { breakBefore: true, keep: true, level });
        } else if (level === -1) {
            html = `<h1 class="part" id="${id}" data-p="${pos}">${num ? `<span class="chapter-num">${doc.getWord('part')} ${num}</span>` : ''}<span class="chapter-title">${title}</span></h1>`;
            flow.addBlock(html, pos, 'h', { breakBefore: true, breakAfter: isBook, keep: true, level });
        } else {
            html = `<${tag} class="lv${level}" id="${id}" data-p="${pos}">${n}${title}</${tag}>`;
            flow.addBlock(html, pos, 'h', { keep: true, level });
        }
        flow.noindent = true;
    }

    /**
     * Steps the counter of a sectioning command and resets the counters below it; a chapter
     * also resets the equation, figure and table numbers.
     * @param {string} name - the sectioning command.
     * @param {number} level - its level.
     * @param {boolean} isBook - true for classes with chapters.
     * @returns {void}
     */
    updateSectionCounter(name, level, isBook) {
        const counters = this.doc.counters;
        counters[name]++;
        for (const lower of SECTION_ORDER.slice(SECTION_ORDER.indexOf(name) + 1)) if (lower !== 'part') counters[lower] = 0;
        if (level === 0 && isBook) { counters.equation = 0; counters.figure = 0; counters.table = 0; }
    }

    /**
     * Returns the number of a sectioning command from the counters: roman for \part, a letter in
     * the appendix, else the numbers of the levels joined with dots (from the chapter in classes
     * with chapters, from the section in the others).
     * @param {string} name - the sectioning command.
     * @param {boolean} isBook - true for classes with chapters.
     * @returns {string} the number.
     */
    getSectionNumber(name, isBook) {
        const doc = this.doc;
        if (name === 'part') return formatRoman(doc.counters.part).toUpperCase();
        if (doc.appendix && (name === (isBook ? 'chapter' : 'section'))) return String.fromCharCode(64 + doc.counters[name]);
        const parts = [];
        const start = isBook ? 1 : 2;
        for (let k = start; k <= SECTION_ORDER.indexOf(name); k++) {
            let value = doc.counters[SECTION_ORDER[k]];
            if (k === start && doc.appendix) value = String.fromCharCode(64 + value);
            parts.push(value);
        }
        return parts.join('.');
    }

    /**
     * Renders \begin{name}: finds its \end (an unclosed one is reported) and renders the environment.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderBegin(flow, scan, pos) {
        const doc = this.doc;
        const r = this.readArgument(scan, 'begin');
        if (!r) return;
        const name = this.getRawText(scan, r).trim();
        const bodyStart = scan.i;
        const e = findEnvironmentEnd(scan.s, bodyStart, scan.end, name);
        let body;
        if (!e) {
            doc.addProblem(pos, `\\begin{${name}} is never closed - add \\end{${name}}`, 'error');
            body = { a: bodyStart, b: scan.end };
            scan.i = scan.end;
        } else {
            body = { a: bodyStart, b: e.at };
            scan.i = e.after;
        }
        this.renderEnvironment(flow, scan, name, body, pos);
    }

    /**
     * Renders an environment: math, one the document defined, a theorem, one of the table;
     * an unknown one is reported and its content shown.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner the environment stands in.
     * @param {string} name - the command or environment name.
     * @param {Range} body - the range of its content.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderEnvironment(flow, scan, name, body, pos) {
        const doc = this.doc;
        const sub = createScanner(scan.s, body.a, body.b, scan.v);
        if (MATH_ENVIRONMENTS.has(name)) { this.renderMathEnvironment(flow, name, scan.s.slice(body.a, body.b), pos); return; }
        const user = doc.envs.get(name);
        if (user) {
            // An environment that begins itself (or another that does) ends like a macro that calls itself.
            if (++doc.expansions > 20000 || flow.stack.length > 240) {
                doc.addProblem(pos, `The environment ${name} begins itself without end - the preview stops expanding it`, 'error', 'loop:' + name);
                (doc.loopEnvs ||= new Set()).add(name);
                return;
            }
            // \newenvironment: begin code, the body, end code - inside one group.
            const args = [];
            for (let n = 0; n < user.n; n++) {
                if (n === 0 && user.def != null) { const o = this.readOption(sub); args.push(o ? this.getRawText(sub, o) : user.def); continue; }
                const a = this.readArgument(sub, name);
                args.push(a ? this.getRawText(sub, a) : '');
            }
            /**
             * Puts the arguments in place of #1 … #9.
             * @param {string} code - the begin or end code.
             * @returns {string} the code with the arguments.
             */
            const expandParameters = code => code.replace(/#(\d)/g, (x, n) => args[n - 1] ?? '');
            const b = expandParameters(user.begin), en = expandParameters(user.end);
            flow.openGroup();
            flow.stack.push({ marker: f => f.closeGroup() });
            flow.stack.push(createScanner(en, 0, en.length, pos));
            flow.stack.push(createScanner(sub.s, sub.i, sub.end, scan.v));
            flow.stack.push(createScanner(b, 0, b.length, pos));
            return;
        }
        if (doc.theorems.has(name)) { this.renderTheorem(flow, sub, name, pos); return; }
        const handler = ENVIRONMENTS[name] || ENVIRONMENTS[name.replace(/\*$/, '')];
        if (handler) { handler.call(this, flow, sub, pos, name); return; }
        doc.addProblem(pos, `Unknown environment ${name} - its content is shown as normal text`, 'warning', 'env:' + name);
        flow.closeParagraph();
        for (const b of this.renderBlocks(sub, { a: sub.i, b: sub.end })) flow.addFlowBlock(b);
    }

    /**
     * Renders a theorem environment of \newtheorem with its number and optional note.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {string} name - the theorem's name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderTheorem(flow, scan, name, pos) {
        const doc = this.doc, t = doc.theorems.get(name);
        const o = this.readOption(scan);
        let num = '';
        if (!t.star) {
            const key = t.shared || name;
            doc.counters['thm:' + key] = (doc.counters['thm:' + key] || 0) + 1;
            num = (t.within ? doc.counters[t.within] + '.' : '') + doc.counters['thm:' + key];
            this.setTarget(num, name);
        }
        const note = o ? ` (${this.renderInline(scan, o)})` : '';
        const inner = this.renderBlockHtml(scan, { a: scan.i, b: scan.end }, { noindent: true });
        flow.addBlock(`<div class="theorem-${t.style}" data-p="${pos}"><span class="thm-header">${escapeHtml(t.title)}${num ? ' ' + num : ''}${note}.</span> ${inner.replace(/^<div class="p( ni)?"/, '<div class="p ni inl"')}</div>`, pos);
        flow.noindent = true;
    }

    /**
     * Returns the handler of a command of the tables.
     * @param {string} name - the command name.
     * @returns {?CommandHandler} the handler, or undefined.
     */
    getCommand(name) { return COMMANDS[name]; }
}

Object.assign(Renderer.prototype, MATH_METHODS, TABLE_METHODS, BLOCK_METHODS, ALGORITHM_METHODS, ENVIRONMENT_METHODS,
    PAGE_METHODS, DEFINITION_METHODS, PREAMBLE_METHODS);

/**
 * Moves the scanner past the spaces after a control word, and past one line break with the
 * spaces after it, unless a blank line follows.
 * @param {Scanner} scan - the scanner after the control word.
 * @returns {void}
 */
function moveOverControlWordSpace(scan) {
    const text = scan.s;
    while (scan.i < scan.end && (text[scan.i] === ' ' || text[scan.i] === '\t')) scan.i++;
    if (text[scan.i] === '\n' && text[scan.i + 1] !== '\n' && !/^\n[ \t]*\n/.test(text.slice(scan.i, scan.i + 30))) {
        scan.i++;
        while (scan.i < scan.end && (text[scan.i] === ' ' || text[scan.i] === '\t')) scan.i++;
    }
}

/** Commands that need a second pass: references, citations and the lists of contents. */
const NEEDS_SECOND_PASS = /\\(ref|eqref|pageref|autoref|cref|Cref|cite\w*|tableofcontents|listoffigures|listoftables|nameref|vref)\b/;
/** Words that make a document without babel German for hyphenation, and how many it takes. */
const GERMAN_WORDS = /[äöüÄÖÜß]|\\"[aouAOU]|\b(und|der|die|das|nicht|mit)\b/g;
const GERMAN_WORD_COUNT = 6;

/**
 * Reads the code once: the preamble, the page layout and the body.
 * @param {string} source - the LaTeX code.
 * @param {RenderOptions} options - the pictures of the document and the result of a previous pass.
 * @returns {{doc: TexDocument, blocks: Block[]}} the document state and the blocks of the body.
 */
function renderPass(source, options) {
    const doc = new TexDocument(source, options);
    doc.mathOps = {};
    doc.templateSyntax = getTemplateSyntax(options.template);
    const renderer = new Renderer(doc);
    const { bodyStart, bodyEnd } = readDocumentParts(renderer, source);
    doc.updateLayout();
    // Without babel the words of LaTeX stay English, but German text still needs German hyphenation.
    const body = source.slice(bodyStart, bodyEnd);
    doc.meta.hyphLang = doc.meta.ngerman || (body.match(GERMAN_WORDS) || []).length > GERMAN_WORD_COUNT ? 'de' : 'en';
    const blocks = renderer.renderRange(createScanner(source, bodyStart, bodyEnd), 'block', { top: true });
    // Footnotes that came after the last block go onto it.
    if (doc.notes.length && blocks.length) { blocks[blocks.length - 1].notes = (blocks[blocks.length - 1].notes || []).concat(doc.notes); doc.notes = []; }
    return { doc, blocks };
}

/**
 * Reads the preamble and finds the body. A code without \begin{document} is a fragment: all of
 * it is body text; with \documentclass but no \begin{document} there is no body. Problems
 * around the body are reported.
 * @param {Renderer} renderer - the renderer of the pass.
 * @param {string} source - the LaTeX code.
 * @returns {{bodyStart: number, bodyEnd: number}} where the body starts and ends.
 */
function readDocumentParts(renderer, source) {
    const doc = renderer.doc;
    const scan = createScanner(source, 0, source.length);
    let bodyStart = 0, bodyEnd = source.length;
    if (/\\begin\s*\{document\}/.test(source)) {
        const start = renderer.readPreamble(scan);
        bodyStart = start ? start.a : source.length;
        const end = findEnvironmentEnd(source, bodyStart, source.length, 'document');
        if (end) {
            bodyEnd = end.at;
            const after = source.slice(end.after).replace(/%.*$/gm, '').trim();
            if (after) doc.addProblem(end.after, 'Text after \\end{document} is ignored', 'warning');
        } else doc.addProblem(bodyStart, '\\begin{document} is never closed - add \\end{document} at the end', 'error');
    } else if (/\\documentclass/.test(source)) {
        doc.addProblem(source.search(/\\documentclass/), 'There is no \\begin{document} - add \\begin{document} … \\end{document}', 'error');
        renderer.readPreamble(scan);
        bodyStart = source.length;
    }
    return { bodyStart, bodyEnd };
}

/**
 * Renders LaTeX code; documents with references, citations or a table of contents are read a
 * second time with the labels, outline and captions of the first pass. With a template syntax,
 * the sections of the placeholders are checked as well.
 * @param {string} source - the LaTeX code.
 * @param {RenderOptions} [options={}] - the pictures of the document (data URIs by name) and the template syntax of its placeholders.
 * @returns {RenderResult} the blocks, page settings, outline, labels, problems and captions.
 */
export function render(source, options = {}) {
    let { doc, blocks } = renderPass(source, options);
    if (NEEDS_SECOND_PASS.test(source)) {
        const first = { labels: doc.labels, outline: doc.outline, captions: doc.captions || [] };
        ({ doc, blocks } = renderPass(source, { ...options, prev: first }));
    }
    // An environment that begins itself leaves its \begin / \end unmatched at every level: only the loop is reported.
    if (doc.loopEnvs) {
        const noise = new Set([...doc.loopEnvs].flatMap(name => [`\\begin{${name}} is never closed - add \\end{${name}}`, `\\end{${name}} without a matching \\begin{${name}}`]));
        doc.problems = doc.problems.filter(problem => !noise.has(problem.msg));
    }
    if (doc.templateSyntax) for (const problem of checkTemplateSections(source, doc.templateSyntax)) doc.addProblem(problem.pos, problem.msg, problem.kind);
    doc.problems.sort((first, second) => first.pos - second.pos);
    return { blocks, meta: doc.meta, outline: doc.outline, labels: doc.labels, problems: doc.problems, captions: doc.captions || [] };
}

/**
 * Returns the plain text of rendered blocks (for the .txt export): math as its text, line
 * breaks, list items and table rows on lines of their own, cells separated by tabs.
 * @param {Block[]} blocks - the blocks of render().
 * @returns {string} the text, paragraphs separated by blank lines.
 */
export function getPlainText(blocks) {
    const box = document.createElement('div');
    return blocks.map(block => getBlockText(block, box)).filter(Boolean).join('\n\n') + '\n';
}

/**
 * Returns the plain text of one rendered block, read through a scratch element.
 * @param {Block} block - a block of render().
 * @param {HTMLElement} box - a detached element; each call overwrites its content.
 * @returns {string} the text, without spaces at its ends.
 */
function getBlockText(block, box) {
    box.innerHTML = block.html.replace(/<annotation[\s\S]*?<\/annotation>/g, '').replace(/<span class="katex-html"[\s\S]*?<\/span><\/span><\/span>/g, '');
    box.querySelectorAll('.katex-mathml').forEach(element => element.replaceWith(element.textContent));
    box.querySelectorAll('br').forEach(element => element.replaceWith('\n'));
    box.querySelectorAll('li, tr, div.p, h1, h2, h3, h4, h5, div.dl-item, .code-line').forEach(element => element.append('\n'));
    box.querySelectorAll('td').forEach(element => element.append('\t'));
    return box.textContent.replace(/[ \t]+\n/g, '\n').trim();
}
