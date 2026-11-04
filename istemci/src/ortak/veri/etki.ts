// Etkileşim etkileri kurumun ayarıyla tek tek kapatılabilir (Sistem Ayarları > Görünüm ve hareket > Etkileşim). Kabuk
// kapalı olanları kök öğeye boşlukla ayrılmış liste olarak yazar (data-etki-kapali); CSS `~=` ile, kod bu işlevle okur.
// Öznitelik yoksa hepsi açıktır: ayar gelmeden önceki ilk çizim bugünkü varsayılanla olur.
export const ETKILER = ['grafik-hareket', 'deger-balonu', 'dalga', 'gantt-yardim', 'gantt-kayma', 'durdur-basili', 'pencere-kayma', 'pencere-cekme', 'sekme-cizgi', 'menu-gecis', 'bildirim-kayma', 'hizli-artis', 'satir-kaydirma', 'tablo-iskelet', 'kopyala'] as const;
export type Etki = (typeof ETKILER)[number];
export const ETKI_OZNITELIGI = 'data-etki-kapali';

export function etkiAcik(etki: Etki): boolean {
  try {
    const liste = document.documentElement.getAttribute(ETKI_OZNITELIGI);
    return liste === null || !liste.split(/\s+/).includes(etki);
  } catch {
    return true;
  }
}

// Hareketli etki yalnız hareket dili açık, işletim sistemi hareketi azaltmamış ve etki kapatılmamışsa oynar. Ölçülemeyen
// ortamda (test, eski tarayıcı) oynamaz: kapanış beklemeden olur, içerik hiç yarım görünmez.
export function hareketliEtki(etki: Etki): boolean {
  try {
    if (document.documentElement.getAttribute('data-hareket') === 'kapali' || !etkiAcik(etki)) return false;
    if (typeof window.matchMedia !== 'function') return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
