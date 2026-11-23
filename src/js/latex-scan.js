/**
 * Scanning helpers of the LaTeX reader: the scanner over a part of the code, matching braces
 * and brackets, the end of an environment, splitting at top level (rows, cells, items),
 * key=value lists and the counter formats (roman, alph, footnote symbols).
 */

import { VERBATIM_ENVIRONMENTS } from './latex-names.js?v=3';

/** A letter of a control word (TeX letters and @). */
export const LETTER = /[A-Za-z@]/;

/**
 * A scanner over a part of a text. Text from a macro has its own string; every position in
 * it is reported as the place where the macro was used.
 * @typedef {object} Scanner
 * @property {string} s - the text being read.
 * @property {number} i - the reading position.
 * @property {number} end - where the part ends (exclusive).
 * @property {number} v - the position to report for all text, or -1 for text of the code.
 * @property {function(Flow): void} [marker] - a stack entry that runs when it is reached.
 */

/**
 * A range of a text: start and end offset.
 * @typedef {object} Range
 * @property {number} a - the start (inclusive).
 * @property {number} b - the end (exclusive).
 */

/**
 * A part of a text split at top level.
 * @typedef {object} TopLevelPart
 * @property {number} a - the start of the part.
 * @property {number} b - the end of the part.
 * @property {?string} sep - the separator in front of the part, null for the first.
 */

/**
 * Creates a scanner over text[start..end].
 * @param {string} text - the text.
 * @param {number} start - the reading position.
 * @param {number} end - the end of the part.
 * @param {number} [reportedPosition=-1] - the position to report for text of a macro, -1 for code.
 * @returns {Scanner} the new scanner.
 */
export const createScanner = (text, start, end, reportedPosition = -1) => ({ s: text, i: start, end, v: reportedPosition });

/**
 * Returns the position in the code to report for an index of a scanner's text.
 * @param {Scanner} scan - the scanner.
 * @param {number} index - the index in the scanner's text.
 * @returns {number} the index, or the place of the macro the text comes from.
 */
export const getPosition = (scan, index) => (scan.v >= 0 ? scan.v : index);

/**
 * Returns the index of the "}" that matches the "{" at a position; escaped braces and
 * comments are skipped.
 * @param {string} text - the text.
 * @param {number} start - the index of the "{".
 * @param {number} [end=text.length] - where the search stops.
 * @returns {number} the index of the "}", or -1.
 */
export function findClosingBrace(text, start, end = text.length) {
    let depth = 0;
    for (let k = start; k < end; k++) {
        const character = text[k];
        if (character === '\\') { k++; continue; }
        if (character === '%') { const lineEnd = text.indexOf('\n', k); if (lineEnd < 0 || lineEnd >= end) return -1; k = lineEnd; continue; }
        if (character === '{') depth++;
        else if (character === '}' && --depth === 0) return k;
    }
    return -1;
}

/**
 * Returns the index of the "]" that matches the "[" at a position; braces inside are skipped.
 * @param {string} text - the text.
 * @param {number} start - the index of the "[".
 * @param {number} end - where the search stops.
 * @returns {number} the index of the "]", or -1.
 */
export function findClosingBracket(text, start, end) {
    let depth = 0;
    for (let k = start + 1; k < end; k++) {
        const character = text[k];
        if (character === '\\') { k++; continue; }
        if (character === '{') { const close = findClosingBrace(text, k, end); if (close < 0) return -1; k = close; continue; }
        if (character === '[') depth++;
        if (character === ']') { if (!depth) return k; depth--; }
    }
    return -1;
}

/**
 * Returns where the \end{name} is that closes a \begin{name} whose body starts at a position.
 * Nested environments of the same name count; verbatim environments and \verb inside are
 * skipped whole, so their text cannot close anything.
 * @param {string} text - the text.
 * @param {number} start - where the body starts.
 * @param {number} end - where the search stops.
 * @param {string} name - the environment's name.
 * @returns {?{at: number, after: number}} the start of \end{name} and the index after it, or null.
 */
export function findEnvironmentEnd(text, start, end, name) {
    const endTag = '\\end{' + name + '}';
    if (VERBATIM_ENVIRONMENTS.has(name)) {
        const at = text.indexOf(endTag, start);
        return at < 0 || at >= end ? null : { at, after: at + endTag.length };
    }
    const beginTag = '\\begin{' + name + '}';
    let depth = 1;
    for (let k = start; k < end; k++) {
        const character = text[k];
        if (character === '%') { const lineEnd = text.indexOf('\n', k); if (lineEnd < 0) break; k = lineEnd; continue; }
        if (character !== '\\') continue;
        if (text.startsWith(beginTag, k)) { depth++; k += beginTag.length - 1; continue; }
        if (text.startsWith(endTag, k)) { if (--depth === 0) return { at: k, after: k + endTag.length }; k += endTag.length - 1; continue; }
        if (text.startsWith('\\begin{', k)) {
            const match = /^\\begin\{([^}]*)\}/.exec(text.slice(k, k + 60));
            if (match && VERBATIM_ENVIRONMENTS.has(match[1]) && match[1] !== name) {
                const verbatimEnd = text.indexOf('\\end{' + match[1] + '}', k);
                if (verbatimEnd > 0) { k = verbatimEnd + match[1].length + 5; continue; }
            }
        }
        if (text.startsWith('\\verb', k) && !LETTER.test(text[k + 5] || '')) {
            const delimiter = text[k + 5] === '*' ? text[k + 6] : text[k + 5];
            const verbEnd = text.indexOf(delimiter, k + 6 + (text[k + 5] === '*' ? 1 : 0));
            if (verbEnd > 0) { k = verbEnd; continue; }
        }
        k++;
    }
    return null;
}

/**
 * Splits text[start..end] at top level (outside braces and environments) wherever the test
 * finds a separator.
 * @param {string} text - the text.
 * @param {number} start - where the part starts.
 * @param {number} end - where it ends.
 * @param {function(string, number): number} getSeparatorLength - the length of a separator at
 *     an index, 0 for none.
 * @returns {TopLevelPart[]} the parts, each with the separator in front of it.
 */
export function splitTopLevel(text, start, end, getSeparatorLength) {
    const parts = [];
    let braceDepth = 0, environmentDepth = 0, from = start, separator = null;
    for (let k = start; k < end; k++) {
        const character = text[k];
        if (character === '%') { const lineEnd = text.indexOf('\n', k); k = lineEnd < 0 ? end : lineEnd; continue; }
        if (character === '{') { braceDepth++; continue; }
        if (character === '}') { braceDepth--; continue; }
        if (character === '\\') {
            if (text.startsWith('\\begin{', k)) {
                const match = /^\\begin\{([^}]*)\}/.exec(text.slice(k, k + 60));
                if (match && VERBATIM_ENVIRONMENTS.has(match[1])) {
                    const verbatimEnd = text.indexOf('\\end{' + match[1] + '}', k);
                    if (verbatimEnd > 0 && verbatimEnd < end) { k = verbatimEnd + match[1].length + 5; continue; }
                }
                environmentDepth++; k += 6; continue;
            }
            if (text.startsWith('\\end{', k)) { environmentDepth--; k += 4; continue; }
            if (text.startsWith('\\verb', k) && !LETTER.test(text[k + 5] || '')) {
                const delimiterAt = text[k + 5] === '*' ? k + 6 : k + 5;
                const verbEnd = text.indexOf(text[delimiterAt], delimiterAt + 1);
                if (verbEnd > 0 && verbEnd < end) { k = verbEnd; continue; }
            }
        }
        if (!braceDepth && !environmentDepth) {
            const length = getSeparatorLength(text, k);
            if (length) {
                parts.push({ a: from, b: k, sep: separator });
                separator = text.slice(k, k + length);
                from = k + length;
                k += length - 1;
                continue;
            }
        }
        if (character === '\\') k++;
    }
    parts.push({ a: from, b: end, sep: separator });
    return parts;
}

/**
 * Returns the length of an \item at an index (for splitTopLevel()).
 * @param {string} text - the text.
 * @param {number} index - the index.
 * @returns {number} 5 for \item, else 0.
 */
export const getItemLength = (text, index) => (text.startsWith('\\item', index) && !LETTER.test(text[index + 5] || '') ? 5 : 0);

/**
 * Returns the length of a \bibitem at an index (for splitTopLevel()).
 * @param {string} text - the text.
 * @param {number} index - the index.
 * @returns {number} 8 for \bibitem, else 0.
 */
export const getBibitemLength = (text, index) => (text.startsWith('\\bibitem', index) && !LETTER.test(text[index + 8] || '') ? 8 : 0);

/**
 * Parses a key=value list such as "width=0.5\textwidth, angle=90"; commas inside braces belong
 * to the value, and braces around a whole value are removed.
 * @param {string} text - the list.
 * @returns {Map<string, (string|boolean)>} the values by key, true for a key without value.
 */
export function parseKeyValues(text) {
    const values = new Map();
    if (!text) return values;
    let depth = 0, current = '';
    const parts = [];
    for (const character of text) {
        if (character === '{') depth++;
        if (character === '}') depth--;
        if (character === ',' && !depth) { parts.push(current); current = ''; } else current += character;
    }
    parts.push(current);
    for (const part of parts) {
        const equals = part.indexOf('=');
        const key = (equals < 0 ? part : part.slice(0, equals)).trim();
        if (key) values.set(key, equals < 0 ? true : part.slice(equals + 1).trim().replace(/^\{([\s\S]*)\}$/, '$1'));
    }
    return values;
}

/** Roman numerals and their values, the largest first. */
const ROMAN_DIGITS = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
/** From this value on a counter is shown in digits (a huge \setcounter value cannot be counted down). */
const ROMAN_LIMIT = 100000;

/**
 * Returns a number as lower-case roman numerals.
 * @param {number} number - the counter value.
 * @returns {string} the roman numerals; digits for huge or non-integer values.
 */
export const formatRoman = number => {
    if (!Number.isSafeInteger(number) || number >= ROMAN_LIMIT) return String(number);
    let roman = '';
    for (const [value, digits] of ROMAN_DIGITS) {
        while (number >= value) { roman += digits; number -= value; }
    }
    return roman;
};

/**
 * Returns a number as a lower-case letter (1 a, 2 b …).
 * @param {number} number - the counter value.
 * @returns {string} the letter, digits outside 1 … 26.
 */
export const formatAlph = number => (number > 0 && number < 27 ? String.fromCharCode(96 + number) : String(number));

/** The footnote symbols of \fnsymbol, in order. */
const FOOTNOTE_SYMBOLS = ['*', '†', '‡', '§', '¶', '‖', '**', '††', '‡‡'];

/**
 * Returns the footnote symbol of a number (\fnsymbol).
 * @param {number} number - the footnote number, 1-based.
 * @returns {string} the symbol, repeating after nine.
 */
export const getFootnoteSymbol = number => FOOTNOTE_SYMBOLS[(number - 1) % 9];
