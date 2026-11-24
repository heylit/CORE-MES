import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import type { APARAT_ASAMALARI, APARAT_DURUMLARI, APARAT_UYUM_DURUMLARI, IADE_DURUMLARI, LISTE_DURUMLARI, TAKIM_KONUMLARI, TAKIM_SINIFLARI, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';

export type IadeDurumu = (typeof IADE_DURUMLARI)[number];
export const IADE_SIRASI = ['saglam', 'asinmis', 'kirik'] as const satisfies readonly IadeDurumu[];
export type Konum = (typeof TAKIM_KONUMLARI)[number];

export const KONUM_ADI: Record<Konum, string> = {
  raf: 'Rafta', tezgah: 'Tezgâhta', kisi: 'Kişide', bileme: 'Bilemede', ara: 'Ara alan', hurda: 'Hurda',
};
export const KONUM_SIMGESI: Record<Konum, SimgeAdi> = {
  raf: 'box', tezgah: 'cpu', kisi: 'user', bileme: 'rotate', ara: 'alert', hurda: 'trash',
};
export const SINIF_ADI: Record<(typeof TAKIM_SINIFLARI)[number], string> = {
  'kesici-uc': 'Kesici uç', freze: 'Freze', matkap: 'Matkap', rayba: 'Rayba', tutucu: 'Tutucu', 'olcu-ucu': 'Ölçü ucu', diger: 'Diğer',
};
export const IADE_ADI: Record<IadeDurumu, string> = { saglam: 'Sağlam', asinmis: 'Aşınmış', kirik: 'Kırık' };
export const IADE_ACIKLAMASI: Record<IadeDurumu, string> = {
  saglam: 'Rafa döner', asinmis: 'Ara alana gider; bile, kullan ya da hurda kararı verilir', kirik: 'Hurdaya gider; neden yazılır',
};
export const LISTE_DURUMU_ADI: Record<(typeof LISTE_DURUMLARI)[number], string> = {
  rafta: 'Rafta', ayrildi: 'Ayrıldı', tezgahta: 'Tezgâhta', eksik: 'Eksik',
};
export const LISTE_DURUMU_TONU: Record<(typeof LISTE_DURUMLARI)[number], RozetTonu> = {
  rafta: 'bilgi', ayrildi: 'uyari', tezgahta: 'tamam', eksik: 'hata',
};

export type StokDurumu = 'sifir' | 'kritik' | 'yeterli' | 'esiksiz';

// Sipariş noktası girilmemişse (kritikSeviye null) durum uydurulmaz; yalnız sıfır bilinir.
export function stokDurumu(t: Pick<TakimSatiri, 'toplam' | 'kritikSeviye'>): StokDurumu {
  if (t.toplam <= 0) return 'sifir';
  if (t.kritikSeviye === null) return 'esiksiz';
  return t.toplam <= t.kritikSeviye ? 'kritik' : 'yeterli';
}
export const STOK_DURUMU_ADI: Record<StokDurumu, string> = { sifir: 'Stok yok', kritik: 'Kritik', yeterli: 'Yeterli', esiksiz: 'Eşik yok' };
export const STOK_DURUMU_TONU: Record<StokDurumu, RozetTonu> = { sifir: 'hata', kritik: 'uyari', yeterli: 'tamam', esiksiz: 'pasif' };

export const adetMetni = (n: number | null) => (n === null ? '—' : n.toLocaleString('tr-TR'));

// Aparat (3651): çipler Takımhane'nin emir listesiyle birebir aynı adı taşır (Ayrıldı, Tezgâhta, Eksik); yalnız aparata özgü olanlar eklenir.
export type AparatDurumu = (typeof APARAT_DURUMLARI)[number];
export const APARAT_DURUMU_ADI: Record<AparatDurumu, string> = {
  'plan-bekliyor': 'Plan bekliyor', ayrildi: LISTE_DURUMU_ADI.ayrildi, yolda: 'Yolda', tezgahta: LISTE_DURUMU_ADI.tezgahta, kisi: 'Kişide', eksik: LISTE_DURUMU_ADI.eksik,
};
export const APARAT_DURUMU_TONU: Record<AparatDurumu, RozetTonu> = {
  'plan-bekliyor': 'pasif', ayrildi: LISTE_DURUMU_TONU.ayrildi, yolda: 'bilgi', tezgahta: LISTE_DURUMU_TONU.tezgahta, kisi: 'bilgi', eksik: LISTE_DURUMU_TONU.eksik,
};
export const APARAT_ASAMA_ADI: Record<(typeof APARAT_ASAMALARI)[number], string> = { ayar_isleme: 'Ayar ve işleme', isleme: 'İşleme' };
export const APARAT_UYUMU_ADI: Record<(typeof APARAT_UYUM_DURUMLARI)[number], string> = { uyumlu: 'Uyumlu', 'plan-fazla': 'Plan stoktan fazla', bakimda: 'Bakımda var' };
export const APARAT_UYUMU_TONU: Record<(typeof APARAT_UYUM_DURUMLARI)[number], RozetTonu> = { uyumlu: 'tamam', 'plan-fazla': 'uyari', bakimda: 'uyari' };

// "26.11 08:00 - 14:00"; plan yerleştirmediyse null gelir ve çizgi yazılır (sıfır ya da tarih uydurulmaz).
const parcalar = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function gunSaat(iso: string): { gun: string; saat: string } {
  const p = Object.fromEntries(parcalar.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { gun: `${p['day'] ?? ''}.${p['month'] ?? ''}`, saat: `${p['hour'] ?? ''}:${p['minute'] ?? ''}` };
}
export function pencereMetni(baslangic: string | null, bitis: string | null): string {
  if (baslangic === null || bitis === null) return '—';
  const b = gunSaat(baslangic);
  const e = gunSaat(bitis);
  return `${b.gun} ${b.saat} - ${e.gun === b.gun ? '' : `${e.gun} `}${e.saat}`;
}
