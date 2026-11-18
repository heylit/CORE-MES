import type { Db } from '#cekirdek/db.ts';
import { eskiSurum } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { BildirimTuru } from '#paylasilan/sozlesme/bildirim.ts';
import type { GecikenHazirliklarimCevabi, KademeAyariCevabi, KademeAyariGovdesi, KademeGecmisiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { bildirimGonder, bildirimKapat } from '../bildirim/disari.ts';
import { resmiTatilGunleri } from '../ik/disari.ts';
import { kisiAdlari, kisilerinIslemleri, kisininRolleri, rollerdekiKisiler } from '../kisiler/disari.ts';
import { bildirilecekKademe, gerekenKademeler } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { TakipGorevi } from './sorgular.ts';

// 3396 a: yapılmayan hazırlık görevi kademe kademe sertleşir. Zamanlayıcı her çalışmada gereken kademeleri deftere yazar; defter
// (görev, kademe) tekil olduğu için kesinti ya da iki sunucu aynı kademeyi iki kez göndermez (Risk K6). Görev biter ya da kontrole
// düşünce kademe bildirimleri kapanır.

const KADEME_TURU: Readonly<Record<number, BildirimTuru>> = {
  2: 'projeler.hazirlik-hatirlatma', 3: 'projeler.hazirlik-gecikti', 4: 'projeler.hazirlik-yoneticiye', 5: 'projeler.hazirlik-devret',
};
const KADEME_BASLIGI: Readonly<Record<number, string>> = {
  2: 'Hazırlık görevinin son günü yaklaşıyor', 3: 'Hazırlık görevin gecikti', 4: 'Geciken hazırlık görevi yöneticiye bildirildi',
  5: 'Geciken hazırlık görevini devret',
};
const tarihMetni = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
const kaynak = (gorevId: number, kademe: number) => `${String(gorevId)}:k${String(kademe)}`;
const GUN_MS = 86_400_000;
const gunEkle = (t: string, g: number) => new Date(Date.parse(`${t}T00:00:00Z`) + g * GUN_MS).toISOString().slice(0, 10);

async function kisiVeRol(db: Db, kisiler: readonly (number | null)[], roller: readonly (number | null)[]): Promise<number[]> {
  const rolIdleri = roller.filter((x): x is number => x !== null);
  return [...new Set([...kisiler.filter((x): x is number => x !== null), ...await rollerdekiKisiler(db, rolIdleri)])];
}

async function alicilar(db: Db, g: TakipGorevi, kademe: number, yoneticiRolId: number | null): Promise<number[]> {
  const yapan = g.sorumlu_kisi_id !== null ? [g.sorumlu_kisi_id] : await kisiVeRol(db, [], [g.yapan_rol_id]);
  if (kademe <= 3) return yapan;
  const kontrol = await kisiVeRol(db, [g.kontrol_kisi_id], [g.kontrol_rol_id, yoneticiRolId]);
  if (kademe === 4) return kontrol;
  return [...new Set([...kontrol, ...await kisiVeRol(db, [g.yedek_kontrol_kisi_id], [g.yedek_kontrol_rol_id])])];
}

// 3396 Risk K-A: emir durumu üretim emirlerindedir (bu modülün üstü); bağı kablolama.ts kurar. Çözücü kapalı (biten, iptal edilen
// ya da artık olmayan) emirlerin kimliklerini verir. Bağlı değilse emir kapanışı kademeyi durdurmaz.
export type KapaliEmirCozucusu = (db: Db, emirIdleri: readonly number[]) => Promise<ReadonlySet<number>>;
let kapaliEmirler: KapaliEmirCozucusu | null = null;
export const kapaliEmirCozucusuKaydet = (c: KapaliEmirCozucusu | null): void => { kapaliEmirler = c; };

// Emri kapanan görev iptal olur ve kademe bildirimleri kapanır: biten ya da iptal edilen emrin hazırlığı için kimse darlanmaz.
// Kontroldeki görev de kapanır: takip listesinde olmasa da kontrol eden onu beklemesin.
async function kapananEmirlerinGorevleri(db: Db): Promise<Set<number>> {
  if (kapaliEmirler === null) return new Set();
  const emirli = await sorgular.emreBagliAcikHazirliklar(db);
  if (emirli.length === 0) return new Set();
  const kapali = await kapaliEmirler(db, [...new Set(emirli.map((g) => g.hazirlik_emri_id))]);
  const kapanan = new Set<number>();
  for (const g of emirli) {
    if (!kapali.has(g.hazirlik_emri_id)) continue;
    if ((await sorgular.hazirlikGoreviniKapat(db, g.id)) === null) continue;
    await bildirimKapat(db, { tur: 'projeler.gorev-kontrol-bekliyor', kaynakKimlik: String(g.id) });
    await kademeBildirimleriniKapat(db, g.id);
    kapanan.add(g.id);
  }
  return kapanan;
}

async function dagitanlar(db: Db): Promise<number[]> {
  return [...(await kisilerinIslemleri(db))].filter(([, i]) => i.includes('projeler.hazirlik-dagit')).map(([k]) => k);
}

export async function kademeleriIlerlet(db: Db): Promise<{ yazilan: number; bildirilen: number; kapanan: number }> {
  const kapanan = await kapananEmirlerinGorevleri(db);
  const gorevler = (await sorgular.takipGorevleri(db)).filter((g) => !kapanan.has(g.id));
  const bugun = await sorgular.bugun(db);
  let yazilan = 0;
  let bildirilen = 0;
  if (gorevler.length > 0) {
    const ayar = await sorgular.kademeAyari(db);
    const enEski = gorevler.reduce((a, g) => (g.plan_bitis < a ? g.plan_bitis : a), bugun);
    const tatiller = new Set((await resmiTatilGunleri(db, gunEkle(enEski, -1), gunEkle(bugun, 62))).map((t) => t.tarih));
    const kurallar = { hatirlatGun: ayar.hatirlat_gun, yoneticiGun: ayar.yonetici_gun, devretGun: ayar.devret_gun };
    for (const g of gorevler) {
      const gereken = gerekenKademeler({ planBitis: g.plan_bitis, yapanVar: g.sorumlu_kisi_id !== null || g.yapan_rol_id !== null }, kurallar, bugun, tatiller);
      const { yeni, bildirilecek } = bildirilecekKademe(gereken, new Set(g.kademeler));
      for (const k of yeni.sort((a, b) => a - b)) {
        const kimler = k === bildirilecek ? await alicilar(db, g, k, ayar.yonetici_rol_id) : [];
        if (!(await sorgular.kademeYaz(db, g.id, k, k === bildirilecek, kimler.length))) continue;
        yazilan += 1;
        const tur = KADEME_TURU[k];
        if (k !== bildirilecek || tur === undefined) continue;
        const olay = { tur, baslik: KADEME_BASLIGI[k] ?? tur, metin: `${g.ad} · son gün ${tarihMetni(g.plan_bitis)}`, yol: '/proje-gorevlerim' as const, kaynakKimlik: kaynak(g.id, k) };
        // Kayda bağlı alıcı yoksa (rol boş, kontrol eden yok) görev dağıtanlar alır: gecikme kimsesiz kalmasın, ama projeyi yalnız
        // okuyanlara kapatılamaz e-posta gitmesin (Risk K-B).
        const hedef = kimler.length > 0 ? kimler : await dagitanlar(db);
        if (hedef.length === 0) continue;
        await bildirimGonder(db, { ...olay, kisiler: hedef, yalnizKisiler: true });
        bildirilen += 1;
      }
    }
  }
  await gunlukOzet(db, bugun, await sorgular.tesisSaati(db));
  return { yazilan, bildirilen, kapanan: kapanan.size };
}

// Günlük özet: sabah 08:00'den sonra ilk çalışmada, devret kademesindeki açık görev varsa bir kez. Saat dışarıdan gelir (test).
export async function gunlukOzet(db: Db, bugun: string, saat: number): Promise<void> {
  if (saat < 8) return;
  const devrette = (await sorgular.takipGorevleri(db)).filter((g) => g.kademeler.includes(5));
  if (devrette.length === 0) return;
  if (!(await sorgular.ozetYaz(db, bugun, devrette.length))) return;
  await bildirimGonder(db, {
    tur: 'projeler.hazirlik-ozet', baslik: 'Geciken hazırlık görevleri', metin: `${String(devrette.length)} hazırlık görevi devret kademesinde.`,
    yol: '/projeler', kaynakKimlik: `ozet:${bugun}`,
  });
}

// Görev bitince, kontrole düşünce ya da iptal edilince açık kademe bildirimleri kapanır.
export async function kademeBildirimleriniKapat(db: Db, gorevId: number): Promise<void> {
  for (const [k, tur] of Object.entries(KADEME_TURU)) await bildirimKapat(db, { tur, kaynakKimlik: kaynak(gorevId, Number(k)) });
}

// --- Ayar, geçmiş ve şerit ---

export async function kademeAyariOku(db: Db, kullanici: Kullanici): Promise<KademeAyariCevabi> {
  const a = await sorgular.kademeAyari(db);
  const ad = a.degistiren_id === null ? null : (await kisiAdlari(db, [a.degistiren_id])).get(a.degistiren_id) ?? null;
  return {
    hatirlatGun: a.hatirlat_gun, yoneticiGun: a.yonetici_gun, devretGun: a.devret_gun, yoneticiRolId: a.yonetici_rol_id, surum: a.surum,
    degistiren: ad, degisti: a.degisti, yazabilir: kullanici.islemler.includes('uretim-emirleri.hazirlik-ayar'),
  };
}

const AYAR_KISITLARI = {
  projeler_hazirlik_kademe_ayari_sira: { ileti: 'Devret, yöneticiye bildirmeden önce olamaz.', alan: 'devretGun' },
  projeler_hazirlik_kademe_ayari_rol: { ileti: 'Rol bulunamadı.', alan: 'yoneticiRolId' },
} as const;
export async function kademeAyariYaz(db: Db, kullanici: Kullanici, g: KademeAyariGovdesi): Promise<KademeAyariCevabi> {
  const s = await kisitKorumali(AYAR_KISITLARI, () => sorgular.kademeAyariYaz(db, g, g.surum, kullanici.id));
  if (s === null) throw eskiSurum();
  return kademeAyariOku(db, kullanici);
}

export async function kademeGecmisi(db: Db, gorevId: number): Promise<KademeGecmisiCevabi> {
  return { kademeler: (await sorgular.gorevKademeleri(db, gorevId)).map((k) => ({ kademe: k.kademe, an: k.an, bildirildi: k.bildirildi, aliciSayisi: k.alici_sayisi })) };
}

export async function gecikenHazirliklarim(db: Db, kullanici: Kullanici): Promise<GecikenHazirliklarimCevabi> {
  const roller = (await kisininRolleri(db, kullanici.id)).map((r) => r.id);
  return {
    gorevler: (await sorgular.gecikenHazirliklarim(db, kullanici.id, roller)).map((g) => ({
      id: g.id, ad: g.ad, planBitis: g.plan_bitis, gecikmeGun: g.gecikme_gun, kademe: g.kademe,
    })),
  };
}
