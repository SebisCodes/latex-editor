"""Template placeholders (?template=mustache, ?template=angle), run in Node.

    python3 tests/template_test.py

  letter    a letter template with {{name}}, {{#name}}, {{^name}} and {{/name}}
            (tests/letter-template.tex) has 0 errors with the syntax "mustache", and the
            LaTeX errors for # and ^ with the option off; the same letter in the syntax
            "angle" (tests/letter-template-angle.tex) has 0 errors with "angle"
  errors    a section left open, a stray end tag, an end tag in the wrong order (one
            error) and a sign outside the syntax are errors at the tag
  view      the code view shows the code as written without a color for the tags; the
            template view shows every tag as its text, without boxes or marks
  math      math with tags renders with 0 errors, the tags as their text
  examples  the example view: examples in place of the values (LaTeX's special characters as
            text, math in a \\text group, verbatim and \\verb kept closed), sections and list
            rows applied, the label in brackets without an example; runs of copied text keep
            their place in the code, runs with an example are read-only; the example picture
            from memory, and an address that held a placeholder loads nothing and links nowhere
  invoice   an invoice template (tests/john-doe-invoice.tex) with tgheros and \\familydefault,
            \\definecolor, \\color in groups, \\fontsize, longtable with \\LTleft, booktabs rules
            colored by \\arrayrulecolor, tabularx, \\vfill and \\pagestyle{empty}: no note that the
            preview does not know or understand something, the sans-serif Helvetica face, colored
            rules, the longtable on the left; its example view repeats the item rows
  address   ?template= takes the values mustache and angle
  tidy      Tidy keeps every tag and is the same when run twice
  off       with the option off or an unknown value the editor gives the plain LaTeX result
Needs Node."""
import base64
import html
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.dirname(HERE), 'src', 'js')
LONE_HASH = 'A lone # - write \\# for the character #'
CARET_OUTSIDE_MATH = '^ only works in math - write $x^2$, or \\textasciicircum for the character'
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text, flush=True)
    if not ok:
        failed.append(text)


def read_fixture(name):
    """Returns the text of a file in tests/.

    Args:
        name (str): the file name.

    Returns:
        str: the file's text.
    """
    with open(os.path.join(HERE, name), encoding='utf-8') as file:
        return file.read()


def run_report(cases, addresses):
    """Runs tests/template/report.mjs in Node on the cases.

    Args:
        cases (list[dict]): each with `code` (str) and `template` (str or None).
        addresses (list[str]): query strings for the address check.

    Returns:
        dict: `cases`, one result per case in order, and `addresses`, the syntax read from each.
    """
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as file:
        json.dump({'cases': cases, 'addresses': addresses}, file)
    try:
        run = subprocess.run(['node', os.path.join(HERE, 'template', 'report.mjs'), SCRIPTS, file.name],
                             capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(file.name)
    if run.returncode:
        print(run.stderr)
        sys.exit('report.mjs failed')
    return json.loads(run.stdout)


def get_errors(result):
    """Returns the messages of the errors of a result.

    Args:
        result (dict): one case result of report.mjs.

    Returns:
        list[str]: the messages of the problems of kind "error".
    """
    return [problem['msg'] for problem in result['problems'] if problem['kind'] == 'error']


def get_plain_text(highlighted):
    """Returns the plain text of highlighted HTML.

    Args:
        highlighted (str): the HTML of the code view.

    Returns:
        str: the text with the tags removed and the entities decoded.
    """
    return html.unescape(re.sub(r'<[^>]+>', '', highlighted))


LETTER = read_fixture('letter-template.tex')
LETTER_ANGLE = read_fixture('letter-template-angle.tex')
MATH = '\\begin{document}\nTotal $x = {{#isNet}}{{net_amount}}{{/isNet}}{{^isNet}}{{gross}}{{/isNet}}$ and $y^{{power}}$.\n\\end{document}\n'
COMMENT = '% the {{greeting}} line\nHello {{name}}.\n'
PARAMETER = '\\newcommand{\\wrap}[1]{{#1}}\n\\wrap{x} {{value}}\n'
ERROR_CASES = {
    'section left open': ('mustache', 'A {{#hasNote}} note\n', [(2, 'The section {{#hasNote}} stays open - add {{/hasNote}}')]),
    'stray end tag': ('mustache', 'A {{/hasNote}} note\n', [(2, '{{/hasNote}} is a stray end tag - remove it or add {{#hasNote}} before it')]),
    'wrong order': ('mustache', '{{#outer}}a {{^inner}}b {{/outer}}c {{/inner}}\n',
                    [(24, '{{/outer}} closes {{#outer}} before the inner section {{^inner}} is closed - add {{/inner}} first')]),
    'unknown sign': ('mustache', 'Hello {{&name}} and {{>partial}}.\n',
                     [(6, 'Unknown placeholder {{&name}} - use {{name}}, {{#name}}, {{^name}}, {{/name}}'),
                      (20, 'Unknown placeholder {{>partial}} - use {{name}}, {{#name}}, {{^name}}, {{/name}}')]),
    'nested in order': ('mustache', '{{#a}}{{#b}}x{{/b}}{{^c}}y{{/c}}{{/a}}\n', []),
    'angle section left open': ('angle', 'A <<?hasNote>> note\n', [(2, 'The section <<?hasNote>> stays open - add <</?hasNote>>')]),
    'angle stray end tag': ('angle', 'A <</?hasNote>> note\n', [(2, '<</?hasNote>> is a stray end tag - remove it or add <<?hasNote>> before it')]),
    'angle unknown sign': ('angle', 'A <</hasNote>> note\n', [(2, 'Unknown placeholder <</hasNote>> - use <<name>>, <<?name>>, <</?name>>')]),
}
PICTURE = 'data:image/png;base64,' + base64.b64encode(
    b'\x89PNG\r\n\x1a\n' + b''.join(struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
                              for kind, data in ((b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)), (b'IDAT', zlib.compress(b'\x00' + b'\xff\x00\x00' * 2 + b'\x00' + b'\xff\x00\x00' * 2)), (b'IEND', b'')))).decode()
LETTER_EXAMPLES = {'placeholders': [
    {'name': 'name', 'kind': 'value', 'label': 'Name', 'example': 'John Doe'},
    {'name': 'street', 'kind': 'value', 'label': 'Street', 'example': '1 Main Street'},
    {'name': 'city', 'kind': 'value', 'label': 'City', 'example': 'Springfield & Sons_ 100% $'},
    {'name': 'total', 'kind': 'value', 'label': 'Total', 'example': '42.50'},
    {'name': 'hasNote', 'kind': 'section', 'label': 'With a note', 'shown': False},
    {'name': 'items', 'kind': 'list', 'label': 'Items', 'fields': [{'name': 'label', 'label': 'Item'}, {'name': 'quantity', 'label': 'Quantity'}, {'name': 'price', 'label': 'Price'}],
     'rows': [{'label': 'Chair', 'quantity': '2', 'price': '10'}, {'label': 'Table', 'quantity': '1', 'price': '99'}]},
]}
REFERENCES = ('\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\includegraphics{{{logo}}}\n'
              '\\includegraphics{https://x.invalid/{{id}}.png}\n\\includegraphics{https://x.invalid/b.png{{empty}}}\n'
              '\\{{#off}}{{/off}}{{cmd}}{https://x.invalid/c.png}\n\\include{{word}}{https://x.invalid/d.png}\n' + '\\' * 65 + '{{cmd}}{https://x.invalid/e.png}\n'
              '\\href{https://x.invalid/{{id}}}{go} \\url{https://x.invalid/{{id}}}\n\\end{document}\n')
REFERENCE_EXAMPLES = {'placeholders': [{'name': 'logo', 'kind': 'image', 'label': 'Logo', 'image': 'logo.png'}, {'name': 'id', 'kind': 'value', 'example': '42'},
                                       {'name': 'empty', 'kind': 'value', 'example': ''}, {'name': 'cmd', 'kind': 'value', 'example': 'includegraphics'}, {'name': 'word', 'kind': 'value', 'example': 'graphics'},
                                       {'name': 'off', 'kind': 'section', 'shown': False}],
                      'assets': {'logo.png': PICTURE}}
PLACES = ('\\begin{document}\n\\{{power}} Math $x^{{power}} + {{power}}$ % note {{v}}\n\\verb|{{v}}| and\n\\begin{verbatim}\n{{v}}\n\\end{verbatim}\nEnd.\n\\end{document}\n')
PLACE_EXAMPLES = {'placeholders': [{'name': 'power', 'kind': 'value', 'example': '2 & {x}'}, {'name': 'v', 'kind': 'value', 'example': 'a|b \\end{verbatim} c\nline'}]}
INVOICE = read_fixture('john-doe-invoice.tex')
INVOICE_EXAMPLES = {'placeholders': [
    {'name': 'name', 'kind': 'value', 'example': 'John Doe'},
    {'name': 'items', 'kind': 'list', 'fields': [{'name': 'label'}, {'name': 'quantity'}, {'name': 'price'}, {'name': 'amount'}],
     'rows': [{'label': 'Chair', 'quantity': '2', 'price': '10.00', 'amount': '20.00'}, {'label': 'Table', 'quantity': '1', 'price': '99.00', 'amount': '99.00'}]},
]}
ADDRESSES = ['?template=mustache', '?embed=1&template=angle', '?template=Mustache', '?template=toString',
             '?template=__proto__', '?template=', '?embed=1', '']

cases = [
    {'code': LETTER, 'template': 'mustache'},
    {'code': LETTER, 'template': None},
    {'code': LETTER, 'template': 'handlebars'},
    {'code': LETTER_ANGLE, 'template': 'angle'},
    {'code': LETTER_ANGLE, 'template': None},
    {'code': MATH, 'template': 'mustache'},
    {'code': MATH, 'template': None},
    {'code': COMMENT, 'template': 'mustache'},
    {'code': PARAMETER, 'template': 'mustache'},
    {'code': LETTER, 'template': 'mustache', 'examples': LETTER_EXAMPLES},
    {'code': REFERENCES, 'template': 'mustache', 'examples': REFERENCE_EXAMPLES},
    {'code': REFERENCES, 'template': 'mustache'},
    {'code': PLACES, 'template': 'mustache', 'examples': PLACE_EXAMPLES},
    {'code': INVOICE, 'template': 'mustache', 'examples': INVOICE_EXAMPLES},
] + [{'code': code, 'template': syntax} for syntax, code, expected in ERROR_CASES.values()]
report = run_report(cases, ADDRESSES)
(letter, letter_off, letter_unknown, angle, angle_off, math, math_off, comment, parameter, letter_example, references, references_template, places, invoice), error_results = report['cases'][:14], report['cases'][14:]

print('-- the letter template')
check_that(get_errors(letter) == [], f'mustache: 0 errors (got {get_errors(letter)})')
check_that(len(letter['tags']) == 24, f'mustache: every tag of the template is found ({len(letter["tags"])})')
check_that(LONE_HASH in get_errors(letter_off) and CARET_OUTSIDE_MATH in get_errors(letter_off),
           f'option off: the LaTeX errors for # and ^ ({len(get_errors(letter_off))} errors)')
check_that(len(get_errors(letter_off)) == 3, 'option off: the plain LaTeX checker finds 3 errors')
check_that(letter_unknown['problems'] == letter_off['problems'] and letter_unknown['html'] == letter_off['html']
           and letter_unknown['highlighted'] == letter_off['highlighted'], 'an unknown syntax gives the plain LaTeX result')
check_that(get_errors(angle) == [], f'angle: 0 errors (got {get_errors(angle)})')
check_that(angle_off['highlighted'] == angle['highlighted'] and 'template-tag' not in angle_off['html'], 'angle, option off: plain LaTeX colors and preview')

print('-- placeholder errors')
for (name, (syntax, code, expected)), result in zip(ERROR_CASES.items(), error_results):
    found = [(problem['pos'], problem['msg']) for problem in result['problems'] if problem['kind'] == 'error']
    check_that(found == expected, f'{syntax} {name}: {found}')

print('-- code view')
for label, result, code in (('mustache', letter, LETTER), ('angle', angle, LETTER_ANGLE), ('off', letter_off, LETTER)):
    check_that(get_plain_text(result['highlighted']) == code, f'{label}: the highlighted text is the code')
check_that('class="tp"' not in letter['highlighted'] + angle['highlighted'] + comment['highlighted'], 'no tag gets a color of its own')
check_that(letter['highlighted'] == letter_off['highlighted'], 'the code view is the same with and without the option')

print('-- template view')
check_that('template-tag' not in letter['html'] + angle['html'] and 'template-section' not in letter['html'], 'no boxes and no marks')
check_that('>{{senderName}}</span>' in letter['html'] and '>{{#hasNote}}</span>' in letter['html'] and '>{{^hasNote}}</span>' in letter['html'],
           'every tag shows as its text, sections too')
check_that('&lt;&lt;?hasNote&gt;&gt;</span>' in angle['html'] and '&lt;&lt;/?hasNote&gt;&gt;</span>' in angle['html'], 'angle: the tags as their text')
check_that('template-tag' not in letter_off['html'], 'option off: plain LaTeX preview')
check_that(get_errors(parameter) == [] and parameter['tags'] == ['{{value}}'], 'the LaTeX parameter {{#1}} stays LaTeX')

print('-- math')
check_that(get_errors(math) == [], f'math with tags renders with 0 errors (got {get_errors(math)})')
check_that('\\text{\\{\\{net\\_amount\\}\\}}' in math['mathEscaped'] and 'boxed' not in math['mathEscaped'],
           'in math every tag is its text, no boxed name')
check_that(any(message.startswith('Math:') for message in get_errors(math_off)), 'option off: the same math is a KaTeX error')

print('-- examples')
example = letter_example['example']
shown = re.sub(r'<[^>]+>', '', example['html'])
check_that('{{' not in example['text'] and 'John Doe' in shown and '1 Main Street' in shown, 'the examples stand in place of the values')
check_that('Chair: 2' in re.sub(r'<[^>]+>', '', example['html']) and 'Table: 1' in re.sub(r'<[^>]+>', '', example['html']), 'a list repeats its body once per example row')
check_that('Note:' not in example['html'] and 'If you have questions' in example['html'], 'a section by its example state, the inverted section the opposite')
check_that('[postalCode]' in example['html'] and '[orderNumber]' in example['html'], 'a placeholder without an example shows its name in brackets')
check_that('Springfield &amp; Sons_ 100% $' in html.unescape(example['html']).replace('&', '&amp;'), 'LaTeX special characters of an example show as text')
check_that(get_errors(example) == [], f'the example view reads with 0 errors (got {get_errors(example)})')
runs = dict((int(start), text) for start, text in re.findall(r'<span class="t" data-s="(\d+)">([^<]*)</span>', example['html']))
check_that(runs.get(LETTER.index('Dear')) == 'Dear', 'a run of copied text keeps its place in the code')
check_that(all(LETTER[start:start + len(html.unescape(text))] == html.unescape(text) for start, text in runs.items()), 'every editable run matches the code at its place')
check_that(not any('John' in text for text in runs.values()) and f'<span data-p="{LETTER.index("{{name}},")}">John</span>' in example['html'],
           'a run with an example is read-only and leads to its tag')
check_that(example['outline'][0]['pos'] == LETTER.index('\\section*'), 'the outline leads to the code')
ref = references['example']
check_that('src="data:image/png;base64,' in ref['html'], 'the example picture comes from memory')
check_that('x.invalid/42' not in ref['html'].replace('alt="https://x.invalid/42.png"', '').replace('data-file="https://x.invalid/42.png"', '').replace('>https://x.invalid/42<', '>'),
           'an address that held a placeholder is neither loaded nor linked')
check_that('href="#"' in ref['html'] and 'href="https://x.invalid' not in ref['html'], 'links whose address held a placeholder lead nowhere')
check_that('src="https://x.invalid/b.png"' not in ref['html'], 'an address whose placeholder is filled with an empty example still loads nothing')
check_that('src="https://x.invalid/c.png"' not in ref['html'] and '\\ includegraphics' in ref['text'], 'an example right after a backslash (sections left out) makes no command')
check_that('x.invalid/d.png"' not in ref['html'] and '\\include{}graphics' in ref['text'], 'an example after the letters of a command name does not go on with the name')
check_that('x.invalid/e.png"' not in ref['html'], 'a run of backslashes longer than the text a fill sees counts as unescaped')
check_that('href="https://x.invalid' not in references_template['html'] and 'src="https://x.invalid' not in references_template['html'],
           'template view: links and pictures whose address holds a placeholder lead nowhere and load nothing')
place = places['example']
check_that(get_errors(place) == [], f'math, comments, \\verb and verbatim with examples read with 0 errors (got {get_errors(place)})')
check_that(place['text'].startswith('\\begin{document}\n\\ 2 \\& \\{x\\}') and '{\\text{2 \\& \\{x\\}}}' in place['text'] and '\\verb|ab \\end{verbatim} c line|' in place['text'] and 'End.' in place['html'],
           'after a backslash an example makes no command, math gets a \\text group, \\verb loses its delimiter, verbatim stays open to its own end')

print('-- invoice')
notes = [problem['msg'] for problem in invoice['problems'] if 'not known' in problem['msg'] or 'not understood' in problem['msg'] or 'Unknown command' in problem['msg']]
check_that(notes == [] and get_errors(invoice) == [], f'no note that the preview does not know or understand something, 0 errors {notes}')
check_that(invoice['meta']['sans'] and invoice['meta']['sansFont'] == 'helvet', 'tgheros with \\familydefault: the sans-serif Helvetica face')
check_that('border-top:0.8pt solid #9db4cc' in invoice['html'] and 'border-bottom:0.8pt solid #1f4e79' in invoice['html'], '\\arrayrulecolor colors the booktabs rules, in the preamble and in the table')
check_that('class="p ni al-l" data-p' in invoice['html'], '\\LTleft 0pt puts the longtable on the left')
check_that('font-size:26.57px' in invoice['html'] and 'color:#1f4e79' in invoice['html'] and 'class="vfill"' in invoice['html'], '\\fontsize, \\color in a group and \\vfill')
check_that(invoice['meta']['pagestyle'] == 'empty', '\\pagestyle{empty}')
shown = re.sub(r'<[^>]+>', ' ', invoice['example']['html'])
check_that('Chair' in shown and 'Table' in shown and '99.00' in shown and invoice['example']['html'].count('<tr>') == 5, 'the example view repeats the item rows of the longtable (and keeps the header, total and tabularx rows)')

print('-- address')
check_that(report['addresses'] == ['mustache', 'angle', None, None, None, None, None, None], f'?template= values: {report["addresses"]}')

print('-- tidy')
for label, result in (('mustache', letter), ('angle', angle)):
    check_that(result['tidiedTags'] == result['tags'], f'{label}: Tidy keeps every tag')
    check_that(result['tidiedTwice'] == result['tidied'], f'{label}: Tidy twice is the same')

print(f'\n{len(failed)} failed' if failed else '\nall passed')
sys.exit(1 if failed else 0)
