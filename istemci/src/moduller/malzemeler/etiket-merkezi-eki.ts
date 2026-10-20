// 269 a: malzeme kartının etiketi Etiket Merkezi'nde basılır. Kart ayrıntısında prototipin "Etiket" düğmesinin yanına merkezi açan düğme
// eklenir; QR ile açılan saha görünümünde de aynı düğme durur. Yalnız Etiket Merkezi'ni açabilen kullanıcıda (hazır cevabındaki `etiketMerkezi`)
// ve kayıtlı, hizmet olmayan kartta görünür. Prototip dosyası değişmez: bu betik prototipten sonra eklenir, `openItem` ve `sahaAc` işlevlerini
// sarar. Adres kabukta kartın no'suyla kurulur.
export const ETIKET_MERKEZI_EKI = `
const EtiketMerkezi = {
  acikMi(x) { return !!(Host.on && Host.ayar && Host.ayar.etiketMerkezi === true && x && x.tur !== 'hizmet' && Store.items.some(i => i.id === x.id)); },
  dugme(id) { return '<button class="btn" data-etiket-merkezi data-id="' + esc(id) + '">Etiket Merkezi\\'nde bas</button>'; },
  ekle(id) {
    if (!this.acikMi(Store.items.find(i => i.id === id))) return;
    const yer = document.querySelector('#ovIn [data-act="lbl"]');
    if (yer && !document.querySelector('#ovIn [data-etiket-merkezi]')) yer.insertAdjacentHTML('afterend', this.dugme(id));
  },
};
if (typeof openItem === 'function') {
  const asilAc = openItem;
  openItem = function (id) { const r = asilAc.apply(this, arguments); EtiketMerkezi.ekle(id); return r; };
  if (typeof sahaAc === 'function') {
    const asilSaha = sahaAc;
    sahaAc = function (id) { const r = asilSaha.apply(this, arguments); EtiketMerkezi.ekle(id); return r; };
  }
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-etiket-merkezi]') : null;
    if (t) Host.istek('etiket-merkezi', t.dataset.id).catch(err => toast(String((err && err.message) || err || 'Etiket Merkezi açılamadı.')));
  });
}
`;
