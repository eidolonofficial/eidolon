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
    if (!ps && c === '<' && next === '<' && source[i + 2] !== '<') {
      const m = /^(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|<>()'"]+))/.exec(source.slice(i + 2));
      if (m) {word(); heredocs.push({delim: m[2] ?? m[3] ?? m[4], strip: m[1] === '-', owner: commands.length}); opaque = true; i += 1 + m[0].length; continue;}
    }
    if (c === '\\' && !ps && /[\s'"\\;&|()]/.test(next || '')) {token += source[++i]; active = true; continue;}
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
const INLINE_FLAG = /^(?:-[a-zA-Z]*[ecp]|--eval|--print|-command|\/[ck])$/i;
export function inlineBodies(source, language) {
  return shellCommands(source, language).flatMap(({words, heredoc}) => {
    const w = words.slice(executable(words));
    if (!INTERPRETER.test(exeName(w[0] || ''))) return [];
    return [...w.some(x => INLINE_FLAG.test(x)) ? [w.slice(1).join(' ')] : [], ...heredoc ? [heredoc] : []];
  });
}
// Text that names a protected location, for the nets that judge a body or a verb the parser does not model.
export const NAMES_PROTECTED = /docs[\/\\]+(?:fixes|insights|decisions)\b|(?:^|[^\w.-])DECISIONS?\.md\b|(?:^|[^\w.-])hooks[\/\\]|\.claude[\/\\]+settings|\.eidolon\b|\.git(?:[\/\\]|$|\s|['"])|policy-manifest/i;

const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const exeName = w => basename(String(w).replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');
const KEYWORD = /^(?:then|do|else|elif|if|while|until|!|\{|time)$/;
const ENV_VALUE = /^(?:-u|-C|-S|--unset|--chdir|--split-string)$/;
const SUDO_VALUE = /^(?:-u|-g|-h|-p|-C|-D|-r|-t|-T|-U|--user|--group|--host|--prompt|--close-from|--chdir|--role|--type|--other-user)$/;
const XARGS_VALUE = /^(?:-I|-n|-P|-d|-E|-L|-s|-a|-l|--max-args|--max-procs|--delimiter|--eof|--arg-file|--max-lines|--max-chars|--replace)$/;
// Index of the command word: past assignments, shell keywords, and the wrappers that run what follows
// (env with its flags, sudo, time, nice, xargs, timeout, command, exec, cmd /c).
export function executable(words) {
  let at = 0;
  for (;;) {
    const w = words[at]; if (w === undefined) return at;
    const name = exeName(w);
    if (ASSIGNMENT.test(w) || KEYWORD.test(w) || /^(?:command|exec|nohup|builtin)$/.test(name)) at++;
    else if (name === 'cmd' && /^\/[ck]$/i.test(words[at + 1] ?? '') && (words.length > at + 3 || !/\s/.test(words[at + 2] ?? ''))) at += 2;
    else if (/^(?:env|sudo|nice|xargs|timeout)$/.test(name)) {
      const valued = name === 'env' ? ENV_VALUE : name === 'sudo' ? SUDO_VALUE : name === 'xargs' ? XARGS_VALUE : /^-n$/;
      at++;
      while (words[at] !== undefined && words[at].startsWith('-') && words[at] !== '--') at += valued.test(words[at]) ? 2 : 1;
      if (words[at] === '--') at++;
      if (name === 'timeout' && words[at] !== undefined) at++;
    } else return at;
  }
}
const CD = /^(?:cd|Set-Location|pushd)$/i;
const firstOperand = w => w.slice(1).find(x => !x.startsWith('-'));
const META = /[*?\[{$]/;
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
// Walk the commands in order, following `cd`, `export` and simple `name=value` assignments, so every
// later word is judged where it really points. Each step is one command to judge.
function steps(source, cwd, language) {
  const out = [], vars = {}, exported = []; let current = resolve(cwd), pending = '';
  const remember = x => {vars[x.slice(0, x.indexOf('='))] = x.slice(x.indexOf('=') + 1);};
  for (const segment of shellCommands(source, language)) {
    const words = segment.words.map(x => x.replace(/\$(?:\{(\w+)\}|(\w+))/g, (m, a, b) => vars[a ?? b] ?? m));
    const at = executable(words), w = words.slice(at), prefix = words.slice(0, at);
    if (!w.length) {prefix.filter(x => ASSIGNMENT.test(x)).forEach(remember); continue;}
    if (/^export$/i.test(w[0])) {for (const x of w.slice(1).filter(x => ASSIGNMENT.test(x))) {exported.push(x); remember(x);} continue;}
    if (CD.test(w[0]) && firstOperand(w)) {({current, pending} = changeDirectory(current, pending, firstOperand(w))); continue;}
    out.push({w, prefix, current, pending, exported: [...exported], piped: segment.piped, opaque: segment.opaque, xargs: prefix.some(x => exeName(x) === 'xargs')});
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
export function protectedKind(value, cwd = process.cwd(), root = cwd, op = null) {
  const absolute = resolvedOperand(value, cwd); if (!absolute) return null;
  const rootAbs = canonicalPath(resolve(root));
  const rel = relative(rootAbs, absolute).replace(/\\/g, '/');
  const lexical = posix.normalize(cleanOperand(value).replace(/\\/g, '/'));
  if (/(?:^|\/)hooks\/[^\s]*\.(?:mjs|cjs|ps1|sh|py)$/i.test(absolute.replace(/\\/g,'/'))) return 'hooks';
  const local = rel.startsWith('../') ? lexical : rel;
  if (/^(?:\.git(?:\/|$)|\.claude\/(?:settings(?:\.local)?\.json|eidolon-manifest\.yaml)|\.eidolon\/(?:policy-manifest\.json|sessions(?:\/|$))|\.claude\/skills\/eidolon(?:\/|$))/i.test(local)) return 'authority';
  if (/^(?:hooks(?:\/|$)|references\/(?:persona-template\.md|security-policy\.md))/i.test(local)) return 'hooks';
  if (/^(?:docs\/(?:fixes|insights|decisions)(?:\/|$)|DECISIONS?\.md$)/i.test(local)) return 'record';
  return op === 'delete' ? containsProtected(absolute, rootAbs) : null;
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
const INERT = /^(?:cat|ls|dir|grep|egrep|fgrep|rg|head|tail|less|more|wc|diff|cmp|stat|file|echo|printf|test|\[|\[\[|type|which|where|cd|pushd|popd|pwd|node|nodejs|python[\d.]*|py|bash|sh|zsh|pwsh|powershell|deno|bun|npm|npx|pnpm|yarn|cargo|go|make|get-content|gc|get-childitem|gci|select-string|sls|get-item|gi|test-path|resolve-path|get-filehash|sha256sum|md5sum|shasum|sort|uniq|cut|tr|jq|tree|du|basename|dirname|realpath|readlink|date|sleep|true|false|source|\.|write-host|write-output|jest|vitest|mocha|pytest|shellcheck|git)$/;
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
function pathEntries(verb, args) {
  const {pos, named, after} = parseArgs(verb, args), out = [];
  const pick = kind => named.filter(n => n.param === kind).map(n => n.value);
  const paths = [...pos, ...after, ...pick('path')], dest = pick('destination'), dir = pick('dir'), target = pick('target');
  const add = (list, op, extra) => list.forEach(value => out.push({value, op, ...extra}));
  if (DELETING.test(verb)) add(paths, 'delete');
  else if (MOVING.test(verb)) {
    const to = [...dir, ...dest];
    if (to.length) {add(paths, 'delete'); add(to, 'write');}
    else {add(paths.slice(0, -1), 'delete'); add(paths.slice(-1), paths.length > 1 ? 'write' : 'delete');}
  }
  else if (COPYING.test(verb)) {const to = [...dir, ...dest]; add(to.length ? to : paths.slice(-1), 'write');}
  else if (LINKING.test(verb)) {
    const to = dir.length ? dir : paths.slice(-1), from = dir.length ? paths : paths.slice(0, -1);
    // A symlink target is read relative to the link's directory; a hard link source is an ordinary path.
    const symbolic = args.some(a => /^-[a-zA-Z]*s[a-zA-Z]*$/.test(a) || a === '--symbolic'), via = symbolic ? {link: to[0] ?? './'} : {};
    if (paths.length > 1 || dir.length) {add(to, 'write'); add(from, 'link', via);}
    else add(paths, 'link', symbolic ? {link: './'} : {});
  }
  else if (CREATING.test(verb)) {add(paths, 'write'); add(target, 'link', {link: paths[0] ?? './'});}
  else if (ATTRIBUTE.test(verb)) add(paths, 'attr');
  else if (verb === 'tee') add(paths, args.some(x => /^(?:-[a-z]*a[a-z]*|--append)$/.test(x)) ? 'append' : 'write');
  else if (/^(?:sed|perl)$/.test(verb)) {if (args.some(x => /^(?:-[a-zA-Z]*i[a-zA-Z.]*|--in-place(?:=.*)?)$/.test(x))) add(paths, 'write');}
  else if (SETTING.test(verb)) add(paths, args.some(x => /^-append$/i.test(x)) ? 'append' : 'write');
  else if (APPENDING.test(verb)) add(paths, 'append');
  else if (verb === 'dd') add(args.filter(x => x.startsWith('of=')), 'write');
  else if (verb === 'find') {
    const roots = []; for (const a of args) {if (a.startsWith('-') || a === '(' || a === '!') break; roots.push(a);}
    const at = args.findIndex(a => /^-(?:exec|execdir|ok|okdir)$/.test(a)), run = at < 0 ? '' : exeName(args[at + 1] ?? '');
    if (args.includes('-delete') || DELETING.test(run) || MOVING.test(run)) add(roots, 'delete');
  }
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
  const plain = list => list.filter(x => !x.startsWith('-')), del = list => list.map(value => ({value, op: 'delete', dir}));
  if (sub === 'checkout') return del([...after, ...plain(before).filter(x => existsSync(resolve(dir, x)))]);
  if (sub === 'restore') return del([...after, ...plain(before.filter((x, i) => !/^(?:-s|--source)$/.test(before[i - 1] ?? '')))]);
  if (sub === 'stash' || sub === 'reset') return del(after);
  if (sub === 'clean') return rest.some(x => /^(?:--dry-run|-[a-zA-Z]*n[a-zA-Z]*)$/.test(x)) ? [] : del(plain(rest));
  if (sub === 'rm') return del([...plain(before), ...after]);
  if (sub === 'mv') {const p = [...plain(before), ...after]; return [...del(p.slice(0, -1)), ...p.slice(-1).map(value => ({value, op: 'write', dir}))];}
  if (sub === 'apply') return rest.some(x => /^(?:--check|--stat|--numstat|--summary)$/.test(x)) ? [] : [{opaque: 'a patch names its own targets'}];
  return [];
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
    let verb = '', args = [], entries; const targets = [];
    for (let k = 0; k < w.length; k++) {
      const m = REDIRECT.exec(w[k]);
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
    const push = (value, op, {link, opaque} = {}) => {
      if (opaque) {facts.push({kind: 'opaque', op: null, verb, mutation: true, value: '', cwd: dir, opaque: step.opaque, reason: opaque}); return;}
      const v = cleanOperand(verb === 'dd' ? value.replace(/^(?:of|if)=/, '') : value);
      if (!v || NULL_DEVICE.test(v)) return;
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
      } else kind = protectedKind(v, dir, rootAbs, op) ?? (all ? 'path' : null);
      if (kind) facts.push({kind, op, verb, mutation: mutation || op !== null, value, cwd: dir, opaque: step.opaque, ...(all && {path: resolvedOperand(v, dir)}), ...(via && {via})});
    };
    const handled = new Set();
    for (const e of entries ?? []) {push(e.value, e.op, e); handled.add(e.value);}
    for (const t of targets) push(t.value, t.op);
    for (const a of args) if (!handled.has(a) && !a.startsWith('-')) push(a, null);
    // The net: an unmodeled verb whose arguments name a protected path.
    if (entries === null && !INERT.test(verb)) {
      const call = /\(|::/.test(w[0]) && NAMES_PROTECTED.test(w[0]);
      const named = args.some(a => !a.startsWith('-') && !handled.has(a) && cleanOperand(a) && protectedKind(a, dir, rootAbs));
      const script = args.some(a => /\s/.test(a) && NAMES_PROTECTED.test(a));
      const flagged = args.some(a => /^--?[\w-]+[=:]/.test(a) && NAMES_PROTECTED.test(a.replace(/^--?[\w-]+[=:]/, '')));
      if (call || named || script || flagged) push('', null, {opaque: 'a verb the parser does not model names a protected path'});
    }
  }
  return facts;
}
