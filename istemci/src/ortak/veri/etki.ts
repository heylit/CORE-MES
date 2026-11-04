// Etkileşim etkileri kurumun ayarıyla tek tek kapatılabilir (Sistem Ayarları > Görünüm ve hareket > Etkileşim). Kabuk
// kapalı olanları kök öğeye boşlukla ayrılmış liste olarak yazar (data-etki-kapali); CSS `~=` ile, kod bu işlevle okur.
// Öznitelik yoksa hepsi açıktır: ayar gelmeden önceki ilk çizim bugünkü varsayılanla olur.
export const ETKILER = ['grafik-hareket', 'deger-balonu', 'dalga', 'gantt-yardim', 'gantt-kayma', 'durdur-basili'] as const;
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
