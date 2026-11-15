import type { KmKategoriDugumu, KmKategoriDurumu, KmKategoriOnayi, KmKategoriTuru } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { KM_KRITIKLIKLER } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import type { KmTedarikciDurumu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { TEDARIKCI_ASKIDA, tedarikciOnayDurumlari } from '../kurallar.ts';

export const KATEGORI_ILETILERI = {
  firma: 'Kategori kararı yalnız Müşteri-Tedarikçi\'deki aktif tedarikçi firmaya verilir.',
  kategoriYok: 'Kategori Malzemeler kategori ağacında yok.',
  kategoriPasif: 'Pasif kategoriye yeni karar verilmez; mevcut kararı değiştirebilirsiniz.',
  kararVar: 'Bu kategoride karar zaten var; sayfayı yenileyip kararı değiştirin.',
  kararYok: 'Kategori kararı bulunamadı.',
} as const;

// KMK-1: yeni karar yalnız ağaçta var olan ve aktif kategoriye verilir; var olan karar (kategori sonradan pasifleşse ya da ağaçtan
// kalksa da) değiştirilebilir, yoksa yanlış kalan karar düzeltilemezdi.
export function kategoriReddi(agac: readonly KmKategoriDugumu[], tur: KmKategoriTuru, kod: string, yeni: boolean): string | null {
  if (!yeni) return null;
  const d = agac.find((x) => x.tur === tur && x.kod === kod);
  if (d === undefined) return KATEGORI_ILETILERI.kategoriYok;
  return d.aktif ? null : KATEGORI_ILETILERI.kategoriPasif;
}

type TedarikciKaydi = { firmaId: number | null; kod: string | null; ad: string; onay: string | null; degisti: string };
type FirmaAdi = { id: number; kod: string | null; ad: string };

// KMK-2 (2466-2 a): firmanın firma geneli durumu Askıda ise askının tarihi. Firma bağı ve en kısıtlayıcı durum 236 a kuralıyla
// (kurallar.ts tedarikciOnayDurumlari) bulunur; tarih firmayı askıya bağlayan kayıtların en son değiştiği andır.
export function askidakiFirmalar(kayitlar: readonly TedarikciKaydi[], firmalar: readonly FirmaAdi[]): Map<number, string> {
  const durumlar = tedarikciOnayDurumlari(kayitlar, firmalar);
  const sonuc = new Map<number, string>();
  for (const k of kayitlar) {
    if (k.onay !== TEDARIKCI_ASKIDA) continue;
    for (const id of tedarikciOnayDurumlari([k], firmalar).keys()) {
      if (durumlar.get(id) !== TEDARIKCI_ASKIDA) continue;
      const o = sonuc.get(id);
      if (o === undefined || Date.parse(k.degisti) > Date.parse(o)) sonuc.set(id, k.degisti);
    }
  }
  return sonuc;
}

// KMK-3 (2466-2 a): satın almanın okuduğu karar. Askıdaki firmanın her kararı onaysız, kaynağı 'firma_askida', tarihi askının
// tarihidir; askı yoksa karar olduğu gibi. Kararı olmayan kategori listede yoktur (okuyan "Kalite kararı yok" yazar).
export function gecerliKararlar(kararlar: readonly KmKategoriOnayi[], askiTarihi: string | null): KmKategoriOnayi[] {
  if (askiTarihi === null) return [...kararlar];
  return kararlar.map((k) => ({ ...k, durum: 'onaysiz', kaynak: 'firma_askida', tarih: askiTarihi }));
}

type ListeKaydi = {
  firmaId: number | null; kod: string | null; ad: string; onay: string | null; kritik: string | null; serts: readonly string[]; sertBitis: string | null; sonDenetim: string | null;
};
export interface ListeFirmasi {
  durum: KmTedarikciDurumu | null; adIleEslendi: boolean; kritiklik: (typeof KM_KRITIKLIKLER)[number] | null;
  sertifikalar: string[]; sertifikaBitisi: string | null; sonDenetim: string | null;
}

// KMK-4 (3279 a): firmaya bağlanan kayıtların birleşimi. Bağ ve durum 236 a kuralıyla (en kısıtlayıcı); kimlikle bağlı kaydı olmayan ama
// ad ya da kodla eşlenen firma `adIleEslendi` (Risk K3). Kritiklik en yükseği, sertifikalar birleşimi, sertifika bitişi en yakını, son
// denetim en sonu. Kaydı olmayan firma haritada yoktur.
export function listeFirmalari(kayitlar: readonly ListeKaydi[], firmalar: readonly FirmaAdi[]): Map<number, ListeFirmasi> {
  const durumlar = tedarikciOnayDurumlari(kayitlar, firmalar);
  const sonuc = new Map<number, ListeFirmasi & { kimlikle: boolean; serts: Set<string> }>();
  for (const k of kayitlar) {
    const bagli = k.firmaId !== null ? firmalar.filter((f) => f.id === k.firmaId) : [...tedarikciOnayDurumlari([{ ...k, onay: TEDARIKCI_ASKIDA }], firmalar).keys()].map((id) => ({ id }));
    for (const f of bagli) {
      const o = sonuc.get(f.id) ?? { durum: durumlar.get(f.id) ?? null, adIleEslendi: false, kritiklik: null, sertifikalar: [], sertifikaBitisi: null, sonDenetim: null, kimlikle: false, serts: new Set<string>() };
      if (k.firmaId !== null) o.kimlikle = true;
      const kr = KM_KRITIKLIKLER.find((x) => x === k.kritik);
      if (kr !== undefined && (o.kritiklik === null || KM_KRITIKLIKLER.indexOf(kr) < KM_KRITIKLIKLER.indexOf(o.kritiklik))) o.kritiklik = kr;
      for (const s of k.serts) o.serts.add(s);
      if (k.sertBitis !== null && (o.sertifikaBitisi === null || k.sertBitis < o.sertifikaBitisi)) o.sertifikaBitisi = k.sertBitis;
      if (k.sonDenetim !== null && (o.sonDenetim === null || k.sonDenetim > o.sonDenetim)) o.sonDenetim = k.sonDenetim;
      sonuc.set(f.id, o);
    }
  }
  return new Map([...sonuc].map(([id, { kimlikle, serts, ...o }]) => [id, { ...o, adIleEslendi: !kimlikle, sertifikalar: [...serts].sort((a, b) => a.localeCompare(b, 'tr')) }]));
}

export const ONAY_ILETILERI = {
  firma: 'Onay yalnız Müşteri-Tedarikçi\'deki aktif tedarikçi firmaya verilir.',
  musteri: 'Müşteri onayında müşteri, Müşteri-Tedarikçi\'deki aktif müşteri firması olmalıdır.',
  kendisi: 'Firma kendi kendisinin müşterisi olamaz.',
  belge: 'Belge Kalite Merkezi belgelerinde bulunamadı.',
  onayYok: 'Onay bulunamadı.',
  degismez: 'Onayın firması ve türü değişmez; yeni onay ekleyin.',
} as const;

// KMK-5 (3279-2 a): kapsam kategorileri tekilleşir ve sıralanır; bütün kategorilerde liste boştur. Yeni kapsam kategorisi ağaçta var ve
// aktif olmalı; değiştirmede önceden kapsamda olan (sonradan pasifleşen) kategori kalabilir (KMK-1 ile aynı).
export function kapsamiDuzenle(
  agac: readonly KmKategoriDugumu[], kapsamTumu: boolean, kapsam: readonly { kategoriTuru: KmKategoriTuru; kategoriKodu: string }[], onceki: readonly string[],
): { kapsam: { kategoriTuru: KmKategoriTuru; kategoriKodu: string }[]; red: string | null } {
  if (kapsamTumu) return { kapsam: [], red: null };
  const tekil = new Map(kapsam.map((k) => [`${k.kategoriTuru}|${k.kategoriKodu}`, k]));
  for (const [a, k] of tekil) {
    if (onceki.includes(a)) continue;
    const red = kategoriReddi(agac, k.kategoriTuru, k.kategoriKodu, true);
    if (red !== null) return { kapsam: [], red };
  }
  return { kapsam: [...tekil.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, k]) => k), red: null };
}

// KMK-6 (3279-2 a): okurken geçerli durum. Bitişi bugünden önce olan onay onaysızdır; bitiş boşsa süresiz. `bugun` YYYY-AA-GG.
export const onayGecerliligi = (durum: KmKategoriDurumu, bitis: string | null, bugun: string): { durum: KmKategoriDurumu; suresiGecti: boolean } =>
  bitis !== null && bitis < bugun ? { durum: 'onaysiz', suresiGecti: true } : { durum, suresiGecti: false };
