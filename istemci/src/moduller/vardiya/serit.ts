import type { PlanliDurus } from '#paylasilan/sozlesme/vardiya.ts';

// Planlı duruş şeridinin hesabı (kart #544). Sunucudaki VR-15 açılımının (vardiya/kurallar.ts `durusAraliklari`) gösterim karşılığıdır:
// tekrar her gün aynı yerel saatte başlar, haftalıkta yalnız seçili ISO günlerde, ilk başlangıçtan önce ve tekrar bitişinden sonra
// başlamaz. Tarayıcı saati tesis saatidir (VARSAYIM; tesis Europe/Istanbul, yaz saati yok).
export interface Aralik { bas: number; bit: number }
export type SeritDurusu = Pick<PlanliDurus, 'baslangic' | 'bitis' | 'tekrar' | 'gunler' | 'tekrarBitis' | 'aktif'>;

export function gunBasi(an: number): number {
  const t = new Date(an);
  t.setHours(0, 0, 0, 0);
  return t.getTime();
}

function gunEkle(gun: number, kac: number): number {
  const t = new Date(gun);
  t.setDate(t.getDate() + kac);
  return t.getTime();
}

const isoGun = (an: number): number => ((new Date(an).getDay() + 6) % 7) + 1;

// [pencere, pencere + gunSayisi gün) içine kesilmiş gerçekleşmeler; pasif duruşun gerçekleşmesi yoktur.
export function gerceklesmeler(d: SeritDurusu, pencere: number, gunSayisi: number): Aralik[] {
  if (!d.aktif) return [];
  const ilk = Date.parse(d.baslangic);
  const sure = Date.parse(d.bitis) - ilk;
  const ust = gunEkle(pencere, gunSayisi);
  const kes = (bas: number): Aralik[] => {
    const b = Math.max(pencere, bas);
    const e = Math.min(ust, bas + sure);
    return e > b ? [{ bas: b, bit: e }] : [];
  };
  if (sure <= 0) return [];
  if (d.tekrar === 'yok') return kes(ilk);
  const saat = new Date(ilk);
  const son = d.tekrarBitis === null ? null : Date.parse(d.tekrarBitis);
  const sonuc: Aralik[] = [];
  // Gün sayacı takvim günüyle ilerler (gece yarısı ve gün uzunluğu yerel saatle); önceki günden taşan gerçekleşme için -1'den.
  const ilkGun = Math.round((gunBasi(ilk) - pencere) / 86_400_000);
  for (let i = Math.max(-1, ilkGun); i < gunSayisi; i += 1) {
    const gun = new Date(gunEkle(pencere, i));
    gun.setHours(saat.getHours(), saat.getMinutes(), 0, 0);
    const bas = gun.getTime();
    if (son !== null && bas > son) break;
    if (d.tekrar === 'haftalik' && !d.gunler.includes(isoGun(bas))) continue;
    sonuc.push(...kes(bas));
  }
  return sonuc;
}

// Bir daha gerçekleşmeyecek duruş: tek seferlik bitmiş ya da tekrarı bitmiş. Süresiz tekrar geçmiş olmaz.
export function gecmisMi(d: SeritDurusu, simdi: number): boolean {
  const sure = Date.parse(d.bitis) - Date.parse(d.baslangic);
  if (d.tekrar === 'yok') return Date.parse(d.bitis) <= simdi;
  return d.tekrarBitis !== null && Date.parse(d.tekrarBitis) + sure <= simdi;
}

// Şerit üzerindeki konum, yüzde (0-100).
export const yuzde = (an: number, pencere: number, gunSayisi: number): number =>
  Math.max(0, Math.min(100, ((an - pencere) / (gunEkle(pencere, gunSayisi) - pencere)) * 100));
