/**
 * Code coloring of the LaTeX editor: comments, commands, environment names, math delimiters,
 * braces and brackets, alignment tabs and macro parameters each get a class.
 */

import { escapeHtml } from './latex-units.js?v=3';

/** The parts of LaTeX code that get a color, one group per kind. */
const TOKEN_PATTERN = /(%[^\n]*)|(\\(?:begin|end)\s*)(\{)([^}\n]*)(\})|(\\(?:[A-Za-z@]+\*?|.))|(\$\$?)|([{}[\]])|(&)|(#\d)/g;
/** Sectioning commands, colored as headings. */
const HEADING_COMMAND = /^\\(section|subsection|subsubsection|chapter|part|paragraph)\*?$/;

/**
 * Highlights LaTeX code for the code view.
 * @param {string} code - the LaTeX code.
 * @returns {string} the code as HTML with spans around the colored parts; the text is unchanged.
 */
export function highlight(code) {
    let html = '';
    const pattern = new RegExp(TOKEN_PATTERN.source, 'g');
    let last = 0, match;
    while ((match = pattern.exec(code))) {
        html += escapeHtml(code.slice(last, match.index)) + highlightToken(match);
        last = pattern.lastIndex;
    }
    return html + escapeHtml(code.slice(last));
}

/**
 * Returns one matched token as colored HTML.
 * @param {RegExpExecArray} match - the match of TOKEN_PATTERN.
 * @returns {string} the token in its span.
 */
function highlightToken(match) {
    if (match[1]) return `<span class="c">${escapeHtml(match[1])}</span>`;
    if (match[2]) return `<span class="k">${escapeHtml(match[2])}</span><span class="p">{</span><span class="e">${escapeHtml(match[4])}</span><span class="p">}</span>`;
    if (match[6]) return `<span class="${HEADING_COMMAND.test(match[6]) ? 'k h' : 'k'}">${escapeHtml(match[6])}</span>`;
    if (match[7]) return `<span class="d">${escapeHtml(match[7])}</span>`;
    if (match[8]) return `<span class="p">${escapeHtml(match[8])}</span>`;
    if (match[9]) return '<span class="a">&amp;</span>';
    if (match[10]) return `<span class="a">${escapeHtml(match[10])}</span>`;
    return '';
}
