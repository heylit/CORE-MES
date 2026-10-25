import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { olayAdi, saatYaz, type SorunEylemiKaydi } from './kurallar.ts';
import { HAZIRLANIYOR, MOTOR_NOTU, YOK_NOTU } from './ortak.tsx';

// Kararın eyleminin yapılışı (n-karar.betik eylemleri), Yapılacaklar ve karar paneli ortak: çalışmaya yazan üçü `degistir`le (plan.yaz),
// sipariş seçimi sayfada; motor isteyenler ve yeni ekranda karşılığı olmayan sayfa pasif, nedeni `not`ta. `komut` yoksa yazma yetkisi yoktur.
export interface EylemBaglami { c: PlanlamaCalismasi; komut: CalismaKomutu | null; sipSec: (j: string) => void }
export interface EylemYapisi { yap: (() => void) | null; not: string }

export function eylemYapisi(e: SorunEylemiKaydi, { c, komut, sipSec }: EylemBaglami): EylemYapisi {
  const i = Number(e.v);
  const yaz = (ne: string, fn: (t: PlanlamaCalismasi) => void, ayrinti = '') => (komut ? () => { komut.degistir(ne, fn, { ayrinti }); } : null);
  const yetkisiz = 'Plan yazma yetkiniz yok.';
  switch (e.tur) {
    case 'kisit-hepsi': return { yap: yaz('Bütün kısıtlar açıldı', (t) => { t.kapali = []; }), not: yetkisiz };
    case 'durus-kaldir': {
      const d = c.down[i];
      return { yap: d ? yaz('Duruş kaldırıldı', (t) => { t.down.splice(i, 1); }, `${String(d.m)} ${saatYaz(c.D, typeof d.from === 'number' ? d.from : null)}`) : null, not: yetkisiz };
    }
    case 'olay-kaldir': {
      const ev = c.olaylar[i];
      return { yap: ev ? yaz('Olay kaldırıldı', (t) => { t.olaylar.splice(i, 1); }, olayAdi(c, ev)) : null, not: yetkisiz };
    }
    case 'sec-is': return { yap: () => sipSec(e.v), not: '' };
    case 'git': return { yap: null, not: YOK_NOTU };
    case 'suz-gec': return { yap: null, not: HAZIRLANIYOR };
    default: return { yap: null, not: MOTOR_NOTU };
  }
}
