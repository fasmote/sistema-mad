'use strict';

// ── Estado global ─────────────────────────────────────────────────────────────
const state = {
  inputs:     {},   // toolId -> { inputId: string | string[] }
  flags:      {},   // toolId -> { flagId: string | boolean }
  lastOutput: null,
  lastToolId: null,
};

// ── Arranque ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const cfg = await window.mad.getConfig();
  renderTools(cfg.tools);

  document.getElementById('btn-save').addEventListener('click', async () => {
    if (!state.lastOutput) return;
    const defaultName = `reporte-${state.lastToolId || 'mad'}.md`;
    const filePath = await window.mad.saveDialog({ defaultName });
    if (!filePath) return;
    const res = await window.mad.writeResult({ filePath, text: state.lastOutput });
    if (!res.ok) showError('Exportar', `No se pudo guardar el archivo:\n${res.error}`);
  });
});

// ── Renderizado de tarjetas ───────────────────────────────────────────────────
function renderTools(tools) {
  const panel = document.getElementById('tools-panel');
  panel.innerHTML = '';
  tools.forEach(tool => {
    state.inputs[tool.id] = {};
    state.flags[tool.id]  = {};
    panel.appendChild(buildCard(tool));
  });
}

function buildCard(tool) {
  const card = el('div', 'tool-card');
  card.dataset.toolId = tool.id;

  // Cabecera
  const hdr  = el('div', 'card-header');
  const name = el('div', 'card-title');
  name.textContent = tool.name;
  const desc = el('div', 'card-desc');
  desc.textContent = tool.description;
  hdr.appendChild(name);
  hdr.appendChild(desc);
  card.appendChild(hdr);

  // Zonas de entrada
  const zonesWrap = el('div', `zones-wrap zones-${tool.inputs.length}`);
  tool.inputs.forEach(inp => zonesWrap.appendChild(buildZone(tool, inp)));
  card.appendChild(zonesWrap);

  // Flags opcionales
  if (tool.flags.length > 0) {
    const flagsWrap = el('div', 'flags-wrap');
    tool.flags.forEach(fl => flagsWrap.appendChild(buildFlag(tool, fl)));
    card.appendChild(flagsWrap);
  }

  // Botón ejecutar
  const footer = el('div', 'card-footer');
  const btn    = el('button', 'btn btn-run');
  btn.id          = `btn-run-${tool.id}`;
  btn.textContent = 'Ejecutar';
  btn.addEventListener('click', () => runTool(tool));
  footer.appendChild(btn);
  card.appendChild(footer);

  return card;
}

// ── Zona de drag & drop ───────────────────────────────────────────────────────
function buildZone(tool, inp) {
  const wrap  = el('div', 'zone-wrap');
  const label = el('label', 'zone-label');
  label.textContent = inp.label + (inp.required ? '' : ' (opcional)');
  wrap.appendChild(label);

  const zone = el('div', 'drop-zone');
  zone.dataset.toolId   = tool.id;
  zone.dataset.inputId  = inp.id;
  zone.dataset.inputType = inp.type;

  const icon = el('span', 'zone-icon');
  icon.textContent = inp.type === 'folder' ? '📁' : '📄';

  const zoneText = el('div', 'zone-text');

  const hint = el('span', 'zone-hint');
  hint.id          = `zone-hint-${tool.id}-${inp.id}`;
  hint.textContent = inp.type === 'folder'
    ? 'Arrastrá una carpeta aquí'
    : 'Arrastrá archivos aquí';

  const cta = el('span', 'zone-cta');
  cta.textContent = 'o hacé clic para explorar';

  zoneText.appendChild(hint);
  zoneText.appendChild(cta);
  zone.appendChild(icon);
  zone.appendChild(zoneText);
  wrap.appendChild(zone);

  // Clic → diálogo del sistema
  zone.addEventListener('click', async () => {
    if (inp.type === 'folder') {
      const cur = state.inputs[tool.id][inp.id];
      const res = await window.mad.selectFolder(typeof cur === 'string' ? cur : undefined);
      if (res) setInput(tool.id, inp.id, res);
    } else {
      const res = await window.mad.selectFiles();
      if (res && res.length) setInput(tool.id, inp.id, res);
    }
  });

  // Drag & drop
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    if (inp.type === 'folder') {
      // En Electron, file.path contiene la ruta completa de la carpeta
      setInput(tool.id, inp.id, files[0].path);
    } else {
      setInput(tool.id, inp.id, files.map(f => f.path));
    }
  });

  return wrap;
}

function setInput(toolId, inputId, value) {
  state.inputs[toolId][inputId] = value;
  const hint = document.getElementById(`zone-hint-${toolId}-${inputId}`);
  if (!hint) return;

  if (Array.isArray(value)) {
    const n = value.length;
    hint.textContent = `${n} archivo${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}`;
  } else {
    // Mostrar solo el tramo final de la ruta para que entre en el ancho
    const parts = value.replace(/\\/g, '/').split('/');
    hint.textContent = parts.length > 2 ? '…/' + parts.slice(-2).join('/') : value;
  }

  const zone = hint.closest('.drop-zone');
  if (zone) zone.classList.add('has-value');
}

// ── Flags ─────────────────────────────────────────────────────────────────────
function buildFlag(tool, fl) {
  const wrap  = el('div', 'flag-wrap');
  const label = el('label', 'flag-label');
  label.textContent = fl.label + (fl.required ? '' : ' (opcional)');
  label.setAttribute('for', `flag-${tool.id}-${fl.id}`);
  wrap.appendChild(label);

  if (fl.type === 'boolean') {
    const cb = el('input', 'flag-checkbox');
    cb.type = 'checkbox';
    cb.id   = `flag-${tool.id}-${fl.id}`;
    cb.addEventListener('change', () => { state.flags[tool.id][fl.id] = cb.checked; });
    wrap.appendChild(cb);
  } else {
    const input = el('input', 'flag-input');
    input.type        = 'text';
    input.id          = `flag-${tool.id}-${fl.id}`;
    input.placeholder = fl.placeholder || '';
    input.addEventListener('input', () => { state.flags[tool.id][fl.id] = input.value; });
    wrap.appendChild(input);
  }

  return wrap;
}

// ── Ejecutar herramienta ──────────────────────────────────────────────────────
async function runTool(tool) {
  // Validar campos requeridos
  for (const inp of tool.inputs) {
    if (inp.required && !state.inputs[tool.id][inp.id]) {
      showError(tool.name, `Falta el campo requerido: "${inp.label}"`);
      return;
    }
  }

  // Armar argumentos posicionales
  const args = [];
  for (const inp of tool.inputs) {
    const val = state.inputs[tool.id][inp.id];
    if (val) {
      if (Array.isArray(val)) args.push(...val);
      else args.push(val);
    }
  }

  // Armar flags
  for (const fl of tool.flags) {
    const val = state.flags[tool.id][fl.id];
    if (fl.type === 'boolean' && val) {
      args.push(fl.flag);
    } else if (fl.type === 'text' && val && String(val).trim()) {
      args.push(fl.flag, String(val).trim());
    }
  }

  setRunning(tool.id, true);
  showRunning(tool.name);

  const result = await window.mad.runTool({ command: tool.command, args });

  setRunning(tool.id, false);
  showResult(tool, result);
}

function setRunning(toolId, running) {
  const btn = document.getElementById(`btn-run-${toolId}`);
  if (!btn) return;
  btn.disabled    = running;
  btn.textContent = running ? 'Ejecutando…' : 'Ejecutar';
}

// ── Mostrar resultado ─────────────────────────────────────────────────────────
function showRunning(toolName) {
  document.getElementById('results-title').textContent = toolName;
  setBadge('running', '⟳ ejecutando…');
  document.getElementById('results-output').innerHTML =
    '<span class="placeholder-text">Ejecutando…</span>';
  document.getElementById('btn-save').disabled = true;
  state.lastOutput = null;
}

function showResult(tool, result) {
  document.getElementById('results-title').textContent = tool.name;
  const outputEl = document.getElementById('results-output');

  if (result.isError) {
    // Error real: el proceso no pudo arrancar
    setBadge('error', '✗ Error de ejecución');
    outputEl.innerHTML =
      `<span class="line-error">${escHtml(result.errorMessage || 'Error desconocido')}</span>`;
    document.getElementById('btn-save').disabled = true;
    state.lastOutput = null;
  } else {
    // exit 0 = sin hallazgos; exit 1 = hallazgos encontrados — ambos son resultado válido
    if (result.exitCode === 0) {
      setBadge('ok', '✓ Sin hallazgos');
    } else {
      setBadge('warn', `⚠ Hallazgos encontrados (exit ${result.exitCode})`);
    }
    const output = result.output || '(sin salida)';
    outputEl.innerHTML = colorize(output);
    outputEl.scrollTop = 0;
    document.getElementById('btn-save').disabled = false;
    state.lastOutput = output;
    state.lastToolId = tool.id;
  }
}

function showError(toolName, msg) {
  document.getElementById('results-title').textContent = toolName;
  setBadge('error', '✗ Falta información');
  document.getElementById('results-output').innerHTML =
    `<span class="line-error">${escHtml(msg)}</span>`;
  document.getElementById('btn-save').disabled = true;
}

function setBadge(type, text) {
  const badge = document.getElementById('results-badge');
  badge.className  = `results-badge badge-${type}`;
  badge.textContent = text;
}

// ── Colorización del output ───────────────────────────────────────────────────
function colorize(text) {
  return text.split('\n').map(line => {
    const safe = escHtml(line);
    if (/\[H\]|ALUCINACI|FABRICAD|\bERROR\b|error:/i.test(line))
      return `<span class="line-error">${safe}</span>`;
    if (/^\s*(✓|\[OK\]|OK:|Sin inconsistencias|IGUAL\b)/i.test(line))
      return `<span class="line-ok">${safe}</span>`;
    if (/\[W\]|\bWARN\b|⚠|\bCAMBI|\bNUEVO\b|\bELIMINAD|\bhallazgo/i.test(line))
      return `<span class="line-warn">${safe}</span>`;
    if (/^[=─]{3,}/.test(line) || /^#{1,3}\s/.test(line))
      return `<span class="line-heading">${safe}</span>`;
    return `<span>${safe}</span>`;
  }).join('\n');
}

// ── Utilidades ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
