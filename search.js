let downloadClicked = false;

const fetchButton = document.getElementById('fetchButton');
const playlistDiv = document.getElementById('playlist');
const urlInput = document.getElementById('urlInput');
const loadingDiv = document.getElementById('loading');
const alertDiv = document.getElementById('alert');
const searchEndpoint = 'https://api.nexray.eu.cc/search/spotify';
let requestInProgress = false;

fetchButton.addEventListener('click', searchSpotify);
urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    searchSpotify();
  }
});

async function searchSpotify() {
  try {
    const query = urlInput.value.trim();
    if (!query) {
      return Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Please enter the Spotify music title!',
      });
    }
    if (query.length > 100) {
      return showAlert('error', 'Search text must be 100 characters or fewer.');
    }
    if (requestInProgress) {
      return;
    }

    requestInProgress = true;
    loadingDiv.classList.remove('hidden');
    const response = await fetchWithTimeout(`${searchEndpoint}?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`Search request failed with status ${response.status}`);
    }

    const data = await response.json();
    loadingDiv.classList.add('hidden');
    const tracks = Array.isArray(data) ? data : data.result;

    if (Array.isArray(tracks) && tracks.length > 0) {
      displayPlaylist(tracks);
    } else {
      showAlert('error', 'No results found.');
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    showAlert('error', 'Error fetching data.');
  } finally {
    requestInProgress = false;
    loadingDiv.classList.add('hidden');
  }
}

function displayPlaylist(tracks) {
  playlistDiv.replaceChildren();
  tracks.forEach((track) => {
    const row = document.createElement('div');
    row.className = 'flex items-center py-2 border-b border-gray-700';

    const image = document.createElement('img');
    image.src = safeHttpsUrl(track.thumbnail);
    image.alt = String(track.title || 'Spotify track');
    image.className = 'w-12 h-12 rounded-md mr-4';
    image.loading = 'lazy';

    const info = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'font-semibold';
    title.textContent = track.title || 'Untitled track';
    const artist = document.createElement('p');
    artist.className = 'text-sm';
    artist.textContent = track.artist || 'Unknown artist';
    info.append(title, artist);

    const detailButton = document.createElement('button');
    detailButton.className = 'ml-auto bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg';
    detailButton.textContent = 'Detail';
    detailButton.addEventListener('click', () => showTrackDetail(track));

    row.append(image, info, detailButton);
    playlistDiv.appendChild(row);
  });
  playlistDiv.classList.remove('hidden');
}

function showTrackDetail(track) {
  const { title, artist, duration, thumbnail, url } = track;
  const embedUrl = createSpotifyEmbedUrl(url);
  Swal.fire({
    title: String(title || 'Untitled track'),
    html: `
      <img src="${escapeHtml(safeHttpsUrl(thumbnail))}" alt="${escapeHtml(title || 'Spotify track')}" class="mb-4">
      <div class="spotify-preview">
        ${embedUrl
          ? `<iframe class="spotify-embed" src="${escapeHtml(embedUrl)}" title="Spotify player" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`
          : '<p>Spotify preview tidak tersedia untuk lagu ini.</p>'}
      </div>
      <p class="font-semibold">Artist:</p>
      <p>${escapeHtml(artist || 'Unknown artist')}</p>
      <p class="font-semibold">Duration:</p>
      <p>${escapeHtml(duration || 'Unknown')}</p>
    `,
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Download',
    cancelButtonText: 'Close',
    customClass: {
      popup: 'spotify-modal',
      title: 'spotify-modal-title',
      htmlContainer: 'spotify-modal-content',
      confirmButton: 'spotify-modal-confirm',
      cancelButton: 'spotify-modal-cancel'
    }
  }).then((result) => {
    if (result.isConfirmed) {
      downloadTrack(url, title);
    }
  });
}

async function downloadTrack(url, title) {
  try {
    loadingDiv.classList.remove('hidden');
    const response = await fetchWithTimeout(`https://api.nexray.eu.cc/downloader/spotify?url=${encodeURIComponent(safeSpotifyUrl(url))}`);
    if (!response.ok) {
      throw new Error(`Download request failed with status ${response.status}`);
    }

    const data = await response.json();
    const downloadUrl = data.status === true ? safeHttpsUrl(data.result?.url) : '';
    loadingDiv.classList.add('hidden');

    if (downloadUrl) {
      showAlert('success', 'Download success!');
      downloadClicked = true;
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.setAttribute('download', title);
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    } else {
      showAlert('error', 'Failed to download track.');
    }
  } catch (error) {
    console.error('Error downloading track:', error);
    loadingDiv.classList.add('hidden');
    showAlert('error', 'Error downloading track.');
  }
}

function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

function safeHttpsUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'https:' ? parsedUrl.href : '';
  } catch {
    return '';
  }
}

function safeSpotifyUrl(value) {
  const parsedUrl = new URL(value);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'open.spotify.com') {
    throw new Error('Invalid Spotify URL');
  }
  return parsedUrl.href;
}

function createSpotifyEmbedUrl(value) {
  try {
    const parsedUrl = new URL(value);
    const trackId = parsedUrl.hostname === 'open.spotify.com'
      ? parsedUrl.pathname.match(/^\/track\/([a-zA-Z0-9]+)$/)?.[1]
      : null;
    return trackId ? `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&autoplay=1` : '';
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showAlert(icon, text) {
  Swal.fire({
    icon: icon,
    text: text,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    toast: true,
    showClass: {
      popup: 'animate__animated animate__fadeInRight'
    },
    hideClass: {
      popup: 'animate__animated animate__fadeOutRight'
    }
  });
}

function secondsToMinutes(duration) {
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}