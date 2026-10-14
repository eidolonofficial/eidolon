// Bounded shell inspection for governance checks. It never executes the command.
import {existsSync, statSync} from 'node:fs';
import {resolve, relative, dirname, basename, posix, sep, isAbsolute} from 'node:path';
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
    const {delim, strip} = entry, start = pos;
    while (pos < source.length) {
      let eol = source.indexOf('\n', pos); if (eol < 0) eol = source.length;
      let line = source.slice(pos, eol).replace(/\r$/, ''); if (strip) line = line.replace(/^\t+/, '');
      pos = eol + 1;
      if (line === delim) break;
    }
    entry.body = source.slice(start, pos);
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
// command and start a new one, so the commands inside them are inspected like top-level commands.
export function shellCommands(source, language = 'bash') {
  if (typeof source !== 'string' || source.length > 1048576) throw new ShellParseError('Invalid shell command');
  const ps = language === 'powershell';
  const commands = [], heredocs = []; let words = [], token = '', active = false, quote = '', opaque = false, pipeIn = false, depth = 0;
  const word = () => {if (active) words.push(token); token = ''; active = false;};
  const end = () => {word(); if (words.length) {commands.push({words, opaque, piped: pipeIn}); pipeIn = false;} words = []; opaque = false;};
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
      if (m) {word(); heredocs.push({delim: m[2] ?? m[3] ?? m[4], strip: m[1] === '-', owner: commands.length}); opaque = true; i += 1 + m[0].length; continue;}
    }
    if (c === '\\' && !ps && /[\s'"\\;&|()]/.test(next || '')) {token += source[++i]; active = true; continue;}
    // bash drops an unquoted backslash before an ordinary character, so g\it and r\m are git and rm. Only in the command word:
    // an argument such as a cmd /c path keeps its backslashes.
    if (c === '\\' && !ps && /\w/.test(next || '') && !token.includes(':') && executable([...words, token]) === words.length) {active = true; continue;}
    if (c === '`' && ps && next != null) {token += source[++i]; active = true; continue;}
    if (c === '|' && !ps && token.endsWith('>')) {token += c; continue;}
    if (!ps && c === '$' && next === "'") {const [text, close] = ansiC(source, i + 1); token += text; active = true; i = close; continue;}
    if (c === '$' && next === '(') {end(); if (ps) depth++; i++; continue;}
    if (!ps && (c === '`' || c === '(' || c === ')')) {end(); continue;}
    if (ps && depth) {
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) {end(); continue;}
    }
    if (/[;|&\n]/.test(c)) {
      end();
      if (c === '|' && next !== '|' && source[i - 1] !== '|') pipeIn = true;
      if (c === '\n' && heredocs.length) {
        const batch = heredocs.splice(0);
        i = skipHeredocs(source, i, batch);
        for (const h of batch) if (commands[h.owner]) commands[h.owner].heredoc = (commands[h.owner].heredoc ?? '') + h.body;
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
  return at > 0 && w[at + 1] !== undefined ? {text: w[at + 1], language: sh ? 'bash' : 'powershell'} : null;
}
function bodySteps(body, current, pending) {
  const {text, language} = body;
  if (!text || /[$`]/.test(text) || [text, unescaped(text)].some(b => NAMES_PROTECTED.test(b) || AUTHORITY_TEXT.test(b) || GIT_WORD.test(b))) return [];
  try {
    if (inlineBodies(text, language).length) throw new ShellParseError('A shell body nests another body');
    return steps(text, current, language).map(s => ({...s, pending: s.pending || pending, inner: true}));
  } catch (e) {
    if (e instanceof ShellParseError) return [{w: [], prefix: [], current, pending, exported: [], unparsed: true}];
    throw e;
  }
}
// Walk the commands in order, following `cd`, `export` and simple `name=value` assignments, so every
// later word is judged where it really points. Each step is one command to judge.
function steps(source, cwd, language) {
  const out = [], vars = {}, exported = []; let current = resolve(cwd), pending = '';
  const remember = x => {vars[x.slice(0, x.indexOf('='))] = x.slice(x.indexOf('=') + 1);};
  for (const segment of shellCommands(source, language)) {
    const words = expandWrapperStrings(segment.words).map(x => x.replace(/\$(?:\{(\w+)\}|(\w+))/g, (m, a, b) => vars[a ?? b] ?? m));
    const at = executable(words), w = words.slice(at), prefix = words.slice(0, at);
    if (!w.length) {prefix.filter(x => ASSIGNMENT.test(x)).forEach(remember); continue;}
    if (/^export$/i.test(w[0])) {for (const x of w.slice(1).filter(x => ASSIGNMENT.test(x))) {exported.push(x); remember(x);} continue;}
    if (CD.test(w[0]) && firstOperand(w)) {({current, pending} = changeDirectory(current, pending, firstOperand(w))); continue;}
    out.push({w, prefix, current, pending, exported: [...exported], piped: segment.piped, opaque: segment.opaque, xargs: prefix.some(x => exeName(x) === 'xargs'), xargsFile: prefix.some(x => /^(?:-a.*|--arg-file(?:=.*)?)$/.test(x))});
    const body = bodyOf(w); if (body) out.push(...bodySteps(body, current, pending));
  }
  return out;
}
// A parsed git option or environment variable that points core.hooksPath somewhere else, or swaps the
// global or system config file that could set it.
export const overridesHooksPath = op =>
  op.config.some(c => /^core\.hookspath\b/i.test(c)) ||
  op.env.some(e => /^GIT_CONFIG_KEY_\d+=core\.hookspath$/i.test(e) || /^GIT_CONFIG_PARAMETERS=.*core\.hookspath/i.test(e) || /^GIT_CONFIG_(?:GLOBAL|SYSTEM)=/i.test(e));
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
export function gitOperations(source, cwd = process.cwd(), language = 'bash') {
  const result = [];
  for (const step of steps(source, cwd, language)) {
    const w = step.w;
    if (!/^(?:git|git\.exe)$/i.test(basename(w[0] || '').replace(/\\/g, '/'))) continue;
    const env = [...step.exported, ...step.prefix.filter(x => ASSIGNMENT.test(x))];
    const {i: at, directory, config} = gitInvocation(w, step.current);
    if (at >= w.length) continue;
    let subcommand = w[at], rest = w.slice(at + 1);
    const alias = config.map(c => /^alias\.([^=]+)=([^]*)$/i.exec(c)).find(m => m && m[1].toLowerCase() === subcommand.toLowerCase());
    if (alias) {
      // ponytail: one alias level, and a shell alias is parsed without the trailing arguments.
      if (alias[2].startsWith('!')) {result.push(...gitOperations(alias[2].slice(1), directory, 'bash')); continue;}
      const expansion = shellCommands(alias[2], 'bash')[0]?.words ?? [];
      if (expansion.length) {subcommand = expansion[0]; rest = [...expansion.slice(1), ...rest];}
    }
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
const PS_PARAM = {path: 'path', literalpath: 'path', filepath: 'path', pspath: 'path', destination: 'destination', target: 'target'};
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
function pathEntries(verb, args) {
  const {pos, named, after} = parseArgs(verb, args), out = [];
  const pick = kind => named.filter(n => n.param === kind).map(n => n.value);
  const paths = [...pos, ...after, ...pick('path')], dest = pick('destination'), dir = pick('dir'), target = pick('target');
  const add = (list, op, extra) => list.forEach(value => out.push({value, op, ...extra}));
  // Extraction can overwrite any path under its destination, which is the working directory when none is given.
  const extraction = destination => out.push({value: destination || '.', op: 'extract', nodest: !destination});
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
    if (linkDest !== undefined) add([linkDest], 'link', {hard: true});
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
    if (cluster(args, 'x') || args.some(a => /^--(?:extract|get)$/.test(a))) extraction(optionValue(args, ['-C'], ['--directory']));
  }
  else if (verb === 'unzip') {if (!args.some(a => /^-[a-zA-Z]*[ltpzv][a-zA-Z]*$/.test(a))) extraction(optionValue(args, ['-d'], []));}
  else if (/^7z[ar]?$/.test(verb)) {if (/^[xe]$/.test(pos[0] ?? '')) extraction(args.find(a => a.length > 2 && a.startsWith('-o'))?.slice(2));}
  else if (verb === 'cpio') {if (cluster(args, 'i') && !cluster(args, 't')) extraction(optionValue(args, ['-D'], ['--directory']));}
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
  if (/^(?:pwsh|powershell)$/.test(verb) && args.some(a => /^-e(?:c|n[a-z]*)?$/i.test(a))) return 'an encoded PowerShell command cannot be read';
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
// Path facts for one command line: {kind, op, verb, mutation, value, cwd, opaque}. cd segments
// are followed, so an operand is classified by where it really points. With `all`, an operand that is
// not a protected kind still yields a fact (kind 'path') carrying its resolved absolute `path`.
// A fact of kind 'opaque' (with a `reason`) marks a mutation the parser cannot place: a glob, brace or
// variable operand that could reach a protected path, a patch, or an unmodeled verb naming one.
export function shellPathFacts(source, cwd = process.cwd(), root = cwd, language = 'bash', all = false) {
  const facts = [], rootAbs = canonicalPath(resolve(root)); let previous = [];
  for (const step of steps(source, cwd, language)) {
    const {w, current, pending} = step;
    if (step.unparsed) {facts.push({kind: 'opaque', op: null, verb: '', mutation: true, value: '', cwd: current, opaque: true, reason: 'an inline shell body the parser cannot read or that nests another body'}); continue;}
    let verb = '', args = [], entries, hereString = false; const targets = [];
    for (let k = 0; k < w.length; k++) {
      const m = REDIRECT.exec(w[k]); if (m && m[1] === '<<<') hereString = true;
      if (m) {
        const target = m[2] || w[++k];
        if (target !== undefined && target[0] !== '&') targets.push({value: target, op: m[1] === '<>' ? 'write' : m[1][0] !== '>' ? null : m[1] === '>>' ? 'append' : 'write'});
      } else if (!verb) verb = exeName(w[k]);
      else args.push(w[k]);
    }
    let dir = current;
    if (verb === 'git') {
      const inv = gitInvocation(w, current); dir = inv.directory;
      const rest = w.slice(inv.i + 1); args = rest;
      entries = inv.i < w.length ? gitEntries(w[inv.i], rest, dir) : [];
    } else {
      entries = pathEntries(verb, args);
      // ponytail: xargs-fed operands are unknown, so a piped xargs verb inherits its producer's operands; upgrade path is a sandbox.
      if (step.xargs && step.piped && entries && !entries.length) entries = pathEntries(verb, [...args, ...previous]);
    }
    previous = args.filter(a => !a.startsWith('-'));
    const mutation = MUTATING.test(verb) || targets.some(t => t.op);
    const push = (value, op, {link, opaque, hard, nodest, parents} = {}) => {
      if (opaque) {facts.push({kind: 'opaque', op: null, verb, mutation: true, value: '', cwd: dir, opaque: step.opaque, reason: opaque}); return;}
      const v = cleanOperand(verb === 'dd' ? value.replace(/^(?:of|if)=/, '') : value);
      if (!v || NULL_DEVICE.test(v)) return;
      // With `all`, the lane check still sees a write to a temp variable: whether it is scratch depends on where the project sits.
      if (TEMP_VARIABLE.test(String(value))) {if (all && op) facts.push({kind: 'path', op, verb, mutation: true, value, cwd: dir, opaque: step.opaque, tempVariable: true}); return;}
      if (op === 'extract') {
        // A destination that is the root or holds a protected location is asked about; so is an extraction with no destination.
        if (nodest || (protectedKind(v, dir, rootAbs, 'delete') && !protectedKind(v, dir, rootAbs))) facts.push({kind: 'opaque', op: null, verb, mutation: true, value, cwd: dir, opaque: step.opaque, reason: 'extraction can overwrite any path under its destination'});
        op = 'write';
      }
      const slashed = v.replace(/\\/g, '/'), eff = pending && !isAbsolute(slashed) ? posix.join(pending, slashed) : slashed;
      const via = link === undefined ? undefined : resolve(/[\/\\]$/.test(link) || isDir(resolve(dir, link)) ? resolve(dir, link) : dirname(resolve(dir, link)), slashed);
      let kind = null, opaqueKind = false;
      if (META.test(eff)) {
        if (!['write', 'append', 'delete', 'attr'].includes(op)) return;
        const cut = eff.search(META), lit = eff.slice(0, cut), slash = eff.lastIndexOf('/', cut);
        kind = lit ? protectedKind(lit, dir, rootAbs) : null;
        if (!kind && op === 'delete' && /^\*+$/.test(eff.slice(slash + 1))) kind = protectedKind(eff.slice(0, slash + 1) || '.', dir, rootAbs, 'delete');
        opaqueKind = !kind && couldReach(lit, dir, rootAbs);
        if (!kind && !opaqueKind) return;
        if (opaqueKind) {facts.push({kind: 'opaque', op: null, verb, mutation: true, value, cwd: dir, opaque: step.opaque, reason: 'a glob, brace or variable operand that could reach a protected path'}); return;}
      } else kind = protectedKind(v, dir, rootAbs, op, parents) ?? (all ? 'path' : null);
      if (kind) facts.push({kind, op, verb, mutation: mutation || op !== null, value, cwd: dir, opaque: step.opaque, ...(all && {path: resolvedOperand(v, dir)}), ...(via && {via}), ...(hard && {hard})});
    };
    const handled = new Set();
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
