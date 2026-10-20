import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AkisKarti, CubukListesiKarti, IkiSeriKarti, ParcaCubuguKarti } from './PanoGrafikleri.tsx';

const ciz = (dugum: ReactNode) => render(<MemoryRouter>{dugum}</MemoryRouter>).container;
const durum = (c: HTMLElement) => c.querySelector('.tc-grafik-durum')?.textContent;
const satirlar = (c: HTMLElement) => [...c.querySelectorAll('table tr')].map((r) => r.textContent);

afterEach(cleanup);

describe('Şirket özeti grafikleri (#1085)', () => {
  it('veri gelmeden "…", null ya da boşsa "Veri yok" (ya da verilen boş metni), hatada "Alınamadı"; üçünde de çizim ve tablo yok', () => {
    for (const [dugum, beklenen] of [
      [<CubukListesiKarti key="1" baslik="B" simge="chart" />, '…'],
      [<CubukListesiKarti key="2" baslik="B" simge="chart" satirlar={null} />, 'Veri yok'],
      [<CubukListesiKarti key="3" baslik="B" simge="chart" satirlar={[]} bosMetin="Planda istasyon yok" />, 'Planda istasyon yok'],
      [<IkiSeriKarti key="4" baslik="B" simge="chart" seriAdlari={['a', 'b']} noktalar={[{ etiket: 'x', birinci: 1, ikinci: 2 }]} hata />, 'Alınamadı'],
      [<ParcaCubuguKarti key="5" baslik="B" simge="chart" parcalar={[{ etiket: 'a', deger: 0, durum: 'calisiyor' }]} />, 'Veri yok'],
    ] as const) {
      const c = ciz(dugum);
      expect(durum(c)).toBe(beklenen);
      expect(c.querySelector('svg:not(.tc-simge)')).toBeNull();
      expect(c.querySelector('table')).toBeNull();
      cleanup();
    }
  });

  it('çubuk listesi: genişlik tavana göre yüzde, tavanı aşan sona dayanır, sıfır çubuk çizmez; ton satıra yazılır, değer tabloda', () => {
    const c = ciz(
      <CubukListesiKarti baslik="Doluluk" simge="chart" birim="%" enUst={100} satirlar={[
        { etiket: 'A', deger: 40 }, { etiket: 'B', deger: 130, ton: 'hata' }, { etiket: 'C', deger: 0 },
      ]} />,
    );
    const izler = [...c.querySelectorAll('.tc-cubuk-satir')];
    expect(izler.map((s) => s.querySelector('rect')?.getAttribute('width') ?? null)).toEqual(['40%', '100%', null]);
    expect(izler.map((s) => s.getAttribute('data-ton'))).toEqual([null, 'hata', null]);
    expect(satirlar(c)).toEqual(['A%40', 'B%130', 'C%0']);
  });

  it('parça çubuğu: sıfır dilim çizilmez ama göstergede ve tabloda kalır; dilim genişliği payına göre; dilim arası çizgi dilim sayısından bir eksik', () => {
    const c = ciz(
      <ParcaCubuguKarti baslik="Makine" simge="cpu" birim="makine" parcalar={[
        { etiket: 'Çalışıyor', deger: 3, durum: 'calisiyor' }, { etiket: 'Bakımda', deger: 0, durum: 'durakli' }, { etiket: 'Arızada', deger: 1, durum: 'durdu' },
      ]} />,
    );
    expect([...c.querySelectorAll('rect.tc-parca')].map((r) => r.getAttribute('width'))).toEqual(['750', '250']);
    expect(c.querySelectorAll('.tc-parca-ara')).toHaveLength(1);
    expect([...c.querySelectorAll('.tc-parca-gosterge li')].map((l) => l.getAttribute('data-durum'))).toEqual(['calisiyor', 'durakli', 'durdu']);
    expect(c.querySelector('title')?.textContent).toBe('Çalışıyor: 3 makine (%75)');
    expect(satirlar(c)).toEqual(['Çalışıyor3 makine', 'Bakımda0 makine', 'Arızada1 makine']);
  });

  it('iki serili çubuk: gün başına iki çubuk, ikincisi ayrı sınıfla; en büyük değer üstte; gösterge iki seriyi adlandırır', () => {
    const c = ciz(
      <IkiSeriKarti baslik="Hareket" simge="box" seriAdlari={['Giriş', 'Çıkış']} noktalar={[{ etiket: 'P', birinci: 4, ikinci: 2 }, { etiket: 'S', birinci: 0, ikinci: 1 }]} />,
    );
    expect(c.querySelectorAll('path.tc-grafik-cubuk')).toHaveLength(3);
    expect(c.querySelectorAll('path.tc-grafik-ikinci')).toHaveLength(2);
    expect(c.querySelector('path.tc-grafik-cubuk')?.getAttribute('d')).toContain('V12');
    expect(c.querySelector('.tc-grafik-gosterge')?.textContent).toBe('GirişÇıkış');
    expect(c.querySelector('.tc-grafik-eksen')?.textContent).toBe('PS');
  });

  it('akış: adım sırası korunur, ok ikinci adımdan başlar; bilinmeyen sayı "–" ve tabloda "Veri yok"; dikkat yalnız sayı sıfırdan büyükken', () => {
    const c = ciz(
      <AkisKarti baslik="Akış" simge="layers" adimlar={[
        { etiket: 'Talep', sayi: null }, { etiket: 'Onay', sayi: 0, dikkat: true }, { etiket: 'Geciken', sayi: 2, dikkat: true },
      ]} />,
    );
    const adimlar = [...c.querySelectorAll('.tc-akis-adim')];
    expect(adimlar.map((a) => a.querySelector('.tc-akis-sayi')?.textContent)).toEqual(['–', '0', '2']);
    expect(adimlar.map((a) => a.querySelector('.tc-akis-ok') !== null)).toEqual([false, true, true]);
    expect(adimlar.map((a) => a.hasAttribute('data-dikkat'))).toEqual([false, false, true]);
    expect(satirlar(c)).toEqual(['TalepVeri yok', 'Onay0', 'Geciken2']);
    cleanup();
    expect(durum(ciz(<AkisKarti baslik="Akış" simge="layers" adimlar={[{ etiket: 'Talep', sayi: null }]} />))).toBe('Veri yok');
    cleanup();
    expect(durum(ciz(<AkisKarti baslik="Akış" simge="layers" adimlar={[{ etiket: 'Talep' }, { etiket: 'Onay', sayi: 1 }]} />))).toBe('…');
  });
});
