// Haritanın açıklaması (zo-kontrol AT_LEJANT): çizgiler, hareket ve renkler. Özet hücresinde açılır kutu, Harita'da sağ üstteki düğme.
export const HARITA_OKUMA: [string, string, string][] = [
  ['yay', 'Çizgi', 'iş bir tezgâhtan sonrakine geçer; kalın çizgi daha çok iş'],
  ['akis', 'Akan noktalar', 'akışın yönü'],
  ['parca', 'Renkli top', 'iki adım arasında yolda olan parça, siparişin renginde; kırmızı halka geç sipariş'],
  ['fark', 'Sarı kesik', 'önceki plana göre değişen akış'],
  ['serit', 'Kartın üst şeridi', 'yeşil çalışıyor, gri boşta ya da fason, kırmızı arıza'],
  ['nabiz', 'Kırmızı parıltı', "tezgâh bugün %97'den çok dolu (darboğaz)"],
  ['gun', 'Yedi çubuk', 'haftanın günlerinde doluluk: yeşil, sarı %75 üstü, kırmızı %97 üstü; altı çizili gün bugün'],
  ['sira', 'SIRA', 'tezgâhta bekleyen işler, siparişin renginde'],
];

export function HaritaOkuma() {
  return (
    <ul className="tc-pym-lj" aria-label="Haritanın açıklaması">
      {HARITA_OKUMA.map(([k, ad, m]) => <li key={k}><i className="tc-pym-lj-i" data-lj={k} aria-hidden="true" /><b>{ad}</b><span>{m}</span></li>)}
    </ul>
  );
}
