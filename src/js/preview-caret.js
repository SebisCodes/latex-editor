/**
 * Text positions on the pages, for editing text in place.
 *
 * findCharacterAt() looks at the boxes of the characters of an element. Unlike
 * caretPositionFromPoint this also holds in pages shown with CSS zoom. Beside the characters
 * (right of a line's end, in the space between lines) the nearest character within about a
 * line counts, so a click right of a line's end lands at its end.
 */

import { ui } from './state.js?v=2';

/** A text run of the pages that can be edited in place. */
const TEXT_RUN = '.t[data-s]';

/**
 * A place in a text node.
 * @typedef {object} TextCaret
 * @property {Node} node - the text node.
 * @property {number} offset - the place in its text.
 */

/**
 * How near a character is to a point.
 * @typedef {object} CharacterDistance
 * @property {boolean} onIt - true when the point is on the character.
 * @property {TextCaret} caret - the place before or after the character, by the half the point is on.
 * @property {number} [dy] - the vertical distance to its box.
 * @property {number} [dx] - the horizontal distance to its box.
 */

/**
 * Finds the text position under a point inside an element from the boxes of its characters:
 * the place before the character under the point, or after it when the point is on its right
 * half; beside the characters the nearest one within about a line.
 * @param {Element} element - the element.
 * @param {number} x - the point's x.
 * @param {number} y - the point's y.
 * @returns {TextCaret|null} the place, null when no character of the element is that near.
 */
export function findCharacterAt(element, x, y) {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = element.ownerDocument.createRange();
    let nearest = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = 0; i < node.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const measured = getCharacterDistance(range.getClientRects(), node, i, x, y);
            if (!measured) continue;
            if (measured.onIt) return measured.caret;
            if (!nearest || measured.dy < nearest.dy || (measured.dy === nearest.dy && measured.dx < nearest.dx)) nearest = measured;
        }
    }
    return nearest ? nearest.caret : null;
}

/**
 * Returns how near one character is to a point: its nearest box on the point's line.
 * @param {DOMRectList} boxes - the boxes of the character.
 * @param {Node} node - its text node.
 * @param {number} index - its place in the text.
 * @param {number} x - the point's x.
 * @param {number} y - the point's y.
 * @returns {CharacterDistance|null} the distance, null when no box is within a line.
 */
function getCharacterDistance(boxes, node, index, x, y) {
    let best = null;
    for (const box of boxes) {
        const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
        if (dy > box.height) continue;                                       // another line
        const offset = x < box.left + box.width / 2 ? index : index + 1;
        if (!dy && x >= box.left && x <= box.right) return { onIt: true, caret: { node, offset } };
        const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
        if (!best || dy < best.dy || (dy === best.dy && dx < best.dx)) best = { onIt: false, caret: { node, offset }, dy, dx };
    }
    return best;
}

/**
 * Returns the text position under the pointer as a collapsed range: inside the run when it is
 * given and a character of it is near, else the browser's own caret position.
 * @param {number} x - the pointer's x.
 * @param {number} y - the pointer's y.
 * @param {HTMLElement} [span] - the run the pointer is on.
 * @returns {Range|null} the range, null when there is no position.
 */
export function getRangeAtPoint(x, y, span) {
    const caret = span && findCharacterAt(span, x, y);
    if (caret) return createCollapsedRange(caret.node, caret.offset);
    if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        return position ? createCollapsedRange(position.offsetNode, position.offset) : null;
    }
    return document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
}

/**
 * Creates a range collapsed to a place.
 * @param {Node} node - the node.
 * @param {number} offset - the place in it.
 * @returns {Range} the range.
 */
function createCollapsedRange(node, offset) {
    const range = document.createRange();
    range.setStart(node, offset);
    return range;
}

/**
 * Returns how many characters of a run stand before the cursor.
 * @param {HTMLElement} span - the run.
 * @returns {number} the count, 0 when the cursor is not in the run.
 */
export function getCaretOffset(span) {
    const selection = getSelection();
    if (!selection.rangeCount || !span.contains(selection.anchorNode)) return 0;
    const range = document.createRange();
    range.selectNodeContents(span);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
}

/**
 * Finds the run at a point: the one under it, or the nearest one on that line of the block
 * under it (a click right of a line's end edits that line, the cursor at its end).
 * @param {number} x - the point's x.
 * @param {number} y - the point's y.
 * @returns {HTMLElement|null} the run, null when there is none.
 */
export function findRunAt(x, y) {
    const element = document.elementFromPoint(x, y);
    const span = element?.closest(TEXT_RUN);
    if (span) return span;
    const block = element?.closest('[data-p]');
    if (!block || !ui.pages.contains(block)) return null;
    const caret = findCharacterAt(block, x, y);
    return caret ? caret.node.parentElement?.closest(TEXT_RUN) || null : null;
}
