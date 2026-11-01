import type { IkMotoru } from '../motor.ts';
import type { Aday, Pozisyon, Personel } from '../tipler.ts';
import { sayi } from './kurallar.ts';
import {
  ayarSayisi, ayHesabi, bordroHesapla, donemde, girdiler, guncelBrut, kalanIzin, primKidemAylik, tazminat, ucretTarihte, yanHakAylik,
} from './motor-yuzu.ts';

// Maliyet planı (app.js costPlan*): senaryo, kişi başına 12 aylık maliyet ve bugünkü kıdem, ihbar, izin yükümlülüğü. Hesap motorladır,
// kayda dokunmaz; senaryo yalnız "Senaryoyu kaydet" ile ayara yazılır.

export interface PlanEki { pozisyon: string; departmanId: string; brut: number; ay: number; adet: number }
export interface PlanSenaryosu { yil: number; zam1: number; zam2: number; acik: boolean; ekler: PlanEki[] }
export type PlanTuru = 'mevcut' | 'acik' | 'plan';
export interface PlanAyi { maliyet: number; toplam: number; net: number; brut: number }
export interface PlanSatiri { e: Personel; tur: PlanTuru; dept: string; aylar: (PlanAyi | null)[]; yil: number; brutYil: number }

const iki = (n: number) => String(n).padStart(2, '0');
const yerel = (t: string | undefined): Date | null => {
  if (!t || !/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const [y, m, d] = t.slice(0, 10).split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export function senaryoKur(kayitli: unknown, bugun: Date): PlanSenaryosu {
  const a = (kayitli && typeof kayitli === 'object' ? kayitli : {}) as Partial<PlanSenaryosu>;
  return {
    yil: a.yil || (bugun.getMonth() >= 8 ? bugun.getFullYear() + 1 : bugun.getFullYear()),
    zam1: a.zam1 ?? 25, zam2: a.zam2 ?? 10, acik: a.acik ?? true, ekler: structuredClone(a.ekler ?? []),
  };
}

// Departmanın aktif çalışanlarının ortalama brütü; kimse yoksa asgari ücret.
function departmanOrtalamasi(m: IkMotoru, dept: string | undefined): number {
  const ucretler = m.activeEmps().filter((p) => p.departmanId === dept).map((p) => guncelBrut(m, p)).filter(Boolean);
  return ucretler.length ? Math.round(ucretler.reduce((s, x) => s + x, 0) / ucretler.length) : ayarSayisi(m, 'asgariBrut');
}

export function plandakiKisiler(m: IkMotoru, s: PlanSenaryosu, kisiler: readonly Personel[], pozisyonlar: readonly Pozisyon[], adaylar: readonly Aday[], bugun: Date): { e: Personel; tur: PlanTuru; dept: string }[] {
  const y = s.yil;
  const r: { e: Personel; tur: PlanTuru; dept: string }[] = kisiler
    .filter((p) => !p.cikisTarihi || (yerel(p.cikisTarihi) as Date) >= new Date(y, 0, 1))
    .filter((p) => !yerel(p.iseGiris) || (yerel(p.iseGiris) as Date) <= new Date(y, 11, 31))
    .map((p) => ({ e: p, tur: 'mevcut', dept: p.departmanId ?? '' }));
  const ilkAy = y > bugun.getFullYear() ? 1 : Math.min(12, bugun.getMonth() + 2);
  if (s.acik) {
    for (const j of pozisyonlar.filter((x) => x.durum === 'Açık' || x.durum === 'Onay bekliyor')) {
      const kalan = Math.max(0, (sayi(j.adet) || 1) - adaylar.filter((c) => c.jobId === j.id && c.asama === 'İşe alındı').length);
      const min = sayi(j.ucretMin); const max = sayi(j.ucretMax);
      const brut = min && max ? (min + max) / 2 : min || max || departmanOrtalamasi(m, j.departmanId);
      for (let i = 0; i < kalan; i++) {
        r.push({ e: { id: `_j${j.id}_${i}`, kind: 'emp', ad: j.baslik ?? '', soyad: '(açık pozisyon)', iseGiris: `${y}-${iki(ilkAy)}-01`, brutMaas: brut, departmanId: j.departmanId ?? '', pozisyon: j.baslik ?? '' }, tur: 'acik', dept: j.departmanId ?? '' });
      }
    }
  }
  s.ekler.forEach((x, i) => {
    for (let k = 0; k < Math.max(1, sayi(x.adet) || 1); k++) {
      r.push({
        e: { id: `_h${i}_${k}`, kind: 'emp', ad: x.pozisyon || 'Yeni kadro', soyad: '(plan)', iseGiris: `${y}-${iki(Math.min(12, Math.max(1, sayi(x.ay) || 1)))}-01`, brutMaas: sayi(x.brut), departmanId: x.departmanId || '', pozisyon: x.pozisyon || '' },
        tur: 'plan', dept: x.departmanId || '',
      });
    }
  });
  return r;
}

// Ocak zammı yıl başından önce girmiş mevcut çalışana, Temmuz zammı Temmuz'dan önce girmiş herkese uygulanır; asgari ücretin altına inmez.
export function planHesapla(m: IkMotoru, s: PlanSenaryosu, kisiler: readonly { e: Personel; tur: PlanTuru; dept: string }[]): PlanSatiri[] {
  const y = s.yil; const z1 = 1 + sayi(s.zam1) / 100; const z2 = 1 + sayi(s.zam2) / 100;
  return kisiler.map((l) => {
    const aylar: (PlanAyi | null)[] = [];
    let kum = 0; let aKum = 0;
    const giris = yerel(l.e.iseGiris);
    for (let a = 1; a <= 12; a++) {
      const r = donemde(m, `${y}-${iki(a)}-01`, () => {
        const g = girdiler(m, l.e, y, a);
        if (!g) return null;
        let k = 1;
        if (l.tur === 'mevcut' && (!giris || giris < new Date(y, 0, 1))) k *= z1;
        if (a >= 7 && (!giris || giris < new Date(y, 6, 1))) k *= z2;
        const sonuc = ayHesabi(m, { ...g, brut: Math.max(Math.round(g.brut * k), ayarSayisi(m, 'asgariBrut')), ek: sayi(g.ek) * k }, kum, a, aKum);
        kum += sonuc.matrah; aKum += sonuc.aMat;
        return sonuc;
      });
      aylar.push(r ? { maliyet: r.maliyet, toplam: r.toplam, net: r.net, brut: r.brut } : null);
    }
    return { ...l, aylar, yil: aylar.reduce((t, x) => t + (x ? x.maliyet : 0), 0), brutYil: aylar.reduce((t, x) => t + (x ? x.toplam : 0), 0) };
  });
}

// Bu yılın (plan yılı gelecekteyse) gerçekleşen ya da tahmin edilen toplam maliyeti: karşılaştırma için.
export function yilMaliyeti(m: IkMotoru, kisiler: readonly Personel[], yil: number): number {
  let t = 0;
  for (const p of kisiler) for (let a = 1; a <= 12; a++) { const r = bordroHesapla(m, p, `${yil}-${iki(a)}`); if (r) t += r.maliyet; }
  return t;
}

export interface Yukumluluk { e: Personel; kidem: number; ihbar: number; izin: number; gun: number }

// Bugün işveren feshinde (kod 04) ödenecek brüt tutarlar.
export function yukumlulukler(m: IkMotoru, bugun: string, cikisKodlari: readonly string[]): Yukumluluk[] {
  const kod = cikisKodlari.find((k) => k.startsWith('04')) ?? cikisKodlari[3] ?? '';
  const r: Yukumluluk[] = [];
  for (const p of m.activeEmps()) {
    if (!guncelBrut(m, p)) continue;
    const izinGun = Math.max(0, kalanIzin(m, p, bugun));
    const t = tazminat(m, {
      giris: p.iseGiris ?? '', cikis: bugun, brut: ucretTarihte(m, p, bugun), yanHak: Math.round(sayi(p.yanHakTutar) + yanHakAylik(m, p) + primKidemAylik(m, p)), kod, izinGun, cum: '',
    });
    if (t) r.push({ e: p, kidem: t.yearOk ? t.kBrut : 0, ihbar: t.nBrut, izin: t.izBrut, gun: izinGun });
  }
  return r;
}

export const PLAN_CSV_BASLIKLARI = (aylar: readonly string[]): string[] => ['Ad soyad', 'Durum', 'Departman', ...aylar.map((a) => `${a} maliyet`), 'Yıllık maliyet', 'Yıllık toplam brüt'];
export const planTuruAdi = (t: PlanTuru): string => (t === 'mevcut' ? 'Mevcut' : t === 'acik' ? 'Açık pozisyon' : 'Planlanan');
