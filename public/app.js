const HISTORY_KEY = 'linkcraft_recent_links_v1';
const form = document.querySelector('#shorten-form');
const urlInput = document.querySelector('#url-input');
const customToggle = document.querySelector('#custom-toggle');
const aliasWrap = document.querySelector('#alias-wrap');
const aliasInput = document.querySelector('#alias-input');
const aliasPrefix = document.querySelector('#alias-prefix');
const shortenButton = document.querySelector('#shorten-btn');
const formMessage = document.querySelector('#form-message');
const resultPanel = document.querySelector('#result-panel');
const resultUrl = document.querySelector('#result-url');
const resultOriginal = document.querySelector('#result-original');
const resultSecurityNote = document.querySelector('#result-security-note');
const linkList = document.querySelector('#link-list');
const emptyState = document.querySelector('#empty-state');
const clearHistoryButton = document.querySelector('#clear-history');
const toast = document.querySelector('#toast');
const statsDialog = document.querySelector('#stats-dialog');
let currentResult = null;
let toastTimer = null;

function readHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(history) ? history.filter((item) => item && typeof item.code === 'string' && typeof item.shortUrl === 'string') : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  } catch {
    showToast('Browser storage is full. Your link still works.');
  }
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function getYouTubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = null;
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || null;
    else if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1] || null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

function setFormMessage(message = '') {
  formMessage.textContent = message;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function displayDateTime(value) {
  if (!value) return 'No clicks recorded yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No clicks recorded yet';
  return `Last click ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`;
}

function getDomain(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return 'Short link'; }
}

function iconSvg(name) {
  const icons = {
    link: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.7"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };
  return icons[name] || '';
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
    return true;
  } catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    helper.remove();
    showToast(ok ? 'Copied to clipboard!' : 'Copy failed. Select the link and copy it manually.');
    return ok;
  }
}

function addToHistory(data) {
  const existing = readHistory().filter((item) => item.code !== data.code);
  existing.unshift({
    code: data.code,
    originalUrl: data.originalUrl,
    shortUrl: data.shortUrl,
    createdAt: data.createdAt,
    clicks: data.clicks || 0,
    directLink: data.directLink === true
  });
  saveHistory(existing);
  renderHistory();
}

function makeActionButton(label, iconName, className, clickHandler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `link-action-button ${className || ''}`.trim();
  button.innerHTML = `${iconSvg(iconName)}<span>${label}</span>`;
  button.addEventListener('click', clickHandler);
  return button;
}

function renderHistory() {
  const history = readHistory();
  linkList.replaceChildren();
  emptyState.hidden = history.length > 0;
  clearHistoryButton.hidden = history.length === 0;

  for (const item of history) {
    const originalUrl = safeHttpUrl(item.originalUrl);
    const shortUrl = safeHttpUrl(item.shortUrl);
    if (!originalUrl || !shortUrl) continue;

    const card = document.createElement('article');
    card.className = 'link-item';

    const main = document.createElement('div');
    main.className = 'link-main';
    const favicon = document.createElement('div');
    favicon.className = 'link-favicon';
    favicon.innerHTML = iconSvg('link');

    const details = document.createElement('div');
    details.className = 'link-details';
    const shortAnchor = document.createElement('a');
    shortAnchor.className = 'link-short';
    shortAnchor.href = shortUrl;
    shortAnchor.target = '_blank';
    shortAnchor.rel = 'noopener noreferrer';
    shortAnchor.textContent = shortUrl.replace(/^https?:\/\//, '');
    const originalAnchor = document.createElement('a');
    originalAnchor.className = 'link-original';
    // Clicking the visible destination in history still opens LinkCraft's preview first.
    originalAnchor.href = shortUrl;
    originalAnchor.target = '_blank';
    originalAnchor.rel = 'noopener noreferrer';
    originalAnchor.textContent = originalUrl;
    originalAnchor.title = originalUrl;
    const meta = document.createElement('div');
    meta.className = 'link-meta';
    meta.textContent = `Created ${displayDate(item.createdAt)}`;
    details.append(shortAnchor, originalAnchor, meta);
    main.append(favicon, details);

    const actions = document.createElement('div');
    actions.className = 'link-actions';
    const clicks = document.createElement('div');
    clicks.className = 'click-count';
    const isDirect = item.directLink === true;
    const clickNumber = document.createElement('strong');
    clickNumber.textContent = isDirect ? '—' : String(Number.isFinite(Number(item.clicks)) ? Number(item.clicks) : 0);
    const clickLabel = document.createElement('span');
    clickLabel.textContent = isDirect ? 'YouTube' : 'clicks';
    clicks.append(clickNumber, clickLabel);
    actions.append(clicks);
    actions.append(makeActionButton('Copy', 'copy', '', () => copyText(shortUrl)));
    if (!isDirect) actions.append(makeActionButton('Stats', '', '', () => openStats(item.code)));
    actions.append(makeActionButton('Open', 'external', '', () => window.open(shortUrl, '_blank', 'noopener,noreferrer')));
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'link-action-button delete-link-button';
    removeButton.setAttribute('aria-label', `Remove ${shortUrl} from local history`);
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => {
      saveHistory(readHistory().filter((entry) => entry.code !== item.code));
      renderHistory();
      showToast('Removed from this browser. The short link still works.');
    });
    actions.append(removeButton);
    card.append(main, actions);
    linkList.append(card);
  }
}

async function openStats(code) {
  try {
    const response = await fetch(`/api/stats/${encodeURIComponent(code)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load link statistics.');
    const baseUrl = data.shortUrl || `${window.location.origin}/${encodeURIComponent(data.code)}`;
    document.querySelector('#stats-short-link').textContent = baseUrl;
    document.querySelector('#stats-clicks').textContent = String(data.clicks ?? 0);
    document.querySelector('#stats-created').textContent = displayDate(data.createdAt);
    const destination = document.querySelector('#stats-destination');
    destination.href = data.shortUrl || `${window.location.origin}/${encodeURIComponent(data.code)}`;
    destination.title = 'Open the destination preview before continuing';
    destination.textContent = data.originalUrl;
    document.querySelector('#stats-last-click').textContent = displayDateTime(data.lastClickedAt);
    if (!statsDialog.open) statsDialog.showModal();

    const history = readHistory().map((item) => item.code === code ? { ...item, clicks: data.clicks } : item);
    saveHistory(history);
    renderHistory();
  } catch (error) {
    showToast(error.message || 'Could not load link statistics.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setFormMessage('');
  const url = urlInput.value.trim();
  if (!url) {
    setFormMessage('Paste a URL to get started.');
    urlInput.focus();
    return;
  }

  const body = { url };
  if (customToggle.checked) {
    const alias = aliasInput.value.trim();
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(alias)) {
      setFormMessage('Custom alias must be 3–24 characters: letters, numbers, hyphens, or underscores.');
      aliasInput.focus();
      return;
    }
    body.customCode = alias;
  }

  shortenButton.disabled = true;
  shortenButton.querySelector('.button-label').textContent = 'Creating your link…';
  try {
    const response = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    currentResult = data;
    resultUrl.href = data.shortUrl;
    resultUrl.textContent = data.shortUrl.replace(/^https?:\/\//, '');
    resultOriginal.textContent = data.originalUrl;
    const statsButton = document.querySelector('#show-result-stats');
    if (statsButton) statsButton.hidden = data.directLink === true;
    if (resultSecurityNote) {
      if (data.directLink) {
        const scanNote = data.scanStatus === 'clear'
          ? ' The URL scanner did not report a known threat; that is not a guarantee of safety.'
          : ' LinkCraft URL scanning is not configured.';
        resultSecurityNote.textContent = `${data.message}${scanNote}`;
      } else {
        const scanNote = data.scanStatus === 'clear'
          ? ' No known threat was found at scan time; this is not a safety guarantee.'
          : ' Threat scanning is not configured; the preview will label this link unscanned.';
        resultSecurityNote.textContent = `Shareable link created on your public LinkCraft domain.${scanNote}`;
      }
    }
    resultPanel.hidden = false;
    addToHistory(data);
    document.querySelector('#shorten-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setFormMessage('');
    aliasInput.value = '';
    customToggle.checked = false;
    aliasWrap.hidden = true;
    showToast('Your short link is ready!');
  } catch (error) {
    setFormMessage(error.message || 'Could not create your link. Check your connection and try again.');
  } finally {
    shortenButton.disabled = false;
    shortenButton.querySelector('.button-label').textContent = 'Create short link';
  }
});

customToggle.addEventListener('change', () => {
  aliasWrap.hidden = !customToggle.checked;
  if (customToggle.checked) aliasInput.focus();
});

aliasInput.addEventListener('input', () => {
  aliasInput.value = aliasInput.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
});

urlInput.addEventListener('input', () => {
  if (formMessage.textContent) setFormMessage('');
  const aliasHint = document.querySelector('.alias-hint');
  // Custom aliases belong to LinkCraft's domain, so they work for YouTube and
  // non-YouTube destinations alike after the app is publicly deployed.
  customToggle.disabled = false;
  if (aliasHint) aliasHint.textContent = 'Choose a memorable ending';
});

document.querySelector('#paste-btn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return showToast('Your clipboard is empty.');
    urlInput.value = text.trim();
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    urlInput.focus();
    showToast('Pasted from clipboard.');
  } catch {
    showToast('Clipboard access is unavailable. Paste with Ctrl + V.');
    urlInput.focus();
  }
});

document.querySelector('#copy-result').addEventListener('click', () => {
  if (currentResult?.shortUrl) copyText(currentResult.shortUrl);
});
document.querySelector('#show-result-stats').addEventListener('click', () => {
  if (currentResult?.code) openStats(currentResult.code);
});
document.querySelector('#result-dismiss').addEventListener('click', () => { resultPanel.hidden = true; });
clearHistoryButton.addEventListener('click', () => {
  if (!window.confirm('Clear the recent-link list from this browser? The short links themselves will keep working.')) return;
  saveHistory([]);
  renderHistory();
  showToast('Local history cleared.');
});
document.querySelector('#close-stats').addEventListener('click', () => statsDialog.close());
statsDialog.addEventListener('click', (event) => {
  if (event.target === statsDialog) statsDialog.close();
});

const mobileMenu = document.querySelector('#mobile-menu');
const nav = document.querySelector('.topnav');
mobileMenu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  mobileMenu.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('a').forEach((anchor) => anchor.addEventListener('click', () => {
  nav.classList.remove('open');
  mobileMenu.setAttribute('aria-expanded', 'false');
}));

async function loadBaseConfig() {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    if (!response.ok || !data.baseUrl) {
      aliasPrefix.textContent = 'deploy-publicly/';
      return;
    }
    const baseUrl = new URL(data.baseUrl);
    aliasPrefix.textContent = `${baseUrl.host}/`;
  } catch {
    aliasPrefix.textContent = 'deploy-publicly/';
  }
}

aliasPrefix.textContent = `${window.location.host || 'your-site.com'}/`;
loadBaseConfig();
renderHistory();
