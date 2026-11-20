/**
 * The flow the LaTeX reader writes into: in block mode a list of blocks (paragraphs,
 * headings, lists …) for the page layout, in inline mode one HTML text. It keeps the open
 * paragraph, the active declarations (\bfseries, \small …) and the groups ({ … }) that end them.
 */





/**
 * A block of the page: a paragraph, heading, list, float … with its place in the code.
 * @typedef {object} Block
 * @property {string} html - the block's HTML.
 * @property {number} pos - the offset in the code.
 * @property {string} kind - p, h, list, float, caption, pre, break, mark, space, vfill …
 * @property {object[]} [notes] - the footnotes that belong to this block.
 */

/**
 * The paragraph being written.
 * @typedef {object} OpenParagraph
 * @property {string} html - its HTML so far.
 * @property {number} pos - the offset of its first text in the code.
 * @property {boolean} noindent - true when it starts without indent.
 * @property {boolean} hasFill - true when it holds \hfill.
 */

/** The characters a run of source text in a span is closed with. */
const SPAN_CLOSE = '</span>';

/**
 * The output of the reader for one part of the code.
 */
export class Flow {
    /**
     * Creates a flow.
     * @param {TexDocument} doc - the document state.
     * @param {string} mode - "block" or "inline".
     * @param {object} context - where the flow is: top, float, listDepth, enumDepth, align,
     *     noindent, noindentAll …
     * @returns {void}
     */
    constructor(doc, mode, context) {
        this.doc = doc;
        this.mode = mode;
        this.ctx = context;
        this.blocks = [];
        this.html = '';
        this.para = null;
        this.decls = [];
        this.groups = [];
        this.align = context.align || null;
        this.noindent = !!context.noindent;
        this.stack = [];
        this.styleBlock = '';
        this.parskip = null;
    }

    /**
     * Adds inline HTML: to the result in inline mode, else to the paragraph (opened as needed;
     * white space alone opens none).
     * @param {string} html - the HTML.
     * @param {number} position - the offset in the code, for a paragraph opened here.
     * @returns {void}
     */
    addHtml(html, position) {
        if (this.mode === 'inline') { this.html += html; return; }
        if (!this.para) {
            if (/^\s*$/.test(html) && !/&nbsp;|\u00a0/.test(html)) return;
            this.para = { html: '', pos: position, noindent: this.noindent, hasFill: false };
            this.noindent = false;
            for (const declaration of this.decls) this.para.html += declaration.open;
        }
        this.para.html += html;
    }

    /**
     * Adds plain text that is on the page exactly as in the code (one character per character)
     * as a span that knows where it starts, so it can be edited on the page. Runs one space or
     * line break apart are joined into one span.
     * @param {string} html - the escaped text.
     * @param {number} at - the offset of the text in the code.
     * @param {number} length - the length of the text in the code.
     * @param {string} source - the code.
     * @returns {void}
     */
    addSourceText(html, at, length, source) {
        const owner = this.mode === 'inline' ? this : this.para, last = this.lastLit;
        if (owner && last && last.o === owner && at - last.end === 1 && owner.html.length === last.len + 1 && owner.html.endsWith(' ') && (source[last.end] === ' ' || source[last.end] === '\n')) {
            owner.html = owner.html.slice(0, -(SPAN_CLOSE.length + 1)) + ' ' + html + SPAN_CLOSE;
        } else this.addHtml(`<span class="t" data-s="${at}">${html}${SPAN_CLOSE}`, at);
        const target = this.mode === 'inline' ? this : this.para;
        this.lastLit = target ? { o: target, end: at + length, len: target.html.length } : null;
    }

    /**
     * Adds a space unless the text already ends with one.
     * @returns {void}
     */
    addSpace() {
        if (this.mode === 'inline') { if (!/ $/.test(this.html)) this.html += ' '; return; }
        if (this.para && !/ $/.test(this.para.html)) this.para.html += ' ';
    }

    /**
     * Ends the paragraph (blank line, \par, or a block element): closes its declarations and
     * adds it as a block, unless it holds nothing visible. In inline mode it is a space.
     * @returns {void}
     */
    closeParagraph() {
        if (this.mode === 'inline') { this.addSpace(); return; }
        const paragraph = this.para;
        if (!paragraph) return;
        this.para = null;
        let html = paragraph.html;
        for (let index = this.decls.length - 1; index >= 0; index--) html += this.decls[index].close;
        html = html.replace(/^ +| +$/g, '');
        if (html.replace(/<span[^>]*>|<\/span>|\s/g, '') === '' && !/<(img|br|hr|svg|div|table)|class="(rule|minipage|cbox|fbox|example-picture|picture-missing|not-drawn|katex|vsp|hsp|hfill)/.test(html)) return;
        const classes = ['p'];
        if (paragraph.noindent || this.doc.meta.parskip || this.ctx.noindentAll) classes.push('ni');
        if (this.align) classes.push('al-' + this.align);
        if (/class="hfill"/.test(html)) classes.push('fill');
        const style = this.parskip != null ? ` style="margin-top:${this.parskip}"` : '';
        this.addFlowBlock({ html: `<div class="${classes.join(' ')}" data-p="${paragraph.pos}"${style}>${html}</div>`, pos: paragraph.pos, kind: 'p' });
    }

    /**
     * Pushes a finished block (in inline mode its HTML); the open paragraph ends first. On the
     * top level the footnotes so far go with the block.
     * @param {Block} block - the block.
     * @returns {void}
     */
    addFlowBlock(block) {
        if (this.mode === 'inline') { this.html += block.html; return; }
        if (this.para) this.closeParagraph();
        if (this.ctx.top) { block.notes = this.doc.notes; this.doc.notes = []; }
        this.blocks.push(block);
    }

    /**
     * Adds a block element; the open paragraph ends first.
     * @param {string} html - the block's HTML.
     * @param {number} position - the offset in the code.
     * @param {string} [kind='b'] - the kind of block.
     * @param {object} [extra={}] - more fields for the layout (split, keep, breakBefore …).
     * @returns {void}
     */
    addBlock(html, position, kind = 'b', extra = {}) {
        this.closeParagraph();
        this.addFlowBlock({ html, pos: position, kind, ...extra });
    }

    /**
     * Adds a declaration (\bfseries, \color …) that lasts to the end of the group.
     * @param {string} open - the HTML that starts it.
     * @param {string} close - the HTML that ends it.
     * @returns {void}
     */
    addDeclaration(open, close) {
        this.decls.push({ open, close });
        if (this.mode === 'inline') this.html += open;
        else if (this.para) this.para.html += open;
    }

    /**
     * Opens a group ({ or the start of an environment).
     * @returns {void}
     */
    openGroup() { this.groups.push({ n: this.decls.length, align: this.align }); }

    /**
     * Closes the innermost group: its declarations end and the alignment returns.
     * @returns {boolean} false when no group was open (a } too many).
     */
    closeGroup() {
        const group = this.groups.pop();
        if (!group) return false;
        while (this.decls.length > group.n) {
            const declaration = this.decls.pop();
            if (this.mode === 'inline') this.html += declaration.close;
            else if (this.para) this.para.html += declaration.close;
        }
        this.align = group.align;
        return true;
    }

    /**
     * Closes everything still open: the groups, then in inline mode the declarations, in block
     * mode the paragraph.
     * @returns {void}
     */
    closeAll() {
        while (this.groups.length) this.closeGroup();
        if (this.mode === 'inline') {
            for (let index = this.decls.length - 1; index >= 0; index--) this.html += this.decls[index].close;
            return;
        }
        this.closeParagraph();
    }

    /**
     * Returns what the flow wrote.
     * @returns {(string|Block[])} the HTML in inline mode, the blocks in block mode.
     */
    getResult() {
        return this.mode === 'inline' ? this.html : this.blocks;
    }
}
