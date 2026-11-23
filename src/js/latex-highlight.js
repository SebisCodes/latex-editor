/**
 * Code coloring of the LaTeX editor: comments, commands, environment names, math delimiters,
 * braces and brackets, alignment tabs and macro parameters each get a class. With a template
 * syntax (?template=), every placeholder tag is one span of a class of its own, in comments too.
 */

import { escapeHtml } from './latex-units.js?v=3';
import { getTemplateSyntax, getTemplateTags } from './latex-template.js?v=1';

/** The parts of LaTeX code that get a color, one group per kind. */
const TOKEN_PATTERN = /(%[^\n]*)|(\\(?:begin|end)\s*)(\{)([^}\n]*)(\})|(\\(?:[A-Za-z@]+\*?|.))|(\$\$?)|([{}[\]])|(&)|(#\d)/g;
/** Sectioning commands, colored as headings. */
const HEADING_COMMAND = /^\\(section|subsection|subsubsection|chapter|part|paragraph)\*?$/;

/**
 * Highlights LaTeX code for the code view.
 * @param {string} code - the LaTeX code.
 * @param {?string} [templateName=null] - the template syntax of the placeholders ("mustache", "angle"), or null for plain LaTeX.
 * @returns {string} the code as HTML with spans around the colored parts; the text is unchanged.
 */
export function highlight(code, templateName = null) {
    const syntax = getTemplateSyntax(templateName);
    if (!syntax) return highlightLatex(code, false).html;
    let html = '', last = 0, isInComment = false;
    for (const tag of getTemplateTags(code, syntax)) {
        const part = highlightLatex(code.slice(last, tag.start), isInComment);
        html += part.html + `<span class="tp">${escapeHtml(code.slice(tag.start, tag.end))}</span>`;
        isInComment = part.endsInComment;
        last = tag.end;
    }
    return html + highlightLatex(code.slice(last), isInComment).html;
}

/**
 * Highlights a piece of LaTeX code that may start inside a comment (after a placeholder that
 * stands in a comment).
 * @param {string} code - the piece of code.
 * @param {boolean} startsInComment - true when the piece continues a comment up to its first line break.
 * @returns {{html: string, endsInComment: boolean}} the colored HTML, and whether a comment runs to the piece's end.
 */
function highlightLatex(code, startsInComment) {
    let html = '', start = 0;
    if (startsInComment) {
        const lineEnd = code.indexOf('\n');
        start = lineEnd < 0 ? code.length : lineEnd;
        if (start) html += `<span class="c">${escapeHtml(code.slice(0, start))}</span>`;
        if (lineEnd < 0) return { html, endsInComment: true };
    }
    const pattern = new RegExp(TOKEN_PATTERN.source, 'g');
    pattern.lastIndex = start;
    let last = start, match, endsInComment = false;
    while ((match = pattern.exec(code))) {
        html += escapeHtml(code.slice(last, match.index)) + highlightToken(match);
        last = pattern.lastIndex;
        endsInComment = Boolean(match[1]) && last === code.length;
    }
    return { html: html + escapeHtml(code.slice(last)), endsInComment };
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
