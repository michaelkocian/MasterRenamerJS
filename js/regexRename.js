// ===== Regex Rename =====
import { getState } from './state.js';

export function applyRegexRename(pattern, replacement, isRegex, caseSensitive) {
    const { visibleFiles, allFiles, currentNames, pathMode } = getState();
    const regex = buildRegex(pattern, isRegex, caseSensitive);
    if (!regex) return null;

    const updatedNames = [...currentNames];
    let matchCount = 0;

    for (const file of visibleFiles) {
        const globalIndex = allFiles.indexOf(file);
        if (globalIndex === -1) continue;

        const currentName = currentNames[globalIndex];
        const displayName = pathMode !== 'name'
            ? rebuildPathDisplay(file.path, currentName)
            : currentName;

        const result = applyReplacement(displayName, regex, replacement);

        if (result.changed) {
            updatedNames[globalIndex] = rebuildFullName(
                file, result.newName, pathMode
            );
            matchCount++;
        }
    }

    return { updatedNames, matchCount };
}

function buildRegex(pattern, isRegex, caseSensitive) {
    if (!pattern) return null;

    try {
        const flags = caseSensitive ? 'g' : 'gi';
        if (isRegex) {
            return new RegExp(pattern, flags);
        }
        return new RegExp(escapeRegex(pattern), flags);
    } catch {
        return null;
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rebuildPathDisplay(originalPath, currentName) {
    const lastSlash = originalPath.lastIndexOf('/');
    if (lastSlash === -1) return currentName;
    return originalPath.substring(0, lastSlash + 1) + currentName;
}

function applyReplacement(name, regex, replacement) {
    const newName = name.replace(regex, replacement);
    return {
        newName,
        changed: newName !== name,
    };
}

function rebuildFullName(file, newDisplayName, pathMode) {
    if (pathMode !== 'name') {
        const lastSlash = newDisplayName.lastIndexOf('/');
        return lastSlash >= 0
            ? newDisplayName.substring(lastSlash + 1)
            : newDisplayName;
    }
    return newDisplayName;
}

export function previewRegexMatches(pattern, isRegex, caseSensitive, lines) {
    const regex = buildRegex(pattern, isRegex, caseSensitive);
    if (!regex) return [];

    return lines.map(line => {
        const matches = [];
        let match;
        const localRegex = new RegExp(regex.source, regex.flags);
        while ((match = localRegex.exec(line)) !== null) {
            matches.push({ start: match.index, length: match[0].length });
            if (!localRegex.global) break;
        }
        return matches;
    });
}

export function isValidRegex(pattern) {
    try {
        new RegExp(pattern);
        return true;
    } catch {
        return false;
    }
}
