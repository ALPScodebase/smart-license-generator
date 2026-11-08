// Tiny Solidity syntax highlighter. Everything is HTML-escaped, so the output is safe for innerHTML.

const KEYWORDS = new Set(
  (
    'pragma import contract interface is struct function constructor event emit returns return external public ' +
    'internal private view pure payable memory storage calldata if else for while require new indexed constant ' +
    'immutable override virtual true false'
  ).split(' '),
);

const TOKEN_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(\b0x[0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

const TYPE_RE = /^(address|string|bool|bytes\d*|uint\d*|int\d*)$/;
const UNIT_RE = /^(wei|gwei|ether|seconds|minutes|hours|days|weeks)$/;

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlightSolidity(code) {
  let out = '';
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    const [text, comment, str, num, word] = m;
    let cls = null;
    if (comment) cls = 'tok-comment';
    else if (str) cls = 'tok-string';
    else if (num) cls = 'tok-number';
    else if (word) {
      if (KEYWORDS.has(word)) cls = 'tok-keyword';
      else if (TYPE_RE.test(word)) cls = 'tok-type';
      else if (UNIT_RE.test(word)) cls = 'tok-number';
    }
    out += cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text);
    last = m.index + text.length;
  }
  return out + escapeHtml(code.slice(last));
}
