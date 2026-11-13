import type { Db } from '#cekirdek/db.ts';
import { cakisma, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  AtolyeKomutuCevabi, EkMesaiEkleGovdesi, IsTasiGovdesi, IsTasiOnizlemeSorgusu, IsTasiOnizlemesiCevabi, OlayEkleGovdesi, PlanaAlGovdesi, PlanaAlOnizlemeSorgusu,
  PlanaAlOnizlemesiCevabi,
} from '#paylasilan/sozlesme/planlama-atolye.ts';
import { ekMesaiEkle, isTasi, olayEkle, planaAl, planaAlDenetimi, tasimaDenetimi, type KomutKisisi, type KomutSonucu } from './atolye-komutlari-kurallar.ts';
import { planaAlmaHesabi } from './plana-al.ts';
import { PLANLAMA_ANAHTARI, planlamaCalismasi, planlamaYaz, planlamaYazmaDenetimi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';
import { tasimaHesabi } from './tasima.ts';

// Planlama atölyesinin elle düzenleme komutları (1982 a). Akış: yetki (plan.yaz, uçta ve burada), okunan sürüm kayıtlı sürümle aynı mı,
// tek değişiklik saf kuralla uygulanır, yazma kaydın kendi yazma yolundan geçer (sürüm, boyut, bitiş akışı, geçmiş). Kişi ve zaman sunucudan.
const SAYFA = 'Planlama atölyesi';

async function uygula(db: Db, kullanici: Kullanici, calismaSurumu: number, fn: (deger: unknown, k: KomutKisisi) => KomutSonucu & { ileti?: string | null }, simdi: number): Promise<AtolyeKomutuCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const surum = await sorgular.planlamaSurumKilitle(db, PLANLAMA_ANAHTARI);
  if (surum === null || surum !== calismaSurumu) throw eskiSurum();
  // Değişiklik sayfanın gördüğü birleşmiş çalışmaya uygulanır (288 a): kayıttaki veri Reçete ve Rota'dan eski kalmış olabilir, sayfa da
  // kendi yazmasında birleşmiş hâli yazar.
  const c = await planlamaCalismasi(db, kullanici, simdi);
  if (c.calisma === null || c.surum !== surum) throw cakisma('Planlama çalışması okunamadı; sayfayı yenileyin.');
  const r = fn(c.calisma, { kim: kullanici.ad, sayfa: SAYFA, t: simdi });
  if ('hata' in r) throw r.hata.tur === 'dogrulama' ? dogrulama(r.hata.ileti, r.hata.alan) : cakisma(r.hata.ileti);
  const ileti = r.ileti === undefined ? {} : { ileti: r.ileti };
  if (!r.degisti) return { calismaSurumu: surum, oncekiSurum: surum, ...ileti };
  const y = await planlamaYaz(db, kullanici, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: r.deger, beklenenSurum: surum });
  return { calismaSurumu: y.kayit.surum, oncekiSurum: surum, ...ileti };
}

export function isiTasi(db: Db, kullanici: Kullanici, g: IsTasiGovdesi, simdi: number = Date.now()): Promise<AtolyeKomutuCevabi> {
  const { calismaSurumu, ...tasi } = g;
  return uygula(db, kullanici, calismaSurumu, (d, k) => isTasi(d, tasi, k, tasimaHesabi), simdi);
}

// 2790: taşımanın önizlemesi; komutla aynı denetim ve hesap, yazma yok. Sayfa sürükleme sırasında çağırır; yetki komutunkiyle aynı.
export async function isTasiOnizlemesi(db: Db, kullanici: Kullanici, g: IsTasiOnizlemeSorgusu, simdi: number = Date.now()): Promise<IsTasiOnizlemesiCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const c = await planlamaCalismasi(db, kullanici, simdi);
  const d = tasimaDenetimi(c.calisma, g, simdi);
  if ('hata' in d) return { calismaSurumu: c.surum, gecerli: false, ileti: d.hata.ileti, isler: [] };
  return { calismaSurumu: c.surum, ...tasimaHesabi(d.deger, d.simdi, g) };
}

// 3151: planda yeri olmayan emrin ilk adımı verilen tezgâha ve saate kilitlenir.
export function emriPlanaAl(db: Db, kullanici: Kullanici, g: PlanaAlGovdesi, simdi: number = Date.now()): Promise<AtolyeKomutuCevabi> {
  const { calismaSurumu, ...al } = g;
  return uygula(db, kullanici, calismaSurumu, (d, k) => planaAl(d, al, k, planaAlmaHesabi), simdi);
}

// Plana almanın önizlemesi: komutla aynı denetim ve hesap, yazma yok. Sayfanın sürümü kayıttakinden eskiyse sonuç hesaplanmaz: eski plana
// göre yer göstermek yanıltır.
export async function planaAlOnizlemesi(db: Db, kullanici: Kullanici, g: PlanaAlOnizlemeSorgusu, simdi: number = Date.now()): Promise<PlanaAlOnizlemesiCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const c = await planlamaCalismasi(db, kullanici, simdi);
  const red = (ileti: string): PlanaAlOnizlemesiCevabi => ({ calismaSurumu: c.surum, gecerli: false, ileti, isler: [], bitis: null });
  if (c.surum !== g.calismaSurumu) return red('Plan bu sırada değişti; sayfayı yenileyin.');
  const { calismaSurumu: _, ...al } = g;
  const d = planaAlDenetimi(c.calisma, al, simdi);
  if ('hata' in d) return red(d.hata.ileti);
  const r = planaAlmaHesabi(d.deger, d.simdi, al);
  return { calismaSurumu: c.surum, gecerli: r.gecerli, ileti: r.ileti, isler: r.isler, bitis: r.bitis };
}

export function olayiEkle(db: Db, kullanici: Kullanici, g: OlayEkleGovdesi, simdi: number = Date.now()): Promise<AtolyeKomutuCevabi> {
  return uygula(db, kullanici, g.calismaSurumu, (d, k) => olayEkle(d, g.olay, k), simdi);
}

export function ekMesaiyiEkle(db: Db, kullanici: Kullanici, g: EkMesaiEkleGovdesi, simdi: number = Date.now()): Promise<AtolyeKomutuCevabi> {
  const { calismaSurumu, ...satir } = g;
  return uygula(db, kullanici, calismaSurumu, (d, k) => ekMesaiEkle(d, satir, k), simdi);
}
