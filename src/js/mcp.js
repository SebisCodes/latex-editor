/**
 * WebMCP: the editor offers its functions as tools to an AI agent that runs in the browser
 * (document.modelContext, in Chrome as an early preview). The tools run in this page only -
 * no server, no connector. Browsers without WebMCP skip this. Every change is a normal undo
 * step.
 *
 * The text tools work on the open document; list_files, open_file and new_file reach the
 * user's other documents ("My documents"). The tool names, descriptions and parameters are the
 * contract with the agents and stay as they are.
 *
 * createMcp() runs these steps:
 *   1. find WebMCP; without it, return null;
 *   2. wrap every tool so a call notes its time and tells the editor;
 *   3. register the tools;
 *   4. return { last() }, when an agent last used a tool (for the AI status in aistatus.js).
 */

/**
 * A section as list_sections describes it.
 * @typedef {object} AgentSection
 * @property {number} level - its level (1 for \section, 0 for \chapter, -1 for \part …).
 * @property {string} num - its number, "" without one.
 * @property {string} title - its title.
 * @property {number} line - its line.
 */

/**
 * What the editor hands to createMcp(); the functions throw an Error with a message for
 * the agent when a call cannot be done.
 * @typedef {object} McpEditor
 * @property {function(): void} [onUse] - a tool was called.
 * @property {function(): object} getState - what the agent sees: name, sel, pictures and code.
 * @property {function(): Array<{line: number, kind: string, msg: string}>} getProblems - the problems.
 * @property {function(): AgentSection[]} getOutline - the sections of the document.
 * @property {function(): Array<{name: string, updated: number, open: boolean}>} getFiles - the documents.
 * @property {function(string): boolean} openFileByName - opens a document by name; false when there is none.
 * @property {function(string, string): (string|null)} createFile - makes and opens a document; its name, null when storage is full.
 * @property {function(string, string, object): Promise<void>} receiveDocument - takes a whole document.
 * @property {function(string, string): boolean} addLatex - inserts LaTeX at the end, the cursor or after a section's heading; false when the section is missing.
 * @property {function(string, string, boolean): number} updateText - replaces text (the work of replace_text); how many times.
 * @property {function(number): void} showLine - shows a line of the code.
 * @property {function(): void} undo - undoes the last change.
 */

/**
 * What createMcp() returns, read by the AI status.
 * @typedef {object} McpStatus
 * @property {function(): number} last - when an agent last used a tool (milliseconds since 1970), 0 for never.
 */

/**
 * Registers the editor's WebMCP tools (an initializeX: it returns the status object).
 * @param {McpEditor} editor - what the tools need of the editor.
 * @returns {McpStatus|null} the status, null without WebMCP.
 */
export function createMcp(editor) {
    const modelContext = document.modelContext || navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') return null;
    let lastCall = 0;
    for (const tool of createTools(editor)) {
        const run = tool.execute;
        /**
         * Runs the tool after noting the call for the AI status.
         * @param {...*} args - the tool's arguments.
         * @returns {Promise<*>} the tool's answer.
         */
        tool.execute = async (...args) => { lastCall = Date.now(); editor.onUse?.(); return run(...args); };
        addTool(modelContext, tool);
    }
    return { last: () => lastCall };
}

/**
 * Registers one tool; a tool the browser refuses is left out.
 * @param {object} modelContext - the browser's WebMCP object.
 * @param {object} tool - the tool.
 * @returns {void}
 */
function addTool(modelContext, tool) {
    try {
        const result = modelContext.registerTool(tool);
        if (result && typeof result.catch === 'function') result.catch(() => { /* not available on this page */ });
    } catch (e) { /* the browser refused this tool */ }
}

/**
 * Creates the tools with their descriptions, input schemas and functions.
 * @param {McpEditor} editor - what the tools need of the editor.
 * @returns {object[]} the tools in the order they are registered.
 */
function createTools(editor) {
    return [
        {
            name: 'get_document',
            description: 'Returns the name and the LaTeX code of the document open in the editor, the selected text and the pictures it can use.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getDocument,
        },
        {
            name: 'get_problems',
            description: 'Lists the errors and warnings the preview finds in the document, with line numbers.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true },
            execute: getProblems,
        },
        {
            name: 'list_sections',
            description: 'Lists the sections of the document (number, title, line).',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getSectionList,
        },
        {
            name: 'set_document',
            description: 'Replaces the whole open document with new LaTeX code (\\documentclass … \\begin{document} … \\end{document}). Keep the user\'s existing work unless asked otherwise.',
            inputSchema: { type: 'object', properties: { latex: { type: 'string', description: 'The complete LaTeX code.' } }, required: ['latex'] },
            execute: setDocument,
        },
        {
            name: 'insert_text',
            description: 'Inserts LaTeX into the open document: at the end (before \\end{document}), at the cursor, or right after the section with the given title.',
            inputSchema: {
                type: 'object',
                properties: {
                    latex: { type: 'string', description: 'The LaTeX to insert.' },
                    where: { type: 'string', description: '"end" (default), "cursor", or the title of a section to insert after its heading.' },
                },
                required: ['latex'],
            },
            execute: runInsertText,
        },
        {
            name: 'replace_text',
            description: 'Replaces an exact piece of the LaTeX code with new text (the first match, or every match with all=true).',
            inputSchema: {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'The exact text to find in the code.' },
                    replace: { type: 'string', description: 'The new text.' },
                    all: { type: 'boolean', description: 'Replace every match.' },
                },
                required: ['find', 'replace'],
            },
            execute: runReplaceText,
        },
        {
            name: 'show_line',
            description: 'Moves the cursor to a line of the code and shows that place in the preview, so the user sees it.',
            inputSchema: { type: 'object', properties: { line: { type: 'number', description: 'Line number (1 = first line).' } }, required: ['line'] },
            execute: showLine,
        },
        {
            name: 'list_files',
            description: 'Lists the user\'s documents stored in the editor ("My documents"), most recently changed first, and which one is open.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getFileList,
        },
        {
            name: 'open_file',
            description: 'Opens one of the user\'s documents by name; the other tools then work on it.',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name from list_files.' } }, required: ['name'] },
            execute: openFile,
        },
        {
            name: 'new_file',
            description: 'Creates a new document and opens it; the user\'s other documents stay unchanged. Without latex it starts from a short empty article.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'A short name for the document.' },
                    latex: { type: 'string', description: 'Optional: the complete LaTeX code.' },
                },
                required: ['name'],
            },
            execute: runCreateFile,
        },
        {
            name: 'undo',
            description: 'Undoes the last change in the editor.',
            inputSchema: { type: 'object', properties: {} },
            execute: undo,
        },
    ];

    /**
     * get_document: the open document, the selection and its pictures.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getDocument() {
        const state = editor.getState();
        return `Document: "${state.name}"\n${state.sel ? `Selected: ${state.sel}\n` : ''}${state.pictures.length ? `Pictures: ${state.pictures.join(', ')}\n` : ''}\n${state.code}`;
    }

    /**
     * get_problems: the problems with their lines.
     * @returns {Promise<string>} one problem per line, or "No problems.".
     */
    async function getProblems() {
        const problems = editor.getProblems();
        return problems.length ? problems.map(problem => `line ${problem.line} (${problem.kind}): ${problem.msg}`).join('\n') : 'No problems.';
    }

    /**
     * list_sections: the sections, indented by level, with number, title and line.
     * @returns {Promise<string>} one section per line.
     */
    async function getSectionList() {
        const outline = editor.getOutline();
        return outline.length ? outline.map(section => `${'  '.repeat(Math.max(0, section.level - 1))}${section.num ? section.num + ' ' : ''}${section.title} (line ${section.line})`).join('\n') : 'The document has no sections.';
    }

    /**
     * set_document: a whole new code for the open document.
     * @param {object} input - the tool's input.
     * @param {string} input.latex - the complete LaTeX code.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the code is empty.
     */
    async function setDocument({ latex }) {
        if (!String(latex || '').trim()) throw new Error('The document is empty.');
        editor.receiveDocument(latex, 'replace', { direct: true });
        const errors = editor.getProblems().filter(problem => problem.kind === 'error');
        return errors.length ? `Loaded, with ${errors.length} error(s) - see get_problems.` : 'The document is in the editor.';
    }

    /**
     * insert_text: LaTeX at the end, at the cursor or after a section's heading.
     * @param {object} input - the tool's input.
     * @param {string} input.latex - the LaTeX.
     * @param {string} [input.where] - "end", "cursor" or a section's title.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when there is no such section.
     */
    async function runInsertText({ latex, where }) {
        if (!editor.addLatex(String(latex || ''), String(where || 'end'))) throw new Error(`No section "${where}" - call list_sections.`);
        return 'Inserted.';
    }

    /**
     * replace_text: an exact piece of the code replaced.
     * @param {object} input - the tool's input.
     * @param {string} input.find - the text.
     * @param {string} input.replace - its replacement.
     * @param {boolean} [input.all] - true for every match.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the text is not found.
     */
    async function runReplaceText({ find, replace, all }) {
        const count = editor.updateText(String(find || ''), String(replace ?? ''), !!all);
        if (!count) throw new Error('The text was not found - call get_document to see the exact code.');
        return `Replaced ${count} time${count === 1 ? '' : 's'}.`;
    }

    /**
     * show_line: the cursor on a line, shown in the preview.
     * @param {object} input - the tool's input.
     * @param {number} input.line - the line number.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function showLine({ line }) {
        editor.showLine(Math.max(1, Math.round(+line || 1)));
        return `Showing line ${line}.`;
    }

    /**
     * list_files: the user's documents, the open one marked.
     * @returns {Promise<string>} one document per line.
     */
    async function getFileList() {
        return editor.getFiles().map(file => `${file.open ? '* ' : '  '}"${file.name}" (changed ${new Date(file.updated).toISOString().slice(0, 16).replace('T', ' ')})`).join('\n') + '\n(* = open now)';
    }

    /**
     * open_file: one of the user's documents.
     * @param {object} input - the tool's input.
     * @param {string} input.name - the document's name.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when there is no document of that name.
     */
    async function openFile({ name }) {
        if (!editor.openFileByName(name)) throw new Error(`No document "${name}" - call list_files.`);
        return `"${name}" is open.`;
    }

    /**
     * new_file: a new document, opened.
     * @param {object} input - the tool's input.
     * @param {string} input.name - its name.
     * @param {string} [input.latex] - its code.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the browser storage is full.
     */
    async function runCreateFile({ name, latex }) {
        const createdName = editor.createFile(name, latex);
        if (!createdName) throw new Error('The browser storage is full.');
        return `New document "${createdName}" is open.`;
    }

    /**
     * undo: the last change undone.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function undo() {
        editor.undo();
        return 'Undone.';
    }
}
