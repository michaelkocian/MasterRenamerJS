// ===== File System Access API =====
import {
    appendFiles,
    beginFolderLoad,
    finishFolderLoad,
    getState,
    setDepthLimitedPaths,
    updateScanProgress,
} from './state.js';
import { reportError, reportWarning } from './errorReporter.js';

const MAX_SCAN_DEPTH = 10;
const FILE_BATCH_SIZE = 100;
const ENTRY_PUBLISH_INTERVAL = 150;

let activeScanController = null;

export async function openFolderPicker() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });

        if (activeScanController) {
            cancelFolderLoad();
        }

        startFolderLoad(handle);
        return handle;
    } catch (err) {
        if (err.name !== 'AbortError') {
            reportError('Failed to open folder', err);
        }
        return null;
    }
}

export function pauseFolderLoad() {
    if (!activeScanController || activeScanController.cancelled || activeScanController.paused) return false;

    activeScanController.paused = true;
    updateScanProgress({
        isPaused: true,
        message: 'Loading paused',
    });
    return true;
}

export function resumeFolderLoad() {
    if (!activeScanController || activeScanController.cancelled || !activeScanController.paused) return false;

    activeScanController.paused = false;
    releaseScanWaiters(activeScanController);

    updateScanProgress({
        isPaused: false,
        message: `Scanning ${getState().directoryHandle ? getState().directoryHandle.name : 'folder'}...`,
    });
    return true;
}

export function cancelFolderLoad() {
    if (!activeScanController || activeScanController.cancelled) return false;

    activeScanController.cancelled = true;
    activeScanController.paused = false;
    releaseScanWaiters(activeScanController);
    finishFolderLoad({
        message: 'Loading stopped - partial results kept',
        hasPartialResults: getState().allFiles.length > 0,
    });
    activeScanController = null;
    return true;
}

export function isFolderLoadActive() {
    return Boolean(activeScanController && !activeScanController.cancelled);
}

function sortByTypeAndName(a, b) {
    if (a.kind !== b.kind) {
        return a.kind === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
}

function createFileEntry(handle, parentHandle, path) {
    return {
        handle,
        parentHandle,
        name: handle.name,
        path,
    };
}

export async function renameFile(fileEntry, newName) {
    try {
        const file = await fileEntry.handle.getFile();
        const contents = await file.arrayBuffer();

        const parentHandle = fileEntry.parentHandle;
        await ensurePermission(parentHandle, 'readwrite');
        const newHandle = await parentHandle.getFileHandle(newName, { create: true });
        await ensurePermission(newHandle, 'readwrite');
        const writable = await newHandle.createWritable();
        await writable.write(contents);
        await writable.close();

        if (newName !== fileEntry.name) {
            await parentHandle.removeEntry(fileEntry.name);
        }

        fileEntry.handle = newHandle;
        fileEntry.name = newName;
        fileEntry.path = rebuildPath(fileEntry.path, newName);

        return true;
    } catch (err) {
        reportError(`Failed to rename ${fileEntry.name} to ${newName}`, err);
        return false;
    }
}

export async function readTextFile(fileEntry) {
    try {
        if (!fileEntry || !fileEntry.handle) {
            return { ok: false, reason: 'No file selected' };
        }

        const file = await fileEntry.handle.getFile();
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        if (!isTextLikeFile(file.name, file.type, bytes)) {
            return {
                ok: false,
                reason: `${file.name} does not look like a text file`,
            };
        }

        const encodingInfo = detectTextEncoding(bytes);
        return {
            ok: true,
            text: decodeTextBytes(bytes, encodingInfo),
            encoding: encodingInfo.encoding,
            hasBom: encodingInfo.hasBom,
        };
    } catch (err) {
        reportError(`Failed to read ${fileEntry && fileEntry.name ? fileEntry.name : 'file'}`, err);
        return { ok: false, reason: 'Read failed' };
    }
}

export async function writeTextFile(fileEntry, text, options = {}) {
    try {
        if (!fileEntry || !fileEntry.handle) {
            return false;
        }

        await ensurePermission(fileEntry.handle, 'readwrite');
        const writable = await fileEntry.handle.createWritable();
        await writable.write(encodeTextBytes(text, options.encoding || 'utf-8', Boolean(options.hasBom)));
        await writable.close();
        return true;
    } catch (err) {
        reportError(`Failed to save ${fileEntry && fileEntry.name ? fileEntry.name : 'file'}`, err);
        return false;
    }
}

function rebuildPath(oldPath, newName) {
    const lastSlash = oldPath.lastIndexOf('/');
    if (lastSlash === -1) return newName;
    return oldPath.substring(0, lastSlash + 1) + newName;
}

function isTextLikeFile(fileName, mimeType, bytes) {
    if (mimeType && mimeType.startsWith('text/')) {
        return true;
    }

    const textExtensions = new Set([
        'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'htm', 'xml', 'yml', 'yaml',
        'csv', 'log', 'ini', 'cfg', 'conf', 'bat', 'ps1', 'sh', 'py', 'java', 'c', 'cc', 'cpp',
        'cs', 'go', 'rs', 'php', 'rb', 'sql', 'svg', 'toml', 'lock', 'gitignore'
    ]);
    const extension = extractExtension(fileName);
    if (extension && textExtensions.has(extension)) {
        return true;
    }

    if (!bytes || bytes.length === 0) {
        return true;
    }

    let controlCount = 0;
    const sampleLength = Math.min(bytes.length, 8192);
    for (let i = 0; i < sampleLength; i++) {
        const value = bytes[i];
        if (value === 0) {
            return false;
        }

        const isControl = value < 32 && value !== 9 && value !== 10 && value !== 13 && value !== 12;
        if (isControl) {
            controlCount++;
        }
    }

    return controlCount / sampleLength < 0.1;
}

function extractExtension(fileName) {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1 || lastDot === fileName.length - 1) {
        return fileName.startsWith('.') ? fileName.substring(1).toLowerCase() : '';
    }
    return fileName.substring(lastDot + 1).toLowerCase();
}

function detectTextEncoding(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return { encoding: 'utf-8', hasBom: true, bomLength: 3 };
    }

    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { encoding: 'utf-16le', hasBom: true, bomLength: 2 };
    }

    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { encoding: 'utf-16be', hasBom: true, bomLength: 2 };
    }

    return { encoding: 'utf-8', hasBom: false, bomLength: 0 };
}

function decodeTextBytes(bytes, encodingInfo) {
    const body = bytes.slice(encodingInfo.bomLength);
    if (encodingInfo.encoding === 'utf-16be') {
        return new TextDecoder('utf-16le').decode(swapBytePairs(body));
    }
    return new TextDecoder(encodingInfo.encoding).decode(body);
}

function encodeTextBytes(text, encoding, hasBom) {
    if (encoding === 'utf-16le' || encoding === 'utf-16be') {
        const body = encodeUtf16(text, encoding === 'utf-16be');
        if (!hasBom) {
            return body;
        }

        const bom = encoding === 'utf-16be'
            ? new Uint8Array([0xfe, 0xff])
            : new Uint8Array([0xff, 0xfe]);
        return concatBytes(bom, body);
    }

    const body = new TextEncoder().encode(text);
    if (!hasBom) {
        return body;
    }

    return concatBytes(new Uint8Array([0xef, 0xbb, 0xbf]), body);
}

function encodeUtf16(text, bigEndian) {
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
        const codeUnit = text.charCodeAt(i);
        const offset = i * 2;
        if (bigEndian) {
            bytes[offset] = codeUnit >> 8;
            bytes[offset + 1] = codeUnit & 0xff;
        } else {
            bytes[offset] = codeUnit & 0xff;
            bytes[offset + 1] = codeUnit >> 8;
        }
    }
    return bytes;
}

function swapBytePairs(bytes) {
    const swapped = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 2) {
        swapped[i] = bytes[i + 1] ?? 0;
        swapped[i + 1] = bytes[i] ?? 0;
    }
    return swapped;
}

function concatBytes(left, right) {
    const result = new Uint8Array(left.length + right.length);
    result.set(left, 0);
    result.set(right, left.length);
    return result;
}

export function buildFolderTree(files) {
    const root = { name: '', children: new Map(), files: [] };

    const { depthLimitedPaths } = getState();

    for (const file of files) {
        insertFileIntoTree(root, file);
    }

    for (const path of depthLimitedPaths) {
        insertDepthLimitedFolder(root, path);
    }

    return root;
}

function insertFileIntoTree(root, file) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        if (!current.children.has(folderName)) {
            current.children.set(folderName, {
                name: folderName,
                children: new Map(),
                files: [],
                path: parts.slice(0, i + 1).join('/'),
            });
        }
        current = current.children.get(folderName);
    }

    current.files.push(file);
}

function insertDepthLimitedFolder(root, folderPath) {
    const parts = folderPath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
        const folderName = parts[i];
        if (!current.children.has(folderName)) {
            current.children.set(folderName, {
                name: folderName,
                children: new Map(),
                files: [],
                path: parts.slice(0, i + 1).join('/'),
                isDepthLimited: false,
            });
        }
        current = current.children.get(folderName);
    }

    current.isDepthLimited = true;
}

function startFolderLoad(handle) {
    const controller = createScanController();
    activeScanController = controller;
    beginFolderLoad(handle, MAX_SCAN_DEPTH);
    void runFolderScan(handle, controller);
}

async function runFolderScan(handle, controller) {
    const batch = [];
    const depthLimitedPaths = new Set();
    const progress = {
        filesLoaded: 0,
        foldersLoaded: 1,
        skippedFolders: 0,
        entriesScanned: 0,
        depthLimitHit: false,
        depthLimitCount: 0,
        currentPath: handle.name,
        message: `Scanning ${handle.name}...`,
        isPaused: false,
    };

    try {
        await scanDirectory(handle, '', 0, handle, controller, batch, depthLimitedPaths, progress);
        await publishBatch(batch, depthLimitedPaths, progress, true);

        if (activeScanController !== controller || controller.cancelled) {
            return;
        }

        finishFolderLoad({
            ...progress,
            message: progress.depthLimitHit
                ? `Loaded ${progress.filesLoaded} files with depth capped at ${MAX_SCAN_DEPTH}`
                : `Loaded ${progress.filesLoaded} files`,
        });

        if (progress.skippedFolders > 0) {
            reportWarning(
                `Skipped ${progress.skippedFolders} inaccessible folder${progress.skippedFolders !== 1 ? 's' : ''} while scanning ${handle.name}`,
                null,
                { duration: 6500 }
            );
        }

        activeScanController = null;
    } catch (err) {
        if (controller.cancelled) {
            return;
        }

        reportError('Failed to scan folder', err);
        finishFolderLoad({
            ...progress,
            message: 'Loading failed',
        });
        activeScanController = null;
    }
}

async function scanDirectory(dirHandle, parentPath, depth, parentHandle, controller, batch, depthLimitedPaths, progress) {
    const entries = await readDirectoryEntries(dirHandle, parentPath, progress);
    if (!entries) {
        return;
    }

    entries.sort((a, b) => sortByTypeAndName(a, b));

    for (const entry of entries) {
        if (!await waitIfPaused(controller)) {
            return;
        }

        if (controller.cancelled) {
            return;
        }

        const entryPath = parentPath
            ? `${parentPath}/${entry.name}`
            : entry.name;

        progress.currentPath = entryPath;
        progress.entriesScanned++;

        if (entry.kind === 'file') {
            batch.push(createFileEntry(entry, parentHandle, entryPath));
            progress.filesLoaded++;
        } else if (entry.kind === 'directory') {
            const nextDepth = depth + 1;
            if (nextDepth > MAX_SCAN_DEPTH) {
                depthLimitedPaths.add(entryPath);
                progress.depthLimitHit = true;
                progress.depthLimitCount = depthLimitedPaths.size;
            } else {
                progress.foldersLoaded++;
                await scanDirectory(entry, entryPath, nextDepth, entry, controller, batch, depthLimitedPaths, progress);
                if (controller.cancelled) {
                    return;
                }
            }
        }

        if (batch.length >= FILE_BATCH_SIZE || progress.entriesScanned % ENTRY_PUBLISH_INTERVAL === 0) {
            await publishBatch(batch, depthLimitedPaths, progress);
        }
    }
}

async function publishBatch(batch, depthLimitedPaths, progress, force = false) {
    if (!batch.length && !force) {
        updateScanProgress(progress);
        return;
    }

    const files = batch.splice(0, batch.length);
    appendFiles(files);
    setDepthLimitedPaths(Array.from(depthLimitedPaths).sort());
    updateScanProgress(progress);
    await yieldToBrowser();
}

function createScanController() {
    return {
        cancelled: false,
        paused: false,
        waiters: [],
    };
}

function releaseScanWaiters(controller) {
    const waiters = controller.waiters.splice(0);
    waiters.forEach(resolve => resolve());
}

async function waitIfPaused(controller) {
    while (controller.paused && !controller.cancelled) {
        await new Promise(resolve => controller.waiters.push(resolve));
    }

    return !controller.cancelled;
}

function yieldToBrowser() {
    return new Promise(resolve => window.setTimeout(resolve, 0));
}

async function readDirectoryEntries(dirHandle, parentPath, progress) {
    const entries = [];

    try {
        for await (const entry of dirHandle.values()) {
            entries.push(entry);
        }
        return entries;
    } catch (err) {
        if (!parentPath || !isRecoverableDirectoryAccessError(err)) {
            throw err;
        }

        progress.skippedFolders++;
        progress.message = `Skipped inaccessible folder: ${parentPath}`;

        if (progress.skippedFolders <= 3) {
            reportWarning(`Skipped inaccessible folder: ${parentPath}`, err);
        } else if (progress.skippedFolders === 4) {
            reportWarning('Additional inaccessible folders are being skipped during scan', err);
        }

        return null;
    }
}

function isRecoverableDirectoryAccessError(err) {
    return [
        'NoModificationAllowedError',
        'NotAllowedError',
        'SecurityError',
        'InvalidStateError',
    ].includes(err && err.name);
}

async function ensurePermission(handle, mode) {
    if (!handle || !handle.queryPermission || !handle.requestPermission) {
        return;
    }

    const permission = await handle.queryPermission({ mode });
    if (permission === 'granted') {
        return;
    }

    const requested = await handle.requestPermission({ mode });
    if (requested !== 'granted') {
        throw new DOMException(`Permission ${mode} denied`, 'NotAllowedError');
    }
}
