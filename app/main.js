(function () {
  const statusEl = document.getElementById('status');
  const versionEl = document.getElementById('version');
  const platformEl = document.getElementById('platform');
  const logOutputEl = document.getElementById('logOutput');
  const apiOutputEl = document.getElementById('apiOutput');

  function log(message) {
    const line = `[TizenYouTube] ${new Date().toISOString()} ${message}`;
    console.log(line);
    logOutputEl.textContent = `${line}\n${logOutputEl.textContent}`.trim();
  }

  function init() {
    statusEl.textContent = 'App launched successfully.';

    const app = tizen.application.getCurrentApplication();
    versionEl.textContent = `App ID: ${app.appInfo.id} | Version: ${app.appInfo.version}`;

    platformEl.textContent = `Tizen platform version: ${tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')}`;

    document.getElementById('debugBtn').addEventListener('click', () => {
      log('Manual debug button pressed. If connected, this appears in sdb dlog.');
    });

    document.getElementById('fetchBtn').addEventListener('click', fetchPlaylistItems);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Back') {
        tizen.application.getCurrentApplication().exit();
      }
    });

    log('Initialization complete.');
  }

  async function fetchPlaylistItems() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const playlistId = document.getElementById('playlistId').value.trim();

    if (!apiKey || !playlistId) {
      apiOutputEl.textContent = 'Please fill in API key and playlist ID first.';
      return;
    }

    const params = new URLSearchParams({
      part: 'snippet,contentDetails,status',
      playlistId,
      maxResults: '5',
      key: apiKey
    });

    const url = `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`;
    log(`Requesting YouTube API: ${url.replace(apiKey, '***')}`);

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `HTTP ${response.status}`);
      }

      const items = (data.items || []).map((item, idx) => `${idx + 1}. ${item.snippet?.title || '(no title)'}`);
      apiOutputEl.textContent = items.length
        ? `Fetched ${items.length} item(s):\n${items.join('\n')}`
        : 'Request succeeded but no items found.';
      log(`YouTube request succeeded with ${items.length} item(s).`);
    } catch (error) {
      apiOutputEl.textContent = `Request failed: ${error.message}`;
      log(`YouTube request failed: ${error.message}`);
    }
  }

  window.addEventListener('load', init);
})();
