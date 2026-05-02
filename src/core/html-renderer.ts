import type { ReceiptData } from "./receipt-generator.js";
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
} from "../utils/formatting.js";

// Shareable receipt data structure (matches worker/src/types.ts)
export interface ShareableReceiptData {
  sessionSlug: string;
  location: string;
  sessionDate: string;
  timezone?: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelBreakdowns: Array<{
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    cost: number;
  }>;
  userMessageCount: number;
  assistantMessageCount: number;
  totalMessages: number;
}

const SHARE_API_URL = "https://github.com/AnubhavLakra10/LLMreceipts";

export class HtmlRenderer {
  /**
   * Extract shareable data from receipt data (excludes sensitive fields)
   */
  getShareableData(data: ReceiptData): ShareableReceiptData {
    return {
      sessionSlug: data.transcriptData.sessionSlug,
      location: data.location,
      sessionDate: data.transcriptData.endTime.toISOString(),
      timezone: data.config.timezone,
      totalCost: data.sessionData.totalCost,
      totalTokens: data.sessionData.totalTokens,
      inputTokens: data.sessionData.inputTokens,
      outputTokens: data.sessionData.outputTokens,
      cacheCreationTokens: data.sessionData.cacheCreationTokens || 0,
      cacheReadTokens: data.sessionData.cacheReadTokens || 0,
      modelBreakdowns: (data.sessionData.modelBreakdowns || []).map((m) => ({
        modelName: m.modelName,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheCreationTokens: m.cacheCreationTokens,
        cacheReadTokens: m.cacheReadTokens,
        cost: m.cost,
      })),
      userMessageCount: data.transcriptData.userMessageCount,
      assistantMessageCount: data.transcriptData.assistantMessageCount,
      totalMessages: data.transcriptData.totalMessages,
    };
  }

  /**
   * Generate HTML receipt with embedded CSS
   */
  generateHtml(data: ReceiptData, receiptText: string): string {
    const shareableData = this.getShareableData(data);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.config.company ? data.config.company + ' - ' : 'Claude '}Receipt - ${data.transcriptData.sessionSlug}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      background: #3a3a3a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .receipt-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
    }

    .receipt {
      background: #f8f8f8;
      width: 400px;
      padding: 30px 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      position: relative;
      animation: slideIn 0.5s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .receipt::before,
    .receipt::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      height: 15px;
      background: repeating-linear-gradient(
        90deg,
        transparent,
        transparent 10px,
        #f8f8f8 10px,
        #f8f8f8 20px
      );
    }

    .receipt::before {
      top: -15px;
      left: -10px;
    }

    .receipt::after {
      bottom: -15px;
    }

    .receipt-content {
      color: #333;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .header {
      text-align: center;
      padding: 20px 0;
    }

    .logo {
      line-height: 1.2;
      font-weight: bold;
      white-space: pre;
      display: inline-block;
      margin: 10px 0;
    }

    .separator {
      border-bottom: 2px solid #333;
      margin: 15px 0;
    }

    .light-separator {
      border-bottom: 1px dashed #999;
      margin: 10px 0;
    }

    .summary {
      background: #fff;
      padding: 15px;
      margin: 15px 0;
      border-left: 4px solid #333;
    }

    .line-item {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      color: #555;
    }

    .model-header {
      display: flex;
      justify-content: space-between;
      padding: 8px 0 4px 0;
      margin-top: 10px;
      border-bottom: 1px dashed #ccc;
    }

    .model-header:first-child {
      margin-top: 0;
    }

    .model-name {
      font-weight: bold;
      color: #333;
    }

    .model-cost {
      font-weight: bold;
      color: #333;
    }

    .total-section {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 2px solid #333;
    }

    .total {
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
    }

    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px dashed #999;
      color: #666;
    }

    .footer-message {
      margin: 15px 0;
      color: #333;
    }

    .meta {
      margin: 10px 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .meta-row {
      color: #666;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 1px;
      text-align: left;
    }

    .meta .dots {
      overflow: hidden;
      text-wrap: auto;
      word-wrap: break-word;
      height: 1rem;
    }

    .meta .value {
      text-align: right;
    }

    .download-link {
      text-align: center;
      margin-top: 20px;
    }

    .download-link a {
      display: inline-block;
      padding: 10px 20px;
      background: #333;
      color: white;
      text-decoration: none;
      border-radius: 5px;
      transition: background 0.3s;
    }

    .download-link a:hover {
      background: #000;
    }

    .company-header {
      text-align: center;
      margin-bottom: 10px;
    }

    .company-logo svg {
      width: 140px;
      height: auto;
    }

    .company-name {
      font-size: 11px;
      font-weight: bold;
      letter-spacing: 1px;
      color: #333;
      margin-top: 6px;
      text-transform: uppercase;
    }

    .company-divider {
      border-bottom: 2px solid #009DF0;
      margin: 12px 0;
    }

    .generated-by {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px dashed #999;
    }

    .share-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .share-btn {
      background: #333;
      color: white;
      border: none;
      padding: 12px 24px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      cursor: pointer;
      border-radius: 5px;
      transition: background 0.3s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .share-btn:hover {
      background: #000;
    }

    .share-btn:disabled {
      background: #666;
      cursor: not-allowed;
    }

    .share-btn.success {
      background: #2d5a27;
    }

    .share-btn.error {
      background: #8b2020;
    }

    .share-result {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      animation: fadeIn 0.3s ease-out;
    }

    .share-result.visible {
      display: flex;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .share-url {
      background: #f8f8f8;
      padding: 10px 15px;
      border-radius: 5px;
      color: #333;
      word-break: break-all;
      max-width: 400px;
      text-align: center;
    }

    .share-url a {
      color: #333;
      text-decoration: underline;
    }

    .copy-btn {
      background: #333;
      color: white;
      border: none;
      padding: 8px 16px;
      font-family: 'Courier New', Courier, monospace;
      cursor: pointer;
      border-radius: 5px;
      transition: background 0.3s;
    }

    .copy-btn:hover {
      background: #000;
    }

    .copy-btn.copied {
      background: #2d5a27;
    }

    .share-error {
      color: #ff6b6b;
      text-align: center;
      max-width: 350px;
    }

    @media print {
      body {
        background: white;
      }
      .receipt {
        box-shadow: none;
        width: 100%;
      }
      .download-link,
      .share-section {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="receipt">
      ${this.renderCompanyHeader(data)}
      <div class="header">
        <div class="logo"> ▐▛███▜▌
 ▝▜█████▛▘
 ▘▘ ▝▝
</div>
        <div class="meta">
          <div class="meta-row">
            <div>Location</div><div class="dots">....................</div><div class="value">${this.escapeHtml(data.location)}</div>
          </div>
          <div class="meta-row">
            <div>Session</div><div class="dots">....................</div><div class="value">${this.escapeHtml(data.transcriptData.sessionSlug)}</div>
          </div>
          <div class="meta-row">
            <div>Date</div><div class="dots">....................</div><div class="value">${formatDateTime(data.transcriptData.endTime, data.config.timezone)}</div>
          </div>
        </div>
      </div>

      <div class="separator"></div>

      ${this.renderLineItems(data)}

      <div class="total-section">
        <div class="total">
          <span>TOTAL</span>
          <span>${formatCurrency(data.sessionData.totalCost)}</span>
        </div>
      </div>

      <div class="footer">
        <div>CASHIER: ${this.getMainModel(data)}</div>
        <div class="footer-message">Thank you for building!</div>
        <div class="generated-by">
          Powered by <strong>LLM Receipts</strong><br>
          <a href="https://github.com/AnubhavLakra10/LLMreceipts" style="color: #009DF0; font-size: 12px;">github.com/AnubhavLakra10/LLMreceipts</a>
        </div>
      </div>
    </div>

    <div class="share-section">
      <button class="share-btn" id="share-btn" onclick="shareReceipt()">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"></circle>
          <circle cx="6" cy="12" r="3"></circle>
          <circle cx="18" cy="19" r="3"></circle>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
        <span id="share-btn-text">Share Publicly</span>
      </button>

      <div class="share-result" id="share-result">
        <div class="share-url" id="share-url"></div>
        <button class="copy-btn" id="copy-btn" onclick="copyShareLink()">
          Copy Link
        </button>
      </div>

      <div class="share-error" id="share-error"></div>
    </div>
  </div>

  <!-- Embedded receipt data for sharing -->
  <script id="receipt-data" type="application/json">
${JSON.stringify(shareableData, null, 2)}
  </script>

  <script>
    const SHARE_API_URL = '${SHARE_API_URL}';
    let sharedUrl = null;

    // Add keyboard shortcut to close window
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.close();
      }
    });

    // Log receipt info
    console.log('Claude Receipt Generated!');
    console.log('Session:', '${this.escapeHtml(data.transcriptData.sessionSlug)}');
    console.log('Cost:', '${formatCurrency(data.sessionData.totalCost)}');
    console.log('Press ESC to close');

    async function shareReceipt() {
      const btn = document.getElementById('share-btn');
      const btnText = document.getElementById('share-btn-text');
      const resultDiv = document.getElementById('share-result');
      const urlDiv = document.getElementById('share-url');
      const errorDiv = document.getElementById('share-error');

      // Reset state
      resultDiv.classList.remove('visible');
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';

      // Get receipt data
      const dataScript = document.getElementById('receipt-data');
      const receiptData = JSON.parse(dataScript.textContent);

      // Disable button and show loading
      btn.disabled = true;
      btnText.textContent = 'Sharing...';

      try {
        const response = await fetch(SHARE_API_URL + '/api/receipts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(receiptData),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || result.error || 'Failed to share receipt');
        }

        // Success
        sharedUrl = result.url;
        urlDiv.innerHTML = '<a href="' + sharedUrl + '" target="_blank">' + sharedUrl + '</a>';
        resultDiv.classList.add('visible');

        btn.classList.add('success');
        btnText.textContent = 'Shared!';

        // Keep button disabled since already shared
        console.log('Receipt shared:', sharedUrl);

      } catch (error) {
        console.error('Share error:', error);

        btn.classList.add('error');
        btnText.textContent = 'Share Failed';
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';

        // Re-enable button after error
        setTimeout(() => {
          btn.disabled = false;
          btn.classList.remove('error');
          btnText.textContent = 'Share Publicly';
        }, 3000);
      }
    }

    function copyShareLink() {
      if (!sharedUrl) return;

      const copyBtn = document.getElementById('copy-btn');

      navigator.clipboard.writeText(sharedUrl).then(() => {
        copyBtn.classList.add('copied');
        copyBtn.textContent = 'Copied!';

        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.textContent = 'Copy Link';
        }, 2000);
      }).catch(err => {
        console.error('Copy failed:', err);
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Render company header with logo if configured
   */
  private renderCompanyHeader(data: ReceiptData): string {
    if (!data.config.company) {
      return '';
    }

    // Inline Ramboll SVG logo
    const rambollLogo = `<svg width="170" height="35" viewBox="0 0 170 35" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M145.536 25.5119C145.286 25.5285 145.036 25.4907 144.802 25.4011C144.568 25.3115 144.356 25.1723 144.181 24.993C144.006 24.8136 143.872 24.5985 143.788 24.3625C143.705 24.1264 143.673 23.875 143.696 23.6255V10.4928C143.696 10.0048 143.89 9.5367 144.235 9.19159C144.58 8.84649 145.048 8.65261 145.536 8.65261C146.024 8.65261 146.492 8.84649 146.837 9.19159C147.182 9.5367 147.376 10.0048 147.376 10.4928V22.1544H154.291C154.72 22.1781 155.124 22.3653 155.42 22.6775C155.715 22.9897 155.88 23.4033 155.88 23.8331C155.88 24.263 155.715 24.6765 155.42 24.9887C155.124 25.3009 154.72 25.4881 154.291 25.5119H145.536ZM128.364 25.5119C128.114 25.5276 127.864 25.4892 127.631 25.3993C127.397 25.3094 127.186 25.1701 127.011 24.991C126.836 24.8119 126.702 24.5972 126.618 24.3615C126.534 24.1258 126.502 23.8748 126.524 23.6255V10.4928C126.524 10.0048 126.718 9.5367 127.063 9.19159C127.408 8.84649 127.876 8.65261 128.364 8.65261C128.852 8.65261 129.32 8.84649 129.665 9.19159C130.01 9.5367 130.204 10.0048 130.204 10.4928V22.1544H137.094C137.523 22.1781 137.927 22.3653 138.222 22.6775C138.517 22.9897 138.682 23.4033 138.682 23.8331C138.682 24.263 138.517 24.6765 138.222 24.9887C137.927 25.3009 137.523 25.4881 137.094 25.5119H128.364ZM17.1873 10.621C17.1575 10.3722 17.1827 10.1199 17.2614 9.88196C17.34 9.64404 17.47 9.42635 17.6422 9.24434C17.8145 9.06233 18.0246 8.92048 18.2579 8.82884C18.4911 8.7372 18.7416 8.69804 18.9917 8.71412H24.8711C27.0138 8.71412 28.6746 9.32411 29.792 10.4211C30.2727 10.9349 30.6474 11.5385 30.8946 12.1973C31.1417 12.8561 31.2565 13.5572 31.2324 14.2604V14.2963C31.2988 15.3996 31.0067 16.4948 30.3998 17.4185C29.7929 18.3423 28.9036 19.0451 27.8647 19.4222L30.4277 22.4978C30.8029 22.8624 31.0279 23.3544 31.0581 23.8767C31.0357 24.3581 30.8278 24.8121 30.4781 25.1436C30.1284 25.4752 29.6639 25.6586 29.182 25.6554C28.8383 25.6504 28.5014 25.559 28.2022 25.3897C27.9031 25.2204 27.6513 24.9786 27.47 24.6866L23.8818 20.145H20.9088V23.769C20.9307 24.0183 20.8985 24.2694 20.8144 24.505C20.7303 24.7407 20.5963 24.9554 20.4216 25.1346C20.2469 25.3137 20.0355 25.4529 19.802 25.5428C19.5685 25.6327 19.3183 25.6711 19.0685 25.6554C18.8186 25.672 18.568 25.6342 18.3341 25.5446C18.1002 25.455 17.8885 25.3158 17.7135 25.1365C17.5386 24.9572 17.4047 24.7421 17.3209 24.506C17.2371 24.2699 17.2055 24.0185 17.2283 23.769L17.1873 10.621ZM90.5294 8.71412C92.4414 8.71412 93.9741 9.25234 94.948 10.2211C95.3201 10.5917 95.6129 11.0341 95.8085 11.5215C96.0041 12.0088 96.0985 12.5308 96.086 13.0558C96.113 13.8158 95.9174 14.5671 95.523 15.2174C95.1287 15.8676 94.5529 16.3884 93.8664 16.7157C95.8143 17.4539 97.024 18.5816 97.024 20.8421C97.024 23.9638 94.5174 25.4914 90.7089 25.4914H84.5577C84.308 25.5071 84.0578 25.4687 83.8243 25.3788C83.5908 25.2889 83.3794 25.1496 83.2047 24.9705C83.0299 24.7914 82.896 24.5767 82.8119 24.341C82.7278 24.1053 82.6956 23.8543 82.7175 23.605V10.621C82.6927 10.3714 82.7222 10.1195 82.804 9.88248C82.8858 9.64544 83.0179 9.4289 83.1912 9.24774C83.3646 9.06658 83.5751 8.92508 83.8083 8.83297C84.0416 8.74086 84.292 8.70032 84.5423 8.71412H90.5294ZM75.4745 23.769C75.4745 24.2571 75.2806 24.7252 74.9355 25.0703C74.5904 25.4154 74.1224 25.6093 73.6343 25.6093C73.1462 25.6093 72.6782 25.4154 72.3331 25.0703C71.988 24.7252 71.7941 24.2571 71.7941 23.769V15.4445L68.5494 20.432C68.4007 20.7108 68.1791 20.9438 67.9082 21.1063C67.6374 21.2689 67.3274 21.3547 67.0116 21.3547C66.6957 21.3547 66.3858 21.2689 66.1149 21.1063C65.844 20.9438 65.6224 20.7108 65.4738 20.432L62.2803 15.5163V23.769C62.2935 24.0185 62.2557 24.2681 62.1693 24.5025C62.0829 24.7369 61.9497 24.9513 61.7778 25.1326C61.6058 25.3138 61.3988 25.4582 61.1693 25.5568C60.9397 25.6555 60.6925 25.7063 60.4427 25.7063C60.1928 25.7063 59.9456 25.6555 59.7161 25.5568C59.4865 25.4582 59.2795 25.3138 59.1076 25.1326C58.9356 24.9513 58.8024 24.7369 58.716 24.5025C58.6296 24.2681 58.5918 24.0185 58.605 23.769V10.3493C58.605 9.18571 59.6302 8.62698 60.6041 8.62698C61.0121 8.59852 61.42 8.68413 61.7821 8.87423C62.1442 9.06434 62.4463 9.35144 62.6545 9.70343L67.0731 16.8798L71.4917 9.70343C71.6906 9.35474 71.9835 9.06896 72.3369 8.87863C72.6904 8.68831 73.0902 8.60112 73.4908 8.62698C74.4647 8.62698 75.495 9.18571 75.495 10.3493L75.4745 23.769ZM162.344 35C167.393 35 169.556 32.8471 169.556 27.8237V7.17633C169.556 2.1529 167.393 0 162.344 0H126.524L111.033 18.5508L110.459 18.2791L111.9 11.9281C111.664 11.8778 111.423 11.8538 111.182 11.8563C108.188 11.8563 106.112 14.2091 106.112 17.0797V17.1309C106.095 17.8152 106.214 18.4961 106.464 19.1335C106.713 19.7709 107.088 20.3518 107.566 20.842C108.044 21.3322 108.615 21.7217 109.245 21.9876C109.876 22.2535 110.554 22.3904 111.238 22.3902C114.232 22.3902 116.287 20.0578 116.287 17.1873V17.1309C116.294 16.61 116.219 16.0913 116.067 15.5931L119.225 13.1173C119.841 14.3417 120.162 15.6934 120.163 17.0643V17.1156C120.163 21.8724 116.395 25.7835 111.202 25.7835C106.01 25.7835 102.273 21.9237 102.273 17.1719V17.1156C102.273 12.3433 106.041 8.45269 111.238 8.45269C111.725 8.45515 112.211 8.48424 112.694 8.53984L114.662 0H7.21221C2.16315 0 0 2.1529 0 7.17633V27.8237C0 32.8471 2.16315 35 7.21221 35H162.344ZM48.2403 21.7443H40.8282L39.6595 24.5072C39.515 24.8877 39.244 25.2069 38.8921 25.4113C38.5401 25.6156 38.1285 25.6927 37.7265 25.6296C37.3244 25.5665 36.9562 25.3671 36.6838 25.0647C36.4114 24.7623 36.2512 24.3754 36.2302 23.969C36.2435 23.6753 36.3168 23.3874 36.4455 23.1232L42.325 9.93922C42.5225 9.50474 42.841 9.13632 43.2423 8.87795C43.6436 8.61959 44.1108 8.4822 44.5881 8.4822C45.0654 8.4822 45.5326 8.61959 45.9339 8.87795C46.3352 9.13632 46.6536 9.50474 46.8512 9.93922L52.7153 23.1232C52.844 23.3874 52.9173 23.6753 52.9306 23.969C52.903 24.3807 52.7359 24.7707 52.4569 25.0747C52.1779 25.3787 51.8036 25.5785 51.3958 25.6412C50.9879 25.7039 50.5709 25.6257 50.2135 25.4196C49.856 25.2134 49.5795 24.8916 49.4296 24.5072L48.2403 21.7443ZM42.202 18.4944H46.8717L44.524 12.9533L42.202 18.4944ZM92.3902 13.7581C92.3902 12.574 91.5393 11.9845 89.9707 11.9845H86.3108V15.5163H89.7349C91.3803 15.5163 92.3902 15.0037 92.3902 13.7581ZM24.5636 12.0716H20.8678V16.8798H24.6353C26.4397 16.8798 27.4649 15.9315 27.4649 14.5116V14.4603C27.4649 12.8815 26.3679 12.0716 24.5636 12.0716ZM90.5858 18.5867H86.3108V22.262H90.7294C92.3748 22.262 93.3641 21.6879 93.3641 20.4525C93.3641 19.2172 92.5183 18.5867 90.6063 18.5867" fill="#009DF0"/></svg>`;

    return `<div class="company-header">
        <div class="company-logo">${rambollLogo}</div>
        <div class="company-name">${this.escapeHtml(data.config.company)}</div>
      </div>
      <div class="company-divider"></div>`;
  }

  /**
   * Render line items HTML
   * Shows token counts and model subtotals (not per-token-type costs, which would be inaccurate)
   */
  private renderLineItems(data: ReceiptData): string {
    let html = '<div style="margin: 20px 0;">';

    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      for (const model of data.sessionData.modelBreakdowns) {
        // Model name with its subtotal cost
        html += `<div class="model-header">
          <span class="model-name">${this.escapeHtml(this.getModelName(model.modelName))}</span>
          <span class="model-cost">${formatCurrency(model.cost)}</span>
        </div>`;

        html += `<div class="line-item">
          <span>  Input tokens</span>
          <span>${formatNumber(model.inputTokens)}</span>
        </div>`;

        html += `<div class="line-item">
          <span>  Output tokens</span>
          <span>${formatNumber(model.outputTokens)}</span>
        </div>`;

        if (model.cacheCreationTokens && model.cacheCreationTokens > 0) {
          html += `<div class="line-item">
            <span>  Cache write</span>
            <span>${formatNumber(model.cacheCreationTokens)}</span>
          </div>`;
        }

        if (model.cacheReadTokens && model.cacheReadTokens > 0) {
          html += `<div class="line-item">
            <span>  Cache read</span>
            <span>${formatNumber(model.cacheReadTokens)}</span>
          </div>`;
        }
      }
    }

    html += "</div>";
    return html;
  }

  /**
   * Get clean model name
   */
  private getModelName(model: string): string {
    const cleaned = model.replace(/-\d{8}$/, "");

    const modelMap: Record<string, string> = {
      "claude-sonnet-4-5": "Claude Sonnet 4.5",
      "claude-sonnet-4-6": "Claude Sonnet 4.6",
      "claude-opus-4-5": "Claude Opus 4.5",
      "claude-opus-4-6": "Claude Opus 4.6",
      "claude-haiku-4-5": "Claude Haiku 4.5",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-opus": "Claude 3 Opus",
      "claude-3-haiku": "Claude 3 Haiku",
    };

    return modelMap[cleaned] || model;
  }

  /**
   * Get main model
   */
  private getMainModel(data: ReceiptData): string {
    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      return this.getModelName(data.sessionData.modelBreakdowns[0].modelName);
    }

    if (data.sessionData.modelsUsed && data.sessionData.modelsUsed.length > 0) {
      return this.getModelName(data.sessionData.modelsUsed[0]);
    }

    return "Claude";
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
