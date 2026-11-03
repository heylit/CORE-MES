import type { Db } from '#cekirdek/db.ts';
import { cakisma, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AtolyeKomutuCevabi, IsTasiGovdesi, OlayEkleGovdesi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import { isTasi, olayEkle, type KomutKisisi, type KomutSonucu } from './atolye-komutlari-kurallar.ts';
import { PLANLAMA_ANAHTARI, planlamaCalismasi, planlamaYaz, planlamaYazmaDenetimi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';

// Planlama atölyesinin elle düzenleme komutları (1982 a). Akış: yetki (plan.yaz, uçta ve burada), okunan sürüm kayıtlı sürümle aynı mı,
// tek değişiklik saf kuralla uygulanır, yazma kaydın kendi yazma yolundan geçer (sürüm, boyut, bitiş akışı, geçmiş). Kişi ve zaman sunucudan.
const SAYFA = 'Planlama atölyesi';

async function uygula(db: Db, kullanici: Kullanici, calismaSurumu: number, fn: (deger: unknown, k: KomutKisisi) => KomutSonucu, simdi: number): Promise<AtolyeKomutuCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const surum = await sorgular.planlamaSurumKilitle(db, PLANLAMA_ANAHTARI);
  if (surum === null || surum !== calismaSurumu) throw eskiSurum();
  // Değişiklik sayfanın gördüğü birleşmiş çalışmaya uygulanır (288 a): kayıttaki veri Reçete ve Rota'dan eski kalmış olabilir, sayfa da
  // kendi yazmasında birleşmiş hâli yazar.
  const c = await planlamaCalismasi(db, kullanici, simdi);
  if (c.calisma === null || c.surum !== surum) throw cakisma('Planlama çalışması okunamadı; sayfayı yenileyin.');
  const r = fn(c.calisma, { kim: kullanici.ad, sayfa: SAYFA, t: simdi });
  if ('hata' in r) throw r.hata.tur === 'dogrulama' ? dogrulama(r.hata.ileti, r.hata.alan) : cakisma(r.hata.ileti);
  if (!r.degisti) return { calismaSurumu: surum, oncekiSurum: surum };
  const y = await planlamaYaz(db, kullanici, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: r.deger, beklenenSurum: surum });
  return { calismaSurumu: y.kayit.surum, oncekiSurum: surum };
}

export function isiTasi(db: Db, kullanici: Kullanici, g: IsTasiGovdesi, simdi: number = Date.now()): Promise<AtolyeKomutuCevabi> {
  const { calismaSurumu, ...tasi } = g;
  return uygula(db, kullanici, calismaSurumu, (d, k) => isTasi(d, tasi, k), simdi);
}

export function olayiEkle(db: Db, kullanici: Kullanici, g: OlayEkleGovdesi, simdi: number = Date.now()): Promise<AtolyeKomutuCevabi> {
  return uygula(db, kullanici, g.calismaSurumu, (d, k) => olayEkle(d, g.olay, k), simdi);
}
