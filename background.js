// Store the two most recent highlighted tab selections
let recentSelections = [
    { items: [] }, // Index 0: Older selection
    { items: [] }  // Index 1: Newest selection
];
// Store data temporarily for the dialog
const TEMP_STORAGE_KEY = 'tabsToBookmark';

// Helper function to update recent selections
function updateRecentSelections(newSelection) {
    recentSelections.shift();
    recentSelections.push(newSelection);
    console.log('[updateRecentSelections] Updated history:', JSON.stringify(recentSelections));
}

// Helper function to show notifications
function showNotification(message) {
    const iconPath = 'icons/icon48.png';
    const fullIconUrl = chrome.runtime.getURL(iconPath);
    console.log('[showNotification] Using Icon URL:', fullIconUrl);

    chrome.notifications.create(
        `bookmarkTabsNotification-${Date.now()}`,
        {
            type: 'basic',
            iconUrl: fullIconUrl,
            title: 'Bookmark Selected Tabs',
            message: message,
            priority: 0
        },
        (notificationId) => {
            if (chrome.runtime.lastError) {
                console.error(`[showNotification] Error creating notification: ${chrome.runtime.lastError.message}.`);
            } else {
                console.log(`[showNotification] Notification shown successfully with ID: ${notificationId}`);
            }
        }
    );
}

// Listen for tab highlight changes
chrome.tabs.onHighlighted.addListener(async (highlightInfo) => {
    console.log('[onHighlighted] Event fired. Highlighted Tab IDs:', highlightInfo.tabIds);
    const currentSelectedItems = { items: [] };

    for (const tabId of highlightInfo.tabIds) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab && tab.url && tab.title) {
                currentSelectedItems.items.push({
                    url: tab.url,
                    id: tab.id,
                    title: tab.title
                });
            }
        } catch (error) {
            console.warn(`[onHighlighted] Could not get info for Tab ID ${tabId}: ${error.message}`);
        }
    }
    updateRecentSelections(currentSelectedItems);
    console.log('[onHighlighted] Finished processing event. Stored items:', JSON.stringify(currentSelectedItems));
});

// Create context menu items
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'addToFavorites',
        title: 'Add selected tabs to favourites',
        contexts: ['page']
    });

    chrome.contextMenus.create({
        id: 'addToFavoritesAndClose',
        title: 'Add selected tabs to favourites and close them',
        contexts: ['page']
    });
    console.log('Context menus created/updated.');
});


// *** MODIFIED function to bookmark tabs - Now takes parentId and folderName ***
async function performBookmarkAndNotify(tabsToBookmark, parentFolderId, folderName) {
    if (!tabsToBookmark || tabsToBookmark.length === 0) {
        console.log('[performBookmark] No valid tab items provided.');
        showNotification('Error: No tab data found to bookmark.');
        return { success: false, message: 'No tab data found.' };
    }
    if (!parentFolderId || !folderName) {
        console.log('[performBookmark] Missing parentFolderId or folderName.');
        showNotification('Error: Parent folder or name missing.');
        return { success: false, message: 'Parent folder or name missing.' };
    }
    console.log(`[performBookmark] Bookmarking into ParentID: ${parentFolderId}, Name: ${folderName}`);
    console.log('[performBookmark] Items:', JSON.stringify(tabsToBookmark));

    try {
        // Create the new folder inside the selected parent
        const folder = await chrome.bookmarks.create({
            parentId: parentFolderId,
            title: folderName.trim()
        });
        console.log(`[performBookmark] Created bookmark folder: ${folder.title} (ID: ${folder.id})`);

        let bookmarkedCount = 0;
        for (const tabInfo of tabsToBookmark) {
            try {
                await chrome.bookmarks.create({
                    parentId: folder.id,
                    title: tabInfo.title,
                    url: tabInfo.url
                });
                bookmarkedCount++;
            } catch (bookmarkError) {
                console.error(`[performBookmark] Error bookmarking '${tabInfo.title}' (${tabInfo.url}):`, bookmarkError);
            }
        }
        console.log(`[performBookmark] Finished. Total bookmarked: ${bookmarkedCount} / ${tabsToBookmark.length}.`);
        // Return success info
        return { success: true, count: bookmarkedCount, folderName: folder.title };
    } catch (error) {
        console.error(`[performBookmark] Error creating bookmark folder '${folderName}' inside parent ${parentFolderId}:`, error);
        showNotification(`Error: Could not create bookmark folder '${folderName}'.`);
        return { success: false, message: `Could not create folder: ${error.message}` };
    }
}

// Function to close tabs (remains the same)
async function closeTabs(tabIds) {
    // ... (keep the existing closeTabs function) ...
    if (!tabIds || tabIds.length === 0) {
        console.log('[closeTabs] No tab IDs provided to close.');
        return 0;
    }
    console.log('[closeTabs] Received Tab IDs to close:', tabIds);
    let closedCount = 0;
    for (const tabId of tabIds) {
        try {
            console.log(`[closeTabs] Attempting to close Tab ID: ${tabId}`);
            await chrome.tabs.remove(tabId);
            closedCount++;
            console.log(`[closeTabs] Successfully closed Tab ID: ${tabId}`);
        } catch (error) {
            console.warn(`[closeTabs] Could not close Tab ID ${tabId}: ${error.message}`);
        }
    }
    console.log(`[closeTabs] Finished. Attempted closing ${closedCount} tab(s).`);
    return closedCount;
}

// --- Listener for Context Menu Clicks ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('[onClicked] Context menu item clicked:', info.menuItemId);

    const selectionToUse = recentSelections[0]; // Use the state before the right-click
    console.log('[onClicked] Using selection state:', JSON.stringify(selectionToUse));

    if (!selectionToUse || !selectionToUse.items || selectionToUse.items.length <= 1) {
        showNotification('No recent multi-tab selection found. Please select multiple tabs first.');
        console.log('[onClicked] The selection state to use did not contain multiple tab items.');
        return;
    }

    // Store the data and action type temporarily for the dialog
    const dataToSave = {
        items: selectionToUse.items,
        closeAfterSave: (info.menuItemId === 'addToFavoritesAndClose')
    };

    try {
        await chrome.storage.local.set({ [TEMP_STORAGE_KEY]: dataToSave });
        console.log('[onClicked] Temporarily stored tab data for dialog.');

        // --- Open the custom dialog window ---
        const window = await chrome.windows.create({
            url: chrome.runtime.getURL("save_dialog.html"),
            type: "popup",
            width: 400,
            height: 450 // Adjust size as needed
        });
        console.log('[onClicked] Opened save dialog window with ID:', window.id);

    } catch (error) {
        console.error('[onClicked] Error storing data or opening dialog:', error);
        showNotification('Error opening save dialog. Check console.');
        // Clean up storage if dialog failed to open
        await chrome.storage.local.remove(TEMP_STORAGE_KEY);
    }
});


// --- Listener for Messages from the Dialog ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`[onMessage] Received message: Action='${message.action}' from sender:`, sender.tab?.id || sender.url);

    if (message.action === "getBookmarkTree") {
        chrome.bookmarks.getTree((tree) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting bookmark tree:", chrome.runtime.lastError);
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                // Send only the relevant parts (usually the first root's children)
                // Chrome's tree structure: Root -> [Bookmark Bar, Other Bookmarks, Mobile Bookmarks]
                // Sending the whole tree allows the dialog to reconstruct it.
                console.log("[onMessage] Sending bookmark tree to dialog.");
                sendResponse({ tree: tree[0].children }); // Send children of the absolute root
            }
        });
        return true; // Indicates response will be sent asynchronously
    }
    // --- Handle the save request from the dialog ---
    else if (message.action === "saveBookmarks") {
        const { folderName, parentId } = message;
        console.log(`[onMessage] Received save request: Name='${folderName}', ParentID='${parentId}'`);

        // Retrieve the temporarily stored tab data
        chrome.storage.local.get(TEMP_STORAGE_KEY, async (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error retrieving stored tab data:", chrome.runtime.lastError);
                sendResponse({ success: false, message: 'Failed to retrieve tab data.' });
                return;
            }
            const savedData = result[TEMP_STORAGE_KEY];

            if (!savedData || !savedData.items) {
                console.error("[onMessage] No tab data found in storage for saving.");
                sendResponse({ success: false, message: 'No tab data found to save.' });
                return;
            }

            // Perform the bookmarking
            const bookmarkResult = await performBookmarkAndNotify(savedData.items, parentId, folderName);

            // Clean up storage regardless of success/failure
            await chrome.storage.local.remove(TEMP_STORAGE_KEY);
            console.log("[onMessage] Cleaned up temporary storage.");

            if (bookmarkResult.success) {
                let notifyMessage = `Successfully bookmarked ${bookmarkResult.count} tab(s) to folder "${bookmarkResult.folderName}".`;

                // Close tabs if requested
                if (savedData.closeAfterSave) {
                    const idsToClose = savedData.items.map(item => item.id);
                    const closedCount = await closeTabs(idsToClose);
                    notifyMessage += `\nAttempted to close ${closedCount} tab(s).`;
                    // Clear history after successful close action
                    recentSelections = [{ items: [] }, { items: [] }];
                    console.log('[onMessage] Cleared selection history after close action.');
                }
                showNotification(notifyMessage);
                sendResponse({ success: true }); // Confirm success back to dialog
            } else {
                // Notification already shown in performBookmarkAndNotify on failure
                sendResponse({ success: false, message: bookmarkResult.message });
            }
        });
        return true; // Indicates response will be sent asynchronously
    }
    else if (message.action === "cancelSave") {
        console.log("[onMessage] Received cancel request from dialog.");
        // Clean up storage if user cancels
        chrome.storage.local.remove(TEMP_STORAGE_KEY, () => {
            console.log("[onMessage] Cleaned up temporary storage after cancellation.");
        });
        // No response needed for cancellation usually
    }

    // Return false if not sending an async response
    // return false;
});
