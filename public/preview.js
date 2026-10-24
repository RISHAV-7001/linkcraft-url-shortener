const loadingState = document.querySelector('#loading-state');
const previewContent = document.querySelector('#preview-content');
const errorState = document.querySelector('#error-state');
const errorText = document.querySelector('#error-text');
const statusBanner = document.querySelector('#status-banner');
const statusIcon = document.querySelector('#status-icon');
const statusTitle = document.querySelector('#status-title');
const statusText = document.querySelector('#status-text');
const destinationDomain = document.querySelector('#destination-domain');
const destinationUrl = document.querySelector('#destination-url');
const destinationFlags = document.querySelector('#destination-flags');
const threatTypes = document.querySelector('#threat-types');
const unavailableNote = document.querySelector('#unavailable-note');
const continueButton = document.querySelector('#continue-button');
const shieldBadge = document.querySelector('#shield-badge');

const pathParts = window.location.pathname.split('/').filter(Boolean);
const code = pathParts[0] || '';

function showError(message) {
  loadingState.hidden = true;
  previewContent.hidden = true;
  errorState.hidden = false;
  errorText.textContent = message;
}

function setStatus(kind, title, message) {
  statusBanner.className = `status-banner ${kind}`;
  shieldBadge.className = `shield-badge ${kind}`;
  statusIcon.textContent = kind === 'danger' ? '!' : kind === 'warning' ? '!' : kind === 'error' ? '×' : '✓';
  statusTitle.textContent = title;
  statusText.textContent = message;
}

function addFlag(label, kind = '') {
  const chip = document.createElement('span');
  chip.className = `flag-chip ${kind}`.trim();
  chip.textContent = label;
  destinationFlags.append(chip);
}

function formatDomain(url) {
  try { return new URL(url).hostname; } catch { return 'Unrecognized destination'; }
}

async function loadPreview() {
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(code)) {
    showError('The short link code is invalid.');
    return;
  }
  try {
    const response = await fetch(`/api/preview/${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const data = await response.json();
    if (response.status === 404 || !data.originalUrl) {
      showError(data.error || 'This short link does not exist.');
      return;
    }

    loadingState.hidden = true;
    previewContent.hidden = false;
    destinationDomain.textContent = formatDomain(data.originalUrl);
    destinationUrl.textContent = data.originalUrl;
    destinationFlags.replaceChildren();
    threatTypes.hidden = true;
    threatTypes.textContent = '';
    unavailableNote.hidden = true;

    // The destination is shown as text, not inserted as HTML.
    try {
      const target = new URL(data.originalUrl);
      if (target.protocol === 'http:') addFlag('Destination does not use HTTPS', 'flag-warning');
      else addFlag('HTTPS destination', 'flag-secure');
      if (target.hostname.startsWith('xn--') || target.hostname.includes('.xn--')) addFlag('Internationalized domain name', 'flag-warning');
    } catch {
      addFlag('Could not interpret destination', 'flag-warning');
    }

    if (data.scanStatus === 'unsafe') {
      setStatus('danger', 'Potentially dangerous destination', 'Google Safe Browsing identified this destination as potentially harmful. LinkCraft has blocked the redirect.');
      if (Array.isArray(data.threatTypes) && data.threatTypes.length) {
        threatTypes.hidden = false;
        threatTypes.textContent = `Detected category: ${data.threatTypes.join(', ')}`;
      }
      addFlag('Redirect blocked', 'flag-danger');
      continueButton.disabled = true;
      continueButton.textContent = 'Blocked for your protection';
      continueButton.classList.add('button-disabled');
    } else if (data.scanStatus === 'clear') {
      setStatus('success', 'No known threat found', 'Google Safe Browsing did not identify a known threat at the time of the check. This is not a guarantee that the site is safe.');
      addFlag('Threat scan completed', 'flag-secure');
      continueButton.disabled = !data.canContinue;
      continueButton.innerHTML = 'Continue to website <span aria-hidden="true">↗</span>';
    } else if (data.scanStatus === 'unavailable' || response.status === 503 || !data.canContinue) {
      setStatus('error', 'Could not verify this destination', 'The security check could not be completed, so LinkCraft is temporarily blocking this redirect. Please try again later.');
      unavailableNote.hidden = false;
      unavailableNote.textContent = data.message || 'Please retry in a moment. The site will not redirect while the configured scanner is unavailable.';
      continueButton.disabled = true;
      continueButton.textContent = 'Temporarily blocked';
      continueButton.classList.add('button-disabled');
    } else {
      setStatus('warning', 'Destination has not been scanned', 'Threat scanning is not configured on this server. This does not mean the destination is safe; continue only if you trust it.');
      addFlag('Unscanned destination', 'flag-warning');
      continueButton.disabled = !data.canContinue;
      continueButton.innerHTML = 'Continue anyway <span aria-hidden="true">↗</span>';
    }
  } catch {
    showError('A network error prevented LinkCraft from loading the destination preview. Check your connection and try again.');
  }
}

continueButton.addEventListener('click', () => {
  if (continueButton.disabled) return;
  window.location.assign(`/${encodeURIComponent(code)}/continue`);
});

loadPreview();
