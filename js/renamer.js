// ===== File Renamer =====
import { getState, getChangedFiles, commitRenames } from './state.js';
import { renameFile } from './fileSystem.js';

export async function executeRenames(onProgress) {
    const changes = getChangedFiles();
    if (changes.length === 0) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;

    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        const ok = await renameFile(change.file, change.newName);

        if (ok) {
            success++;
            updateOriginalName(change);
        } else {
            failed++;
        }

        if (onProgress) {
            onProgress(i + 1, changes.length, change, ok);
        }
    }

    if (success > 0) {
        commitRenames();
    }

    return { success, failed };
}

function updateOriginalName(change) {
    const { originalNames } = getState();
    originalNames[change.index] = change.newName;
}
