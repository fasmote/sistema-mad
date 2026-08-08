'use strict';

const path = require('path');

const ARTIFACT_PATTERNS = Object.freeze([
  { tipo: 'rf',  re: /^RF-[A-Z]{2,7}-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}(?![A-Z0-9-])/ },
  { tipo: 'da',  re: /^(?:DA-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}|DA-\d{2,3})(?![A-Z0-9-])/ },
  { tipo: 'ph',  re: /^PH-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}(?![A-Z0-9-])/ },
  { tipo: 'adr', re: /^(?:ADR-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}|ADR-\d{2,3})(?![A-Z0-9-])/ },
  { tipo: 'fut', re: /^(?:FUT-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}|FUT-\d{3})(?![A-Z0-9-])/ },
  { tipo: 'gap', re: /^GAP-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}(?![A-Z0-9-])/ },
]);

const HEADING_RE = /^\s*(#{1,6})\s+(.*\S)\s*$/;
const TABLE_SEPARATOR_CELL_RE = /^:?-{3,}:?$/;
const NON_DEFINITION_SECTION_RE = /\b(?:equivalencias?|derivaciones?|estados?|cat[aá]logos?)\b/i;
const ID_HEADER_RE = /^(?:(?:id|identificador|c[oó]digo)(?:\s+del?\s+artefacto)?|rf|da|ph|adr|fut|gap|id\s+(?:futuro|sugerido))$/i;
const TITLE_HEADER_RE = /^(?:t[ií]tulo|nombre|pregunta|descripci[oó]n|decisi[oó]n|requisito|definici[oó]n|tema|enunciado)$/i;
const NON_DEFINITION_COLUMN_RE = /^(?:id\s+origen|id\s+destino|origen|destino|equivalente\s+a|equivalencia|deriva\s+de|derivaci[oó]n|estado|categor[ií]a|cat[aá]logo)$/i;
const DECLARED_VERSION_RE = /Versi[oó]n\s*[|:]\s*v?(\d+)[._](\d+)/i;
const FILE_VERSION_RE = /v(\d+)[._](\d+)/i;

/*
 * Política explícita para filas de tabla:
 * - none: una sección o un esquema relacional/de estado/de catálogo no define;
 * - explicit-schema: columna ID reconocida por encabezado o contenido mayoritario
 *   y columna de título reconocida, con extracción posicional;
 * - compact-only: esquema parcial o desconocido; sólo acepta "ID — Título";
 * - legacy-row: tabla sin encabezado, con compatibilidad posicional histórica.
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

function isRangeHeadingRemainder(remainder, firstArtifact) {
  const afterA = String(remainder || '').match(/^a\s+(.+)$/i);
  if (!afterA) return false;

  const candidate = afterA[1];
  const secondArtifact = artifactAtStart(candidate);
  if (secondArtifact) {
    const sameFamily = firstArtifact.id.replace(/\d{2,3}$/, '') ===
      secondArtifact.id.replace(/\d{2,3}$/, '');
    const tail = candidate.slice(secondArtifact.id.length);
    return sameFamily && /^\s*(?:—|–|-|:|$)/.test(tail);
  }

  const finalNumber = candidate.match(/^(\d{2,3})(?!\d)/);
  if (!finalNumber) return false;
  const tail = candidate.slice(finalNumber[1].length);
  return /^\s*(?:—|–|-|:|$)/.test(tail);
}

function documentVersion(file, text) {
  const declared = text.split(/\r?\n/).slice(0, 30).join('\n').match(DECLARED_VERSION_RE);
  if (declared) return `v${declared[1]}.${declared[2]}`;
  const named = path.basename(file).match(FILE_VERSION_RE);
  return named ? `v${named[1]}.${named[2]}` : null;
}

function idColumnFromContent(rows) {
  const cells = rows
    .map(row => row && row.cells ? row.cells[0] : '')
    .filter(cell => String(cell || '').trim().length > 0);
  if (!cells.length) return -1;

  const matches = cells.filter(cell => artifactAtStart(cell)).length;
  return matches * 2 > cells.length ? 0 : -1;
}

function tablePolicy(header, sectionHeading, dataRows = []) {
  if (NON_DEFINITION_SECTION_RE.test(sectionHeading || '')) {
    return { mode: 'none', reason: 'non-definition-section' };
  }
  if (!header || !header.length) {
    return { mode: 'legacy-row', idColumn: 0, titleColumn: 1, reason: 'headerless-table' };
  }

  const headerIdColumn = header.findIndex(cell => ID_HEADER_RE.test(cell));
  const contentIdColumn = idColumnFromContent(dataRows);
  const idColumn = headerIdColumn >= 0 ? headerIdColumn : contentIdColumn;
  const titleColumn = header.findIndex(cell => TITLE_HEADER_RE.test(cell));
  const hasNonDefinitionColumns = header.some(cell => NON_DEFINITION_COLUMN_RE.test(cell));
  if (idColumn >= 0 && titleColumn >= 0) {
    const idSource = headerIdColumn >= 0 ? 'header' : 'content-majority';
    return { mode: 'explicit-schema', idColumn, titleColumn, reason: `${idSource}-id-and-title` };
  }
  if (hasNonDefinitionColumns) return { mode: 'none', reason: 'non-definition-columns' };
  return { mode: 'compact-only', reason: 'partial-or-unrecognized-schema' };
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
        if (title.length >= 4 && !isRangeHeadingRemainder(title, artifact)) definitions.push(definitionRecord(
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
    const dataStart = separator >= 0 ? separator + 1 : 0;
    const dataRows = block.slice(dataStart);
    const nearestSection = sectionStack.filter(Boolean).slice(-1)[0] || '';
    const policy = tablePolicy(header, nearestSection, dataRows);
    if (policy.mode === 'none') continue;

    for (const row of dataRows) {
      if (!row.cells || row.cells.length < 2) continue;

      const compact = artifactAtStart(row.cells[0]);
      const compactTitle = compact ? titleAfterId(row.cells[0], compact.id) : '';
      if (compact && compactTitle.length >= 4) {
        definitions.push(definitionRecord(
          compact.tipo, compact.id, compactTitle, file, version, 'tabla-compacta', row.line));
        continue;
      }

      if (policy.mode === 'compact-only') continue;

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
