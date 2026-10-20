// 233 a: rotası olan kartın Operasyonlar adımı salt okunur çizilir; düzenleme Reçete ve Rota'dadır (prototipte reçete adımı zaten yok).
// Yeni kartta ve rotası olmayan kartta adım bugünkü gibi düzenlenir (ilk rota karttan açılır). Prototip dosyası değişmez: bu betik
// prototipten sonra eklenir, `opsHTML` işlevini sarar. Rota durumu köprüden (`kart-rotasi`) bir kez okunur, liste yenilenince unutulur;
// okunamazsa adım düzenlenebilir kalır, sunucu değişikliği yine reddeder.
export const ROTALI_KART_EKI = `
const RotaKilidi = {
  durum: {},
  kilitliMi(d) {
    if (!Host.on || !d || !d.id || !Store.items.some(x => x.id === d.id)) return false;
    const v = this.durum[d.id];
    if (v === undefined) { this.oku(d.id); return false; }
    return v === true;
  },
  oku(id) {
    this.durum[id] = 'okunuyor';
    Host.istek('kart-rotasi', id)
      .then(c => { this.durum[id] = !!(c && c.rotali === true); }, () => { this.durum[id] = false; })
      .then(() => { if (this.durum[id] === true && view === 'new' && D && D.id === id) renderWizard(); });
  },
  not() {
    return '<div class="cwarn"><b>Bu kartın rotası var.</b> Operasyonlar Reçete ve Rota\\'da düzenlenir; burada yalnız görünür. <button class="btn sm" data-urun-rotasi>Reçete ve Rota\\'da düzenle</button></div>';
  },
  tablo(basliklar, satirlar, bos) {
    if (!satirlar.length) return '<p class="empty">' + esc(bos) + '</p>';
    return '<div class="vtable"><table><thead><tr>' + basliklar.map(b => '<th>' + esc(b) + '</th>').join('') + '</tr></thead><tbody>'
      + satirlar.map(r => '<tr>' + r.map(v => '<td>' + esc(v == null ? '' : v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  },
  opsHTML(d) {
    return this.not() + this.tablo(['No', 'Kod', 'Operasyon'], (d.ops || []).map(o => [o.no, o.kod, o.ad]), 'Kartta operasyon yok.');
  },
};
if (typeof opsHTML === 'function' && typeof hostYenile === 'function') {
  const asilOps = opsHTML, asilYenile = hostYenile;
  opsHTML = function () { return RotaKilidi.kilitliMi(D) ? RotaKilidi.opsHTML(D) : asilOps.apply(this, arguments); };
  hostYenile = async function () { RotaKilidi.durum = {}; return asilYenile.apply(this, arguments); };
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-urun-rotasi]') : null;
    if (t) Host.istek('git', 'urun-rotalari').catch(err => toast(String((err && err.message) || err || 'Sayfa açılamadı.')));
  });
}
`;
