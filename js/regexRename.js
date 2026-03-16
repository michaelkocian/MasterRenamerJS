// ===== Regex Rename =====
import { getState } from './state.js';

export function applyRegexRename(pattern, replacement, isRegex, caseSensitive) {
    const { visibleFiles, allFiles, currentNames, pathMode } = getState();
    const regex = buildRegex(pattern, isRegex, caseSensitive);
    if (!regex) return null;
    const normalizedReplacement = isRegex ? normalizeRegexReplacement(replacement) : replacement;

    const updatedNames = [...currentNames];
    let matchCount = 0;

    for (const file of visibleFiles) {
        const globalIndex = allFiles.indexOf(file);
        if (globalIndex === -1) continue;

        const currentName = currentNames[globalIndex];
        const displayName = pathMode !== 'name'
            ? rebuildPathDisplay(file.path, currentName)
            : currentName;

        const result = applyReplacement(displayName, regex, normalizedReplacement);

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

function normalizeRegexReplacement(text) {
    return String(text).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|n|r|t|f|v|0|\\)/g, (_, escapeCode) => {
        switch (escapeCode) {
        case 'n':
            return '\n';
        case 'r':
            return '\r';
        case 't':
            return '\t';
        case 'f':
            return '\f';
        case 'v':
            return '\v';
        case '0':
            return '\0';
        case '\\':
            return '\\';
        default:
            if (escapeCode.startsWith('u')) {
                return String.fromCharCode(parseInt(escapeCode.slice(1), 16));
            }
            if (escapeCode.startsWith('x')) {
                return String.fromCharCode(parseInt(escapeCode.slice(1), 16));
            }
            return escapeCode;
        }
    });
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
