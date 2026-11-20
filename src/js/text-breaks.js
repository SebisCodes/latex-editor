/**
 * Text typed on the pages, written as LaTeX: special characters escaped, typographic quotes
 * and dashes as TeX writes them, and the line breaks typed with Enter and Shift+Enter as
 * paragraphs and line breaks of the code. Where a break cannot go (a heading, a table cell,
 * inside a command), getBreakRefusal() says why.
 */

import { state } from './state.js?v=2';
import { getCaretOffset } from './preview-caret.js?v=2';

/** Typographic characters as TeX writes them. */
const TYPOGRAPHIC = { '’': "'", '‘': '`', '“': '``', '”': "''", '–': '--', '—': '---' };
/** Characters with a meaning in LaTeX, escaped. */
const SPECIAL = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '%': '\\%', '&': '\\&', '#': '\\#', '_': '\\_', '^': '\\^{}', '~': '\\~{}' };
/** The headings of the pages. */
const HEADINGS = 'h1, h2, h3, h4, h5, h6, .chapter-title';

/**
 * Returns typed text as LaTeX: line breaks as spaces, special characters escaped, typographic
 * quotes and dashes as TeX writes them.
 * @param {string} text - the typed text.
 * @returns {string} the LaTeX.
 */
export function formatAsTex(text) {
    return text.replace(/[\r\n]+/g, ' ').replace(/[\\{}$%&#_^~]/g, character => SPECIAL[character]).replace(/[’‘“”–—]/g, character => TYPOGRAPHIC[character]);
}

/**
 * Tells whether a run of the pages still matches the code at its place: one character per
 * character, where a space may be a line break of the code and ’ ‘ may be ' and `.
 * @param {string} text - the run's text.
 * @param {number} place - where the run starts in the code.
 * @returns {boolean} true when it matches.
 */
export function isRunInCode(text, place) {
    const source = state.code.slice(place, place + text.length);
    if (source.length !== text.length) return false;
    for (let i = 0; i < text.length; i++) {
        const shown = text[i], written = source[i];
        if (shown !== written && !(shown === ' ' && written === '\n') && !(shown === '’' && written === "'") && !(shown === '‘' && written === '`')) return false;
    }
    return true;
}

/**
 * Returns the typed text as LaTeX with its line breaks: two or more are a new paragraph (a
 * blank line; in a list item a new \item), one a line break (\\ and a new line in the code).
 * The indentation of the line goes on. Breaks at the start or end of the paragraph's text make
 * no empty paragraph and are left out.
 * @param {HTMLElement} span - the run edited.
 * @param {string} text - the changed part of the run's text.
 * @param {number} place - the place of that part in the code.
 * @param {boolean} atStart - true when the part starts at the start of the run.
 * @param {string} rest - the run's text after the part.
 * @returns {string} the LaTeX.
 */
export function formatBreaks(span, text, place, atStart, rest) {
    if (!text.includes('\n')) return formatAsTex(text);
    const lineStart = state.code.lastIndexOf('\n', place - 1) + 1;
    const indent = /^[ \t]*/.exec(state.code.slice(lineStart, place))[0];
    const paragraph = span.closest('li') ? '\n' + indent + '\\item ' : '\n\n' + indent;
    const { before, after } = getBlockTextAround(span);
    let parts = text.replace(/\n{3,}/g, '\n\n');
    if (atStart && !before) parts = parts.replace(/^\n+/, '');
    if (!(after + rest.trim())) parts = parts.replace(/\n+$/, '');
    return parts.split(/(\n+)/).map((part, i) => (!(i % 2) ? formatAsTex(i ? part.replace(/^[ \t]+/, '') : part) : part.length > 1 ? paragraph : '\\\\\n' + indent)).join('');
}

/**
 * Returns the text of the run's block before and after the run, trimmed.
 * @param {HTMLElement} span - the run.
 * @returns {{before: string, after: string}} the text before and after it.
 */
function getBlockTextAround(span) {
    const block = span.closest('[data-p]') || span.parentElement;
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEndBefore(span);
    const before = range.toString().trim();
    range.selectNodeContents(block);
    range.setStartAfter(span);
    return { before, after: range.toString().trim() };
}

/**
 * Returns why Enter cannot go where the cursor is: in a heading or table cell (a blank line or
 * \\ would break its code), and for a new paragraph also inside a command such as \textbf{…}
 * (the run is not directly in its paragraph). At the end of a heading's text a new paragraph
 * can go after the heading.
 * @param {HTMLElement} span - the run edited.
 * @param {boolean} paragraph - true for a new paragraph (Enter), false for a new line (Shift+Enter).
 * @returns {string|null} the message for the user, null when the break can go there.
 */
export function getBreakRefusal(span, paragraph) {
    if (paragraph && span.closest(HEADINGS) && isAtHeadingEnd(span)) return null;
    if (span.closest(HEADINGS + ', td, th')) return 'A new line in a heading or table cell is made in the code';
    const block = span.closest('[data-p]');
    if (paragraph && block && span.parentElement !== block && !span.parentElement.matches('.p, li')) return 'A new paragraph inside bold, italic or another command is made in the code - Shift+Enter makes a new line';
    return null;
}

/**
 * Tells whether the cursor is at the end of a heading's text: nothing typed or written after
 * it in the heading.
 * @param {HTMLElement} span - the run in the heading.
 * @returns {boolean} true at the end.
 */
function isAtHeadingEnd(span) {
    const heading = span.closest(HEADINGS);
    if (getCaretOffset(span) < span.textContent.replace(/\s+$/, '').length) return false;
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.setStartAfter(span);
    return !range.toString().trim();
}

/**
 * Tells whether a run is (in) a heading of the pages.
 * @param {HTMLElement} span - the run.
 * @returns {boolean} true in a heading.
 */
export function isInHeading(span) {
    return !!span.closest(HEADINGS);
}

/**
 * Returns the text typed after Enter at the end of a heading as LaTeX: one paragraph or more
 * after the heading's line.
 * @param {string} text - the typed text, starting with its line break.
 * @returns {string} the LaTeX.
 */
export function formatAfterHeading(text) {
    return text.replace(/^\n+|\n+$/g, '').replace(/\n{3,}/g, '\n\n').split(/(\n+)/)
        .map((part, i) => (!(i % 2) ? formatAsTex(part.replace(/^[ \t]+/, '')) : part.length > 1 ? '\n\n' : '\\\\\n')).join('');
}
