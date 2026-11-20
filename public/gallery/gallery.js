const get = id => document.getElementById(id);
const year = get('photoArchiveYear');
const search = get('photoArchiveSearch');
const status = get('photoArchiveStatus');
const albumGrid = get('photoArchiveAlbums');
const albumDialog = get('photoAlbumDialog');
const lightbox = get('photoLightbox');
const mediaURL = file => new URL(file, import.meta.url).href;
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s·.、“”\-]/g, '');

let albums;
let selectedAlbum;
let selectedIndex = 0;
let loading = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function preview(file, description) {
  const image = element('img');
  image.src = mediaURL(file);
  image.alt = description;
  image.loading = 'lazy';
  image.decoding = 'async';
  return image;
}

function render() {
  const terms = search.value.trim().split(/\s+/).map(normalize).filter(Boolean);
  const visible = albums.filter(album => {
    const keywords = normalize([album.year, album.title, ...(album.aliases ?? [])].join(' '));
    return (!year.value || String(album.year) === year.value) &&
      terms.every(term => keywords.includes(term));
  });
  albumGrid.replaceChildren(...visible.map(album => {
    const button = element('button', '', 'photo-album');
    button.type = 'button';
    const copy = element('span', '', 'photo-album-copy');
    copy.append(element('span', album.year + '年 · ' + album.photos.length + ' 张'),
      element('strong', album.title));
    button.append(preview(album.photos[0].thumb, ''), copy);
    button.addEventListener('click', () => openAlbum(album));
    return button;
  }));
  const filtering = year.value || terms.length;
  status.textContent = !visible.length ? '没有找到匹配的相册。' :
    filtering ? '找到 ' + visible.length + ' 个相册，' +
      visible.reduce((total, album) => total + album.photos.length, 0) + ' 张照片' : '';
}

function openAlbum(album) {
  selectedAlbum = album;
  get('photoAlbumTitle').textContent = album.title;
  get('photoAlbumCount').textContent = album.year + '年 · ' + album.photos.length + ' 张照片';
  get('photoAlbumGrid').replaceChildren(...album.photos.map((photo, index) => {
    const button = element('button', '', 'photo-thumbnail');
    button.type = 'button';
    button.append(preview(photo.thumb, ''), element('span', photo.caption));
    button.addEventListener('click', () => {
      showPhoto(index);
      lightbox.showModal();
    });
    return button;
  }));
  albumDialog.showModal();
}

function showPhoto(index) {
  const photo = selectedAlbum.photos[index];
  if (!photo) return;
  selectedIndex = index;
  const full = get('photoFullPreview');
  const href = mediaURL(photo.file);
  full.src = href;
  full.alt = photo.caption;
  get('photoFullImage').href = href;
  get('photoFullCaption').textContent = photo.caption;
  get('photoPosition').textContent = (index + 1) + ' / ' + selectedAlbum.photos.length;
  get('photoPrev').disabled = index === 0;
  get('photoNext').disabled = index === selectedAlbum.photos.length - 1;
}

for (const dialog of [albumDialog, lightbox]) {
  dialog.querySelector('[data-photo-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}
get('photoPrev').addEventListener('click', () => showPhoto(selectedIndex - 1));
get('photoNext').addEventListener('click', () => showPhoto(selectedIndex + 1));
lightbox.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showPhoto(selectedIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
year.addEventListener('change', () => { if (albums) render(); });
search.addEventListener('input', () => { if (albums) render(); });

async function load() {
  if (document.body.dataset.workspaceView !== 'gallery' || albums || loading) return;
  loading = true;
  status.textContent = '正在读取相册…';
  try {
    const response = await fetch(mediaURL('albums.json'));
    if (!response.ok) throw new Error('读取相册失败');
    const catalog = await response.json();
    albums = catalog.sort((first, second) => second.year - first.year);
    for (const value of new Set(albums.map(album => album.year))) {
      year.add(new Option(value + '年', String(value)));
    }
    const count = albums.reduce((total, album) => total + album.photos.length, 0);
    get('photoArchiveTotal').textContent = albums.length + ' 个相册 · ' + count + ' 张照片';
    render();
    routeObserver.disconnect();
  } catch {
    albums = undefined;
    const retry = element('button', '重试');
    retry.type = 'button';
    retry.addEventListener('click', load);
    status.replaceChildren('暂时无法读取相册。 ', retry);
  } finally {
    loading = false;
  }
}

const routeObserver = new MutationObserver(load);
routeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-workspace-view'] });
load();
