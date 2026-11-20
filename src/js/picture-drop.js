/**
 * Where a picture moved on the pages lands (picture-move.js), from the pointer's place:
 *   - over another picture: right beside it (a line at its nearer edge; pictures side by side
 *     get a line at the left or right, pictures above each other at the top or bottom), or, in
 *     the middle of a picture alone in its table cell, swapped with it (a frame around it);
 *   - else between the blocks (paragraphs, headings, list items, floats): before or after the
 *     block under or nearest the pointer, whichever half is nearer.
 */

import { state, ui, getElements, getNumberInRange } from './state.js?v=2';
import { PICTURES, findGraphicCode, isAloneInCell, getBodyRange } from './picture-code.js?v=2';

/** The middle of a picture where a drop swaps: from this share of its width ... */
const SWAP_FROM = 0.25;
/** ... to this share. */
const SWAP_TO = 0.75;
/** Pixels two pictures' boxes must overlap in height to count as side by side. */
const ROW_OVERLAP = 2;
/** The thickness of the drop line, in pixels. */
const LINE_THICKNESS = 3;
/** Pixels of the frame around a picture a drop swaps with. */
const SWAP_FRAME = 3;
/** Pixels above and below a block's piece that still count as on it. */
const BLOCK_SLACK = 8;
/** Horizontal distance counts this many times less than vertical when the nearest block is found. */
const HORIZONTAL_WEIGHT = 4;

/**
 * A box on the screen.
 * @typedef {object} ScreenBox
 * @property {number} left - its left edge.
 * @property {number} top - its top edge.
 * @property {number} width - its width.
 * @property {number} height - its height.
 */

/**
 * A place to drop at.
 * @typedef {object} DropTarget
 * @property {import('./picture-code.js').CodeRange} [pic] - the \includegraphics of the picture to go beside.
 * @property {boolean} [swap] - true to swap with that picture.
 * @property {boolean} [after] - true to go after that picture.
 * @property {number} [at] - the place in the code between the blocks.
 * @property {boolean} [none] - true over the moved picture itself.
 * @property {ScreenBox} [box] - the box of the line or frame.
 */

/**
 * A block of the pages as a place to drop at.
 * @typedef {object} DropBlock
 * @property {number} pos - the place in the code before it.
 * @property {number} after - the place in the code after it.
 * @property {Element[]} els - its pieces (a block split over pages has several).
 * @property {DropBlock[]} [items] - its list items.
 * @property {boolean} [li] - true for a list item.
 */

/**
 * The state of a picture being moved (picture-move.js).
 * @typedef {object} PictureMove
 * @property {HTMLElement} el - the picture.
 * @property {import('./picture-code.js').CodeRange} src - the code it stands for.
 * @property {import('./picture-code.js').CodeRange|null} pic - its \includegraphics.
 * @property {Element|null} fig - its figure.
 * @property {boolean} cell - true when it is alone in its table cell.
 */

/**
 * Tells whether a point is inside a box.
 * @param {DOMRect} box - the box.
 * @param {number} x - the point's x.
 * @param {number} y - the point's y.
 * @returns {boolean} true inside.
 */
function isInside(box, x, y) {
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/**
 * Returns the place under the pointer: beside a picture, else between the blocks.
 * @param {PictureMove} move - the move.
 * @param {number} x - the pointer's x.
 * @param {number} y - the pointer's y.
 * @returns {DropTarget|null} the place, null when there is none.
 */
export function getDropTarget(move, x, y) {
    const pictureTarget = getPictureTarget(move, x, y);
    if (pictureTarget) return pictureTarget.none ? null : pictureTarget;
    const blocks = getDropBlocks();
    const block = findItemAt(blocks, x, y) || findNearestBlock(blocks, x, y);
    return block ? createBlockTarget(block, x, y) : null;
}

/**
 * Returns the blocks of the pages as places to drop at: the blocks on the pages (a block split
 * over pages is one, with its pieces) and their list items, each with the code place before
 * and after it.
 * @returns {DropBlock[]} the blocks in the document's body.
 */
function getDropBlocks() {
    const [low, high] = getBodyRange();
    const groups = [];
    for (const element of getElements('.content > [data-p]', ui.pages)) {
        const place = +element.dataset.p, last = groups[groups.length - 1];
        if (last && last.pos === place) last.els.push(element);
        else groups.push({ pos: place, els: [element] });
    }
    const inBody = groups.filter(group => group.pos >= low && group.pos <= high);
    inBody.forEach((group, i) => { group.after = i + 1 < inBody.length ? inBody[i + 1].pos : high; });
    for (const group of inBody) group.items = getListItems(group);
    return inBody.filter(group => group.after >= group.pos);
}

/**
 * Returns the list items of a block as places to drop at, each ending where the next item
 * outside it starts.
 * @param {DropBlock} group - the block.
 * @returns {DropBlock[]} its list items.
 */
function getListItems(group) {
    const items = group.els.flatMap(element => getElements('.list > li[data-p]', element)).map(element => ({ pos: +element.dataset.p, els: [element], li: true }));
    for (const item of items) {
        const next = items.filter(other => other.pos > item.pos && !item.els[0].contains(other.els[0])).sort((one, two) => one.pos - two.pos)[0];
        item.after = next ? next.pos : group.after;
    }
    return items;
}

/**
 * Finds the innermost list item under the pointer.
 * @param {DropBlock[]} blocks - the blocks.
 * @param {number} x - the pointer's x.
 * @param {number} y - the pointer's y.
 * @returns {DropBlock|null} the item, null when none is under it.
 */
function findItemAt(blocks, x, y) {
    let found = null;
    for (const block of blocks) {
        for (const item of block.items) if (isInside(item.els[0].getBoundingClientRect(), x, y) && (!found || found.els[0].contains(item.els[0]))) found = item;
    }
    return found;
}

/**
 * Finds the block beside or under the pointer, else the nearest one on the page under it.
 * @param {DropBlock[]} blocks - the blocks.
 * @param {number} x - the pointer's x.
 * @param {number} y - the pointer's y.
 * @returns {DropBlock|null} the block, null when there is none.
 */
function findNearestBlock(blocks, x, y) {
    const page = document.elementFromPoint(x, y)?.closest('.sheet');
    let nearest = null, best = Infinity;
    for (const block of blocks) {
        for (const element of block.els) {
            if (page && !page.contains(element)) continue;
            const box = element.getBoundingClientRect();
            const distance = Math.max(0, box.top - y, y - box.bottom) + Math.max(0, box.left - x, x - box.right) / HORIZONTAL_WEIGHT;
            if (distance < best) { best = distance; nearest = block; }
        }
    }
    return nearest;
}

/**
 * Returns the place before or after a block, whichever half is nearer, its pieces on several
 * pages counted as one, with the box of the line.
 * @param {DropBlock} block - the block.
 * @param {number} x - the pointer's x.
 * @param {number} y - the pointer's y.
 * @returns {DropTarget} the place.
 */
function createBlockTarget(block, x, y) {
    const boxes = block.els.map(element => element.getBoundingClientRect());
    const total = boxes.reduce((sum, box) => sum + box.height, 0) || 1;
    let passed = 0;
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        if (block.els.length === 1 || (x >= box.left && x <= box.right && y >= box.top - BLOCK_SLACK && y <= box.bottom + BLOCK_SLACK) || i === boxes.length - 1) {
            passed += getNumberInRange(y - box.top, 0, box.height);
            break;
        }
        passed += box.height;
    }
    const before = passed < total / 2;
    const box = before ? boxes[0] : boxes[boxes.length - 1];
    return { at: before ? block.pos : block.after, box: { left: box.left, top: (before ? box.top - 2 : box.bottom + 2) - LINE_THICKNESS / 2, width: box.width, height: LINE_THICKNESS } };
}

/**
 * Returns the picture under the pointer as a place to drop at (see the header). Over the moved
 * picture itself: no place. A figure's only picture keeps its figure: elsewhere it goes as a
 * whole, between the blocks.
 * @param {PictureMove} move - the move.
 * @param {number} x - the pointer's x.
 * @param {number} y - the pointer's y.
 * @returns {DropTarget|null} the place, {none: true} over the moved picture, null for no picture.
 */
function getPictureTarget(move, x, y) {
    if (isInside(move.el.getBoundingClientRect(), x, y)) return { none: true };
    const picture = getElements(PICTURES, ui.pages).find(other => other !== move.el && isInside(other.getBoundingClientRect(), x, y));
    if (!picture) return null;
    if (move.fig && !move.fig.contains(picture) && getElements(PICTURES, move.fig).length === 1) return null;
    const graphic = findGraphicCode(picture), [low, high] = getBodyRange();
    if (!graphic || !move.pic || graphic.a < low || graphic.a > high) return null;
    const box = picture.getBoundingClientRect();
    const row = isInRow(picture, box);
    const share = row ? (x - box.left) / box.width : (y - box.top) / box.height;
    if (row && share > SWAP_FROM && share < SWAP_TO && move.cell && isAloneInCell(picture, graphic)) {
        return { pic: graphic, swap: true, box: { left: box.left - SWAP_FRAME, top: box.top - SWAP_FRAME, width: box.width + 2 * SWAP_FRAME, height: box.height + 2 * SWAP_FRAME } };
    }
    const after = share >= 0.5;
    return { pic: graphic, after, box: row ? { left: (after ? box.right : box.left) - LINE_THICKNESS / 2, top: box.top, width: LINE_THICKNESS, height: box.height }
        : { left: box.left, top: (after ? box.bottom : box.top) - LINE_THICKNESS / 2, width: box.width, height: LINE_THICKNESS } };
}

/**
 * Tells whether a picture stands in a row with the other pictures of its block (side by side),
 * or alone in its block.
 * @param {HTMLElement} picture - the picture.
 * @param {DOMRect} box - its box.
 * @returns {boolean} true in a row, false for pictures above each other.
 */
function isInRow(picture, box) {
    const block = picture.parentElement.closest('[data-p]');
    const others = block ? getElements(PICTURES, block).filter(other => other !== picture) : [];
    return !others.length || others.some(other => { const otherBox = other.getBoundingClientRect(); return otherBox.top < box.bottom - ROW_OVERLAP && otherBox.bottom > box.top + ROW_OVERLAP; });
}
