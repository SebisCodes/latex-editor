"""Browser test of the LaTeX editor (Playwright, Google Chrome).

    php -S 127.0.0.1:8094 -t src src/php/router.php          (in the project folder)
    python tests/gui_test.py

Checks rendering, pages, editing text and moving pictures on the page,
code <-> preview, typing help, document settings, insert, My documents,
AI links, export and the phone layout."""

import base64
import os
import sys
import zlib

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8094/')
HERE = os.path.dirname(os.path.abspath(__file__))
failures = []


def check_that(cond, what):
    """Prints one result line and notes a failure.

    Args:
        cond (bool): True when the check holds.
        what (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


def read(name):
    """Returns the text of a file next to this test.

    Args:
        name (str): the path relative to the tests folder.

    Returns:
        str: the file's text.
    """
    with open(os.path.join(HERE, name), encoding='utf-8') as f:
        return f.read()



def open_side_panel(page):
    """Opens the side panel's drawer when it is closed (it is closed at the start).

    Args:
        page (Page): the editor's page or frame.

    Returns:
        None: the side panel is open.
    """
    button = page.locator('#btn-panel')
    if button.count() and button.is_visible() and button.get_attribute('aria-expanded') != 'true':
        button.click()

def set_code(page, tex):
    """Sets the editor's code and waits for the preview.

    Args:
        page (Page): the editor page.
        tex (str): the LaTeX code.

    Returns:
        None: the editor holds the code.
    """
    page.evaluate('t => latexEditor.setCode(t)', tex)
    page.wait_for_timeout(300)


def get_state(page, expr):
    """Returns a value read from the editor's state (S in the expression).

    Args:
        page (Page): the editor page.
        expr (str): a JavaScript expression over S, the editor's state.

    Returns:
        Any: the expression's value.
    """
    return page.evaluate(f'() => {{ const S = latexEditor.state; return {expr}; }}')


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(800)

    # --- First visit: the welcome example ---
    check_that(get_state(page, 'S.name') == 'Welcome', 'the first visit opens the welcome example')
    check_that(get_state(page, 'S.pages.length') == 1, 'the example fills one page')
    check_that(get_state(page, 'S.result.problems.length') == 0, 'the example has no problems')
    check_that(page.locator('#pages .katex').count() >= 3, 'math is typeset with KaTeX')
    check_that(page.locator('#pages .footnote').count() == 1, 'the footnote is at the bottom of the page')
    check_that('Table 1' in page.inner_text('#pages') and '(1)' in page.inner_text('#pages'), 'references and equation numbers are resolved')

    # --- A document like the exercise sheets in the LaTeX workshop ---
    set_code(page, read('exercise.tex'))
    text = page.inner_text('#pages')
    check_that(get_state(page, 'S.result.problems.length') == 0, 'exercise sheet: no problems')
    check_that('Inhaltsverzeichnis' in text and 'Abbildung 1' in text, 'babel ngerman: German names')
    check_that(page.locator('#pages .algo-kw').count() >= 4, 'algorithm2e keywords')
    check_that(page.locator('#pages pre.lst .lk').count() >= 2, 'lstlisting with SQL keywords')
    check_that(page.locator('#pages ol.list').count() == 1 and page.locator('#pages dl.list').count() == 1, 'nested enumerate and description')
    check_that('Lösung des 99. Aufgabenblattes' in text, 'title with umlauts')
    check_that(page.locator('#pages td').count() == 6, 'tabular with 2 rows x 3 columns')

    # --- Report: chapters, page breaks, table of contents with page numbers ---
    set_code(page, read('report.tex'))
    check_that(get_state(page, 'S.pages.length') >= 5, 'report: several pages')
    toc = page.locator('#pages .toc-page').all_inner_texts()
    check_that(len(toc) >= 3 and all(t.strip() for t in toc), 'table of contents has page numbers')
    check_that('Theorem 1.1 (Pythagoras).' in page.inner_text('#pages'), 'numbered theorem within the chapter')
    check_that(page.locator('#pages .pageref').first.inner_text().strip().isdigit(), '\\pageref shows a page number')

    # --- \linewidth inside a minipage in a \colorbox is the minipage's width (as in pdflatex) ---
    set_code(page, read('band.tex'))
    widths = page.evaluate('() => { const b = document.querySelector("#pages .cbox"); const t = b.querySelector("table"); const s = document.querySelector("#pages .type-area"); return [b.getBoundingClientRect().width / s.getBoundingClientRect().width, t.getBoundingClientRect().width / s.getBoundingClientRect().width]; }')
    check_that(0.95 < widths[0] < 1.01 and widths[1] > 0.85, 'a colored band with minipage{0.97\\linewidth} fills the text width')
    check_that(page.evaluate('document.querySelector("#pages .sheet").lang') == 'de', 'German text without babel is hyphenated as German')

    # --- Problems ---
    set_code(page, '\\documentclass{article}\n\\begin{document}\n\\textbf{open\n\n\\foo{x} $a^2\n\\end{document}\n')
    probs = get_state(page, 'S.result.problems.map(p => p.kind + ":" + p.msg)')
    check_that(any('never closed' in p for p in probs), 'a missing } is reported')
    check_that(any('\\foo' in p for p in probs), 'an unknown command is reported')
    check_that(page.locator('#code-error li').count() >= 2, 'problems are listed above the code')
    page.locator('#code-error [data-prob]').first.click()
    check_that(page.evaluate('document.activeElement.id') == 'code', 'clicking a problem goes to the code')

    # --- Editing text on the page ---
    set_code(page, "\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nThe quick brown\nfox jumps. It's \\textbf{bold} here.\n\\end{document}\n")
    run = page.locator('#pages .t', has_text='quick')
    check_that(run.count() == 1 and run.inner_text() == 'The quick brown fox jumps. It’s', 'plain text over a line break is one editable run')
    box = run.bounding_box()
    page.mouse.click(box['x'] + box['width'] * 0.45, box['y'] + box['height'] / 2)
    page.wait_for_timeout(150)
    check_that(page.evaluate('document.activeElement.classList.contains("edit")'), 'a click makes the text editable')
    left = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart - 30, t.selectionStart).split("\\n").pop(); }')
    check_that(len(left) > 0 and ('fox jumps.'.startswith(left) or 'The quick brown'.startswith(left)), 'the code cursor goes to the clicked character: ' + repr(left))
    check_that(not page.locator('.pages-cursor').is_hidden(), 'a clearly visible cursor on the page')
    page.keyboard.type('X')
    page.keyboard.press('End')
    page.keyboard.type(' 50% & more')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(300)
    code = get_state(page, 'S.code')
    check_that(left + 'X' in code, 'typing goes where the click was')
    check_that("fox jumps. It's 50\\% \\& more \\textbf{bold}" in code, 'Ctrl+Enter writes the text into the code, special characters escaped')
    check_that('It’s 50% & more bold here.' in page.inner_text('#pages'), 'the page shows the edited text')
    page.locator('#pages .t', has_text='Intro').click()
    page.keyboard.press('Control+a')
    page.keyboard.type('Changed')
    page.keyboard.press('Escape')
    check_that('\\section{Intro}' in get_state(page, 'S.code') and page.locator('#pages h2').inner_text().endswith('Intro'), 'Escape cancels the edit')
    page.locator('#pages .t', has_text='Intro').click()
    page.keyboard.press('Control+a')
    page.keyboard.type('Start')
    page.mouse.click(5, 5)
    page.wait_for_timeout(300)
    check_that('\\section{Start}' in get_state(page, 'S.code'), 'a click elsewhere keeps the edit (headings too)')
    page.evaluate('() => document.querySelector("#code").blur()')
    page.keyboard.press('Control+z')
    page.wait_for_timeout(300)
    check_that('\\section{Intro}' in get_state(page, 'S.code'), 'Undo takes the edit on the page back')

    # --- Moving pictures on the page ---
    def move_picture_to(sel, x, y, release=True):
        """Drags an element of the preview with the mouse to a point.

        Args:
            sel (str): the selector of the element.
            x (float): the point's x in the page.
            y (float): the point's y in the page.
            release (bool): True to let go of the mouse at the end.

        Returns:
            bool: True when the insert line showed during the drag.
        """
        b = page.locator(sel).bounding_box()
        page.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
        page.mouse.down()
        page.mouse.move(b['x'] + b['width'] / 2 + 8, b['y'] + b['height'] / 2 + 8, steps=2)
        page.mouse.move(x, y, steps=8)
        page.wait_for_timeout(100)
        line = page.locator('.insert-line').is_visible()
        if release:
            page.mouse.up()
            page.wait_for_timeout(300)
        return line

    paras = '\n\n'.join(f'Paragraph {i} ' + 'with some words to fill the lines of the page. ' * 6 for i in range(1, 16))
    tex = ('\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\section{Pictures}\nFirst paragraph.\n\n'
           '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.4\\textwidth]{example-image-a}\n  \\caption{A picture}\n  \\label{fig:a}\n\\end{figure}\n\n'
           'Second paragraph.\n\n\\includegraphics[width=3cm]{example-image-b}\n\n' + paras + '\n\n\\end{document}\n')
    set_code(page, tex)
    page.evaluate('() => document.querySelector("#code").blur()')
    check_that(page.locator('#pages .example-picture').first.evaluate('e => getComputedStyle(e).cursor') == 'grab', 'pictures on the page show a grab cursor')
    page.locator('#pages .example-picture').first.click()
    caret = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionStart + 16); }')
    check_that(caret == '\\includegraphics' and get_state(page, 'S.code') == tex, 'a click on a picture still leads to its code')
    second = page.locator('#pages .t', has_text='Second paragraph').bounding_box()
    check_that(move_picture_to('#pages .example-picture >> nth=0', second['x'] + 4, second['y'] + second['height'] - 1), 'dragging a picture shows where it lands')
    code = get_state(page, 'S.code')
    check_that('Second paragraph.\n\n\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.4\\textwidth]{example-image-a}\n  \\caption{A picture}\n  \\label{fig:a}\n\\end{figure}\n\n\\includegraphics[width=3cm]' in code
          and 'First paragraph.\n\nSecond' in code, 'the whole figure environment moves below the next paragraph')
    sel = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionEnd); }')
    check_that(sel.startswith('\\begin{figure}') and sel.endswith('\\end{figure}'), 'the code shows the moved figure')
    page.keyboard.press('Control+z')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code') == tex, 'one Undo puts the picture back')
    first = page.locator('#pages .t', has_text='First paragraph').bounding_box()
    move_picture_to('#pages .example-picture >> nth=0', first['x'] + 4, first['y'] + 1, release=False)
    page.keyboard.press('Escape')
    page.mouse.up()
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code') == tex and page.locator('.insert-line').is_hidden(), 'Escape cancels the move')
    check_that(not page.locator('#pages .edit').count(), 'and the release does not edit the text under it')
    move_picture_to('#pages .example-picture >> nth=0', first['x'] + 4, first['y'] + first['height'] - 1)
    check_that(get_state(page, 'S.code') == tex, 'dropped where it was, nothing changes')
    check_that(get_state(page, 'S.pages.length') >= 2, 'the long document has several pages')
    page.evaluate('latexEditor.zoomTo(0.35)')
    page.evaluate('() => document.querySelector("#scroller").scrollTop = 0')
    target = page.locator('#pages .sheet').nth(1).locator('.t', has_text='Paragraph 15').bounding_box()
    move_picture_to('#pages .example-picture >> nth=1', target['x'] + 4, target['y'] + target['height'] - 1)
    code = get_state(page, 'S.code')
    check_that('Second paragraph.\n\nParagraph 1 ' in code and code.endswith('fill the lines of the page. \n\n\\includegraphics[width=3cm]{example-image-b}\n\n\\end{document}\n'), 'a picture moves to the next page, as its own paragraph')
    check_that(page.locator('#pages .sheet').nth(1).locator('.example-picture').count() == 1, 'the page shows it there')
    page.click('#zoom-fit')
    page.evaluate('() => document.querySelector("#scroller").scrollTop = 0')
    moved = get_state(page, 'S.code')
    # A change in the code and, before the preview follows it, a drag (in one go, so the preview has no time).
    page.evaluate('''() => {
        const t = document.querySelector('#code'), pic = document.querySelector('#pages .example-picture');
        t.focus(); t.setSelectionRange(0, 0); document.execCommand('insertText', false, '%'); t.blur();
        const r = pic.getBoundingClientRect(), x = r.left + 5, y = r.top + 5, o = { bubbles: true, pointerId: 1, isPrimary: true, button: 0 };
        pic.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: x, clientY: y }));
        window.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: x + 40, clientY: y - 60 }));
        window.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: x + 40, clientY: y - 60 }));
    }''')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.code') == '%' + moved and 'wait for the preview' in page.inner_text('#toast'), 'before the preview follows the code, a picture does not move (and the editor says so)')

    page.evaluate('() => document.querySelector("#scroller").scrollTop = 0')
    b = page.locator('#pages .example-picture >> nth=0').bounding_box()
    bottom, mid = page.evaluate('() => { const r = document.querySelector("#scroller").getBoundingClientRect(); return [r.bottom, r.left + r.width / 2]; }')
    page.mouse.move(b['x'] + 5, b['y'] + 5)
    page.mouse.down()
    page.mouse.move(mid, bottom - 10, steps=6)
    page.wait_for_timeout(600)
    check_that(page.evaluate('document.querySelector("#scroller").scrollTop') > 100, 'dragging near the bottom edge scrolls the pages')
    page.keyboard.press('Escape')
    page.mouse.up()

    # --- Moving pictures with a finger: a long press starts the drag, a swipe scrolls ---
    tctx = browser.new_context(viewport={'width': 1280, 'height': 900}, has_touch=True, is_mobile=True)
    tpage = tctx.new_page()
    tpage.on('pageerror', lambda e: errors.append(str(e)))
    tpage.goto(URL, wait_until='networkidle')
    tpage.wait_for_timeout(600)
    tpage.evaluate('t => latexEditor.setCode(t)', tex)
    tpage.wait_for_timeout(400)
    cdp = tctx.new_cdp_session(tpage)

    def send_touch(kind, x=0, y=0):
        """Sends a touch event through the DevTools protocol.

        Args:
            kind (str): "touchStart", "touchMove" or "touchEnd".
            x (float): the touch point's x.
            y (float): the touch point's y.

        Returns:
            None: the event is sent.
        """
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y}]})

    def get_touch_state(expr):
        """Returns a value read from the editor's state on the touch page.

        Args:
            expr (str): a JavaScript expression over S, the editor's state.

        Returns:
            Any: the expression's value.
        """
        return tpage.evaluate(f'() => {{ const S = latexEditor.state; return {expr}; }}')

    b = tpage.locator('#pages .example-picture >> nth=0').bounding_box()
    x, y = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    send_touch('touchStart', x, y)
    for i in range(1, 11):
        send_touch('touchMove', x, y - 30 * i)
        tpage.wait_for_timeout(16)
    send_touch('touchEnd')
    tpage.wait_for_timeout(300)
    check_that(get_touch_state('S.code') == tex and tpage.evaluate('document.querySelector("#scroller").scrollTop') > 50, 'touch: a swipe that starts on a picture scrolls the pages and moves nothing')
    tpage.wait_for_timeout(1500)                    # the swipe's fling comes to rest
    tpage.evaluate('() => document.querySelector("#scroller").scrollTop = 0')
    tpage.wait_for_timeout(100)
    second = tpage.locator('#pages .t', has_text='Second paragraph').bounding_box()
    send_touch('touchStart', x, y)
    tpage.wait_for_timeout(600)
    check_that(tpage.locator('#pages .is-dragged').count() == 1, 'touch: a long press on a picture starts the drag')
    tx, ty = second['x'] + 4, second['y'] + second['height'] - 1
    for i in range(1, 11):
        send_touch('touchMove', x + (tx - x) * i / 10, y + (ty - y) * i / 10)
        tpage.wait_for_timeout(16)
    scrolled = tpage.evaluate('document.querySelector("#scroller").scrollTop')
    send_touch('touchEnd')
    tpage.wait_for_timeout(400)
    check_that(scrolled == 0 and 'Second paragraph.\n\n\\begin{figure}[h]' in get_touch_state('S.code'), 'touch: then moving the finger moves the picture, the pages stay')
    tpage.evaluate('t => latexEditor.setCode(t)', tex)
    tpage.wait_for_timeout(400)
    tpage.evaluate('() => document.querySelector("#scroller").scrollTop = 0')
    b = tpage.locator('#pages .example-picture >> nth=0').bounding_box()
    tpage.touchscreen.tap(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
    tpage.wait_for_timeout(300)
    caret = tpage.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionStart + 16); }')
    check_that(caret == '\\includegraphics' and get_touch_state('S.code') == tex, 'touch: a tap on a picture still leads to its code')
    tctx.close()

    # --- Pictures beside each other: reorder in one paragraph, swap or insert in table cells ---
    actx = browser.new_context(viewport={'width': 1440, 'height': 900})
    apage = actx.new_page()
    apage.on('pageerror', lambda e: errors.append(str(e)))
    apage.goto(URL, wait_until='networkidle')
    apage.wait_for_timeout(600)
    apage.set_input_files('#file', os.path.join(HERE, 'title-picture.jpg'))
    apage.wait_for_timeout(600)
    pics = ('\\vspace{3mm}\n\n'
            '\\includegraphics[width=\\linewidth,height=105mm,keepaspectratio]{title-picture.jpg}\n'
            '\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-1.jpg}\n'
            '\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-3.jpg}\n'
            '\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-2.jpg}\n\n'
            '\\vspace{3mm}\n'
            '\\begin{tabular}{@{}p{0.32\\linewidth}@{\\hspace{0.02\\linewidth}}p{0.32\\linewidth}@{\\hspace{0.02\\linewidth}}p{0.32\\linewidth}@{}}\n'
            '\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-1.jpg} &\n'
            '\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-2.jpg}\n'
            '&\n'
            '\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-3.jpg}\n'
            '\\\\\n'
            '\\end{tabular}\n')
    sample = read('../src/js/samples.js').split('String.raw`')[1].split('`,')[0]
    gallery = sample.replace('\\end{document}', pics + '\\end{document}')
    apage.evaluate('''t => { const S = latexEditor.state; for (const n of ['picture-1.jpg', 'picture-2.jpg', 'picture-3.jpg']) S.assets[n] = S.assets['title-picture.jpg']; latexEditor.setCode(t); latexEditor.zoomTo(0.5); }''', gallery)
    apage.wait_for_timeout(500)

    def get_picture(name, n=0):
        """Returns a picture of the preview, scrolled into view.

        Args:
            name (str): the picture's file name.
            n (int): which one of the pictures with that name, 0-based.

        Returns:
            Locator: the picture.
        """
        loc = apage.locator(f'#pages img.graphic[data-file="{name}"]').nth(n)
        loc.scroll_into_view_if_needed()
        return loc

    def move_picture(src, dst, fx, fy):
        """Drags a picture onto a point of another picture and lets go.

        Args:
            src (Locator): the picture to move.
            dst (Locator): the picture to drop it on.
            fx (float): the point's x as a part of dst's width.
            fy (float): the point's y as a part of dst's height.

        Returns:
            str: the insert line shown before letting go: "across", "upright", "frame" or "".
        """
        b = src.bounding_box()
        apage.mouse.move(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
        apage.mouse.down()
        apage.mouse.move(b['x'] + b['width'] / 2 + 8, b['y'] + b['height'] / 2 + 8, steps=2)
        t = dst.bounding_box()
        apage.mouse.move(t['x'] + t['width'] * fx, t['y'] + t['height'] * fy, steps=8)
        apage.wait_for_timeout(100)
        line = apage.evaluate('() => { const l = document.querySelector(".insert-line"); return l.hidden ? "" : l.classList.contains("swap") ? "frame" : l.offsetWidth > l.offsetHeight ? "across" : "upright"; }')
        apage.mouse.up()
        apage.wait_for_timeout(300)
        return line

    def get_picture_order(code, start):
        """Returns the pictures in the order of the code, from a place on.

        Args:
            code (str): the LaTeX code.
            start (str): the text where the list starts.

        Returns:
            list[str]: the picture names.
        """
        part = code[code.index(start):]
        return [x.split('}')[0] for x in part.split('keepaspectratio]{')[1:]]

    def get_code():
        """Returns the code of the editor on the pictures page.

        Returns:
            str: the code.
        """
        return apage.evaluate('latexEditor.state.code')

    row = '\\vspace{3mm}\n\n\\includegraphics'
    tab = '\\vspace{3mm}\n\\begin{tabular}'
    line = move_picture(get_picture('picture-2.jpg', 0), get_picture('picture-1.jpg', 0), 0.2, 0.5)
    code = get_code()
    check_that(line in ('upright', 'across') and get_picture_order(code, row)[:4] == ['title-picture.jpg', 'picture-2.jpg', 'picture-1.jpg', 'picture-3.jpg'], 'pictures in one paragraph: dropped on the left half of another, it goes before it')
    check_that('{title-picture.jpg}\n\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-2.jpg}\n\\includegraphics' in code, 'each picture stays on a line of its own')
    move_picture(get_picture('title-picture.jpg', 0), get_picture('picture-3.jpg', 0), 0.8, 0.8)
    check_that(get_picture_order(get_code(), row)[:4] == ['picture-2.jpg', 'picture-1.jpg', 'picture-3.jpg', 'title-picture.jpg'], 'dropped on the right or lower half, it goes after it')
    apage.click('#btn-undo')
    apage.click('#btn-undo')
    apage.wait_for_timeout(300)
    check_that(get_code() == gallery, 'two Undo steps bring the first order back')
    line = move_picture(get_picture('picture-1.jpg', 1), get_picture('picture-3.jpg', 1), 0.5, 0.5)
    code = get_code()
    check_that(line == 'frame' and get_picture_order(code, tab) == ['picture-3.jpg', 'picture-2.jpg', 'picture-1.jpg'], 'table cells: dropped on the middle of another picture, the two swap')
    check_that(code.replace('picture-1.jpg', 'X').replace('picture-3.jpg', 'picture-1.jpg').replace('X', 'picture-3.jpg').endswith(gallery[gallery.index(tab):]), 'the & and \\\\ of the table stay as they were')
    apage.keyboard.press('Control+z')
    apage.wait_for_timeout(300)
    check_that(get_code() == gallery, 'Undo swaps them back')
    line = move_picture(get_picture('picture-2.jpg', 1), get_picture('picture-3.jpg', 1), 0.9, 0.5)
    code = get_code()
    check_that(line == 'upright' and '{picture-1.jpg} &\n&\n\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-3.jpg}\n\\includegraphics[width=\\linewidth,height=38mm,keepaspectratio]{picture-2.jpg}\n\\\\\n\\end{tabular}' in code,
          'table cells: dropped on the right edge of another picture, it goes after it; the & stay')
    actx.close()

    # --- Code <-> preview ---
    set_code(page, read('../src/js/samples.js').split('String.raw`')[1].split('`,')[0])
    page.locator('#pages h2 .num').nth(1).click()
    caret = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionStart + 14); }')
    check_that(caret == '\\section{Math}', 'a click on a heading number puts the cursor on its \\section')
    check_that(page.locator('#pages .source').count() == 1, 'the cursor place is framed in the preview')

    # --- Typing help ---
    page.evaluate('() => { const t = document.querySelector("#code"); const i = t.value.indexOf("\\\\end{document}"); t.focus(); t.setSelectionRange(i, i); }')
    page.keyboard.type('\\begin{enumerate}')
    page.keyboard.press('Enter')
    page.keyboard.type('one')
    page.keyboard.press('Enter')
    page.keyboard.type('two')
    page.wait_for_timeout(500)
    code = get_state(page, 'S.code')
    check_that('\\begin{enumerate}\n  \\item one\n  \\item two\n\\end{enumerate}' in code, 'Enter after \\begin adds \\end and \\item')
    page.keyboard.press('Shift+Home')
    page.keyboard.press('Control+b')
    check_that('\\textbf{' in get_state(page, 'S.code').split('\\begin{enumerate}')[1], 'Ctrl+B makes the selection bold')
    page.keyboard.press('Control+z')
    page.wait_for_timeout(200)

    # --- Document settings rewrite the preamble ---
    open_side_panel(page)
    page.select_option('#d-paper', 'sq')
    page.select_option('#d-font', 'helvet')
    page.select_option('#d-lang', 'de')
    pre = get_state(page, 'S.code.split("\\\\begin{document}")[0]')
    check_that('paperwidth=120mm,paperheight=120mm' in pre, 'paper: square format in geometry')
    check_that('\\usepackage[scaled]{helvet}' in pre and '\\sfdefault' in pre, 'font: Helvetica')
    check_that('\\usepackage[ngerman]{babel}' in pre, 'language: German')
    w, h = get_state(page, '[S.result.meta.paper.w, S.result.meta.paper.h]')
    check_that(abs(w - h) < 1 and abs(w - 120 * 96 / 25.4) < 1, 'the preview uses the square paper')
    page.fill('#d-title', 'A new title')
    page.wait_for_timeout(500)
    check_that('\\title{A new title}' in get_state(page, 'S.code'), 'the title field edits \\title')

    # --- Insert ---
    page.click('[data-itab=insert]')
    page.evaluate('() => { const t = document.querySelector("#code"); const i = t.value.indexOf("\\\\end{document}"); t.focus(); t.setSelectionRange(i, i); }')
    page.click('[data-ins=table]')
    check_that('\\begin{tabular}{lcr}' in get_state(page, 'S.code'), 'Insert > Table')
    page.click('[data-sym="\\\\alpha"]')
    check_that('$\\alpha$' in get_state(page, 'S.code'), 'a Greek letter outside math goes into $…$')
    page.click('[data-itab=properties]')

    # --- My documents, templates ---
    page.click('#btn-new')
    page.click('[data-new=social]')
    check_that(get_state(page, 'S.name') == 'Social media post', 'New > Social media post')
    check_that(get_state(page, 'S.result.meta.pagecolor') == '#14213d', '\\pagecolor colors the page')
    page.click('#btn-files')
    check_that(page.locator('#files-grid .file-card').count() >= 2, 'My documents lists the documents')
    page.locator('#files-grid .file-card:not(.current) .file-open').first.click()
    check_that(get_state(page, 'S.name') == 'Welcome', 'a document opens from My documents')

    # --- Pictures ---
    page.set_input_files('#file', os.path.join(HERE, 'title-picture.jpg'))
    page.wait_for_timeout(600)
    check_that('title-picture.jpg' in get_state(page, 'Object.keys(S.assets)'), 'a picture is stored with the document')
    check_that(page.locator('#pages img.graphic').count() == 1, 'the picture appears on the page')

    # --- Pictures tab ---
    page.click('[data-itab=pictures]')
    check_that(page.locator('#pics-wrap .picture-card').count() == 1 and 'used 1×' in page.inner_text('#pics-wrap'), 'Pictures tab: the picture with where it is used')
    page.evaluate("() => latexEditor.setCode(latexEditor.state.code.replace('\\\\end{document}', '\\\\includegraphics{logo.png}\\n\\\\end{document}'))")
    page.wait_for_timeout(400)
    check_that('logo.png' in page.inner_text('#pics-wrap .missing-pictures'), 'Pictures tab: a picture the code asks for but is missing')
    page.click('[data-pic-ren="title-picture.jpg"]')
    page.fill('.picture-rename', 'cover')
    page.keyboard.press('Enter')
    page.wait_for_timeout(500)
    check_that('cover.jpg' in get_state(page, 'Object.keys(S.assets)') and '{cover.jpg}' in get_state(page, 'S.code') and 'title-picture' not in get_state(page, 'S.code'), 'Rename changes the picture and the code')
    check_that(page.locator('#pages img.graphic').count() == 1, 'the page still shows it')
    with page.expect_file_chooser() as fc:
        page.click('[data-pic-fill="logo.png"]')
    fc.value.set_files(os.path.join(HERE, 'title-picture.jpg'))
    page.wait_for_timeout(600)
    check_that('logo.png' in get_state(page, 'Object.keys(S.assets)') and page.locator('#pics-wrap .missing-pictures').count() == 0, '"Add file…" fills a missing picture under its name')
    page.click('[data-pic-del="logo.png"]')
    page.click('#ask-ok')
    page.wait_for_timeout(300)
    check_that('logo.png' not in get_state(page, 'Object.keys(S.assets)'), 'Remove takes the picture away')
    page.click('[data-itab=properties]')

    # --- AI link to a new document, and a pasted terminal answer ---
    tex = '\\documentclass{article}\\begin{document}\\section{From the AI}Text.\\end{document}'
    z = base64.urlsafe_b64encode(zlib.compress(tex.encode())).decode().rstrip('=')
    page.goto(URL + '#z=' + z + '&file=new&name=AI%20report', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name') == 'AI report' and 'From the AI' in page.inner_text('#pages'), 'an AI link makes a new document')
    link = 'https://latex.giit.ch/#b64=' + base64.urlsafe_b64encode('\\section{Pasted}'.encode()).decode() + '&mode=add'
    answer = 'Here is the link:\n' + link[:40] + '\n' + link[40:] + '\nClick it.'
    page.click('#btn-ai')
    page.fill('#ai-paste', answer)
    page.wait_for_timeout(400)
    check_that(not page.locator('#ask').is_visible(), 'a link changes the document without a question')
    page.wait_for_timeout(400)
    check_that('Pasted' in page.inner_text('#pages'), 'a link broken over lines can be pasted')

    # --- Export ---
    page.click('#btn-export')
    page.select_option('#ex-format', 'png')
    with page.expect_download() as d:
        page.click('#ex-download')
    check_that(d.value.suggested_filename.endswith('.png'), 'export: page as PNG')
    page.select_option('#ex-format', 'html')
    with page.expect_download() as d:
        page.click('#ex-download')
    path = d.value.path()
    with open(path, encoding='utf-8') as f:
        html = f.read()
    check_that('class="sheet"' in html and 'font/woff2' in html, 'export: HTML file with pages and fonts inside')
    page.select_option('#ex-format', 'tex')
    with page.expect_download() as d:
        page.click('#ex-download')
    check_that(d.value.suggested_filename == 'AI report.tex', 'export: .tex')
    page.keyboard.press('Escape')

    # --- Phone ---
    page.set_viewport_size({'width': 390, 'height': 800})
    page.wait_for_timeout(300)
    check_that(page.locator('.views').is_visible(), 'phone: Code / Preview / Document tabs')
    check_that(page.evaluate('document.documentElement.scrollWidth') <= 391, 'phone: no sideways scrolling')
    page.click('[data-pane=code]')
    check_that(page.locator('#code').is_visible(), 'phone: the code view')

    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
