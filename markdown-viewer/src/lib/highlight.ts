// Colors the code blocks of the article. highlight.js's common languages
// (about 40: shell, Python, JS/TS, SQL, JSON, YAML, C#, Java…); a block
// that names no language, or one not among them, stays plain. PowerShell
// and batch files are added: notes written on Windows use them most.
import hljs from "highlight.js/lib/common";
import dos from "highlight.js/lib/languages/dos";
import powershell from "highlight.js/lib/languages/powershell";

hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("dos", dos);

/** Aliases written in Markdown that highlight.js knows by another name. */
const ALIASES: Record<string, string> = { sh: "bash", zsh: "bash", shell: "bash", console: "bash", ps1: "powershell", pwsh: "powershell", bat: "dos", cmd: "dos" };

export function highlightCode(root: HTMLElement) {
  for (const pre of root.querySelectorAll("pre")) {
    // comrak writes ```py as <pre lang="py"><code>.
    const code = pre.querySelector("code");
    const lang = (pre.getAttribute("lang") ?? code?.className.match(/language-(\S+)/)?.[1] ?? "").toLowerCase();
    if (!code || !lang) continue;
    const name = ALIASES[lang] ?? lang;
    if (!hljs.getLanguage(name)) continue;
    // highlight.js escapes the text itself; what it returns is spans around it.
    code.innerHTML = hljs.highlight(code.textContent ?? "", { language: name, ignoreIllegals: true }).value;
    code.classList.add("hljs");
  }
}
