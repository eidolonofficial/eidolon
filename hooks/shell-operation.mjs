// Bounded shell inspection for governance checks. It never executes the command.
import {existsSync, realpathSync} from 'node:fs';
import {resolve, relative, dirname, basename, join, posix} from 'node:path';
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
  for (const {delim, strip} of pending) {
    while (pos < source.length) {
      let eol = source.indexOf('\n', pos); if (eol < 0) eol = source.length;
      let line = source.slice(pos, eol).replace(/\r$/, ''); if (strip) line = line.replace(/^\t+/, '');
      pos = eol + 1;
      if (line === delim) break;
    }
  }
  return pos - 1;
}
export function shellCommands(source, language = 'bash') {
  if (typeof source !== 'string' || source.length > 1048576) throw new ShellParseError('Invalid shell command');
  const ps = language === 'powershell';
  const commands = [], heredocs = []; let words = [], token = '', active = false, quote = '', opaque = false;
  const word = () => {if (active) words.push(token); token = ''; active = false;};
  const end = () => {word(); if (words.length) commands.push({words, opaque}); words = []; opaque = false;};
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
      if (m) {word(); heredocs.push({delim: m[2] ?? m[3] ?? m[4], strip: m[1] === '-'}); opaque = true; i += 1 + m[0].length; continue;}
    }
    if (c === '\\' && !ps && /[\s'"\\;&|]/.test(next || '')) {token += source[++i]; active = true; continue;}
    if (c === '`' && ps && next != null) {token += source[++i]; active = true; continue;}
    if (c === '|' && !ps && token.endsWith('>')) {token += c; continue;}
    if (/[;|&\n]/.test(c)) {
      end();
      if (c === '\n' && heredocs.length) i = skipHeredocs(source, i, heredocs.splice(0));
      continue;
    }
    if (/\s/.test(c)) {word(); continue;}
    if (c === '#' && !active) {while (i < source.length && source[i] !== '\n') i++; end(); continue;}
    if (/[(){}$`<>]/.test(c)) opaque = true;
    token += c; active = true;
  }
  if (quote) throw new ShellParseError('Unterminated shell quote'); end(); return commands;
}
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
export function executable(words) {
  let at = 0;
  if (words[at] === 'env') at++;
  while (ASSIGNMENT.test(words[at] || '')) at++;
  if (['command', 'exec'].includes(words[at])) at++;
  return at;
}
const CD = /^(?:cd|Set-Location|pushd)$/i;
const firstOperand = w => w.slice(1).find(x => !x.startsWith('-'));
// A parsed git option or environment variable that points core.hooksPath somewhere else.
export const overridesHooksPath = op =>
  op.config.some(c => /^core\.hookspath\b/i.test(c)) ||
  op.env.some(e => /^GIT_CONFIG_KEY_\d+=core\.hookspath$/i.test(e) || /^GIT_CONFIG_PARAMETERS=.*core\.hookspath/i.test(e));
export function gitOperations(source, cwd = process.cwd(), language = 'bash') {
  const result = [], exported = []; let current = resolve(cwd);
  for (const segment of shellCommands(source, language)) {
    const at = executable(segment.words), w = segment.words.slice(at);
    if (CD.test(w[0] || '') && firstOperand(w)) {current = resolve(current, firstOperand(w)); continue;}
    if (/^export$/i.test(w[0] || '')) {exported.push(...w.slice(1).filter(x => ASSIGNMENT.test(x))); continue;}
    if (!/^(?:git|git\.exe)$/i.test(basename(w[0] || '').replace(/\\/g, '/'))) continue;
    const env = [...exported, ...segment.words.slice(0, at).filter(x => ASSIGNMENT.test(x))], config = [];
    let i = 1, directory = current;
    for (; i < w.length; i++) {
      const v = w[i];
      if (v === '-C') {if (!w[i + 1]) throw new ShellParseError('Missing Git directory'); directory = resolve(directory, w[++i]);}
      else if (v === '-c' || v === '--config-env') {if (!w[++i]) throw new ShellParseError('Missing Git option'); config.push(w[i]);}
      else if (v === '--git-dir' || v === '--work-tree' || v === '--namespace') {if (!w[++i]) throw new ShellParseError('Missing Git option');}
      else if (/^-C.+/.test(v)) directory = resolve(directory, v.slice(2));
      else if (v.startsWith('--config-env=')) config.push(v.slice(13));
      else if (/^--(?:git-dir|work-tree|namespace)=/.test(v)) continue;
      else if (/^-c.+/.test(v)) config.push(v.slice(2));
      else if (/^--(?:no-pager|paginate|bare|no-optional-locks|no-replace-objects|literal-pathspecs|no-lazy-fetch)$/.test(v)) continue;
      else break;
    }
    if (i >= w.length) continue;
    let subcommand = w[i++], rest = w.slice(i);
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
    result.push({subcommand, args, flags, messages, messageFile, env, config, cwd: directory, opaque: segment.opaque});
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
  if (/(?:^|\/)hooks\/[^\s]*\.(?:mjs|cjs|ps1|sh|py)$/i.test(absolute.replace(/\\/g,'/'))) return 'hooks';
  const local = rel.startsWith('../') ? lexical : rel;
  if (/^(?:\.git(?:\/|$)|\.claude\/(?:settings(?:\.local)?\.json|eidolon-manifest\.yaml)|\.eidolon\/(?:policy-manifest\.json|sessions(?:\/|$))|\.claude\/skills\/eidolon(?:\/|$))/i.test(local)) return 'authority';
  if (/^(?:hooks(?:\/|$)|references\/(?:persona-template\.md|security-policy\.md))/i.test(local)) return 'hooks';
  if (/^(?:docs\/(?:fixes|insights|decisions)(?:\/|$)|DECISIONS?\.md$)/i.test(local)) return 'record';
  return null;
}
const MUTATING = /^(?:rm|mv|cp|chmod|rmdir|del|erase|truncate|shred|unlink|tee|sed|perl|remove-item|move-item|copy-item|set-content|add-content|out-file|clear-content|rename-item|ri|mi|sc|ac)$/;
const DELETING = /^(?:rm|rmdir|rd|del|erase|unlink|shred|truncate|remove-item|ri)$/;
const MOVING = /^(?:mv|move|move-item|mi|rename-item|rni|ren)$/;
const COPYING = /^(?:cp|copy|copy-item|cpi|install)$/;
const SETTING = /^(?:set-content|sc|clear-content|clc|out-file)$/;
const APPENDING = /^(?:add-content|ac)$/;
const ATTRIBUTE = /^(?:chmod|chown|chgrp)$/;
const REDIRECT = /^(?:\d*|&)(>>|>\||>|<<<|<<|<)(.*)$/;
// How a verb touches each operand: delete, write (replace content or move), append, attr, or null (read).
function operandRoles(verb, operands) {
  const files = operands.filter(x => !x.startsWith('-')), roles = new Map(), set = (list, op) => list.forEach(v => roles.set(v, op));
  if (DELETING.test(verb)) set(files, 'delete');
  else if (MOVING.test(verb)) set(files, 'write');
  else if (COPYING.test(verb)) set(files.slice(-1), 'write');
  else if (ATTRIBUTE.test(verb)) set(files, 'attr');
  else if (verb === 'tee') set(files, operands.some(x => /^(?:-[a-z]*a[a-z]*|--append)$/.test(x)) ? 'append' : 'write');
  else if (/^(?:sed|perl)$/.test(verb) && operands.some(x => /^(?:-[a-zA-Z]*i[a-zA-Z.]*|--in-place(?:=.*)?)$/.test(x))) set(files, 'write');
  else if (SETTING.test(verb)) set(files, operands.some(x => /^-append$/i.test(x)) ? 'append' : 'write');
  else if (APPENDING.test(verb)) set(files, 'append');
  else if (verb === 'dd') set(operands.filter(x => x.startsWith('of=')), 'write');
  return roles;
}
// Path facts for one command line: {kind, op, verb, mutation, value, cwd, opaque}. cd segments
// are followed, so an operand is classified by where it really points. With `all`, an operand that is
// not a protected kind still yields a fact (kind 'path') carrying its resolved absolute `path`.
export function shellPathFacts(source, cwd = process.cwd(), root = cwd, language = 'bash', all = false) {
  const facts = []; let current = resolve(cwd);
  for (const segment of shellCommands(source, language)) {
    const w = segment.words.slice(executable(segment.words));
    if (CD.test(w[0] || '') && firstOperand(w)) {current = resolve(current, firstOperand(w)); continue;}
    let verb = '';
    const operands = [], targets = [];
    for (let k = 0; k < w.length; k++) {
      const m = REDIRECT.exec(w[k]);
      if (m) {
        const target = m[2] || w[++k];
        if (target !== undefined && target[0] !== '&') targets.push({value: target, op: m[1][0] !== '>' ? null : m[1] === '>>' ? 'append' : 'write'});
      } else if (!verb) verb = basename(w[k]).toLowerCase().replace(/\.exe$/, '');
      else operands.push(w[k]);
    }
    const mutation = MUTATING.test(verb) || w.some(x => /[<>]/.test(x)), roles = operandRoles(verb, operands);
    const add = (value, op) => {
      const operand = verb === 'dd' ? value.replace(/^(?:of|if)=/, '') : value;
      const kind = protectedKind(operand, current, root) ?? (all ? 'path' : null);
      if (kind) facts.push({kind, op, verb, mutation, value, cwd: current, opaque: segment.opaque, ...(all && {path: resolvedOperand(operand, current)})});
    };
    for (const value of operands) add(value, roles.get(value) ?? null);
    for (const t of targets) add(t.value, t.op);
  }
  return facts;
}
