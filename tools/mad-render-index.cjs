#!/usr/bin/env node
/* MAD-Render-Index: genera SOS_INDICE_MAESTRO_IDS.md desde mad-index.json.
 * Clasifica ORIGEN (Core congelado / Vivo / Hist-Evidencia / Solo-citado) y
 * mide el efecto de "ignorar bloques de codigo" sobre definiciones reales. */
'use strict';
const fs=require('fs'), path=require('path');
const [,, jsonPath, corpusRoot, outPath] = process.argv;
const idx=JSON.parse(fs.readFileSync(jsonPath,'utf8'));

// mapa basename -> tier, leyendo el arbol del corpus
const tier={}, full={};
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  if(e.name.startsWith('.'))continue; const p=path.join(d,e.name);
  if(e.isDirectory())walk(p);
  else if(e.name.endsWith('.md')){ full[e.name]=p;
    tier[e.name]= p.includes('01_CORE_BASELINE')?'CORE'
      : /ACTA|DEBATE|REC_00|FOA|AUDITORIA|SUPUESTOS|VALIDACION_HUMANA|POST_DEBATE/.test(e.name)?'HIST/EVID':'VIVO';
  }}})(corpusRoot);

function origen(info){
  if(!info.definido_en.length) return 'SOLO-CITADO';
  const ts=new Set(info.definido_en.map(f=>tier[f]||'VIVO'));
  if(ts.has('CORE')) return 'VIGENTE-CORE';
  if(ts.size===1 && ts.has('HIST/EVID')) return 'HIST/EVID';
  return 'VIVO';
}
// ¿un ID solo-citado aparece alguna vez como cita CON TÍTULO (`ID — titulo`)?
const allText = Object.values(full).map(p=>fs.readFileSync(p,'utf8')).join('\n');
function citedWithTitle(id){
  return new RegExp('`?'+id.replace(/[-]/g,'\\-')+'\\s*[—–-]\\s+[A-Za-zÁÉÍÓÚÑ]').test(allText);
}

const TYPES=['rf','da','ph','adr','fut','gap'];
const rows=[]; const cls={'VIGENTE-CORE':0,'VIVO':0,'HIST/EVID':0,'SOLO-CITADO':0};
let hiddenDefs=0; const hiddenList=[];
for(const tipo of TYPES){
  for(const [id,info] of Object.entries(idx[tipo])){
    const o=origen(info); cls[o]++;
    let nota='';
    if(o==='SOLO-CITADO'){ if(citedWithTitle(id)){hiddenDefs++; hiddenList.push(id); nota='cita con título (no definición formal)';} }
    rows.push({tipo:tipo.toUpperCase(),id,titulo:(info.titulo||'').replace(/\|/g,'/'),origen:o,
      def:info.definido_en.join(', ')||'—',cit:info.citado_en.length,nota});
  }
}
rows.sort((a,b)=> a.tipo<b.tipo?-1:a.tipo>b.tipo?1: (a.id<b.id?-1:1));
const total=rows.length;

const H=s=>s;
let md=`| Campo | Valor |
|---|---|
| **Documento** | \`SOS_INDICE_MAESTRO_IDS\` |
| **Título** | Índice Maestro de IDs SOS post-Core v1.83 |
| **Tier** | 2 · META |
| **Estado** | Vivo · render completo reproducible (${total} filas) |
| **Versión de esquema** | v0.03 |
| **Generado por** | \`mad-index.cjs\` parcheado (7 puntos) + \`mad-render-index.cjs\` |
| **Fecha** | ${new Date().toISOString().slice(0,10)} ART |
| **Volver a** | \`SOS_MAPA_DOCUMENTAL.md\` |

# SOS_INDICE_MAESTRO_IDS — Registro civil de IDs

## 1. Total real reproducible

| Clase (ORIGEN) | Cantidad |
|---|---:|
| VIGENTE-CORE (definido en Core v1.83 congelado) | ${cls['VIGENTE-CORE']} |
| VIVO (definido en registro post-Core) | ${cls['VIVO']} |
| HIST/EVIDENCIA (solo en acta/auditoría/debate) | ${cls['HIST/EVID']} |
| SOLO-CITADO (sin definición encontrada) | ${cls['SOLO-CITADO']} |
| **TOTAL IDs distintos** | **${total}** |

Eventos distintos: ${Object.keys(idx.eventos).length}. Placeholders \`-000\` ignorados por regla.

## 2. SOLO-CITADO: decisión de metodología pendiente (explica el delta con 923)

De los ${cls['SOLO-CITADO']} SOLO-CITADO, **${hiddenDefs}** aparecen al menos una vez como **cita con título** (\`ID — título\`) pero **nunca como definición formal** (encabezado o fila de tabla \`| ID | título |\`). Los otros **${cls['SOLO-CITADO']-hiddenDefs}** son **huérfanos reales**: citados sin título ni definición.

Los 7 puntos ratificados definen "definición" como encabezado o fila de tabla. **No** incluyen la cita inline con título. Por eso este render estricto da ${cls['SOLO-CITADO']} solo-citado, mientras el resumen previo daba 14: aquel contaba la cita-con-título como definición. Es una **8ª regla no ratificada** — decisión humana:
- **Opción estricta (este render):** cita-con-título NO es definición → ${cls['SOLO-CITADO']} solo-citado, y son señal de gobierno (IDs sin registro formal, ej. \`DA-199\`).
- **Opción laxa:** cita-con-título SÍ es definición → ~${cls['SOLO-CITADO']-hiddenDefs} solo-citado (los huérfanos reales).

IDs con título pero sin definición formal: ${hiddenList.slice(0,25).join(', ')}${hiddenList.length>25?'…':''}.

## 3. Registro civil completo

| Tipo | ID | Título | ORIGEN | Definido en | Citas | Nota |
|---|---|---|---|---|---:|---|
`;
for(const r of rows){ md+=`| ${r.tipo} | \`${r.id}\` | ${r.titulo} | ${r.origen} | ${r.def} | ${r.cit} | ${r.nota} |\n`; }
fs.writeFileSync(outPath, md);
console.log(`Render OK: ${total} filas | ORIGEN=${JSON.stringify(cls)} | def-en-código=${hiddenDefs}`);
