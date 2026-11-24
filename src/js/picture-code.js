/**
 * The code of a picture moved or removed on the pages (picture-move.js): where its source is,
 * what goes when it leaves, and the code with it at its new place or without it. A picture
 * stands for its figure environment, or for its \includegraphics when it stands outside a
 * figure; it goes as its own paragraph between blocks, or right beside another picture, or
 * swaps places with it.
 */

import { state, getElements } from './state.js?v=2';

/** The pictures of the pages that can be moved. */
export const PICTURES = 'img.graphic, .example-picture, .picture-missing';
/** An \includegraphics with its options and name. */
const GRAPHIC = /^\\includegraphics\s*\*?\s*(?:\[[^\]]*\]\s*){0,2}\{[^}]*\}/;
/** How far after a place an \includegraphics or the rest of a table cell is looked for. */
const LOOK_AHEAD = 400;
/** How far after a place a \begin{name} is looked for. */
const BEGIN_LOOK_AHEAD = 80;
const BEGIN_DOCUMENT = '\\begin{document}';

/**
 * A range of the code.
 * @typedef {object} CodeRange
 * @property {number} a - where it starts.
 * @property {number} b - where it ends.
 */

/**
 * The code after a move, with the moved source selected.
 * @typedef {object} MovedCode
 * @property {string} code - the new code.
 * @property {number} from - where the moved source starts in it.
 * @property {number} to - where it ends.
 */

/**
 * Finds where \begin{name} at a place ends: just after its matching \end{name}, comments skipped.
 * @param {string} code - the code.
 * @param {number} place - the place of \begin.
 * @returns {number} the end, -1 when it is never closed or no \begin stands there.
 */
export function findEnvironmentEnd(code, place) {
    const begin = /^\\begin\s*\{([^}]+)\}/.exec(code.slice(place, place + BEGIN_LOOK_AHEAD));
    if (!begin) return -1;
    const name = begin[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`%[^\n]*|\\\\(begin|end)\\s*\\{${name}\\}`, 'g');
    pattern.lastIndex = place + begin[0].length;
    let depth = 1;
    for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
        if (!match[1]) continue;
        depth += match[1] === 'begin' ? 1 : -1;
        if (!depth) return match.index + match[0].length;
    }
    return -1;
}

/**
 * Finds the \includegraphics of a picture on the page.
 * @param {HTMLElement} picture - the picture.
 * @returns {CodeRange|null} its range, null when the page does not lead to it.
 */
export function findGraphicCode(picture) {
    const start = +picture.dataset.p, match = GRAPHIC.exec(state.code.slice(start, start + LOOK_AHEAD));
    return match ? { a: start, b: start + match[0].length } : null;
}

/**
 * Finds the code a picture on the page stands for: its figure environment, else the \includegraphics.
 * @param {HTMLElement} picture - the picture.
 * @returns {CodeRange|null} its range, null when the page does not lead to it.
 */
export function findPictureCode(picture) {
    const figure = picture.closest('figure.float[data-p]');
    if (figure) {
        const start = +figure.dataset.p, end = findEnvironmentEnd(state.code, start);
        if (end > start) return { a: start, b: end };
    }
    return findGraphicCode(picture);
}

/**
 * Tells whether a picture is all there is in its table cell (between & or \\ in the code).
 * @param {HTMLElement} picture - the picture.
 * @param {CodeRange|null} graphic - its \includegraphics.
 * @returns {boolean} true when it is alone in its cell.
 */
export function isAloneInCell(picture, graphic) {
    const cell = picture.closest('td[data-p]');
    if (!graphic || !cell || getElements(PICTURES, cell).length !== 1) return false;
    const before = state.code.slice(+cell.dataset.p, graphic.a).replace(/%[^\n]*/g, '');
    const after = state.code.slice(graphic.b, graphic.b + LOOK_AHEAD).replace(/^(\s|%[^\n]*)*/, '');
    return !before.trim() && /^(&|\\\\|\\end\b|\\tabularnewline\b)/.test(after);
}

/**
 * Returns the body of the document: where pictures may go.
 * @returns {number[]} [start, end] in the code.
 */
export function getBodyRange() {
    const begin = state.code.indexOf(BEGIN_DOCUMENT), end = state.code.lastIndexOf('\\end{document}');
    return [begin < 0 ? 0 : begin + BEGIN_DOCUMENT.length, end < 0 ? state.code.length : end];
}

/**
 * Returns what goes when a picture's source leaves: its lines when it has them to itself (and
 * one of two blank lines around them), else the source and one space beside it - never a & or \\.
 * @param {string} code - the code.
 * @param {CodeRange} source - the picture's source.
 * @returns {{a: number, b: number, ls: number, le: number}} the range that goes, and the start and end of the source's line.
 */
function getCutRange(code, source) {
    let a = source.a, b = source.b;
    const lineStart = code.lastIndexOf('\n', a - 1) + 1;
    let lineEnd = code.indexOf('\n', b);
    if (lineEnd < 0) lineEnd = code.length;
    const ownLines = !code.slice(lineStart, a).trim() && !code.slice(b, lineEnd).trim();
    if (ownLines) {
        a = lineStart;
        b = Math.min(lineEnd + 1, code.length);
        const nextLineEnd = code.indexOf('\n', b);
        if (/\n[ \t]*\n$/.test(code.slice(0, a)) && nextLineEnd >= 0 && !code.slice(b, nextLineEnd).trim()) b = nextLineEnd + 1;
    } else if (/[ \t]/.test(code[b] || '')) b++;
    else if (/[ \t]/.test(code[a - 1] || '')) a--;
    return { a, b, ls: lineStart, le: lineEnd };
}

/**
 * The code after a removal.
 * @typedef {object} RemovedCode
 * @property {string} code - the code without the picture.
 * @property {number} at - where the picture's code stood.
 */

/**
 * Returns the code with a picture's source taken out: its lines with one of two blank lines
 * around them when it has them to itself, else the source with one space beside it.
 * @param {string} code - the code.
 * @param {CodeRange} source - the picture's source.
 * @returns {RemovedCode} the code without the source and where the source stood.
 */
export function getRemovedCode(code, source) {
    const { a, b } = getCutRange(code, source);
    return { code: code.slice(0, a) + code.slice(b), at: a };
}

/**
 * Returns the code with a picture's source moved to a place between the blocks: at the start
 * of the place's line, with that line's indent, as a paragraph of its own.
 * @param {string} code - the code.
 * @param {CodeRange} source - the picture's source.
 * @param {number} place - the place in the code.
 * @returns {MovedCode|null} the new code, null when nothing would change (only white space between the picture and the place).
 */
export function getMovedCode(code, source, place) {
    const { a, b, ls: lineStart } = getCutRange(code, source);
    if (place >= a && place <= b) return null;
    if (place < a ? !code.slice(place, a).trim() : !code.slice(b, place).trim()) return null;
    const rest = code.slice(0, a) + code.slice(b);
    let at = place > b ? place - (b - a) : place;
    const placeLineStart = rest.lastIndexOf('\n', at - 1) + 1;
    if (!rest.slice(placeLineStart, at).trim()) at = placeLineStart;
    const indent = at === placeLineStart ? /^[ \t]*/.exec(rest.slice(at))[0] : '';
    const firstIndent = /^[ \t]*/.exec(code.slice(lineStart))[0];
    const block = code.slice(source.a, source.b).split('\n').map((line, i) => indent + (i && line.startsWith(firstIndent) ? line.slice(firstIndent.length) : line)).join('\n');
    const before = at === 0 || rest.slice(at - 2, at) === '\n\n' ? '' : rest[at - 1] === '\n' ? '\n' : '\n\n';
    const nextLineEnd = rest.indexOf('\n', at);
    const after = rest.slice(at, nextLineEnd < 0 ? rest.length : nextLineEnd).trim() ? '\n\n' : '\n';
    const moved = rest.slice(0, at) + before + block + after + rest.slice(at);
    const from = at + before.length + indent.length;
    return moved === code ? null : { code: moved, from, to: at + before.length + block.length };
}

/**
 * The picture an \includegraphics goes beside.
 * @typedef {object} BesideTarget
 * @property {CodeRange} pic - the other picture's \includegraphics.
 * @property {boolean} [swap] - true to swap the two.
 * @property {boolean} [after] - true to go after it, else before.
 */

/**
 * Returns the code with an \includegraphics moved beside the picture of a target (or swapped
 * with it): on a line of its own when that picture has one, with its indent, else in the same line.
 * @param {string} code - the code.
 * @param {CodeRange} source - the moved \includegraphics.
 * @param {BesideTarget} target - the picture to go beside or swap with.
 * @returns {MovedCode|null} the new code, null when only white space would change.
 */
export function getBesideCode(code, source, target) {
    if (target.swap) return getSwappedCode(code, source, target.pic);
    const picture = target.pic, text = code.slice(source.a, source.b);
    const cut = getCutRange(code, source);
    if (picture.b > cut.a && picture.a < cut.b) return null;
    const rest = code.slice(0, cut.a) + code.slice(cut.b);
    const removed = cut.b - cut.a;
    const a = picture.a >= cut.b ? picture.a - removed : picture.a, b = picture.b >= cut.b ? picture.b - removed : picture.b;
    const lineStart = rest.lastIndexOf('\n', a - 1) + 1;
    let lineEnd = rest.indexOf('\n', b);
    if (lineEnd < 0) lineEnd = rest.length;
    let at, inserted, offset;
    if (!rest.slice(lineStart, a).trim() && !rest.slice(b, lineEnd).trim()) {
        const indent = rest.slice(lineStart, a);
        if (target.after) { at = lineEnd; inserted = '\n' + indent + text; offset = 1 + indent.length; }
        else { at = lineStart; inserted = indent + text + '\n'; offset = indent.length; }
    } else if (target.after) { at = b; inserted = ' ' + text; offset = 1; }
    else { at = a; inserted = text + ' '; offset = 0; }
    const moved = rest.slice(0, at) + inserted + rest.slice(at);
    if (moved.replace(/\s+/g, ' ') === code.replace(/\s+/g, ' ')) return null;
    return { code: moved, from: at + offset, to: at + offset + text.length };
}

/**
 * Returns the code with two \includegraphics swapped.
 * @param {string} code - the code.
 * @param {CodeRange} source - the moved \includegraphics.
 * @param {CodeRange} picture - the other one.
 * @returns {MovedCode} the new code with the moved one selected.
 */
function getSwappedCode(code, source, picture) {
    const text = code.slice(source.a, source.b);
    const [first, second] = source.a < picture.a ? [source, picture] : [picture, source];
    const swapped = code.slice(0, first.a) + code.slice(second.a, second.b) + code.slice(first.b, second.a) + code.slice(first.a, first.b) + code.slice(second.b);
    const from = source === first ? second.a + (second.b - second.a) - (first.b - first.a) : first.a;
    return { code: swapped, from, to: from + text.length };
}
