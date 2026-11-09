import type { KmKategoriDugumu, KmKategoriOnayi, KmKategoriTuru } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
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
