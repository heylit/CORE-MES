import type { SatinAlmaAnaliziCevabi, SatinAlmaTedarikcisi, SatinAlmaTuketimMalzemesi } from '#paylasilan/sozlesme/satin-alma-analiz.ts';

// Satın alma analizi ekranının saf yardımcıları (2151). Bilinmeyen değer "-" ya da gerekçesiyle yazılır; sıfır uydurulmaz.

const sayi = (n: number, basamak = 1) => n.toLocaleString('tr-TR', { maximumFractionDigits: basamak });
export const yuzdeMetni = (n: number | null) => (n === null ? '-' : `%${sayi(n)}`);
export const gunMetni = (n: number | null) => (n === null ? '-' : `${sayi(n)} gün`);
export const tlMetni = (n: number | null) => (n === null ? '-' : `${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`);
export const miktarMetni = (n: number | null) => (n === null ? '-' : sayi(n, 2));
export const isaretliTl = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;
export const ayEtiketi = (ay: string) => `${ay.slice(5, 7)}.${ay.slice(2, 4)}`;

// Karne zamanında oranı; karnenin kendi eşiği altındaysa "yetersiz veri" ve teslim sayısı yazar.
export function karneMetni(t: SatinAlmaTedarikcisi): string {
  if (t.karne === null || t.karne.teslimToplam === 0) return 'Teslim kaydı yok';
  const oran = yuzdeMetni(t.karne.zamanindaOran);
  return t.karne.yetersizVeri ? `${oran} (yetersiz veri: ${String(t.karne.teslimToplam)} teslim)` : `${oran} (${String(t.karne.teslimToplam)} teslim)`;
}
// Bayes kestirimi: "%90 olasılıkla en az".
export function bayesMetni(t: SatinAlmaTedarikcisi): string {
  return t.zamanindaBayes === null ? '-' : `${yuzdeMetni(t.zamanindaBayes.ortalama)}, en az ${yuzdeMetni(t.zamanindaBayes.alt90)}`;
}
export function gecikmeMetni(t: SatinAlmaTedarikcisi): string {
  if (t.gecikme === null) return '-';
  return `ort. ${gunMetni(t.gecikme.ortalamaGun)}, %80 ${gunMetni(t.gecikme.yuzde80Gun)} (${String(t.gecikme.gecKalan)}/${String(t.gecikme.teslim)} geç)`;
}
export function sureMetni(t: SatinAlmaTedarikcisi, gereken: number): string {
  const s = t.tedarikSuresi;
  if (s.ortancaGun === null) return s.ornek === 0 ? 'Tam teslim yok' : `Yetersiz veri: ${String(s.ornek)} teslim, ${String(gereken)} gerekir`;
  const teklif = s.teklifOrtancaGun === null ? '' : ` (teklif ${gunMetni(s.teklifOrtancaGun)})`;
  return `${gunMetni(s.ortancaGun)}, %80 ${gunMetni(s.yuzde80Gun)}${teklif}`;
}

export function harcamaAltMetni(h: SatinAlmaAnaliziCevabi['harcama']): string {
  if (h.toplamTl === null) return h.kursuzSatir > 0 ? `Kuru girilmemiş ${String(h.kursuzSatir)} sipariş satırı sayılmadı.` : 'Son 12 ayda sipariş yok.';
  const kursuz = h.kursuzSatir > 0 ? ` Kuru girilmemiş ${String(h.kursuzSatir)} satır sayılmadı.` : '';
  return `${String(h.kalemSayisi)} kalem: A ${String(h.siniflar.A)}, B ${String(h.siniflar.B)}, C ${String(h.siniflar.C)}.${kursuz}`;
}

// Tüketim satırının tahmin hücresi: yetersiz geçmişte nedenini yazar.
export function tahminMetni(m: SatinAlmaTuketimMalzemesi, gereken: number): string {
  if (m.tahminAylik !== null) return `${miktarMetni(m.tahminAylik)} / ay`;
  return m.gecmisAy === 0 ? 'Stok hareketi yok' : `Yetersiz veri: ${String(m.gecmisAy)} ay, ${String(gereken)} gerekir`;
}
export function guvenlikMetni(m: SatinAlmaTuketimMalzemesi): string {
  if (m.guvenlikStogu !== null) return miktarMetni(m.guvenlikStogu);
  if (m.tahminAylik === null) return '-';
  return 'Tedarik süresi bilinmiyor';
}
export const XYZ_ACIKLAMA = { X: 'düzenli', Y: 'dalgalı', Z: 'düzensiz' } as const;
