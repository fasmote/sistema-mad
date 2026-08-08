'use strict';

const TITLE_COLLISION_POLICY = Object.freeze({
  version: '1',
  algorithm: 'jaccard-word-set',
  divergence_threshold: 0.45,
  display_grouping_threshold: 0.85,
  normalization: 'lowercase-no-diacritics-no-punctuation',
});

function normalizeTitle(title) {
  return String(title || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function titleSimilarity(a, b) {
  const setA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared++;
  return shared / (setA.size + setB.size - shared);
}

function hasSubstantiveDivergence(definitions) {
  const titled = definitions.filter(d => d.titulo_completo && d.titulo_completo.trim().length >= 4);
  for (let i = 0; i < titled.length; i++) {
    for (let j = i + 1; j < titled.length; j++) {
      if (titleSimilarity(titled[i].titulo_completo, titled[j].titulo_completo) <
          TITLE_COLLISION_POLICY.divergence_threshold) return true;
    }
  }
  return false;
}

function groupTitleVariants(definitions) {
  const groups = [];
  for (const definition of definitions) {
    const title = definition.titulo_completo;
    if (!title || title.trim().length < 4) continue;
    const existing = groups.find(group =>
      titleSimilarity(group.titulo, title) >= TITLE_COLLISION_POLICY.display_grouping_threshold);
    if (existing) {
      existing.definiciones.push(definition);
      if (!existing.archivos.includes(definition.documento)) existing.archivos.push(definition.documento);
    } else {
      groups.push({ titulo: title, archivos: [definition.documento], definiciones: [definition] });
    }
  }
  return groups;
}

function collisionMetadata(definitions) {
  const variants = groupTitleVariants(definitions);
  return {
    estado: hasSubstantiveDivergence(definitions) ? 'COLISIONADO' : 'SIN_COLISION',
    variantes: variants.length,
    politica: TITLE_COLLISION_POLICY.version,
  };
}

module.exports = {
  TITLE_COLLISION_POLICY,
  normalizeTitle,
  titleSimilarity,
  hasSubstantiveDivergence,
  groupTitleVariants,
  collisionMetadata,
};
