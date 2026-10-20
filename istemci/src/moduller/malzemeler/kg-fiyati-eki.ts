// Kartta birim fiyat: satın almanın kg fiyatı köprüden (`kg-fiyatlari`) okunur, yalnız çerçevenin belleğinde durur, karta yazılmaz.
// Prototip dosyası değişmez (prototip ekranlar değişmez kuralı); bu betik prototipten sonra sayfaya eklenir ve prototipin genel
// `hostYenile` ile `specHTML` işlevlerini sarar. Yetkisi olmayan rolde (köprü null döner) satır hiç çizilmez; yetkili rolde fiyatı
// bilinmeyen tutar "—" yazılır, sıfır yazılmaz.
export const KG_FIYATI_EKI = `
const KgFiyati = {
  fiyatlar: null,
  hammaddeMi(d) { return !!d && (d.tur === undefined || d.tur === null || d.tur === '' || d.tur === 'hammadde'); },
  satirlar(d, birim) {
    if (!Host.on || !this.fiyatlar || !this.hammaddeMi(d)) return [];
    const f = this.fiyatlar[d.id];
    if (!f) return [['Birim fiyat', '—']];
    const tutar = v => { const n = Number(v); return v != null && v !== '' && isFinite(n) ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' ' + f.paraBirimi : ''; };
    const birimFiyati = tutar(f.birimFiyati);
    const s = [['Birim fiyat', birimFiyati ? birimFiyati + (birim ? ' / ' + birim : '') : '—']];
    if (tutar(f.kgFiyati)) s.push(['kg fiyatı (satın alma)', tutar(f.kgFiyati) + (f.gecerlilik ? ', ' + _tStr(_tarih(f.gecerlilik)) + ' itibarıyla' : '')]);
    return s;
  },
  async yukle() {
    try {
      const c = await Host.istek('kg-fiyatlari');
      this.fiyatlar = c && c.fiyatlar && typeof c.fiyatlar === 'object' ? c.fiyatlar : null;
    } catch (e) { this.fiyatlar = null; }
  },
  // Satırlar föyün Ticari bölümünde stok biriminden sonra, sertifikalardan önce durur.
  foyeEkle(h, satirlar) {
    if (!satirlar.length) return h;
    const bas = h.indexOf('<h3>Ticari</h3><dl class="dl">');
    if (bas < 0) return h;
    const son = h.indexOf('</dl>', bas);
    const parca = h.slice(bas, son);
    const once = ['<dt>Sertifikalar</dt>', '<dt>Notlar</dt>'].map(k => parca.indexOf(k)).filter(i => i >= 0);
    const yer = once.length ? bas + Math.min(...once) : son;
    return h.slice(0, yer) + satirlar.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + h.slice(yer);
  },
};
if (typeof hostYenile === 'function' && typeof specHTML === 'function') {
  const asilYenile = hostYenile;
  hostYenile = async function () { await asilYenile.apply(this, arguments); await KgFiyati.yukle(); };
  const asilFoy = specHTML;
  specHTML = function (d, compact) {
    const h = asilFoy.apply(this, arguments);
    if (compact || typeof h !== 'string') return h;
    return KgFiyati.foyeEkle(h, KgFiyati.satirlar(d, specData(d).birim));
  };
}
`;
