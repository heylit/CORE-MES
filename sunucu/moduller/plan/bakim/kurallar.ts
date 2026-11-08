// 2319 (S10): Arkon periyodik bakımının plan girdisindeki duruş aralıkları. Saf: planlar Arkon'dan (kablolama.ts çözücüsü), takvim
// Vardiya'dan servis.ts'te okunur. Aralık tesis duvar saatiyle ('GGGG-AA-GG SS:DD') motora gider (motor/girdi.js otoBakimUygula).
// Varsayımlar (2319, koordinatör kabulü 08.11): bakım vade gününde makinenin ilk çalışma aralığının başında başlar; vade günü çalışma yoksa
// sonraki çalışma aralığında; vadesi geçmişse bugün sıradaki çalışma aralığında; süre Arkon'daki dakika, yoksa VARSAYILAN_SURE_DK; ufuk boyunca
// her `herGun` günde tekrarlar. Son yapılışı yoksa vade bugündür.
import { tesisGunu, tesisSaati, tesisGunBasi } from '#paylasilan/tesis-zamani.ts';

export const BAKIM_UFUK_GUN = 60;
export const VARSAYILAN_SURE_DK = 60;

// Arkon'un periyodik bakım planı (arkon/kurallar.ts PeriyodikBakimPlani ile aynı biçim; plan Arkon'u ithal etmez).
export interface BakimPlani { kimlik: string; makineKod: string; baslik: string; herGun: number; sureDk: number | null; sonYapilma: Date | null }
// anahtar: planın kimliği ve yerleştiği gün; m: motorun tezgâh kimliği (makine kimliği metin).
export interface BakimAraligi { anahtar: string; m: string; bas: string; bit: string; baslik: string }
export interface CalismaAraligi { baslangic: string; bitis: string }

const GUN_MS = 86_400_000;
const gunEkle = (tarih: string, gun: number): string => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);

// Planın ufuktaki günleri: vadesi geçmişse önce bugün, sonra bugünden sonraki ilk vade ve her herGun gün.
export function bakimGunleri(p: Pick<BakimPlani, 'herGun' | 'sonYapilma'>, bugun: string, ufukGun = BAKIM_UFUK_GUN): string[] {
  if (!Number.isSafeInteger(p.herGun) || p.herGun < 1) return [];
  const son = gunEkle(bugun, ufukGun);
  let d = p.sonYapilma === null ? bugun : gunEkle(tesisGunu(p.sonYapilma), p.herGun);
  const gunler: string[] = [];
  if (d < bugun) {
    gunler.push(bugun);
    while (d <= bugun) d = gunEkle(d, p.herGun);
  }
  for (; d <= son; d = gunEkle(d, p.herGun)) gunler.push(d);
  return gunler;
}

// Günün bakım başlangıcı (ms): o gün ya da sonrasında başlayan, şimdiden sonra biten ilk çalışma aralığı. Takvimi tanımsız (null, sürekli
// çalışır sayılan) makinede gün başı; bugünse şimdi. Bulunmazsa null.
export function bakimBaslangici(takvim: readonly CalismaAraligi[] | null, gun: string, simdi: number): number | null {
  if (takvim === null) return Math.max(tesisGunBasi(gun), simdi);
  for (const a of takvim) {
    const bas = Date.parse(a.baslangic), bit = Date.parse(a.bitis);
    if (tesisGunu(bas) >= gun && bit > simdi) return Math.max(bas, simdi);
  }
  return null;
}

export function bakimAraliklari(
  planlar: readonly BakimPlani[], makineIdleri: ReadonlyMap<string, number>, takvimler: ReadonlyMap<number, readonly CalismaAraligi[] | null>,
  simdi: number, ufukGun = BAKIM_UFUK_GUN,
): BakimAraligi[] {
  const bugun = tesisGunu(simdi);
  const sonuc: BakimAraligi[] = [];
  for (const p of planlar) {
    const id = makineIdleri.get(p.makineKod);
    if (id === undefined) continue;
    const sure = (p.sureDk ?? VARSAYILAN_SURE_DK) * 60_000;
    for (const gun of bakimGunleri(p, bugun, ufukGun)) {
      const bas = bakimBaslangici(takvimler.get(id) ?? null, gun, simdi);
      if (bas === null) continue;
      sonuc.push({ anahtar: `${p.kimlik}|${gun}`, m: String(id), bas: tesisSaati(bas), bit: tesisSaati(bas + sure), baslik: p.baslik });
    }
  }
  return sonuc.sort((a, b) => (a.bas < b.bas ? -1 : a.bas > b.bas ? 1 : a.anahtar < b.anahtar ? -1 : 1));
}
