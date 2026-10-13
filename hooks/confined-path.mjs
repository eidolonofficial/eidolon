// Resolve a tool path inside the project root; refuses escapes and symlinks.
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function confinedPath(root, cwd, name) {
  if (typeof name !== 'string' || !name || /[\0\r\n]/.test(name)) throw Error('Invalid path');
  const rootAlias=resolve(root),cwdAlias=resolve(cwd);
  root=realpathSync(rootAlias);const realCwd=realpathSync(cwdAlias);
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
  return path;
}
