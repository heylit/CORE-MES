import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DegisimBolumu, HamBolumu, KontrolBolumu, TakimBolumu, kontrolSatirlari } from './GkodPaneli.tsx';
import { KodListesi } from './KodListesi.tsx';
import { Oynatici } from './Oynatici.tsx';
import type { Program, TakimBilgisi } from './tipler.ts';

afterEach(cleanup);

const bilgi = (src: TakimBilgisi['src']): TakimBilgisi => ({ T: 2, src, name: 'Freze 16', d: 16, ball: false, lathe: false, id: 'f1', z: 0, col: 1, t: null, magT: null });
const program = (ek: Partial<Program> = {}) => ({ tools: [1, 2], warn: [{ msg: 'G28 / G53 referans dönüşleri atlandı', line: 4 }], ...ek }) as unknown as Program;

describe('G-Kod Sim. paneli', () => {
  it('kontrol: magazinde olmayan takim ve hizli temas uyari, bilgi satirindan satira gidilir', () => {
    const k = kontrolSatirlari(program(), (T) => bilgi(T === 1 ? 'mag' : 'empty'), [{ ln: 6 }], null, true, 50, false);
    expect(k.uyari).toBe(2);
    expect(k.cip).toEqual({ metin: '2 uyarı', ton: 'hata' });
    const git = vi.fn();
    render(<KontrolBolumu satirlar={k.satirlar} cip={k.cip} satiraGit={git} />);
    expect(screen.getByText('T2 magazinde yok — çap varsayıldı, talaş yanlış olabilir.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'satır 5' }));
    expect(git).toHaveBeenCalledWith(4);
  });

  it('kontrol: dalma yok ve bitince kalan malzeme', () => {
    const cmp = { gouge: 0, gmax: 0, left: 0, lmax: 0, ok: 10, cells: 10 };
    const k = kontrolSatirlari(program({ warn: [] }), () => bilgi('mag'), [], cmp, true, 100, true);
    expect(k.satirlar.map((s) => s.metin)).toEqual(['Parçaya dalma yok', 'Üstten görülen tüm yüzeyler işlenmiş']);
    expect(k.cip.metin).toBe('Temiz');
  });

  it('izinli: magazine uygula gorunur; reddedilen: gizli', () => {
    const uygula = vi.fn();
    const satirlar = [{ T: 2, bilgi: bilgi('ov'), sure: 1, seciliId: 'f1' }];
    const ciz = (uygulanabilir: boolean) => render(
      <TakimBolumu satirlar={satirlar} kutuphane={[{ id: 'f1', name: 'Freze 16' }]} tezgahAdi="Tezgah A" cip={null} uygulanabilir={uygulanabilir} takimSec={() => undefined} capGir={() => undefined} uygula={uygula} />,
    );
    ciz(true);
    fireEvent.click(screen.getByRole('button', { name: 'Bu seçimi kurulum magazinine uygula' }));
    expect(uygula).toHaveBeenCalled();
    expect(screen.getByText('Simülasyon için değiştirildi')).toBeTruthy();
    cleanup();
    ciz(false);
    expect(screen.queryByRole('button', { name: 'Bu seçimi kurulum magazinine uygula' })).toBeNull();
  });

  it('ham parca: olmayan kaynak secilemez, elle kutu acilir', () => {
    const sec = vi.fn();
    const man = { x0: 0, y0: 0, z0: -20, x1: 100, y1: 100, z1: 0, src: 'man' as const };
    render(<HamBolumu secenekler={{ man }} kullanilan="man" orijin="tlf" parcaKarsilastirmasi={false} cip={null} sec={sec} orijinSec={() => undefined} elleDegistir={() => undefined} hamSayfasi={() => undefined} />);
    expect((screen.getByRole('radio', { name: /Programdaki BLK FORM/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByLabelText('X min')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Takım yolundan otomatik/ }));
    expect(screen.getByRole('button', { name: 'Ham Malzeme' })).toBeTruthy();
  });

  it('takim degisimi listesi ve kod listesi satira gider', () => {
    const git = vi.fn();
    render(<DegisimBolumu satirlar={[{ ln: 3, sira: 1, baslik: 'T2 · Freze 16', zaman: 0.5, renk: 1 }]} git={git} />);
    fireEvent.click(screen.getByRole('button', { name: /1\. değişim/ }));
    expect(git).toHaveBeenCalledWith(3);
    cleanup();
    const satiraGit = vi.fn();
    render(
      <KodListesi
        satirlar={['%', 'T2 M6', 'G0 X0']} aciklama={[{ t: 'Program başı / sonu işareti', k: 'pg' }, { t: 'TAKIM DEĞİŞİMİ → T2', k: 'tc', T: '2', simge: 'takim' }, { t: 'G0: Hızlı hareket', k: 'rp' }]}
        degisimler={[1]} gecerli={2} kip="all" kipSec={() => undefined} bilgi="3 satır · 1 takım değişimi" ayristirma="" satiraGit={satiraGit} kapat={() => undefined} takimSinifi={() => 'tc-ch-renk-1'}
      />,
    );
    fireEvent.click(screen.getByTitle('TAKIM DEĞİŞİMİ → T2'));
    expect(satiraGit).toHaveBeenCalledWith(1);
  });

  it('oynatici eylemleri', () => {
    const eylem = vi.fn(), hizSec = vi.fn();
    render(<Oynatici oynuyor={false} zaman={0.5} toplam={2} dilimler={[]} hiz="auto" hizSec={hizSec} eylem={eylem} git={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Oynat / duraklat (Boşluk)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sona (End)' }));
    expect(eylem.mock.calls).toEqual([['play'], ['end']]);
    fireEvent.change(screen.getByLabelText('Oynatma hızı'), { target: { value: '20' } });
    expect(hizSec).toHaveBeenCalledWith('20');
    expect(screen.getByText('0:30 / 2:00')).toBeTruthy();
  });
});
