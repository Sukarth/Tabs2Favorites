// Stores the details of the last two tab selections.
// Index 0: Older selection (relevant for context menu).
// Index 1: Most recent selection (relevant for keyboard shortcuts).
let recentSelections = [ { items: [] }, { items: [] } ];

// --- Constants for Storage Keys ---
const TEMP_STORAGE_KEY = 'tabsToBookmark';     // For passing tab data to the dialog.
const WINDOW_STATE_KEY = 'dialogWindowState'; // For saving dialog's position and size.

// --- Default Dialog Dimensions and Position (Fallbacks) ---
const DEFAULT_WINDOW_WIDTH = 440;
const DEFAULT_WINDOW_HEIGHT = 568;
const DEFAULT_TOP = 189;
const DEFAULT_LEFT = 760;

/**
 * Debounce utility: Limits the rate at which a function can fire.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} The debounced function.
 */
function debounceBackground(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

let saveDialogWindowId = null; // ID of the currently open save dialog, if any.

/**
 * Closes the existing save dialog window if it's open.
 * Ensures only one instance of the dialog is open.
 */
async function closeExistingSaveDialog() {
    if (saveDialogWindowId !== null) {
        try {
            const win = await chrome.windows.get(saveDialogWindowId);
            if (win) await chrome.windows.remove(saveDialogWindowId);
        } catch (error) { /* Window likely already closed, ignore. */ }
        saveDialogWindowId = null;
    }
}

/**
 * Updates the history of recent tab selections.
 * `recentSelections` keeps the last two states.
 * @param {object} newSelection The latest selection object { items: [...] }.
 */
function updateRecentSelections(newSelection) {
    recentSelections.shift(); // Remove the oldest.
    recentSelections.push(newSelection); // Add the newest.
}

/**
 * Shows a browser notification to the user.
 * @param {string} message The message to display in the notification.
 */
function showNotification(message) {
    const iconPath = 'icons/icon48.png'; // Relative to manifest.json
    const fullIconUrl = chrome.runtime.getURL(iconPath);
    chrome.notifications.create(
        `tabs2FavoritesNotification-${Date.now()}`, // Unique ID
        {
            type: 'basic',
            iconUrl: fullIconUrl,
            title: 'Tabs2Favorites',
            message: message,
            priority: 0 // Default priority
        },
        (notificationId) => {
            if (chrome.runtime.lastError) {
                console.error(`Notification creation error: ${chrome.runtime.lastError.message}`);
            }
        }
    );
}

/**
 * Listener for changes in highlighted/selected tabs.
 * Updates `recentSelections` which is crucial for determining which tabs to save,
 * especially for keyboard shortcuts that don't have an immediate tab context.
 */
chrome.tabs.onHighlighted.addListener(async (highlightInfo) => {
    // Query for currently highlighted tabs in the active window to get full tab objects.
    const queryOptions = { highlighted: true, currentWindow: true };
    const highlightedTabs = await chrome.tabs.query(queryOptions);

    const currentSelectedItems = { items: [] };
    for (const tab of highlightedTabs) {
        // Only include tabs with valid HTTP/HTTPS URLs and titles.
        if (tab && tab.url && tab.title && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
            currentSelectedItems.items.push({ url: tab.url, id: tab.id, title: tab.title });
        }
    }
    updateRecentSelections(currentSelectedItems);
});


/**
 * Core logic to initiate the process of saving selected tabs.
 * This involves preparing data and opening the save_dialog.html window.
 * @param {boolean} closeAfterSave - Whether the tabs should be closed after successful saving.
 * @param {object | null} selectionOverride - Optional. If provided (e.g., from context menu),
 *                                            this selection is used. Otherwise, defaults to
 *                                            `recentSelections[1]` (for keyboard shortcuts).
 */
async function initiateSaveSelectedTabs(closeAfterSave, selectionOverride = null) {
    const selectionToUse = selectionOverride || recentSelections[1];

    if (!selectionToUse || !selectionToUse.items || selectionToUse.items.length < 2) {
        const triggerMethod = selectionOverride ? "context menu" : "shortcut";
        showNotification(`Please select at least two tabs before using the ${triggerMethod}.`);
        return;
    }

    const dataToSave = {
        items: selectionToUse.items,
        closeAfterSave: closeAfterSave
    };

    try {
        await chrome.storage.local.set({ [TEMP_STORAGE_KEY]: dataToSave });
        await closeExistingSaveDialog(); // Ensure only one dialog is open.

        // Retrieve last saved window state or calculate default centered position.
        chrome.storage.local.get(WINDOW_STATE_KEY, async (storageResult) => {
            const savedState = storageResult[WINDOW_STATE_KEY];
            let top = DEFAULT_TOP;
            let left = DEFAULT_LEFT;

            if (savedState) {
                top = savedState.top;
                left = savedState.left;
            } else { // No saved state, try to center the window.
                try {
                    const displays = await chrome.system.display.getInfo();
                    if (displays && displays.length > 0) {
                        const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
                        const screenWidth = primaryDisplay.workArea.width;
                        const screenHeight = primaryDisplay.workArea.height;
                        const verticalOffset = 75; // Pixels to shift upwards from true center.

                        left = Math.round((screenWidth - DEFAULT_WINDOW_WIDTH) / 2);
                        top = Math.round((screenHeight - DEFAULT_WINDOW_HEIGHT) / 2 - verticalOffset);

                        // Ensure dialog is not positioned off-screen.
                        if (top < primaryDisplay.workArea.top) top = primaryDisplay.workArea.top;
                        if (left < primaryDisplay.workArea.left) left = primaryDisplay.workArea.left;
                    }
                } catch (displayError) { /* Fallback to hardcoded defaults if display info fails. */ }
            }

            const createData = {
                url: chrome.runtime.getURL("save_dialog.html"),
                type: "popup",
                width: savedState?.width || DEFAULT_WINDOW_WIDTH,
                height: savedState?.height || DEFAULT_WINDOW_HEIGHT,
                top: top,
                left: left,
                focused: true
            };

            // Basic sanity check for dimensions.
            if (createData.width < 100) createData.width = DEFAULT_WINDOW_WIDTH;
            if (createData.height < 100) createData.height = DEFAULT_WINDOW_HEIGHT;

            try {
                const createdWindow = await chrome.windows.create(createData);
                if (createdWindow?.id) {
                    saveDialogWindowId = createdWindow.id;
                    // If a previous state was used, re-apply with update, as 'create' might not honor all params.
                    if (savedState) {
                         const updateData = {
                            width: Number(savedState.width) || DEFAULT_WINDOW_WIDTH,
                            height: Number(savedState.height) || DEFAULT_WINDOW_HEIGHT,
                            top: savedState.top, left: savedState.left, focused: true
                        };
                        if (updateData.width < 100) updateData.width = DEFAULT_WINDOW_WIDTH;
                        if (updateData.height < 100) updateData.height = DEFAULT_WINDOW_HEIGHT;
                        try { await chrome.windows.update(saveDialogWindowId, updateData); }
                        catch (updateError) { console.warn(`Ignoring window update error post-creation: ${updateError.message}`); }
                    }
                } else { // Should not happen if create is successful.
                    await chrome.storage.local.remove(TEMP_STORAGE_KEY);
                    showNotification('Error: Could not create the save dialog window.');
                }
            } catch (createError) {
                showNotification('Error opening save dialog.');
                console.error('Error creating dialog window:', createError);
                await chrome.storage.local.remove(TEMP_STORAGE_KEY); // Clean up.
            }
        });
    } catch (storeError) {
        showNotification('Error preparing save dialog.');
        console.error('Error storing tab data for dialog:', storeError);
    }
}


/**
 * Listener for extension installation or update.
 * Creates the context menu items.
 */
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'addToFavorites',
        title: 'Save selected tabs to Favorites',
        contexts: ['page']
    });
    chrome.contextMenus.create({
        id: 'addToFavoritesAndClose',
        title: 'Save selected tabs to Favorites and close them',
        contexts: ['page']
    });
});

/**
 * Listener for context menu item clicks.
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // For context menu, `recentSelections[0]` (the older selection) is more reliable
    // due to focus changes when the menu itself is clicked.
    const selectionForContextMenu = recentSelections[0];
    const closeAfter = info.menuItemId === 'addToFavoritesAndClose';
    initiateSaveSelectedTabs(closeAfter, selectionForContextMenu);
});

/**
 * Listener for keyboard shortcut commands.
 */
chrome.commands.onCommand.addListener((command) => {
    // For commands, `recentSelections[1]` (the most recent selection) is appropriate
    // as there's no intermediate click to change focus.
    // `null` for selectionOverride makes `initiateSaveSelectedTabs` use this default.
    if (command === "save-selected-tabs") {
        initiateSaveSelectedTabs(false, null);
    } else if (command === "save-selected-tabs-and-close") {
        initiateSaveSelectedTabs(true, null);
    }
});


/**
 * Creates bookmarks for the provided tabs, optionally in a new subfolder.
 * Notifies the user of the outcome.
 * @param {Array<object>} tabsToBookmark Array of tab objects { url, title, id }.
 * @param {string} parentFolderId The ID of the bookmark folder selected in the dialog.
 * @param {string | null} folderName The name for the new bookmark folder, or null to save directly.
 * @returns {Promise<object>} Object indicating success status, count, and the name of the folder.
 */
async function performBookmarkAndNotify(tabsToBookmark, parentFolderId, folderName) {
    if (!tabsToBookmark || tabsToBookmark.length === 0) {
        showNotification('Error: No valid tab data found to bookmark.');
        return { success: false, message: 'No tab data found.' };
    }
    if (!parentFolderId) {
        showNotification('Error: No destination folder selected.');
        return { success: false, message: 'Destination folder not selected.' };
    }

    let targetBookmarkParentId = parentFolderId;
    let finalFolderNameForDisplay = ''; // Name of the folder where bookmarks are actually placed.

    try {
        if (folderName && folderName.trim() !== "") { // Mode: Create a new folder.
            const newFolder = await chrome.bookmarks.create({ parentId: parentFolderId, title: folderName.trim() });
            targetBookmarkParentId = newFolder.id;
            finalFolderNameForDisplay = newFolder.title;
        } else { // Mode: Save directly into the selected parentFolderId.
            const parentDetails = await chrome.bookmarks.get(parentFolderId);
            finalFolderNameForDisplay = (parentDetails && parentDetails.length > 0) ? parentDetails[0].title : "Selected Folder";
        }

        let bookmarkedCount = 0;
        for (const tabInfo of tabsToBookmark) {
            try {
                await chrome.bookmarks.create({ parentId: targetBookmarkParentId, title: tabInfo.title, url: tabInfo.url });
                bookmarkedCount++;
            } catch (bookmarkError) {
                console.error(`Error bookmarking tab "${tabInfo.title}":`, bookmarkError);
            }
        }
        return { success: true, count: bookmarkedCount, folderName: finalFolderNameForDisplay };

    } catch (error) { // Handles errors from creating new folder or getting parent details.
        const errorAction = folderName ? `create new folder '${folderName}'` : `save to selected folder`;
        showNotification(`Error: Could not ${errorAction}.`);
        console.error(`Error during bookmark operation (${errorAction}):`, error);
        return { success: false, message: `Could not ${errorAction}: ${error.message}` };
    }
}

/**
 * Closes an array of tabs by their IDs.
 * @param {Array<number>} tabIds Array of tab IDs to close.
 * @returns {Promise<number>} The number of tabs successfully closed.
 */
async function closeTabs(tabIds) {
    if (!tabIds || tabIds.length === 0) return 0;
    let closedCount = 0;
    for (const tabId of tabIds) {
        try {
            await chrome.tabs.remove(tabId);
            closedCount++;
        } catch (error) { /* Tab might have been closed manually, ignore. */ }
    }
    return closedCount;
}

/**
 * Listener for when any Chrome window is closed.
 * Clears the stored dialog window ID if it matches the closed window.
 */
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === saveDialogWindowId) {
        saveDialogWindowId = null;
    }
});

/**
 * Debounced function to save the dialog window's bounds (position/size).
 * Triggered by `onBoundsChanged` listener.
 * @param {number} windowId The ID of the window whose bounds changed.
 */
const debouncedSaveBounds = debounceBackground(async (windowId) => {
    if (windowId === saveDialogWindowId) { // Only act if it's our dialog.
        try {
            const win = await chrome.windows.get(windowId);
            // Only save state if it's a normal popup window (not minimized, etc.).
            if (win && win.type === 'popup' && win.state === 'normal') {
                const windowState = { width: win.width, height: win.height, top: win.top, left: win.left };
                chrome.storage.local.set({ [WINDOW_STATE_KEY]: windowState }, () => {
                    if (chrome.runtime.lastError) {
                        console.error(`Error saving window state (debounced): ${chrome.runtime.lastError.message}`);
                    }
                });
            }
        } catch (error) { /* Window likely closed before get could complete, ignore. */ }
    }
}, 750); // 750ms delay after last change.

/**
 * Listener for changes in any window's position or size.
 * Triggers the debounced save function if the change affects the save dialog.
 */
chrome.windows.onBoundsChanged.addListener((window) => {
    if (window.id === saveDialogWindowId && window.type === 'popup') {
        debouncedSaveBounds(window.id);
    }
});

/**
 * Listener for messages sent from other parts of the extension (primarily the save dialog).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getBookmarkTree") {
        chrome.bookmarks.getTree((tree) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                // Send only the top-level bookmark folders (children of the root node).
                sendResponse({ tree: tree[0].children });
            }
        });
        return true; // Indicates that the response will be sent asynchronously.
    }
    else if (message.action === "saveBookmarks") {
        const { folderName, parentId } = message;
        chrome.storage.local.get(TEMP_STORAGE_KEY, async (result) => {
            if (chrome.runtime.lastError || !result[TEMP_STORAGE_KEY]) {
                sendResponse({ success: false, message: 'Failed to retrieve tab data for saving.' }); return;
            }
            const savedData = result[TEMP_STORAGE_KEY];
            if (!savedData || !savedData.items) {
                sendResponse({ success: false, message: 'No tab data found in storage to save.' }); return;
            }

            const bookmarkResult = await performBookmarkAndNotify(savedData.items, parentId, folderName);
            await chrome.storage.local.remove(TEMP_STORAGE_KEY); // Clean up temp data.

            if (bookmarkResult.success) {
                let notifyMessage = `Successfully bookmarked ${bookmarkResult.count} tab(s) to folder "${bookmarkResult.folderName}".`;
                if (savedData.closeAfterSave) {
                    const idsToClose = savedData.items.map(item => item.id);
                    const closedCount = await closeTabs(idsToClose);
                    notifyMessage += `\nAttempted to close ${closedCount} tab(s).`;
                    recentSelections = [{ items: [] }, { items: [] }]; // Clear selection history.
                }
                showNotification(notifyMessage);
                sendResponse({ success: true }); // Confirm success back to the dialog.
            } else {
                // Failure notification is handled within performBookmarkAndNotify.
                sendResponse({ success: false, message: bookmarkResult.message });
            }
        });
        return true; // Indicates asynchronous response.
    }
    else if (message.action === "saveWindowState" && message.state) {
        // This message comes from save_dialog.js just before it closes.
        chrome.storage.local.set({ [WINDOW_STATE_KEY]: message.state }, () => {
            if (chrome.runtime.lastError) {
                 console.error(`Error saving window state (from dialog message): ${chrome.runtime.lastError.message}`);
            }
        });
        // No response needed for this one-way message.
    }
    else if (message.action === "cancelSave") {
        // Dialog's cancel button was clicked.
        chrome.storage.local.remove(TEMP_STORAGE_KEY); // Clean up temp tab data.
        // No response needed.
    }
});
