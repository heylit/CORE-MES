import type { Db } from '#cekirdek/db.ts';
import { cakisma, dogrulama } from '#cekirdek/hata.ts';
import { bildirimKapat } from '../bildirim/disari.ts';
import { kademeBildirimleriniKapat } from './hazirlik-kademe.ts';
import { GEREKMEZ_ONEKI, GEREKMEZ_YOK, GEREKMEZ_ZATEN, gerekmezReddi } from './kurallar.ts';
import { atamaKapat } from './servis.ts';
import * as sorgular from './sorgular.ts';

// 3642: emirde ya da matris hücresinde gerekçeli "Bu emirde gerekmez" işareti. Emir ve madde doğrulaması, yetki Üretim Emirleri'nin ucundadır;
// bu dosya yalnız defteri ve görev iptalini yazar. Başlamamış, sürmekte olan ve bekleyen görev iptal olur (silinmez: gerekçe, işaretleyen ve
// zaman görev geçmişinde ve defterde kalır); kontrolde ya da bitmiş görevi olan madde işaretlenmez. İşaret varken dağıtım aynı emir ve madde için
// görev açmaz (hazirlik-gorevleri.ts); kaldırınca bir sonraki dağıtım açar.
export interface HazirlikGerekmezi { emriId: number; madde: string; gerekce: string; kisiId: number; an: string }

export async function hazirlikGerekmezleri(db: Db, emirIdleri: readonly number[]): Promise<HazirlikGerekmezi[]> {
  return (await sorgular.hazirlikGerekmezleri(db, emirIdleri)).map((x) => ({ emriId: x.emri_id, madde: x.madde, gerekce: x.gerekce, kisiId: x.kisi_id, an: x.an }));
}

export async function hazirlikGerekmezIsaretle(db: Db, kisiId: number, v: { emriId: number; madde: string; gerekce: string }): Promise<{ iptalEdilen: number }> {
  const gerekce = v.gerekce.trim();
  await sorgular.hazirlikGerekmezKilitle(db, v.emriId, v.madde);
  if ((await sorgular.hazirlikGerekmezleri(db, [v.emriId])).some((x) => x.madde === v.madde)) throw cakisma(GEREKMEZ_ZATEN);
  const gorevler = await sorgular.emirMaddesininGorevleri(db, v.emriId, v.madde);
  const ret = gerekmezReddi(gorevler.map((g) => g.durum));
  if (ret !== null) throw dogrulama(ret);
  let iptal = 0;
  for (const g of gorevler) {
    if ((await sorgular.hazirlikGoreviniGerekmezKapat(db, g.id, kisiId)) === null) continue;
    await sorgular.gorevOlayiEkle(db, g.id, 'iptal', kisiId, `${GEREKMEZ_ONEKI}${gerekce}`);
    await bildirimKapat(db, { tur: 'projeler.gorev-kontrol-bekliyor', kaynakKimlik: String(g.id) });
    await atamaKapat(db, g.id);
    await kademeBildirimleriniKapat(db, g.id);
    iptal += 1;
  }
  await sorgular.hazirlikGerekmezYaz(db, v.emriId, v.madde, 'isaretle', kisiId, gerekce);
  return { iptalEdilen: iptal };
}

// Kaldırma iptal olan görevi geri açmaz (görev geçmişi korunur); madde yeniden gerekli olur, görev Görevleri dağıt ile yeniden açılır.
export async function hazirlikGerekmezKaldir(db: Db, kisiId: number, v: { emriId: number; madde: string }): Promise<void> {
  await sorgular.hazirlikGerekmezKilitle(db, v.emriId, v.madde);
  if (!(await sorgular.hazirlikGerekmezleri(db, [v.emriId])).some((x) => x.madde === v.madde)) throw cakisma(GEREKMEZ_YOK);
  await sorgular.hazirlikGerekmezYaz(db, v.emriId, v.madde, 'kaldir', kisiId, null);
}
