import { istasyonSec } from '../../../../../../arkon/web/src/data/istasyon-sec.ts';
import type { Machine, Plant, Station, User } from './tipler.ts';

// Tesis yapısı: İş merkezi › İstasyon › Makine (kv 'plant'; ortak-ayarlar.ts stationList, machineOf, mcOf, wcOf, myStation).
// İstasyon tabletin durduğu iş yeridir; iş paketleri istasyona gönderilir (pkg.machine = istasyon kodu).

export const BOS_TESIS: Plant = { wcs: [], sts: [], mcs: [] };
export const aktif = (x: { active?: boolean } | null | undefined): boolean => !!x && x.active !== false;

export interface IstasyonSatiri {
  id: string; l: string; t: Station['t']; wc: string; wcName: string; name: string; active: boolean; mcs: Machine[];
}

export const isMerkeziBul = (tesis: Plant, id: string | null | undefined) => tesis.wcs.find((w) => w.id === id) ?? null;
export const makineBul = (tesis: Plant, id: string | null | undefined): Machine | null => tesis.mcs.find((m) => m.id === id) ?? null;

export function istasyonListesi(tesis: Plant, hepsi = false): IstasyonSatiri[] {
  return tesis.sts.filter((s) => hepsi || aktif(s)).map((s) => {
    const w = isMerkeziBul(tesis, s.wc);
    return {
      id: s.id, l: `${s.id} · ${s.name || ''}${w ? ` · ${w.name}` : ''}`, t: s.t || 'cnc', wc: s.wc || '', wcName: w ? w.name : '', name: s.name || '',
      active: aktif(s), mcs: tesis.mcs.filter((m) => m.st === s.id && aktif(m)),
    };
  });
}

// Silinmiş ya da bilinmeyen istasyon da satır verir: eski kayıtlar kodla görünür.
export function istasyonBul(tesis: Plant, id: string): IstasyonSatiri {
  return istasyonListesi(tesis, true).find((m) => m.id === id) ?? { id, l: id || '—', t: 'cnc', wc: '', wcName: '', name: '', active: false, mcs: [] };
}

// Bu tabletin istasyonu: cihazda seçilen, yoksa kişinin TMI'de atandığı, yoksa ilk yetkili, o da yoksa ilk istasyon.
export function tabletIstasyonu(tesis: Plant, kayitli: string | null, kisi: Pick<User, 'st' | 'sts'> | null): string {
  return istasyonSec(kayitli, kisi?.st, istasyonListesi(tesis).map((x) => x.id), kisi?.sts);
}
