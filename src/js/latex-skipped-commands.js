/**
 * Commands the LaTeX reader reads and drops: settings without effect on the preview (running heads,
 * heading and caption styles, index, hyperref and package setup) and commands that do nothing here.
 *
 * The file is longer than the usual guide: it holds a table of commands keyed by their LaTeX
 * names, each entry with its doc comment; splitting it further would scatter one topic.
 */

/**
 * A command that takes no argument and has no effect on the preview.
 * @returns {void}
 */
export const handleSkippedCommand = () => {};

/** @type {Object<string, CommandHandler>} */
export const SKIPPED_COMMANDS = {
    /**
     * \hypersetup: reads its argument; links keep their look.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    hypersetup(flow, scan) { this.readArgument(scan, 'hypersetup'); },
    /**
     * \graphicspath: reads its argument; pictures are found by name.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    graphicspath(flow, scan) { this.readArgument(scan, 'graphicspath'); },
    /**
     * \hyphenation: reads its argument; the browser hyphenates.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    hyphenation(flow, scan) { this.readArgument(scan, 'hyphenation'); },
    /**
     * \xspace: no effect.
     * @returns {void}
     */
    xspace() {},
    /**
     * \protect: no effect.
     * @returns {void}
     */
    protect() {},
    /**
     * \relax: no effect.
     * @returns {void}
     */
    relax() {},
    /**
     * \leavevmode: no effect.
     * @returns {void}
     */
    leavevmode() {},
    /**
     * \null: no effect.
     * @returns {void}
     */
    null() {},
    /**
     * \nobreak: no effect.
     * @returns {void}
     */
    nobreak() {},
    /**
     * \allowbreak: no effect.
     * @returns {void}
     */
    allowbreak() {},
    /**
     * \frenchspacing: no effect.
     * @returns {void}
     */
    frenchspacing() {},
    /**
     * \sloppy: no effect.
     * @returns {void}
     */
    sloppy() {},
    /**
     * \fussy: no effect.
     * @returns {void}
     */
    fussy() {},
    /**
     * \displaystyle: no effect outside math.
     * @returns {void}
     */
    displaystyle() {},
    /**
     * \strut: no effect.
     * @returns {void}
     */
    strut() {},
    /**
     * \mathstrut: no effect.
     * @returns {void}
     */
    mathstrut() {},
    /**
     * \hline: no effect outside a table.
     * @returns {void}
     */
    hline() {},
    /**
     * \marginpar: reads its arguments; the page has no margin notes.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    marginpar(flow, scan) { this.readOption(scan); this.readArgument(scan, 'marginpar'); },
    /**
     * \index: reads its argument; there is no index.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    index(flow, scan) { this.readArgument(scan, 'index'); },
    /**
     * \printindex: no effect: there is no index.
     * @returns {void}
     */
    printindex() {},
    /**
     * \addcontentsline: reads its arguments; the contents come from the headings.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    addcontentsline(flow, scan) { this.readArgument(scan, 'addcontentsline'); this.readArgument(scan, 'addcontentsline'); this.readArgument(scan, 'addcontentsline'); },
    /**
     * \phantomsection: no effect.
     * @returns {void}
     */
    phantomsection() {},
    /**
     * \noalign: reads its argument.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    noalign(flow, scan) { this.readArgument(scan, 'noalign'); },
    /**
     * \sectionmark: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    sectionmark(flow, scan) { this.readArgument(scan, 'sectionmark'); },
    /**
     * \markboth: reads its arguments; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    markboth(flow, scan) { this.readArgument(scan, 'markboth'); this.readArgument(scan, 'markboth'); },
    /**
     * \markright: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    markright(flow, scan) { this.readArgument(scan, 'markright'); },
    /**
     * \fancyhf: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    fancyhf(flow, scan) { this.readArgument(scan, 'fancyhf'); },
    /**
     * \fancyhead: reads its arguments; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    fancyhead(flow, scan) { this.readOption(scan); this.readArgument(scan, 'fancyhead'); },
    /**
     * \fancyfoot: reads its arguments; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    fancyfoot(flow, scan) { this.readOption(scan); this.readArgument(scan, 'fancyfoot'); },
    /**
     * \lhead: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    lhead(flow, scan) { this.readArgument(scan, 'lhead'); },
    /**
     * \chead: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    chead(flow, scan) { this.readArgument(scan, 'chead'); },
    /**
     * \rhead: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    rhead(flow, scan) { this.readArgument(scan, 'rhead'); },
    /**
     * \lfoot: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    lfoot(flow, scan) { this.readArgument(scan, 'lfoot'); },
    /**
     * \cfoot: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    cfoot(flow, scan) { this.readArgument(scan, 'cfoot'); },
    /**
     * \rfoot: reads its argument; the pages have no running heads.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    rfoot(flow, scan) { this.readArgument(scan, 'rfoot'); },
    /**
     * \titleformat: reads its arguments; headings keep their look.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    titleformat(flow, scan) { this.readStar(scan); this.readArgument(scan, 'titleformat'); this.readOption(scan); this.readArgument(scan, 'titleformat'); this.readArgument(scan, 'titleformat'); this.readArgument(scan, 'titleformat'); this.readArgument(scan, 'titleformat'); this.readOption(scan); },
    /**
     * \titlespacing: reads its arguments; headings keep their spacing.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    titlespacing(flow, scan) { this.readStar(scan); this.readArgument(scan, 'titlespacing'); this.readArgument(scan, 'titlespacing'); this.readArgument(scan, 'titlespacing'); this.readArgument(scan, 'titlespacing'); this.readOption(scan); },
    /**
     * \captionsetup: reads its arguments; captions keep their look.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    captionsetup(flow, scan) { this.readOption(scan); this.readArgument(scan, 'captionsetup'); },
    /**
     * \setlist: reads its arguments; lists keep their look.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    setlist(flow, scan) { this.readOption(scan); this.readArgument(scan, 'setlist'); },
    /**
     * \newcolumntype: reads its arguments; the column type stays unknown.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    newcolumntype(flow, scan) { this.readArgument(scan, 'newcolumntype'); this.readOption(scan); this.readArgument(scan, 'newcolumntype'); },
    /**
     * \renewcommandx: no effect.
     * @returns {void}
     */
    renewcommandx() {},
    /**
     * \PassOptionsToPackage: reads its arguments.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    PassOptionsToPackage(flow, scan) { this.readArgument(scan, 'P'); this.readArgument(scan, 'P'); },
    /**
     * \RequirePackage: reads its arguments.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    RequirePackage(flow, scan) { this.readOption(scan); this.readArgument(scan, 'RequirePackage'); },
    /**
     * \makeatletter: no effect.
     * @returns {void}
     */
    makeatletter() {},
    /**
     * \makeatother: no effect.
     * @returns {void}
     */
    makeatother() {},
    /**
     * \sisetup: reads its argument; units keep their look.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    sisetup(flow, scan) { this.readArgument(scan, 'sisetup'); },
    /**
     * \usetikzlibrary: reads its argument; TikZ is not drawn.
     * @param {Flow} flow - the flow to write into.
     * @param {Scanner} scan - the scanner after the command name.
     * @returns {void}
     */
    usetikzlibrary(flow, scan) { this.readArgument(scan, 'usetikzlibrary'); },
    /** \fbox_: no effect. */
    fbox_: handleSkippedCommand,
    /** \and_: no effect. */
    and_: handleSkippedCommand,
};
