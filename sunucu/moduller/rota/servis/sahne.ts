import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { sahneAdimiSemasi } from '#paylasilan/sozlesme/rota.ts';
import type { SahneAdimi, TalimatSahneleriCevabi, TalimatSahnesi } from '#paylasilan/sozlesme/rota.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { sahneHatasi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import { talimatSurumuAdimlari } from './talimat.ts';

// Montaj talimatının 3B sahnesi (3209 a): yayınlanmış talimat sürümüne bağlı, yalnız eklenen sahne sürümleri.

const SAHNE_KISITLARI = { rota_talimat_sahnesi_surum_tekil: { ileti: 'Sahne bu arada başka biri tarafından kaydedildi; ekranı yenile.', alan: 'okunanSahneSurum' } };
const SURUM_YOK = (opNo: number, surum: number) => `OP ${String(opNo)} talimatının ${String(surum)}. sürümü yayınlanmamış; sahne yalnız yayınlanmış sürüme yazılır.`;

// Tabloya yazılanı yeniden okurken biçim yine denetlenir: elle bozulmuş satır ekrana ve terminale geçmez.
function adimlarOku(x: unknown): SahneAdimi[] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((a) => {
    const r = sahneAdimiSemasi.safeParse(a);
    return r.success ? [r.data] : [];
  });
}

async function cevapKur(db: Db, satirlar: readonly s.SahneSatiri[]): Promise<TalimatSahnesi[]> {
  const adlar = await kisiAdlari(db, satirlar.map((x) => x.yazanKisiId));
  return satirlar.map((x) => ({
    talimatSurum: x.talimatSurum, sahneSurum: x.sahneSurum, modelRevizyonId: x.modelRevizyonId, adimlar: adimlarOku(x.adimlar),
    yazan: { id: x.yazanKisiId, ad: adlar.get(x.yazanKisiId) ?? null }, yazma: x.yazma,
  }));
}

export async function talimatSahneleri(db: Db, urunId: number, opNo: number): Promise<TalimatSahneleriCevabi> {
  return { sahneler: await cevapKur(db, await s.sonSahneler(db, urunId, opNo)) };
}

export async function talimatSahnesiKaydet(
  db: Db, kullanici: Kullanici, urunId: number,
  govde: { opNo: number; talimatSurum: number; okunanSahneSurum: number | null; modelRevizyonId: number; adimlar: readonly SahneAdimi[] },
): Promise<TalimatSahneleriCevabi> {
  const adimlar = await talimatSurumuAdimlari(db, urunId, govde.opNo, govde.talimatSurum);
  if (adimlar === null) throw bulunamadi(SURUM_YOK(govde.opNo, govde.talimatSurum));
  const hata = sahneHatasi(govde.adimlar, adimlar.length);
  if (hata !== null) throw dogrulama(hata, 'adimlar');
  const son = await s.sonSahne(db, urunId, govde.opNo, govde.talimatSurum);
  if ((son?.sahneSurum ?? null) !== govde.okunanSahneSurum) throw eskiSurum();
  await kisitKorumali(SAHNE_KISITLARI, () => s.sahneEkle(db, {
    malzemeId: urunId, opNo: govde.opNo, talimatSurum: govde.talimatSurum, sahneSurum: (son?.sahneSurum ?? 0) + 1,
    modelRevizyonId: govde.modelRevizyonId, adimlar: [...govde.adimlar].sort((a, b) => a.sira - b.sira), kisiId: kullanici.id,
  }));
  return talimatSahneleri(db, urunId, govde.opNo);
}

// Emre sabitlenen talimat sürümünün en son sahnesi (terminal okur; yetki denetlemez, çağıran denetler). Sahne yoksa null.
export async function talimatSahnesi(db: Db, malzemeId: number, opNo: number, talimatSurum: number): Promise<TalimatSahnesi | null> {
  const x = await s.sonSahne(db, malzemeId, opNo, talimatSurum);
  return x === null ? null : (await cevapKur(db, [x]))[0] ?? null;
}
