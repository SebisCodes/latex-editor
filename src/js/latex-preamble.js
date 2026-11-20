/**
 * The preamble of the LaTeX reader:
 *   1. text before \begin{document} is reported once, comments are skipped;
 *   2. \documentclass sets the class and its options (size, paper, landscape, columns …);
 *   3. \usepackage sets what the packages change (geometry, babel, fonts, setspace, xcolor) and
 *      reports packages the preview does not know or cannot show;
 *   4. \begin{document} ends the preamble; another environment is skipped whole;
 *   5. definitions, title fields and settings run through the command tables; anything else is
 *      read with its arguments and reported once.
 */

import { MILLIMETER_PX, PAPERS, ONE_HALF_SPACING, DOUBLE_SPACING } from './latex-units.js?v=3';
import { KNOWN_PACKAGES, NOT_SHOWN_PACKAGES } from './latex-names.js?v=2';
import { findEnvironmentEnd } from './latex-scan.js?v=2';
import { Flow } from './latex-flow.js?v=2';

/** The classes the preview knows (others are shown like article and reported). */
const KNOWN_CLASSES = /^(article|report|book|letter|scrartcl|scrreprt|scrbook|scrlttr2|memoir|amsart|minimal|standalone|beamer|extarticle|extreport|moderncv|IEEEtran|llncs|revtex4|revtex4-1|revtex4-2|kdiartcl|exam|paper|proc)$/;
/** Commands of the preamble that run through the command tables. */
const PREAMBLE_COMMANDS = /^(newcommand|renewcommand|providecommand|def|let|newenvironment|renewenvironment|newtheorem|theoremstyle|DeclareMathOperator|definecolor|colorlet|setlength|linespread|geometry|pagestyle|pagenumbering|setcounter|hypersetup|lstset|onehalfspacing|doublespacing|pagecolor|newcounter|newlength|graphicspath|addtolength|sisetup|usetikzlibrary|newcolumntype|captionsetup|setlist|titleformat|titlespacing|fancyhf|fancyhead|fancyfoot|lhead|chead|rhead|lfoot|cfoot|rfoot|DeclareRobustCommand|NewDocumentCommand|selectlanguage|university|institute|lecture|semester|group|makeatletter|makeatother|PassOptionsToPackage|renewcommandx|newcommandx|frenchspacing|sloppy|hyphenation|nopagecolor|AtBeginDocument|bibliographystyle|addbibresource|color|urlstyle|setmainfont|setsansfont|setmonofont)$/;
/** Commands of the preamble that are skipped without a report although no table has them. */
const QUIET_COMMANDS = /^(makeatletter|makeatother|DeclareUnicodeCharacter|DeclareFontFamily|newif|ifdefined|fi|else|relax|let|global|edef|xdef|gdef|newsavebox|sbox|savebox|input)$/;
/** Packages that make the whole document sans serif (helvet only with an option). */
const SANS_PACKAGES = ['helvet', 'arev', 'cmbright', 'sansmathfonts', 'roboto', 'opensans', 'lato', 'sourcesanspro', 'FiraSans'];
/** Packages for a Times font. */
const TIMES_PACKAGES = ['times', 'mathptmx', 'newtxtext', 'tgtermes'];
/** Packages for a Palatino font. */
const PALATINO_PACKAGES = ['palatino', 'mathpazo', 'tgpagella', 'newpxtext'];

/**
 * Returns the paper of a paper option.
 * @param {string} name - the option, e.g. a4paper.
 * @returns {{w: number, h: number, name: string}} the paper in CSS pixels.
 */
const getPaper = name => ({ w: PAPERS[name][0] * MILLIMETER_PX, h: PAPERS[name][1] * MILLIMETER_PX, name });

/** The renderer methods of this part, mixed into Renderer (latex.js). */
export const PREAMBLE_METHODS = {
    /**
     * Reads the preamble (the steps in the header). Moves the scanner as it reads (a reader).
     * @this {Renderer}
     * @param {Scanner} scan - the scanner over the whole code.
     * @returns {?{a: number}} where the document body starts, or null without \begin{document}.
     */
    readPreamble(scan) {
        const doc = this.doc, text = scan.s;
        while (scan.i < scan.end) {
            const character = text[scan.i];
            if (character === '%') { const lineEnd = text.indexOf('\n', scan.i); scan.i = lineEnd < 0 ? scan.end : lineEnd + 1; continue; }
            if (character !== '\\') { this.addPreambleTextProblem(scan); scan.i++; continue; }
            const pos = scan.i;
            const match = /^\\([A-Za-z@]+|.)/.exec(text.slice(scan.i, scan.i + 40));
            const name = match[1];
            scan.i += match[0].length;
            if (name === 'documentclass') { this.readDocumentClass(scan, pos); continue; }
            if (name === 'usepackage' || name === 'RequirePackage') { this.readPackages(scan, pos, name); continue; }
            if (name === 'begin') {
                const environment = this.getRawText(scan, this.readArgument(scan, 'begin')).trim();
                if (environment === 'document') { doc.meta.hasDocument = true; return { a: scan.i }; }
                const end = findEnvironmentEnd(text, scan.i, scan.end, environment);
                scan.i = end ? end.after : scan.end;
                continue;
            }
            this.readPreambleCommand(scan, pos, name);
        }
        return null;
    },

    /**
     * Reports text before \begin{document}, once per document.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner at the character.
     * @returns {void}
     */
    addPreambleTextProblem(scan) {
        const doc = this.doc, text = scan.s;
        if (/\s/.test(text[scan.i]) || doc.reported.has('pretext')) return;
        const lineEnd = text.indexOf('\n', scan.i);
        doc.addProblem(scan.i, `Text before \\begin{document}: "${text.slice(scan.i, Math.min(lineEnd < 0 ? scan.end : lineEnd, scan.i + 30)).trim()}" - text belongs between \\begin{document} and \\end{document}`, 'error', 'pretext');
    },

    /**
     * Reads \documentclass[options]{class}: the class, font size, paper, orientation, columns,
     * title page, parskip and German; an unknown class is reported.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner after the command.
     * @param {number} pos - the offset of the command.
     * @returns {void}
     */
    readDocumentClass(scan, pos) {
        const doc = this.doc, meta = doc.meta;
        const options = this.readOption(scan);
        meta.cls = this.getRawText(scan, this.readArgument(scan, 'documentclass')).trim();
        for (const option of options ? this.getRawText(scan, options).split(',').map(part => part.trim()) : []) setClassOption(meta, option);
        if (!KNOWN_CLASSES.test(meta.cls)) doc.addProblem(pos, `The document class "${meta.cls}" is shown like "article" in the preview`, 'warning', 'cls');
        if (meta.cls === 'beamer') doc.addProblem(pos, 'Beamer slides are shown as normal pages in the preview', 'warning', 'beamer');
        if (/^ext/.test(meta.cls)) meta.cls = meta.cls.slice(3);
    },

    /**
     * Reads \usepackage[options]{packages}: what each package changes; packages the preview
     * cannot show or does not know are reported once.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner after the command.
     * @param {number} pos - the offset of the command.
     * @param {string} name - usepackage or RequirePackage.
     * @returns {void}
     */
    readPackages(scan, pos, name) {
        const doc = this.doc;
        const options = this.readOption(scan);
        const packages = this.getRawText(scan, this.readArgument(scan, name)).split(',').map(part => part.trim()).filter(Boolean);
        const optionText = options ? this.getRawText(scan, options) : '';
        for (const packageName of packages) {
            doc.meta.packages.push(packageName);
            setPackageOption(doc, packageName, optionText);
            if (NOT_SHOWN_PACKAGES.has(packageName)) doc.addProblem(pos, packageName === 'fontspec' || packageName === 'unicode-math' ? `${packageName} needs XeLaTeX or LuaLaTeX - the preview uses its own fonts` : `${packageName} drawings are not shown in the preview`, 'warning', 'pkg:' + packageName);
            else if (!KNOWN_PACKAGES.has(packageName) && !/^(scr|tikz|pgf)/.test(packageName)) doc.addProblem(pos, `The package "${packageName}" is not known to the preview - its commands may be missing`, 'warning', 'pkg:' + packageName);
        }
    },

    /**
     * Reads any other command of the preamble: definitions, title fields and settings run through
     * the command tables; a macro of the document skips its arguments; anything else is read with
     * its optional and first argument and reported once unless known.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner after the command.
     * @param {number} pos - the offset of the command.
     * @param {string} name - the command name.
     * @returns {void}
     */
    readPreambleCommand(scan, pos, name) {
        const doc = this.doc;
        const handler = this.getCommand(name);
        const flow = new Flow(doc, 'inline', {});
        if (name === 'title' || name === 'author' || name === 'date' || name === 'subtitle' || PREAMBLE_COMMANDS.test(name)) {
            if (name === 'AtBeginDocument' || name === 'urlstyle') { this.readArgument(scan, name); return; }
            if (/^set(main|sans|mono)font$/.test(name)) { this.readOption(scan); this.readArgument(scan, name); this.readOption(scan); return; }
            if (handler) handler.call(this, flow, scan, pos, name);
            return;
        }
        if (doc.macros.has(name)) { const macro = doc.macros.get(name); for (let n = 0; n < macro.n; n++) this.readArgument(scan, name); return; }
        this.readOption(scan);
        const save = scan.i;
        this.moveOverSpace(scan);
        if (scan.s[scan.i] === '{') this.readArgument(scan, name); else scan.i = save;
        if (!handler && !QUIET_COMMANDS.test(name)) doc.addProblem(pos, `\\${name} in the preamble is not understood by the preview`, 'warning', 'pre:' + name);
    },
};

/**
 * Sets what one option of \documentclass changes.
 * @param {Meta} meta - the page settings.
 * @param {string} option - the option.
 * @returns {void}
 */
function setClassOption(meta, option) {
    if (/^1[012]pt$/.test(option)) meta.fs = parseInt(option, 10);
    else if (/^(8|9|14|17|20)pt$/.test(option)) meta.fs = parseInt(option, 10);
    else if (PAPERS[option]) meta.paper = getPaper(option);
    else if (option === 'landscape') meta.landscape = true;
    else if (option === 'twocolumn') meta.twocolumn = true;
    else if (option === 'notitlepage') meta.notitlepage = true;
    else if (option === 'titlepage') meta.forceTitlepage = true;
    else if (/^fontsize=/.test(option)) meta.fs = parseFloat(option.slice(9)) || 10;
    else if (/^paper=/.test(option)) { const paper = option.slice(6) + 'paper'; if (PAPERS[paper]) meta.paper = getPaper(paper); }
    else if (option === 'parskip' || /^parskip=/.test(option)) meta.parskip = true;
    else if (/ngerman|german/.test(option)) meta.ngerman = true;
}

/**
 * Sets what a package with its options changes: geometry, German, parskip, the fonts, line
 * spacing and the color names of xcolor.
 * @param {TexDocument} doc - the document state.
 * @param {string} packageName - the package.
 * @param {string} options - its options as written.
 * @returns {void}
 */
function setPackageOption(doc, packageName, options) {
    const meta = doc.meta;
    if (packageName === 'geometry') doc.setGeometry(options);
    else if (packageName === 'babel' || packageName === 'polyglossia') { if (/ngerman|german|swissgerman|naustrian/.test(options)) meta.ngerman = true; }
    else if (packageName === 'ngerman' || packageName === 'german') meta.ngerman = true;
    else if (packageName === 'parskip') meta.parskip = true;
    else if (SANS_PACKAGES.includes(packageName)) {
        if (/scaled|default|sfdefault/.test(options) || packageName !== 'helvet') meta.sans = packageName !== 'helvet' || /sfdefault/.test(options) ? true : meta.sans;
        meta.sansFont = packageName;
    }
    else if (TIMES_PACKAGES.includes(packageName)) meta.fontFamily = 'times';
    else if (PALATINO_PACKAGES.includes(packageName)) meta.fontFamily = 'palatino';
    else if (packageName === 'setspace') { if (/onehalfspacing/.test(options)) meta.spread = ONE_HALF_SPACING; if (/doublespacing/.test(options)) meta.spread = DOUBLE_SPACING; }
    else if (packageName === 'xcolor' || packageName === 'color') { if (/dvipsnames|svgnames|x11names/.test(options)) meta.dvips = true; }
}
