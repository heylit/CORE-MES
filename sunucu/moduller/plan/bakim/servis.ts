// 2319 (S10): plan girdisinin bakım aralıkları. Periyodik bakım Arkon'dadır; plan Arkon'u ithal etmez (ADR 0006), çözücüyü kablolama.ts
// kaydeder. Çözücü yoksa null: bakım okunmadı, motor duruş satırlarına dokunmaz (girdi.js otoBakimUygula). Yetki çağıranın işidir.
import type { Db } from '#cekirdek/db.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { makineler } from '../../istasyonlar/disari.ts';
import { calismaTakvimleri } from '../../vardiya/disari.ts';
import { BAKIM_UFUK_GUN, bakimAraliklari, type BakimAraligi, type BakimPlani, type CalismaAraligi } from './kurallar.ts';
import { vardiyasiTanimsiz } from '../kurallar.ts';

export type BakimCozucusu = (db: Db) => Promise<readonly BakimPlani[]>;
let cozucu: BakimCozucusu | null = null;
export const bakimCozucusuKaydet = (c: BakimCozucusu | null): void => { cozucu = c; };

export async function bakimAraliklariOku(db: Db, simdi: number = Date.now()): Promise<BakimAraligi[] | null> {
  if (cozucu === null) return null;
  const planlar = await cozucu(db);
  if (planlar.length === 0) return [];
  const kodlar = new Set(planlar.map((p) => p.makineKod));
  const ids = new Map((await makineler(db, { pasiflerDahil: false })).filter((m) => kodlar.has(m.kod)).map((m) => [m.kod, m.id]));
  if (ids.size === 0) return [];
  const bugun = tesisGunu(simdi);
  const bitis = new Date(Date.parse(`${bugun}T00:00:00Z`) + (BAKIM_UFUK_GUN + 1) * 86_400_000).toISOString().slice(0, 10);
  const okunan = await calismaTakvimleri(db, [...ids.values()].map((id) => ({ tur: 'makine' as const, id })), { baslangic: bugun, bitis });
  const takvimler = new Map<number, readonly CalismaAraligi[] | null>();
  for (const id of ids.values()) {
    const t = okunan.get(`makine:${String(id)}`) ?? null;
    takvimler.set(id, vardiyasiTanimsiz(t) || t === null ? null : t.araliklar);
  }
  return bakimAraliklari(planlar, ids, takvimler, simdi);
}
