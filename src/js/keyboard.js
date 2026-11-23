/**
 * The editor's keyboard shortcuts. Ctrl/Cmd+S saves, +E opens Export, +O "My documents", +P
 * prints, + and - zoom the pages (outside the code); Escape closes the "New" menu. Undo, Redo,
 * Page Up / Page Down (pages) and "?" (help) pause while the user types into a field or a
 * dialog is open.
 */

import { openDialog } from './dialogs.js?v=5';
import { state, ui, areas, getElement } from './state.js?v=2';
import { undo, redo } from './history.js?v=5';
import { setZoom, getCurrentPage, showPage, ZOOM_STEP } from './zoom.js?v=5';
import { saveQuickly, openExportDialog } from './export-dialog.js?v=5';
import { runPrint } from './export.js?v=5';
import { setNewMenuOpen, isNewMenuOpen } from './documents.js?v=5';

/** Fields the user types into: shortcuts without Ctrl pause there, and pasting goes into them. */
export const TYPING_FIELDS = 'textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button])';

/**
 * Connects the shortcuts of the editor page.
 * @returns {void}
 */
export function startKeyboard() {
    window.addEventListener('keydown', handleShortcut);
}

/**
 * Runs the shortcut of a key (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleShortcut(event) {
    const active = document.activeElement;
    const typing = active && active.matches(TYPING_FIELDS);
    const modifier = event.ctrlKey || event.metaKey;
    if (runCommandShortcut(event, modifier, active)) return;
    if (typing || getElement('dialog[open]')) return;
    if (modifier && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (modifier && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (modifier) return;
    if (event.key === 'PageDown') { event.preventDefault(); showPage(getCurrentPage() + 1); return; }
    if (event.key === 'PageUp') { event.preventDefault(); showPage(getCurrentPage() - 1); return; }
    if (event.key === '?') openDialog(getElement('#help'));
}

/**
 * Runs the shortcuts that work everywhere: save, Export, "My documents", print, the zoom
 * (outside the code) and Escape for the "New" menu. A command that returns whether it took
 * place.
 * @param {KeyboardEvent} event - the key.
 * @param {boolean} modifier - true with Ctrl or Cmd.
 * @param {Element|null} active - the element with the focus.
 * @returns {boolean} true when the key was such a shortcut.
 */
function runCommandShortcut(event, modifier, active) {
    const commands = { s: saveQuickly, e: openExportDialog, o: () => areas.files.open(), p: runPrint };
    if (modifier && Object.hasOwn(commands, event.key)) { event.preventDefault(); commands[event.key](); return true; }
    if (modifier && (event.key === '+' || event.key === '=') && active !== ui.ta) { event.preventDefault(); setZoom(state.zoom * ZOOM_STEP); return true; }
    if (modifier && event.key === '-' && active !== ui.ta) { event.preventDefault(); setZoom(state.zoom / ZOOM_STEP); return true; }
    if (event.key === 'Escape' && isNewMenuOpen()) { setNewMenuOpen(false); return true; }
    return false;
}
