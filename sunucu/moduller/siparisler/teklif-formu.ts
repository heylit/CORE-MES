import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  TeklifFormuCevabi, TeklifFormuKurumu, TeklifFormuSablonKaydetVerisi, TeklifFormuSorgusu, TeklifFormuVerisiCevabi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { firmaOzeti } from '../musteri-tedarikci/disari.ts';
import {
  KURUM_SATIRI_YOK, SABLON_ADI_KULLANILIYOR, SABLON_YOK, SURUM_YOK, TEKLIF_YOK, firmaAdresi, formToplamlari, kurumIcerigi, sablonIcerigi, sablonKopyasi,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const KISITLAR = {
  siparisler_teklif_formu_sablonu_ad_tek: { ileti: SABLON_ADI_KULLANILIYOR, alan: 'ad' },
} as const;

export async function teklifFormu(db: Db): Promise<TeklifFormuCevabi> {
  const kurum = await sorgular.teklifFormuKurumu(db);
  if (kurum === null) throw bulunamadi(KURUM_SATIRI_YOK);
  const sablonlar = await sorgular.teklifFormuSablonlari(db);
  return {
    kurum: kurumIcerigi(kurum.icerik),
    kurumSurum: kurum.surum,
    sablonlar: sablonlar.map((s) => ({ id: s.id, ad: s.ad, dil: s.dil, varsayilan: s.varsayilan, icerik: sablonIcerigi(s.icerik), surum: s.surum })),
  };
}

export async function sablonKaydet(db: Db, k: Kullanici, id: number, g: TeklifFormuSablonKaydetVerisi): Promise<TeklifFormuCevabi> {
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    guncelle: () => sorgular.teklifFormuSablonuGuncelle(db, id, g, g.surum, k.id),
    varMi: () => sorgular.teklifFormuSablonuVarMi(db, id),
    bulunamadiIletisi: SABLON_YOK,
  }));
  return teklifFormu(db);
}

export async function sablonKopyala(db: Db, k: Kullanici, id: number, ad: string): Promise<TeklifFormuCevabi> {
  const kaynak = await sorgular.teklifFormuSablonuGetir(db, id);
  if (kaynak === null) throw bulunamadi(SABLON_YOK);
  await kisitKorumali(KISITLAR, () => sorgular.teklifFormuSablonuEkle(db, sablonKopyasi(kaynak, ad), k.id));
  return teklifFormu(db);
}

export async function varsayilanYap(db: Db, k: Kullanici, id: number, surum: number): Promise<TeklifFormuCevabi> {
  await surumluGuncelle({
    guncelle: () => sorgular.teklifFormuVarsayilanYap(db, id, surum, k.id),
    varMi: () => sorgular.teklifFormuSablonuVarMi(db, id),
    bulunamadiIletisi: SABLON_YOK,
  });
  return teklifFormu(db);
}

export async function kurumKaydet(db: Db, k: Kullanici, kurum: TeklifFormuKurumu, surum: number): Promise<TeklifFormuCevabi> {
  await surumluGuncelle({
    guncelle: () => sorgular.teklifFormuKurumGuncelle(db, kurum, surum, k.id),
    varMi: async () => (await sorgular.teklifFormuKurumu(db)) !== null,
    bulunamadiIletisi: KURUM_SATIRI_YOK,
  });
  return teklifFormu(db);
}

// Formun müşteri kutusu firma kartından okunur; kart silinmiş ya da adres girilmemişse alan boş gelir, uydurulmaz.
// Toplamlar seçilen sürümden hesaplanır; KDV oranı pencereden gelir (teklifte tutulmaz).
export async function teklifFormuVerisi(db: Db, teklifId: number, s: TeklifFormuSorgusu): Promise<TeklifFormuVerisiCevabi> {
  const teklif = await sorgular.teklifGetir(db, teklifId);
  if (teklif === null) throw bulunamadi(TEKLIF_YOK);
  const toplam = await sorgular.teklifFormuToplamlari(db, teklifId, s.surumNo, s.kdvOrani);
  if (toplam === null) throw bulunamadi(SURUM_YOK);
  const firma = await firmaOzeti(db, teklif.firma_id);
  return {
    musteri: firma === null ? { ad: null, adres: null, vergiNo: null } : { ad: firma.ad, adres: firmaAdresi(firma), vergiNo: firma.vergiNo },
    ...formToplamlari(toplam.ara_toplam, toplam.kdv_haric, toplam.kdv_tutari, s.kdvOrani),
  };
}
