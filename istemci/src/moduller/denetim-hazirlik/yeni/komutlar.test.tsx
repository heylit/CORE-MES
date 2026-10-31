import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { PaletSorgusuBaglami, paletSorgusuKur, SayfaKomutBaglami, type SayfaKomutu } from '../../../ortak/rota/sayfa-komutlari.ts';
import { useDenetim } from './baglam.tsx';
import { DenetimKomutlari, KAYNAK, ONERI_SINIRI, paletOnerileri, type PaletOgesi } from './komutlar.tsx';
import { baglamlaAc, ornekDepo, sahteSunucu, type SahteSunucuSecenegi } from './test-ortak.tsx';
import { YardimSaglayici } from './yardim/index.tsx';

// D4 (1418): Ctrl K katkısı. Kabuğun komut kaydı ve palet metni sahte bağlamla verilir; cihaz verisi sentetiktir.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

function Gorunum() {
  const d = useDenetim();
  const { pathname } = useLocation();
  return <p>{`gorunum:${d.gorunum} adres:${pathname}`}</p>;
}

async function kur(s: SahteSunucuSecenegi = {}) {
  const kayit = new Map<string, readonly SayfaKomutu[]>();
  const palet = paletSorgusuKur();
  sahteSunucu({ depo: ornekDepo(), ...s });
  const sar = (c: ReactNode) => (
    <SayfaKomutBaglami.Provider value={(k, l) => { if (l === null) kayit.delete(k); else kayit.set(k, l); }}>
      <PaletSorgusuBaglami.Provider value={palet}>{c}</PaletSorgusuBaglami.Provider>
    </SayfaKomutBaglami.Provider>
  );
  await baglamlaAc(sar(<YardimSaglayici><DenetimKomutlari /><Gorunum /></YardimSaglayici>), 'home');
  await screen.findByText(/^gorunum:home/);
  return {
    komutlar: () => (kayit.get(KAYNAK) ?? []).map((k) => k.baslik),
    oneriler: () => kayit.get(`${KAYNAK}#oneri`) ?? [],
    yaz: (m: string) => { act(() => { palet.yaz(m); }); },
  };
}

describe('Ctrl K katkısı', () => {
  it('yönetici: kayda yazan komutlar, örnek firma ve yardım; saha turları ayrı komuttur', async () => {
    const k = await kur();
    await waitFor(() => { expect(k.komutlar()).toContain('Hızlı tur başlat'); });
    expect(k.komutlar()).toEqual(expect.arrayContaining([
      'Yeni denetim ekle', 'Yeni cihaz ekle', 'Öz değerlendirme turu başlat', 'İç denetim başlat', 'Tüm verileri yedekle', 'Örnek firmayı aç', 'Yardım',
    ]));
    expect(k.komutlar().some((b) => b.startsWith('Saha turu: '))).toBe(true);
  });

  it('okur: yalnız yazmayan komutlar; yazar: örnek firma yok', async () => {
    const okur = await kur({ yazabilir: false, yonetici: false });
    await waitFor(() => { expect(okur.komutlar()).toEqual(['Yeni cihaz ekle', 'Tüm verileri yedekle', 'Yardım']); });
    cleanup();
    const yazar = await kur({ yonetici: false });
    await waitFor(() => { expect(yazar.komutlar()).toContain('Hızlı tur başlat'); });
    expect(yazar.komutlar()).not.toContain('Örnek firmayı aç');
  });

  it('yazılana sayfa, cihaz, doküman ve terim önerir; seçilen öneri o yere gider', async () => {
    const k = await kur({ aletler: [] });
    expect(k.oneriler()).toHaveLength(0);
    k.yaz('takv');
    await waitFor(() => { expect(k.oneriler().map((o) => o.baslik)).toContain('Takvim'); });
    expect(k.oneriler().every((o) => o.oneri === true)).toBe(true);
    act(() => { k.oneriler().find((o) => o.baslik === 'Takvim')?.calistir(); });
    expect(await screen.findByText('gorunum:home adres:/denetim-hazirlik/yeni/takvim')).toBeTruthy();
    k.yaz('pukö');
    await waitFor(() => { expect(k.oneriler().map((o) => o.baslik)).toEqual(['PUKÖ']); });
    act(() => { k.oneriler()[0]?.calistir(); });
    expect(await screen.findByRole('dialog', { name: /Yardım/ })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Terim ara' })).toHaveProperty('value', 'PUKÖ');
    k.yaz('');
    await waitFor(() => { expect(k.oneriler()).toHaveLength(0); });
  });
});

describe('Ctrl K veri önerileri', () => {
  it('soru, cihaz ve doküman önerir; cihaz Kalibrasyon görünümünü o cihazla süzer', async () => {
    const alet = { id: 'a1', no: 'DN-77', ad: 'Deneme mastarı', yer: 'Deneme alanı', aralik: '', periyotGun: 360, per: 12, last: '', nx: '', st: 'aktif' as const, res: '' as const, cert: '', hist: [] };
    const k = await kur({ aletler: [alet] });
    k.yaz('dn-77');
    await waitFor(() => { expect(k.oneriler().map((o) => o.baslik)).toEqual(['DN-77 · Deneme mastarı']); });
    expect(k.oneriler()[0]?.aciklama).toMatch(/^Cihazlar · Deneme alanı/);
    act(() => { k.oneriler()[0]?.calistir(); });
    expect(await screen.findByText(/adres:\/denetim-hazirlik\/yeni\/kalibrasyon$/)).toBeTruthy();
    k.yaz('ilgili taraflar');
    await waitFor(() => { expect(k.oneriler().some((o) => o.aciklama?.startsWith('Sorular · '))).toBe(true); });
    k.yaz('el kitabı');
    await waitFor(() => { expect(k.oneriler().some((o) => o.aciklama?.startsWith('Dokümanlar · '))).toBe(true); });
  });
});

describe('paletOnerileri', () => {
  const o = (baslik: string, veri = false): PaletOgesi => ({ anahtar: baslik, grup: 'g', baslik, alt: '', simge: 'file', ...(veri ? { veri: true as const } : {}), calistir: () => {} });

  it('veri aramaları en az iki harf ister; en çok sekiz öneri', () => {
    const l = [o('Kalibrasyon'), o('Kumpas', true)];
    expect(paletOnerileri(l, 'k').map((x) => x.baslik)).toEqual(['Kalibrasyon']);
    expect(paletOnerileri(l, 'ku').map((x) => x.baslik)).toEqual(['Kumpas']);
    expect(paletOnerileri(l, '  ')).toEqual([]);
    expect(paletOnerileri(Array.from({ length: 20 }, (_, i) => o(`Sayfa ${String(i)}`)), 'sayfa')).toHaveLength(ONERI_SINIRI);
  });

  it('Türkçe büyük-küçük harf eşleşir', () => {
    expect(paletOnerileri([o('İç denetim')], 'iç').map((x) => x.baslik)).toEqual(['İç denetim']);
  });
});
