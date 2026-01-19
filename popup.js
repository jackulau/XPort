// XPort - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  const includeImages = document.getElementById('includeImages');
  const includeMetadata = document.getElementById('includeMetadata');
  const darkMode = document.getElementById('darkMode');
  const saveStatus = document.getElementById('saveStatus');

  // Load saved settings
  chrome.storage.sync.get({
    defaultIncludeImages: true,
    defaultIncludeMetadata: true,
    pdfDarkMode: false
  }, function(items) {
    if (chrome.runtime.lastError) {
      console.error('Error loading settings:', chrome.runtime.lastError);
      return;
    }
    includeImages.checked = items.defaultIncludeImages;
    includeMetadata.checked = items.defaultIncludeMetadata;
    darkMode.checked = items.pdfDarkMode;
  });

  // Show saved indicator
  function showSaved() {
    saveStatus.classList.add('show');
    setTimeout(function() {
      saveStatus.classList.remove('show');
    }, 1500);
  }

  // Save settings when any toggle changes
  function saveSettings() {
    chrome.storage.sync.set({
      defaultIncludeImages: includeImages.checked,
      defaultIncludeMetadata: includeMetadata.checked,
      pdfDarkMode: darkMode.checked
    }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving settings:', chrome.runtime.lastError);
        return;
      }
      showSaved();
    });
  }

  // Attach event listeners
  includeImages.addEventListener('change', saveSettings);
  includeMetadata.addEventListener('change', saveSettings);
  darkMode.addEventListener('change', saveSettings);
});
