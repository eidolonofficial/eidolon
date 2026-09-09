// Prefer native discovery. This bounded fallback reads standard name/description metadata only.
// Unknown YAML forms need the host's parser; never execute a plugin to discover its identity.
import {readdirSync,lstatSync,existsSync} from 'node:fs';
import {portablePath,projectPath,readContext} from './safe-paths.mjs';
function scalar(raw) {
 const v=raw.trim();if(v.startsWith('"'))return JSON.parse(v);
 if(v.startsWith("'")){if(!v.endsWith("'"))throw Error('Invalid scalar');return v.slice(1,-1).replace(/''/g,"'");}
 if(!v||/^[\[\]{&*!]/.test(v))throw Error('Host parser required');return v;
}
export function inventorySkills(root,host,{disabledIds=[],maxSkills=128}={}) {
 if(!['claude','codex'].includes(host)||!Number.isInteger(maxSkills)||maxSkills<1||maxSkills>256)throw Error('Invalid inventory scope');
 const relative=(host==='codex'?'.agents':'.claude')+'/skills',base=projectPath(root,relative);
 if(!existsSync(base))return {candidates:[],rejected:[],source:'inspected-project'};
 const entries=readdirSync(base,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
 if(entries.length>maxSkills)throw Error('Skill inventory exceeds explicit budget; narrow the scope');
 const candidates=[],rejected=[];
 for(const entry of entries) {
  const path=relative+'/'+entry.name+'/SKILL.md';
  try {
   portablePath(path);if(!lstatSync(projectPath(root,relative+'/'+entry.name)).isDirectory())continue;
   const file=readContext(root,path,null,65536);
   const front=file.text.match(/^---\r?\n([\s\S]{1,8192}?)\r?\n---(?:\r?\n|$)/);if(!front)throw Error('Frontmatter unavailable');
   const name=front[1].match(/^name:\s*(.+)$/m),desc=front[1].match(/^description:\s*(.+)$/m);
   if(!name||!desc)throw Error('Host parser required');
   let description;
   if(/^[>|][-+]?$/.test(desc[1].trim())) {
    const start=front[1].indexOf(desc[0])+desc[0].length;
    const lines=front[1].slice(start).split(/\r?\n/).slice(1);const body=[];
    for(const line of lines){if(line&&!/^\s/.test(line))break;body.push(line.trim());}
    description=body.join(' ').trim();
   } else description=scalar(desc[1]);
   const id=host+':'+path;
   if(disabledIds.includes(id))continue;
   const skillName=scalar(name[1]);if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(skillName)||!description)throw Error('Invalid standard metadata');
   candidates.push({id,name:skillName,description,source:'inspected-project',path,revision:file.sha256,hosts:[host],disableModelInvocation:/^disable-model-invocation:\s*true\s*$/m.test(front[1])});
  }catch(e){rejected.push({path,reason:e.message});}
 }
 return {candidates,rejected,source:'inspected-project'};
}
