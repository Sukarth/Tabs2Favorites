# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-05-07

### Added
- **Core Functionality:**
    - Save selected browser tabs to a new or existing bookmark folder.
    - Option to create a new folder for saved tabs or save directly into a selected existing folder.
    - Dialog for selecting destination bookmark folder and naming new folder.
- **User Interface:**
    - Interactive bookmark folder tree view in the save dialog.
    - "Expand All" / "Collapse All" controls for the folder tree.
    - Displays the path of the selected destination folder.
    - Light and Dark theme support, respecting system preference and syncing choice across devices.
    - Status messages for loading, errors, and success.
    - Dialog window position and size are remembered across sessions.
- **Access Methods:**
    - Context menu option ("Save selected tabs to Favorites").
    - Context menu option ("Save selected tabs to Favorites and close them").
    - Keyboard shortcut `Alt+3` (Mac: `Alt+3`) to "Save selected tabs".
    - Keyboard shortcut `Alt+4` (Mac: `Alt+4`) to "Save selected tabs and close them".
- **Error Handling & Notifications:**
    - Notifications for successful saves, errors during saving, and invalid operations (e.g., not enough tabs selected for shortcuts).
    - Clear error messages within the save dialog.
- **Technical:**
    - Uses Manifest V3.
    - Permissions: `tabs`, `bookmarks`, `contextMenus`, `storage`, `notifications`, `system.display`.
    - Code refactoring for clarity and maintainability.
    - Comprehensive comments in JavaScript, HTML, and CSS files.
    - MIT License.