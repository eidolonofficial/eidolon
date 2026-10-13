// Resolve a tool path inside the project root; refuses escapes and symlinks.
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// The real spelling of a path: the deepest existing ancestor goes through the OS (so an 8.3 short
// name such as DECISI~1 becomes decisions) and the absent tail is appended unchanged.
export function canonicalPath(path) {
  let parent = path; const rest = [];
  while (!existsSync(parent) && dirname(parent) !== parent) { rest.unshift(basename(parent)); parent = dirname(parent); }
  try { return join(realpathSync.native(parent), ...rest); } catch { return path; }
}

export function confinedPath(root, cwd, name) {
  if (typeof name !== 'string' || !name || /[\0\r\n]/.test(name)) throw Error('Invalid path');
  // A colon past the drive letter names an NTFS alternate data stream of the file before it.
  if (process.platform === 'win32' && /:/.test(name.replace(/^[a-zA-Z]:/, ''))) throw Error('Invalid path');
  const rootAlias=resolve(root),cwdAlias=resolve(cwd);
  root=realpathSync.native(rootAlias);const realCwd=realpathSync.native(cwdAlias);
  const inside=(base,path)=>{const r=relative(base,path);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
  if(!inside(root,realCwd))throw Error('Working directory escapes project');
  let path=resolve(realCwd,name);
  // Only the supplied project/cwd alias is canonicalized. Symlinks inside it remain forbidden.
  if(isAbsolute(name))for(const [alias,canonical] of [[rootAlias,root],[cwdAlias,realCwd]]){
    if(inside(alias,path)){path=resolve(canonical,relative(alias,path));break;}
  }
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw Error('Path escapes project');
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = resolve(cursor, part);
    // lstat, not exists alone: dangling symlinks must also be rejected.
    try { if (lstatSync(cursor).isSymbolicLink()) throw Error('Symlinked path is not supported'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  // Classification runs on the real spelling; a short name that resolves out of the root is an escape.
  const real = canonicalPath(path), back = relative(root, real);
  if (!back || back === '..' || back.startsWith('..' + sep) || isAbsolute(back)) throw Error('Path escapes project');
  return real;
}
