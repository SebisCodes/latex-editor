/**
 * Moving pictures on the pages. A picture can be dragged to another place: a line shows where
 * it lands (picture-drop.js); on release its code moves (picture-code.js) as one undo step. A
 * click without moving still leads to the code; Escape cancels. With a finger the drag starts
 * after a long press on the picture, so a swipe that starts on a picture still scrolls the pages.
 *
 * A move runs these steps:
 *   1. a press on a picture is remembered (with a finger, a timer starts the drag);
 *   2. the pointer moves far enough: the drag starts, if the pages show the current code;
 *   3. each move shows the drop line; near the top or bottom edge the pages scroll;
 *   4. the release writes the moved code and selects it in the code.
 */

import { state, ui, showToast, getNumberInRange } from './state.js?v=2';
import { setCode, addTypingStep } from './history.js?v=6';
import { showCodePosition } from './code-view.js?v=6';
import { PICTURES, findPictureCode, findGraphicCode, isAloneInCell, getMovedCode, getBesideCode } from './picture-code.js?v=2';
import { getDropTarget } from './picture-drop.js?v=2';

/** How long a finger rests on a picture before the drag starts, in milliseconds. */
const LONG_PRESS = 400;
/** How far a mouse moves before the drag starts, in pixels. */
const MOUSE_MOVE_START = 4;
/** How far a finger may move during the long press before it counts as a swipe, in pixels. */
const TOUCH_MOVE_LIMIT = 8;
/** The band at the top and bottom of the view where the pages scroll, in pixels. */
const SCROLL_EDGE = 48;
const CODE_CHANGED = 'The code changed - wait for the preview, then try again';
let dropLine = null;
/** The picture being pressed or moved, null when none. */
let move = null;
/** True right after a move, so the click that follows the release is no click on the page. */
let suppressClick = false;

/**
 * Remembers a press on a picture (a pointerdown handler); with a finger the drag starts when
 * it rests on the picture, and the line shows where it would land.
 * @param {PointerEvent} event - the press.
 * @returns {void}
 */
function startPicturePress(event) {
    if (event.button !== 0 || move || state.textEdit?.span.isConnected) return;
    const picture = event.target.closest(PICTURES);
    if (!picture || !ui.pages.contains(picture)) return;
    const touch = event.pointerType === 'touch';
    move = { el: picture, id: event.pointerId, touch, sx: event.clientX, sy: event.clientY, x: event.clientX, y: event.clientY, moving: false };
    if (touch) move.timer = setTimeout(() => { if (startMoving()) showDropLine(); }, LONG_PRESS);
}

/**
 * Starts the drag of the pressed picture: it needs pages that show the current code and a
 * picture the code leads to. A command that returns whether it took place.
 * @returns {boolean} true when the drag started.
 */
function startMoving() {
    if (state.renderedCode !== state.code) { Object.assign(move, { moving: true, cancelled: true }); showToast(CODE_CHANGED); return false; }
    const source = findPictureCode(move.el);
    if (!source) { move = null; return false; }
    const graphic = findGraphicCode(move.el);
    Object.assign(move, { moving: true, src: source, pic: graphic, fig: move.el.closest('figure.float[data-p]'), cell: isAloneInCell(move.el, graphic), code: state.code });
    getSelection().removeAllRanges();
    move.el.classList.add('is-dragged');
    document.body.classList.add('picture-drag');
    move.raf = requestAnimationFrame(moveViewAtEdge);
    return true;
}

/**
 * Follows the pointer (a pointermove handler): before the drag a mouse starts it once it moved
 * far enough, a finger that moves before the long press is over scrolls or taps; during the
 * drag the drop line follows.
 * @param {PointerEvent} event - the move.
 * @returns {void}
 */
function moveWithPointer(event) {
    if (!move || event.pointerId !== move.id || move.cancelled) return;
    move.x = event.clientX;
    move.y = event.clientY;
    if (!move.moving) {
        const distance = Math.hypot(move.x - move.sx, move.y - move.sy);
        if (move.touch) { if (distance >= TOUCH_MOVE_LIMIT) stopMoving(false); return; }
        if (distance < MOUSE_MOVE_START || !startMoving()) return;
    }
    event.preventDefault();
    showDropLine();
}

/**
 * Scrolls the pages while the pointer is near their top or bottom edge, once per frame.
 * @returns {void}
 */
function moveViewAtEdge() {
    if (!move?.moving) return;
    const box = ui.scroller.getBoundingClientRect();
    const overshoot = move.y < box.top + SCROLL_EDGE ? -(box.top + SCROLL_EDGE - move.y) : move.y > box.bottom - SCROLL_EDGE ? move.y - (box.bottom - SCROLL_EDGE) : 0;
    if (overshoot) {
        ui.scroller.scrollTop += Math.round(getNumberInRange(overshoot, -SCROLL_EDGE, SCROLL_EDGE) / 2);
        showDropLine();
    }
    move.raf = requestAnimationFrame(moveViewAtEdge);
}

/**
 * Shows the line (or frame) where the picture would land under the pointer.
 * @returns {void}
 */
function showDropLine() {
    const target = getDropTarget(move, move.x, move.y);
    move.target = target;
    dropLine.hidden = !target;
    if (!target) return;
    dropLine.classList.toggle('swap', !!target.swap);
    for (const side of ['left', 'top', 'width', 'height']) dropLine.style[side] = target.box[side] + 'px';
}

/**
 * Ends a press or a drag; with drop, a drag that has a place writes the moved code.
 * @param {boolean} drop - true on release, false to cancel.
 * @returns {void}
 */
function stopMoving(drop) {
    const ended = move;
    if (!ended) return;
    move = null;
    clearTimeout(ended.timer);
    cancelAnimationFrame(ended.raf);
    dropLine.hidden = true;
    ended.el.classList.remove('is-dragged');
    document.body.classList.remove('picture-drag');
    if (!ended.moving) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (drop && ended.target) writeMove(ended);
}

/**
 * Writes the code of a finished move as one undo step and selects the moved code.
 * @param {object} ended - the move that ended, with its target.
 * @returns {void}
 */
function writeMove(ended) {
    if (state.code !== ended.code) { showToast(CODE_CHANGED); return; }
    const moved = ended.target.pic ? getBesideCode(state.code, ended.pic, ended.target) : getMovedCode(state.code, ended.src, ended.target.at);
    if (!moved) return;
    addTypingStep();
    setCode(moved.code);
    showCodePosition(moved.from, false, moved.to);
}

/**
 * Cancels a drag with Escape: the picture stays; the release that follows still ends the move
 * (a keydown handler in the capture phase).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function stopMoveOnEscape(event) {
    if (event.key !== 'Escape' || !move?.moving || move.cancelled) return;
    event.preventDefault();
    event.stopPropagation();
    Object.assign(move, { cancelled: true, target: null });
    cancelAnimationFrame(move.raf);
    dropLine.hidden = true;
    move.el.classList.remove('is-dragged');
    document.body.classList.remove('picture-drag');
}

/**
 * Creates the drop line and connects the pointer, touch and key events of a move.
 * @returns {void}
 */
export function startPictureMoving() {
    dropLine = document.createElement('div');
    dropLine.className = 'insert-line';
    dropLine.hidden = true;
    document.body.append(dropLine);
    ui.pages.addEventListener('pointerdown', startPicturePress);
    window.addEventListener('pointermove', moveWithPointer);
    // While a finger drags a picture, the pages do not scroll; the long press brings no menu.
    document.addEventListener('touchmove', event => { if (move?.moving) event.preventDefault(); }, { passive: false });
    ui.pages.addEventListener('contextmenu', event => { if (move?.touch) event.preventDefault(); });
    // Capture: the release is the end of the move, not a click to edit the text under it.
    window.addEventListener('pointerup', event => {
        if (!move || event.pointerId !== move.id) return;
        if (move.moving) event.stopPropagation();
        stopMoving(true);
    }, true);
    window.addEventListener('pointercancel', event => { if (move && event.pointerId === move.id) stopMoving(false); });
    window.addEventListener('keydown', stopMoveOnEscape, true);
    window.addEventListener('click', event => { if (suppressClick) { event.stopPropagation(); event.preventDefault(); } }, true);
    ui.pages.addEventListener('dragstart', event => { if (event.target.closest?.(PICTURES)) event.preventDefault(); });
}
