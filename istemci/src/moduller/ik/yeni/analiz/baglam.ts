import type { IkMotoru, IkSabitleri } from '../motor.ts';
import type { Personel } from '../tipler.ts';
import type { IkDeposu } from '../veri.ts';
import type { AnalizMotoru, AnalizVerisi, GunlukSatiri } from './kurallar.ts';

// Deponun bu parçanın okuduğu kesiti.
export function analizVerisi(d: IkDeposu): AnalizVerisi {
  const gorev = d.ayarlar['gorevler'];
  return {
    personel: d.tur('emp'), departmanlar: d.tur('dept'), izinler: d.tur('leave'), devam: d.tur('att'), egitimler: d.tur('train'),
    gorusmeler: d.tur('intv'), adaylar: d.tur('cand'), pozisyonlar: d.tur('job'), bordrolar: d.tur('pay'),
    gorevDurumu: gorev && typeof gorev === 'object' ? gorev as AnalizVerisi['gorevDurumu'] : {},
  };
}

export const gunlukSatirlari = (d: IkDeposu): readonly GunlukSatiri[] => d.gecmis;

const sayi = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Motorun bu parçada kullanılan yüzü; tipi motorla gelmeyen işlevler burada daraltılır.
export function analizMotoru(m: IkMotoru, s: IkSabitleri, bugun: Date): AnalizMotoru {
  const ayarlar = (): Record<string, unknown> => { const a = m.S(); return a && typeof a === 'object' ? a as Record<string, unknown> : {}; };
  return {
    aktifMi: (p, tarih) => Boolean(tarih === undefined ? m.isActive(p) : m.isActive(p, tarih)),
    izinBakiyesi: (p) => { const b = m.leaveBalance(p as Personel, bugun); return { kalan: b.kalan, sonrakiGun: b.nextDays }; },
    eksikBelgeler: (p) => { const e = m.missingDocs(p); return Array.isArray(e) ? e.map(String) : []; },
    guncelBrut: (p) => sayi(m.curBrut(p)),
    aydaCalisiyor: (p, yil, ay) => m.employedInMonth(p as Personel, yil, ay),
    yaka: (p) => s.collarOf(p as Personel),
    kademe: (p) => s.levelOf(p as Personel),
    yakalar: s.COLLARS,
    kademeler: s.LEVELS,
    donemBaslangiclari: () => m.periods().map((x) => x.baslangic),
    ayar: (k) => ayarlar()[k],
  };
}

// Hesaplar yerel gece yarısına göre yapılır (bugünkü ekran gibi).
export function bugunGece(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
