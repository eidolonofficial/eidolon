// Bounded shell inspection for governance checks. It never executes the command.
import {existsSync, realpathSync} from 'node:fs';
import {resolve, relative, dirname, basename, join, posix} from 'node:path';
export function shellCommands(source, language = 'bash') {
  if (typeof source !== 'string' || source.length > 1048576) throw Error('Invalid shell command');
  const commands = []; let words = [], token = '', active = false, quote = '', opaque = false;
  const word = () => {if (active) words.push(token); token = ''; active = false;};
  const end = () => {word(); if (words.length) commands.push({words, opaque}); words = []; opaque = false;};
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (quote) {
      if (c === quote) {
        if (language === 'powershell' && next === quote) {token += c; i++;}
        else quote = '';
      } else if ((language === 'powershell' && c === '`') || (language !== 'powershell' && c === '\\' && quote === '"' && /["\\$`\n]/.test(next || ''))) {if (next != null) token += source[++i];}
      else {token += c; if (quote === '"' && /[$`]/.test(c)) opaque = true;}
      continue;
    }
    if (c === '"' || c === "'") {quote = c; active = true; continue;}
    if (c === '\\' && language !== 'powershell' && /[\s'"\\;&|]/.test(next || '')) {token += source[++i]; active = true; continue;}
    if (c === '`' && language === 'powershell' && next != null) {token += source[++i]; active = true; continue;}
    if (/[;|&\n]/.test(c)) {end(); continue;}
    if (/\s/.test(c)) {word(); continue;}
    if (c === '#' && !active) {while (i < source.length && source[i] !== '\n') i++; end(); continue;}
    if (/[(){}$`<>]/.test(c)) opaque = true;
    token += c; active = true;
  }
  if (quote) throw Error('Unterminated shell quote'); end(); return commands;
}
function executable(words) {
  let at = 0;
  if (words[at] === 'env') at++;
  while (/^[A-Za-z_]\w*=/.test(words[at] || '')) at++;
  if (['command', 'exec'].includes(words[at])) at++;
  return at;
}
export function gitOperations(source, cwd = process.cwd(), language = 'bash') {
  const result = []; let current = resolve(cwd);
  for (const segment of shellCommands(source, language)) {
    const at = executable(segment.words), w = segment.words.slice(at);
    if (/^(?:cd|Set-Location)$/i.test(w[0] || '') && w[1]) {current = resolve(current, w[1]); continue;}
    if (!/^(?:git|git\.exe)$/i.test(basename(w[0] || '').replace(/\\/g, '/'))) continue;
    let i = 1, directory = current;
    for (; i < w.length; i++) {
      const v = w[i];
      if (v === '-C') {if (!w[i + 1]) throw Error('Missing Git directory'); directory = resolve(directory, w[++i]);}
      else if (v === '-c' || v === '--git-dir' || v === '--work-tree' || v === '--namespace' || v === '--config-env') {if (!w[++i]) throw Error('Missing Git option');}
      else if (/^-C.+/.test(v)) directory = resolve(directory, v.slice(2));
      else if (/^--(?:git-dir|work-tree|namespace|config-env)=|^-c.+/.test(v)) continue;
      else if (/^--(?:no-pager|paginate|bare|no-optional-locks|no-replace-objects|literal-pathspecs|no-lazy-fetch)$/.test(v)) continue;
      else break;
    }
    if (i >= w.length) continue;
    const subcommand = w[i++], args = w.slice(i), flags = [], messages = []; let messageFile;
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (subcommand === 'commit' && (a === '-m' || a === '--message' || /^-[a-zA-Z]*m$/.test(a))) {if (args[k + 1] !== undefined) messages.push(args[++k]);}
      else if (subcommand === 'commit' && a.startsWith('--message=')) messages.push(a.slice(10));
      else if (subcommand === 'commit' && /^-m.+/.test(a)) messages.push(a.slice(2));
      else if (subcommand === 'commit' && (a === '-F' || a === '--file')) messageFile = args[++k];
      else if (subcommand === 'commit' && a.startsWith('--file=')) messageFile = a.slice(7);
      else flags.push(a);
    }
    result.push({subcommand, args, flags, messages, messageFile, cwd: directory, opaque: segment.opaque});
  }
  return result;
}
export function resolvedOperand(value, cwd) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null;
  value=value.replace(/^--?(?:path|literalpath|file|source|destination)[:=]/i,'');
  if(value.startsWith('-'))return null;
  let path = resolve(cwd, value.replace(/\\/g, '/'));
  let parent = path, rest = [];
  while (!existsSync(parent) && dirname(parent) !== parent) {rest.unshift(basename(parent)); parent = dirname(parent);}
  try {path = join(realpathSync(parent), ...rest);} catch { /* absent roots remain lexical */ }
  return path;
}
export function protectedKind(value, cwd = process.cwd(), root = cwd) {
  const absolute = resolvedOperand(value, cwd); if (!absolute) return null;
  const rel = relative(resolve(root), absolute).replace(/\\/g, '/');
  const lexical = posix.normalize(String(value).replace(/\\/g, '/'));
  if (/^engine(?:\/|$)/i.test(rel)) return null;
  if (/(?:^|\/)hooks\/[^\s]*\.(?:mjs|cjs|ps1|sh|py)$/i.test(absolute.replace(/\\/g,'/'))) return 'hooks';
  const local = rel.startsWith('../') ? lexical : rel;
  if (/^(?:\.git(?:\/|$)|\.(?:claude|codex)\/(?:settings(?:\.local)?\.json|hooks\.json|config\.toml|eidolon-manifest\.yaml|security-[^/]+)|\.eidolon\/(?:policy-manifest\.json|sessions(?:\/|$))|\.(?:claude|agents)\/skills\/eidolon(?:\/|$))/i.test(local)) return 'authority';
  if (/^(?:hooks(?:\/|$)|references\/(?:persona-template\.md|persona-registry\.json|security-policy\.md))/i.test(local)) return 'hooks';
  if (/^(?:docs\/(?:fixes|insights|decisions)(?:\/|$)|DECISIONS?\.md$)/i.test(local)) return 'record';
  return null;
}
export function shellPathFacts(source, cwd = process.cwd(), root = cwd, language = 'bash') {
  const facts = []; let current = resolve(cwd);
  for (const segment of shellCommands(source, language)) {
    const w = segment.words.slice(executable(segment.words));
    if (/^(?:cd|Set-Location)$/i.test(w[0] || '') && w[1]) {current = resolve(current, w[1]); continue;}
    const verb = basename(w[0] || '').toLowerCase();
    const mutation = /^(?:rm|mv|cp|chmod|rmdir|del|erase|truncate|shred|unlink|tee|sed|perl|remove-item|move-item|copy-item|set-content|add-content|out-file|clear-content|rename-item|ri|mi|sc|ac)$/.test(verb) || w.some(x => /[<>]/.test(x));
    for (const value of w.slice(1)) {
      const kind = protectedKind(value.replace(/^>+/, ''), current, root);
      if (kind) facts.push({kind, mutation, value, cwd: current, opaque: segment.opaque});
    }
  }
  return facts;
}
