// Normalize Codex's apply_patch into proposed file states, never into shell text.
// Exact matching only: unsupported or ambiguous patches are refused, not guessed.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function confinedPath(root, cwd, name) {
  if (typeof name !== 'string' || !name || /[\0\r\n]/.test(name)) throw Error('Invalid patch path');
  root = realpathSync(root);
  const path = resolve(realpathSync(cwd), name);
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw Error('Patch path escapes project');
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    // lstat, not exists alone: dangling symlinks must also be rejected.
    try { if (lstatSync(cursor).isSymbolicLink()) throw Error('Symlinked patch path is not supported'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return path;
}

function currentText(path) {
  const bytes = readFileSync(path);
  if (bytes.length > 4 * 1024 * 1024 || bytes.includes(0)) throw Error('Patch target is not supported text');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return text.replace(/\r\n/g, '\n');
}

export function parsePatch(patch, cwd, root = cwd) {
  if (typeof patch !== 'string' || Buffer.byteLength(patch) > 4 * 1024 * 1024) throw Error('Invalid or oversized patch');
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') throw Error('Unsupported patch envelope');
  const changes = [], seen = new Set();
  const claim = path => { if (seen.has(path)) throw Error('Multiple operations on one path are not supported'); seen.add(path); };
  let i = 1;
  while (i < lines.length - 1) {
    const header = lines[i++].match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (!header) throw Error('Unsupported patch operation');
    const kind = header[1].toLowerCase();
    const path = confinedPath(root, cwd, header[2]); claim(path);
    if (kind === 'add') {
      if (existsSync(path)) throw Error('Add target already exists');
      const added = [];
      while (i < lines.length - 1 && !lines[i].startsWith('*** ')) {
        if (!lines[i].startsWith('+')) throw Error('Invalid add line');
        added.push(lines[i++].slice(1));
      }
      changes.push({ kind, path, before: '', after: added.join('\n') + '\n', edits: [] });
      continue;
    }
    if (!existsSync(path) || !lstatSync(path).isFile()) throw Error('Patch target is missing or not a file');
    const before = currentText(path);
    if (kind === 'delete') { changes.push({ kind, path, before, after: '', edits: [] }); continue; }
    let destination = path;
    if (lines[i]?.startsWith('*** Move to: ')) {
      destination = confinedPath(root, cwd, lines[i++].slice(13));
      if (destination !== path) { claim(destination); if (existsSync(destination)) throw Error('Move destination already exists'); }
    }
    let content = before.split('\n'); if (content.at(-1) === '') content.pop();
    let cursor = 0, hunks = 0;
    const edits = [];
    while (i < lines.length - 1 && !/^\*\*\* (Add|Update|Delete) File: /.test(lines[i])) {
      let anchor = '';
      if (lines[i] === '@@' || lines[i].startsWith('@@ ')) anchor = lines[i++].slice(3);
      else if (hunks > 0 || !/^[ +\-]/.test(lines[i])) throw Error('Unsupported update hunk');
      if (anchor) {
        const found = content.indexOf(anchor, cursor);
        if (found < 0) throw Error('Patch context anchor not found');
        cursor = found + 1;
      }
      const oldLines = [], newLines = [];
      let eof = false, count = 0, removed = [], added = [];
      const flush = () => { if (removed.length || added.length) edits.push({ old_string: removed.join('\n'), new_string: added.join('\n') }); removed = []; added = []; };
      while (i < lines.length - 1 && !lines[i].startsWith('@@') && !lines[i].startsWith('*** ')) {
        const line = lines[i++]; const prefix = line[0] || ' ';
        if (![' ', '+', '-'].includes(prefix)) throw Error('Unsupported hunk line');
        const value = line.slice(1); count++;
        if (prefix === ' ') { flush(); oldLines.push(value); newLines.push(value); }
        if (prefix === '-') { oldLines.push(value); removed.push(value); }
        if (prefix === '+') { newLines.push(value); added.push(value); }
      }
      flush();
      if (lines[i] === '*** End of File') { eof = true; i++; }
      if (!count) throw Error('Empty update hunk');
      let at;
      if (!oldLines.length) at = content.length;
      else {
        const matches = [];
        for (let n = cursor; n <= content.length - oldLines.length; n++) {
          if (eof && n + oldLines.length !== content.length) continue;
          if (oldLines.every((v, k) => v === content[n + k])) matches.push(n);
        }
        if (matches.length !== 1) throw Error('Patch context is missing or ambiguous');
        at = matches[0];
      }
      content.splice(at, oldLines.length, ...newLines); cursor = at + newLines.length; hunks++;
    }
    if (!hunks) throw Error('Update has no hunks');
    changes.push({ kind: destination === path ? kind : 'move', path, destination, before,
      after: content.join('\n') + '\n', edits });
  }
  if (!changes.length) throw Error('Patch has no operations');
  return changes;
}
