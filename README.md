# Master Renamer
Visit the [renamer here](https://michaelkocian.github.io/MasterRenamerJS/)

A browser-based bulk file renaming tool built with vanilla JavaScript and the File System Access API.

## Features

- **Folder explorer** — Browse and navigate your folder tree; select any subfolder to scope your view
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
3. Edit names inline, or use **Search & Replace** for bulk changes
4. Click **Save** to review changes and rename the files on disk
