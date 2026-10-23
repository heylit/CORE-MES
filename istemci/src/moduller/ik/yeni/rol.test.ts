import { describe, expect, it } from 'vitest';
import { ayKaydir } from './ortak/AySecici.tsx';
import { adSoyad, ayAdi, para, tarih, YOK } from './bicim.ts';
import { ekipKimlikleri, gorunumAcik } from './rol.ts';
import { depoKur } from './veri.ts';
import { ornekVeri } from './test-ortak.tsx';
import { ikYetkisiKur } from './yetki.ts';

const d = depoKur(ornekVeri());

describe('İK yeni ekran: ekip ve görünürlük', () => {
  it('ekip yönetici bağından (alt kademeler dahil) ve departman yöneticiliğinden çıkar; ayrılan kişi ekipte değildir (IK-24)', () => {
    expect([...ekipKimlikleri(d.tur('emp'), d.tur('dept'), 'emp_a')].sort()).toEqual(['emp_b']);
    expect([...ekipKimlikleri(d.tur('emp'), d.tur('dept'), null)]).toEqual([]);
  });

  it('214 a: ekip maddeleri yalnız izin onayıyla; İK maddeleri ik.oku ile; kendi maddeleri herkese', () => {
    const calisan = { oku: false, izinOnayVar: false };
    expect(gorunumAcik('benim', calisan)).toBe(true);
    expect(gorunumAcik('onay', calisan)).toBe(false);
    expect(gorunumAcik('ekiptakvim', { oku: false, izinOnayVar: true })).toBe(true);
    expect(gorunumAcik('bordro', calisan)).toBe(false);
    expect(gorunumAcik('bordro', { oku: true, izinOnayVar: false })).toBe(true);
  });
});

describe('İK yeni ekran: yetki', () => {
  const hepsi = { var: () => true };
  it('izinli kişide yazmalar açık', () => {
    const y = ikYetkisiKur(hepsi, { saltOkunur: false, onizleme: null });
    expect(y.personelYaz && y.izinOnay && y.ayarYaz && y.herhangiYazma).toBe(true);
  });
  it('önizleme ve salt okunur oturum hiçbir yazmayı açmaz, okuma kalır (210.6)', () => {
    for (const kosul of [{ saltOkunur: false, onizleme: { rol: 'calisan' as const, personel: 'emp_b' } }, { saltOkunur: true, onizleme: null }]) {
      const y = ikYetkisiKur(hepsi, kosul);
      expect(y.herhangiYazma).toBe(false);
      expect(y.izinTalep).toBe(false);
      expect(y.oku).toBe(true);
    }
  });
  it('işlemi olmayan kişide kapalı', () => {
    const y = ikYetkisiKur({ var: (i) => i === 'ik.izin-talep' }, { saltOkunur: false, onizleme: null });
    expect(y.izinTalep).toBe(true);
    expect(y.izinOnay || y.oku).toBe(false);
  });
});

describe('İK yeni ekran: biçim', () => {
  it('veri yoksa sıfır yazılmaz', () => {
    expect(para(undefined)).toBe(YOK);
    expect(tarih('')).toBe(YOK);
    expect(adSoyad(null)).toBe(YOK);
    expect(adSoyad({})).toBe('İsimsiz');
  });
  it('tarih ve ay yerel gündür', () => {
    expect(tarih('2026-01-05')).toBe('05.01.2026');
    expect(ayAdi('2026-07')).toBe('Temmuz 2026');
    expect(ayKaydir('2026-01', -1)).toBe('2025-12');
    expect(ayKaydir('2026-12', 1)).toBe('2027-01');
  });
});
