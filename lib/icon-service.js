'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WeightedLruCache } = require('./icon-cache');
const { isProtocolTarget, protocolName } = require('./shortcut');

const ICON_EXTRACTOR_VERSION = 2;
const DIRECT_IMAGE_EXTENSIONS = new Set(['.ico', '.png', '.jpg', '.jpeg', '.bmp', '.webp']);
const EXECUTABLE_EXTENSIONS = new Set(['.exe', '.dll']);
const MAX_DISK_CACHE_BYTES = 100 * 1024 * 1024;
const MAX_DISK_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function createIconService({ app, nativeImage, extractExecutableIcon, cacheDir, fallbackIcons }) {
  const memory = new WeightedLruCache({ maxEntries: 256, maxBytes: 32 * 1024 * 1024 });
  const inFlight = new Map();
  let disposed = false;
  let diskWrites = 0;

  function pruneDiskCache() {
    let entries;
    try {
      entries = fs.readdirSync(cacheDir)
        .filter((name) => name.endsWith('.txt'))
        .map((name) => {
          const filePath = path.join(cacheDir, name);
          const stat = fs.statSync(filePath);
          return { filePath, size: stat.size, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => a.mtimeMs - b.mtimeMs);
    } catch (err) {
      return;
    }

    const now = Date.now();
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries) {
      if (now - entry.mtimeMs <= MAX_DISK_CACHE_AGE_MS && total <= MAX_DISK_CACHE_BYTES) break;
      try {
        fs.unlinkSync(entry.filePath);
        total -= entry.size;
      } catch (err) {
        /* another process may already have removed it */
      }
    }
  }

  function normalizeRequest(input) {
    if (typeof input === 'string') return { path: input };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { path: '' };
    return {
      path: typeof input.path === 'string' ? input.path : '',
      shortcutPath: typeof input.shortcutPath === 'string' ? input.shortcutPath : '',
      iconPath: typeof input.iconPath === 'string' ? input.iconPath : '',
      iconIndex: Number.isInteger(input.iconIndex) ? input.iconIndex : 0
    };
  }

  function fileFingerprint(filePath) {
    try {
      const stat = fs.statSync(filePath);
      return `${stat.size}:${Math.trunc(stat.mtimeMs)}`;
    } catch (err) {
      return 'missing';
    }
  }

  function requestKey(request) {
    const fields = [request.path, request.shortcutPath, request.iconPath]
      .filter(Boolean)
      .map((value) => {
        if (isProtocolTarget(value)) return value.toLowerCase();
        return `${path.resolve(value).toLowerCase()}@${fileFingerprint(value)}`;
      });
    fields.push(String(request.iconIndex || 0), String(ICON_EXTRACTOR_VERSION));
    return fields.join('|');
  }

  function diskPathForKey(key) {
    return path.join(cacheDir, `${crypto.createHash('sha256').update(key).digest('hex')}.txt`);
  }

  function readDisk(key) {
    try {
      const value = fs.readFileSync(diskPathForKey(key), 'utf8');
      return value.startsWith('data:image/') ? value : '';
    } catch (err) {
      return '';
    }
  }

  function writeDisk(key, value) {
    if (!value.startsWith('data:image/png;base64,') && !value.startsWith('data:image/x-icon;base64,')) return;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(diskPathForKey(key), value, 'utf8');
      diskWrites++;
      if (diskWrites % 32 === 0) pruneDiskCache();
    } catch (err) {
      console.error('Failed to write icon cache:', err.message);
    }
  }

  function imageToDataUrl(image) {
    if (!image || image.isEmpty()) return '';
    return image.toDataURL();
  }

  async function loadCandidate(candidatePath, iconIndex = 0) {
    if (!candidatePath || isProtocolTarget(candidatePath) || !fs.existsSync(candidatePath)) return '';
    const extension = path.extname(candidatePath).toLowerCase();

    if (DIRECT_IMAGE_EXTENSIONS.has(extension)) {
      return imageToDataUrl(nativeImage.createFromPath(candidatePath));
    }

    if (EXECUTABLE_EXTENSIONS.has(extension)) {
      try {
        const base64 = await extractExecutableIcon(candidatePath, iconIndex);
        if (base64) return `data:image/png;base64,${base64}`;
      } catch (err) {
        console.error('Executable icon extraction failed:', err.message);
      }
    }

    try {
      return imageToDataUrl(await app.getFileIcon(candidatePath, { size: 'large' }));
    } catch (err) {
      return '';
    }
  }

  function fallbackFor(request) {
    const protocol = protocolName(request.path);
    if (protocol === 'http' || protocol === 'https') return fallbackIcons.web;
    if (protocol === 'steam') return fallbackIcons.steam || fallbackIcons.web;
    try {
      if (request.path && fs.statSync(request.path).isDirectory()) return fallbackIcons.folder;
    } catch (err) {
      /* missing paths use the generic file icon */
    }
    return fallbackIcons.file;
  }

  async function extract(request) {
    const candidates = [];
    if (request.iconPath) candidates.push([request.iconPath, request.iconIndex]);
    if (request.shortcutPath) candidates.push([request.shortcutPath, 0]);
    if (request.path) candidates.push([request.path, 0]);

    const seen = new Set();
    for (const [candidatePath, iconIndex] of candidates) {
      const key = `${String(candidatePath).toLowerCase()}|${iconIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const icon = await loadCandidate(candidatePath, iconIndex);
      if (icon) return icon;
    }
    return fallbackFor(request);
  }

  async function getIcon(input, { forceRefresh = false } = {}) {
    if (disposed) throw new Error('Icon service is disposed');
    const request = normalizeRequest(input);
    if (!request.path && !request.iconPath && !request.shortcutPath) return fallbackIcons.file;
    const key = requestKey(request);

    if (!forceRefresh) {
      const cached = memory.get(key);
      if (cached) return cached;
      const disk = readDisk(key);
      if (disk) {
        memory.set(key, disk);
        return disk;
      }
    } else {
      memory.delete(key);
      try { fs.unlinkSync(diskPathForKey(key)); } catch (err) { /* cache miss */ }
    }
    if (inFlight.has(key)) return inFlight.get(key);

    const promise = extract(request)
      .then((value) => {
        memory.set(key, value);
        writeDisk(key, value);
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  function clear() {
    memory.clear();
  }

  function dispose() {
    disposed = true;
    memory.clear();
    inFlight.clear();
  }

  function stats() {
    return { entries: memory.size, bytes: memory.bytes, inFlight: inFlight.size };
  }

  pruneDiskCache();
  return { getIcon, clear, dispose, stats };
}

module.exports = {
  createIconService,
  ICON_EXTRACTOR_VERSION,
  MAX_DISK_CACHE_BYTES,
  MAX_DISK_CACHE_AGE_MS
};
