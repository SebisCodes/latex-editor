/**
 * The welcome example (shown on the first visit and by "New" > "The welcome example") and the
 * templates of the "New" menu, each with its name and LaTeX code.
 */

/** The document "My documents" starts with when it is empty. */
export const START = {
    name: 'Welcome',
    code: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath}
\usepackage{graphicx}
\usepackage{xcolor}

% Click any text in the preview to edit it right there.
\definecolor{brand}{HTML}{2B59C3}

\title{Welcome to the \LaTeX{} Editor}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle

\section{Writing}
Type on the left, read on the right: the preview shows the pages as they
will be printed. Write \textbf{bold}, \textit{italic} or
\textcolor{brand}{colored} text, and leave an empty line for a new
paragraph.\footnote{Footnotes go to the bottom of the page.}

\subsection{Lists and tables}
\begin{itemize}
  \item Sections are numbered by themselves.
  \item References such as Table~\ref{tab:plan} and
        Equation~\eqref{eq:euler} always stay right.
\end{itemize}

\begin{table}[h]
  \centering
  \begin{tabular}{lcr}
    \hline
    Step & Who & Days \\
    \hline
    Draft  & Anna  & 3 \\
    Review & Ben   & 1 \\
    \hline
  \end{tabular}
  \caption{A small plan}
  \label{tab:plan}
\end{table}

\section{Math}
Inline math such as $a^2 + b^2 = c^2$ sits in the text, displayed
math gets a number:
\begin{equation}
  e^{i\pi} + 1 = 0 \label{eq:euler}
\end{equation}
\begin{align}
  f(x) &= \int_0^x t^2 \, dt \\
       &= \frac{x^3}{3}
\end{align}

\section{Next steps}
Open \textbf{Insert} on the right for ready-made pieces, \textbf{Export}
for a PDF, and \textbf{AI Assistant} to let an AI write with you.

\end{document}
`,
};

/** The templates of the "New" menu by their key in the menu. */
export const TEMPLATES = {
    article: {
        name: 'Article',
        code: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath}
\usepackage{graphicx}

\title{Title}
\author{Author}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
A short summary of the article.
\end{abstract}

\section{Introduction}
Text.

\section{Main part}
Text.

\section{Conclusion}
Text.

\end{document}
`,
    },
    letter: {
        name: 'Letter',
        code: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[margin=2.5cm]{geometry}
\usepackage{parskip}
\pagestyle{empty}

\begin{document}

\begin{flushright}
Your Name\\
Street 1\\
1234 Town\\[1em]
\today
\end{flushright}

\vspace{1cm}
Recipient Name\\
Company\\
Street 2\\
5678 City

\vspace{1.5cm}
\textbf{Subject of the letter}

Dear Sir or Madam,

the text of the letter.

Kind regards

\vspace{1.5cm}
Your Name

\end{document}
`,
    },
    exercise: {
        name: 'Exercise sheet',
        code: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[margin=2.5cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{listings}

\title{Solutions to Exercise Sheet 1}
\author{A. Foo \and B. Bar}
\date{Deadline: Monday, 10:00}

\begin{document}
\maketitle

\section*{Exercise 1}
\subsection*{a)}
Let $n \in \mathbb{N}$. Then
\[
  \sum_{k=1}^{n} k = \frac{n(n+1)}{2}.
\]

\subsection*{b)}
\begin{lstlisting}[language=Python]
def triangle(n):
    return n * (n + 1) // 2
\end{lstlisting}

\section*{Exercise 2}
\begin{enumerate}
  \item First answer.
  \item Second answer.
\end{enumerate}

\end{document}
`,
    },
    social: {
        name: 'Social media post',
        code: String.raw`\documentclass{article}
\usepackage[paperwidth=120mm,paperheight=120mm,margin=0mm]{geometry}
\usepackage[utf8]{inputenc}
\usepackage{xcolor}
\usepackage{helvet}
\renewcommand{\familydefault}{\sfdefault}
\pagestyle{empty}
\definecolor{bg}{HTML}{14213D}
\definecolor{accent}{HTML}{FCA311}
\pagecolor{bg}

\begin{document}
\color{white}
\vspace*{12mm}
\begin{center}
{\fontsize{11}{14}\selectfont\color{accent}\MakeUppercase{New in October}}\\[4mm]
{\fontsize{30}{34}\selectfont\textbf{Big headline\\on two lines}}\\[6mm]
\textcolor{accent}{\rule{24mm}{1.2mm}}\\[6mm]
{\fontsize{12}{16}\selectfont A short line of text\\that says what this is about.}
\end{center}
\vfill
\begin{center}
{\fontsize{10}{12}\selectfont www.example.com}
\end{center}
\vspace*{8mm}
\end{document}
`,
    },
};
