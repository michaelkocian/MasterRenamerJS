// ===== Folder Loading Panel =====
import { getState, onStateChange } from './state.js';
import {
    cancelFolderLoad,
    isFolderLoadActive,
    openFolderPicker,
    pauseFolderLoad,
    resumeFolderLoad,
} from './fileSystem.js';

let panel = null;
let titleEl = null;
let phaseEl = null;
let depthEl = null;
let filesEl = null;
let foldersEl = null;
let skippedEl = null;
let entriesEl = null;
let rateEl = null;
let messageEl = null;
let pathEl = null;
let toggleBtn = null;

export function initLoadingPanel() {
    panel = document.getElementById('load-status-panel');
    titleEl = document.getElementById('load-status-title');
    phaseEl = document.getElementById('load-status-phase');
    depthEl = document.getElementById('load-status-depth');
    filesEl = document.getElementById('load-status-files');
    foldersEl = document.getElementById('load-status-folders');
    skippedEl = document.getElementById('load-status-skipped');
    entriesEl = document.getElementById('load-status-entries');
    rateEl = document.getElementById('load-status-rate');
    messageEl = document.getElementById('load-status-message');
    pathEl = document.getElementById('load-status-path');
    toggleBtn = document.getElementById('btn-load-toggle');

    toggleBtn.addEventListener('click', handleToggleLoading);
    document.getElementById('btn-load-stop').addEventListener('click', () => cancelFolderLoad());
    document.getElementById('btn-load-reselect').addEventListener('click', handleReselectFolder);

    onStateChange('scan-progress', renderLoadingPanel);
    renderLoadingPanel();
}

function renderLoadingPanel() {
    const { scan, directoryHandle } = getState();
    const isVisible = scan.isLoading || scan.isPaused;

    panel.classList.toggle('hidden', !isVisible);
    if (!isVisible) {
        return;
    }

    titleEl.textContent = directoryHandle ? `Loading ${directoryHandle.name}` : 'Loading folder';
    phaseEl.textContent = scan.isPaused ? 'Paused' : 'Loading';
    phaseEl.classList.toggle('is-paused', scan.isPaused);

    depthEl.classList.toggle('hidden', !scan.depthLimitHit);
    depthEl.textContent = `Depth limit ${scan.maxDepth} reached in ${scan.depthLimitCount} folder${scan.depthLimitCount !== 1 ? 's' : ''}`;

    filesEl.textContent = `${scan.filesLoaded} file${scan.filesLoaded !== 1 ? 's' : ''}`;
    foldersEl.textContent = `${scan.foldersLoaded} folder${scan.foldersLoaded !== 1 ? 's' : ''}`;
    skippedEl.classList.toggle('hidden', scan.skippedFolders === 0);
    skippedEl.textContent = `${scan.skippedFolders} inaccessible folder${scan.skippedFolders !== 1 ? 's' : ''} skipped`;
    entriesEl.textContent = `${scan.entriesScanned} entr${scan.entriesScanned === 1 ? 'y' : 'ies'} scanned`;
    rateEl.textContent = `${scan.scanRate.toFixed(1)} files/s`;
    messageEl.textContent = scan.message || 'Scanning...';
    pathEl.textContent = scan.currentPath || 'Waiting for the next entry...';
    toggleBtn.textContent = scan.isPaused ? 'Continue' : 'Pause';
}

function handleToggleLoading() {
    const { scan } = getState();
    if (scan.isPaused) {
        resumeFolderLoad();
        return;
    }

    pauseFolderLoad();
}

async function handleReselectFolder() {
    const shouldResume = isFolderLoadActive() && !getState().scan.isPaused;

    if (shouldResume) {
        pauseFolderLoad();
    }

    const handle = await openFolderPicker();
    if (!handle && shouldResume) {
        resumeFolderLoad();
    }
}