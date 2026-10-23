import { describe, expect, it } from 'vitest';
import { ikSabitleri, motorKur } from '../motor.ts';
import { ornekVeri } from '../test-ortak.tsx';
import type { IkAyarlar, Kayit } from '../tipler.ts';
import { analizMotoru } from './baglam.ts';
import { gorevler, panoOzeti, rapor, type AnalizVerisi } from './kurallar.ts';

// Ortak motorla (211 a) uyum: bağdaştırıcı motorun gerçek yüzünü okur; sahte motorla sınanan kurallar burada gerçek motorla koşar.
const BUGUN = new Date(2026, 9, 15);
const v = ornekVeri();
const kayitlar: Kayit[] = v.kayitlar.map((k) => ({ ...k.govde, id: k.kimlik, kind: k.tur }) as Kayit);
const tur = <T>(t: string) => kayitlar.filter((k) => k.kind === t) as unknown as T;
const veri: AnalizVerisi = {
  personel: tur('emp'), departmanlar: tur('dept'), izinler: tur('leave'), devam: tur('att'), egitimler: tur('train'), gorusmeler: tur('intv'),
  adaylar: tur('cand'), pozisyonlar: tur('job'), bordrolar: tur('pay'), gorevDurumu: {},
};

describe('Analiz bağdaştırıcısı ortak motorla', () => {
  const motor = motorKur(kayitlar, (v.ayarlar.govde ?? {}) as IkAyarlar);
  const sabit = ikSabitleri();

  it('motor ve sabitler gelir; bağdaştırıcı sayı ve liste döner', () => {
    expect(motor).not.toBeNull();
    expect(sabit).not.toBeNull();
    const m = analizMotoru(motor!, sabit!, BUGUN);
    const a = veri.personel.find((p) => p.id === 'emp_a')!;
    expect(m.aktifMi(a)).toBe(true);
    expect(m.aktifMi(veri.personel.find((p) => p.id === 'emp_c')!)).toBe(false);
    expect(Number.isFinite(m.izinBakiyesi(a).kalan)).toBe(true);
    expect(m.guncelBrut(a)).toBe(50000);
    expect(Array.isArray(m.eksikBelgeler(a))).toBe(true);
    expect(m.yakalar).toContain(m.yaka(a));
    expect(m.donemBaslangiclari().every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))).toBe(true);
  });

  it('pano, yapılacaklar ve rapor gerçek motorla hatasız kurulur', () => {
    const m = analizMotoru(motor!, sabit!, BUGUN);
    const o = panoOzeti(veri, m, BUGUN);
    expect(o.aktif).toBe(2);
    expect(o.bekleyen.map((l) => l.id)).toEqual(['leave_1']);
    expect(gorevler(veri, m, BUGUN).some((g) => g.anahtar === 'leave:leave_1')).toBe(true);
    expect(rapor(veri, m, BUGUN, String).aktif).toBe(2);
  });
});
