// Dış işlem emri (DIE, 2428) kuralları: saf; veritabanı ve saat yok.
import type { DisIslemEmriDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';

export const DIE_YOK = 'Dış işlem emri bulunamadı.';
export const DIE_ADIM_FASON_DEGIL = 'Dış işlem emri yalnız fason adıma açılır; adım fason değil.';
export const DIE_ADIMIN_VAR = 'Bu fason adımın dış işlem emri zaten var.';
export const DIE_KAPALI = 'Dış işlem emri tamamlanmış ya da iptal edilmiş; hareket girilmez.';
export const DIE_EMRE_BAGLI = 'Emre bağlı dış işlem emri iş emriyle yürür: gidiş, dönüş ve tamamlama emrin fason adımından girilir.';
export const DIE_GIDIS_ASIMI = 'Gönderilen toplam, dış işlem emrinin adedini aşamaz.';
export const DIE_DONUS_ASIMI = 'Dönen sağlam ve hurda toplamı gönderileni aşamaz.';
export const DIE_DONUSSUZ = 'Hiç dönüş girilmeden dış işlem emri tamamlanmaz.';
export const DIE_DISARIDA = 'Dışarıda parça varken dış işlem emri tamamlanmaz; önce dönüşü mal kabulden girin.';
export const DIE_GIDISLI_IPTAL = 'Gidişi olan dış işlem emri iptal edilmez.';
export const DIE_TERMIN_ONCE = 'Termin planlanan gidişten önce olamaz.';
export const DIE_ISLEM_YOK = 'Stoktaki parti için işlem (operasyon tipi ya da hizmet kartı) seçilmeli.';

// Durum saklanmaz (Mimar, 2428): emre bağlı belgede iş emrinden ve emirden, partide belgenin kapanışından ve hareket toplamlarından türer.
// UE-DIE-2: adım içeri alınmışsa (fason değil) ya da emir iptalse belge iptal görünür; emir bitmişse ya da adım tamamsa tamamlandı.
// Hesabı kapanan, iş emrinin fason kuralıyla aynıdır: dönen sağlam + hurda + GKK'da firmada hatalı sayılan (1207 c). "Döndü" yalnız
// hedefin (emre bağlıda adıma giren adet, partide belgenin adedi) hepsi gidip hesabı kapanınca; eksik gidişte kısmi döndü kalır.
export interface DieDurumGirdisi {
  emreBagli: boolean;
  isEmriDurumu: string | null;
  emirDurumu: string | null;
  adimFason: boolean;
  tamamlandi: boolean;
  iptal: boolean;
  gonderilen: number;
  donen: number;
  hurda: number;
  firmadaHatali: number;
  hedef: number | null;
}

export function dieDurumu(d: DieDurumGirdisi): DisIslemEmriDurumu {
  if (d.emreBagli) {
    if (d.emirDurumu === 'iptal' || !d.adimFason) return 'iptal';
    if (d.isEmriDurumu === 'tamam' || d.emirDurumu === 'bitti') return 'tamamlandi';
  } else {
    if (d.iptal) return 'iptal';
    if (d.tamamlandi) return 'tamamlandi';
  }
  const kapanan = d.donen + d.hurda + d.firmadaHatali;
  if (d.gonderilen === 0) return 'acik';
  if (kapanan === 0) return 'disarida';
  if (kapanan < d.gonderilen) return 'kismi_dondu';
  return d.hedef !== null && d.gonderilen < d.hedef ? 'kismi_dondu' : 'dondu';
}

// UE-DIE-4: stoktaki partinin belgesi kendi hareketleriyle yürür; emre bağlı belge bu komutları almaz (iş emrinin fason uçları).
export interface DieHareketDurumu {
  emreBagli: boolean;
  kapali: boolean;
  adet: number | null;
  gonderilen: number;
  donen: number;
  hurda: number;
}

const ortak = (d: DieHareketDurumu): string | null => (d.emreBagli ? DIE_EMRE_BAGLI : d.kapali ? DIE_KAPALI : null);

export function dieGidisIhlali(d: DieHareketDurumu, adet: number): string | null {
  return ortak(d) ?? (d.adet !== null && d.gonderilen + adet > d.adet ? DIE_GIDIS_ASIMI : null);
}

export function dieDonusIhlali(d: DieHareketDurumu, saglam: number, hurda: number): string | null {
  return ortak(d) ?? (d.donen + d.hurda + saglam + hurda > d.gonderilen ? DIE_DONUS_ASIMI : null);
}

export function dieTamamIhlali(d: DieHareketDurumu): string | null {
  const o = ortak(d);
  if (o !== null) return o;
  const kapanan = d.donen + d.hurda;
  if (kapanan === 0) return DIE_DONUSSUZ;
  return kapanan < d.gonderilen ? DIE_DISARIDA : null;
}

// UE-DIE-5: iptal yalnız gidişi olmayan, kapanmamış parti belgesinde; emre bağlı belge adımla birlikte kapanır.
export function dieIptalIhlali(d: DieHareketDurumu): string | null {
  return ortak(d) ?? (d.gonderilen > 0 ? DIE_GIDISLI_IPTAL : null);
}

// UE-DIE-3: partideki belgede işlem seçilir ve termin gidişten önce olmaz (kısıtla aynı; ileti alana bağlanır).
export function diePartiGirdisiIhlali(g: { operasyonTipiId: number | null; hizmetNo: number | null; planlananGidis: string | null; termin: string | null }):
  { ileti: string; alan: string } | null {
  if (g.operasyonTipiId === null && g.hizmetNo === null) return { ileti: DIE_ISLEM_YOK, alan: 'operasyonTipiId' };
  if (g.termin !== null && g.planlananGidis !== null && g.termin < g.planlananGidis) return { ileti: DIE_TERMIN_ONCE, alan: 'termin' };
  return null;
}
