/**
 * Commands of the LaTeX reader for page settings, counters, lengths, title fields, languages, siunitx
 * units and a few text commands (\MakeUppercase, \enquote …); also the renderer methods they share.
 *
 * The file is longer than the usual guide: it holds a table of commands keyed by their LaTeX
 * names, each entry with its doc comment; splitting it further would scatter one topic.
 */

import { escapeHtml, getCssLength, ONE_HALF_SPACING, DOUBLE_SPACING } from './latex-units.js?v=3';
import { parseKeyValues, formatRoman, formatAlph } from './latex-scan.js?v=3';

/** The siunitx unit and prefix commands and their symbols. */
const SI_UNIT_SYMBOLS = { metre: 'm', meter: 'm', second: 's', kilogram: 'kg', gram: 'g', ampere: 'A', kelvin: 'K', mole: 'mol', candela: 'cd',
    hertz: 'Hz', newton: 'N', pascal: 'Pa', joule: 'J', watt: 'W', volt: 'V', ohm: 'Ω', celsius: '°C', degreeCelsius: '°C',
    litre: 'l', liter: 'l', percent: '%', kilo: 'k', milli: 'm', micro: 'µ', mega: 'M', giga: 'G', nano: 'n', centi: 'c', hour: 'h', minute: 'min', day: 'd', byte: 'B', bit: 'bit' };

/** @type {Object<string, CommandHandler>} */
export const PAGE_COMMANDS = {
    /**
     * \input: other files cannot be read here: reported.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    input(flow, scan, pos, name) { const r = this.readArgument(scan, name); this.doc.addProblem(pos, `\\${name}{${this.getRawText(scan, r)}}: other files cannot be read here - paste their text into this document`, 'warning'); },
    /**
     * \include: other files cannot be read here: reported.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    include(flow, scan, pos) { PAGE_COMMANDS.input.call(this, flow, scan, pos, 'include'); },
    /**
     * \thispagestyle: with "empty" the page gets no number.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    thispagestyle(flow, scan, pos) { const st = this.getRawText(scan, this.readArgument(scan, 'thispagestyle')).trim(); if (st === 'empty') flow.addBlock('', pos, 'mark', { nopagenum: true }); },
    /**
     * \pagestyle: the page style of the document (empty: no page numbers).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    pagestyle(flow, scan) { this.doc.meta.pagestyle = this.getRawText(scan, this.readArgument(scan, 'pagestyle')).trim(); },
    /**
     * \pagenumbering: the style of the page numbers.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    pagenumbering(flow, scan) { this.doc.meta.numbering = this.getRawText(scan, this.readArgument(scan, 'pagenumbering')).trim(); },
    /**
     * \setcounter: sets a counter; page, secnumdepth and tocdepth set the page settings.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    setcounter(flow, scan) {
        const n = this.getRawText(scan, this.readArgument(scan, 'setcounter')).trim();
        const v = parseInt(this.getRawText(scan, this.readArgument(scan, 'setcounter')), 10) || 0;
        if (n === 'page') this.doc.meta.firstPage = v;
        else if (n === 'secnumdepth') this.doc.meta.secnumdepth = v;
        else if (n === 'tocdepth') this.doc.meta.tocdepth = v;
        else this.doc.counters[n] = v;
    },
    /**
     * \addtocounter: adds a number to a counter.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    addtocounter(flow, scan) { const n = this.getRawText(scan, this.readArgument(scan, 'addtocounter')).trim(); this.doc.counters[n] = (this.doc.counters[n] || 0) + (parseInt(this.getRawText(scan, this.readArgument(scan, 'addtocounter')), 10) || 0); },
    /**
     * \stepcounter: adds one to a counter.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    stepcounter(flow, scan) { const n = this.getRawText(scan, this.readArgument(scan, 'stepcounter')).trim(); this.doc.counters[n] = (this.doc.counters[n] || 0) + 1; },
    /**
     * \refstepcounter: adds one to a counter and makes it the number \label refers to.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    refstepcounter(flow, scan) { const n = this.getRawText(scan, this.readArgument(scan, 'refstepcounter')).trim(); this.doc.counters[n] = (this.doc.counters[n] || 0) + 1; this.setTarget(this.doc.counters[n], n); },
    /**
     * \arabic: a counter in digits.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    arabic(flow, scan, pos) { flow.addHtml(String(this.doc.counters[this.getRawText(scan, this.readArgument(scan, 'arabic')).trim()] ?? 0), pos); },
    /**
     * \roman: a counter in lower-case roman numerals.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    roman(flow, scan, pos) { flow.addHtml(formatRoman(this.doc.counters[this.getRawText(scan, this.readArgument(scan, 'roman')).trim()] || 0), pos); },
    /**
     * \Roman: a counter in upper-case roman numerals.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    Roman(flow, scan, pos) { flow.addHtml(formatRoman(this.doc.counters[this.getRawText(scan, this.readArgument(scan, 'Roman')).trim()] || 0).toUpperCase(), pos); },
    /**
     * \alph: a counter as a lower-case letter.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    alph(flow, scan, pos) { flow.addHtml(formatAlph(this.doc.counters[this.getRawText(scan, this.readArgument(scan, 'alph')).trim()] || 0), pos); },
    /**
     * \Alph: a counter as an upper-case letter.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    Alph(flow, scan, pos) { flow.addHtml(formatAlph(this.doc.counters[this.getRawText(scan, this.readArgument(scan, 'Alph')).trim()] || 0).toUpperCase(), pos); },
    /**
     * \thepage: the page number, filled in by the page layout.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    thepage(flow, scan, pos) { flow.addHtml('<span class="page-number-here"></span>', pos); },
    /**
     * \setlength: sets \parindent, \parskip or \tabcolsep.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    setlength(flow, scan, pos) { this.setLengthValue(flow, scan, pos, 'setlength'); },
    /**
     * \addtolength: reads its arguments; the length stays.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    addtolength(flow, scan) { this.readArgument(scan, 'addtolength'); this.readArgument(scan, 'addtolength'); },
    /**
     * \linespread: the line spacing factor.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    linespread(flow, scan) { this.doc.meta.spread = parseFloat(this.getRawText(scan, this.readArgument(scan, 'linespread'))) || 1; },
    /**
     * \onehalfspacing: one and a half line spacing.
     * @returns {void}
     */
    onehalfspacing() { this.doc.meta.spread = ONE_HALF_SPACING; },
    /**
     * \doublespacing: double line spacing.
     * @returns {void}
     */
    doublespacing() { this.doc.meta.spread = DOUBLE_SPACING; },
    /**
     * \singlespacing: single line spacing.
     * @returns {void}
     */
    singlespacing() { this.doc.meta.spread = 1; },
    /**
     * \newlength: reads its argument; lengths are not kept.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    newlength(flow, scan) { this.readArgument(scan, 'newlength'); },
    /**
     * \newcounter: a new counter starting at 0.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    newcounter(flow, scan) { const n = this.getRawText(scan, this.readArgument(scan, 'newcounter')).trim(); this.readOption(scan); this.doc.counters[n] = 0; },
    /**
     * \usepackage: \usepackage after \begin{document} is an error.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    usepackage(flow, scan, pos) { this.readOption(scan); this.readArgument(scan, 'usepackage'); this.doc.addProblem(pos, '\\usepackage only works in the preamble (before \\begin{document})', 'error'); },
    /**
     * \documentclass: \documentclass after \begin{document} is an error.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    documentclass(flow, scan, pos) { this.readOption(scan); this.readArgument(scan, 'documentclass'); this.doc.addProblem(pos, '\\documentclass belongs at the very top, before \\begin{document}', 'error'); },
    /**
     * \title: sets the title for \maketitle.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    title(flow, scan, pos) { this.setTitleField(scan, 'title', pos); },
    /**
     * \author: sets the authors for \maketitle.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    author(flow, scan, pos) { this.setTitleField(scan, 'author', pos); },
    /**
     * \date: sets the date for \maketitle.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    date(flow, scan, pos) { this.setTitleField(scan, 'date', pos); },
    /**
     * \subtitle: sets the subtitle for \maketitle.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    subtitle(flow, scan, pos) { this.setTitleField(scan, 'subtitle', pos); },
    /**
     * \and: separates the authors of \author.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    and(flow, scan, pos) { flow.addHtml('<span class="and"></span>', pos); },
    /**
     * \AND: separates the authors of \author.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    AND(flow, scan, pos) { flow.addHtml('<span class="and"></span>', pos); },
    /**
     * \geometry: page size and margins as the geometry package reads them.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    geometry(flow, scan) { this.doc.setGeometry(this.getRawText(scan, this.readArgument(scan, 'geometry'))); },
    /**
     * \newgeometry: page size and margins as the geometry package reads them.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    newgeometry(flow, scan) { this.doc.setGeometry(this.getRawText(scan, this.readArgument(scan, 'newgeometry'))); },
    /**
     * \restoregeometry: no effect: the page keeps one geometry.
     * @returns {void}
     */
    restoregeometry() {},
    /**
     * \lstset: the listing language for the following listings.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    lstset(flow, scan) { const kv = parseKeyValues(this.getRawText(scan, this.readArgument(scan, 'lstset'))); if (kv.get('language')) this.doc.lstLang = kv.get('language'); },
    /**
     * \MakeUppercase: its text in capitals.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    MakeUppercase(flow, scan, pos) { const r = this.readArgument(scan, 'MakeUppercase'); flow.addHtml(`<span style="text-transform:uppercase">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \MakeLowercase: its text in small letters.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    MakeLowercase(flow, scan, pos) { const r = this.readArgument(scan, 'MakeLowercase'); flow.addHtml(`<span style="text-transform:lowercase">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \uppercase: its text in capitals.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    uppercase(flow, scan, pos) { PAGE_COMMANDS.MakeUppercase.call(this, flow, scan, pos); },
    /**
     * \textls: its text letter-spaced.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    textls(flow, scan, pos) { this.readOption(scan); const r = this.readArgument(scan, 'textls'); flow.addHtml(`<span style="letter-spacing:.08em">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \enquote: its text in quotation marks of the document's language.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    enquote(flow, scan, pos) { const r = this.readArgument(scan, 'enquote'); flow.addHtml(this.doc.meta.ngerman ? `„${this.renderInline(scan, r)}“` : `“${this.renderInline(scan, r)}”`, pos); },
    /**
     * \foreignlanguage: its text; the language is read and dropped.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    foreignlanguage(flow, scan, pos) { this.readOption(scan); this.readArgument(scan, 'foreignlanguage'); const r = this.readArgument(scan, 'foreignlanguage'); flow.addHtml(this.renderInline(scan, r), pos); },
    /**
     * \selectlanguage: switches the words of LaTeX to German or English.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    selectlanguage(flow, scan) { const l = this.getRawText(scan, this.readArgument(scan, 'selectlanguage')).trim(); this.doc.meta.ngerman = /german|deutsch/i.test(l); },
    /**
     * \si: a unit (siunitx).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    si(flow, scan, pos) { this.readOption(scan); const r = this.readArgument(scan, 'si'); flow.addHtml(this.renderSiUnit(this.getRawText(scan, r)), pos); },
    /**
     * \SI: a number with a unit (siunitx).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    SI(flow, scan, pos) { this.readOption(scan); const n = this.getRawText(scan, this.readArgument(scan, 'SI')); this.readOption(scan); const u = this.getRawText(scan, this.readArgument(scan, 'SI')); flow.addHtml(`${escapeHtml(n.replace(/e(-?\d+)/, '×10^$1'))}\u202f${this.renderSiUnit(u)}`, pos); },
    /**
     * \num: a number (siunitx).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    num(flow, scan, pos) { this.readOption(scan); flow.addHtml(escapeHtml(this.getRawText(scan, this.readArgument(scan, 'num'))), pos); },
    /**
     * \qty: a number with a unit (siunitx, as \SI).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    qty(flow, scan, pos) { PAGE_COMMANDS.SI.call(this, flow, scan, pos); },
    /**
     * \unit: a unit (siunitx, as \si).
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    unit(flow, scan, pos) { PAGE_COMMANDS.si.call(this, flow, scan, pos); },
    /**
     * \normalsize: the normal font size for the rest of the group.
     * @param {Flow} flow - the flow to write into.
     * @returns {void}
     */
    normalsize(flow) { this.addSizeDeclaration(flow, 'normalsize'); },
    /**
     * \tabularnewline: a line break.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    tabularnewline(flow, scan, pos) { flow.addHtml('<br>', pos); },
    /**
     * \centerline: a centered line.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    centerline(flow, scan, pos) { const r = this.readArgument(scan, 'centerline'); flow.addBlock(`<div class="p ni al-c" data-p="${pos}">${this.renderInline(scan, r)}</div>`, pos); },
    /**
     * \tikz: an inline TikZ drawing: shown as a placeholder and reported.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    tikz(flow, scan, pos) { this.readOption(scan); this.readArgument(scan, 'tikz'); flow.addHtml(this.renderUnsupported('TikZ', pos), pos); },
    /**
     * \textcircled: its text in a circle.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    textcircled(flow, scan, pos) { const r = this.readArgument(scan, 'textcircled'); flow.addHtml(`<span class="circle">${this.renderInline(scan, r)}</span>`, pos); },
    /**
     * \columnbreak: a column break in multicols.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    columnbreak(flow, scan, pos) { flow.addBlock('<div class="column-break"></div>', pos, 'space'); },
    /**
     * \KwData: an algorithm2e "Data:" line outside an algorithm.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    KwData(flow, scan, pos) { const r = this.readArgument(scan, 'KwData'); flow.addHtml(`<b>Data:</b> ${this.renderInline(scan, r)}`, pos); },
    /**
     * \KwResult: an algorithm2e "Result:" line outside an algorithm.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    KwResult(flow, scan, pos) { const r = this.readArgument(scan, 'KwResult'); flow.addHtml(`<b>Result:</b> ${this.renderInline(scan, r)}`, pos); },
    /**
     * \university: a title field shown above the title.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    university(flow, scan, pos) { this.setTitleField(scan, 'university', pos); },
    /**
     * \institute: a title field shown above the title.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    institute(flow, scan, pos) { this.setTitleField(scan, 'institute', pos); },
    /**
     * \lecture: a title field shown above the title.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    lecture(flow, scan, pos) { this.setTitleField(scan, 'lecture', pos); },
    /**
     * \semester: a title field shown above the title.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    semester(flow, scan, pos) { this.setTitleField(scan, 'semester', pos); },
    /**
     * \group: a title field shown above the title.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @param {number} pos - the offset in the code to report.
     * @returns {void}
     */
    group(flow, scan, pos) { this.setTitleField(scan, 'group', pos); },
};

/** The renderer methods of this part, mixed into Renderer (latex.js). */
export const PAGE_METHODS = {
    /**
     * Renders a placeholder for a drawing the preview cannot show, reported once.
     * @this {Renderer}
     * @param {string} what - the kind of drawing (TikZ, PSTricks …).
     * @param {number} pos - the offset in the code to report.
     * @returns {string} the placeholder's HTML.
     */
    renderUnsupported(what, pos) {
        this.doc.addProblem(pos, `${what} drawings cannot be shown in the preview - they appear when the file is compiled with LaTeX`, 'warning', 'unsup:' + what);
        return `<span class="not-drawn" data-p="${pos}">${escapeHtml(what)} drawing</span>`;
    },

    /**
     * Renders a siunitx unit: \kilo\metre\per\second as km/s, or a literal unit with . and ^.
     * @this {Renderer}
     * @param {string} unit - the unit as written.
     * @returns {string} the unit as HTML.
     */
    renderSiUnit(unit) {
        let out = '', pre = '';
        const parts = unit.split(/\\/).filter(Boolean);
        if (!/\\/.test(unit)) return escapeHtml(unit.replace(/\./g, '·').replace(/\^(-?\d+)/g, (m, e) => `<sup>${e}</sup>`)).replace(/&lt;sup&gt;|&lt;\/sup&gt;/g, m => m.includes('/') ? '</sup>' : '<sup>');
        for (const p of parts) {
            const m = /^([A-Za-z]+)(?:\{([^}]*)\})?/.exec(p.trim());
            if (!m) continue;
            if (m[1] === 'per') { out += '/'; continue; }
            if (m[1] === 'squared') { out += '<sup>2</sup>'; continue; }
            if (m[1] === 'cubed') { out += '<sup>3</sup>'; continue; }
            if (m[1] === 'tothe') { out += `<sup>${escapeHtml(m[2] || '')}</sup>`; continue; }
            const v = SI_UNIT_SYMBOLS[m[1]];
            if (/^(kilo|milli|micro|mega|giga|nano|centi)$/.test(m[1])) { pre += v; continue; }
            out += (out && !out.endsWith('/') ? '\u2009' : '') + pre + (v || m[1]);
            pre = '';
        }
        return out;
    },

    /**
     * Sets \parindent, \parskip, \tabcolsep, or \LTleft and \LTright (where longtables stand) from \setlength.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner, after the command name.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    setLengthValue(flow, scan, pos, name) {
        const r = this.readArgument(scan, name);
        const what = this.getRawText(scan, r).trim();
        const v = this.getRawText(scan, this.readArgument(scan, name));
        const l = getCssLength(v, this.doc);
        const m = this.doc.meta;
        if (what === '\\parindent') { m.parindent = l; if (parseFloat(l) === 0) m.noIndent = true; }
        else if (what === '\\parskip') { m.parskipLen = l; }
        else if (what === '\\tabcolsep') m.tabcolsep = l;
        else if (what === '\\LTleft' || what === '\\LTright') this.doc.longtableMargins = { ...this.doc.longtableMargins, [what.slice(1)]: v.trim() };
        else if (what === '\\arraystretch') { /* via renewcommand */ }
    },

    /**
     * Sets a title field (\title, \author, \date, \subtitle or an extra field) for \maketitle.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner after the command.
     * @param {string} key - the field.
     * @param {number} pos - the offset of the command.
     * @returns {void}
     */
    setTitleField(scan, key, pos) {
        const doc = this.doc, m = doc.meta;
        if (key === 'title' || key === 'author') this.readOption(scan);
        const r = this.readArgument(scan, key);
        const html = this.renderInline(scan, r);
        if (key === 'title') { m.title = html; m.titleSet = true; m.titlePos = pos; }
        else if (key === 'author') m.author = html;
        else if (key === 'date') m.date = html;
        else if (key === 'subtitle') m.subtitle = html;
        else m.extraTitle.push(html);
    },
};
