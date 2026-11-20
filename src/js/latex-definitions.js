/**
 * Definitions of the LaTeX reader: macros (\newcommand, \def, \let, \NewDocumentCommand), environments
 * (\newenvironment), theorems (\newtheorem, \theoremstyle) and math operators.
 */

/** @type {Object<string, CommandHandler>} */
export const DEFINITION_COMMANDS = {
    /**
     * \newcommand: defines a macro.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    newcommand(flow, scan, pos, name) { this.addMacroDefinition(scan, pos, name); },
    /**
     * \renewcommand: defines a macro again, or changes a setting such as \baselinestretch.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    renewcommand(flow, scan, pos, name) { this.addMacroDefinition(scan, pos, name); },
    /**
     * \providecommand: defines a macro unless the name is known.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    providecommand(flow, scan, pos, name) { this.addMacroDefinition(scan, pos, name); },
    /**
     * \DeclareRobustCommand: defines a macro.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    DeclareRobustCommand(flow, scan, pos, name) { this.addMacroDefinition(scan, pos, name); },
    /**
     * \NewDocumentCommand: defines a macro with xparse; mandatory arguments (m) count.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    NewDocumentCommand(flow, scan, pos) {
        const n = this.getRawText(scan, this.readArgument(scan, 'NewDocumentCommand')).trim().replace(/^\\/, '');
        const spec = this.getRawText(scan, this.readArgument(scan, 'NewDocumentCommand'));
        const body = this.getRawText(scan, this.readArgument(scan, 'NewDocumentCommand'));
        this.doc.macros.set(n, { n: (spec.match(/m/g) || []).length, def: null, body });
    },
    /**
     * \def: defines a macro in the form \def\name#1{…}.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    def(flow, scan, pos) {
        const s = scan.s;
        const m = /^\s*\\([A-Za-z@]+)((?:#\d)*)\s*\{/.exec(s.slice(scan.i, scan.i + 80));
        if (!m) { this.doc.addProblem(pos, '\\def is only understood in the form \\def\\name{…}', 'warning', 'def'); return; }
        scan.i += m[0].length - 1;
        const r = this.readArgument(scan, 'def');
        this.doc.macros.set(m[1], { n: (m[2].match(/#/g) || []).length, def: null, body: this.getRawText(scan, r) });
    },
    /**
     * \let: makes a name mean the same as another macro or command.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    let(flow, scan) {
        const m = /^\s*\\([A-Za-z@]+)\s*=?\s*\\([A-Za-z@]+)/.exec(scan.s.slice(scan.i, scan.i + 80));
        if (!m) return;
        scan.i += m[0].length;
        const src = this.doc.macros.get(m[2]);
        this.doc.macros.set(m[1], src || { n: 0, def: null, body: '\\' + m[2] });
    },
    /**
     * \newenvironment: defines an environment by its begin and end code.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @param {string} name - the command name as used (the handler serves several names).
     * @returns {void}
     */
    newenvironment(flow, scan, pos, name) {
        this.readStar(scan);
        const n = this.getRawText(scan, this.readArgument(scan, name)).trim();
        const cnt = this.readOption(scan);
        const def = this.readOption(scan);
        const b = this.readArgument(scan, name);
        const e = this.readArgument(scan, name);
        this.doc.envs.set(n, { n: cnt ? parseInt(this.getRawText(scan, cnt), 10) || 0 : 0, def: def ? this.getRawText(scan, def) : null, begin: this.getRawText(scan, b), end: this.getRawText(scan, e) });
    },
    /**
     * \renewenvironment: defines an environment again.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    renewenvironment(flow, scan, pos) { DEFINITION_COMMANDS.newenvironment.call(this, flow, scan, pos, 'renewenvironment'); },
    /**
     * \newtheorem: defines a theorem environment with its title, counter and style.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset of the command in the code.
     * @returns {void}
     */
    newtheorem(flow, scan, pos) {
        const star = this.readStar(scan);
        const n = this.getRawText(scan, this.readArgument(scan, 'newtheorem')).trim();
        const shared = this.readOption(scan);
        const title = this.renderInline(scan, this.readArgument(scan, 'newtheorem')).replace(/<[^>]+>/g, '');
        const within = this.readOption(scan);
        this.doc.theorems.set(n, { title, star, shared: shared ? this.getRawText(scan, shared).trim() : null, within: within ? this.getRawText(scan, within).trim() : null, style: this.doc.thmStyle || 'plain' });
    },
    /**
     * \theoremstyle: the style of the following \newtheorem; only plain, definition and remark are taken.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    theoremstyle(flow, scan) {
        const st = this.getRawText(scan, this.readArgument(scan, 'theoremstyle')).trim();
        if (/^(plain|definition|remark)$/.test(st)) this.doc.thmStyle = st;
    },
    /**
     * \DeclareMathOperator: defines a math operator for KaTeX.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    DeclareMathOperator(flow, scan) {
        const star = this.readStar(scan);
        const n = this.getRawText(scan, this.readArgument(scan, 'DeclareMathOperator')).trim().replace(/^\\/, '');
        const b = this.getRawText(scan, this.readArgument(scan, 'DeclareMathOperator'));
        this.doc.mathOps[n] = `\\operatorname${star ? '*' : ''}{${b}}`;
    },
};

/* \newcommandx works as \newcommand. */
DEFINITION_COMMANDS.newcommandx = DEFINITION_COMMANDS.newcommand;

/** The renderer methods of this part, mixed into Renderer (latex.js). */
export const DEFINITION_METHODS = {
    /**
     * Adds a macro of \newcommand, \renewcommand, \providecommand or \DeclareRobustCommand. A few
     * names change settings (\baselinestretch, \familydefault, \thefootnote, the names of
     * headings); \newcommand of a known macro is reported.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner after the command.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the defining command.
     * @returns {void}
     */
    addMacroDefinition(scan, pos, name) {
        const doc = this.doc;
        this.readStar(scan);
        this.moveOverSpace(scan);
        let n;
        if (scan.s[scan.i] === '{') n = this.getRawText(scan, this.readArgument(scan, name)).trim();
        else { const r = this.readArgument(scan, name); n = r ? this.getRawText(scan, r).trim() : ''; }
        n = n.replace(/^\\/, '');
        const cnt = this.readOption(scan);
        const def = this.readOption(scan);
        const body = this.readArgument(scan, name);
        if (!n) { doc.addProblem(pos, `\\${name} needs a name, e.g. \\${name}{\\name}{text}`, 'error'); return; }
        if (name === 'providecommand' && (doc.macros.has(n) || this.getCommand(n))) return;
        if (name === 'newcommand' && doc.macros.has(n)) doc.addProblem(pos, `\\${n} is defined twice - use \\renewcommand to change it`, 'warning');
        // \renewcommand of a few known names changes a setting, not a macro.
        const bodyText = this.getRawText(scan, body);
        if (n === 'familydefault') { doc.meta.sans = /sfdefault/.test(bodyText); return; }
        if (n === 'baselinestretch') { doc.meta.spread = parseFloat(bodyText) || 1; return; }
        if (n === 'arraystretch') { doc.meta.arraystretch = parseFloat(bodyText) || 1; return; }
        if (n === 'thefootnote' && /fnsymbol/.test(bodyText)) { doc.footSymbols = true; return; }
        if (/^(contentsname|refname|bibname|figurename|tablename|abstractname|chaptername|partname|appendixname)$/.test(n)) {
            doc.names = doc.names || {};
            doc.names[n] = bodyText;
            return;
        }
        doc.macros.set(n, { n: cnt ? Math.min(9, parseInt(this.getRawText(scan, cnt), 10) || 0) : 0, def: def ? this.getRawText(scan, def) : null, body: bodyText });
    },
};
