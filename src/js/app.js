/**
 * LaTeX editor: the code on the left, the typeset pages on the right, the document settings
 * beside them. This file starts the editor and wires its areas together; each area has its own
 * module (state.js describes the shared state).
 *
 * The code is the single source of truth: the pages are rendered from it (latex.js,
 * viewer.js), and the settings, the insert buttons and the text edited on the pages change the
 * code. Every element of the pages carries data-p, its place in the code, so a click on a page
 * leads to the code and the cursor in the code to the page.
 *
 * Start-up steps:
 *   1. the interface language (the AI prompt stays English) and the line wrap of the code;
 *   2. connect the code view, the pages, the side panel, the documents, opening files, the
 *      keyboard, the layout, the Export dialog, the dialogs and the controls of template
 *      placeholders, in the order their listeners take events;
 *   3. take the stored settings and open the last document (or the welcome example);
 *   4. draw the code, and the pages once the fonts and the document's pictures are there;
 *   5. start the AI Assistant, the WebMCP tools, the AI status, "Open in another editor" and
 *      sync.js (webhook, embedding, ?src=);
 *   6. offer the test hook window.latexEditor.
 */

import { createI18n } from './i18n.js?v=26';
import { createWrap } from './wrap.js?v=5';
import { createAiStatus } from './aistatus.js?v=9';
import { createSync, VIEWER } from './sync.js?v=24';
import './export-menu.js?v=6';
import { startConvert } from './convert-to.js?v=14';
import { START } from './samples.js?v=3';
import { store } from './files.js?v=11';
import { assets } from './assets.js?v=6';
import { createAi } from './ai.js?v=17';
import { createMcp } from './mcp.js?v=6';
import { formatLatex } from './latex-tidy.js?v=3';
import { drawPageCanvas } from './page-export.js?v=5';
import { state, ui, areas, PREFIX, getElement, showToast } from './state.js?v=2';
import { getSettings, startStorageSync } from './storage.js?v=5';
import { renderCode, moveCodeLayers, showCodePosition, startCursorLine, startCodeView } from './code-view.js?v=5';
import { setCode, addHistoryStep, undo, redo } from './history.js?v=5';
import { renderPreview, startPreview, startFontsWatch, getExportPages, startPreviewTimer } from './preview.js?v=5';
import { setZoom, showPage, startZoom } from './zoom.js?v=5';
import { startPageClicks, startTextEditing } from './text-edit.js?v=5';
import { startPictureMoving } from './picture-move.js?v=5';
import { startProblems } from './problems.js?v=5';
import { startTyping } from './typing.js?v=5';
import { renderInsertPanel, startToolbarSnippets, startInsertPanel } from './insert-panel.js?v=5';
import { startPicturesTab } from './pictures-tab.js?v=5';
import { startSettingsPanel } from './settings-panel.js?v=5';
import { startOutline } from './outline.js?v=5';
import { showFileName, openDocument, createDocumentsDialog, startDocumentButtons } from './documents.js?v=5';
import { showFilePicker, startFileImport } from './file-import.js?v=5';
import { startKeyboard } from './keyboard.js?v=5';
import { showSplit, startLayout, startDialogs } from './layout.js?v=5';
import { startExportDialog } from './export-dialog.js?v=5';
import { startTemplateControls } from './template-panel.js?v=1';
import { createTemplateExamples } from './template-examples.js?v=1';
import { createPicturePdf, runPrint } from './export.js?v=5';
import { getPlainText } from './latex.js?v=16';
import { receiveDocument, importExternalDocument } from './incoming.js?v=5';
import {
    getPromptState, getProblemList, getSectionList, getFileList, openFileByName, createFile, addLatex, updateText, showLine,
} from './agent-api.js?v=5';

/** The fonts of the pages, loaded before the first pages are laid out. */
const PAGE_FONTS = ['400 16px "LM Roman"', '700 16px "LM Roman"', 'italic 400 16px "LM Roman"', '400 16px "LM Mono"', '400 16px "LM Sans"', '700 16px "LM Sans"'];
/** How often a picture that could not be stored is reported, at most, in milliseconds. */
const NOT_STORED_INTERVAL = 60000;
/** The scale of the page pictures the test hook returns. */
const TEST_PICTURE_SCALE = 1.5;
let notStoredWarnedAt = 0;

startEditor();

/**
 * Starts the editor (the flow of the steps in the header).
 * @returns {void}
 */
function startEditor() {
    startLanguageAndWrap();
    connectAreas();
    applyMemoryForPageFiles();
    openStartDocument();
    renderStart();
    startFontsWatch();
    window.latexEditor = createTestHook();
}

/**
 * Starts the interface language (translated at run time, see i18n.js) and the line wrap of
 * the code view (wrap.js), which draws the line numbers.
 * @returns {void}
 */
function startLanguageAndWrap() {
    areas.i18n = createI18n({
        prefix: 'latexeditor',
        roots: '.header, .views, #work, #ai-receive, #toast, .storage-hint, dialog',
        skip: '',
    });
    areas.lineWrap = createWrap({
        prefix: PREFIX, ta: ui.ta, layers: [ui.hl, ui.marks], gutter: ui.gutter, button: document.getElementById('btn-wrap'),
        onChange: () => { renderCode(); moveCodeLayers(); },
    });
}

/**
 * Connects the areas of the page, in the order their listeners take events.
 * @returns {void}
 */
function connectAreas() {
    startStorageSync();
    startCursorLine();
    startPreview();
    startPageClicks();
    startTextEditing();
    startPictureMoving();
    startZoom();
    startProblems();
    startCodeView();
    startTyping();
    startToolbarSnippets();
    startInsertPanel();
    startPicturesTab();
    startSettingsPanel();
    startOutline();
    connectTidyButton();
    areas.files = createDocumentsDialog(showFilePicker);
    startDocumentButtons();
    startFileImport();
    startKeyboard();
    startLayout();
    startExportDialog();
    startDialogs();
    startTemplateControls();
}

/**
 * Connects the Tidy button: re-indents the code as one undo step.
 * @returns {void}
 */
function connectTidyButton() {
    getElement('#btn-format').addEventListener('click', formatCodeAsStep);
}

/**
 * Re-indents the code as one undo step and tells the user, also when it is tidy already.
 * @returns {void}
 */
function formatCodeAsStep() {
    const tidied = formatLatex(state.code);
    if (tidied === state.code) { showToast('The code is tidy already'); return; }
    setCode(tidied);
    showToast('Code tidied up');
}

/**
 * Keeps the pictures of documents from a page in memory like the documents; a picture that
 * could not be stored is kept until the page closes, and the user is told (at most once a minute).
 * @returns {void}
 */
function applyMemoryForPageFiles() {
    assets.setMemoryOnlyRule(id => VIEWER || store.isInMemory(id));
    assets.setNotStoredHandler(showNotStoredWarning);
}

/**
 * Tells the user that a picture could not be stored in the browser, at most once a minute.
 * @returns {void}
 */
function showNotStoredWarning() {
    const now = Date.now();
    if (now - notStoredWarnedAt < NOT_STORED_INTERVAL) return;
    notStoredWarnedAt = now;
    showToast('The picture could not be stored in this browser (storage full or blocked) - it is kept only until the page is closed: download the document to keep it');
}

/**
 * Takes the stored settings and opens the last document, or the welcome example when
 * "My documents" is empty; with the storage blocked, the example without saving.
 * @returns {void}
 */
function openStartDocument() {
    const settings = getSettings();
    if (settings) {
        if (settings.split) state.split = settings.split;
        if ('fit' in settings) state.fit = settings.fit;
        if (settings.zoom) state.zoom = settings.zoom;
    }
    showSplit();
    let code = null;
    try {
        if (!store.list().length) store.create(START.name, START.code);
        const entry = store.getEntry(settings?.file) || store.getSortedEntries()[0];
        code = store.code(entry.id);
        if (code != null) { state.fileId = entry.id; state.name = entry.name; state.savedCode = code; state.assets = assets.getCached(entry.id); }
    } catch (e) { /* storage blocked: one document without saving */ }
    if (code == null) { code = START.code; state.name = START.name; }
    state.code = code;
}

/**
 * Draws the code of the start document; once the fonts of the pages and the document's
 * pictures are there, renders the pages, makes the first undo step and starts the AI and sync.
 * @returns {void}
 */
function renderStart() {
    ui.ta.value = state.code;
    showFileName();
    renderInsertPanel();
    renderCode();
    const fonts = PAGE_FONTS.map(font => document.fonts.load(font).catch(() => null));
    const pictures = state.fileId ? assets.get(state.fileId).then(files => { state.assets = files; }) : null;
    Promise.all([...fonts, pictures]).then(renderStartDocument);
}

/**
 * Renders the pages of the start document with its fonts and pictures, makes its first undo
 * step and starts the AI and sync.
 * @returns {void}
 */
function renderStartDocument() {
    renderInsertPanel();
    renderPreview();
    addHistoryStep();
    moveCodeLayers();
    startAiAndSync();
}

/**
 * Starts the AI Assistant, the WebMCP tools, the AI status, "Open in another editor" and
 * sync.js. The callbacks reach the areas through `areas`, so each may start after the ones
 * it calls.
 * @returns {void}
 */
function startAiAndSync() {
    areas.ai = createAi({
        getState: getPromptState,
        receiveDocument: async (...args) => { setTimeout(() => areas.aiStatus.addDelivery('link')); await receiveDocument(...args); return state.fileId; },
        tryOpenDocument: id => { if (!store.getEntry(id)) return false; openDocument(id); return true; },
        showToast,
        getRemote: () => areas.sync?.getAiSettings() || null,
        fetchKey: () => (areas.sync ? areas.sync.fetchKey() : Promise.resolve(null)),
        hasValidKey: () => !!areas.sync?.hasValidKey(),
        handleAiClick: openEditorDialog => (areas.sync ? areas.sync.handleAiClick(openEditorDialog) : openEditorDialog()),
        getKeyDecline: () => areas.sync?.getKeyDecline() || '',
    });
    const agent = createMcp({
        onUse: () => areas.aiStatus.addDelivery('agent'),
        getState: getPromptState,
        getProblems: getProblemList,
        getOutline: getSectionList,
        getFiles: getFileList,
        openFileByName,
        createFile,
        receiveDocument,
        addLatex,
        updateText,
        showLine,
        undo,
    });
    areas.aiStatus = createAiStatus({
        prefix: PREFIX, btn: document.getElementById('btn-ai'), box: document.getElementById('ai-status'),
        remote: () => areas.sync?.getAiSettings() || null, agent: () => agent,
    });
    startConvert({ editor: 'latex', code: () => state.code, name: () => state.name, toast: showToast, t: text => areas.i18n.translate(text), hasFiles: () => Object.keys(state.assets || {}).length > 0 });
    areas.sync = createSync(createSyncEditor());
}

/**
 * Creates what sync.js gets from the editor; the property names are sync.js's contract.
 * @returns {object} the adapter.
 */
function createSyncEditor() {
    return {
        onAiResult: () => areas.aiStatus.addDelivery('page'),
        onAiEnd: () => areas.aiStatus.resetDelivery(),
        prefix: PREFIX, editor: 'latex', word: 'document', files: true,
        tidy: code => formatLatex(code),
        current: () => ({ id: state.fileId, name: state.name, content: state.code, assets: state.assets }),
        load: importExternalDocument,
        toast: showToast,
        hookFor: id => store.getEntry(id)?.hook || null,
        setHookFor: (id, hook) => { try { store.setEntryFields(id, { hook }); } catch (e) { showToast('The browser storage is full'); } },
        onAi: () => areas.ai?.updateRemote(),
        pdf: createPicturePdf,
        parseTemplate: message => createTemplateExamples(message),
        onTemplate: () => startPreviewTimer(),
    };
}

/**
 * Creates the hook for automated UI tests (window.latexEditor); its keys are the ones the tests call.
 * @returns {object} the state and the functions the tests call.
 */
function createTestHook() {
    return {
        state, store, assets, setCode, undo, redo, renderPreview, zoomTo: setZoom, goPage: showPage, receive: receiveDocument,
        revealInCode: showCodePosition, sync: () => areas.sync, print: runPrint, templateText: () => getPlainText(getExportPages().result.blocks),
        pagePng: (index = 0, scale = TEST_PICTURE_SCALE) => drawPageCanvas(state.pages[index], scale).then(canvas => canvas.toDataURL()),
    };
}
