// Bounded shell inspection for governance checks. It never executes the command.
import {existsSync, statSync, readFileSync, openSync, readSync, closeSync} from 'node:fs';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {resolve, relative, dirname, basename, join, posix, sep, isAbsolute} from 'node:path';
import {canonicalPath} from './confined-path.mjs';
export class ShellParseError extends Error {}
// Wrap an evaluator so a command the tokenizer cannot parse yields no verdict from it.
// runtime-integrity-guard owns the single "could not parse" ask for the whole suite.
export const tolerant = evaluate => j => {
  try { return evaluate(j); } catch (e) { if (e instanceof ShellParseError) return null; throw e; }
};
// Skip the bodies of the heredocs opened on the line that just ended; return the index of the
// last character of the final terminator line (or of the source when a terminator is missing).
function skipHeredocs(source, at, pending) {
  let pos = at + 1;
  for (const entry of pending) {
    const {delim, strip} = entry, start = pos; let bodyEnd = -1;
    while (pos < source.length) {
      let eol = source.indexOf('\n', pos); if (eol < 0) eol = source.length;
      let line = source.slice(pos, eol).replace(/\r$/, ''); if (strip) line = line.replace(/^\t+/, '');
      const lineStart = pos;
      pos = eol + 1;
      if (line === delim) {bodyEnd = lineStart; break;}
    }
    entry.body = source.slice(start, pos);
    entry.text = source.slice(start, bodyEnd < 0 ? source.length : bodyEnd);
  }
  return pos - 1;
}
const ANSI_ESCAPES = {n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?'};
// Decode a $'...' word the way bash does; `at` is the opening quote. Returns [text, index of the closing quote].
function ansiC(source, at) {
  let out = '';
  for (let i = at + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "'") return [out.split('\0')[0], i];
    if (c !== '\\') {out += c; continue;}
    const n = source[++i]; if (n === undefined) break;
    let m;
    if (Object.hasOwn(ANSI_ESCAPES, n)) out += ANSI_ESCAPES[n];
    else if (n === 'x' && (m = /^[0-9a-fA-F]{1,2}/.exec(source.slice(i + 1)))) {out += String.fromCharCode(parseInt(m[0], 16)); i += m[0].length;}
    else if ((n === 'u' || n === 'U') && (m = /^[0-9a-fA-F]{1,8}/.exec(source.slice(i + 1)))) {out += String.fromCodePoint(Math.min(parseInt(m[0], 16), 0x10ffff)); i += m[0].length;}
    else if (/[0-7]/.test(n) && (m = /^[0-7]{1,3}/.exec(source.slice(i)))) {out += String.fromCharCode(parseInt(m[0], 8) & 255); i += m[0].length - 1;}
    else out += '\\' + n;
  }
  throw new ShellParseError('Unterminated ANSI-C quote');
}
// Each command is {words, opaque, piped}. Subshell parentheses, $( ) and backticks end the surrounding
// command and start a new one, so the commands inside them are inspected like top-level commands. They also
// leave a {words: [], marker: 'open' | 'close'} entry, so a caller can scope a `cd` to the subshell it ran in.
// In PowerShell a command that follows the call operator & carries call: true.
export function shellCommands(source, language = 'bash') {
  if (typeof source !== 'string' || source.length > 1048576) throw new ShellParseError('Invalid shell command');
  const ps = language === 'powershell';
  const commands = [], heredocs = []; let words = [], token = '', active = false, quote = '', opaque = false, pipeIn = false, depth = 0, callOp = false, tick = false;
  const word = () => {if (active) words.push(token); token = ''; active = false;};
  const end = () => {
    word();
    if (words.length) {
      for (const h of heredocs) if (h.owner < 0) h.owner = commands.length;
      commands.push({words, opaque, piped: pipeIn, ...callOp && {call: true}}); pipeIn = false; callOp = false;
    }
    words = []; opaque = false;
  };
  const mark = marker => {end(); commands.push({words: [], marker});};
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (quote) {
      if (c === quote) {
        if (ps && next === quote) {token += c; i++;}
        else quote = '';
      } else if ((ps && c === '`') || (!ps && c === '\\' && quote === '"' && /["\\$`\n]/.test(next || ''))) {if (next != null) token += source[++i];}
      else {token += c; if (quote === '"' && /[$`]/.test(c)) opaque = true;}
      continue;
    }
    if (ps && c === '@' && (next === "'" || next === '"') && /^[ \t]*\r?\n/.test(source.slice(i + 2, i + 40))) {
      const close = source.indexOf('\n' + next + '@', i + 2);
      if (close < 0) throw new ShellParseError('Unterminated shell here-string');
      active = true; opaque = true; i = close + 2; continue;
    }
    if (c === '"' || c === "'") {quote = c; active = true; continue;}
    if (!ps && c === '<' && next === '<' && source[i + 2] !== '<' && source[i - 1] !== '<') {
      const m = /^(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|<>()'"]+))/.exec(source.slice(i + 2));
      if (m) {word(); heredocs.push({delim: m[2] ?? m[3] ?? m[4], strip: m[1] === '-', owner: -1}); opaque = true; i += 1 + m[0].length; continue;}
    }
    if (c === '\\' && !ps && /[\s'"\\;&|()]/.test(next || '')) {token += source[++i]; active = true; continue;}
    // bash drops an unquoted backslash before an ordinary character, so g\it and r\m are git and rm. Only in the command word:
    // an argument such as a cmd /c path keeps its backslashes.
    if (c === '\\' && !ps && /\w/.test(next || '') && !token.includes(':') && executable([...words, token]) === words.length) {active = true; continue;}
    if (c === '`' && ps && next != null) {token += source[++i]; active = true; continue;}
    if (c === '|' && !ps && token.endsWith('>')) {token += c; continue;}
    if (!ps && c === '$' && next === "'") {const [text, close] = ansiC(source, i + 1); token += text; active = true; i = close; continue;}
    // A PowerShell call operator whose target is a $( ) subexpression runs whatever the subexpression returns.
    if (c === '$' && next === '(') {if (ps && callOp && !words.length && !active) commands.push({words: [], marker: 'call'}); mark('open'); if (ps) depth++; i++; continue;}
    if (!ps && c === '`') {mark(tick ? 'close' : 'open'); tick = !tick; continue;}
    if (!ps && c === '(') {mark('open'); continue;}
    if (!ps && c === ')') {mark('close'); continue;}
    if (ps && depth) {
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) {mark('close'); continue;}
    }
    if (/[;|&\n]/.test(c)) {
      end();
      if (c === '|' && next !== '|' && source[i - 1] !== '|') pipeIn = true;
      if (ps && c === '&' && next !== '&' && source[i - 1] !== '&') callOp = true;
      if (c === '\n' && heredocs.length) {
        const batch = heredocs.splice(0);
        i = skipHeredocs(source, i, batch);
        for (const h of batch) if (commands[h.owner]) {
          commands[h.owner].heredoc = (commands[h.owner].heredoc ?? '') + h.body;
          commands[h.owner].heredocText = (commands[h.owner].heredocText ?? '') + h.text;
        }
      }
      continue;
    }
    if (/\s/.test(c)) {word(); continue;}
    if (c === '#' && !active) {while (i < source.length && source[i] !== '\n') i++; end(); continue;}
    if (/[(){}$`<>]/.test(c)) opaque = true;
    token += c; active = true;
  }
  if (quote) throw new ShellParseError('Unterminated shell quote'); end(); return commands;
}
// The bodies of $( ) and backtick substitutions. They are executed text the tokenizer cannot attribute,
// even inside double quotes, so a caller asks when one names git or a protected path.
export function substitutionBodies(source) {
  const out = []; let single = false, double = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"' && !single) {double = !double; continue;}
    if (c === "'" && !double) {single = !single; continue;}
    if (single) continue;
    if (c === '$' && source[i + 1] === '(') {
      let depth = 0, j = i + 1;
      for (; j < source.length; j++) {if (source[j] === '(') depth++; else if (source[j] === ')' && --depth === 0) break;}
      out.push(source.slice(i + 2, j)); i = j;
    } else if (c === '`') {
      const j = source.indexOf('`', i + 1);
      out.push(source.slice(i + 1, j < 0 ? source.length : j)); i = j < 0 ? source.length : j;
    }
  }
  return out;
}
// An interpreter's inline body (node -e, python -c, pwsh -Command, bash -c, cmd /c "...") is text no path fact sees.
const INTERPRETER = /^(?:node|nodejs|bun|deno|python[\d.]*|py|perl|ruby|pwsh|powershell|bash|sh|zsh|dash|ksh|cmd)$/;
const INLINE_FLAG = /^(?:-[a-zA-Z]*[ecp]|--eval|--print|-command|\/[ck])(?:=|$)/i;
// eval, iex and Invoke-Expression run their operands as code.
const EVALS = /^(?:eval|iex|invoke-expression)$/;
export function inlineBodies(source, language) {
  return shellCommands(source, language).flatMap(({words, heredoc}) => {
    const w = words.slice(executable(words)), name = exeName(w[0] || '');
    if (EVALS.test(name)) return [w.slice(1).join(' ')];
    if (!INTERPRETER.test(name)) return [];
    return [...w.some(x => INLINE_FLAG.test(x)) || (name === 'deno' && w[1] === 'eval') ? [w.slice(1).join(' ')] : [], ...heredoc ? [heredoc] : []];
  });
}
// The path-like words after an interpreter's inline body (node -e BODY a b): its argv, which the body may open or write.
export function inlineOperands(source, language) {
  return shellCommands(source, language).flatMap(({words}) => {
    const w = words.slice(executable(words));
    if (!INTERPRETER.test(exeName(w[0] || ''))) return [];
    let at = -1;
    for (let k = 1; k < w.length && /^[-\/]/.test(w[k]); k++) if (INLINE_FLAG.test(w[k])) {at = k; break;}
    if (at < 0) return [];
    return w.slice(at + (w[at].includes('=') ? 1 : 2)).filter(x => !x.startsWith('-') && (/[\/\\]/.test(x) || /\.\w+$/.test(x)));
  });
}
// Text that names a protected location, for the nets that judge a body or a verb the parser does not model.
export const NAMES_PROTECTED = /docs[\/\\]+(?:fixes|insights|decisions)\b|(?:^|[^\w.-])DECISIONS?\.md\b|(?:^|[^\w.-])hooks[\/\\]|\.claude[\/\\]+settings|\.eidolon\b|\.git(?:[\/\\]|$|\s|['"])|policy-manifest/i;
// Text that makes an inline body consent tier: it names a policy authority, hooks, .claude, or git beyond a read-only subcommand.
export const AUTHORITY_TEXT = /\.claude[\/\\]+settings(?:\.local)?\.json|\.eidolon[\/\\]+policy-manifest\.json|(?:^|[^\w.-])hooks[\/\\]|['"]hooks['"]|\bhooks\b|(?<!\w)\.claude\b/i;
export const GIT_WORD = /\bgit\b(?!\s+(?:status|log|diff|show|rev-parse|rev-list|describe|ls-files|ls-tree|cat-file|blame|shortlog|merge-base)\b)/i;
// The body as the shell it is handed to reads it: a backslash before an ordinary character is dropped (g\it is git).
export const unescaped = body => body.replace(/\\(?=\w)/g, '');

const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const exeName = w => basename(String(w).replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');
const KEYWORD = /^(?:then|do|else|elif|if|while|until|!|\{|time)$/;
const ENV_VALUE = /^(?:-u|-C|-S|--unset|--chdir|--split-string)$/;
const TIMEOUT_VALUE = /^(?:-s|-k|--signal|--kill-after)$/;
const STDBUF_VALUE = /^(?:-i|-o|-e|--input|--output|--error)$/;
const FLOCK_VALUE = /^(?:-w|-E|--timeout|--wait|--conflict-exit-code)$/;
const IONICE_VALUE = /^(?:-c|-n|-p|-P|-u|--class|--classdata|--pid)$/;
const SUDO_VALUE = /^(?:-u|-g|-h|-p|-C|-D|-r|-t|-T|-U|--user|--group|--host|--prompt|--close-from|--chdir|--role|--type|--other-user)$/;
const XARGS_VALUE = /^(?:-I|-n|-P|-d|-E|-L|-s|-a|-l|--max-args|--max-procs|--delimiter|--eof|--arg-file|--max-lines|--max-chars|--replace)$/;
// Index of the command word: past assignments, shell keywords, and the wrappers that run what follows
// (env with its flags, sudo, time, nice, xargs, timeout, stdbuf, winpty, flock, ionice, unbuffer, chronic, command, exec, cmd /c).
export function executable(words) {
  let at = 0;
  for (;;) {
    const w = words[at]; if (w === undefined) return at;
    const name = exeName(w);
    if (ASSIGNMENT.test(w) || KEYWORD.test(w) || /^(?:command|exec|nohup|builtin)$/.test(name)) at++;
    else if (name === 'cmd' && /^\/[ck]$/i.test(words[at + 1] ?? '') && (words.length > at + 3 || !/\s/.test(words[at + 2] ?? ''))) at += 2;
    else if (/^(?:env|sudo|nice|xargs|timeout|stdbuf|winpty|flock|ionice|unbuffer|chronic)$/.test(name)) {
      const valued = {env: ENV_VALUE, sudo: SUDO_VALUE, xargs: XARGS_VALUE, timeout: TIMEOUT_VALUE, stdbuf: STDBUF_VALUE, flock: FLOCK_VALUE, ionice: IONICE_VALUE, nice: /^-n$/}[name] ?? /(?!)/;
      at++;
      while (words[at] !== undefined && words[at].startsWith('-') && words[at] !== '--') at += valued.test(words[at]) ? 2 : 1;
      if (words[at] === '--') at++;
      // timeout takes a duration and flock a lock file before the command
      if (/^(?:timeout|flock)$/.test(name) && words[at] !== undefined) at++;
    } else return at;
  }
}
// `env -S "cmd args"` and `flock FILE -c "cmd args"` run the command their string spells; put those words where the string was.
function expandWrapperStrings(words) {
  for (let i = 0; i < words.length; i++) {
    if (exeName(words[i]) === 'flock' && executable(words.slice(0, i)) === i) {
      // flock FILE -c 'cmd args' runs the command string
      const c = words.findIndex((x, j) => j > i && /^(?:-c|--command)$/.test(x));
      if (c > 0 && words[c + 1] !== undefined) return expandWrapperStrings([...words.slice(0, i), ...shellCommands(words[c + 1], 'bash').flatMap(x => x.words), ...words.slice(c + 2)]);
    }
    if (exeName(words[i]) !== 'env' || executable(words.slice(0, i)) !== i) continue;
    for (let j = i + 1; words[j] !== undefined && words[j].startsWith('-') && words[j] !== '--'; j += ENV_VALUE.test(words[j]) ? 2 : 1) {
      const spaced = /^(?:-S|--split-string)$/.test(words[j]), glued = /^(?:-S|--split-string=)(.+)$/s.exec(words[j]);
      if (!spaced && !glued) continue;
      return expandWrapperStrings([...words.slice(0, j), ...shellCommands(spaced ? words[j + 1] ?? '' : glued[1], 'bash').flatMap(c => c.words), ...words.slice(j + (spaced ? 2 : 1))]);
    }
  }
  return words;
}
const CD = /^(?:cd|Set-Location|pushd)$/i;
const firstOperand = w => w.slice(1).find(x => !x.startsWith('-'));
const META = /[*?\[{$]/;
// A scratch directory named by a variable is not a protected place.
const TEMP_VARIABLE = /^\$(?:\{(?:TMPDIR|TEMP|TMP)\}|(?:TMPDIR|TEMP|TMP)|env:(?:TEMP|TMP|TMPDIR))(?=[\/\\]|$)/i;
const NULL_DEVICE = /^(?:\$null|nul|\/dev\/(?:null|stdout|stderr|tty|zero|full))$/i;
// Track the working directory across `cd`. A glob or variable target cannot be resolved, so its
// unresolved tail is kept in `pending` and prefixed to every later relative operand.
function changeDirectory(current, pending, target) {
  const t = (cleanOperand(target) ?? target).replace(/\\/g, '/');
  const i = t.search(META);
  if (i < 0) return pending && !isAbsolute(t) ? {current, pending: posix.join(pending, t)} : {current: resolve(current, t), pending: ''};
  const cut = t.lastIndexOf('/', i), base = t.slice(0, cut + 1), rest = t.slice(cut + 1);
  if (isAbsolute(t)) return {current: resolve(base || '/'), pending: rest};
  if (pending) return {current, pending: posix.join(pending, t)};
  return {current: base ? resolve(current, base) : current, pending: rest};
}
// A shell -c body, an eval body and an iex body are code the shell runs next. One that names nothing protected, holds no variable
// or substitution and nests no other body is parsed one level and its commands are judged like top-level ones (a protected parent
// is then caught though no protected path is named). The others keep the consent-tier ask in runtime-integrity-guard; a nested
// body or one that cannot be parsed becomes an unparsed step, which is an opaque fact.
function bodyOf(w) {
  const name = exeName(w[0] ?? '');
  if (name === 'eval') return {text: w.slice(1).join(' '), language: 'bash'};
  if (/^(?:iex|invoke-expression)$/.test(name)) return {text: w.slice(1).join(' '), language: 'powershell'};
  if (name === 'cmd') {
    const k = w.findIndex((x, i) => i > 0 && /^\/[ck]$/i.test(x));
    return k > 0 && w[k + 1] !== undefined ? {text: w.slice(k + 1).join(' '), language: 'powershell'} : null; // cmd paths keep their backslashes
  }
  const sh = /^(?:bash|sh|zsh|dash|ksh)$/.test(name);
  if (!sh && !/^(?:pwsh|powershell)$/.test(name)) return null;
  const at = w.findIndex((x, k) => k > 0 && (sh ? /^-[a-zA-Z]*c[a-zA-Z]*$/ : /^-(?:c|com\w*)$/i).test(x));
  // PowerShell joins every argument after -Command into the command it runs.
  return at > 0 && w[at + 1] !== undefined ? {text: sh ? w[at + 1] : w.slice(at + 1).join(' '), language: sh ? 'bash' : 'powershell'} : null;
}
const unparsedStep = (current, pending) => ({w: [], prefix: [], current, pending, exported: [], unparsed: true});
// A step that carries facts of its own instead of a command: a script scan, an opaque reason, a script outside the root.
const factStep = (current, facts) => ({w: [], prefix: [], current, pending: '', exported: [], facts});
const opaqueStep = (current, reason) => factStep(current, [{kind: 'opaque', op: null, verb: '', mutation: true, value: '', opaque: false, reason}]);
function bodySteps(body, current, pending, ctx = {}) {
  const {text, language} = body;
  if (!text || /[$`]/.test(text) || [text, unescaped(text)].some(b => NAMES_PROTECTED.test(b) || AUTHORITY_TEXT.test(b) || GIT_WORD.test(b))) return [];
  try {
    if ((ctx.depth ?? 0) > 2 || inlineBodies(text, language).length) throw new ShellParseError('A shell body nests another body');
    return steps(text, current, language, ctx).map(s => ({...s, pending: s.pending || pending, inner: true}));
  } catch (e) {
    if (e instanceof ShellParseError) return [unparsedStep(current, pending)];
    throw e;
  }
}

// ---- Lexical scan of code the parser does not model: a script file, an interpreter's inline body, a decoded command.
// It reads string literals and call names only and never runs anything. Lexing and matching are heuristics: a mutation call's
// literal targets are judged where they point, and a protected name it cannot tie to one asks only when some target is not a literal.
const SCRIPT_LIMIT = 512 * 1024;
// Split code into its string literals and the code between them; `code` keeps a \x01N\x02 marker where literal N stood.
// A template-literal ${...} becomes \x03 inside the literal, so a caller knows part of the text is a variable.
function lex(text, kind) {
  const literals = []; let code = '';
  const lines = kind === 'js' ? ['//'] : kind === 'other' ? ['#', '//'] : ['#'];
  const blocks = kind === 'js' || kind === 'other' ? [['/*', '*/']] : kind === 'ps' ? [['<#', '#>']] : [];
  for (let i = 0; i < text.length;) {
    const c = text[i], block = blocks.find(([open]) => text.startsWith(open, i));
    if (block) {const close = text.indexOf(block[1], i + block[0].length); i = close < 0 ? text.length : close + block[1].length; code += ' '; continue;}
    if (lines.some(l => text.startsWith(l, i)) && (!lines.includes('#') || !text.startsWith('#', i) || !/[\w$]/.test(text[i - 1] ?? ' '))) {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'" || (c === '`' && kind === 'js')) {
      const triple = kind === 'py' && text.startsWith(c.repeat(3), i), q = triple ? c.repeat(3) : c, multi = triple || c === '`';
      let j = i + q.length, value = '';
      for (; j < text.length; j++) {
        if (text.startsWith(q, j)) {
          if (kind === 'ps' && !triple && text[j + 1] === c) {value += c; j++; continue;}
          break;
        }
        const d = text[j];
        if (!multi && d === '\n') {j--; break;}
        if (d === '\\' && kind !== 'ps' && j + 1 < text.length && /["'`\\]/.test(text[j + 1])) {value += text[++j]; continue;}
        if (kind === 'ps' && d === '`' && j + 1 < text.length) {value += text[++j]; continue;}
        if (kind === 'js' && c === '`' && d === '$' && text[j + 1] === '{') {
          let depth = 0, k = j + 1;
          for (; k < text.length; k++) {if (text[k] === '{') depth++; else if (text[k] === '}' && --depth === 0) break;}
          value += '\x03'; j = k; continue;
        }
        value += d;
      }
      literals.push(value); code += '\x01' + (literals.length - 1) + '\x02'; i = j + q.length; continue;
    }
    code += c; i++;
  }
  return {code, literals};
}
// The calls, by language. `exec` calls run a command line (judged by parsing it); the others change files themselves.
const FS_JS = String.raw`\b(?:rmSync|rmdirSync|unlinkSync|writeFileSync|appendFileSync|renameSync|truncateSync|ftruncateSync|copyFileSync|linkSync|symlinkSync|cpSync|rimrafSync|removeSync|moveSync|outputFileSync|emptyDirSync|writeJsonSync|outputJsonSync|rimraf)\s*\(`;
const FSQ_JS = String.raw`\b(?:fs|fsp|promises|fsPromises|fse|fsExtra)\.(?:promises\.)?(?:rm|rmdir|unlink|writeFile|appendFile|rename|truncate|copyFile|link|symlink|cp|remove|move|outputFile|writeJson|emptyDir|outputJson)\s*\(`;
const FSBARE_JS = String.raw`(?<![.\w$])(?:rm|rmdir|unlink|writeFile|appendFile|rename|truncate|copyFile|link|symlink|cp)\s*\(`;
const DENO_JS = String.raw`\b(?:Deno\.(?:remove|writeTextFile|writeFile|rename|copyFile|truncate|symlink|link)(?:Sync)?|Bun\.write)\s*\(`;
const EXEC_JS = String.raw`\b(?:execSync|execFileSync|spawnSync|execaSync|execa|execaCommand|(?:child_process|cp|childProcess)\.(?:exec|execFile|spawn|fork)|Deno\.(?:run|Command)|Bun\.(?:spawn|spawnSync))\s*\(|(?<![.\w$])(?:exec|execFile|spawn|fork)\s*\(`;
const FS_PY = String.raw`\bos\.(?:remove|unlink|rename|renames|replace|rmdir|removedirs|truncate|link|symlink|chmod|chown)\s*\(|\bshutil\.(?:rmtree|move|copy|copy2|copyfile|copytree|chown)\s*\(`;
const PATHM_PY = String.raw`\.(?:unlink|write_text|write_bytes|rename|rmdir|touch|symlink_to|hardlink_to|chmod)\s*\(`;
const EXEC_PY = String.raw`\bos\.(?:system|popen|exec\w*|spawn\w*|startfile)\s*\(|\bsubprocess\.\w+\s*\(|(?<![.\w])(?:Popen|check_call|check_output|exec)\s*\(`;
const CMDLET_PS = String.raw`(?<![\w-])(?:Remove-Item|Set-Content|Out-File|Move-Item|New-Item|Add-Content|Clear-Content|Rename-Item|Copy-Item|Set-ItemProperty|Remove-ItemProperty|Set-Acl|Clear-Item)(?![\w-])`;
const NET_PS = String.raw`\[\s*(?:System\.)?IO\.(?:File|Directory)\s*\]\s*::\s*(?:Write\w*|Append\w*|Delete|Move|Copy|Create\w*|Replace|Open\w*|Set\w+)`;
const ALIAS_PS = String.raw`(?:^|[;|{(\n]|&&)[ \t]*(?:rm|ri|del|erase|rd|rmdir|mv|move|mi|ren|rni|cp|copy|cpi|ni|sc|ac|clc|tee|sp)[ \t]+(?=[^=\s])`;
const REDIRECT_PS = String.raw`(?<![>\-<\d])>{1,2}(?![>=&])[ \t]*(?=[\x01\w.$\\/])`;
const EXEC_PS = String.raw`(?<![\w-])(?:Start-Process|Invoke-Expression|iex|Invoke-Command|icm)(?![\w-])`;
const FS_OTHER = String.raw`\b(?:File\.(?:delete|unlink|write|rename|open|chmod|symlink|link|truncate)|FileUtils\.\w+|IO\.write|Dir\.(?:rmdir|delete|mkdir|unlink)|unlink|rename|rmdir|mkdir|file_put_contents|fopen|link|symlink|truncate|chmod|rm_rf|rm_r|remove_entry\w*)\b`;
const EXEC_OTHER = String.raw`\b(?:system|exec|spawn|popen|popen3|shell_exec|passthru|proc_open|qx)\b`;
const WRITE_MODE = /^[rwxabtU]*[wax+][rwxabtU+]*$/;
// The text of an argument list: balanced parentheses when the call has them, else the rest of the statement.
function argsFrom(code, at, paren, stop = /[\n;]/) {
  if (!paren) {let e = at; while (e < code.length && !stop.test(code[e]) && e - at < 400) e++; return code.slice(at, e);}
  let depth = 0, e = at;
  for (; e < code.length && e - at < 800; e++) {if (code[e] === '(') depth++; else if (code[e] === ')' && --depth === 0) break;}
  return code.slice(at + 1, e);
}
const markersOf = (args, literals) => [...args.matchAll(/\x01(\d+)\x02/g)].map(m => literals[m[1]]);
function topLevelArgs(args) {
  const out = []; let depth = 0, last = 0;
  for (let i = 0; i < args.length; i++) {
    if ('([{'.includes(args[i])) depth++; else if (')]}'.includes(args[i])) depth--;
    else if (args[i] === ',' && depth === 0) {out.push(args.slice(last, i)); last = i + 1;}
  }
  out.push(args.slice(last)); return out;
}
// A path expression made only of literals (join('docs', 'x'), 'a' + 'b', Path('a') / 'b'); null when a variable is part of it.
function literalPath(arg, literals) {
  const rest = arg.replace(/\b(?:path\.|os\.path\.|posixpath\.|ntpath\.|pathlib\.)?(?:join|resolve|normalize|Path|PurePath|PosixPath|WindowsPath)\b/g, '').replace(/[\s,()+\/]/g, '');
  if (!/^(?:\x01\d+\x02)+$/.test(rest)) return null;
  const parts = markersOf(arg, literals);
  if (parts.some(p => p.includes('\x03'))) return null;
  return parts.join(arg.includes('+') ? '' : '/');
}
const NOT_A_PATH = /^(?:utf-?8|ascii|binary|latin1|base64|hex|ucs2|utf16le|[rwxab][+bt]?|-.*)$|\s/i;
const looksLikePath = p => !!p && !NOT_A_PATH.test(p);
// The tokens of a command-line text, for the protected-name test (a literal "rm -rf docs" holds the token docs).
const tokensOf = s => s.split(/[\s'"=,;()<>|&]+/).filter(Boolean);
const SCRATCH = /(?:^|\/)\.eidolon\/scratch(?:\/|$)/;
// The protected kinds a name or parent literal belongs to.
function protectedKindsOf(token) {
  const t = token.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  const kinds = new Set();
  if (/(?:^|\/)\.git(?:\/|$)/i.test(t) || /(?:^|\/)\.eidolon(?:\/|$)/i.test(t) && !SCRATCH.test(t) || /policy-manifest\.json$/i.test(t)
    || /(?:^|\/)\.claude(?:\/(?:settings(?:\.local)?\.json|eidolon-manifest\.yaml|skills\/eidolon(?:\/|$)))?$/i.test(t)) kinds.add('authority');
  if (/^hooks(?:\/|$)/i.test(t) || /^references\/(?:persona-template|security-policy)\.md$/i.test(t) || (isAbsolute(t) && /\/hooks\/[^/]*\.(?:mjs|cjs|ps1|sh|py)$/i.test(t))) kinds.add('hooks');
  if (/^docs(?:\/(?:fixes|insights|decisions)(?:\/|$))?$/i.test(t) || /(?:^|\/)DECISIONS?\.md$/i.test(t) || /(?:^|\/)docs\/(?:fixes|insights|decisions)(?:\/|$)/i.test(t)) kinds.add('record');
  return kinds;
}
const markerIds = s => [...s.matchAll(/\x01(\d+)\x02/g)].map(m => Number(m[1]));
// Statement text after a PowerShell cmdlet name, as words; markers become their literal text and each word keeps the ids of its literals.
function psWords(args, literals) {
  return args.split(/[\s,()]+/).filter(Boolean).map(x => ({value: x.replace(/\x01(\d+)\x02/g, (m, n) => literals[n]), ids: markerIds(x)}));
}
// Several guards in one hook process read the same script, so a scan is kept for the life of the process.
const scans = new Map();
function scanCode(text, kind) {
  const key = kind + '\x00' + text;
  if (!scans.has(key)) {if (scans.size > 32) scans.clear(); scans.set(key, scanOnce(text, kind));}
  return scans.get(key);
}
function scanOnce(text, kind) {
  const {code, literals} = lex(text, kind), calls = [];
  const stop = kind === 'ps' ? /[\n;|]/ : /[\n;]/;
  const add = (source, exec, paren = true) => {
    for (const m of code.matchAll(new RegExp(source, kind === 'ps' ? 'gi' : 'g'))) {
      const hasParen = paren && m[0].endsWith('(');
      calls.push({name: m[0].trim(), exec, at: m.index, args: argsFrom(code, m.index + m[0].length - (hasParen ? 1 : 0), hasParen, stop)});
    }
  };
  if (kind === 'js') {
    add(FS_JS, false); add(FSQ_JS, false); add(DENO_JS, false); add(EXEC_JS, true);
    if (literals.some(l => /^(?:node:)?fs(?:\/promises)?$/.test(l))) add(FSBARE_JS, false);
  } else if (kind === 'py') {
    add(FS_PY, false); add(EXEC_PY, true);
    for (const m of code.matchAll(new RegExp(PATHM_PY, 'g'))) {
      let s = m.index; while (s > 0 && !/[\n;]/.test(code[s - 1])) s--;
      calls.push({name: m[0].trim(), exec: false, at: m.index, receiver: code.slice(s, m.index), args: argsFrom(code, m.index + m[0].length - 1, true), method: true});
    }
    for (const m of code.matchAll(/(?<![.\w])(?:io\.|codecs\.)?open\s*\(/g)) {
      const args = argsFrom(code, m.index + m[0].length - 1, true), modes = markersOf(args, literals).slice(1);
      if (modes.some(x => WRITE_MODE.test(x))) calls.push({name: 'open', exec: false, at: m.index, args});
    }
    for (const m of code.matchAll(/\bos\.open\s*\(/g)) {
      const args = argsFrom(code, m.index + m[0].length - 1, true);
      if (/\bO_(?:WRONLY|RDWR|CREAT|TRUNC|APPEND)\b/.test(args)) calls.push({name: 'os.open', exec: false, at: m.index, args});
    }
  } else if (kind === 'ps') {
    add(CMDLET_PS, false, false); add(NET_PS, false, false); add(ALIAS_PS, false, false); add(REDIRECT_PS, false, false); add(EXEC_PS, true, false);
  } else {
    add(FS_OTHER, false, false); add(EXEC_OTHER, true, false);
    for (const m of code.matchAll(/\bopen\s*\(?[^;\n]*/g)) if (markersOf(m[0], literals).some(x => /^\s*(?:\+?<|>>?|\+>)/.test(x))) calls.push({name: 'open', exec: false, at: m.index, args: m[0]});
  }
  return {code, literals, calls};
}
// How a file-changing call treats its path operands, read from its name: delete, move (the first operand goes, the second is
// written), copy (the first is only read) or write.
function callOp(name) {
  const base = (/[\w-]+(?=\s*\(?\s*$)/.exec(name)?.[0] ?? '').toLowerCase().replace(/sync$/, '');
  if (/^(?:rm|rmdir|unlink|remove|rimraf|emptydir|rmtree|removedirs|delete|remove-item|ri|del|erase|rd|rm_rf|rm_r|remove_entry\w*)$/.test(base)) return 'delete';
  if (/^(?:rename|renames|replace|move|move-item|rename-item|mv|mi|ren|rni)$/.test(base)) return 'move';
  if (/^(?:copy\w*|cp|cpi|copy-item)$/.test(base)) return 'copy';
  return 'write';
}
const PS_VALUE_FLAG = /^-(?:value|encoding|filter|include|exclude|itemtype|type|stream|attributes|width|inputobject)$/i;
const OPEN_MODE = /^\s*(?:\+?<|>>?|\+>)\s*/;
// The path operands of a file-changing call: {targets: [{value, ids, op}], loose}. A target is a literal path (ids are the literals it
// is made of; op is null for a copy source, which is only read); `loose` is true when an operand the call changes is not a literal.
function callTargets(call, literals, kind) {
  const op = callOp(call.name), targets = []; let loose = false;
  const role = k => op === 'move' ? (k ? 'write' : 'delete') : op === 'copy' ? (k ? 'write' : null) : op;
  const take = (k, value, ids, counts = true) => {
    if (value === null || (kind === 'other' && /\$|#\{/.test(value))) {if (counts && role(k)) loose = true;}
    else if (looksLikePath(value)) targets.push({value, ids, op: role(k)});
  };
  if (kind === 'ps') {
    const words = psWords(call.args, literals).filter((x, k, all) => !x.value.startsWith('-') && !PS_VALUE_FLAG.test(all[k - 1]?.value ?? '') && x.value !== '|');
    if (!words.length) loose = true;
    words.forEach((x, k) => take(k, x.value.includes('$') ? null : x.value, x.ids));
  } else if (call.method) {
    const receiver = call.receiver.replace(/^[\w.\s,]*=(?!=)/, '').replace(/^\s*(?:await|return)\s+/, '');
    take(0, literalPath(receiver, literals), markerIds(receiver));
    if (/rename|symlink_to|hardlink_to/.test(call.name)) {const a = topLevelArgs(call.args)[0] ?? ''; take(1, literalPath(a, literals), markerIds(a));}
  } else if (kind === 'other' && call.name === 'open') {
    // open(FH, '>', 'file') or open(FH, '>file'): the path is the mode literal's tail or the literal after it.
    const ids = markerIds(call.args), at = ids.findIndex(n => OPEN_MODE.test(literals[n])), tail = at < 0 ? '' : literals[ids[at]].replace(OPEN_MODE, '');
    if (tail) take(0, tail, [ids[at]]); else if (at >= 0 && ids[at + 1] !== undefined) take(0, literals[ids[at + 1]], [ids[at + 1]]); else loose = true;
  } else {
    const parts = topLevelArgs(call.args), many = /rename|copy|cp\b|link|move|replace|copytree/i.test(call.name), first = many ? 2 : 1;
    // ruby, perl and php take a list of operands (unlink 'a', 'b'); only the first one or two decide whether the call is loose.
    (kind === 'other' ? parts : parts.slice(0, first)).forEach((a, k) => take(k, literalPath(a, literals), markerIds(a), k < first));
  }
  return {targets, loose};
}
// Steps for code: the command lines its exec calls spell (judged as shell commands) and the facts of the scan itself.
// `inline` marks an interpreter's inline body, where a mutation with no literal target for a worker means "use the Write tool".
function scanSteps(text, kind, current, ctx, inline) {
  let scan; try {scan = scanCode(text, kind);} catch (e) {return [];}
  const {code, literals, calls} = scan, out = [], language = kind === 'ps' ? 'powershell' : 'bash', root = ctx.root ?? current;
  const fileCalls = calls.filter(c => !c.exec), execCalls = calls.filter(c => c.exec);
  // PowerShell runs git as a bare statement; the same parse as a shell line covers it.
  const commands = execCalls.map(c => markersOf(c.args, literals).map(l => l.replace(/\x03/g, '$__v')).join(' '));
  if (kind === 'ps') for (const m of text.matchAll(/(?:^|[\s;&|(])(git(?:\.exe)?[ \t]+[^\n;|]*)/gi)) commands.push(m[1]);
  if (!fileCalls.length && !commands.length) return [];
  for (const command of commands) {
    if (!command.trim()) continue;
    try {out.push(...steps(command, current, language, ctx).map(s => ({...s, inner: true, fragment: true})));} catch (e) {if (!(e instanceof ShellParseError)) throw e;}
  }
  // Each literal target is judged where it points, as the shell path judges an operand: a delete reaches the protected paths under
  // its target, a write only the target itself.
  const facts = [], used = new Set(), named = new Set(); let loose = false, looseDelete = false, bare = false;
  for (const call of fileCalls) {
    const {targets, loose: unplaced} = callTargets(call, literals, kind);
    if (unplaced) {loose = bare = true; if (callOp(call.name) !== 'write') looseDelete = true;}
    for (const {value, ids, op} of targets) {
      ids.forEach(n => used.add(n)); named.add(value);
      if (!op) continue;
      const path = resolve(current, value.replace(/\\/g, '/')), kindOf = protectedKind(value, current, root, op);
      if (kindOf) facts.push({kind: kindOf, op, verb: 'script', mutation: true, value, opaque: false, path});
      facts.push({kind: 'path', op, verb: 'script', mutation: true, value, opaque: false, path, allOnly: true});
    }
  }
  // An exec call spelled only in literals was judged as the command line it spells; one with a variable in it by its own literals.
  const execKinds = new Map();
  for (const c of execCalls) {
    markerIds(c.args).forEach(n => used.add(n));
    if (c.args.replace(/\x01\d+\x02|[\s,\[\]()+]/g, '')) for (const l of markersOf(c.args, literals)) for (const t of tokensOf(l)) for (const k of protectedKindsOf(t)) if (!execKinds.has(k)) execKinds.set(k, t);
  }
  for (const [k, value] of execKinds) facts.push({kind: k, op: 'write', verb: 'script', mutation: true, value, opaque: false, path: resolve(current, value.replace(/\\/g, '/'))});
  // ponytail: when a file call's target is not a literal, a protected name the scan did not tie to a literal target asks; a parent (docs,
  // .claude, .eidolon) counts only when that call deletes or moves. A variable-held path is asked about, not blocked. Upgrade path: a sandbox.
  if (loose) {
    const left = new Set(), parentOnly = t => /^(?:docs|\.claude|\.eidolon)$/i.test(t.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, ''));
    literals.forEach((l, n) => {if (!used.has(n)) tokensOf(l).forEach(x => left.add(x));});
    if (kind === 'ps') code.replace(/\x01\d+\x02/g, ' ').split(/[\s,;|(){}\[\]=]+/).filter(x => x && !named.has(x)).forEach(x => left.add(x));
    const token = [...left].find(x => protectedKindsOf(x).size && (looseDelete || !parentOnly(x)));
    if (token !== undefined) facts.push({kind: 'opaque', op: null, verb: 'script', mutation: true, value: token, opaque: false, reason: `a script names ${token} in a way the parser cannot resolve`});
  }
  if (inline && bare) facts.push({kind: 'bare', op: 'write', verb: 'script', mutation: true, value: '', opaque: false, allOnly: true, reason: 'an inline body changes a file whose path is not a literal in the command'});
  if (facts.length) out.push(factStep(current, facts));
  return out;
}

// ---- Script files and inline interpreter bodies.
const SHELL_NAME = /^(?:bash|sh|zsh|dash|ksh)$/;
const NODE_NAME = /^(?:node|nodejs|bun|tsx|ts-node)$/;
const PY_NAME = /^(?:python[\d.]*|py|pypy[\d.]*)$/;
const PS_NAME = /^(?:pwsh|powershell)$/;
const OTHER_NAME = /^(?:ruby|perl|php)$/;
const SCRIPT_EXT = {sh: /\.(?:sh|bash|zsh|ksh)$/i, js: /\.(?:js|mjs|cjs|ts|mts|cts|jsx|tsx)$/i, py: /\.pyw?$/i, ps: /\.ps1$/i, other: /\.(?:rb|pl|php)$/i};
const interpKind = name => NODE_NAME.test(name) || name === 'deno' ? 'js' : PY_NAME.test(name) ? 'py' : OTHER_NAME.test(name) ? 'other' : PS_NAME.test(name) ? 'ps' : SHELL_NAME.test(name) ? 'sh' : null;
// The first operand that is not a flag, past flags that take a value; undefined when a stop flag (inline body, module, stdin) comes first.
function operandOf(a, valued, stop) {
  for (let k = 0; k < a.length; k++) {
    const x = a[k];
    if (x === '--') return a[k + 1];
    if (x.startsWith('-') && x.length > 1) {
      if (stop.test(x)) return undefined;
      if (valued.test(x) && !x.includes('=')) k++;
      continue;
    }
    return x;
  }
  return undefined;
}
const NEVER = /(?!)/;
// The body an interpreter is handed on its command line: node -e/--eval/-p, deno eval, python -c, ruby/perl -e, php -r, pwsh -Command.
function interpreterBody(w) {
  const name = exeName(w[0] ?? ''), a = w.slice(1), kind = interpKind(name);
  if (!kind || kind === 'sh') return null;
  if (name === 'deno') {const body = a[0] === 'eval' ? a.slice(1).find(x => !x.startsWith('-')) : undefined; return body ? {text: body, kind} : null;}
  if (kind === 'ps') {const b = bodyOf(w); return b ? {text: b.text, kind} : null;}
  const bodies = []; let m;
  for (let k = 0; k < a.length; k++) {
    const x = a[k];
    if (kind === 'js') {
      if (/^(?:-e|-p|-pe|-ep|--eval|--print)$/.test(x) && a[k + 1] !== undefined) bodies.push(a[++k]);
      else if ((m = /^(?:-e|-p|--eval|--print)=(.*)$/s.exec(x))) bodies.push(m[1]);
      else if (/^(?:-r|--require|--import|--loader|--experimental-loader)$/.test(x)) k++;
      else if (!x.startsWith('-')) break;
    } else if (kind === 'py') {
      if (/^-[a-zA-Z]*c$/.test(x) && a[k + 1] !== undefined) {bodies.push(a[++k]); break;}
      else if (/^-[WXQ]$/.test(x)) k++;
      else if (!x.startsWith('-')) break;
    } else if (/^-[a-zA-Z]*[eEr]$/.test(x) && a[k + 1] !== undefined) bodies.push(a[++k]);
  }
  return bodies.length ? {text: bodies.join('\n'), kind} : null;
}
// A PowerShell -EncodedCommand value (the -e, -ec, -en... spellings), or undefined when the command has none.
function encodedValue(args) {
  for (let k = 0; k < args.length; k++) {
    const m = /^-e(?:c|n[a-z]*)?(?:[:=](.+))?$/i.exec(args[k]);
    if (m) return m[1] ?? args[k + 1];
  }
  return undefined;
}
// Base64 of UTF-16LE text, or null when the value is not that.
function decodeEncoded(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+\/]+={0,2}$/.test(value) || value.length % 4 === 1) return null;
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length % 2) return null;
  const text = bytes.toString('utf16le');
  return /[\x00-\x08\x0e-\x1f\uFFFD]/.test(text) ? null : text;
}
const within = (path, root) => {const r = relative(canonicalPath(resolve(root)), path); return r === '' || (r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r));};
// A script file the command runs: {file, hint} for one under the project root, {outside} for one elsewhere, {npm: name} for an npm script, else null.
function scriptTarget(w, language, current, root) {
  const name = exeName(w[0] ?? ''), a = w.slice(1);
  if (/^(?:npm|pnpm|yarn)$/.test(name)) {
    let k = 0; while (a[k]?.startsWith('-')) k += /^(?:--prefix|--workspace|--cwd|-w)$/.test(a[k]) ? 2 : 1;
    const sub = a[k]; let script;
    if (/^(?:run|run-script|rum|urn)$/.test(sub ?? '') || (name === 'yarn' && sub === 'run')) {let j = k + 1; while (a[j]?.startsWith('-')) j++; script = a[j];}
    else if (/^(?:test|t|tst)$/.test(sub ?? '')) script = 'test';
    else if (/^(?:start|stop|restart)$/.test(sub ?? '')) script = sub;
    else if (name !== 'npm' && sub && !sub.startsWith('-')) script = sub;
    return script ? {npm: script} : null;
  }
  let operand, hint = null;
  const kind = interpKind(name);
  if (kind === 'sh') {hint = 'sh'; operand = operandOf(a, /^(?:-o|-O|--rcfile|--init-file)$/, /^-(?:[a-zA-Z]*c[a-zA-Z]*|s)$/);}
  else if (name === 'source' || (w[0] === '.' && w.length > 1)) {hint = language === 'powershell' ? 'ps' : 'sh'; operand = a[0];}
  else if (name === 'deno') {if (a[0] !== 'run') return null; hint = 'js'; operand = operandOf(a.slice(1), /^(?:--import-map|--config|-c|--cert|--lock)$/, /^--(?:eval|help|version)$/);}
  else if (kind === 'js') {
    hint = 'js'; const rest = name === 'bun' && a[0] === 'run' ? a.slice(1) : a;
    if (name === 'bun' && /^(?:test|install|add|remove|x|pm|create|init|upgrade|build|i)$/.test(rest[0] ?? '')) return null;
    operand = operandOf(rest, /^(?:-r|--require|--import|--loader|--experimental-loader|--env-file|--conditions|-C|--input-type|--title|--stack-size)$/, /^(?:-e|-p|-pe|-ep|--eval|--print|--test|--check|-c|-i|--interactive|-v|--version|-h|--help)(?:=.*)?$/);
  }
  else if (kind === 'py') {hint = 'py'; operand = operandOf(a, /^-[WXQ]$/, /^-(?:[a-zA-Z]*[cm]|V|-version|-help)$/);}
  else if (kind === 'ps') {
    hint = 'ps';
    const f = a.findIndex(x => /^-f(?:ile)?$/i.test(x));
    if (f >= 0) operand = a[f + 1];
    else {operand = operandOf(a, /^-(?:ep|executionpolicy|windowstyle|workingdirectory|wd|configurationname|custompipename|inputformat|outputformat|settingsfile|version)$/i, /^-(?:c|com\w*|e|ec|en\w*|encodedcommand|command)$/i); if (operand && !/\.ps1$/i.test(operand)) operand = undefined;}
  }
  else if (kind === 'other') {hint = 'other'; operand = operandOf(a, /^-[IrMm]$/, /^-[a-zA-Z]*[eEr]$/);}
  else if (/[\/\\]/.test(w[0] ?? '') && !/^-/.test(w[0])) {operand = w[0]; hint = 'direct';}
  else return null;
  if (!operand || operand === '-' || META.test(operand) || /[\x00-\x1f]/.test(operand)) return null;
  const abs = canonicalPath(resolve(current, operand.replace(/\\/g, '/')));
  let stat; try {stat = statSync(abs);} catch {return null;}
  if (!stat.isFile()) return null;
  const inside = within(abs, root);
  if (hint === 'direct') {
    // A program under the root counts as a script only when its name or first bytes say so; any other binary is not read.
    const says = Object.values(SCRIPT_EXT).some(re => re.test(abs)) || shebangOf(abs) !== null;
    if (!says) return null;
    hint = null;
  }
  return inside ? {file: abs, hint} : {outside: abs};
}
function shebangOf(file) {
  let fd; try {
    fd = openSync(file, 'r'); const buf = Buffer.alloc(256), n = readSync(fd, buf, 0, 256, 0);
    const m = /^#!\s*(\S+)(?:[ \t]+(\S+))?/.exec(buf.toString('utf8', 0, n));
    return m ? (exeName(m[1]) === 'env' ? exeName(m[2] ?? '') : exeName(m[1])) : null;
  } catch {return null;} finally {if (fd !== undefined) try {closeSync(fd);} catch {/* ignore */}}
}
function readScript(file) {
  const stat = statSync(file);
  if (stat.size > SCRIPT_LIMIT) throw Error('script too large');
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8192).includes(0)) throw Error('not text');
  return bytes.toString('utf8').replace(/^\uFEFF/, '');
}
function scriptKind(file, text) {
  const prog = shebangOf(file);
  if (prog) return interpKind(prog) ?? 'sh';
  for (const [kind, re] of Object.entries(SCRIPT_EXT)) if (re.test(file)) return kind;
  return 'sh';
}
function packageScripts(current, root, name) {
  for (let d = current; ; d = dirname(d)) {
    const file = join(d, 'package.json');
    if (existsSync(file)) {
      try {
        const scripts = JSON.parse(readScript(file)).scripts;
        if (scripts && typeof scripts === 'object') return {dir: d, list: ['pre' + name, name, 'post' + name].map(n => scripts[n]).filter(s => typeof s === 'string')};
      } catch {return {dir: d, list: [], unreadable: true};}
      return {dir: d, list: []};
    }
    if (dirname(d) === d || !within(dirname(d), root)) return null;
  }
}
function scriptSteps(target, current, pending, ctx) {
  if (target.outside) return [factStep(current, [{kind: 'outside-script', op: null, verb: '', mutation: false, value: target.outside, opaque: false, path: target.outside}])];
  if (target.npm) {
    const found = packageScripts(current, ctx.root, target.npm);
    if (!found) return [];
    if (found.unreadable) return [opaqueStep(current, 'package.json cannot be read, so the npm script it names cannot be judged')];
    const out = [];
    for (const body of found.list) {
      try {out.push(...steps(body, found.dir, 'bash', ctx).map(s => ({...s, pending: s.pending || pending, inner: true})));}
      catch (e) {if (e instanceof ShellParseError) out.push(opaqueStep(current, 'an npm script the parser cannot read')); else throw e;}
    }
    return out;
  }
  let text;
  try {text = readScript(target.file);} catch {return [opaqueStep(current, `the script ${basename(target.file)} cannot be read as text or is larger than 512 KB, so no guard can inspect it`)];}
  const kind = target.hint ?? scriptKind(target.file, text);
  if (kind === 'sh') {
    try {return steps(text, current, 'bash', ctx).map(s => ({...s, pending: s.pending || pending, inner: true}));}
    catch (e) {if (e instanceof ShellParseError) return [opaqueStep(current, `the shell script ${basename(target.file)} cannot be parsed`)]; throw e;}
  }
  return scanSteps(text, kind, current, ctx, false);
}
// A heredoc fed to a shell or an interpreter is its program.
function heredocSteps(w, text, current, pending, ctx) {
  const name = exeName(w[0] ?? ''), kind = interpKind(name);
  if (!kind) return [];
  if (kind === 'sh') {
    if (w.slice(1).some(x => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(x)) || operandOf(w.slice(1), /^(?:-o|-O|--rcfile|--init-file)$/, /^-(?:[a-zA-Z]*c[a-zA-Z]*|s)$/)) return [];
    return bodySteps({text, language: 'bash'}, current, pending, ctx);
  }
  if (kind === 'ps' || w.slice(1).some(x => /^-[a-zA-Z]*[ecp]$|^--(?:eval|print)/.test(x))) return [];
  return scanSteps(text, kind, current, ctx, true);
}

// Walk the commands in order, following `cd`, `export` and simple `name=value` assignments, so every
// later word is judged where it really points. Each step is one command to judge. A subshell, a $( ) or a backtick body
// gives its `cd` and variables back when it closes. `ctx.depth` bounds how many bodies and scripts are followed.
function steps(source, cwd, language, ctx = {}) {
  const depth = ctx.depth ?? 0, root = ctx.root ?? resolve(cwd), ps = language === 'powershell', sub = {root, depth: depth + 1};
  const out = [], vars = {}, exported = [], stack = []; let current = resolve(cwd), pending = '';
  const key = x => ps ? x.toLowerCase() : x;
  const remember = x => {vars[x.slice(0, x.indexOf('='))] = x.slice(x.indexOf('=') + 1);};
  for (const segment of shellCommands(source, language)) {
    if (segment.marker === 'call') {out.push(opaqueStep(current, 'a call-operator target the parser cannot resolve')); continue;}
    if (segment.marker === 'open') {stack.push({current, pending, vars: {...vars}, exported: [...exported]}); continue;}
    if (segment.marker === 'close') {
      const saved = stack.pop();
      if (saved) {({current, pending} = saved); for (const k of Object.keys(vars)) delete vars[k]; Object.assign(vars, saved.vars); exported.length = 0; exported.push(...saved.exported);}
      continue;
    }
    const words = expandWrapperStrings(segment.words).map(x => x.replace(/\$(?:\{(\w+)\}|(\w+))/g, (m, a, b) => vars[key(a ?? b)] ?? m));
    if (ps) {
      // $name = 'literal' (spaced or glued): remember a literal value, forget anything else.
      const spaced = /^\$(\w+)$/.exec(segment.words[0] ?? '') && segment.words[1] === '=' && segment.words.length === 3 ? [/^\$(\w+)$/.exec(segment.words[0])[1], words[2]] : null;
      const glued = !spaced && segment.words.length === 1 ? /^\$(\w+)=(.*)$/s.exec(segment.words[0]) : null;
      const assign = spaced ?? (glued && [glued[1], glued[2]]);
      if (assign) {if (/[$`(]/.test(assign[1])) delete vars[key(assign[0])]; else vars[key(assign[0])] = assign[1]; continue;}
    }
    const at = executable(words), prefix = words.slice(0, at); let w = words.slice(at);
    if (!w.length) {prefix.filter(x => ASSIGNMENT.test(x)).forEach(remember); continue;}
    const declare = /^(?:declare|typeset)$/.test(w[0]);
    if (/^export$/i.test(w[0]) || declare) {
      const exporting = !declare || w.slice(1).some(f => /^-[a-zA-Z]*x/.test(f));
      for (const x of w.slice(1).filter(x => ASSIGNMENT.test(x))) {if (exporting) exported.push(x); remember(x);}
      continue;
    }
    if (CD.test(w[0]) && firstOperand(w)) {({current, pending} = changeDirectory(current, pending, firstOperand(w))); continue;}
    if (ps) {
      // The call operator and dot-sourcing run the command a variable names: a literal one is substituted above, the rest asks.
      const raw = segment.words.slice(executable(segment.words)), dotted = raw[0] === '.' && /^\$/.test(raw[1] ?? '');
      if (segment.call || dotted) {
        const target = dotted ? w[1] : w[0];
        if (/^\$/.test(raw[dotted ? 1 : 0] ?? '') && /^\$/.test(target ?? '')) out.push(opaqueStep(current, 'a call-operator target held in a variable the parser cannot resolve'));
        else if (segment.call && /^[(@]/.test(raw[0] ?? '')) out.push(opaqueStep(current, 'a call-operator target the parser cannot resolve'));
        else if (dotted && target !== undefined) w = w.slice(1);
        if (/^\$/.test(raw[dotted ? 1 : 0] ?? '') && /\s/.test(w[0] ?? '')) {try {w = [...shellCommands(w[0], 'powershell').flatMap(c => c.words), ...w.slice(1)];} catch {/* keep the word */}}
      }
      if (/^(?:start-process|start|saps)$/i.test(w[0] ?? '')) {
        const program = w.slice(1).find((x, k, all) => !x.startsWith('-') && !/^-(?:argumentlist|workingdirectory|verb|windowstyle)$/i.test(all[k - 1] ?? ''));
        if (program !== undefined && /^\$/.test(program)) out.push(opaqueStep(current, 'a Start-Process target held in a variable the parser cannot resolve'));
      }
    }
    out.push({w, prefix, current, pending, depth, exported: [...exported], piped: segment.piped, opaque: segment.opaque, xargs: prefix.some(x => exeName(x) === 'xargs'), xargsFile: prefix.some(x => /^(?:-a.*|--arg-file(?:=.*)?)$/.test(x))});
    const body = bodyOf(w); if (body) out.push(...bodySteps(body, current, pending, sub));
    const name = exeName(w[0] ?? '');
    if (PS_NAME.test(name)) {
      const value = encodedValue(w.slice(1)), text = value === undefined ? null : decodeEncoded(value);
      if (text !== null && depth < 3) {
        try {out.push(...steps(text, current, 'powershell', sub).map(s => ({...s, pending: s.pending || pending, inner: true})), ...scanSteps(text, 'ps', current, sub, false));}
        catch (e) {if (e instanceof ShellParseError) out.push(opaqueStep(current, 'a decoded PowerShell command the parser cannot read')); else throw e;}
      }
    }
    const inline = interpreterBody(w); if (inline) out.push(...scanSteps(inline.text, inline.kind, current, sub, true));
    if (segment.heredocText !== undefined) out.push(...heredocSteps(w, segment.heredocText, current, pending, sub));
    if (depth < 2) {const script = scriptTarget(w, language, current, root); if (script) out.push(...scriptSteps(script, current, pending, sub));}
  }
  return out;
}
// A parsed git option or environment variable that points core.hooksPath somewhere else, or swaps the
// global or system config file that could set it.
export const overridesHooksPath = op =>
  op.config.some(c => /^core\.hookspath\b/i.test(c)) ||
  op.env.some(e => /^GIT_CONFIG_KEY_\d+=core\.hookspath$/i.test(e) || /^GIT_CONFIG_VALUE_\d+=.*hookspath/i.test(e) || /^GIT_CONFIG_PARAMETERS=.*core\.hookspath/i.test(e) || /^GIT_CONFIG_(?:GLOBAL|SYSTEM)=/i.test(e));
// GIT_DIR pointed anywhere but the project's own .git makes git read another repository's config and hooks.
export const overridesGitDir = (op, root) => op.env.filter(e => /^GIT_DIR=/.test(e)).some(e => {
  const value = e.slice(e.indexOf('=') + 1);
  if (!value || /[$`]/.test(value)) return true;
  return lc(canonicalPath(resolve(op.cwd, value.replace(/\\/g, '/')))) !== lc(canonicalPath(join(resolve(root), '.git')));
});
// Git aliases come from the repository's config and the user's config files (read directly, never through git). Git ignores an alias
// that names a built-in command, so those are skipped.
const GIT_BUILTIN = new Set(['add', 'am', 'apply', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'cat-file', 'checkout', 'checkout-index', 'cherry-pick', 'clean', 'clone', 'commit', 'config', 'describe', 'diff',
  'fetch', 'filter-branch', 'format-patch', 'gc', 'grep', 'help', 'init', 'log', 'ls-files', 'ls-tree', 'merge', 'merge-base', 'mv', 'notes', 'pull', 'push', 'range-diff', 'read-tree', 'rebase', 'reflog', 'remote',
  'reset', 'restore', 'rev-list', 'rev-parse', 'revert', 'rm', 'send-email', 'shortlog', 'show', 'sparse-checkout', 'stash', 'status', 'submodule', 'switch', 'symbolic-ref', 'tag', 'update-ref', 'version', 'worktree']);
function unquoteGit(raw) {
  let out = '', quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '\\' && i + 1 < raw.length) {const n = raw[++i]; out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'b' ? '\b' : n; continue;}
    if (c === '"') {quoted = !quoted; continue;}
    if (!quoted && (c === '#' || c === ';')) break;
    out += c;
  }
  return out.trim();
}
// `include` reads the aliases of a file an [include] or [includeIf] path names; they take effect where the include stands, as in git.
export function parseGitAliases(text, include = null) {
  const out = {}; let section = ''; const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line[0] === '#' || line[0] === ';') continue;
    const header = /^\[\s*([^\s\]"]+)(?:\s+"(?:[^"\\]|\\.)*")?\s*\](.*)$/.exec(line);
    if (header) {section = header[1].toLowerCase(); line = header[2].trim(); if (!line) continue;}
    if (section !== 'alias' && !(include && /^include(?:if)?$/.test(section))) continue;
    while (line.endsWith('\\') && i + 1 < lines.length) line = line.slice(0, -1) + lines[++i].trim();
    const kv = /^([A-Za-z][\w-]*)\s*=\s*(.*)$/.exec(line);
    if (!kv) continue;
    // ponytail: an includeIf is followed whatever its condition, so an alias it holds is judged even where git would not apply it.
    if (section === 'alias') out[kv[1].toLowerCase()] = unquoteGit(kv[2]);
    else if (kv[1].toLowerCase() === 'path') Object.assign(out, include(unquoteGit(kv[2])));
  }
  return out;
}
const gitHome = () => process.env.HOME || process.env.USERPROFILE || homedir();
// ponytail: one include level, as the alias expansion is one level. A relative path is read from the including file's directory, ~/ from home.
function readAliases(file, nested = false) {
  try {
    if (statSync(file).size > 1048576) return {};
    const included = path => readAliases(/^~[\/\\]/.test(path) ? join(gitHome(), path.slice(2)) : resolve(dirname(file), path), true);
    return parseGitAliases(readFileSync(file, 'utf8'), nested ? null : included);
  } catch {return {};}
}
// The repository config that applies to `directory`: the nearest .git directory (or the gitdir a .git file names, with its common dir).
function repoConfig(directory) {
  for (let d = directory; ; d = dirname(d)) {
    try {
      const dot = join(d, '.git'), stat = statSync(dot);
      let gitdir = stat.isDirectory() ? dot : /^gitdir:\s*(.+)$/m.exec(readFileSync(dot, 'utf8'))?.[1].trim();
      if (!gitdir) return null;
      gitdir = resolve(d, gitdir);
      try {gitdir = resolve(gitdir, readFileSync(join(gitdir, 'commondir'), 'utf8').trim());} catch {/* not a linked worktree */}
      return join(gitdir, 'config');
    } catch {/* keep climbing */}
    if (dirname(d) === d) return null;
  }
}
// The remote and merge keys of [branch "name"] in the repository config, or null.
export function branchTracking(directory, branch) {
  const file = repoConfig(directory); if (!file) return null;
  let text; try {text = readFileSync(file, 'utf8');} catch {return null;}
  let inBranch = false; const out = {};
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim(), header = /^\[\s*([^\s\]"]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(line);
    if (header) {inBranch = header[1].toLowerCase() === 'branch' && header[2] === branch; continue;}
    const kv = inBranch && /^(remote|merge)\s*=\s*(.*)$/i.exec(line);
    if (kv) out[kv[1].toLowerCase()] = unquoteGit(kv[2]);
  }
  return out.remote && out.merge ? out : null;
}
function configAlias(directory, name) {
  const home = gitHome(), xdg = process.env.XDG_CONFIG_HOME || join(home, '.config');
  let found;
  for (const file of [join(xdg, 'git', 'config'), join(home, '.gitconfig'), repoConfig(directory)]) {
    if (!file) continue;
    const aliases = readAliases(file); if (Object.hasOwn(aliases, name.toLowerCase())) found = aliases[name.toLowerCase()];
  }
  return found;
}
const GIT_FLAG = /^(?:-p|-P|--paginate|--no-pager|--exec-path(?:=.*)?|--html-path|--man-path|--info-path|--bare|--no-replace-objects|--literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--no-optional-locks|--no-lazy-fetch|--git-dir=.*|--work-tree=.*|--namespace=.*|--super-prefix=.*)$/;
const GIT_VALUE = /^(?:--git-dir|--work-tree|--namespace|--super-prefix)$/;
// Skip git's global options. `i` is the index of the subcommand, which still starts with `-` when the
// option is one this list does not know.
function gitInvocation(w, directory) {
  const config = []; let i = 1;
  for (; i < w.length; i++) {
    const v = w[i];
    if (v === '-C') {if (!w[i + 1]) throw new ShellParseError('Missing Git directory'); directory = resolve(directory, w[++i]);}
    else if (v === '-c' || v === '--config-env') {if (!w[++i]) throw new ShellParseError('Missing Git option'); config.push(w[i]);}
    else if (GIT_VALUE.test(v)) {if (!w[++i]) throw new ShellParseError('Missing Git option');}
    else if (/^-C.+/.test(v)) directory = resolve(directory, v.slice(2));
    else if (v.startsWith('--config-env=')) config.push(v.slice(13));
    else if (/^-c.+/.test(v)) config.push(v.slice(2));
    else if (GIT_FLAG.test(v)) continue;
    else break;
  }
  return {i, directory, config};
}
// The git subcommand a command line reaches, with its aliases resolved: `git -c alias.x=...` first, then the config files.
// ponytail: one alias level. A plain alias is expanded in place; a shell alias (!...) is returned as {name, body, fromConfig}.
// GIT_CONFIG_COUNT with GIT_CONFIG_KEY_n and GIT_CONFIG_VALUE_n, and GIT_CONFIG_PARAMETERS, set config for the git they reach, as -c does.
function envConfig(env) {
  const value = key => env.findLast(e => e.startsWith(key + '='))?.slice(key.length + 1), out = [];
  for (const e of env) {
    const m = /^GIT_CONFIG_KEY_(\d+)=(.*)$/s.exec(e), v = m && value('GIT_CONFIG_VALUE_' + m[1]);
    if (m && v !== undefined) out.push(m[2] + '=' + v);
    if (e.startsWith('GIT_CONFIG_PARAMETERS=')) for (const p of e.matchAll(/'([^']*)'(?:='([^']*)')?/g)) out.push(p[2] === undefined ? p[1] : p[1] + '=' + p[2]);
  }
  return out;
}
function resolveGit(w, directory, env = []) {
  const inv = gitInvocation(w, directory);
  inv.config.push(...envConfig(env));
  if (inv.i >= w.length) return {inv, sub: undefined, rest: []};
  let sub = w[inv.i], rest = w.slice(inv.i + 1), shell = null;
  const named = inv.config.map(c => /^alias\.([^=]+)=([^]*)$/i.exec(c)).find(m => m && m[1].toLowerCase() === sub.toLowerCase());
  let value = named?.[2], fromConfig = false;
  if (value === undefined && !sub.startsWith('-') && !GIT_BUILTIN.has(sub.toLowerCase())) {value = configAlias(inv.directory, sub); fromConfig = value !== undefined;}
  if (value !== undefined) {
    if (value.startsWith('!')) shell = {name: sub, body: value.slice(1), fromConfig};
    else {
      const expansion = shellCommands(value, 'bash').find(c => c.words.length)?.words ?? [];
      if (expansion.length) {sub = expansion[0]; rest = [...expansion.slice(1), ...rest];}
    }
  }
  return {inv, sub, rest, shell};
}
export function gitOperations(source, cwd = process.cwd(), language = 'bash', root = undefined) {
  const result = [];
  for (const step of steps(source, cwd, language, root ? {root: resolve(root)} : {})) {
    const w = step.w;
    if (!/^(?:git|git\.exe)$/i.test(basename(w[0] || '').replace(/\\/g, '/'))) continue;
    const env = [...step.exported, ...step.prefix.filter(x => ASSIGNMENT.test(x))];
    // A command line a scan assembled from literals is a fragment: one git cannot parse is skipped, not an error.
    let resolved; try {resolved = resolveGit(w, step.current, env);} catch (e) {if (step.fragment && e instanceof ShellParseError) continue; throw e;}
    const {inv: {directory, config}, sub, rest, shell} = resolved;
    if (sub === undefined) continue;
    // A shell alias given with -c is parsed here; one from a config file is an opaque fact in shellPathFacts.
    if (shell) {if (!shell.fromConfig) result.push(...gitOperations(shell.body, directory, 'bash', root)); continue;}
    const subcommand = sub;
    const args = rest, flags = [], messages = []; let messageFile, m;
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (subcommand === 'commit' && a === '--message') {if (args[k + 1] !== undefined) messages.push(args[++k]);}
      else if (subcommand === 'commit' && (m = /^-([a-zA-Z]*?)m(.*)$/.exec(a))) {
        if (m[1]) flags.push('-' + m[1]);
        if (m[2]) messages.push(m[2]); else if (args[k + 1] !== undefined) messages.push(args[++k]);
      }
      else if (subcommand === 'commit' && a.startsWith('--message=')) messages.push(a.slice(10));
      else if (subcommand === 'commit' && (a === '-F' || a === '--file')) messageFile = args[++k];
      else if (subcommand === 'commit' && a.startsWith('--file=')) messageFile = a.slice(7);
      else flags.push(a);
    }
    result.push({subcommand, args, flags, messages, messageFile, env, config, cwd: directory, opaque: step.opaque});
  }
  return result;
}
// An operand as the file system sees it: PowerShell parameter prefixes removed, an MSYS /c/ drive spelled
// as C:/, and an NTFS alternate data stream (name:stream) reduced to the file it belongs to.
export function cleanOperand(value) {
  if (typeof value !== 'string') return null;
  let v = value.replace(/^--?(?:path|literalpath|filepath|file|source|destination|target|target-directory)[:=]/i, '');
  if (!v || v.includes('\0') || v.startsWith('-')) return null;
  if (process.platform === 'win32') {
    v = v.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
    const drive = /^[a-zA-Z]:/.exec(v)?.[0] ?? '';
    v = drive + v.slice(drive.length).replace(/:.*$/s, '');
  }
  return v || null;
}
export function resolvedOperand(value, cwd) {
  const v = cleanOperand(value); if (!v) return null;
  return canonicalPath(resolve(cwd, v.replace(/\\/g, '/')));
}
// Protected locations relative to the project root, by kind. An ancestor of one of these is protected
// for a delete or move: removing `docs` removes the records under it.
const LOCATIONS = [
  ['.git', 'authority'], ['.claude/settings.json', 'authority'], ['.claude/settings.local.json', 'authority'], ['.claude/eidolon-manifest.yaml', 'authority'],
  ['.eidolon/policy-manifest.json', 'authority'], ['.eidolon/sessions', 'authority'], ['.claude/skills/eidolon', 'authority'],
  ['hooks', 'hooks'], ['references/persona-template.md', 'hooks'], ['references/security-policy.md', 'hooks'],
  ['docs/fixes', 'record'], ['docs/insights', 'record'], ['docs/decisions', 'record'], ['DECISIONS.md', 'record'], ['DECISION.md', 'record'],
];
const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
const lc = p => process.platform === 'win32' ? p.toLowerCase() : p;
const withSep = p => p.endsWith(sep) ? p : p + sep;
const containsProtected = (dir, root) => LOCATIONS.find(([loc]) => lc(resolve(root, loc)).startsWith(lc(withSep(resolve(dir)))))?.[1] ?? null;
// Could text that starts with `lit` and then varies reach a protected location? A literal ending in a
// separator (or nothing) is a whole directory prefix; otherwise its last segment is partial.
const couldReach = (lit, dir, root) => {
  if (lit.startsWith('$')) return true;
  const abs = resolve(dir, lit);
  return LOCATIONS.some(([loc]) => lc(resolve(root, loc)).startsWith(lc(lit === '' || /\/$/.test(lit) ? withSep(abs) : abs)));
};
// `parents` asks for the containment test on a write too (the roots of a find -exec that writes).
export function protectedKind(value, cwd = process.cwd(), root = cwd, op = null, parents = false) {
  const absolute = resolvedOperand(value, cwd); if (!absolute) return null;
  const rootAbs = canonicalPath(resolve(root));
  const rel = relative(rootAbs, absolute).replace(/\\/g, '/');
  const lexical = posix.normalize(cleanOperand(value).replace(/\\/g, '/'));
  if (/(?:^|\/)hooks\/[^\s]*\.(?:mjs|cjs|ps1|sh|py)$/i.test(absolute.replace(/\\/g,'/'))) return 'hooks';
  // A Claude Code settings file is a policy authority wherever it lives, in this project or in a home directory.
  if (/(?:^|\/)\.claude\/settings(?:\.local)?\.json$/i.test(absolute.replace(/\\/g, '/'))) return 'authority';
  const local = rel.startsWith('../') ? lexical : rel;
  if (/^(?:\.git(?:\/|$)|\.claude\/(?:settings(?:\.local)?\.json|eidolon-manifest\.yaml)|\.eidolon\/(?:policy-manifest\.json|sessions(?:\/|$))|\.claude\/skills\/eidolon(?:\/|$))/i.test(local)) return 'authority';
  if (/^(?:hooks(?:\/|$)|references\/(?:persona-template\.md|security-policy\.md))/i.test(local)) return 'hooks';
  if (/^(?:docs\/(?:fixes|insights|decisions)(?:\/|$)|DECISIONS?\.md$)/i.test(local)) return 'record';
  return op === 'delete' || parents ? containsProtected(absolute, rootAbs) : null;
}
const MUTATING = /^(?:rm|mv|cp|chmod|rmdir|del|erase|truncate|shred|unlink|tee|sed|perl|remove-item|move-item|copy-item|set-content|add-content|out-file|clear-content|rename-item|ri|mi|sc|ac)$/;
const DELETING = /^(?:rm|rmdir|rd|del|erase|unlink|shred|truncate|remove-item|ri)$/;
const MOVING = /^(?:mv|move|move-item|mi|rename-item|rni|ren|rename)$/;
const COPYING = /^(?:cp|copy|copy-item|cpi|install|rsync|xcopy|robocopy)$/;
const LINKING = /^(?:ln|link)$/;
const CREATING = /^(?:touch|mkdir|md|new-item|ni|mktemp|mkfifo)$/;
const SETTING = /^(?:set-content|sc|clear-content|clc|out-file)$/;
const APPENDING = /^(?:add-content|ac)$/;
const ATTRIBUTE = /^(?:chmod|chown|chgrp|icacls|attrib|takeown|setfacl|chattr|set-itemproperty|sp|set-acl)$/;
const CMD_FAMILY = /^(?:copy|xcopy|robocopy|icacls|attrib|takeown|move|ren|rename|del|erase|rd|mklink)$/;
const TARGET_DIR = /^(?:cp|mv|ln|install|rsync|copy-item|move-item)$/;
// Verbs whose operands are read, run or printed; naming a protected path to them is not a mutation.
const INERT = /^(?:cat|ls|dir|grep|egrep|fgrep|rg|head|tail|less|more|wc|diff|cmp|stat|file|echo|printf|test|\[|\[\[|type|which|where|cd|pushd|popd|pwd|node|nodejs|python[\d.]*|py|bash|sh|zsh|pwsh|powershell|deno|bun|npm|npx|pnpm|yarn|cargo|go|make|get-content|gc|get-childitem|gci|select-string|sls|get-item|gi|test-path|resolve-path|get-filehash|sha256sum|md5sum|shasum|cut|tr|jq|du|basename|dirname|realpath|readlink|date|sleep|true|false|source|\.|write-host|write-output|jest|vitest|mocha|pytest|shellcheck|git)$/;
const REDIRECT = /^(?:\d*|&)(<>|>>|>\||>|<<<|<<|<)(.*)$/;
// A PowerShell parameter, possibly abbreviated (-Dest, -LiteralP), as the kind of path it carries.
const PS_PARAM = {path: 'path', literalpath: 'path', filepath: 'path', pspath: 'path', destination: 'destination', destinationpath: 'destination', target: 'target'};
function psParam(name) {
  const n = name.toLowerCase();
  if (n === 'lp') return 'path';
  for (const [full, kind] of Object.entries(PS_PARAM)) if (n.length >= (full === 'path' ? 2 : 3) && full.startsWith(n)) return kind;
  return null;
}
const PS_VALUE = /^-(?:value|name|newname|encoding|filter|include|exclude|itemtype|stream|attributes|type|width|depth|inputobject)$/i;
// Split a verb's arguments into positional operands, named path parameters, and the operands after `--`.
function parseArgs(verb, args) {
  const pos = [], named = [], after = []; let dd = false, scripted = false, m;
  for (let k = 0; k < args.length; k++) {
    const a = args[k], p = /^-([A-Za-z]+)(?:[:=](.+))?$/.exec(a), kind = p && psParam(p[1]);
    if (dd) after.push(a);
    else if (a === '--') dd = true;
    else if (kind) {if (p[2] !== undefined) named.push({param: kind, value: p[2]}); else if (args[k + 1] !== undefined) named.push({param: kind, value: args[++k]});}
    else if (TARGET_DIR.test(verb) && (a === '-t' || a === '--target-directory') && args[k + 1] !== undefined) named.push({param: 'dir', value: args[++k]});
    else if ((m = /^--target-directory=(.+)$/.exec(a))) named.push({param: 'dir', value: m[1]});
    else if (/^(?:sed|perl)$/.test(verb) && /^(?:-e|-f|--expression|--file)$/.test(a)) {k++; scripted = true;}
    else if (PS_VALUE.test(a)) k++;
    else if (a.startsWith('-') && a.length > 1) continue;
    else if (CMD_FAMILY.test(verb) && /^\/[A-Za-z?][\w:]*$/.test(a)) continue;
    else pos.push(a);
  }
  return {pos: /^(?:sed|perl)$/.test(verb) && !scripted ? pos.slice(1) : pos, named, after};
}
// How a verb touches each operand: delete, write (replace content or move), append, attr, link (the operand
// is what a link points at), or an `opaque` entry for a mutation whose targets are not on the command line.
// Returns null for a verb this table does not model.
// The value of an option given as `-o X`, `-oX`, `--output X` or `--output=X`.
function optionValue(args, shorts, longs) {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (shorts.includes(a) || longs.includes(a)) return args[k + 1];
    const long = longs.find(l => a.startsWith(l + '=')); if (long) return a.slice(long.length + 1);
    const short = shorts.find(x => a.startsWith(x) && a.length > x.length && !a.startsWith('--')); if (short) return a.slice(short.length);
  }
  return undefined;
}
// A short-flag cluster (-xzf, or the dashless first word of tar) that holds `letter`.
const cluster = (args, letter) => args.some((a, k) => (/^-[A-Za-z]+$/.test(a) || (k === 0 && /^[A-Za-z]+$/.test(a))) && a.replace(/^-/, '').includes(letter));
// What a find -exec command does to the files it is handed: delete, attr, write, null for a read, 'opaque' for a verb nobody modeled.
const IN_PLACE = /^(?:-[a-zA-Z]*i[a-zA-Z.]*|--in-place(?:=.*)?)$/;
function execOp(run) {
  const name = exeName(run[0] ?? '');
  if (DELETING.test(name) || MOVING.test(name)) return 'delete';
  if (ATTRIBUTE.test(name)) return 'attr';
  if (/^(?:sed|perl)$/.test(name)) return run.some(a => IN_PLACE.test(a)) ? 'write' : null;
  if (COPYING.test(name) || LINKING.test(name) || CREATING.test(name) || SETTING.test(name) || APPENDING.test(name) || /^(?:tee|dd|sh|bash|zsh|dash|ksh|pwsh|powershell|cmd)$/.test(name)) return 'write';
  return INERT.test(name) || /^(?:awk|gawk)$/.test(name) ? null : 'opaque';
}
// The archive a tar command reads: -f FILE, --file FILE or the f of a flag cluster (tar -xzf FILE, tar xzf FILE).
function tarArchive(args) {
  const file = optionValue(args, ['-f'], ['--file']); if (file !== undefined) return file;
  for (let k = 0; k < args.length; k++) if ((/^-[A-Za-z]+$/.test(args[k]) || (k === 0 && /^[A-Za-z]+$/.test(args[k]))) && args[k].replace(/^-/, '').includes('f')) return args[k + 1];
  return undefined;
}
// unzip [options] FILE [list] [-x list] [-d dir]: the first operand that is not an option or the value of -d or -x.
function unzipArchive(args) {
  for (let k = 0; k < args.length; k++) {if (/^-[dx]$/.test(args[k])) {k++; continue;} if (!args[k].startsWith('-')) return args[k];}
  return undefined;
}
function pathEntries(verb, args) {
  const {pos, named, after} = parseArgs(verb, args), out = [];
  const pick = kind => named.filter(n => n.param === kind).map(n => n.value);
  const paths = [...pos, ...after, ...pick('path')], dest = pick('destination'), dir = pick('dir'), target = pick('target');
  const add = (list, op, extra) => list.forEach(value => out.push({value, op, ...extra}));
  // Extraction can overwrite any path under its destination, which is the working directory when none is given.
  const extraction = (destination, archive) => out.push({value: destination || '.', op: 'extract', nodest: !destination, archive});
  if (DELETING.test(verb)) add(paths, 'delete');
  else if (MOVING.test(verb)) {
    const to = [...dir, ...dest];
    if (to.length) {add(paths, 'delete'); add(to, 'write');}
    else {add(paths.slice(0, -1), 'delete'); add(paths.slice(-1), paths.length > 1 ? 'write' : 'delete');}
  }
  else if (COPYING.test(verb)) {
    const to = [...dir, ...dest];
    add(to.length ? to : paths.slice(-1), 'write');
    // cp -l and cp --link make hard links to their sources, rsync --link-dest to the files of that directory: judged like ln.
    const linkDest = verb === 'rsync' ? optionValue(args, [], ['--link-dest']) : undefined;
    if (verb === 'cp' && args.some(a => a === '--link' || /^-[a-zA-Z]*l[a-zA-Z]*$/.test(a))) add(to.length ? paths : paths.slice(0, -1), 'link', {hard: true});
    // rsync reads a relative --link-dest from the destination directory; judge both readings.
    if (linkDest !== undefined) {
      add([linkDest], 'link', {hard: true});
      const destination = (to.length ? to : paths.slice(-1))[0];
      if (destination !== undefined && !/^(?:[\/\\]|[a-zA-Z]:)/.test(linkDest)) add([posix.join(destination.replace(/\\/g, '/'), linkDest.replace(/\\/g, '/'))], 'link', {hard: true});
    }
  }
  else if (LINKING.test(verb)) {
    const to = dir.length ? dir : paths.slice(-1), from = dir.length ? paths : paths.slice(0, -1);
    // A symlink target is read relative to the link's directory; a hard link source is an ordinary path.
    const symbolic = args.some(a => /^-[a-zA-Z]*s[a-zA-Z]*$/.test(a) || a === '--symbolic'), via = symbolic ? {link: to[0] ?? './'} : {};
    // A hard link is a second name for the same bytes, so writing through it writes the source.
    const hard = symbolic ? {} : {hard: true};
    if (paths.length > 1 || dir.length) {add(to, 'write'); add(from, 'link', {...via, ...hard});}
    else add(paths, 'link', symbolic ? {link: './'} : hard);
  }
  else if (CREATING.test(verb)) {
    const hardLink = args.some((a, k) => /^-(?:itemtype|type)[:=]?hardlink$/i.test(a) || (/^-(?:itemtype|type)$/i.test(a) && /^hardlink$/i.test(args[k + 1] ?? '')));
    add(paths, 'write'); add(target, 'link', {link: paths[0] ?? './', ...hardLink && {hard: true}});
  }
  else if (ATTRIBUTE.test(verb)) add(paths, 'attr');
  else if (verb === 'tee') add(paths, args.some(x => /^(?:-[a-z]*a[a-z]*|--append)$/.test(x)) ? 'append' : 'write');
  else if (/^(?:sed|perl)$/.test(verb)) {if (args.some(x => /^(?:-[a-zA-Z]*i[a-zA-Z.]*|--in-place(?:=.*)?)$/.test(x))) add(paths, 'write');}
  else if (SETTING.test(verb)) add(paths, args.some(x => /^-append$/i.test(x)) ? 'append' : 'write');
  else if (APPENDING.test(verb)) add(paths, 'append');
  else if (verb === 'dd') add(args.filter(x => x.startsWith('of=')), 'write');
  else if (/^(?:sort|shuf|tree)$/.test(verb)) {
    // The output file is an option value, so it is read from the arguments, not from the positional operands.
    const o = optionValue(args, ['-o'], verb === 'tree' ? [] : ['--output']);
    if (o !== undefined) add([o], 'write');
  }
  else if (verb === 'uniq') add(pos.slice(1, 2), 'write');
  else if (verb === 'find') {
    const roots = []; for (const a of args) {if (a.startsWith('-') || a === '(' || a === '!') break; roots.push(a);}
    if (args.includes('-delete')) add(roots, 'delete');
    for (let k = 0; k < args.length; k++) {
      if (!/^-(?:exec|execdir|ok|okdir)$/.test(args[k])) continue;
      const run = []; for (k++; k < args.length && args[k] !== ';' && args[k] !== '+'; k++) run.push(args[k]);
      const op = execOp(run);
      if (op === 'opaque') out.push({opaque: 'find -exec runs a verb the parser does not model'});
      else if (op) {
        // A root that holds a protected path is written through when the command is handed the found file ({}) as its target.
        const name = exeName(run[0] ?? ''), reaches = COPYING.test(name) || LINKING.test(name) ? (run.at(-1) ?? '').includes('{}') : run.some(a => a.includes('{}'));
        add(roots, op, op === 'write' && reaches ? {parents: true} : {});
        if (op === 'attr') add(roots, 'write', reaches ? {parents: true} : {}); // a permission change on a record is a change to it too
      }
    }
  }
  else if (/^(?:tar|gtar|bsdtar)$/.test(verb)) {
    if (cluster(args, 'x') || args.some(a => /^--(?:extract|get)$/.test(a))) extraction(optionValue(args, ['-C'], ['--directory']), tarArchive(args));
  }
  else if (verb === 'unzip') {if (!args.some(a => /^-[a-zA-Z]*[ltpzv][a-zA-Z]*$/.test(a))) extraction(optionValue(args, ['-d'], []), unzipArchive(args));}
  else if (/^7z[ar]?$/.test(verb)) {if (/^[xe]$/.test(pos[0] ?? '')) extraction(args.find(a => a.length > 2 && a.startsWith('-o'))?.slice(2), pos[1]);}
  else if (verb === 'cpio') {if (cluster(args, 'i') && !cluster(args, 't')) extraction(optionValue(args, ['-D'], ['--directory']), optionValue(args, ['-F'], ['--file']));}
  else if (verb === 'expand-archive') extraction(dest[0] ?? pos[1], pick('path')[0] ?? pos[0]);
  else if (verb === 'patch') {
    if (!pos.length || args.some(a => /^(?:-i|--input(?:=.*)?)$/.test(a))) out.push({opaque: 'a patch names its own targets'});
    else add(pos.slice(0, 1), 'write');
  }
  else return null;
  return out;
}
// Git pathspec operands. Restoring, stashing, cleaning or removing a path discards what the worktree holds.
function gitEntries(sub, rest, dir) {
  const dd = rest.indexOf('--'), before = dd < 0 ? rest : rest.slice(0, dd), after = dd < 0 ? [] : rest.slice(dd + 1);
  // A magic pathspec (:/, :(top), :!x) names the whole tree or all but part of it, so it is judged as the whole tree.
  const plain = list => list.filter(x => !x.startsWith('-')), del = list => list.map(value => ({value: value.startsWith(':') ? '.' : value, op: 'delete', dir}));
  if (sub === 'checkout') return del([...after, ...plain(before).filter(x => x.startsWith(':') || existsSync(resolve(dir, x)))]);
  if (sub === 'restore') return del([...after, ...plain(before.filter((x, i) => !/^(?:-s|--source)$/.test(before[i - 1] ?? '')))]);
  if (sub === 'stash' || sub === 'reset') return del(after);
  if (sub === 'clean') return rest.some(x => /^(?:--dry-run|-[a-zA-Z]*n[a-zA-Z]*)$/.test(x)) ? [] : del(plain(rest));
  if (sub === 'rm') return del([...plain(before), ...after]);
  if (sub === 'mv') {const p = [...plain(before), ...after]; return [...del(p.slice(0, -1)), ...p.slice(-1).map(value => ({value, op: 'write', dir}))];}
  if (sub === 'apply') return rest.some(x => /^(?:--check|--stat|--numstat|--summary)$/.test(x)) ? [] : [{opaque: 'a patch names its own targets'}];
  return [];
}
// The possible values glued to a flag: after `=` or `:`, and for a single-dash flag everything after its first letter.
function flagValues(flag) {
  const eq = flag.search(/[=:]/), out = eq > 0 ? [flag.slice(eq + 1)] : [];
  if (!flag.startsWith('--')) for (let i = 2; i < flag.length; i++) out.push(flag.slice(i));
  return out.filter(v => v && cleanOperand(v));
}
const STDIN_RUNNER = /^(?:bash|sh|zsh|dash|ksh|pwsh|powershell|node|nodejs|python[\d.]*|py|perl|ruby)$/;
const FILE_MUTATORS = [MUTATING, DELETING, MOVING, COPYING, LINKING, CREATING, SETTING, APPENDING, ATTRIBUTE];
// Executions whose code or targets no argument shows: a string run as code, an awk system() call, an encoded
// PowerShell command, an interpreter fed by a pipe, and xargs reading its operands from a file.
function executionReason(verb, args, step, hereString) {
  if (/^(?:iex|invoke-expression)$/.test(verb)) return 'a string is executed as code';
  if (/^(?:awk|gawk|mawk|nawk)$/.test(verb) && args.some(a => /\bsystem\s*\(/.test(a))) return 'an awk program runs shell commands';
  if (/^(?:pwsh|powershell)$/.test(verb) && args.some(a => /^-e(?:c|n[a-z]*)?(?:[:=].*)?$/i.test(a)) && (decodeEncoded(encodedValue(args)) === null || (step.depth ?? 0) >= 3)) return 'an encoded PowerShell command cannot be read';
  // Start-Process hands its -ArgumentList to the program it starts; a shell started that way runs a command line nobody parsed.
  if (/^(?:start-process|start|saps)$/.test(verb)) {
    const at = args.findIndex(a => /^-filepath$/i.test(a)), program = at >= 0 ? args[at + 1] : args.find(a => !a.startsWith('-'));
    if (/^(?:cmd|pwsh|powershell|bash|sh)$/.test(exeName(program ?? ''))) return 'Start-Process runs a shell with an argument list';
  }
  // A pipe or a here-string (<<<) feeds the program to a shell or interpreter that has no script operand.
  const operands = args.filter(a => !REDIRECT.test(a));
  if ((step.piped || hereString) && STDIN_RUNNER.test(verb)
    && (operands.includes('-') || !operands.some(a => !a.startsWith('-')) || (/^(?:bash|sh|zsh|dash|ksh)$/.test(verb) && operands.some(a => /^-[a-zA-Z]*s[a-zA-Z]*$/.test(a)))))
    return 'a pipe or here-string feeds a shell or interpreter that reads its program from standard input';
  if (step.xargsFile && FILE_MUTATORS.some(re => re.test(verb))) return 'xargs reads the operands of a mutating verb from a file';
  return null;
}
// ---- Archive contents. An extraction can write every path its entries name, so a local archive is listed first.
const listings = new Map();
function zipEntries(file) {
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size, tail = Buffer.alloc(Math.min(size, 65557));
    readSync(fd, tail, 0, tail.length, size - tail.length);
    const e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (e < 0) throw Error('no end of central directory');
    const total = tail.readUInt16LE(e + 10), length = tail.readUInt32LE(e + 12), offset = tail.readUInt32LE(e + 16);
    if (total === 0xffff || length === 0xffffffff || offset === 0xffffffff || length > 64 * 1024 * 1024) throw Error('zip64 or oversized directory');
    const dir = Buffer.alloc(length); readSync(fd, dir, 0, length, offset);
    const names = []; let p = 0;
    for (let k = 0; k < total; k++) {
      if (p + 46 > dir.length || dir.readUInt32LE(p) !== 0x02014b50) throw Error('bad central directory entry');
      const n = dir.readUInt16LE(p + 28), x = dir.readUInt16LE(p + 30), c = dir.readUInt16LE(p + 32);
      names.push(dir.toString('utf8', p + 46, p + 46 + n)); p += 46 + n + x + c;
    }
    return names;
  } finally {closeSync(fd);}
}
function tarEntries(file) {
  // tar reads a name with a colon as a host, so it runs in the archive's directory with a bare file name.
  const r = spawnSync('tar', ['-tf', basename(file)], {cwd: dirname(file), encoding: 'utf8', timeout: 10000, maxBuffer: 32 * 1024 * 1024, windowsHide: true});
  if (r.error || r.status !== 0) throw Error('tar could not list the archive');
  return r.stdout.split('\n').map(x => x.replace(/\r$/, '')).filter(Boolean);
}
// {entries} or {ask: why}, memoized on the file's size and modification time.
function listArchive(file, verb) {
  let stat; try {stat = statSync(file);} catch {return null;}
  if (!stat.isFile()) return null;
  const key = [file, stat.size, stat.mtimeMs, verb].join('|');
  if (!listings.has(key)) {
    let value;
    try {
      if (verb === 'unzip' || verb === 'expand-archive') value = {entries: zipEntries(file)};
      else if (/^(?:tar|gtar|bsdtar)$/.test(verb)) value = {entries: tarEntries(file)};
      else value = {ask: 'the archive ' + basename(file) + ' is a format the hook cannot list'};
    } catch {value = {ask: 'the archive ' + basename(file) + ' could not be listed, so no guard knows what it would write'};}
    listings.set(key, value);
  }
  return listings.get(key);
}
// A fact for an extraction whose archive exists: an entry that is absolute, climbs out with .., or lands on a protected path is unsafe.
function archiveVerdict(file, verb, destination, rootAbs, dir) {
  const listing = listArchive(file, verb); if (!listing) return null;
  if (listing.ask) return {kind: 'opaque', op: null, mutation: true, reason: listing.ask};
  for (const raw of listing.entries) {
    const name = raw.replace(/\\/g, '/');
    if (/^(?:\/|[a-zA-Z]:)/.test(name)) return {kind: 'unsafe', op: 'write', mutation: true, reason: 'the archive entry ' + raw + ' is an absolute path'};
    if (name.split('/').includes('..')) return {kind: 'unsafe', op: 'write', mutation: true, reason: 'the archive entry ' + raw + ' climbs out of its destination with ..'};
    if (protectedKind(resolve(destination, name), dir, rootAbs)) return {kind: 'unsafe', op: 'write', mutation: true, reason: 'the archive entry ' + raw + ' lands on a protected path'};
  }
  return null;
}

// Path facts for one command line: {kind, op, verb, mutation, value, cwd, opaque}. cd segments
// are followed, so an operand is classified by where it really points. With `all`, an operand that is
// not a protected kind still yields a fact (kind 'path') carrying its resolved absolute `path`.
// A fact of kind 'opaque' (with a `reason`) marks a mutation the parser cannot place: a glob, brace or
// variable operand that could reach a protected path, a patch, or an unmodeled verb naming one.
export function shellPathFacts(source, cwd = process.cwd(), root = cwd, language = 'bash', all = false) {
  const facts = [], rootAbs = canonicalPath(resolve(root)); let previous = [];
  for (const step of steps(source, cwd, language, {root: rootAbs})) {
    const {w, current, pending} = step;
    if (step.facts) {for (const f of step.facts) if (all || !f.allOnly) facts.push({...f, cwd: current}); continue;}
    if (step.unparsed) {facts.push({kind: 'opaque', op: null, verb: '', mutation: true, value: '', cwd: current, opaque: true, reason: 'an inline shell body the parser cannot read or that nests another body'}); continue;}
    let verb = '', args = [], entries, hereString = false; const targets = [];
    for (let k = 0; k < w.length; k++) {
      const m = REDIRECT.exec(w[k]); if (m && m[1] === '<<<') hereString = true;
      if (m) {
        const target = m[2] || w[++k];
        if (target !== undefined && target[0] !== '&') targets.push({value: target, redirect: m[1], op: m[1] === '<>' ? 'write' : m[1][0] !== '>' ? null : m[1] === '>>' ? 'append' : 'write'});
      } else if (!verb) verb = exeName(w[k]);
      else args.push(w[k]);
    }
    let dir = current;
    if (verb === 'git') {
      let git; try {git = resolveGit(w, current, [...step.exported, ...step.prefix.filter(x => ASSIGNMENT.test(x))]);} catch (e) {if (step.fragment && e instanceof ShellParseError) continue; throw e;}
      dir = git.inv.directory; args = git.rest;
      // A shell alias runs a command line nobody parsed.
      entries = git.sub === undefined ? [] : git.shell ? [{opaque: 'the git alias "' + git.shell.name + '" is a shell alias, so what it runs cannot be judged'}] : gitEntries(git.sub, git.rest, dir);
    } else {
      entries = pathEntries(verb, args);
      // ponytail: xargs-fed operands are unknown, so a piped xargs verb inherits its producer's operands; upgrade path is a sandbox.
      if (step.xargs && step.piped && entries && !entries.length) entries = pathEntries(verb, [...args, ...previous]);
    }
    previous = args.filter(a => !a.startsWith('-'));
    const mutation = MUTATING.test(verb) || targets.some(t => t.op);
    const push = (value, op, {link, opaque, hard, nodest, parents, archive} = {}) => {
      if (opaque) {facts.push({kind: 'opaque', op: null, verb, mutation: true, value: '', cwd: dir, opaque: step.opaque, reason: opaque}); return;}
      const v = cleanOperand(verb === 'dd' ? value.replace(/^(?:of|if)=/, '') : value);
      if (!v || NULL_DEVICE.test(v)) return;
      // With `all`, the lane check still sees a write to a temp variable: whether it is scratch depends on where the project sits.
      if (TEMP_VARIABLE.test(String(value))) {if (all && op) facts.push({kind: 'path', op, verb, mutation: true, value, cwd: dir, opaque: step.opaque, tempVariable: true}); return;}
      if (op === 'extract') {
        // A destination that is the root or holds a protected location is asked about; so is an extraction with no destination.
        if (nodest || (protectedKind(v, dir, rootAbs, 'delete') && !protectedKind(v, dir, rootAbs))) facts.push({kind: 'opaque', op: null, verb, mutation: true, value, cwd: dir, opaque: step.opaque, reason: 'extraction can overwrite any path under its destination'});
        if (archive !== undefined) {
          const verdict = archiveVerdict(resolve(dir, cleanOperand(archive) ?? archive), verb, resolve(dir, v.replace(/\\/g, '/')), rootAbs, dir);
          if (verdict) facts.push({...verdict, verb, value: archive, cwd: dir, opaque: step.opaque});
        }
        op = 'write';
      }
      const slashed = v.replace(/\\/g, '/'), eff = pending && !isAbsolute(slashed) ? posix.join(pending, slashed) : slashed;
      const via = link === undefined ? undefined : resolve(/[\/\\]$/.test(link) || isDir(resolve(dir, link)) ? resolve(dir, link) : dirname(resolve(dir, link)), slashed);
      let kind = null, opaqueKind = false;
      if (META.test(eff)) {
        const cut = eff.search(META), lit = eff.slice(0, cut), slash = eff.lastIndexOf('/', cut);
        // A hard link made from a glob is a link to every file it matches: judged by the directory the glob lists.
        if (op === 'link' && hard) {
          const listed = eff.slice(0, slash + 1) || '.', linked = protectedKind(listed, dir, rootAbs, null, true);
          if (linked) facts.push({kind: linked, op, verb, mutation: true, value, cwd: dir, opaque: step.opaque, hard: true, ...(all && {path: resolve(dir, listed)})});
          return;
        }
        if (!['write', 'append', 'delete', 'attr'].includes(op)) return;
        // The lane check needs the literal prefix: the directory the operand names before its first glob character or variable.
        if (all) facts.push({kind: 'glob', op, verb, value, cwd: dir, opaque: step.opaque, prefix: resolve(dir, eff.slice(0, slash + 1) || '.')});
        kind = lit ? protectedKind(lit, dir, rootAbs) : null;
        if (!kind && op === 'delete' && /^\*+$/.test(eff.slice(slash + 1))) kind = protectedKind(eff.slice(0, slash + 1) || '.', dir, rootAbs, 'delete');
        opaqueKind = !kind && couldReach(lit, dir, rootAbs);
        if (!kind && !opaqueKind) return;
        if (opaqueKind) {facts.push({kind: 'opaque', op: null, verb, mutation: true, value, cwd: dir, opaque: step.opaque, reason: 'a glob, brace or variable operand that could reach a protected path'}); return;}
      } else kind = protectedKind(v, dir, rootAbs, op, parents || (op === 'link' && hard)) ?? (all ? 'path' : null);
      if (kind) facts.push({kind, op, verb, mutation: mutation || op !== null, value, cwd: dir, opaque: step.opaque, ...(all && {path: resolvedOperand(v, dir)}), ...(via && {via}), ...(hard && {hard})});
    };
    const handled = new Set();
    if (verb === 'cpio') for (const e of entries ?? []) if (e.op === 'extract') e.archive ??= targets.find(t => t.redirect === '<')?.value;
    for (const e of entries ?? []) {push(e.value, e.op, e); handled.add(e.value);}
    for (const t of targets) push(t.value, t.op);
    for (const a of args) if (!handled.has(a) && !a.startsWith('-')) push(a, null);
    const executes = executionReason(verb, args, step, hereString);
    if (executes) push('', null, {opaque: executes});
    // The net: an unmodeled verb whose arguments name git or a protected path.
    if (entries === null && !INERT.test(verb)) {
      const call = /\(|::/.test(w[0]) && NAMES_PROTECTED.test(w[0]);
      const named = args.some(a => !a.startsWith('-') && !handled.has(a) && cleanOperand(a) && protectedKind(a, dir, rootAbs));
      const script = args.some(a => /\s/.test(a) && NAMES_PROTECTED.test(a));
      // A flag's value: `--output=hooks/x`, `--out:x` or a glued short flag such as `-sohooks/x`.
      const flagged = args.some(a => a.startsWith('-') && flagValues(a).some(v => protectedKind(v, dir, rootAbs)));
      // git as a word of its own, or at the start of a command string (su -c "git commit"); prose that mentions git does not count.
      const wraps = args.some(a => /^(?:.*[\/\\])?git(?:\.exe)?$/i.test(a) || /(?:^|[;&|])\s*git(?:\.exe)?\s/i.test(a));
      if (call || named || script || flagged || wraps) push('', null, {opaque: 'a verb the parser does not model names git or a protected path'});
    }
  }
  return facts;
}
