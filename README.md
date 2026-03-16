# Master Renamer
Visit the [renamer here](https://michaelkocian.github.io/MasterRenamerJS/)

A browser-based bulk file renaming tool built with vanilla JavaScript and the File System Access API.

## Features

- **Folder explorer** — Browse and navigate your folder tree; select any subfolder to scope your view
- **Progressive folder loading** — See live counts while folders stream into the app, including files loaded, folders scanned, current path, and scan speed
- **Pause / resume / reselect** — Pause a large scan, keep partial results, stop early, or pick a different folder without waiting for the current walk to finish
- **Depth safety cap** — Folder scanning stops after 10 nested levels and marks capped branches in the UI and tree so very deep paths do not hang the app
- **Inline text editor** — Edit file names directly in a code-editor-style interface with line numbers, caret, and block (rectangular) selection
- **Regex find & replace** — Search with plain text or regular expressions, preview matches with highlighting, and apply bulk renames
- **Diff preview** — Five display modes to visualize changes: new name, added highlights, full change markers, inline delete lines, or original name
- **Compare dialog** — Review all pending changes side-by-side before committing
- **Duplicate detection** — Blocks saving when renames would create conflicting file paths
- **Sort & filter** — Sort by name or extension, filter by files only, files & folders, or recursive
- **Path modes** — View and edit using file name only, relative path, or full path
- **Light / Dark theme** — Toggle between themes; preference is remembered
- **Zero dependencies** — No build step, no frameworks — just open `index.html` in a modern browser

## Requirements

A browser that supports the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (Chrome, Edge, Opera).

## Usage

1. Open `index.html` in a supported browser
2. Click **Open Folder** and grant read/write access
3. Watch the loading bar if the folder is large; you can pause, stop, or pick another folder while scanning
4. Edit names inline, or use **Search & Replace** for bulk changes
5. Click **Save** to review changes and rename the files on disk
