import type { Db } from '#cekirdek/db.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { atamaBildir, projeKilitle, YONETIM_KISITLARI } from './servis.ts';
import * as sorgular from './sorgular.ts';

// 3448: projeli toplantının aksiyonu bu projenin görevi olur. Yetki ve aksiyon kuralı çağıran toplantılar ucundadır;
// proje açık olmalıdır (görev ekleme kuralı). Aynı aksiyonun ikinci açık görevini tekil dizin reddeder.
export interface ToplantiGoreviVerisi { projeId: number; aksiyonId: number; ad: string; sorumluKisiId: number; planBaslangic: string; planBitis: string }
const KISITLAR = { ...YONETIM_KISITLARI, projeler_gorev_toplanti_aksiyon_tekil: 'Bu aksiyonun görevi zaten açık.' };

export async function toplantiAksiyonundanGorevAc(db: Db, kisiId: number, g: ToplantiGoreviVerisi): Promise<{ id: number; durum: string }> {
  await projeKilitle(db, g.projeId, true);
  const id = await kisitKorumali(KISITLAR, () => sorgular.toplantiGorevEkle(db, g.projeId, g, kisiId));
  await atamaBildir(db, g.projeId, [{ sorumluKisiId: g.sorumluKisiId, yapanRolId: null }], kisiId);
  return { id, durum: 'yapilacak' };
}

// Aksiyon kimliğinden açık (iptal edilmemiş) görevi; görevi olmayan aksiyon haritada yoktur.
export async function toplantiAksiyonGorevleri(db: Db, aksiyonIdler: readonly number[]): Promise<Map<number, { id: number; durum: string }>> {
  const tekil = [...new Set(aksiyonIdler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.toplantiAksiyonGorevleri(db, tekil)).map((r) => [r.aksiyonId, { id: r.id, durum: r.durum }]));
}
