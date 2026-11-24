import {ONBOARDING_STEPS as S} from '../web/src/config/onboarding.ts';
const out=[];
let tot=0;
const flds=(f,ind='')=>f.flatMap(x=>[`${ind}| \`${x.id}\` | ${x.label} | ${x.type}${x.required?' (required)':''} | ${[x.showIf?`shown if \`${x.showIf.field}\` = ${[].concat(x.showIf.equals).join('/')}`:'',x.help||''].filter(Boolean).join('; ').replace(/\|/g,'/')} |`,...(x.columns?flds(x.columns,'↳ '):[]),...(x.fields?flds(x.fields,'↳ '):[])]);
S.forEach((s,i)=>{
 out.push(`## ${i+1}. ${s.title}\n`);
 out.push(`Group: ${s.group} · Icon: ${s.icon} · ${s.optional?'Optional':'Required'} · ${s.tests.length} live test(s)\n`);
 out.push(`**Why we need it:** ${s.why}\n`);
 out.push(`### Fields\n\n| ID | Label | Type | Notes |\n|---|---|---|---|\n${flds(s.fields).join('\n')}\n`);
 out.push(`### Grant instructions\n`);
 s.instructions.forEach(b=>{
  out.push(`**${b.title}**${b.variant?` _(variant: ${b.variant})_`:''}\n`);
  b.steps.forEach((t,j)=>out.push(t.startsWith('```')?t+'\n':`${j+1}. ${t}`));
  if(b.links) out.push('\n'+b.links.map(l=>`- [${l.label}](${l.href})`).join('\n'));
  out.push('');
 });
 out.push(`### Live tests\n\n| Test ID | What it proves | API call, and what "partial" looks like |\n|---|---|---|`);
 s.tests.forEach(t=>{tot++;out.push(`| \`${t.id}\` | ${t.label} | ${t.description.replace(/\|/g,'/')} |`)});
 out.push('\n');
});
console.log(JSON.stringify({steps:S.length,tests:tot}));
import fs from 'fs';
fs.writeFileSync(process.argv[2],out.join('\n'));
