// --- DOM Element References ---
const folderNameInput = document.getElementById('folder-name');
const folderTreeContainer = document.getElementById('folder-tree');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');
const statusDiv = document.getElementById('status'); // For displaying messages/errors to the user.
const expandAllButton = document.getElementById('expand-all');
const collapseAllButton = document.getElementById('collapse-all');
const saveModeRadios = document.querySelectorAll('input[name="save-mode"]');
const selectedPathDisplay = document.getElementById('selected-folder-path').querySelector('span');
const newFolderNameGroup = document.getElementById('new-folder-name-group'); // Container for the folder name input.

// --- State Variables ---
let selectedFolderId = null;        // ID of the bookmark folder selected in the tree.
let selectedFolderTitlePath = 'None'; // Display path of the selected folder.

// --- Theme Handling ---
/**
 * Applies the specified theme (light/dark) to the document's root element.
 * @param {string} theme - The theme to apply, typically 'light' or 'dark'.
 */
function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); }

/**
 * Calculates and applies the theme.
 * It prioritizes a theme stored in `chrome.storage.sync` (if any),
 * otherwise falls back to the system's preferred color scheme.
 * The determined theme is then saved back to `chrome.storage.sync`.
 * @param {boolean} isSystemChange - True if this call is triggered by a system theme change event.
 */
function calculateAndApplyTheme(isSystemChange = false) {
    chrome.storage.sync.get('theme', (result) => {
        const storedTheme = result.theme;
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        let newTheme = systemPrefersDark ? 'dark' : 'light'; // Default to current system preference.

        if (!isSystemChange && storedTheme) {
            // On initial load (not a system change event), if a theme is synced, use it.
            newTheme = storedTheme;
        }
        // If it *is* a system change, `newTheme` is already correctly set to the new system preference.

        applyTheme(newTheme);

        // Save the newly applied theme to sync storage if it's different from what was stored,
        // or if the update was triggered by a system change (to ensure sync reflects system).
        if (storedTheme !== newTheme || isSystemChange) {
            chrome.storage.sync.set({ theme: newTheme }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Could not save theme to chrome.storage.sync:", chrome.runtime.lastError.message);
                }
            });
        }
    });
}

// Apply theme on initial dialog load.
calculateAndApplyTheme(false);
// Listen for system theme changes and update dialog theme accordingly.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    calculateAndApplyTheme(true); // Indicate it's a system-driven change.
});

/**
 * Sends the current window's size and position to the background script for saving.
 * This is called explicitly before the dialog closes via Save or Cancel buttons,
 * ensuring the last used state is persisted.
 */
function saveCurrentWindowState() {
    // Ensure window dimensions are valid before sending.
    if (window.outerWidth > 0 && window.outerHeight > 0) {
        const windowState = {
            width: window.outerWidth, height: window.outerHeight,
            top: window.screenY, left: window.screenX
        };
        // One-way message; background script handles actual saving.
        // No response callback needed as the window is about to close.
        chrome.runtime.sendMessage({ action: "saveWindowState", state: windowState });
    }
}
// Note: Automatic saving on resize/move is handled by the background script's
// `chrome.windows.onBoundsChanged` listener for better reliability during active use.

// --- Bookmark Folder Tree ---

/**
 * Recursively builds the HTML structure for a bookmark folder node and its children.
 * @param {object} node - A bookmark tree node object from `chrome.bookmarks.getTree`.
 * @param {Array<string>} pathSegments - Array of parent folder names for building the display path.
 * @returns {HTMLElement} The div element representing the folder node.
 */
function buildFolderNode(node, pathSegments = []) {
    const nodeElement = document.createElement('div');
    nodeElement.classList.add('tree-node');
    nodeElement.setAttribute('role', 'treeitem');
    nodeElement.setAttribute('data-id', node.id); // Store bookmark ID.
    const currentPath = [...pathSegments, node.title || '(No title)']; // Handle untitled folders.
    nodeElement.setAttribute('data-path', currentPath.join(' / ')); // Store full display path.

    const contentElement = document.createElement('div');
    contentElement.classList.add('node-content'); // Clickable area.

    const toggleIcon = document.createElement('span'); // For expand/collapse.
    toggleIcon.classList.add('toggle-icon');
    toggleIcon.setAttribute('aria-hidden', 'true'); // Decorative.

    const folderIconElement = document.createElement('span'); // Visual folder icon.
    folderIconElement.classList.add('folder-icon');
    folderIconElement.setAttribute('aria-hidden', 'true'); // Decorative.

    const nameElement = document.createElement('span');
    nameElement.classList.add('folder-name');
    nameElement.textContent = node.title || '(No title)';

    const childrenElement = document.createElement('div'); // Container for child nodes.
    childrenElement.classList.add('node-children');
    childrenElement.setAttribute('role', 'group');

    if (node.children && node.children.length > 0) {
        let hasFolderChildren = false;
        node.children.forEach(childNode => {
            // IMPORTANT: Only include actual folders (nodes without a 'url' property).
            if (childNode.url === undefined || childNode.url === null) {
                childrenElement.appendChild(buildFolderNode(childNode, currentPath));
                hasFolderChildren = true;
            }
        });
        // Add expand/collapse functionality only if there are actual folder children.
        if (hasFolderChildren) {
            nodeElement.setAttribute('aria-expanded', 'false'); // Start collapsed.
            toggleIcon.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent node selection when clicking only the toggle.
                toggleNodeExpansion(nodeElement);
            });
        } else {
            toggleIcon.classList.add('placeholder'); // For consistent spacing if no expandable children.
        }
    } else {
        toggleIcon.classList.add('placeholder'); // No children at all.
    }

    // Select the node when its main content area is clicked.
    contentElement.addEventListener('click', () => {
        selectNode(nodeElement, node.id, nodeElement.getAttribute('data-path'));
    });

    contentElement.appendChild(toggleIcon);
    contentElement.appendChild(folderIconElement);
    contentElement.appendChild(nameElement);
    nodeElement.appendChild(contentElement);
    nodeElement.appendChild(childrenElement);
    return nodeElement;
}

/**
 * Toggles the expanded/collapsed state of a folder node in the tree.
 * @param {HTMLElement} nodeElement - The .tree-node element.
 */
function toggleNodeExpansion(nodeElement) {
    const isExpanded = nodeElement.classList.toggle('expanded');
    nodeElement.setAttribute('aria-expanded', isExpanded); // Update ARIA state.
}

/**
 * Handles the selection of a folder node in the tree. Updates UI and state.
 * @param {HTMLElement} nodeElement - The .tree-node element being selected.
 * @param {string} nodeId - The bookmark ID of the selected folder.
 * @param {string} nodePath - The display path of the selected folder.
 */
function selectNode(nodeElement, nodeId, nodePath) {
    // Deselect previously selected node, if any.
    const currentlySelected = folderTreeContainer.querySelector('.node-content.selected');
    if (currentlySelected) {
        currentlySelected.classList.remove('selected');
        currentlySelected.parentElement.removeAttribute('aria-selected');
    }

    // Select the new node.
    const contentElement = nodeElement.querySelector('.node-content');
    if (contentElement) {
        contentElement.classList.add('selected');
        nodeElement.setAttribute('aria-selected', 'true');
        selectedFolderId = nodeId; // Update global state.
        selectedFolderTitlePath = nodePath || 'Unknown';
        selectedPathDisplay.textContent = selectedFolderTitlePath; // Update display.
        statusDiv.textContent = ''; // Clear any previous status messages.
    } else { // Fallback, should ideally not happen.
        selectedFolderId = null;
        selectedFolderTitlePath = 'None';
        selectedPathDisplay.textContent = selectedFolderTitlePath;
    }
}

/**
 * Sets the expansion state of a node programmatically (used by Expand/Collapse All).
 * @param {HTMLElement} nodeElement - The .tree-node element.
 * @param {boolean} expand - True to expand, false to collapse.
 */
function setNodeExpansion(nodeElement, expand) {
    // Only change state if the node actually has expandable children.
    if (nodeElement.querySelector('.node-children')?.hasChildNodes()) {
        nodeElement.classList.toggle('expanded', expand);
        nodeElement.setAttribute('aria-expanded', expand);
    }
}

// --- Initialization ---
// Set a default name for the new folder input field, including current date/time.
folderNameInput.value = 'Saved Tabs ' + new Date().toLocaleString();

// Request the bookmark tree structure from the background script on dialog load.
chrome.runtime.sendMessage({ action: "getBookmarkTree" }, (response) => {
    folderTreeContainer.innerHTML = ''; // Clear "Loading..." message.
    if (chrome.runtime.lastError || !response || !response.tree) {
        statusDiv.textContent = 'Error loading folders: ' + (chrome.runtime.lastError?.message || 'No response from background.');
        saveButton.disabled = true; // Disable saving if folders can't be loaded.
        return;
    }

    response.tree.forEach(rootNode => {
        if (rootNode.url === undefined || rootNode.url === null) { // Only process actual folders.
            const nodeElement = buildFolderNode(rootNode, []);
            nodeElement.setAttribute('data-level', 'top'); // Mark for styling/selection logic.
            folderTreeContainer.appendChild(nodeElement);
            // Optionally expand top-level folders by default if they have children.
            if (nodeElement.querySelector('.node-children')?.hasChildNodes()) {
                 toggleNodeExpansion(nodeElement);
            }
        }
    });

    // Attempt to select a default folder: 'Other Bookmarks' (ID '2') or the first available top-level folder.
    const defaultNode = folderTreeContainer.querySelector('.tree-node[data-id="2"]') || // "Other Bookmarks"
                        folderTreeContainer.querySelector('.tree-node[data-level="top"]');
    if (defaultNode) {
        selectNode(defaultNode, defaultNode.getAttribute('data-id'), defaultNode.getAttribute('data-path'));
    } else { // Handle case where no bookmark folders are found at all.
        selectedPathDisplay.textContent = "No bookmark folders found.";
        statusDiv.textContent = 'Could not find any bookmark folders to save into.';
        saveButton.disabled = true;
    }
});

// --- Event Listeners ---
expandAllButton.addEventListener('click', () => {
    folderTreeContainer.querySelectorAll('.tree-node').forEach(node => setNodeExpansion(node, true));
});

collapseAllButton.addEventListener('click', () => {
    // Collapse all nodes that are *not* direct children of the root container (i.e., nested).
    folderTreeContainer.querySelectorAll('.tree-node .tree-node').forEach(node => setNodeExpansion(node, false));
    // Ensure top-level nodes remain expanded (or set to desired initial state).
    folderTreeContainer.querySelectorAll(':scope > .tree-node[data-level="top"]').forEach(node => setNodeExpansion(node, true));
});

// Radio buttons for save mode (Create New Folder / Save Directly into selected).
saveModeRadios.forEach(radio => {
    radio.addEventListener('change', (event) => {
        const isCreateMode = event.target.value === 'create';
        newFolderNameGroup.style.display = isCreateMode ? '' : 'none'; // Show/hide input.
        folderNameInput.required = isCreateMode; // Make input required only in 'create' mode.
    });
});
// Initial check on load to set visibility of folder name input based on the default checked radio.
if (document.querySelector('input[name="save-mode"]:checked')?.value !== 'create') {
    newFolderNameGroup.style.display = 'none';
    folderNameInput.required = false;
}

// Save Tabs button functionality.
saveButton.addEventListener('click', () => {
    const saveMode = document.querySelector('input[name="save-mode"]:checked').value;
    const newFolderName = folderNameInput.value.trim();
    statusDiv.textContent = ''; // Clear previous status messages.

    // --- Input Validation ---
    if (!selectedFolderId) {
        statusDiv.textContent = 'Please select a destination folder from the tree.';
        folderTreeContainer.focus(); // Set focus to the tree for accessibility.
        return;
    }
    if (folderNameInput.required && !newFolderName) { // Required only in 'create' mode.
        statusDiv.textContent = 'New folder name cannot be empty.';
        folderNameInput.focus();
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    saveCurrentWindowState(); // Persist window state before closing.

    // Send message to the background script to perform the bookmarking.
    chrome.runtime.sendMessage({
        action: "saveBookmarks",
        folderName: saveMode === 'create' ? newFolderName : null, // `null` for direct save.
        parentId: selectedFolderId
    }, (response) => {
        saveButton.disabled = false; // Re-enable button.
        saveButton.textContent = 'Save Tabs';

        if (chrome.runtime.lastError) {
            statusDiv.textContent = `Error communicating with background: ${chrome.runtime.lastError.message}`;
        } else if (response && response.success) {
            window.close(); // Close the dialog on successful save.
        } else {
            statusDiv.textContent = `Save failed: ${response?.message || 'Unknown error from background.'}`;
        }
    });
});

// Cancel button functionality.
cancelButton.addEventListener('click', () => {
    saveCurrentWindowState(); // Persist window state even on cancel.
    // Notify background script that the operation was cancelled (to clean up temp data).
    chrome.runtime.sendMessage({ action: "cancelSave" });
    window.close();
});
