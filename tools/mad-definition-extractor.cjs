'use strict';

const path = require('path');

const ARTIFACT_PATTERNS = Object.freeze([
  { tipo: 'rf',  re: /^RF-[A-Z]{2,7}-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}(?![A-Z0-9-])/ },
  { tipo: 'da',  re: /^(?:DA-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}|DA-\d{2,3})(?![A-Z0-9-])/ },
  { tipo: 'ph',  re: /^PH-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}(?![A-Z0-9-])/ },
  { tipo: 'adr', re: /^ADR-\d{2,3}(?![A-Z0-9-])/ },
  { tipo: 'fut', re: /^(?:FUT-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}|FUT-\d{3})(?![A-Z0-9-])/ },
  { tipo: 'gap', re: /^GAP-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}(?![A-Z0-9-])/ },
]);

const HEADING_RE = /^\s*(#{1,6})\s+(.*\S)\s*$/;
const TABLE_SEPARATOR_CELL_RE = /^:?-{3,}:?$/;
const NON_DEFINITION_SECTION_RE = /\b(?:equivalencias?|derivaciones?|estados?|cat[aá]logos?)\b/i;
const ID_HEADER_RE = /^(?:id|identificador|c[oó]digo)(?:\s+del?\s+artefacto)?$/i;
const TITLE_HEADER_RE = /^(?:t[ií]tulo|nombre|pregunta|descripci[oó]n|decisi[oó]n|requisito|definici[oó]n)$/i;
const NON_DEFINITION_COLUMN_RE = /^(?:id\s+origen|id\s+destino|origen|destino|equivalente\s+a|equivalencia|deriva\s+de|derivaci[oó]n|estado|categor[ií]a|cat[aá]logo)$/i;
const DECLARED_VERSION_RE = /Versi[oó]n\s*[|:]\s*v?(\d+)[._](\d+)/i;
const FILE_VERSION_RE = /v(\d+)[._](\d+)/i;

/*
 * Política explícita para filas de tabla:
 * - una sección de equivalencias, derivaciones, estados o catálogo nunca define;
 * - un esquema con columna ID y columna de título/definición sí define;
 * - sin columna de título, las columnas relacionales, de estado o catálogo excluyen;
 * - el formato compacto "ID — Título" sigue siendo una definición explícita salvo
 *   que esté dentro de una de las secciones excluidas.
 */

function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, block => block.replace(/[^\n]/g, ' '));
}

function cleanCell(cell) {
  return cell.trim().replace(/^`|`$/g, '').trim();
}

function tableCells(line) {
  if (!line.trim().startsWith('|')) return null;
  const raw = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return raw.split('|').map(cleanCell);
}

function artifactAtStart(text) {
  const clean = String(text || '').trim().replace(/^`/, '');
  for (const pattern of ARTIFACT_PATTERNS) {
    const match = clean.match(pattern.re);
    if (match) return { tipo: pattern.tipo, id: match[0] };
  }
  return null;
}

function titleAfterId(text, id) {
  const position = text.indexOf(id);
  if (position < 0) return '';
  return text.slice(position + id.length).replace(/^[\s`—–\-:.]+/, '').replace(/`$/, '').trim();
}

function documentVersion(file, text) {
  const declared = text.split(/\r?\n/).slice(0, 30).join('\n').match(DECLARED_VERSION_RE);
  if (declared) return `v${declared[1]}.${declared[2]}`;
  const named = path.basename(file).match(FILE_VERSION_RE);
  return named ? `v${named[1]}.${named[2]}` : null;
}

function tablePolicy(header, sectionHeading) {
  if (NON_DEFINITION_SECTION_RE.test(sectionHeading || '')) {
    return { definition: false, reason: 'non-definition-section' };
  }
  if (!header || !header.length) return { definition: true, idColumn: 0, titleColumn: 1, reason: 'legacy-row' };

  const idColumn = header.findIndex(cell => ID_HEADER_RE.test(cell));
  const titleColumn = header.findIndex(cell => TITLE_HEADER_RE.test(cell));
  const hasNonDefinitionColumns = header.some(cell => NON_DEFINITION_COLUMN_RE.test(cell));
  if (idColumn >= 0 && titleColumn >= 0) {
    return { definition: true, idColumn, titleColumn, reason: 'explicit-schema' };
  }
  if (hasNonDefinitionColumns) return { definition: false, reason: 'non-definition-columns' };
  return { definition: true, idColumn: 0, titleColumn: 1, reason: 'legacy-row' };
}

function definitionRecord(tipo, id, title, file, version, form, line) {
  return {
    tipo,
    id,
    titulo_completo: title,
    documento: path.basename(file),
    ruta: file.split(path.sep).join('/'),
    version,
    forma: form,
    linea_diagnostica: line,
  };
}

function extractDefinitionsFromText(file, rawText) {
  const text = stripCode(rawText);
  const lines = text.split(/\r?\n/);
  const version = documentVersion(file, text);
  const definitions = [];
  const sectionStack = [];

  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      const headingText = heading[2];
      sectionStack.length = level - 1;
      sectionStack[level - 1] = headingText;
      const artifact = artifactAtStart(headingText);
      if (artifact) {
        const title = titleAfterId(headingText, artifact.id);
        if (title.length >= 4) definitions.push(definitionRecord(
          artifact.tipo, artifact.id, title, file, version, 'encabezado', i + 1));
      }
      continue;
    }

    if (!lines[i].trim().startsWith('|')) continue;
    const block = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      block.push({ line: i + 1, cells: tableCells(lines[i]) });
      i++;
    }
    i--;

    const separator = block.findIndex(row => row.cells && row.cells.length &&
      row.cells.every(cell => TABLE_SEPARATOR_CELL_RE.test(cell)));
    const header = separator > 0 ? block[separator - 1].cells : null;
    const policy = tablePolicy(header, sectionStack.filter(Boolean).join(' / '));
    if (!policy.definition) continue;

    const dataStart = separator >= 0 ? separator + 1 : 0;
    for (const row of block.slice(dataStart)) {
      if (!row.cells || row.cells.length < 2) continue;

      const compact = artifactAtStart(row.cells[0]);
      const compactTitle = compact ? titleAfterId(row.cells[0], compact.id) : '';
      if (compact && compactTitle.length >= 4) {
        definitions.push(definitionRecord(
          compact.tipo, compact.id, compactTitle, file, version, 'tabla-compacta', row.line));
        continue;
      }

      const idCell = row.cells[policy.idColumn ?? 0] || '';
      const artifact = artifactAtStart(idCell);
      if (!artifact || artifact.id !== idCell.trim().replace(/^`|`$/g, '')) continue;
      const title = (row.cells[policy.titleColumn ?? 1] || '').trim();
      if (title.length < 4 || artifactAtStart(title)) continue;
      definitions.push(definitionRecord(
        artifact.tipo, artifact.id, title, file, version, 'tabla', row.line));
    }
  }

  return definitions;
}

function extractDefinitions(files) {
  const definitions = [];
  for (const [file, text] of files) definitions.push(...extractDefinitionsFromText(file, text));
  return definitions;
}

module.exports = {
  ARTIFACT_PATTERNS,
  NON_DEFINITION_SECTION_RE,
  NON_DEFINITION_COLUMN_RE,
  stripCode,
  artifactAtStart,
  tablePolicy,
  extractDefinitionsFromText,
  extractDefinitions,
};
