/**
 * GLI Compliance Analyzer - Content Script
 * Optional: Provides page interaction capabilities.
 * Can capture visible page content or interact with game help screens.
 */

// Listen for messages from the popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CAPTURE_PAGE_TEXT':
      const text = document.body.innerText || document.body.textContent;
      sendResponse({ text: text.substring(0, 50000) }); // Limit to 50k chars
      break;

    case 'CAPTURE_IMAGES':
      const images = Array.from(document.querySelectorAll('img'))
        .filter(img => img.naturalWidth > 100 && img.naturalHeight > 100)
        .map(img => ({
          src: img.src,
          alt: img.alt,
          width: img.naturalWidth,
          height: img.naturalHeight
        }));
      sendResponse({ images });
      break;

    case 'GET_PAGE_INFO':
      sendResponse({
        title: document.title,
        url: window.location.href,
        hasImages: document.querySelectorAll('img').length > 0
      });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true;
});
