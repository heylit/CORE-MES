import type {
  AtamaTuru, IstasyonGuncellemesi, IsMerkeziGuncellemesi, MakineGuncellemesi, SurumluIsMerkezi, SurumluIstasyon, SurumluMakine,
} from '#paylasilan/sozlesme/istasyonlar.ts';

// Güncelleme tam kayıttır (gönderilmeyen alan boşalır) ve okunan sürümü taşır (IS9): değişen alan kaydın üstüne yazılır.
export const merkezGovdesi = (m: SurumluIsMerkezi, degisen: Partial<IsMerkeziGuncellemesi>): IsMerkeziGuncellemesi => ({
  kod: m.kod, ad: m.ad, aciklama: m.aciklama, aktif: m.aktif, surum: m.surum, ...degisen,
});

export const istasyonGovdesi = (s: SurumluIstasyon, degisen: Partial<IstasyonGuncellemesi>): IstasyonGuncellemesi => ({
  kod: s.kod, ad: s.ad, isMerkeziId: s.isMerkeziId, tip: s.tip, aktif: s.aktif, sorumluKisiId: s.sorumluKisiId,
  kapasiteKaynagi: s.kapasiteKaynagi, uretimAlani: s.uretimAlani, surum: s.surum, ...degisen,
});

export const makineGovdesi = (m: SurumluMakine, degisen: Partial<MakineGuncellemesi>): MakineGuncellemesi => ({
  kod: m.kod, ad: m.ad, tur: m.tur, markaModel: m.markaModel, seriNo: m.seriNo, istasyonId: m.istasyonId,
  baglantiTuru: m.baglantiTuru, baglantiAdresi: m.baglantiAdresi, aktif: m.aktif, surum: m.surum, ...degisen,
});

// Yeni kayıt kodu: önek ve ilk boş sıra numarası ("ORN-TAL-3"). Kod sonra hücrede değiştirilir; tekil değilse sunucu 409 verir.
export function yeniKod(onek: string, kullanilan: readonly string[]): string {
  const var_ = new Set(kullanilan.map((k) => k.toUpperCase()));
  for (let n = 1; ; n += 1) {
    const kod = `${onek}-${n}`.toUpperCase().slice(0, 24);
    if (!var_.has(kod)) return kod;
  }
}

// İş merkezinin rengi: kimliğe göre altı tondan biri; aynı merkez her sekmede aynı renktedir.
export const merkezRengi = (id: number | null): string => (id === null ? 'tc-ist-renk-yok' : `tc-ist-renk-${id % 6}`);

export const saatMetni = (dakika: number): string => (dakika / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

// "60.00" yerine "%60".
export const yuzdeMetni = (yuzde: string): string => `%${Number(yuzde).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

// 561 1 b: operatör ihtiyacı çalışan bir makinenin istediği operatördür. "Bir operatör en çok N tezgâha bakar" 1/N yazar; aşağı
// yuvarlanır ki N tezgâhın toplamı 1'i geçmesin (6 × 0,17 = 1,02 olurdu). Planlama motoru aynı değeri okur.
export const EN_COK_TEZGAH = 10;
export const operatorOrani = (tezgah: number): number => Math.floor(100 / tezgah) / 100;
export const tezgahSayisi = (oran: number): number | null => {
  if (!(oran > 0 && oran < 1)) return null;
  const n = Math.round(1 / oran);
  return n >= 2 && n <= EN_COK_TEZGAH && operatorOrani(n) === oran ? n : null;
};
export const operatorMetni = (oran: number): string => {
  if (oran === 0) return 'Operatör gerekmez';
  const n = tezgahSayisi(oran);
  return n === null ? `${oran.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} operatör/makine` : `1 operatör ${n} tezgâha bakar`;
};
// Seçim: operatörsüz, 1..10 tezgâha bakan bir operatör ya da makine başına 2..3 operatör; listede olmayan kayıtlı değer olduğu gibi gösterilir.
export const operatorSecenekleri = (oran: number): { deger: string; baslik: string }[] => {
  const l = [0, ...Array.from({ length: EN_COK_TEZGAH }, (_, i) => operatorOrani(i + 1)), 2, 3];
  if (!l.includes(oran)) l.push(oran);
  return l.sort((a, b) => a - b).map((x) => ({ deger: String(x), baslik: x === 1 ? '1 operatör 1 tezgâha bakar' : operatorMetni(x) }));
};

export interface KisiAtamasi {
  tur: AtamaTuru;
  hedefId: number;
  kisiId: number;
  kisiAd: string;
  yuzde: string;
  baslayacak: boolean;
}

export interface KisiOzeti {
  id: number;
  ad: string;
  aktif: boolean;
  atamalar: KisiAtamasi[];
}

// Kişiler seçenek listesinden (yazan) ve atama satırlarından (herkes) birleşir: okuyucu da atanmış kişileri adıyla görür.
// Pasif ve hiçbir yere atanmamış kişi listelenmez.
export function kisileriBirlestir(
  secenekler: readonly { id: number; ad: string; aktif: boolean }[] | null | undefined, atamalar: readonly KisiAtamasi[],
): KisiOzeti[] {
  const kisiler = new Map<number, KisiOzeti>();
  for (const k of secenekler ?? []) kisiler.set(k.id, { id: k.id, ad: k.ad, aktif: k.aktif, atamalar: [] });
  for (const a of atamalar) {
    const k = kisiler.get(a.kisiId) ?? { id: a.kisiId, ad: a.kisiAd, aktif: true, atamalar: [] };
    k.atamalar.push(a);
    kisiler.set(a.kisiId, k);
  }
  return [...kisiler.values()].filter((k) => k.aktif || k.atamalar.length > 0).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

// Kişinin iş merkezi, bugün geçerli ilk atamasının hedefinden çıkar; ataması yoksa null ("İş merkezi atanmamış").
export function kisininMerkezi(
  k: KisiOzeti, istasyonMerkezi: (istasyonId: number | null) => number | null,
  makineIstasyonu: (makineId: number) => number | null, ekipIstasyonu: (ekipId: number) => number | null,
): number | null {
  for (const a of k.atamalar.filter((x) => !x.baslayacak)) {
    const istasyonId = a.tur === 'istasyon' ? a.hedefId : a.tur === 'makine' ? makineIstasyonu(a.hedefId) : ekipIstasyonu(a.hedefId);
    const merkez = istasyonMerkezi(istasyonId);
    if (merkez !== null) return merkez;
  }
  return null;
}

// Çoklu ekle kodları (kart #1296): ilk koddaki son sayı artırılır, basamak sayısı korunur ("CNC-01", 3 -> CNC-01, CNC-02, CNC-03).
// Sayı yoksa sona "-1" eklenir. Kod sınırı (24) aşılırsa kod kesilmez, null döner: ekran uyarır.
export function kodDizisi(ilk: string, adet: number): string[] | null {
  const temiz = ilk.trim().toUpperCase();
  if (temiz === '' || !Number.isInteger(adet) || adet < 1) return null;
  const eslesme = /^(.*?)(\d+)$/.exec(temiz);
  const [onek, sayi, basamak] = eslesme ? [eslesme[1] ?? '', Number(eslesme[2]), (eslesme[2] ?? '').length] : [`${temiz}-`, 1, 1];
  const kodlar = Array.from({ length: adet }, (_, i) => `${onek}${String(sayi + i).padStart(basamak, '0')}`);
  return kodlar.some((k) => k.length > 24) ? null : kodlar;
}

// Seçicinin istasyon listesi: iş merkezine göre gruplu, yalnız aktif (pasif hedef sunulmaz, IS25).
export function istasyonSecenekleri(
  merkezler: readonly SurumluIsMerkezi[], istasyonlar: readonly SurumluIstasyon[],
): { deger: string; baslik: string; grup: string }[] {
  const merkez = new Map(merkezler.map((m) => [m.id, m]));
  return istasyonlar.filter((i) => i.aktif && merkez.get(i.isMerkeziId)?.aktif !== false)
    .map((i) => {
      const m = merkez.get(i.isMerkeziId);
      return { deger: String(i.id), baslik: `${i.kod} ${i.ad}`, grup: m ? `${m.kod} ${m.ad}` : 'İş merkezi bilinmiyor' };
    })
    .sort((a, b) => a.grup.localeCompare(b.grup, 'tr') || a.baslik.localeCompare(b.baslik, 'tr'));
}
