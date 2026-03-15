// ===== File System Access API =====
import { getState, setFiles, setDirectoryHandle, setVisibleFiles } from './state.js';

export async function openFolderPicker() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        setDirectoryHandle(handle);
        const files = await scanDirectory(handle, '');
        setFiles(files);
        setVisibleFiles(files);
        return handle;
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Failed to open folder:', err);
        }
        return null;
    }
}

async function scanDirectory(dirHandle, parentPath) {
    const files = [];
    const entries = [];

    for await (const entry of dirHandle.values()) {
        entries.push(entry);
    }

    entries.sort((a, b) => sortByTypeAndName(a, b));

    for (const entry of entries) {
        const entryPath = parentPath
            ? `${parentPath}/${entry.name}`
            : entry.name;

        if (entry.kind === 'file') {
            files.push(createFileEntry(entry, dirHandle, entryPath));
        } else if (entry.kind === 'directory') {
            const childFiles = await scanDirectory(entry, entryPath);
            files.push(...childFiles);
        }
    }

    return files;
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
        const newHandle = await parentHandle.getFileHandle(newName, { create: true });
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
        console.error(`Failed to rename "${fileEntry.name}" → "${newName}":`, err);
        return false;
    }
}

function rebuildPath(oldPath, newName) {
    const lastSlash = oldPath.lastIndexOf('/');
    if (lastSlash === -1) return newName;
    return oldPath.substring(0, lastSlash + 1) + newName;
}

export function buildFolderTree(files) {
    const root = { name: '', children: new Map(), files: [] };

    for (const file of files) {
        insertFileIntoTree(root, file);
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
