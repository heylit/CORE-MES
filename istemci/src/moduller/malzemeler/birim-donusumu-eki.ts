// 323 b: kartta alış birimi ve katsayısı (1 alış birimi = katsayı kadar stok birimi). Satın alma siparişi tedarikçinin biriminde girer,
// stoka kartın biriminde düşer. Prototip dosyası değişmez; bu betik prototipten sonra eklenir, genel `s5` (hammadde) ve `gTicariHTML`
// (öteki türler) işlevlerini sarar ve iki alanı "Stok birimi" seçiminin hemen arkasına koyar. Değerler kartın `com` alanına
// prototipin genel `data-b` bağıyla yazılır; katsayı metin kalır (virgül de olur), denetimi sunucu yapar.
export const BIRIM_DONUSUMU_EKI = `
const BirimDonusumu = {
  birimler(stok) {
    const hepsi = [...BIRIMLER, ...Object.values(BIRIM_T).flat()];
    return [...new Set(hepsi)].filter(b => b !== stok);
  },
  alanlar(d) {
    const com = d.com || {};
    const stok = finalBirim(d);
    const secili = String(com.alisBirimi || '').trim();
    const liste = this.birimler(stok);
    if (secili && !liste.includes(secili)) liste.push(secili);
    const secenekler = '<option value="">Yok</option>' + liste.map(b => '<option value="' + esc(b) + '"' + (b === secili ? ' selected' : '') + '>' + esc(b) + '</option>').join('');
    const katsayi = com.alisKatsayisi === undefined || com.alisKatsayisi === null ? '' : String(com.alisKatsayisi);
    return '<label class="f"><span>Alış birimi</span><span class="inp"><select data-b="com.alisBirimi">' + secenekler + '</select></span></label>'
      + '<label class="f"><span>1 alış birimi = kaç ' + esc(stok) + '</span><span class="inp"><input data-b="com.alisKatsayisi" inputmode="decimal" autocomplete="off" placeholder="ör. 50" value="' + esc(katsayi) + '"></span></label>';
  },
  ekle(h, d) {
    if (typeof h !== 'string') return h;
    const bas = h.indexOf('<span>Stok birimi</span>');
    if (bas < 0) return h;
    const son = h.indexOf('</label>', bas);
    if (son < 0) return h;
    const yer = son + '</label>'.length;
    return h.slice(0, yer) + this.alanlar(d) + h.slice(yer);
  },
};
if (typeof s5 === 'function' && typeof gTicariHTML === 'function') {
  const asilHammadde = s5;
  s5 = function () { return BirimDonusumu.ekle(asilHammadde.apply(this, arguments), D); };
  const asilTicari = gTicariHTML;
  gTicariHTML = function () { return BirimDonusumu.ekle(asilTicari.apply(this, arguments), D); };
}
`;
