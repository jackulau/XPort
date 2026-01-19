// Default settings
const DEFAULT_SETTINGS = {
  defaultFormat: 'pdf',
  defaultIncludeImages: true,
  defaultIncludeThread: true,
  defaultIncludeMetadata: true,
  pdfPageSize: 'a4',
  pdfFontSize: '12',
  pdfDarkMode: false,
  filenamePattern: '{author}_{date}_{id}'
};

// DOM elements
const elements = {
  formatRadios: document.querySelectorAll('input[name="defaultFormat"]'),
  includeImages: document.getElementById('defaultIncludeImages'),
  includeThread: document.getElementById('defaultIncludeThread'),
  includeMetadata: document.getElementById('defaultIncludeMetadata'),
  pdfPageSize: document.getElementById('pdfPageSize'),
  pdfFontSize: document.getElementById('pdfFontSize'),
  pdfDarkMode: document.getElementById('pdfDarkMode'),
  filenamePattern: document.getElementById('filenamePattern'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  saveStatus: document.getElementById('saveStatus')
};

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    applySettingsToUI(result);
  } catch (error) {
    console.error('Error loading settings:', error);
    applySettingsToUI(DEFAULT_SETTINGS);
  }
}

// Apply settings to UI elements
function applySettingsToUI(settings) {
  // Set format radio
  elements.formatRadios.forEach(radio => {
    radio.checked = radio.value === settings.defaultFormat;
  });

  // Set checkboxes
  elements.includeImages.checked = settings.defaultIncludeImages;
  elements.includeThread.checked = settings.defaultIncludeThread;
  elements.includeMetadata.checked = settings.defaultIncludeMetadata;
  elements.pdfDarkMode.checked = settings.pdfDarkMode;

  // Set selects
  elements.pdfPageSize.value = settings.pdfPageSize;
  elements.pdfFontSize.value = settings.pdfFontSize;

  // Set text input
  elements.filenamePattern.value = settings.filenamePattern;
}

// Get current settings from UI
function getSettingsFromUI() {
  let selectedFormat = 'pdf';
  elements.formatRadios.forEach(radio => {
    if (radio.checked) selectedFormat = radio.value;
  });

  return {
    defaultFormat: selectedFormat,
    defaultIncludeImages: elements.includeImages.checked,
    defaultIncludeThread: elements.includeThread.checked,
    defaultIncludeMetadata: elements.includeMetadata.checked,
    pdfPageSize: elements.pdfPageSize.value,
    pdfFontSize: elements.pdfFontSize.value,
    pdfDarkMode: elements.pdfDarkMode.checked,
    filenamePattern: elements.filenamePattern.value || DEFAULT_SETTINGS.filenamePattern
  };
}

// Save settings
async function saveSettings() {
  try {
    const settings = getSettingsFromUI();
    await chrome.storage.sync.set(settings);
    showSaveStatus();
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Reset to defaults
async function resetSettings() {
  try {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    applySettingsToUI(DEFAULT_SETTINGS);
    showSaveStatus();
  } catch (error) {
    console.error('Error resetting settings:', error);
  }
}

// Show save status message
function showSaveStatus() {
  elements.saveStatus.classList.remove('hidden');
  setTimeout(() => {
    elements.saveStatus.classList.add('hidden');
  }, 3000);
}

// Event listeners
elements.saveBtn.addEventListener('click', saveSettings);
elements.resetBtn.addEventListener('click', resetSettings);

// Load settings on page load
document.addEventListener('DOMContentLoaded', loadSettings);
