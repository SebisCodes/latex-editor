/**
 * Tables of the LaTeX reader: tabular, tabular*, tabularx, longtable and array outside math, with
 * the column specification (l c r p{} X, |, @{}, >{}), rules (\hline, booktabs, \cline), \multicolumn,
 * \multirow and colors (\rowcolor, \cellcolor, \columncolor).
 *
 * The file is longer than the usual guide: it holds the steps of reading one tabular, which share
 * its rows and column specification; splitting it further would scatter one topic.
 */

import { getModelColor, getColorValue } from './latex-units.js?v=3';
import { createScanner, getPosition, findClosingBrace, splitTopLevel } from './latex-scan.js?v=2';

/** Table environments with a width as first argument. */
const WIDE_TABLES = new Set(['tabular*', 'tabularx', 'xltabular', 'tabulary']);
/** Commands at the start of a table row: rules and row settings. */
const ROW_COMMAND = /^\\(hline|toprule|midrule|bottomrule|cline|cmidrule|specialrule|rowcolor|addlinespace|noalign|hhline|morecmidrules|endhead|endfirsthead|endfoot|endlastfoot|hdashline)\b/;
/** The thickness of booktabs rules in points; other rules are 0.4 pt. */
const RULE_WIDTHS = { toprule: 0.8, bottomrule: 0.8, midrule: 0.5 };

/**
 * A rule above or below a table row.
 * @typedef {object} TableRule
 * @property {string} type - "full" across the table, "part" for some columns.
 * @property {number} [from] - the first column of a part rule, 1-based.
 * @property {number} [to] - the last column of a part rule.
 * @property {number} w - the thickness in points.
 */

/**
 * A row of a table as read.
 * @typedef {object} TableRow
 * @property {TopLevelPart[]} cells - the ranges of the cells.
 * @property {TableRule[]} rules - the rules above the row.
 * @property {number} pos - the offset of the row in the code.
 * @property {?string} rowColor - the \rowcolor of the row.
 */

/**
 * A cell of a table as read and rendered.
 * @typedef {object} TableCell
 * @property {string} html - the content's HTML.
 * @property {number} span - the number of columns it spans.
 * @property {object} columnSpec - its column (its own for \multicolumn).
 * @property {?string} cellColor - its \cellcolor.
 * @property {boolean} isMulticolumn - true for \multicolumn.
 */

/**
 * Returns the length of a row separator (\\ or \tabularnewline) at an index.
 * @param {string} text - the text.
 * @param {number} index - the index.
 * @returns {number} the separator's length, 0 for none.
 */
const getRowSeparatorLength = (text, index) => (text.startsWith('\\\\', index) ? 2 : text.startsWith('\\tabularnewline', index) ? 15 : 0);

/**
 * Returns the length of a cell separator (an & that is not escaped) at an index.
 * @param {string} text - the text.
 * @param {number} index - the index.
 * @returns {number} 1 for a separator, else 0.
 */
const getCellSeparatorLength = (text, index) => (text[index] === '&' && text[index - 1] !== '\\' ? 1 : 0);

/**
 * Returns the CSS of a table cell: width, alignment, borders of the column, colors, the padding
 * at the table's edges and the rules above and below.
 * @param {TableCell} content - the cell.
 * @param {object} spec - the table's column specification.
 * @param {TableRow} row - the row.
 * @param {TableRule[]} bottomRules - the rules below the row.
 * @param {number} column - the cell's first column, 0-based.
 * @param {number} columnCount - the number of columns of the table.
 * @returns {string[]} the CSS declarations.
 */
function getCellStyles(content, spec, row, bottomRules, column, columnCount) {
    const columnSpec = content.columnSpec;
    const styles = [];
    if (columnSpec.width) styles.push(`width:${columnSpec.width}`);
    if (columnSpec.align === 'c') styles.push('text-align:center'); else if (columnSpec.align === 'r') styles.push('text-align:right'); else if (columnSpec.align === 'j') styles.push('text-align:justify');
    if (columnSpec.valign) styles.push('vertical-align:' + columnSpec.valign);
    if (columnSpec.lb && (column === 0 || content.isMulticolumn)) styles.push(`border-left:${columnSpec.lb > 1 ? 'double 2.5px' : 'solid 0.4pt'} currentColor`);
    if (columnSpec.rb) styles.push(`border-right:${columnSpec.rb > 1 ? 'double 2.5px' : 'solid 0.4pt'} currentColor`);
    if (columnSpec.color) styles.push('background:' + columnSpec.color);
    if (row.rowColor) styles.push('background:' + row.rowColor);
    if (content.cellColor) styles.push('background:' + content.cellColor);
    if (spec.firstPad === 0 && column === 0) styles.push('padding-left:0');
    if (spec.lastPad === 0 && column + content.span >= columnCount) styles.push('padding-right:0');
    for (const rule of row.rules) {
        if (rule.type === 'full' || (column + 1 >= rule.from && column + 1 <= rule.to)) styles.push(`border-top:${rule.w}pt solid currentColor`);
    }
    if (bottomRules.length) styles.push(`border-bottom:${bottomRules[0].w}pt solid currentColor`);
    return styles;
}

/** The renderer methods of this part, mixed into Renderer (latex.js). */
export const TABLE_METHODS = {
    /**
     * Renders a table (tabular, tabular*, tabularx, longtable, array outside math): rows, rules,
     * \multicolumn, \multirow and colors.
     * @this {Renderer}
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner over the body.
     * @param {number} pos - the offset in the code to report.
     * @param {string} name - the command or environment name.
     * @returns {void}
     */
    renderTabular(flow, scan, pos, name) {
        const width = WIDE_TABLES.has(name) ? this.getLength(this.getRawText(scan, this.readArgument(scan, name))) : null;
        const verticalAlign = this.readOption(scan);
        const spec = this.parseColumnSpec(this.getRawText(scan, this.readArgument(scan, name)), pos);
        const { rows, trailingRules } = this.readTableRows(scan, pos);
        let html = '';
        for (let index = 0; index < rows.length; index++) {
            html += this.renderTableRow(scan, rows[index], spec, index === rows.length - 1 ? trailingRules : [], pos);
        }
        const columnCount = spec.cols.length || 1;
        if (!rows.length && trailingRules.length) html += `<tr><td colspan="${columnCount}" style="border-top:${trailingRules[0].w}pt solid currentColor;padding:0"></td></tr>`;
        const styles = [];
        if (width) styles.push(`width:${width}`);
        if (spec.outer) styles.push(spec.outer);
        const align = verticalAlign ? this.getRawText(scan, verticalAlign).trim() : '';
        if (align === 't') styles.push('vertical-align:top'); else if (align === 'b') styles.push('vertical-align:bottom');
        const classes = 'tab' + (width ? ' full' : '') + (spec.hasX ? ' xcols' : '');
        flow.addHtml(`<table class="${classes}"${styles.length ? ` style="${styles.join(';')}"` : ''} data-p="${pos}"><tbody>${html}</tbody></table>`, pos);
    },

    /**
     * Reads the rows of a table body: each row with its cells, the rules above it and its
     * \rowcolor. Rows without text only give their rules to the next row; rules after the last
     * row are returned apart. Moves nothing but the scanners it makes.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner over the body, after the column specification.
     * @param {number} pos - the offset of the table, for problems.
     * @returns {{rows: TableRow[], trailingRules: TableRule[]}} the rows and the rules below the last.
     */
    readTableRows(scan, pos) {
        const parts = splitTopLevel(scan.s, scan.i, scan.end, getRowSeparatorLength);
        let pendingRules = [];
        const rows = [];
        for (let index = 0; index < parts.length; index++) {
            const rowScan = createScanner(scan.s, parts[index].a, parts[index].b, scan.v);
            if (index > 0) { this.readStar(rowScan); this.readOption(rowScan); }
            const { rules, rowColor } = this.readRowRules(rowScan, pos);
            const start = rowScan.i, end = parts[index].b;
            if (!scan.s.slice(start, end).trim()) { if (rules.length) pendingRules = pendingRules.concat(rules); continue; }
            const cells = splitTopLevel(scan.s, start, end, getCellSeparatorLength);
            rows.push({ cells, rules: pendingRules.concat(rules), pos: getPosition(scan, start), rowColor });
            pendingRules = [];
        }
        return { rows, trailingRules: pendingRules };
    },

    /**
     * Reads the rules and settings at the start of a row (\hline, booktabs, \cline, \rowcolor …).
     * Moves the row's scanner past them (a reader).
     * @this {Renderer}
     * @param {Scanner} rowScan - the scanner over the row.
     * @param {number} pos - the offset of the table, for problems.
     * @returns {{rules: TableRule[], rowColor: ?string}} the rules above the row and its color.
     */
    readRowRules(rowScan, pos) {
        const text = rowScan.s;
        const rules = [];
        let rowColor = null;
        for (;;) {
            this.moveOverSpace(rowScan);
            const match = ROW_COMMAND.exec(text.slice(rowScan.i, rowScan.i + 20));
            if (!match) break;
            rowScan.i += match[0].length;
            const command = match[1];
            if (command === 'cline' || command === 'cmidrule') {
                if (command === 'cmidrule') { const trim = /^\s*\([^)]*\)/.exec(text.slice(rowScan.i)); if (trim) rowScan.i += trim[0].length; }
                const [from, to] = this.getRawText(rowScan, this.readArgument(rowScan, command)).split('-').map(Number);
                rules.push({ type: 'part', from, to: to || from, w: command === 'cmidrule' ? 0.5 : 0.4 });
            } else if (command === 'rowcolor') {
                const model = this.readOption(rowScan);
                const value = this.readArgument(rowScan, command);
                rowColor = model ? '#' + (getModelColor(this.getRawText(rowScan, model), this.getRawText(rowScan, value)) || 'ffffff') : this.doc.getResolvedColor(this.getRawText(rowScan, value), pos);
            } else if (command === 'specialrule') { this.readArgument(rowScan, command); this.readArgument(rowScan, command); this.readArgument(rowScan, command); rules.push({ type: 'full', w: 1 }); }
            else if (command === 'addlinespace') { this.readOption(rowScan); }
            else if (command === 'noalign' || command === 'hhline') { this.readArgument(rowScan, command); }
            else if (!/^end/.test(command) && command !== 'morecmidrules') rules.push({ type: 'full', w: RULE_WIDTHS[command] || 0.4 });
        }
        return { rules, rowColor };
    },

    /**
     * Renders a row of a table; a row with more columns than the specification is reported.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner over the table body.
     * @param {TableRow} row - the row.
     * @param {object} spec - the column specification (parseColumnSpec()).
     * @param {TableRule[]} bottomRules - the rules below the row (only for the last row).
     * @param {number} pos - the offset of the table, for problems.
     * @returns {string} the row's HTML.
     */
    renderTableRow(scan, row, spec, bottomRules, pos) {
        const columnCount = spec.cols.length || 1;
        let column = 0;
        let cellsHtml = '';
        for (const cell of row.cells) {
            const content = this.readCellContent(scan, cell, spec.cols[column] || { align: 'l' }, pos);
            const styles = getCellStyles(content, spec, row, bottomRules, column, columnCount);
            cellsHtml += `<td${content.span > 1 ? ` colspan="${content.span}"` : ''}${styles.length ? ` style="${styles.join(';')}"` : ''} data-p="${getPosition(scan, cell.a)}">${content.html}</td>`;
            column += content.span;
        }
        if (column > columnCount) this.doc.addProblem(row.pos, `This table row has ${column} columns, but the table was set up for ${columnCount} - add a column to {${spec.text}} or remove an &`, 'error');
        return `<tr>${cellsHtml}</tr>`;
    },

    /**
     * Reads and renders a cell: \multicolumn with its own column, \multirow (its settings are
     * read and dropped), \cellcolor, then the content.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner over the table body.
     * @param {Range} cell - the range of the cell.
     * @param {object} columnSpec - the column the cell starts in.
     * @param {number} pos - the offset of the table, for problems.
     * @returns {TableCell} the cell's HTML, span, column and color.
     */
    readCellContent(scan, cell, columnSpec, pos) {
        const cellScan = createScanner(scan.s, cell.a, cell.b, scan.v);
        this.moveOverSpace(cellScan);
        if (/^\\multicolumn\b/.test(scan.s.slice(cellScan.i, cellScan.i + 13))) {
            cellScan.i += 12;
            const span = parseInt(this.getRawText(cellScan, this.readArgument(cellScan, 'multicolumn')), 10) || 1;
            const own = this.parseColumnSpec(this.getRawText(cellScan, this.readArgument(cellScan, 'multicolumn')), pos);
            const spanSpec = { ...(own.cols[0] || { align: 'c' }), lb: own.cols[0]?.lb, rb: own.cols[0]?.rb };
            const html = this.renderCell(cellScan, this.readArgument(cellScan, 'multicolumn'), spanSpec);
            return { html, span, columnSpec: spanSpec, cellColor: null, isMulticolumn: true };
        }
        if (/^\\multirow\b/.test(scan.s.slice(cellScan.i, cellScan.i + 10))) {
            cellScan.i += 9; this.readOption(cellScan); this.readArgument(cellScan, 'multirow'); this.readOption(cellScan); this.readArgument(cellScan, 'multirow');
        }
        let cellColor = null;
        if (/^\\cellcolor\b/.test(scan.s.slice(cellScan.i, cellScan.i + 11))) {
            cellScan.i += 10;
            const model = this.readOption(cellScan);
            const value = this.readArgument(cellScan, 'cellcolor');
            cellColor = model ? '#' + (getModelColor(this.getRawText(cellScan, model), this.getRawText(cellScan, value)) || 'ffffff') : this.doc.getResolvedColor(this.getRawText(cellScan, value), pos);
        }
        const html = this.renderCell(cellScan, { a: cellScan.i, b: cellScan.end }, columnSpec);
        return { html, span: 1, columnSpec, cellColor, isMulticolumn: false };
    },

    /**
     * Renders a table cell: paragraphs in a column of a width (p, X), else inline.
     * @this {Renderer}
     * @param {Scanner} scan - the scanner of the cell.
     * @param {?Range} range - the range of the cell's content.
     * @param {object} columnSpec - the column: align, width, x …
     * @returns {string} the HTML of the cell.
     */
    renderCell(scan, range, columnSpec) {
        if (columnSpec.width || columnSpec.x) {
            const bl = this.runAtWidth(columnSpec.width, () => this.renderBlocks(scan, range, { noindentAll: true }));
            return bl.map(b => b.html).join('');
        }
        return this.renderInline(scan, range);
    },

    /**
     * Parses a column specification (l c r p{} X, |, @{}, >{} …); an unknown type is reported.
     * @this {Renderer}
     * @param {string} specText - the specification.
     * @param {number} pos - the offset of the table.
     * @returns {{cols: object[], text: string, hasX: boolean, firstPad: ?number, lastPad: ?number}} the columns and the padding at the edges.
     */
    parseColumnSpec(specText, pos) {
        const cols = [];
        let lb = 0, i = 0, hasX = false, firstPad = null, lastPad = null, pendingColor = null;
        const s = specText.replace(/\*\s*\{(\d+)\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (m, n, x) => x.repeat(Math.min(+n, 50)));
        /**
         * Reads the {…} group at the reading position of the specification (spaces before it
         * skipped) and moves past it.
         * @returns {string} the group's content, empty when no group follows.
         */
        const readGroup = () => {
            while (s[i] === ' ') i++;
            if (s[i] !== '{') return '';
            const j = findClosingBrace(s, i);
            const v = s.slice(i + 1, j < 0 ? s.length : j);
            i = j < 0 ? s.length : j + 1;
            return v;
        };
        while (i < s.length) {
            const c = s[i++];
            if (c === ' ' || c === '\n') continue;
            if (c === '|') { if (cols.length) cols[cols.length - 1].rb = (cols[cols.length - 1].rb || 0) + 1; else lb++; continue; }
            if (c === '@' || c === '!') {
                const g = readGroup();
                if (c === '@' && !g.trim()) { if (!cols.length) firstPad = 0; else lastPad = 0; }
                continue;
            }
            if (c === '>' || c === '<') {
                const g = readGroup();
                const cm = /\\columncolor(?:\[([^\]]*)\])?\{([^}]*)\}/.exec(g);
                if (cm) pendingColor = cm[1] ? '#' + getModelColor(cm[1], cm[2]) : getColorValue(cm[2], this.doc.colors);
                if (/\\centering/.test(g)) pendingColor = pendingColor || null, this._nextAlign = 'c';
                if (/\\raggedleft/.test(g)) this._nextAlign = 'r';
                if (/\\raggedright/.test(g)) this._nextAlign = 'l';
                continue;
            }
            const col = { align: 'l' };
            if (c === 'l' || c === 'c' || c === 'r') col.align = c;
            else if (c === 'p' || c === 'm' || c === 'b') { col.width = this.getLength(readGroup()); col.align = 'j'; col.valign = c === 'm' ? 'middle' : c === 'b' ? 'bottom' : 'top'; }
            else if (c === 'X') { col.x = true; hasX = true; col.align = 'j'; col.valign = 'top'; }
            else if (c === 'L' || c === 'C' || c === 'R') { col.align = c.toLowerCase(); col.x = true; hasX = true; }
            else if (c === 'S' || c === 'd' || c === 'D') { col.align = 'r'; if (c !== 'S') readGroup(), readGroup(), readGroup(); }
            else { this.doc.addProblem(pos, `Unknown column type "${c}" in the table setup`, 'warning', 'col:' + c); continue; }
            if (this._nextAlign) { col.align = this._nextAlign; this._nextAlign = null; }
            if (pendingColor) { col.color = pendingColor; pendingColor = null; }
            if (!cols.length && lb) col.lb = lb;
            cols.push(col);
        }
        if (lastPad === 0 && cols.length === 0) firstPad = 0;
        return { cols, text: specText, hasX, firstPad, lastPad: lastPad };
    },
};
