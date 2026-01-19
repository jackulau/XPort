# XPort

A Chrome extension to export X (Twitter) articles to PDF, Markdown, HTML, or plain text.
# Demo

https://github.com/user-attachments/assets/4fb39d0e-9223-4595-ae64-baafdf952c27

## Features

- **Multiple Export Formats**: PDF, Markdown, HTML, and plain text
- **Download or Preview**: Save files directly or preview in a new tab
- **Inline Images**: Captures images in their original position within articles
- **Cover Image Support**: Extracts cover images that appear above article titles
- **Customizable Output**: Toggle images, metadata, and dark mode for PDFs
- **Native Integration**: Book icon appears directly in X's action bar

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder

## Usage

1. Navigate to any X article (long-form posts with a "Read more" indicator)
2. Click the **book icon** in the article's action bar (next to like, repost, etc.)
3. Choose your preferred format and action:
   - **Download**: Saves the file to your computer
   - **Preview**: Opens the content in a new tab

## Settings

Click the extension icon in your browser toolbar to access settings:

| Option | Default | Description |
|--------|---------|-------------|
| Include Images | On | Embed images in the exported file |
| Include Metadata | Off | Include likes, reposts, replies count |
| Dark Mode Output | Off | Use dark theme for PDF exports |

## Supported Formats

| Format | Extension | Best For |
|--------|-----------|----------|
| PDF | `.pdf` | Printing, sharing, archiving |
| Markdown | `.md` | Note-taking apps, GitHub, blogs |
| HTML | `.html` | Web viewing, further editing |
| Plain Text | `.txt` | Simple reading, copying content |

## File Structure

```
XPort/
├── manifest.json       # Extension configuration
├── background.js       # Service worker for PDF generation
├── content.js          # Article extraction and UI injection
├── popup.html          # Extension popup interface
├── popup.js            # Popup settings logic
├── options.html        # Full settings page
├── options.js          # Settings page logic
├── styles/
│   ├── content.css     # Injected button styles
│   └── options.css     # Settings page styles
└── icons/              # Extension icons
```

## Permissions

- `activeTab`: Access the current tab to extract article content
- `storage`: Save user preferences
- `scripting`: Inject scripts for PDF generation

## License

MIT
