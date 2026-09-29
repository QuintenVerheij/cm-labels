// The "Images and fonts" block of the Settings tab: upload, convert an image to black and white, list, insert, remove.
// The data work is in assets.js and mono.js; this file is the DOM and canvas part, so the tests do not reach it.
import { t } from './messages.js';
import { esc } from './esc.js';
import { LIMITS, FONT_FORMATS, kindOf, extOf, slug, uniqueName, validName, totalSize, snippet, fontFaceCss } from './assets.js';
import { toMono, monoToRgba } from './mono.js';

const $ = s => document.querySelector(s);
const readDataUrl = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});
const kb = bytes => `${Math.max(1, Math.round(bytes / 1024))} kB`;

// get(): the stored assets. save(assets): stores them (throws when the storage refuses). changed(): the layout must draw
// again. insert(text): puts text in the layout at the cursor. labelWidth(): the label width in mm, for a first guess of
// the width of an image.
export function initAssets({ get, save, changed, insert, labelWidth }) {
  let pending = null;   // the image being converted: { img, aspect, name }
  let bits = null;      // the converted pixels of that image (w, h, data)

  const msg = (text, bad = false) => { $('#assetmsg').textContent = text; $('#assetmsg').classList.toggle('bad', bad); };

  // The fonts must be known to the page, so the list and the preview show them.
  function syncFonts() {
    let style = $('#assetfonts');
    if (!style) { style = document.createElement('style'); style.id = 'assetfonts'; document.head.append(style); }
    const css = fontFaceCss(get());
    if (style.textContent === css) return;
    style.textContent = css;
    Promise.all(get().filter(a => a.kind === 'font').map(a => document.fonts.load(`1em "${a.name}"`).catch(() => {}))).then(changed);
  }

  function renderList() {
    const list = get();
    $('#assetlist').innerHTML = list.length
      ? `<tbody>${list.map(a => `<tr>
        <td>${a.kind === 'image' ? `<img class="assetthumb" src="${esc(a.data)}" alt="">` : `<span class="assetfont" style="font-family:'${esc(a.name)}'">Aa 123</span>`}</td>
        <td class="mono">${esc(a.name)}</td>
        <td class="hint">${a.kind === 'image' ? t('assets.imageInfo', { w: a.w, h: a.h, mm: a.mm }) : t('assets.fontInfo', { name: esc(a.name) })} · ${kb(a.data.length * 0.75)}</td>
        <td class="end"><button class="b small" data-insert="${esc(a.name)}">${t('assets.insert')}</button> <button class="b small" data-remove="${esc(a.name)}">${t('assets.remove')}</button></td></tr>`).join('')}</tbody>`
      : `<tbody><tr><td class="hint">${t('assets.none')}</td></tr></tbody>`;
  }
  function refresh() { syncFonts(); renderList(); }

  async function store(asset) {
    const list = [...get(), asset];
    if (totalSize(list) > LIMITS.total) { msg(t('assets.errTotal'), true); return false; }
    try { await save(list); } catch { msg(t('assets.errStore'), true); return false; }
    refresh(); changed();
    msg(t('assets.added', { name: asset.name }));
    return true;
  }

  // ---- fonts
  async function addFont(file) {
    if (file.size > LIMITS.font) return msg(t('assets.errFileBig'), true);
    const name = uniqueName(slug(file.name), get());
    try { await new FontFace(name, await file.arrayBuffer()).load(); } catch { return msg(t('assets.errFont'), true); }
    await store({ name, kind: 'font', data: await readDataUrl(file), format: FONT_FORMATS[extOf(file.name)] });
  }

  // ---- images
  function closeImage() { pending = null; bits = null; $('#imgpanel').hidden = true; }
  function convert() {
    if (!pending) return;
    const mm = +$('#imgw').value.replace(',', '.'), dpi = +$('#imgdpi').value;
    const w = Math.round(mm * dpi / 25.4), h = Math.round(w * pending.aspect);
    $('#imgadd').disabled = true;
    if (!(mm >= 1 && mm <= LIMITS.maxMm)) return msg(t('assets.errWidth'), true);
    if (!(w >= 1 && h >= 1 && w <= LIMITS.maxDots && h <= LIMITS.maxDots)) return msg(t('assets.errSize'), true);
    const canvas = $('#imgcanvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(pending.img, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h);
    const mono = toMono(pixels.data, w, h, { threshold: +$('#imgthr').value, dither: $('#imgdither').checked });
    ctx.putImageData(new ImageData(monoToRgba(mono, w, h), w, h), 0, 0);
    bits = { w, h, mm };
    $('#imgadd').disabled = false;
    msg('');
  }
  async function openImage(file) {
    if (file.size > LIMITS.image) return msg(t('assets.errFileBig'), true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const aspect = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1;
      pending = { img, aspect };
      $('#imgname').value = uniqueName(slug(file.name), get());
      $('#imgw').value = String(Math.round(Math.min(30, labelWidth() || 30) * 10) / 10);
      $('#imgpanel').hidden = false;
      convert();
    } catch { closeImage(); msg(t('assets.errImageRead'), true); }
    finally { URL.revokeObjectURL(url); }   // the decoded image stays usable
  }
  async function addImage() {
    if (!pending || !bits) return;
    const name = $('#imgname').value.trim();
    if (!validName(name)) return msg(t('assets.errName'), true);
    if (get().some(a => a.name === name)) return msg(t('assets.errTaken'), true);
    const { w, h, mm } = bits;
    if (await store({ name, kind: 'image', data: $('#imgcanvas').toDataURL('image/png'), w, h, mm })) closeImage();
  }

  // ---- wiring
  const pick = (buttonId, inputId, handler) => {
    $(buttonId).onclick = () => $(inputId).click();
    $(inputId).onchange = async () => {
      const file = $(inputId).files[0];
      $(inputId).value = '';   // the same file can be picked again
      if (!file) return;
      const kind = kindOf(file.name);
      if (kind !== handler) return msg(t('assets.errType'), true);
      await (kind === 'font' ? addFont(file) : openImage(file));
    };
  };
  pick('#addimg', '#imgfile', 'image');
  pick('#addfont', '#fontfile', 'font');
  for (const id of ['#imgw', '#imgthr', '#imgdither']) $(id).addEventListener('input', convert);
  $('#imgdpi').addEventListener('change', convert);
  $('#imgadd').onclick = addImage;
  $('#imgcancel').onclick = () => { closeImage(); msg(''); };
  $('#assetlist').addEventListener('click', async e => {
    const ins = e.target.closest('[data-insert]')?.dataset.insert, del = e.target.closest('[data-remove]')?.dataset.remove;
    const a = get().find(x => x.name === (ins ?? del));
    if (!a) return;
    if (ins) return insert(snippet(a));
    const used = $('#html').value.includes(`asset:${a.name}`) || $('#html').value.includes(`"${a.name}"`);
    try { await save(get().filter(x => x !== a)); } catch { return msg(t('assets.errStore'), true); }
    refresh(); changed();
    msg(t(used ? 'assets.removedUsed' : 'assets.removed', { name: a.name }), used);
  });

  return { refresh };
}
