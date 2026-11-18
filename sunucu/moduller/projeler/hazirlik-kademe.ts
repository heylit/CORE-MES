import type { Db } from '#cekirdek/db.ts';
import type { KademeGecmisiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { bildirimKapat, kayitKademeGecmisi, type KademeKaydi } from '../bildirim/disari.ts';
import { kisilerinIslemleri, rollerdekiKisiler } from '../kisiler/disari.ts';
import * as sorgular from './sorgular.ts';
import type { TakipGorevi } from './sorgular.ts';

// 3396 a, 3405 a: yapılmayan hazırlık görevi kademe kademe sertleşir. Motor bildirim modülündedir (ortak kademeli uyarı); bu dosya
// açık hazırlık görevlerini kaynak olarak verir. Görev biter, kontrole düşer ya da iptal edilirse listeden çıkar: motor kademe
// bildirimlerini kapatır. Kademe türleri ve kaynak kimliği (`<görev>:k<kademe>`) 3396'nınkidir: kişi tercihleri ve açık bildirimler sürer.

const KADEME_TURLERI = ['projeler.hazirlik-hatirlatma', 'projeler.hazirlik-gecikti', 'projeler.hazirlik-yoneticiye', 'projeler.hazirlik-devret'] as const;
const GOREV_YOLU = '/proje-gorevlerim' as const;
const tarihMetni = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;

async function kisiVeRol(db: Db, kisiler: readonly (number | null)[], roller: readonly (number | null)[]): Promise<number[]> {
  const rolIdleri = roller.filter((x): x is number => x !== null);
  return [...new Set([...kisiler.filter((x): x is number => x !== null), ...await rollerdekiKisiler(db, rolIdleri)])];
}

// 3396 Risk K-A: emir durumu üretim emirlerindedir (bu modülün üstü); bağı kablolama.ts kurar. Çözücü kapalı (biten, iptal edilen
// ya da artık olmayan) emirlerin kimliklerini verir. Bağlı değilse emir kapanışı görevi kapatmaz.
export type KapaliEmirCozucusu = (db: Db, emirIdleri: readonly number[]) => Promise<ReadonlySet<number>>;
let kapaliEmirler: KapaliEmirCozucusu | null = null;
export const kapaliEmirCozucusuKaydet = (c: KapaliEmirCozucusu | null): void => { kapaliEmirler = c; };

// Emri kapanan görev iptal olur ve kademe bildirimleri kapanır: biten ya da iptal edilen emrin hazırlığı için kimse darlanmaz.
// Kontroldeki görev de kapanır: takip listesinde olmasa da kontrol eden onu beklemesin.
export async function kapananEmirlerinGorevleri(db: Db): Promise<number> {
  if (kapaliEmirler === null) return 0;
  const emirli = await sorgular.emreBagliAcikHazirliklar(db);
  if (emirli.length === 0) return 0;
  const kapali = await kapaliEmirler(db, [...new Set(emirli.map((g) => g.hazirlik_emri_id))]);
  let kapanan = 0;
  for (const g of emirli) {
    if (!kapali.has(g.hazirlik_emri_id)) continue;
    if ((await sorgular.hazirlikGoreviniKapat(db, g.id)) === null) continue;
    await bildirimKapat(db, { tur: 'projeler.gorev-kontrol-bekliyor', kaynakKimlik: String(g.id) });
    await kademeBildirimleriniKapat(db, g.id);
    kapanan += 1;
  }
  return kapanan;
}

// Kayıt no e-postaya girer: görev adı serbest metindir, girmez (Risk K3); ad yalnız uygulama içi metindedir.
// Kademe alıcıları: K2-K3 yapan (kişi ya da rol), K4 kontrol eden ve ayardaki rol (motor ekler), K5 yedek kontrol eden de.
// Kayda bağlı alıcı yoksa görev dağıtanlar alır: gecikme kimsesiz kalmasın (Risk K-B).
async function kayit(db: Db, g: TakipGorevi, yedekler: readonly number[], donemli = false): Promise<KademeKaydi> {
  return {
    kayit: donemli ? `${String(g.id)}:${g.plan_bitis}` : String(g.id), no: `Görev #${String(g.id)}`, baslik: `${g.ad} · son gün ${tarihMetni(g.plan_bitis)}`, yol: GOREV_YOLU, sonGun: g.plan_bitis,
    yapanlar: g.sorumlu_kisi_id !== null ? [g.sorumlu_kisi_id] : await kisiVeRol(db, [], [g.yapan_rol_id]),
    yoneticiler: await kisiVeRol(db, [g.kontrol_kisi_id], [g.kontrol_rol_id]),
    devralanlar: await kisiVeRol(db, [g.yedek_kontrol_kisi_id], [g.yedek_kontrol_rol_id]),
    yedekler,
  };
}

export async function hazirlikKademeKayitlari(db: Db): Promise<KademeKaydi[]> {
  const gorevler = await sorgular.takipGorevleri(db);
  if (gorevler.length === 0) return [];
  const dagitanlar = [...(await kisilerinIslemleri(db))].filter(([, i]) => i.includes('projeler.hazirlik-dagit')).map(([k]) => k);
  const l: KademeKaydi[] = [];
  for (const g of gorevler) l.push(await kayit(db, g, dagitanlar));
  return l;
}

// 3405: hazırlık dışındaki proje görevi. Kayıt son günü taşır: son gün uzatılınca yeni dönem başlar, eski kademe bildirimleri kapanır.
// Kayda bağlı alıcı yoksa görev yazanlar alır.
export async function projeGoreviKademeKayitlari(db: Db): Promise<KademeKaydi[]> {
  const gorevler = await sorgular.takipProjeGorevleri(db);
  if (gorevler.length === 0) return [];
  const yazanlar = [...(await kisilerinIslemleri(db))].filter(([, i]) => i.includes('projeler.gorev-yaz')).map(([k]) => k);
  const l: KademeKaydi[] = [];
  for (const g of gorevler) l.push(await kayit(db, g, yazanlar, true));
  return l;
}

// Görev bitince, kontrole düşünce ya da iptal edilince açık kademe bildirimleri hemen kapanır (motor bir sonraki turda takibi siler).
export async function kademeBildirimleriniKapat(db: Db, gorevId: number): Promise<void> {
  for (const [i, tur] of KADEME_TURLERI.entries()) await bildirimKapat(db, { tur, kaynakKimlik: `${String(gorevId)}:k${String(i + 2)}` });
}

export async function kademeGecmisi(db: Db, gorevId: number): Promise<KademeGecmisiCevabi> {
  return { kademeler: await kayitKademeGecmisi(db, 'projeler.hazirlik', String(gorevId)) };
}
