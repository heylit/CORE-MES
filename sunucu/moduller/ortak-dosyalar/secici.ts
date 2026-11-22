import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { VerilenDuzey } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { rollerVeBayraklari } from '../kisiler/disari.ts';
import { adAnahtari, darKlasorMu, enAzMi } from './kurallar.ts';
import type { KlasorDugumu } from './kurallar.ts';
import { gorunumKur } from './servis.ts';
import type { Gorunum } from './servis.ts';
import * as s from './sorgular.ts';

// ADR 0030 seçici eki (3571, K-a): başka modülün sunucu kodu, kişinin bu modülde gördüğü dosyanın özetini kişinin kendi düzeyiyle
// alır. Yetki açılmaz: sayfa işlemi olmayan kişiye hiçbir şey dönmez (null), görünmeyen klasör ve dosya yok sayılır, arşivdeki dosya
// verilmez. Düzey her çağrıda kurallar.ts'teki aynı saf işlevle çözülür.
export const SAYFA_ISLEMI = 'sayfa.ortak-dosyalar';
const sayfaliMi = (k: Kullanici): boolean => k.islemler.includes(SAYFA_ISLEMI);

export interface SecilebilirKlasor {
  id: number;
  ustId: number | null;
  ad: string;
  // Klasörü göremeyen en az bir rol var: dosya talebe eklenince o rolden talebi görenlere de açılır.
  dar: boolean;
}

export interface SecilebilirDosya {
  dosyaId: number;
  klasorId: number;
  ad: string;
  surumSirasi: number;
  boyut: number;
  dar: boolean;
}

export interface SecilenOrtakDosya {
  dosyaId: number;
  surumSirasi: number;
  ad: string;
  ozet: string;
  klasorYolu: string[];
}

async function darlikCozucu(db: Db, g: Gorunum): Promise<(id: number) => boolean> {
  const roller = (await rollerVeBayraklari(db)).filter((r) => !r.yonetici).map((r) => ({ id: r.id, yonetici: false }));
  const yetkiler = new Map<number, Map<number, VerilenDuzey>>();
  for (const y of await s.yetkileriOku(db)) {
    const m = yetkiler.get(y.klasorId) ?? new Map<number, VerilenDuzey>();
    m.set(y.rolId, y.duzey);
    yetkiler.set(y.klasorId, m);
  }
  return (id) => darKlasorMu(id, g.klasorler as ReadonlyMap<number, KlasorDugumu>, yetkiler, roller);
}

export async function kisininSecebildigiKlasorler(db: Db, k: Kullanici): Promise<SecilebilirKlasor[] | null> {
  if (!sayfaliMi(k)) return null;
  const g = await gorunumKur(db, k);
  const dar = await darlikCozucu(db, g);
  return [...g.klasorler.values()].filter((x) => g.gorunur(x.id)).map((x) => ({ id: x.id, ustId: x.ustId, ad: x.ad, dar: dar(x.id) }));
}

// Görünmeyen klasör boş liste değil null: varlığı sızdırılmaz (çağıran 404 verir).
export async function kisininKlasorDosyalari(db: Db, k: Kullanici, klasorId: number, ara: string | null): Promise<SecilebilirDosya[] | null> {
  if (!sayfaliMi(k)) return null;
  const g = await gorunumKur(db, k);
  if (!g.gorunur(klasorId) || !enAzMi(g.duzey(klasorId), 'gorur')) return null;
  const dar = (await darlikCozucu(db, g))(klasorId);
  const anahtar = ara === null || ara.trim() === '' ? null : adAnahtari(ara);
  return (await s.klasorDosyalari(db, klasorId, anahtar)).map((d) => ({
    dosyaId: d.id, klasorId: d.klasorId, ad: d.ad, surumSirasi: d.surumSirasi, boyut: d.boyut, dar,
  }));
}

// Seçilen sürümün özeti; kişi görmüyorsa, dosya arşivdeyse ya da sürüm yoksa null (çağıran 404 verir).
export async function kisininGorebildigiDosya(db: Db, k: Kullanici, dosyaId: number, surumSirasi: number): Promise<SecilenOrtakDosya | null> {
  if (!sayfaliMi(k)) return null;
  const d = await s.dosyaIdle(db, dosyaId);
  if (d === null || d.arsiv) return null;
  const g = await gorunumKur(db, k);
  if (!g.gorunur(d.klasorId) || !enAzMi(g.duzey(d.klasorId), 'gorur')) return null;
  const v = await s.surumOku(db, d.id, surumSirasi);
  if (v === null) return null;
  const yol: string[] = [];
  const gorulen = new Set<number>();
  for (let x = g.klasorler.get(d.klasorId); x !== undefined && !gorulen.has(x.id); x = x.ustId === null ? undefined : g.klasorler.get(x.ustId)) {
    gorulen.add(x.id);
    yol.unshift(x.ad);
  }
  return { dosyaId: d.id, surumSirasi, ad: d.ad, ozet: v.ozet, klasorYolu: yol };
}
