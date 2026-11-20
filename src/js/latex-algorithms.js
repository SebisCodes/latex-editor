/**
 * Algorithms of the LaTeX reader: algorithm2e (\While{…}{…}, \eIf, \KwIn, \; …) and algpseudocode
 * (\State, \If … \EndIf …), drawn as indented lines with bold keywords.
 */

import { LETTER, createScanner, getPosition, findClosingBrace, findClosingBracket } from './latex-scan.js?v=2';

/**
 * Returns a keyword of an algorithm in bold.
 * @param {string} word - the keyword.
 * @returns {string} the keyword's HTML.
 */
const formatKeyword = word => `<b class="algo-kw">${word}</b>`;

/** The commands that start a line of algpseudocode. */
const ALGORITHMIC_LINE = /(?=\\(?:State|Statex|If|ElsIf|Else|EndIf|For|ForAll|EndFor|While|EndWhile|Repeat|Until|Loop|EndLoop|Procedure|EndProcedure|Function|EndFunction|Require|Ensure|Return|Comment)\b)/;

/** The block commands of algorithm2e. */
const ALGORITHM_BLOCKS = /^(While|For|ForEach|ForAll|Repeat|If|uIf|eIf|ElseIf|uElseIf|Else|uElse)$/;
/** The loop commands of algorithm2e and their keyword. */
const LOOP_WORDS = { While: 'while', For: 'for', ForEach: 'foreach', ForAll: 'forall', Repeat: 'repeat' };
/** The field commands of algorithm2e (\KwIn{…} …) and their keyword. */
const ALGORITHM_FIELDS = { KwData: 'Data:', KwIn: 'Input:', KwOut: 'Output:', KwResult: 'Result:', KwRet: 'return', Return: 'return', KwTo: 'to', Input: 'Input:', Output: 'Output:' };

/**
 * The lines of an algorithm2e algorithm while they are read.
 * @typedef {object} AlgorithmLines
 * @property {string[]} out - the finished lines and blocks as HTML.
 * @property {string} current - the line being written.
 * @property {string} caption - the caption's HTML.
 */

/**
 * Ends the current line and adds it, unless it is empty.
 * @param {AlgorithmLines} lines - the lines so far.
 * @returns {void}
 */
function addAlgorithmLine(lines) {
    if (lines.current.trim()) lines.out.push(`<div class="algo-line">${lines.current.trim()}</div>`);
    lines.current = '';
}

/** The renderer methods of this part, mixed into Renderer (latex.js). */
export const ALGORITHM_METHODS = {
    /**
     * Renders an algorithm2e algorithm as a float.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderAlgorithm(flow, scan, pos) {
        this.readOption(scan);
        const inner = this.renderAlgorithmLines(scan, { a: scan.i, b: scan.end }, this.doc.meta.ngerman);
        flow.addBlock(`<figure class="float algorithm" data-p="${pos}"><div class="algo">${inner.html}</div>${inner.caption}</figure>`, pos, 'float');
    },

    /**
     * Renders algorithm2e lines: \While, \For, \If, \eIf, \KwIn …, \; ends a line.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner of the algorithm.
     * @param {Range} range - the range of the lines.
     * @param {boolean} isGerman - the document is German (passed on to nested blocks).
     * @returns {{html: string, caption: string}} the lines and the caption.
     */
    renderAlgorithmLines(scan, range, isGerman) {
        const text = scan.s;
        const lines = { out: [], current: '', caption: '' };
        const sub = createScanner(text, range.a, range.b, scan.v);
        while (sub.i < sub.end) {
            const character = text[sub.i];
            if (character === '\\') { this.renderAlgorithmCommand(lines, scan, sub, isGerman); continue; }
            if (character === '{') { const close = findClosingBrace(text, sub.i, sub.end); const end = close < 0 ? sub.end : close; lines.current += this.renderInline(sub, { a: sub.i + 1, b: end }); sub.i = end + 1; continue; }
            if (character === '%') { const lineEnd = text.indexOf('\n', sub.i); sub.i = lineEnd < 0 ? sub.end : lineEnd + 1; continue; }
            let k = sub.i;
            while (k < sub.end && text[k] !== '\\' && text[k] !== '{' && text[k] !== '%') k++;
            lines.current += this.renderInline(sub, { a: sub.i, b: k });
            sub.i = k;
        }
        addAlgorithmLine(lines);
        return { html: lines.out.join(''), caption: lines.caption };
    },

    /**
     * Renders the algorithm2e command at the scanner into the lines: \; ends a line, blocks,
     * \KwIn and the like, \caption, \label, settings (read and dropped), comments; any other
     * command goes through the normal renderer with its arguments.
     * @this {Renderer}
     * @param {AlgorithmLines} lines - the lines so far.
     * @param {Scanner} scan - the scanner of the algorithm (for positions).
     * @param {Scanner} sub - the scanner over the lines, at the backslash.
     * @param {boolean} isGerman - the document is German.
     * @returns {void}
     */
    renderAlgorithmCommand(lines, scan, sub, isGerman) {
        const text = sub.s;
        const match = /^\\([A-Za-z]+)/.exec(text.slice(sub.i, sub.i + 30));
        const name = match ? match[1] : text[sub.i + 1];
        if (!match && text[sub.i + 1] === ';') { sub.i += 2; addAlgorithmLine(lines); return; }
        const before = sub.i;
        sub.i += 1 + name.length;
        if (ALGORITHM_BLOCKS.test(name)) { this.renderAlgorithmBlock(lines, scan, sub, name, isGerman); return; }
        if (Object.hasOwn(ALGORITHM_FIELDS, name)) {
            addAlgorithmLine(lines);
            const argument = this.readArgument(sub, name);
            lines.current = `${formatKeyword(ALGORITHM_FIELDS[name])} ${this.renderInline(sub, argument)}`;
            if (/^(KwData|KwIn|KwOut|KwResult|Input|Output)$/.test(name)) addAlgorithmLine(lines);
        } else if (name === 'caption') {
            const argument = this.readArgument(sub, name);
            this.doc.counters.algorithm++;
            lines.caption = `<div class="caption algo-cap"><span class="cap-header">${this.doc.getWord('algorithm')} ${this.doc.counters.algorithm}:</span> ${this.renderInline(sub, argument)}</div>`;
        } else if (name === 'label') {
            const argument = this.readArgument(sub, name);
            this.setTarget(this.doc.counters.algorithm + 1, 'algorithm');
            this.renderLabel(this.getRawText(sub, argument).trim(), getPosition(scan, before));
        } else if (/^(SetAlgoLined|DontPrintSemicolon|LinesNumbered|SetKwInOut|SetKwData|SetKwFunction|SetAlgoNoLine|SetKw|SetKwProg)$/.test(name)) {
            if (/^SetKw/.test(name)) { this.readArgument(sub, name); if (name !== 'SetKwData') this.readArgument(sub, name); if (name === 'SetKwProg') { this.readArgument(sub, name); this.readArgument(sub, name); } }
        } else if (/^(tcc|tcp)$/.test(name)) {
            const argument = this.readArgument(sub, name);
            lines.current += ` <span class="algo-comment">/* ${this.renderInline(sub, argument)} */</span>`;
        } else {
            sub.i = before;
            const end = this.findTokenEnd(text, sub.i, sub.end);
            lines.current += this.renderInline(sub, { a: sub.i, b: end });
            sub.i = end;
        }
    },

    /**
     * Renders an algorithm2e block command (\While, \For, \If, \eIf, \ElseIf, \Else and the u-forms):
     * its head line, its body indented and its end line.
     * @this {Renderer}
     * @param {AlgorithmLines} lines - the lines so far.
     * @param {Scanner} scan - the scanner of the algorithm.
     * @param {Scanner} sub - the scanner over the lines, after the command name.
     * @param {string} name - the command.
     * @param {boolean} isGerman - the document is German.
     * @returns {void}
     */
    renderAlgorithmBlock(lines, scan, sub, name, isGerman) {
        const condition = name === 'Else' || name === 'uElse' ? null : this.readArgument(sub, name);
        const body = this.readArgument(sub, name);
        const otherwise = name === 'eIf' ? this.readArgument(sub, name) : null;
        const conditionHtml = condition ? this.renderInline(sub, condition) : '';
        if (LOOP_WORDS[name]) {
            this.addAlgorithmBlock(lines, scan, `${formatKeyword(LOOP_WORDS[name])} ${conditionHtml} ${formatKeyword('do')}`, body, formatKeyword('end'), isGerman);
        } else if (name === 'If' || name === 'uIf') {
            this.addAlgorithmBlock(lines, scan, `${formatKeyword('if')} ${conditionHtml} ${formatKeyword('then')}`, body, name === 'If' ? formatKeyword('end') : '', isGerman);
        } else if (name === 'eIf') {
            this.addAlgorithmBlock(lines, scan, `${formatKeyword('if')} ${conditionHtml} ${formatKeyword('then')}`, body, '', isGerman);
            this.addAlgorithmBlock(lines, scan, formatKeyword('else'), otherwise, formatKeyword('end'), isGerman);
        } else if (name === 'ElseIf' || name === 'uElseIf') {
            this.addAlgorithmBlock(lines, scan, `${formatKeyword('else if')} ${conditionHtml} ${formatKeyword('then')}`, body, name === 'ElseIf' ? formatKeyword('end') : '', isGerman);
        } else {
            this.addAlgorithmBlock(lines, scan, formatKeyword('else'), body, formatKeyword('end'), isGerman);
        }
    },

    /**
     * Ends the current line and adds a block: its head line, its body indented, an end line.
     * @this {Renderer}
     * @param {AlgorithmLines} lines - the lines so far.
     * @param {Scanner} scan - the scanner of the algorithm.
     * @param {string} head - the HTML of the head line.
     * @param {?Range} bodyRange - the range of the body.
     * @param {string} tail - the HTML of the end line, empty for none.
     * @param {boolean} isGerman - the document is German.
     * @returns {void}
     */
    addAlgorithmBlock(lines, scan, head, bodyRange, tail, isGerman) {
        addAlgorithmLine(lines);
        const block = this.renderAlgorithmLines(scan, bodyRange, isGerman);
        lines.out.push(`<div class="algo-line">${head}</div><div class="algo-block">${block.html}</div>${tail ? `<div class="algo-line">${tail}</div>` : ''}`);
    },

    /**
     * Returns where a command with its brace and bracket arguments ends.
     * @this {Renderer}
     * @param {string} text - the text.
     * @param {number} start - the index of the backslash.
     * @param {number} end - where the search stops.
     * @returns {number} the index after the command.
     */
    findTokenEnd(text, start, end) {
        let k = start + 1;
        if (LETTER.test(text[k] || '')) while (k < end && LETTER.test(text[k])) k++; else k++;
        for (;;) {
            let j = k;
            while (j < end && text[j] === ' ') j++;
            if (text[j] === '{') { const e = findClosingBrace(text, j, end); if (e < 0) return end; k = e + 1; continue; }
            if (text[j] === '[') { const e = findClosingBracket(text, j, end); if (e < 0) return k; k = e + 1; continue; }
            return k;
        }
    },

    /**
     * Renders algpseudocode lines: \State, \If … \EndIf, \For, \While, \Procedure …, indented by depth.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renderAlgorithmic(flow, scan, pos) {
        this.readOption(scan);
        const s = scan.s.slice(scan.i, scan.end);
        const lines = s.split(ALGORITHMIC_LINE);
        let depth = 0, out = '';
        for (const ln of lines) {
            const m = /^\\([A-Za-z]+)\s*/.exec(ln);
            if (!m) continue;
            let rest = ln.slice(m[0].length);
            const cmd = m[1];
            const sub = createScanner(rest, 0, rest.length, getPosition(scan, scan.i));
            /**
             * Reads the next argument of the line's command and renders it inline.
             * @returns {string} its HTML, empty when there is none.
             */
            const renderNextArgument = () => { const r = this.readArgument(sub, cmd); return r ? this.renderInline(sub, r) : ''; };
            let line = '';
            if (/^End/.test(cmd) || cmd === 'Until') depth = Math.max(0, depth - 1);
            if (cmd === 'Else' || cmd === 'ElsIf') depth = Math.max(0, depth - 1);
            if (cmd === 'If') line = `${formatKeyword('if')} ${renderNextArgument()} ${formatKeyword('then')}`;
            else if (cmd === 'ElsIf') line = `${formatKeyword('else if')} ${renderNextArgument()} ${formatKeyword('then')}`;
            else if (cmd === 'Else') line = formatKeyword('else');
            else if (cmd === 'For' || cmd === 'ForAll') line = `${formatKeyword(cmd === 'For' ? 'for' : 'for all')} ${renderNextArgument()} ${formatKeyword('do')}`;
            else if (cmd === 'While') line = `${formatKeyword('while')} ${renderNextArgument()} ${formatKeyword('do')}`;
            else if (cmd === 'Repeat') line = formatKeyword('repeat');
            else if (cmd === 'Until') line = `${formatKeyword('until')} ${renderNextArgument()}`;
            else if (cmd === 'Loop') line = formatKeyword('loop');
            else if (cmd === 'Procedure' || cmd === 'Function') { const n = renderNextArgument(); const a = renderNextArgument(); line = `${formatKeyword(cmd.toLowerCase())} <span class="f-sc">${n}</span>(${a})`; }
            else if (/^End/.test(cmd)) line = formatKeyword('end ' + cmd.slice(3).toLowerCase());
            else if (cmd === 'Require') line = formatKeyword('Require:');
            else if (cmd === 'Ensure') line = formatKeyword('Ensure:');
            else if (cmd === 'Return') line = formatKeyword('return');
            else if (cmd === 'Comment') line = `<span class="algo-comment">▷ ${renderNextArgument()}</span>`;
            rest = rest.slice(sub.i);
            const tail = this.renderInline(createScanner(rest, 0, rest.length, getPosition(scan, scan.i)), { a: 0, b: rest.length });
            out += `<div class="algo-line" style="padding-left:${depth * 1.2}em">${line} ${tail}</div>`;
            if (/^(If|ElsIf|Else|For|ForAll|While|Repeat|Loop|Procedure|Function)$/.test(cmd)) depth++;
        }
        flow.addBlock(`<div class="algo" data-p="${pos}">${out}</div>`, pos, 'algo');
    },
};
