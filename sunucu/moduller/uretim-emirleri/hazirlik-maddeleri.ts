import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { HAZIRLIK_MADDELERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  HazirlikMaddeleriCevabi, HazirlikMaddeTanimi, HazirlikMaddesiDegistirGovdesi, HazirlikMaddesiEkleGovdesi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { DURDURAN_KAPANMAZ, MADDE_DEGISTI, ozelMaddeKodu } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3396 a: hazırlık maddesi listesi veridedir. Çözücüler (hazirlik.ts) yine kodla kayıtlıdır; tablo yalnız ad, sıra ve açık/kapalı verir.
// İş emri düzeyi kod bilgisidir (hangi kimlikle sorulduğu); özel madde iş emri başınadır (görev iş emri başına doğar).
export const IS_EMRI_DUZEYI: ReadonlySet<string> = new Set(['cnc', 'malzeme', 'takim-omru', 'takim-hazirla', 'makine', 'yayin', 'talimat', 'ek-madde', 'aparat', 'olcu-aleti']);
export const MADDE_YOK = 'Hazırlık maddesi bulunamadı.';

// Çözücünün kayıtlı olduğu modül (kablolama); kullanıcıya "durumu veren" olarak gösterilir.
const SAHIP: Readonly<Record<string, string>> = {
  cnc: 'CNC Kurulum', cizim: 'Kalite Merkezi', yayin: 'Üretim Hazırlık', rota: 'Reçete ve Rota', malzeme: 'Stok Merkezi', 'takim-omru': 'CNC Kurulum',
  'takim-hazirla': 'Planlama', makine: 'İstasyonlar', talimat: 'Terminal', 'ek-madde': 'Üretim Hazırlık', aparat: 'Stok Merkezi', 'olcu-aleti': 'Ölçü Aletleri',
};
const tanim = (x: s.HazirlikMaddeSatiri): HazirlikMaddeTanimi => ({
  ...x, sahip: x.sistem ? SAHIP[x.kod] ?? 'Sistem' : 'Hazırlık görevi', isEmriDuzeyi: !x.sistem || IS_EMRI_DUZEYI.has(x.kod),
});

export const hazirlikAyarYazarMi = (k: Kullanici | null): boolean => k !== null && islemVarMi(k, 'uretim-emirleri.hazirlik-ayar');

export async function hazirlikMaddeTanimlari(db: Db): Promise<HazirlikMaddeTanimi[]> {
  return (await s.hazirlikMaddeSatirlari(db)).map(tanim);
}

export async function hazirlikMaddeleri(db: Db, kullanici: Kullanici | null): Promise<HazirlikMaddeleriCevabi> {
  return { maddeler: await hazirlikMaddeTanimlari(db), yazabilir: hazirlikAyarYazarMi(kullanici) };
}

// Risk K2 (fail-closed): kapalı sayılan yalnız tabloda açıkça kapatılmış uyaran sistem maddesidir. Satır yoksa madde açıktır;
// durduran madde hiçbir durumda kapalı dönmez.
export async function kapaliSistemMaddeleri(db: Db): Promise<ReadonlySet<string>> {
  const durduran = new Set<string>(['cnc', 'cizim', 'yayin']);
  return new Set((await s.hazirlikMaddeSatirlari(db))
    .filter((x) => x.sistem && !x.acik && !durduran.has(x.kod) && (HAZIRLIK_MADDELERI as readonly string[]).includes(x.kod))
    .map((x) => x.kod));
}

export async function hazirlikMaddesiDegistir(db: Db, kullanici: Kullanici, kod: string, g: HazirlikMaddesiDegistirGovdesi): Promise<HazirlikMaddeleriCevabi> {
  const mevcut = (await s.hazirlikMaddeSatirlari(db)).find((x) => x.kod === kod);
  if (mevcut === undefined) throw bulunamadi(MADDE_YOK);
  if (mevcut.durduran && !g.acik) throw dogrulama(DURDURAN_KAPANMAZ, 'acik');
  if ((await s.hazirlikMaddesiYaz(db, kod, g, kullanici.id)) === null) throw cakisma(MADDE_DEGISTI);
  return hazirlikMaddeleri(db, kullanici);
}

export async function ozelHazirlikMaddesiEkle(db: Db, kullanici: Kullanici, g: HazirlikMaddesiEkleGovdesi): Promise<HazirlikMaddeleriCevabi> {
  await s.ozelMaddeEkle(db, ozelMaddeKodu(await s.ozelMaddeNo(db)), g, kullanici.id);
  return hazirlikMaddeleri(db, kullanici);
}
