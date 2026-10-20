/* Operatör Özetim (kart #1295). Hesap TMI sunucusundadır (GET /arkon/operator-ozeti); ekran yalnız gösterir. Veri yoksa alan null gelir ve
   "–" gösterilir: sıfır uydurulmaz. Ekip ortalaması isimsiz tek sayıdır. */
export type OzetDonemi = 'gun' | 'hafta' | 'ay';
export interface OzetGunu { tarih: string; saglam: number | null; hurda: number | null; beklenen: number | null }
export interface OperatorOzeti {
  kisi: { id: number; ad: string };
  donem: OzetDonemi; baslangic: string; bitis: string; hesaplama: string;
  saglam: number | null; hurda: number | null; kalite: number | null; calismaSn: number | null; saatlikSaglam: number | null;
  basari: { uretilen: number; beklenen: number; oran: number; eksikGun: number; standartla: number } | null;
  verim: { oran: number; suresizSaglam: number } | null;
  emekVerimi: { oran: number | null; standartSn: number; mesaiSn: number | null };
  isler: { isEmriId: number | null; emirNo: string; parca: string; opNo: number | null; adimAdi: string | null; durum: 'bekliyor' | 'calisiyor' | 'tamam'; saglam: number | null; hurda: number | null; saniye: number | null }[];
  hurdaNedenleri: { kod: string | null; ad: string; adet: number }[];
  ekipOrtalamasi: number | null;
  gunler: OzetGunu[];
  rozetler: { kod: string; baslik: string; aciklama: string }[];
  yetkiler: { istasyonlar: { id: number; kod: string; ad: string }[]; makineler: { id: number; kod: string; ad: string; istasyonKodu: string | null }[] };
  mesailer: { tarih: string; dakika: number; kapali: { tur: 'tatil' | 'kapali'; ad: string | null } | null; baslangic: string | null; bitis: string | null }[] | null;
  fazlaMesai: {
    aySaat: number | null; yilSaat: number | null; bekleyenSaat: number | null; yillikSinirSaat: number | null;
    satirlar: { tarih: string; tur: string; saat: number | null; onay: 'Onaylandı' | 'Beklemede' | null }[];
  } | null;
  izinler: {
    hakGun: number | null; kalanGun: number | null; kullanilanGun: number; bekleyenGun: number; sonrakiHakTarihi: string | null; sonrakiHakGun: number | null;
    yaklasan: { tur: string; baslangic: string; bitis: string; gun: number | null; durum: 'Beklemede' | 'Onaylandı' }[];
  } | null;
  ekip: { id: number; ad: string }[];
}

export const OZET_IS_DURUMU: Record<OperatorOzeti['isler'][number]['durum'], string> = { bekliyor: 'Bekliyor', calisiyor: 'Sürüyor', tamam: 'Bitti' };

export const OZET_DONEM_ADI: Record<OzetDonemi, string> = { gun: 'Bugün', hafta: 'Bu hafta', ay: 'Bu ay' };
const GUN_ADI = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const tarihMs = (tarih: string, gun = 0): number => { const [y, a, g] = tarih.split('-').map(Number) as [number, number, number]; return Date.UTC(y, a - 1, g + gun); };

export const ozetAdet = (n: number | null | undefined): string => (n == null ? '–' : Math.round(n).toLocaleString('tr-TR'));

// Çalışılan süre "5 sa 20 dk"; süre yoksa "–".
export function ozetSure(sn: number | null | undefined): string {
  if (sn == null) return '–';
  const dk = Math.round(sn / 60), sa = Math.floor(dk / 60);
  return sa ? `${sa} sa ${dk % 60} dk` : `${dk} dk`;
}

// Saat ve gün sayıları en çok bir ondalıkla; bilinmiyorsa "–".
export const ozetSayi = (n: number | null | undefined): string => (n == null ? '–' : (Math.round(n * 10) / 10).toLocaleString('tr-TR'));

// "14 Eki Sal"; mesai ve izin satırlarında.
const AY_ADI = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export function ozetTarih(tarih: string): string {
  const d = new Date(tarihMs(tarih));
  return `${d.getUTCDate()} ${AY_ADI[d.getUTCMonth()] ?? ''} ${GUN_ADI[d.getUTCDay()] ?? ''}`;
}

// Mesainin başlangıç ve bitiş saati tesis saat dilimiyle (TMI paylasilan/tesis-zamani.ts ile aynı).
const SAAT = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const ozetSaat = (zaman: string | null): string => (zaman === null ? '–' : SAAT.format(new Date(zaman)));

// Yıllık fazla mesai doluluğu 0-1; toplam ya da sınır bilinmiyorsa null.
export function fazlaMesaiDolulugu(f: OperatorOzeti['fazlaMesai']): number | null {
  if (f === null || f.yilSaat === null || f.yillikSinirSaat === null || f.yillikSinirSaat <= 0) return null;
  return Math.min(1, f.yilSaat / f.yillikSinirSaat);
}

// Oran yüzde olarak ("%82"); bilinmiyorsa "–".
export const ozetYuzde = (oran: number | null | undefined): string => (oran == null ? '–' : `%${Math.round(oran * 100)}`);

// Grafik etiketi: bugün "Bugün", ötekiler haftanın günü.
export function ozetGunEtiketi(tarih: string, bugun: string): string {
  if (tarih === bugun) return 'Bugün';
  return GUN_ADI[new Date(tarihMs(tarih)).getUTCDay()] ?? '';
}

// Grafiğin üst sınırı: en büyük sağlam + hurda, 10'a yuvarlanmış; hiç veri yoksa null.
export function ozetGrafikUstu(gunler: readonly OzetGunu[]): number | null {
  const enBuyuk = Math.max(0, ...gunler.map(g => (g.saglam ?? 0) + (g.hurda ?? 0)));
  return enBuyuk > 0 ? Math.ceil(enBuyuk / 10) * 10 : null;
}

// Gösterim kipindeki (sunucusuz) örnek: kişi ve sayılar uydurmadır, kayıt değildir.
export function ornekOzet(donem: OzetDonemi, bugun: string): OperatorOzeti {
  const gun = (geri: number): string => new Date(tarihMs(bugun, -geri)).toISOString().slice(0, 10);
  const adet: (readonly [number, number] | null)[] = [[276, 2], [331, 0], null, null, [298, 0], [305, 0], [214, 3]];
  const carpan = donem === 'gun' ? 1 : donem === 'hafta' ? 5 : 16;
  return {
    kisi: { id: 1, ad: 'Örnek Operatör' }, donem, baslangic: bugun, bitis: bugun, hesaplama: new Date().toISOString(),
    saglam: 214 * carpan, hurda: 3 * carpan, kalite: 214 / 217, calismaSn: 19200 * carpan, saatlikSaglam: 40,
    basari: { uretilen: 214 * carpan, beklenen: 236 * carpan, oran: 0.91, eksikGun: 0, standartla: 0 },
    verim: { oran: 0.87, suresizSaglam: 0 },
    emekVerimi: { oran: 0.82, standartSn: 25092 * carpan, mesaiSn: 30600 * carpan },
    isler: [
      { isEmriId: 1, emirNo: 'ÜE-0142', parca: 'Örnek parça A', opNo: 20, adimAdi: 'Frezeleme', durum: 'calisiyor', saglam: 96, hurda: null, saniye: 7800 },
      { isEmriId: 2, emirNo: 'ÜE-0139', parca: 'Örnek parça B', opNo: 10, adimAdi: 'Tornalama', durum: 'tamam', saglam: 110, hurda: 2, saniye: 9900 },
      { isEmriId: 3, emirNo: 'ÜE-0131', parca: 'Örnek parça C', opNo: 30, adimAdi: 'Çapak alma', durum: 'tamam', saglam: 8, hurda: 1, saniye: 1500 },
    ],
    hurdaNedenleri: [{ kod: 'H01', ad: 'Ölçü dışı', adet: 2 }, { kod: 'H04', ad: 'Takım kırılması', adet: 1 }],
    ekipOrtalamasi: donem === 'gun' ? 0.88 : null,
    gunler: adet.map((x, i) => ({ tarih: gun(6 - i), saglam: x ? x[0] : null, hurda: x ? x[1] : null, beklenen: x ? [300, 320, 0, 0, 310, 300, 236][i] ?? null : null })),
    rozetler: [{ kod: 'en-iyi-gun', baslik: 'Bu ayın en çok sağlam çıkan günü', aciklama: 'Cuma · 331 adet' }],
    yetkiler: { istasyonlar: [{ id: 1, kod: 'CNC-T', ad: 'CNC Torna' }], makineler: [{ id: 4, kod: 'TZG-04', ad: 'Örnek tezgah', istasyonKodu: 'CNC-T' }, { id: 5, kod: 'TZG-05', ad: 'Örnek tezgah', istasyonKodu: 'CNC-T' }] },
    mesailer: Array.from({ length: 7 }, (_, i) => {
      const tarih = gun(-i);
      const hs = new Date(tarihMs(tarih)).getUTCDay();
      if (hs === 0) return { tarih, dakika: 0, kapali: null, baslangic: null, bitis: null };
      const bas = tarihMs(tarih) + 5 * 3_600_000, bit = bas + (hs === 6 ? 5 : 9.5) * 3_600_000;
      return { tarih, dakika: hs === 6 ? 270 : 510, kapali: null, baslangic: new Date(bas).toISOString(), bitis: new Date(bit).toISOString() };
    }),
    fazlaMesai: {
      aySaat: 6, yilSaat: 84, bekleyenSaat: 2, yillikSinirSaat: 270,
      satirlar: [{ tarih: gun(1), tur: 'Fazla mesai', saat: 2, onay: 'Beklemede' }, { tarih: gun(5), tur: 'Hafta tatili çalışması', saat: 4, onay: 'Onaylandı' }],
    },
    izinler: {
      hakGun: 14, kalanGun: 9, kullanilanGun: 5, bekleyenGun: 2, sonrakiHakTarihi: gun(-120), sonrakiHakGun: 14,
      yaklasan: [{ tur: 'Yıllık izin', baslangic: gun(-20), bitis: gun(-19), gun: 2, durum: 'Beklemede' }],
    },
    ekip: [],
  };
}
