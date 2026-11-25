import { logoBirimKodu, logoTarihi } from './kurallar.ts';
import { ENGEL_ILETILERI, sevkOnKontrol } from './satis-irsaliye-kurallari.ts';
import type { SevkBelgesi } from './satis-irsaliye-kurallari.ts';

// Satış irsaliyesi köprü gövdesi (kart 3684). Kimse çağırmaz: gönderim hattı, ayar ve giden kutusu yok; açılışı gerçek Logo dökümü (kart 3683) ve
// TCKN rolü kararı bekler (kullanıcı 25.11: "eksikler kapanana kadar kapalı kalsın"). Etiketler satın alma irsaliyesinden (kart 3665) ve satış
// belgesinden alınmış TAHMİNDİR, hiçbiri ölçülmedi; döküm gelince yalnız bu harita ve KONSINYE_OLCULDU değişir.
// Bilerek yazılmayanlar: e-irsaliye ve taşıma etiketleri (EDESPATCH, plaka, şoför; ölçülmemiş etiket yazılmaz, ADR 0017 m.5), TIME, satır SOURCEINDEX
// (rehberde siparişte etiket değil, ölçüldü), lot (SL_DETAILS), fiyat ve iskonto (siparişten gelmesi VARSAYIM), DBOP UPD.
export const SATIS_IRSALIYE_ALANLARI = Object.freeze({
  kok: 'SALES_DISPATCHES', tur: 'TYPE', no: 'NUMBER', tarih: 'DATE', cari: 'ARP_CODE', ambar: 'SOURCE_WH', maliyetGrubu: 'SOURCE_COST_GRP', notlar1: 'NOTES1',
  satirlar: 'TRANSACTIONS', satirTuru: 'TYPE', kod: 'MASTER_CODE', miktar: 'QUANTITY', birim: 'UNIT_CODE', carpan1: 'UNIT_CONV1', carpan2: 'UNIT_CONV2',
  siparisSatiri: 'ORDER_REFERENCE',
});
// Belge 7.1 ve 7.8: toptan satış TRCODE 8. Konsinye çıkış 9 CORE'un kendi ölçümünü de bekliyor (`KONSINYE_TURLERI_DOGRULANDI = false`).
export const TOPTAN_SATIS_TRCODE = 8;
export const KONSINYE_CIKIS_TRCODE = 9;
export const KONSINYE_OLCULDU = false;

export function satisIrsaliyeGovdesi(b: SevkBelgesi): { govde: Record<string, unknown> } | { hata: string } {
  if (b.tur === 'konsinye' && !KONSINYE_OLCULDU) return { hata: "Konsinye çıkış türü Logo'da henüz ölçülmedi; gönderilmez." };
  const k = sevkOnKontrol(b);
  const engel = k.engeller[0];
  if (engel !== undefined) return { hata: ENGEL_ILETILERI[engel] };
  const tarih = logoTarihi(b.tarih);
  if (tarih === null) return { hata: ENGEL_ILETILERI.tarih };
  const a = SATIS_IRSALIYE_ALANLARI;
  const ambar = k.gidecek[0]?.ambarNo ?? null;
  const satirlar = k.gidecek.map((s) => ({
    [a.satirTuru]: 0,
    [a.kod]: (s.stokKodu ?? '').trim(),
    [a.miktar]: Number(s.miktar),
    [a.birim]: logoBirimKodu(s.birim ?? ''),
    [a.carpan1]: 1, [a.carpan2]: 1,
    ...(s.siparisSatiriLogoRef === null ? {} : { [a.siparisSatiri]: s.siparisSatiriLogoRef }),
  }));
  return {
    govde: {
      [a.tur]: b.tur === 'toptan' ? TOPTAN_SATIS_TRCODE : KONSINYE_CIKIS_TRCODE, [a.no]: b.no.trim(), [a.tarih]: tarih, [a.cari]: (b.cariKodu ?? '').trim(),
      [a.ambar]: ambar, [a.maliyetGrubu]: ambar, [a.notlar1]: b.no.trim(), [a.satirlar]: satirlar,
    },
  };
}
