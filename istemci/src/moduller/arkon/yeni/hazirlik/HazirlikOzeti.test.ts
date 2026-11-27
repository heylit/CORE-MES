import { describe, expect, it } from 'vitest';
import type { HazirlikSatiri } from '../operator/HazirlikListesi.tsx';
import { MADDE_SUTUNLARI, emirHucresi, hucreOzeti } from './HazirlikOzeti.ts';

const satir = (madde: HazirlikSatiri['madde'], hal: HazirlikSatiri['hal'], uyarir: boolean, isEmriDuzeyi = true): HazirlikSatiri =>
  ({ madde, hal, uyarir, isEmriDuzeyi, muafTutulur: false, muaf: null });
const sutun = (a: string) => MADDE_SUTUNLARI.find((s) => s.anahtar === a)!;

describe('3816 hazırlık özeti', () => {
  it('her madde tek sütunda; yayın maddesi Paket sütunundadır', () => {
    const l = MADDE_SUTUNLARI.flatMap((s) => s.maddeler);
    expect(new Set(l).size).toBe(l.length);
    expect(l).not.toContain('yayin');
  });

  it('hücre sütunun maddelerinin en kötüsü: durduran eksik uyarıdan, uyarı tamamdan ağır', () => {
    const takim = sutun('takim');
    expect(hucreOzeti([satir('takim-omru', 'tamam', true), satir('takim-hazirla', 'eksik', true)], takim, true)).toMatchObject({ durum: 'uyari', madde: 'takim-hazirla' });
    expect(hucreOzeti([satir('cnc', 'eksik', false)], sutun('nc'), true).durum).toBe('durur');
    expect(hucreOzeti([satir('takim-omru', 'gerekmez', true)], takim, true).durum).toBe('gerekmez');
  });

  it('okunamayan özet "Okunmadı", okunurken ve maddesiz işte boş (Eksik ya da Tamam uydurulmaz)', () => {
    expect(hucreOzeti(null, sutun('rota'), true).durum).toBe('okunmadi');
    expect(hucreOzeti(null, sutun('rota'), false).durum).toBe('yok');
    expect(hucreOzeti([satir('cnc', 'tamam', false)], sutun('rota'), true).durum).toBe('yok');
  });

  it('emir geneli madde işaretlenir (operasyon satırında "emirle aynı")', () => {
    expect(hucreOzeti([satir('rota', 'tamam', true, false)], sutun('rota'), true).emirDuzeyi).toBe(true);
    expect(hucreOzeti([satir('cnc', 'tamam', false, true)], sutun('nc'), true).emirDuzeyi).toBe(false);
  });

  it('emir hücresi operasyonların en kötüsü ve sorunlu operasyon sayısı; ilk sorunlu operasyonun sırası', () => {
    const nc = sutun('nc');
    const o = emirHucresi([
      hucreOzeti([satir('cnc', 'tamam', false)], nc, true),
      hucreOzeti([satir('cnc', 'eksik', false)], nc, true),
      hucreOzeti([satir('cnc', 'eksik', false)], nc, true),
    ]);
    expect(o).toMatchObject({ durum: 'durur', sorunlu: 2, ilk: 1 });
    expect(emirHucresi([])).toMatchObject({ durum: 'yok', sorunlu: 0, ilk: null });
  });
});
