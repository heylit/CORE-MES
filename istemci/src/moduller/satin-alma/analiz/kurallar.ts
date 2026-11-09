import type {
  SatinAlmaAnaliziCevabi, SatinAlmaAsamasi, SatinAlmaKuralDisiDonemi, SatinAlmaSapmaDonemi, SatinAlmaTedarikcisi, SatinAlmaTuketimMalzemesi,
  SatinAlmaTutarOlcusu,
} from '#paylasilan/sozlesme/satin-alma-analiz.ts';

// Satın alma analizi ekranının saf yardımcıları (2151). Bilinmeyen değer "-" ya da gerekçesiyle yazılır; sıfır uydurulmaz.

const sayi = (n: number, basamak = 1) => n.toLocaleString('tr-TR', { maximumFractionDigits: basamak });
// Eksi yüzde işaret önde yazılır: -%7,9.
export const yuzdeMetni = (n: number | null) => (n === null ? '-' : n < 0 ? `-%${sayi(-n)}` : `%${sayi(n)}`);
export const isaretliYuzde = (n: number | null) => (n === null ? '-' : n > 0 ? `+${yuzdeMetni(n)}` : yuzdeMetni(n));
export const gunMetni = (n: number | null) => (n === null ? '-' : `${sayi(n)} gün`);
// 2464 b: para TL simgesiyle. Tutarlar tam lira; birim fiyat farkı kuruşlu (isaretliBirimTl).
const TL = '₺';
export const tlMetni = (n: number | null) => (n === null ? '-' : `${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${TL}`);
export const miktarMetni = (n: number | null) => (n === null ? '-' : sayi(n, 2));
const isaretli = (n: number, basamak: number) => {
  const yuvarlak = Number(n.toFixed(basamak));
  const mutlak = Math.abs(yuvarlak).toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
  return `${yuvarlak > 0 ? '+' : yuvarlak < 0 ? '-' : ''}${mutlak} ${TL}`;
};
export const isaretliTl = (n: number) => isaretli(n, 0);
export const isaretliBirimTl = (n: number) => isaretli(n, 2);
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

// ---- 2471: süreç ve fiyat ölçülerinin metinleri.
export const ASAMA_ADLARI: Readonly<Record<SatinAlmaAsamasi, string>> = {
  'teklif-istegi': 'Talep → teklif isteği', teklif: 'Teklif isteği → son teklif', karar: 'Son teklif → karar', onay: 'Karar → son onay',
  siparis: 'Onay → sipariş', 'ilk-teslim': 'Sipariş → ilk teslim', 'tam-teslim': 'İlk teslim → tam teslim',
};
export const KIRILIM_ADLARI = { kategori: 'Kategori', birim: 'Birim', alici: 'Alıcı' } as const;

// Ortanca ve P80; eşik altında örnek sayısıyla "yetersiz veri".
export function sureOzetiMetni(s: { ornek: number; ortancaGun: number | null; yuzde80Gun: number | null }, gereken: number): string {
  if (s.ortancaGun === null) return s.ornek === 0 ? 'Örnek yok' : `Yetersiz veri: ${String(s.ornek)} örnek, ${String(gereken)} gerekir`;
  return `${gunMetni(s.ortancaGun)}, P80 ${gunMetni(s.yuzde80Gun)}`;
}
// Önceki dönemle kıyas satırı; önceki değer yoksa yalnız ek yazılır.
export function oncekiMetni(onceki: string | null, ek = ''): string {
  return [ek, onceki === null ? '' : `önceki ${onceki}`].filter((x) => x !== '').join(' · ');
}
export const tutarMetni = (t: SatinAlmaTutarOlcusu): string => (t.tutarTl === null ? 'Veri yok' : isaretliTl(t.tutarTl));
export function tutarAltMetni(t: SatinAlmaTutarOlcusu, birim: string, onceki: SatinAlmaTutarOlcusu): string {
  const kursuz = t.kursuz > 0 ? `, kuru girilmemiş ${String(t.kursuz)}` : '';
  const kur = t.kurEtkisiTl === null || t.kurEtkisiTl === 0 ? '' : `, kur etkisi ayrıca ${isaretliTl(t.kurEtkisiTl)}`;
  return oncekiMetni(onceki.tutarTl === null ? null : isaretliTl(onceki.tutarTl), `${String(t.ornek)} ${birim}${kursuz}${kur}`);
}
export function sapmaAltMetni(d: SatinAlmaSapmaDonemi): string {
  const endeks = d.endeksYok > 0 ? ` · ₺ kalemde endeks yok: ${String(d.endeksYok)}` : '';
  return `${String(d.satir)} satır, bant dışı ${String(d.bantDisi)}${endeks}`;
}
export const bantDisiOrani = (d: SatinAlmaSapmaDonemi): number | null => (d.satir === 0 ? null : Math.round((d.bantDisi / d.satir) * 1000) / 10);
export const BANT_ADLARI = { icinde: 'Bant içinde', ustunde: 'Hedefin üstünde', altinda: 'Hedefin altında' } as const;
export const kuralDisiMetni = (d: SatinAlmaKuralDisiDonemi): string => (d.payYuzde === null ? 'Veri yok' : yuzdeMetni(d.payYuzde));
