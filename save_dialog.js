// --- DOM Elements ---
const folderNameInput = document.getElementById('folder-name');
const folderTreeContainer = document.getElementById('folder-tree');
const saveButton = document.getElementById('save-button');
const cancelButton = document.getElementById('cancel-button');
const statusDiv = document.getElementById('status');
const expandAllButton = document.getElementById('expand-all');
const collapseAllButton = document.getElementById('collapse-all');
const saveModeRadios = document.querySelectorAll('input[name="save-mode"]');
const selectedPathDisplay = document.getElementById('selected-folder-path').querySelector('span');
const newFolderNameGroup = document.getElementById('new-folder-name-group');

// --- State Variables ---
let selectedFolderId = null;
let selectedFolderTitlePath = 'None'; // Store path for display

// --- Theme Handling ---
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

function calculateAndApplyTheme() {
    const storedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let currentTheme;

    if (storedTheme) {
        currentTheme = storedTheme;
    } else {
        currentTheme = systemPrefersDark ? 'dark' : 'light';
    }
    applyTheme(currentTheme);
}

// Apply theme on load
calculateAndApplyTheme();

// Optional: Listen for system theme changes (requires page reload or more complex logic to update without reload)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', calculateAndApplyTheme);


// --- Tree Building & Interaction ---
function buildFolderNode(node, pathSegments = []) {
    const nodeElement = document.createElement('div');
    nodeElement.classList.add('tree-node');
    nodeElement.setAttribute('role', 'treeitem');
    nodeElement.setAttribute('data-id', node.id);

    // Store the full path as a data attribute
    const currentPath = [...pathSegments, node.title || '(No title)'];
    nodeElement.setAttribute('data-path', currentPath.join(' / '));

    const contentElement = document.createElement('div');
    contentElement.classList.add('node-content');

    const toggleIcon = document.createElement('span');
    toggleIcon.classList.add('toggle-icon');
    toggleIcon.setAttribute('aria-hidden', 'true');

    const folderIcon = document.createElement('span'); // Added folder icon
    folderIcon.classList.add('folder-icon');
    folderIcon.setAttribute('aria-hidden', 'true');

    const nameElement = document.createElement('span');
    nameElement.classList.add('folder-name');
    nameElement.textContent = node.title || '(No title)';

    const childrenElement = document.createElement('div');
    childrenElement.classList.add('node-children');
    childrenElement.setAttribute('role', 'group');

    // Add toggle/children if applicable
    if (node.children && node.children.length > 0) {
        let hasFolderChildren = false;
        node.children.forEach(childNode => {
            if (childNode.url === undefined || childNode.url === null) {
                childrenElement.appendChild(buildFolderNode(childNode, currentPath));
                hasFolderChildren = true;
            }
        });
        // Only add toggle interaction if there are actual folder children
        if (hasFolderChildren) {
            nodeElement.setAttribute('aria-expanded', 'false');
            toggleIcon.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleNodeExpansion(nodeElement);
            });
        } else {
            toggleIcon.classList.add('placeholder');
        }
    } else {
        toggleIcon.classList.add('placeholder');
    }

    // Selection
    contentElement.addEventListener('click', () => {
        selectNode(nodeElement, node.id, nodeElement.getAttribute('data-path'));
    });

    // Assemble
    contentElement.appendChild(toggleIcon);
    contentElement.appendChild(folderIcon); // Add folder icon
    contentElement.appendChild(nameElement);
    nodeElement.appendChild(contentElement);
    nodeElement.appendChild(childrenElement);

    return nodeElement;
}

function toggleNodeExpansion(nodeElement) {
    const isExpanded = nodeElement.classList.toggle('expanded');
    nodeElement.setAttribute('aria-expanded', isExpanded);
}

function selectNode(nodeElement, nodeId, nodePath) {
    const currentlySelected = folderTreeContainer.querySelector('.node-content.selected');
    if (currentlySelected) {
        currentlySelected.classList.remove('selected');
        currentlySelected.parentElement.removeAttribute('aria-selected');
    }

    const contentElement = nodeElement.querySelector('.node-content');
    if (contentElement) {
        contentElement.classList.add('selected');
        nodeElement.setAttribute('aria-selected', 'true');
        selectedFolderId = nodeId;
        selectedFolderTitlePath = nodePath || 'Unknown';
        selectedPathDisplay.textContent = selectedFolderTitlePath; // Update display
        statusDiv.textContent = '';
        console.log('Selected Folder ID:', selectedFolderId, "Path:", selectedFolderTitlePath);
    } else {
        selectedFolderId = null;
        selectedFolderTitlePath = 'None';
        selectedPathDisplay.textContent = selectedFolderTitlePath;
    }
}

function setNodeExpansion(nodeElement, expand) {
    const hasChildren = nodeElement.querySelector('.node-children')?.hasChildNodes();
    if (hasChildren) {
        nodeElement.classList.toggle('expanded', expand);
        nodeElement.setAttribute('aria-expanded', expand);
    }
}

// --- Initialization ---
folderNameInput.value = 'Saved Tabs ' + new Date().toLocaleString();

chrome.runtime.sendMessage({ action: "getBookmarkTree" }, (response) => {
    folderTreeContainer.innerHTML = '';
    if (chrome.runtime.lastError || !response || !response.tree) {
        statusDiv.textContent = 'Error loading folders: ' + (chrome.runtime.lastError?.message || 'No response');
        return;
    }

    // Build tree from root folders
    response.tree.forEach(rootNode => {
        if (rootNode.url === undefined || rootNode.url === null) {
            const nodeElement = buildFolderNode(rootNode, []);
            folderTreeContainer.appendChild(nodeElement);
            // Expand first level by default
            if (nodeElement.querySelector('.node-children')?.hasChildNodes()) {
                toggleNodeExpansion(nodeElement);
            }
        }
    });

    // Select "Other Bookmarks" (ID 2) or first available folder
    const defaultNode = folderTreeContainer.querySelector('.tree-node[data-id="2"]') || folderTreeContainer.querySelector('.tree-node');
    if (defaultNode) {
        selectNode(defaultNode, defaultNode.getAttribute('data-id'), defaultNode.getAttribute('data-path'));
    } else {
        selectedPathDisplay.textContent = "No folders found.";
    }
});


// --- Event Listeners ---
expandAllButton.addEventListener('click', () => {
    folderTreeContainer.querySelectorAll('.tree-node').forEach(node => setNodeExpansion(node, true));
});

collapseAllButton.addEventListener('click', () => {
    // Collapse all nodes below the top level
    folderTreeContainer.querySelectorAll('.tree-node .tree-node').forEach(node => setNodeExpansion(node, false));
    // Ensure top level remains expanded (or collapsed if preferred)
    folderTreeContainer.querySelectorAll(':scope > .tree-node').forEach(node => setNodeExpansion(node, true));
});

saveModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        // CSS handles showing/hiding the input group now via :has()
        // if (radio.value === 'create' && radio.checked) {
        //     newFolderNameGroup.style.display = '';
        // } else if (radio.value === 'direct' && radio.checked) {
        //     newFolderNameGroup.style.display = 'none';
        // }
        console.log('Save mode changed to:', radio.value);
    });
});


saveButton.addEventListener('click', () => {
    const saveMode = document.querySelector('input[name="save-mode"]:checked').value;
    const newFolderName = folderNameInput.value.trim();

    statusDiv.textContent = '';

    if (!selectedFolderId) {
        statusDiv.textContent = 'Please select a location from the tree.';
        folderTreeContainer.focus();
        return;
    }

    // Validate folder name only if creating a new folder
    if (saveMode === 'create' && !newFolderName) {
        statusDiv.textContent = 'New folder name cannot be empty.';
        folderNameInput.focus();
        return;
    }

    console.log(`Dialog: Save Request. Mode='${saveMode}', ParentID='${selectedFolderId}', NewFolderName='${saveMode === 'create' ? newFolderName : '(Direct)'}'`);
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    chrome.runtime.sendMessage(
        {
            action: "saveBookmarks",
            saveMode: saveMode, // Send the mode
            parentId: selectedFolderId,
            folderName: saveMode === 'create' ? newFolderName : null // Only send name if creating
        },
        (response) => {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Tabs'; // Reset button text

            if (chrome.runtime.lastError) {
                statusDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
                console.error(chrome.runtime.lastError);
            } else if (response && response.success) {
                console.log('Dialog: Save successful message received.');
                window.close();
            } else {
                statusDiv.textContent = `Save failed: ${response?.message || 'Unknown error.'}`;
            }
        }
    );
});

cancelButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "cancelSave" });
    window.close();
});

// Optional: Add keyboard navigation to tree? (More complex)

