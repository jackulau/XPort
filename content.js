// XPort - Content Script
// Extracts article content from X (Twitter) posts and injects download button

(function() {
  'use strict';

  let settings = null;
  let injectedUrls = new Set();

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get({
        defaultFormat: 'pdf',
        defaultIncludeImages: true,
        defaultIncludeThread: true,
        defaultIncludeMetadata: true,
        pdfPageSize: 'a4',
        pdfFontSize: '12',
        pdfDarkMode: false,
        filenamePattern: '{author}_{date}_{id}'
      });
      settings = result;
    } catch (e) {
      settings = {
        defaultFormat: 'pdf',
        defaultIncludeImages: true,
        defaultIncludeThread: true,
        defaultIncludeMetadata: false
      };
    }
  }

  // Toast notification helper
  function showToast(message, type = 'info') {
    const existing = document.querySelector('.xac-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `xac-toast ${type}`;
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${type === 'success'
          ? '<polyline points="20 6 9 17 4 12"></polyline>'
          : type === 'error'
          ? '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
          : '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>'}
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Get the current tweet/post URL info
  function getPostInfo() {
    const url = window.location.href;
    const match = url.match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/);
    if (match) {
      return { author: match[1], postId: match[2], url: url };
    }
    return null;
  }

  // Extract X Article cover image (appears above title)
  function extractCoverImage() {
    // Look for cover image near the article - it's typically before the title
    const article = document.querySelector('article[data-testid="tweet"]');
    if (!article) return null;

    // Look for images that appear before the title or in the article header area
    const titleEl = article.querySelector('[data-testid="twitter-article-title"]');
    if (!titleEl) return null;

    // Find images in the article that are NOT inside twitterArticleRichTextView
    const articleView = article.querySelector('[data-testid="twitterArticleRichTextView"]');
    const allImages = article.querySelectorAll('img[src*="pbs.twimg.com"]');

    for (const img of allImages) {
      // Skip if inside the rich text view (those are inline images)
      if (articleView && articleView.contains(img)) continue;
      // Skip profile images
      if (img.src.includes('profile_images')) continue;
      // Skip tiny images (icons, etc)
      if (img.width < 100 || img.height < 100) continue;

      let src = img.src.replace(/&name=\w+/, '&name=large');
      return src;
    }
    return null;
  }

  // Extract X Article title (long-form posts)
  function extractArticleTitle() {
    // Look for the article title element
    const titleEl = document.querySelector('[data-testid="twitter-article-title"]');
    if (titleEl) {
      return titleEl.textContent.trim();
    }
    return null;
  }

  // Extract X Article content from DraftEditor (long-form posts)
  function extractArticleBody() {
    const content = [];

    // Look for the article rich text view
    const articleView = document.querySelector('[data-testid="twitterArticleRichTextView"]');
    if (!articleView) return null;

    // Get all blocks and images in document order
    const allElements = articleView.querySelectorAll('[data-block="true"], figure img, [data-testid="tweetPhoto"] img');
    const processedImages = new Set();

    allElements.forEach(el => {
      // Check if this is an image
      if (el.tagName === 'IMG') {
        let src = el.src;
        if (src && src.includes('pbs.twimg.com') && !src.includes('profile_images') && !processedImages.has(src)) {
          src = src.replace(/&name=\w+/, '&name=large');
          content.push({ type: 'image', src: src });
          processedImages.add(src);
        }
        return;
      }

      // This is a text block
      const block = el;
      const isHeader = block.querySelector('h2');
      const isBlockquote = block.classList.contains('longform-blockquote');
      const isOrderedListItem = block.classList.contains('longform-ordered-list-item');
      const isUnorderedListItem = block.classList.contains('longform-unordered-list-item');

      // Get all text spans
      let text = '';
      const textSpans = block.querySelectorAll('[data-text="true"]');
      textSpans.forEach(span => {
        text += span.textContent;
      });

      text = text.trim();
      if (!text) return;

      // Skip standalone URLs (link previews, etc.)
      const isStandaloneUrl = /^https?:\/\/[^\s]+$/.test(text);
      if (isStandaloneUrl) return;

      if (isHeader) {
        content.push({ type: 'header', text: text });
      } else if (isBlockquote) {
        content.push({ type: 'blockquote', text: text });
      } else if (isOrderedListItem) {
        content.push({ type: 'ordered-list', text: text });
      } else if (isUnorderedListItem) {
        content.push({ type: 'unordered-list', text: text });
      } else {
        content.push({ type: 'paragraph', text: text });
      }
    });

    return content.length > 0 ? content : null;
  }

  // Extract regular tweet text
  function extractTweetText(tweetElement) {
    const textElements = tweetElement.querySelectorAll('[data-testid="tweetText"]');
    const texts = [];

    textElements.forEach(textElement => {
      let text = '';
      const walker = document.createTreeWalker(
        textElement,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BR') text += '\n';
          else if (node.tagName === 'IMG' && node.alt) text += node.alt;
        }
      }

      const cleanedText = text.trim();
      if (cleanedText && !texts.includes(cleanedText)) {
        texts.push(cleanedText);
      }
    });

    return texts.join('\n\n');
  }

  // Extract images
  function extractImages() {
    const images = [];

    // Get images from article
    const articleImages = document.querySelectorAll('[data-testid="tweetPhoto"] img, [data-testid="twitterArticleRichTextView"] img');
    articleImages.forEach(img => {
      let src = img.src;
      if (src && src.includes('pbs.twimg.com') && !src.includes('profile_images')) {
        src = src.replace(/&name=\w+/, '&name=large');
        if (!images.includes(src)) images.push(src);
      }
    });

    return images;
  }

  // Extract metadata from aria-label
  function extractMetadata() {
    const metadata = {
      date: '', likes: '0', retweets: '0', replies: '0', views: '0', bookmarks: '0'
    };

    // Get time
    const timeEl = document.querySelector('article time');
    if (timeEl) {
      metadata.date = timeEl.getAttribute('datetime') || '';
    }

    // Get stats from aria-label
    const groupEl = document.querySelector('article [role="group"][aria-label]');
    if (groupEl) {
      const label = groupEl.getAttribute('aria-label') || '';
      const replies = label.match(/([\d,]+)\s*repl/i);
      const reposts = label.match(/([\d,]+)\s*repost/i);
      const likes = label.match(/([\d,]+)\s*like/i);
      const bookmarks = label.match(/([\d,]+)\s*bookmark/i);
      const views = label.match(/([\d,]+)\s*view/i);

      if (replies) metadata.replies = replies[1];
      if (reposts) metadata.retweets = reposts[1];
      if (likes) metadata.likes = likes[1];
      if (bookmarks) metadata.bookmarks = bookmarks[1];
      if (views) metadata.views = views[1];
    }

    return metadata;
  }

  // Extract author info
  function extractAuthorInfo() {
    const postInfo = getPostInfo();
    let displayName = postInfo?.author || 'Unknown';
    let username = postInfo ? `@${postInfo.author}` : '';
    let avatar = '';

    const userNameEl = document.querySelector('article [data-testid="User-Name"]');
    if (userNameEl) {
      const spans = userNameEl.querySelectorAll('span');
      spans.forEach(span => {
        const text = span.textContent.trim();
        if (text.startsWith('@')) {
          username = text;
        } else if (text && !text.includes('·') && text.length > 1 && !displayName) {
          displayName = text;
        }
      });

      // Try to get display name from first link
      const nameLink = userNameEl.querySelector('a span');
      if (nameLink && nameLink.textContent.trim()) {
        displayName = nameLink.textContent.trim();
      }
    }

    const avatarImg = document.querySelector('article [data-testid="Tweet-User-Avatar"] img');
    if (avatarImg) avatar = avatarImg.src;

    return { displayName, username, avatar };
  }

  // Main extraction function
  function extractArticle(options = {}) {
    const { includeImages = true, includeMetadata = true } = options;

    const postInfo = getPostInfo();
    if (!postInfo) {
      return { success: false, error: 'Not on a valid X/Twitter post page' };
    }

    // Try to extract X Article (long-form) content first
    const articleTitle = extractArticleTitle();
    const articleBody = extractArticleBody();
    const coverImage = includeImages ? extractCoverImage() : null;

    // Fall back to regular tweet text
    const mainTweet = document.querySelector('article[data-testid="tweet"]');
    const regularText = mainTweet ? extractTweetText(mainTweet) : '';

    const author = extractAuthorInfo();
    const metadata = includeMetadata ? extractMetadata() : {};

    // Build content - articleBody now includes inline images
    let contentParagraphs = [];

    // Add cover image first if present
    if (coverImage) {
      contentParagraphs.push({ type: 'cover-image', src: coverImage });
    }

    if (articleBody && articleBody.length > 0) {
      // For X Articles, images are already inline in articleBody
      contentParagraphs = contentParagraphs.concat(articleBody);
    } else if (regularText) {
      // For regular tweets, add text then images at end
      contentParagraphs.push({ type: 'paragraph', text: regularText });
      if (includeImages) {
        const images = extractImages();
        images.forEach(src => contentParagraphs.push({ type: 'image', src }));
      }
    }

    const hasContent = contentParagraphs.some(block => block.text || block.src);

    if (!hasContent) {
      return { success: false, error: 'Could not extract article content' };
    }

    // Highlight extraction
    if (mainTweet) {
      mainTweet.classList.add('xac-extracting');
      setTimeout(() => mainTweet.classList.remove('xac-extracting'), 1500);
    }

    return {
      success: true,
      data: {
        postInfo,
        title: articleTitle,
        content: contentParagraphs,
        author,
        metadata,
        extractedAt: new Date().toISOString(),
        options: { includeImages, includeMetadata }
      }
    };
  }

  // Generate filename
  function generateFilename(postInfo, format) {
    const pattern = settings?.filenamePattern || '{author}_{date}_{id}';
    const date = new Date().toISOString().split('T')[0];
    let filename = pattern
      .replace('{author}', postInfo.author || 'unknown')
      .replace('{date}', date)
      .replace('{id}', postInfo.postId || 'post')
      .replace(/[<>:"/\\|?*]/g, '_');
    const extensions = { pdf: '.pdf', markdown: '.md', html: '.html', text: '.txt' };
    return filename + (extensions[format] || '.txt');
  }

  // Format date
  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // Convert to Markdown
  function convertToMarkdown(data) {
    let md = `# ${data.author.displayName} ${data.author.username}\n\n`;

    // Cover image above title
    const coverImage = data.content.find(block => block.type === 'cover-image');
    if (coverImage && data.options.includeImages) {
      md += `![Cover](${coverImage.src})\n\n`;
    }

    if (data.title) md += `## ${data.title}\n\n`;
    md += '---\n\n';

    let imgCount = 0;
    data.content.forEach(block => {
      switch (block.type) {
        case 'cover-image':
          // Already handled above
          break;
        case 'header':
          md += `### ${block.text}\n\n`;
          break;
        case 'blockquote':
          md += `> ${block.text.split('\n').join('\n> ')}\n\n`;
          break;
        case 'ordered-list':
          md += `1. ${block.text}\n`;
          break;
        case 'unordered-list':
          md += `- ${block.text}\n`;
          break;
        case 'image':
          if (data.options.includeImages) {
            imgCount++;
            md += `![Image ${imgCount}](${block.src})\n\n`;
          }
          break;
        default:
          if (block.text) md += `${block.text}\n\n`;
      }
    });

    if (data.options.includeMetadata) {
      md += '\n---\n\n### Engagement\n\n';
      md += `- Likes: ${data.metadata.likes}\n`;
      md += `- Reposts: ${data.metadata.retweets}\n`;
      md += `- Replies: ${data.metadata.replies}\n`;
      if (data.metadata.views !== '0') md += `- Views: ${data.metadata.views}\n`;
    }

    // Citation at bottom
    md += '\n---\n\n';
    md += `**Source:** ${data.postInfo.url}\n`;
    if (data.metadata.date) md += `**Posted:** ${formatDate(data.metadata.date)}\n`;
    md += `\n*Exported with XPort on ${new Date().toLocaleDateString()}*\n`;
    return md;
  }

  // Convert to HTML
  function convertToHTML(data, isDarkMode = false) {
    const esc = t => (t || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

    // Theme colors
    const theme = isDarkMode ? {
      bg: '#000', text: '#e7e9ea', secondary: '#71767b', border: '#2f3336', accent: '#1d9bf0'
    } : {
      bg: '#fff', text: '#0f1419', secondary: '#536471', border: '#eff3f4', accent: '#1d9bf0'
    };

    // Find cover image
    const coverImage = data.content.find(block => block.type === 'cover-image');

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(data.title || data.author.displayName + ' on X')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: ${theme.bg}; color: ${theme.text}; padding: 40px 20px; line-height: 1.6; max-width: 700px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .avatar { width: 48px; height: 48px; border-radius: 50%; }
    .author h1 { font-size: 18px; font-weight: 700; }
    .author p { color: ${theme.secondary}; font-size: 14px; }
    .cover-image { width: 100%; border-radius: 16px; margin-bottom: 24px; }
    .title { font-size: 28px; font-weight: 800; margin-bottom: 24px; line-height: 1.3; }
    .content { font-size: 17px; }
    .content p { margin-bottom: 16px; }
    .content h3 { font-size: 20px; font-weight: 700; margin: 32px 0 16px; }
    .content blockquote { border-left: 4px solid ${theme.accent}; padding-left: 16px; margin: 16px 0; color: ${theme.secondary}; font-style: italic; }
    .content ul, .content ol { margin: 16px 0; padding-left: 24px; }
    .content li { margin-bottom: 8px; }
    .content img { max-width: 100%; border-radius: 16px; margin: 16px 0; }
    .engagement { display: flex; gap: 24px; margin-top: 24px; padding-top: 16px; border-top: 1px solid ${theme.border}; color: ${theme.secondary}; font-size: 14px; }
    .citation { margin-top: 24px; padding-top: 16px; border-top: 1px solid ${theme.border}; color: ${theme.secondary}; font-size: 14px; }
    .citation a { color: ${theme.accent}; text-decoration: none; }
    .footer { margin-top: 16px; padding-top: 16px; border-top: 1px solid ${theme.border}; text-align: center; color: ${theme.secondary}; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    ${data.author.avatar ? `<img src="${esc(data.author.avatar)}" alt="" class="avatar">` : ''}
    <div class="author">
      <h1>${esc(data.author.displayName)}</h1>
      <p>${esc(data.author.username)}</p>
    </div>
  </div>
  ${coverImage && data.options.includeImages ? `<img src="${esc(coverImage.src)}" alt="Cover" class="cover-image">` : ''}
  ${data.title ? `<h2 class="title">${esc(data.title)}</h2>` : ''}
  <div class="content">`;

    let inList = false;
    let listType = '';

    data.content.forEach((block, i) => {
      const nextBlock = data.content[i + 1];
      const isNextList = nextBlock && (nextBlock.type === 'ordered-list' || nextBlock.type === 'unordered-list');

      if (block.type === 'ordered-list' || block.type === 'unordered-list') {
        if (!inList) {
          listType = block.type === 'ordered-list' ? 'ol' : 'ul';
          html += `<${listType}>`;
          inList = true;
        }
        html += `<li>${esc(block.text)}</li>`;
        if (!isNextList || (nextBlock && nextBlock.type !== block.type)) {
          html += `</${listType}>`;
          inList = false;
        }
      } else {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
        switch (block.type) {
          case 'cover-image':
            // Already handled above title
            break;
          case 'header':
            html += `<h3>${esc(block.text)}</h3>`;
            break;
          case 'blockquote':
            html += `<blockquote>${esc(block.text)}</blockquote>`;
            break;
          case 'image':
            if (data.options.includeImages) {
              html += `<img src="${esc(block.src)}" alt="Image">`;
            }
            break;
          default:
            if (block.text) html += `<p>${esc(block.text)}</p>`;
        }
      }
    });

    if (inList) html += `</${listType}>`;

    html += `</div>`;

    if (data.options.includeMetadata) {
      html += `<div class="engagement">
        <span>${data.metadata.likes} Likes</span>
        <span>${data.metadata.retweets} Reposts</span>
        <span>${data.metadata.replies} Replies</span>
        ${data.metadata.views !== '0' ? `<span>${data.metadata.views} Views</span>` : ''}
      </div>`;
    }

    // Citation at bottom
    html += `<div class="citation">
      <strong>Source:</strong> <a href="${esc(data.postInfo.url)}">${esc(data.postInfo.url)}</a>
      ${data.metadata.date ? `<br><strong>Posted:</strong> ${formatDate(data.metadata.date)}` : ''}
    </div>`;

    html += `<div class="footer">Exported with XPort on ${new Date().toLocaleDateString()}</div>
</body></html>`;

    return html;
  }

  // Convert to plain text
  function convertToText(data) {
    let text = `${data.author.displayName} ${data.author.username}\n${'='.repeat(60)}\n\n`;

    // Cover image above title
    const coverImage = data.content.find(block => block.type === 'cover-image');
    if (coverImage && data.options.includeImages) {
      text += `[Cover Image: ${coverImage.src}]\n\n`;
    }

    if (data.title) text += `${data.title}\n${'='.repeat(60)}\n\n`;

    let listNum = 1;
    let imgNum = 0;
    data.content.forEach(block => {
      switch (block.type) {
        case 'cover-image':
          // Already handled above
          break;
        case 'header':
          text += `\n## ${block.text}\n\n`;
          listNum = 1;
          break;
        case 'blockquote':
          text += `> ${block.text}\n\n`;
          break;
        case 'ordered-list':
          text += `${listNum}. ${block.text}\n`;
          listNum++;
          break;
        case 'unordered-list':
          text += `• ${block.text}\n`;
          break;
        case 'image':
          if (data.options.includeImages) {
            imgNum++;
            text += `\n[Image ${imgNum}: ${block.src}]\n\n`;
          }
          break;
        default:
          if (block.text) {
            text += `${block.text}\n\n`;
            listNum = 1;
          }
      }
    });

    if (data.options.includeMetadata) {
      text += `\n${'-'.repeat(60)}\n\n`;
      text += `Likes: ${data.metadata.likes} | Reposts: ${data.metadata.retweets} | Replies: ${data.metadata.replies}`;
      if (data.metadata.views !== '0') text += ` | Views: ${data.metadata.views}`;
      text += '\n';
    }

    // Citation at bottom
    text += `\n${'-'.repeat(60)}\n\n`;
    text += `Source: ${data.postInfo.url}\n`;
    if (data.metadata.date) text += `Posted: ${formatDate(data.metadata.date)}\n`;
    text += `\nExported with XPort on ${new Date().toLocaleDateString()}\n`;
    return text;
  }

  // Download file
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // View content in new tab
  function viewContent(content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  // Handle action (view or download)
  async function handleAction(format, action = 'download') {
    await loadSettings();

    const options = {
      includeImages: settings.defaultIncludeImages,
      includeMetadata: settings.defaultIncludeMetadata
    };

    showToast('Extracting article...', 'loading');

    const result = extractArticle(options);

    if (!result.success) {
      showToast(result.error, 'error');
      return;
    }

    const data = result.data;
    const filename = generateFilename(data.postInfo, format);

    try {
      let content, mimeType;

      const isDarkMode = settings.pdfDarkMode || false;

      switch (format) {
        case 'pdf':
          // Generate HTML and open print dialog
          content = convertToHTML(data, isDarkMode);
          if (action === 'view') {
            viewContent(content, 'text/html');
            showToast('Opened preview', 'success');
          } else {
            // Create iframe for print
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
            document.body.appendChild(iframe);
            iframe.contentDocument.open();
            iframe.contentDocument.write(content);
            iframe.contentDocument.close();
            setTimeout(() => {
              iframe.contentWindow.print();
              setTimeout(() => iframe.remove(), 1000);
            }, 500);
            showToast('Opening print dialog...', 'success');
          }
          return;

        case 'markdown':
          content = convertToMarkdown(data);
          mimeType = 'text/markdown';
          break;
        case 'html':
          content = convertToHTML(data, isDarkMode);
          mimeType = 'text/html';
          break;
        case 'text':
          content = convertToText(data);
          mimeType = 'text/plain';
          break;
      }

      if (action === 'view') {
        viewContent(content, mimeType);
        showToast('Opened preview', 'success');
      } else {
        downloadFile(content, filename, mimeType);
        showToast(`Downloaded as ${format.toUpperCase()}!`, 'success');
      }

    } catch (error) {
      showToast('Failed: ' + error.message, 'error');
    }
  }

  // Create download button
  function createDownloadButton() {
    const btn = document.createElement('div');
    btn.className = 'xac-download-btn css-175oi2r r-18u37iz r-1h0z5md';
    btn.innerHTML = `
      <button class="xac-btn" title="Save article">
        <div class="xac-btn-inner">
          <svg viewBox="0 0 24 24" width="18.75" height="18.75">
            <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/>
          </svg>
        </div>
      </button>
      <div class="xac-dropdown">
        <div class="xac-dropdown-header">Download</div>
        <button class="xac-dropdown-item" data-format="pdf" data-action="download">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2l5 5h-5V4zM9 13h6v2H9v-2zm0 4h6v2H9v-2z"/></svg>
          PDF
        </button>
        <button class="xac-dropdown-item" data-format="markdown" data-action="download">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20.56 18H3.44C2.65 18 2 17.37 2 16.59V7.41C2 6.63 2.65 6 3.44 6h17.12c.79 0 1.44.63 1.44 1.41v9.18c0 .78-.65 1.41-1.44 1.41zM6.81 15.19v-3.68l1.33 1.64 1.33-1.64v3.68h1.33V8.81H9.47l-1.33 1.64-1.33-1.64H5.48v6.38h1.33zm6.27-6.38h-1.33v6.38h1.33V8.81zm6.12 3.19l-2-2.19v1.64h-1.33v1.1h1.33v1.64l2-2.19z"/></svg>
          Markdown
        </button>
        <button class="xac-dropdown-item" data-format="html" data-action="download">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 17.56L16.07 16l.34-3.77H12v-2.4h4.75l.1-1.08.42-4.75H6.73l.1 1.08h5.33v2.4H7.07l-.1 1.08-.34 3.77h5.5v2.4L7.93 16 12 17.56z"/></svg>
          HTML
        </button>
        <div class="xac-dropdown-header">Preview</div>
        <button class="xac-dropdown-item" data-format="pdf" data-action="view">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          PDF
        </button>
        <button class="xac-dropdown-item" data-format="markdown" data-action="view">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          Markdown
        </button>
        <button class="xac-dropdown-item" data-format="html" data-action="view">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          HTML
        </button>
      </div>
    `;
    return btn;
  }

  // Inject button into tweet action bar
  function injectButton() {
    const postInfo = getPostInfo();
    if (!postInfo) return;

    const currentUrl = postInfo.url;
    if (injectedUrls.has(currentUrl)) return;

    // Find the action bar
    const actionBars = document.querySelectorAll('article[data-testid="tweet"] [role="group"][aria-label]');

    actionBars.forEach(actionBar => {
      if (actionBar.querySelector('.xac-download-btn')) return;

      // Find bookmark button and insert BEFORE it
      const bookmarkBtn = actionBar.querySelector('[data-testid="bookmark"]');
      if (!bookmarkBtn) return;

      const bookmarkContainer = bookmarkBtn.closest('div.css-175oi2r');
      if (!bookmarkContainer || bookmarkContainer.parentElement !== actionBar) return;

      const btn = createDownloadButton();
      actionBar.insertBefore(btn, bookmarkContainer);

      // Event listeners
      const mainBtn = btn.querySelector('.xac-btn');
      const dropdown = btn.querySelector('.xac-dropdown');
      const dropdownItems = btn.querySelectorAll('.xac-dropdown-item');

      mainBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close other dropdowns
        document.querySelectorAll('.xac-dropdown.show').forEach(d => {
          if (d !== dropdown) d.classList.remove('show');
        });
        dropdown.classList.toggle('show');
      });

      dropdownItems.forEach(item => {
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropdown.classList.remove('show');
          const format = item.dataset.format;
          const action = item.dataset.action;
          await handleAction(format, action);
        });
      });

      injectedUrls.add(currentUrl);
    });
  }

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.xac-download-btn')) {
      document.querySelectorAll('.xac-dropdown.show').forEach(d => d.classList.remove('show'));
    }
  });

  // Observe DOM for changes
  function observeDOM() {
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        injectedUrls.clear();
      }
      if (getPostInfo()) {
        setTimeout(injectButton, 300);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractArticle') {
      sendResponse(extractArticle(request.options));
    } else if (request.action === 'checkPage') {
      sendResponse({ isValidPage: !!getPostInfo(), postInfo: getPostInfo() });
    } else if (request.action === 'showToast') {
      showToast(request.message, request.type);
      sendResponse({ success: true });
    }
    return true;
  });

  // Initialize
  async function init() {
    await loadSettings();
    observeDOM();
    if (getPostInfo()) setTimeout(injectButton, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('XPort: Content script loaded');
})();
