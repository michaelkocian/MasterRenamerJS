// ===== Rename Diagnostics =====
import { getState } from './state.js';

const INVALID_CHAR_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/;
const RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function getNameProblems(name) {
    const problems = [];
    const normalized = name ?? '';

    if (normalized.length === 0) {
        problems.push('Name cannot be empty');
        return problems;
    }

    if (normalized === '.' || normalized === '..') {
        problems.push('Reserved relative names are not allowed');
    }

    if (INVALID_CHAR_PATTERN.test(normalized)) {
        problems.push('Contains invalid Windows filename characters');
    }

    if (/[ .]$/.test(normalized)) {
        problems.push('Cannot end with a space or dot');
    }

    if (RESERVED_NAME_PATTERN.test(normalized)) {
        problems.push('Reserved Windows device name');
    }

    return problems;
}

export function buildTargetPath(file, newName) {
    const lastSlash = file.path.lastIndexOf('/');
    if (lastSlash === -1) return newName;
    return file.path.substring(0, lastSlash + 1) + newName;
}

export function getRenameDiagnostics() {
    const { allFiles, currentNames } = getState();
    const byIndex = new Map();
    const pathOwners = new Map();

    for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        const name = currentNames[i] ?? file.name;
        const problems = getNameProblems(name);
        const targetPath = buildTargetPath(file, name);

        byIndex.set(i, {
            index: i,
            file,
            targetName: name,
            targetPath,
            invalid: problems.length > 0,
            conflict: false,
            problems: [...problems],
        });

        if (!pathOwners.has(targetPath)) {
            pathOwners.set(targetPath, []);
        }
        pathOwners.get(targetPath).push(i);
    }

    for (const indices of pathOwners.values()) {
        if (indices.length < 2) continue;
        for (const index of indices) {
            const entry = byIndex.get(index);
            entry.conflict = true;
            entry.problems.push('Conflicts with another target path');
        }
    }

    const issues = Array.from(byIndex.values()).filter(entry => entry.invalid || entry.conflict);
    return { byIndex, issues };
}

export function getPreviewDiagnostics(globalIndex, nextName) {
    const { allFiles, currentNames } = getState();
    const file = allFiles[globalIndex];
    if (!file) {
        return { invalid: true, conflict: false, problems: ['Unknown file'], targetPath: '' };
    }

    const problems = getNameProblems(nextName);
    const targetPath = buildTargetPath(file, nextName);
    let conflict = false;

    for (let i = 0; i < allFiles.length; i++) {
        if (i === globalIndex) continue;
        const otherTargetPath = buildTargetPath(allFiles[i], currentNames[i] ?? allFiles[i].name);
        if (otherTargetPath === targetPath) {
            conflict = true;
            break;
        }
    }

    if (conflict) {
        problems.push('Conflicts with another target path');
    }

    return {
        invalid: problems.length > 0 && !conflict ? true : problems.some(problem => problem !== 'Conflicts with another target path'),
        conflict,
        problems,
        targetPath,
    };
}

export function getBlockingRenameIssues() {
    return getRenameDiagnostics().issues;
}