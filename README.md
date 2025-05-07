# Tabs2Favorites Browser Extension

Save selected browser tabs into a new or existing bookmark folder quickly and easily, with an option to also close them after bookmarking.

## Features

* **Save Multiple Tabs:** Select two or more tabs in your browser window.
* **Context Menu Integration:** Right-click on any page within the selected tabs to access the save options.
* **Choose Destination:**
  * Save tabs into a **new folder** (you provide the name)
  * Save tabs directly into an **existing bookmark folder** selected from a tree view.
* **Optional Tab Closing:** Choose to automatically close the selected tabs after they are successfully bookmarked.
* **Persistent Dialog State:** The save dialog remembers its last position and size.
* **Theme Aware:** The dialog respects your system's light or dark mode preference.
* **Completely Open Source:** Available on GitHub under the MIT license. Feel free to explore the code, contribute, or report issues on our [GitHub repository](https://github.com/Sukarth/Tabs2Favorites).

## How to Use

1. **Select Tabs:**  
    * Hold ` Ctrl ` (or ` Cmd ` on Mac) and click on individual tabs to select or deselect them one by one.  
    * Hold ` Shift ` and click on another tab to select a range of tabs between the currently active tab and the one you click.  
    * You need to select at least two tabs.
2. **Right-Click:** Right-click anywhere inside the content of the last selected web page/tab.
3. **Choose Action:**
   * Select "**Save selected tabs to Favorites**" from the context menu, or...
   * Select "**Save selected tabs to Favorites and close them**" if you want the tabs closed after saving.
4. **Save Dialog:** A dialog window will appear.
   * **Choose Mode:** Select "Create New Folder" or "Save to Existing Folder".
   * **Folder Name:** If creating a new folder, enter a name (defaults to "Saved Tabs [Date/Time]").
   * **Select Location:** Click on a folder in the tree view to choose where the new folder (or the bookmarks themselves, if saving directly) should be placed (defaults to Other Favorites).
   * **Confirm:** Click "**Save Tabs**".
5. **Confirmation:** A notification will appear confirming the success or failure of the operation.

## Installation

### From Chrome Web Store (Recommended)

* [Link to Chrome Web Store Listing - *To be added once published*]

### Manual Installation (for Development/Testing)

1. Download the extension files (or clone this repository).
2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle the "Developer mode" switch in the top-right corner.
4. Click the "Load unpacked" button.
5. Navigate to and select the folder containing the extension's files.
6. The "Tabs2Favorites" extension should now appear in your list of extensions and be active.

## Development and contributions

Contributions, issues, feedback and feature requests are welcome. Please also  feel free to fork the repository and submit a pull request.

### Files

* `manifest.json`: The extension manifest file, defining permissions, background scripts, icons, etc.
* `background.js`: The service worker script that handles context menu creation, tab selection logic, bookmarking operations, and communication with the save dialog.
* `save_dialog.html`: The HTML structure for the popup dialog window.
* `save_dialog.css`: Styles for the save dialog window, including light and dark themes.
* `save_dialog.js`: JavaScript for the save dialog window, handling UI interactions, theme application, bookmark tree display, and communication with the background script.
* `icons/`: Folder containing extension icons.

### Notes

* The extension tracks the last two tab selections because clicking the context menu often changes the active selection to a single tab. The logic uses the selection *before* the context menu click.
* The save dialog's position and size are persisted in `chrome.storage.local`.
* The background script listens for `chrome.windows.onBoundsChanged` to save the dialog state, making it more robust than relying on dialog-internal events for this.
* Error handling is included for most operations, with notifications shown to the user.

### Future Enhancements (Ideas)

* More robust theme detection and manual theme switching.
* Internationalization (i18n) for UI strings.
* Option to customize the default new folder name format.
* Improved styling and UI for the save dialog.


## License

This project is licensed under the [MIT License](LICENSE).

---

Made with ❤️ by Sukarth Acharya
