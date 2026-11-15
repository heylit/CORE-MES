import { kayitNoktasi } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { cakisma, gecersiz } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { adimliEmirAyrintisi, isEmirleriniYenile, rotaBekleyenEmirler } from '../../uretim-emirleri/disari.ts';
import { emreKopyalanabilirMi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import { isEmirlerineSabitle, isEmriGirdileri, revizyonuAl } from './ortak.ts';
import { revizyonGetir } from './okuma.ts';

// 3272: siparişten açılan emrin rotası, emrin türüne düşen rota (3247 a: türe bağlı rota, yoksa Standart) ve yürürlükteki revizyonudur.
export async function siparisAcilisiRotasi(db: Db, malzemeNo: number, emirTuru: EmirTuru): Promise<{ ad: string; harf: string | null; revizyonId: number | null } | null> {
  const t = await s.turunRotasi(db, malzemeNo, emirTuru);
  if (t === null) return null;
  const harf = t.revizyonId === null ? null : revizyonuAl(await s.revizyonOku(db, t.revizyonId)).harf;
  return { ad: t.ad, harf, revizyonId: t.revizyonId };
}

export const ROTA_BEKLEMIYOR = 'Bu emir rota beklemiyor; rotası "Emirlere uygula" ile yenilenir.';
export const BEKLEYEN_ROTA_YOK = 'Bu emrin türüne düşen rotanın yürürlükte revizyonu yok; rota yürürlüğe girince uygulanır.';

// UE-SA-04 (3272-2 a): rota bekleyen emre türünün yürürlükteki rotası uygulanır; iş emirleri açılır, şartname ve talimat sabitlenir. Emir
// yalnız taslakken ve sürüm denetimiyle değişir (isEmirleriniYenile emri kilitler; Risk K3).
export async function bekleyenEmreUygula(db: Db, kullanici: Kullanici, emirId: number): Promise<{ degisenler: string[]; kaynakRevizyon: { id: number; harf: string } }> {
  const e = await adimliEmirAyrintisi(db, emirId);
  if (e.urun.id === null) throw cakisma(ROTA_BEKLEMIYOR);
  const bekleyen = (await rotaBekleyenEmirler(db, [e.urun.id])).find((x) => x.id === emirId);
  if (bekleyen === undefined) throw cakisma(ROTA_BEKLEMIYOR);
  const t = await s.turunRotasi(db, bekleyen.malzemeNo, bekleyen.emirTuru);
  if (t?.revizyonId == null) throw gecersiz(BEKLEYEN_ROTA_YOK);
  const r = revizyonuAl(await s.revizyonOku(db, t.revizyonId));
  const rota = await revizyonGetir(db, r.id);
  const ret = emreKopyalanabilirMi({ durum: r.durum, adimSayisi: rota?.adimlar.length ?? 0 });
  if (ret || !rota) throw gecersiz(ret ?? 'Rota bulunamadı.');
  const { degisenler } = await isEmirleriniYenile(db, kullanici, emirId, { kaynakRotaRevizyonId: r.id, isEmirleri: await isEmriGirdileri(db, r.malzemeId, rota), surum: bekleyen.surum });
  const sonra = await adimliEmirAyrintisi(db, emirId);
  await isEmirlerineSabitle(db, kullanici.id, r.id, sonra.isEmirleri.filter((i) => i.tur === 'rota' && i.durum === 'bekliyor'));
  return { degisenler, kaynakRevizyon: { id: r.id, harf: r.harf } };
}

// Revizyon yürürlüğe girince ürünün rota bekleyen emirlerine kendiliğinden uygulanır. Yürürlüğe alanda emre rota kopyalama yetkisi
// yoksa ya da emre uygulanamazsa (sürüm değişti, girdi eksik) emir beklemeyi sürdürür; yürürlüğe alma durmaz, emir ayrıntısındaki
// "Rotayı uygula" yetkiliye kalır.
export async function bekleyenEmirlereUygula(db: Db, kullanici: Kullanici, malzemeId: number): Promise<void> {
  if (!islemVarMi(kullanici, 'rota.emre-kopyala') && !islemVarMi(kullanici, 'uretim-emirleri.emir-ac')) return;
  for (const b of await rotaBekleyenEmirler(db, [malzemeId])) {
    const t = await s.turunRotasi(db, b.malzemeNo, b.emirTuru);
    if (t?.revizyonId != null) await kayitNoktasi(db, () => bekleyenEmreUygula(db, kullanici, b.id));
  }
}
