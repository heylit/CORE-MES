import { kayitNoktasi } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { cakisma, gecersiz } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { adimliEmirAyrintisi, isEmirleriniYenile, rotaBekleyenEmirler } from '../../uretim-emirleri/disari.ts';
import { emreKopyalanabilirMi, turRotasiIhlali } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import { isEmirlerineSabitle, isEmriGirdileri, revizyonuAl } from './ortak.ts';
import { emreKopyala, revizyonGetir } from './okuma.ts';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';

// 3272: siparişten açılan emrin rotası, emrin türüne düşen rota (3247 a: türe bağlı rota, yoksa Standart) ve yürürlükteki revizyonudur.
// 3296-3 a: sipariş partisinde elle seçilen rota (aynı ürünün, yürürlükte revizyonu olan) önce gelir; başka ürünün ya da yürürlükte
// revizyonu olmayan rotası seçildiyse türün rotasına düşülür ve `elle` false döner (onay penceresi bunu gösterir).
export async function siparisAcilisiRotasi(
  db: Db, malzemeNo: number, emirTuru: EmirTuru, secilenRotaId: number | null = null,
): Promise<{ rotaId: number; ad: string; harf: string | null; revizyonId: number | null; elle: boolean } | null> {
  if (secilenRotaId !== null) {
    const r = await s.rotaOku(db, secilenRotaId);
    const y = r !== null && r.malzemeId === malzemeNo ? await s.rotaninYururlugu(db, r.id) : null;
    if (r !== null && y !== null) return { rotaId: r.id, ad: r.ad, harf: y.harf, revizyonId: y.id, elle: true };
  }
  const t = await s.turunRotasi(db, malzemeNo, emirTuru);
  if (t === null) return null;
  const harf = t.revizyonId === null ? null : revizyonuAl(await s.revizyonOku(db, t.revizyonId)).harf;
  return { rotaId: t.rotaId, ad: t.ad, harf, revizyonId: t.revizyonId, elle: false };
}

// 3296-2 a: emrin kaynak revizyonunun rotası (bölmede partinin türünün rotası bununla karşılaştırılır); revizyon yoksa null.
export async function revizyonunRotasi(db: Db, revizyonId: number): Promise<number | null> {
  return (await s.revizyonOku(db, revizyonId))?.rotaId ?? null;
}

// 3296 (Risk N2): tek emir ucu. Rota elle seçilmediyse revizyon emrin türünün rotasından olmalı; eski ya da yanlış istemci FAI emrini
// Standart revizyondan açamaz. Sipariş açılışı ve toplu emir türün rotasını kendisi bulduğu için bu denetimden geçmez.
export async function tekEmreKopyala(db: Db, kullanici: Kullanici, revizyonId: number, g: Parameters<typeof emreKopyala>[3] & { rotaElle?: boolean | undefined }) {
  const { rotaElle, ...govde } = g;
  const r = revizyonuAl(await s.revizyonOku(db, revizyonId));
  const tur = govde.emirTuru ?? 'seri';
  const t = await s.turunRotasi(db, r.malzemeId, tur);
  const ihlal = turRotasiIhlali({ revizyonRotaId: r.rotaId, turRotasi: t, elle: rotaElle === true, turAdi: EMIR_TURU_ADLARI[tur] });
  if (ihlal !== null) throw cakisma(ihlal);
  return emreKopyala(db, kullanici, revizyonId, govde);
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
