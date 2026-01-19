// XPort - Background Service Worker

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

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  const settings = { ...DEFAULT_SETTINGS, ...existing };
  await chrome.storage.sync.set(settings);
  console.log('XPort: Extension installed');
});

// Generate filename based on pattern
function generateFilename(pattern, postInfo, format) {
  const date = new Date().toISOString().split('T')[0];
  let filename = pattern
    .replace('{author}', postInfo.author || 'unknown')
    .replace('{date}', date)
    .replace('{id}', postInfo.postId || 'post')
    .replace(/[<>:"/\\|?*]/g, '_');

  const extensions = { pdf: '.pdf', markdown: '.md', html: '.html', text: '.txt' };
  return filename + (extensions[format] || '.txt');
}

// Format date for display
function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Generate PDF HTML for printing
function generatePrintableHTML(data, settings) {
  const { mainTweet, tweets, postInfo, options } = data;
  const escapeHtml = (text) => {
    if (!text) return '';
    return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  };

  const isDark = settings.pdfDarkMode;
  const fontSize = parseInt(settings.pdfFontSize) || 12;

  const bgColor = isDark ? '#000' : '#fff';
  const textColor = isDark ? '#e7e9ea' : '#0f1419';
  const secondaryColor = isDark ? '#71767b' : '#536471';
  const borderColor = isDark ? '#2f3336' : '#eff3f4';
  const accentColor = '#1d9bf0';

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(mainTweet.title || mainTweet.author.displayName + ' - X Article')}</title>
  <style>
    @page { size: ${settings.pdfPageSize || 'a4'}; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: ${bgColor} !important;
      color: ${textColor} !important;
      font-size: ${fontSize}pt;
      line-height: 1.6;
      padding: 40px;
    }
    .header { margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
    .avatar { width: 48px; height: 48px; border-radius: 50%; }
    .author-info h1 { font-size: ${fontSize + 4}pt; font-weight: 700; color: ${textColor} !important; }
    .author-info p { color: ${secondaryColor} !important; font-size: ${fontSize - 2}pt; }
    .title { font-size: ${fontSize + 8}pt; font-weight: 800; margin: 24px 0 16px; line-height: 1.3; color: ${textColor} !important; }
    .meta { color: ${secondaryColor} !important; font-size: ${fontSize - 2}pt; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid ${borderColor} !important; }
    .meta a { color: ${accentColor} !important; text-decoration: none; }
    .content { margin-bottom: 24px; color: ${textColor} !important; }
    .content p { margin-bottom: 16px; white-space: pre-wrap; color: ${textColor} !important; }
    .content img { max-width: 100%; border-radius: 12px; margin: 16px 0; }
    .thread-divider { border: none; border-top: 1px solid ${borderColor} !important; margin: 24px 0; }
    .thread-indicator { color: ${accentColor} !important; font-weight: 600; margin-bottom: 12px; }
    .engagement { display: flex; gap: 24px; margin-top: 24px; padding-top: 16px; border-top: 1px solid ${borderColor} !important; color: ${secondaryColor} !important; font-size: ${fontSize - 2}pt; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid ${borderColor} !important; text-align: center; color: ${secondaryColor} !important; font-size: ${fontSize - 4}pt; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { background: ${bgColor} !important; color: ${textColor} !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${mainTweet.author.avatar ? `<img src="${escapeHtml(mainTweet.author.avatar)}" alt="" class="avatar">` : ''}
    <div class="author-info">
      <h1>${escapeHtml(mainTweet.author.displayName)}</h1>
      <p>${escapeHtml(mainTweet.author.username)}</p>
    </div>
  </div>

  ${mainTweet.title ? `<h2 class="title">${escapeHtml(mainTweet.title)}</h2>` : ''}

  <div class="meta">
    <a href="${escapeHtml(postInfo.url)}">${escapeHtml(postInfo.url)}</a>
    ${mainTweet.metadata?.date ? `<br>${formatDate(mainTweet.metadata.date)}` : ''}
  </div>

  <div class="content">`;

  tweets.forEach((tweet, index) => {
    if (tweets.length > 1 && index > 0) {
      html += `<hr class="thread-divider">`;
    }
    if (tweets.length > 1) {
      html += `<div class="thread-indicator">Part ${index + 1} of ${tweets.length}</div>`;
    }

    if (tweet.text) {
      const paragraphs = tweet.text.split(/\n\n+/);
      paragraphs.forEach(p => {
        const trimmed = p.trim();
        if (trimmed) {
          html += `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
        }
      });
    }

    if (options.includeImages && tweet.images && tweet.images.length > 0) {
      tweet.images.forEach(img => {
        html += `<img src="${escapeHtml(img)}" alt="Image">`;
      });
    }

    if (tweet.video?.hasVideo) {
      html += `<p style="color: ${secondaryColor}; font-style: italic;">[Video attached to original post]</p>`;
    }
  });

  html += `</div>`;

  if (options.includeMetadata && mainTweet.metadata) {
    html += `
  <div class="engagement">
    <span>${mainTweet.metadata.likes || '0'} Likes</span>
    <span>${mainTweet.metadata.retweets || '0'} Reposts</span>
    <span>${mainTweet.metadata.replies || '0'} Replies</span>
    ${mainTweet.metadata.views && mainTweet.metadata.views !== '0' ? `<span>${mainTweet.metadata.views} Views</span>` : ''}
  </div>`;
  }

  html += `
  <div class="footer">
    Exported with XPort on ${new Date().toLocaleDateString()}
  </div>
</body>
</html>`;

  return html;
}

// Handle PDF generation by opening print dialog
async function handlePDFGeneration(data, settings, tabId) {
  const html = generatePrintableHTML(data, settings);
  const filename = generateFilename(
    settings.filenamePattern || DEFAULT_SETTINGS.filenamePattern,
    data.postInfo,
    'pdf'
  );

  // Create a blob URL for the HTML
  const blob = new Blob([html], { type: 'text/html' });

  // We'll inject a script to create the HTML and trigger print
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (htmlContent, fname) => {
        // Create an iframe for printing
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        document.body.appendChild(iframe);

        iframe.contentDocument.open();
        iframe.contentDocument.write(htmlContent);
        iframe.contentDocument.close();

        // Wait for content to load then print
        iframe.onload = () => {
          setTimeout(() => {
            iframe.contentWindow.print();
            // Remove iframe after a delay
            setTimeout(() => iframe.remove(), 1000);
          }, 500);
        };

        // Also create download link for the HTML as backup
        const downloadHtml = document.createElement('a');
        downloadHtml.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
        downloadHtml.download = fname.replace('.pdf', '.html');

        return true;
      },
      args: [html, filename]
    });

    return { success: true };
  } catch (error) {
    console.error('PDF generation error:', error);
    return { success: false, error: error.message };
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generatePDF') {
    handlePDFGeneration(request.data, request.settings, sender.tab.id)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'getSettings') {
    chrome.storage.sync.get(DEFAULT_SETTINGS)
      .then(sendResponse)
      .catch(() => sendResponse(DEFAULT_SETTINGS));
    return true;
  }

  if (request.action === 'convert') {
    // This is for backward compatibility with popup
    const { data, format, settings } = request;

    if (format === 'pdf') {
      sendResponse({ success: true, content: generatePrintableHTML(data, settings), format: 'html' });
    } else {
      sendResponse({ success: true, format });
    }
    return true;
  }
});
