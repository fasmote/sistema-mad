'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PREFS_FILE   = path.join(app.getPath('userData'), 'mad-gui-prefs.json');

// ── Preferences (persiste última carpeta de guardado) ─────────────────────────
function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')); }
  catch { return {}; }
}
function savePrefs(prefs) {
  try { fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf8'); }
  catch (e) { console.error('mad-gui: no se pudieron guardar preferencias:', e.message); }
}

// ── Ventana principal ─────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'MAD Tools',
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    show: false,
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC: cargar configuración ─────────────────────────────────────────────────
ipcMain.handle('get-config', () => {
  const p = path.join(__dirname, 'tools-config.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
});

// ── IPC: diálogos de selección ────────────────────────────────────────────────
ipcMain.handle('select-folder', async (_, startDir) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: startDir || undefined,
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('select-files', async (_, startDir) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
    defaultPath: startDir || undefined,
  });
  return canceled ? [] : filePaths;
});

// ── IPC: ejecutar herramienta ─────────────────────────────────────────────────
ipcMain.handle('run-tool', (_, { command, args }) => {
  return new Promise((resolve) => {
    const scriptPath = path.join(PROJECT_ROOT, command);

    if (!fs.existsSync(scriptPath)) {
      resolve({
        output: '',
        exitCode: null,
        isError: true,
        errorMessage: `Archivo no encontrado:\n${scriptPath}`,
      });
      return;
    }

    let stdout = '';
    let stderr = '';

    const proc = spawn('node', [scriptPath, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
    });

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('error', err => {
      resolve({
        output: '',
        exitCode: null,
        isError: true,
        errorMessage: `No se pudo ejecutar node.js:\n${err.message}`,
      });
    });

    proc.on('close', code => {
      // exit 0 = sin hallazgos; exit 1 = hallazgos encontrados — AMBOS son salidas normales.
      // isError = true solo si el proceso no pudo correr en absoluto (code === null).
      const fullOutput = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
      resolve({
        output: fullOutput,
        exitCode: code,
        isError: code === null,
        errorMessage: code === null
          ? `El proceso terminó inesperadamente.\n${stderr}`
          : null,
      });
    });
  });
});

// ── IPC: diálogo de guardado (recuerda última carpeta) ────────────────────────
ipcMain.handle('save-dialog', async (_, { defaultName }) => {
  const prefs = loadPrefs();
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Guardar reporte',
    defaultPath: path.join(
      prefs.lastSaveDir || app.getPath('documents'),
      defaultName,
    ),
    filters: [
      { name: 'Markdown',    extensions: ['md']   },
      { name: 'Texto plano', extensions: ['txt']  },
      { name: 'PDF',         extensions: ['pdf']  },
      { name: 'Excel',       extensions: ['xlsx'] },
    ],
  });
  if (canceled || !filePath) return null;
  prefs.lastSaveDir = path.dirname(filePath);
  savePrefs(prefs);
  return filePath;
});

// ── IPC: escribir resultado al disco ──────────────────────────────────────────
ipcMain.handle('write-result', async (_, { filePath, text }) => {
  const clean = stripAnsi(text);
  const ext   = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.md' || ext === '.txt') {
      fs.writeFileSync(filePath, clean, 'utf8');
    } else if (ext === '.pdf') {
      await writePdf(filePath, clean);
    } else if (ext === '.xlsx') {
      await writeXlsx(filePath, clean);
    } else {
      fs.writeFileSync(filePath, clean, 'utf8');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
}

function writePdf(filePath, text) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const ws  = fs.createWriteStream(filePath);
    doc.pipe(ws);
    doc.font('Courier').fontSize(8.5);

    for (const line of text.split('\n')) {
      const isHeading = /^[=─]{3,}/.test(line) || /^#{1,3}\s/.test(line);
      if (isHeading) {
        doc.font('Courier-Bold').fontSize(9.5).text(line, { continued: false });
        doc.font('Courier').fontSize(8.5);
      } else {
        doc.text(line, { continued: false });
      }
    }

    doc.end();
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

async function writeXlsx(filePath, text) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reporte');
  const lines = text.split('\n');

  // Detectar tabla Markdown con separadores de pipe
  const pipeRows = lines.filter(l => /^\s*\|.+\|/.test(l));
  if (pipeRows.length >= 3) {
    const dataRows = pipeRows.filter(l => !/^\s*\|[\s\-:|]+\|/.test(l));
    dataRows.forEach((line, idx) => {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      const row   = ws.addRow(cells);
      if (idx === 0) {
        row.eachCell(cell => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } };
        });
      }
    });
    ws.columns.forEach(col => { col.width = 35; });
  } else {
    ws.getColumn(1).width = 120;
    lines.forEach(line => ws.addRow([line]));
  }

  await wb.xlsx.writeFile(filePath);
}
