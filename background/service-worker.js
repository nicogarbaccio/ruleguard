/**
 * GLI Compliance Analyzer - Background Service Worker
 * Handles extension lifecycle events and message passing.
 */

// Extension installation handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('GLI Compliance Analyzer installed');

    // Set default settings
    chrome.storage.local.set({
      aiProvider: 'openai',
      apiKey: '',
      geminiModel: 'gemini-2.0-flash',
      processingMode: 'local',
      maxImageSize: 2048,
      compressionQuality: 0.85
    });
  }
});

// Message handler for communication between popup and background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      chrome.storage.local.get(['apiKey', 'aiProvider', 'maxImageSize'], (result) => {
        sendResponse(result);
      });
      return true; // Keep channel open for async response

    case 'SAVE_SETTINGS':
      chrome.storage.local.set(message.settings, () => {
        sendResponse({ success: true });
      });
      return true;

    case 'ANALYSIS_COMPLETE':
      // Could be used for notifications or badge updates
      if (message.report) {
        const score = message.report.summary?.overallScore;
        if (score !== undefined) {
          // Update badge with score
          const color = score >= 80 ? '#16a34a' : score >= 60 ? '#ea580c' : '#dc2626';
          chrome.action.setBadgeText({ text: `${score}` });
          chrome.action.setBadgeBackgroundColor({ color });
        }
      }
      sendResponse({ success: true });
      return true;

    case 'CLEAR_BADGE':
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// Clear badge when popup opens
chrome.action.onClicked.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});
