import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { lifeCompute } from './analiz.ts';
import { AnalizPaneli } from './AnalizPaneli.tsx';
import { TakipPaneli, type PanelYetkisi } from './TakipPaneli.tsx';
import { depotKartlari, durumKur, lwDefs, state, TAKIMLAR } from './test-verisi.ts';
import type { CarkKarti, DepoKarti } from './tipler.ts';
import { YenilemePaneli } from './YenilemePaneli.tsx';

vi.mock('./cekirdek.ts', () => import('./test-verisi.ts'));

// Her yazma düğmesi yetkiyle görünür, yetkisizken hiç çizilmez (asıl denetim sunucudadır).
const HEPSI: PanelYetkisi = { yazabilir: true, takimDegistirebilir: true, stokDusebilir: true };
const HICBIRI: PanelYetkisi = { yazabilir: false, takimDegistirebilir: false, stokDusebilir: false };
const dugme = (ad: string | RegExp) => screen.queryByRole('button', { name: ad });

beforeEach(() => {
  durumKur();
  delete depotKartlari.d_mill;
  state.wear = { m1: { 0: { id: 'em10', used: 45, parts: 40, since: 1 } } };
  state.inv = { em10: { qty: 3 } };
});
afterEach(cleanup);

function takip(yetki: PanelYetkisi, satir = 0, kart?: CarkKarti) {
  const defs = lwDefs(), degisti = vi.fn();
  render(
    <TakipPaneli
      defs={defs} active={satir} secili={kart ?? defs[satir]!.cards[0] as CarkKarti} yetki={yetki}
      satiraGit={vi.fn()} tezgahaGit={vi.fn()} analiz={vi.fn()} kutuphane={vi.fn()} degisti={degisti}
    />,
  );
  return degisti;
}

describe('Takip paneli yetkisi', () => {
  it('takım değiştirme yetkisiyle değişim onaylanır, depodan bir yedek düşer', () => {
    const degisti = takip(HEPSI);
    fireEvent.click(dugme('Takım değiştirildi')!);
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(state.wear['m1']![0]).toMatchObject({ used: 0, parts: 0 });
    expect(state.inv['em10']!.qty).toBe(2);
    expect(degisti).toHaveBeenCalled();
    expect(screen.getByLabelText('Kullanılan süre (dk)')).not.toHaveProperty('disabled', true);
  });
  it('yetkisizken değişim, depodan düş ve örnek veri düğmeleri yoktur; alanlar kilitlidir', () => {
    takip(HICBIRI);
    expect(dugme('Takım değiştirildi')).toBeNull();
    expect(screen.queryByLabelText('Değiştirince depodan 1 yedek düş')).toBeNull();
    expect(dugme('Örnek verileri yükle')).toBeNull();
    expect(screen.getByLabelText('Kullanılan süre (dk)')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Günlük üretim (adet)')).toHaveProperty('disabled', true);
    expect(dugme('Ayrıntılı analiz')).not.toBeNull();
  });
  it('örnek veri yalnız yazma yetkisiyle ve tıklanınca yüklenir (210.1)', () => {
    const degisti = takip(HEPSI);
    expect(state.lifeDemo).toBeUndefined();
    fireEvent.click(dugme('Örnek verileri yükle')!);
    expect(state.lifeDemo).toBe('demo');
    expect(degisti).toHaveBeenCalled();
  });
  it('depo adedi: düşme stok yetkisiyle, artırma yazma yetkisiyle', () => {
    const k: DepoKarti = { depot: true, t: TAKIMLAR[0]!, id: 'em10', key: 'em10', stock: { st: 'ok', avail: 2, qty: 3, used: 1, min: 0 }, shelf: 'Parmak', u: undefined, g: 'd_mill' };
    depotKartlari.d_mill = [k];
    takip({ yazabilir: false, takimDegistirebilir: false, stokDusebilir: true }, 1, k);
    const iki = screen.getAllByRole('button', { name: '1 adet' });
    expect(iki).toHaveLength(1);
    fireEvent.click(iki[0]!);
    expect(state.inv['em10']!.qty).toBe(2);
    cleanup();
    takip(HICBIRI, 1, k);
    expect(screen.queryAllByRole('button', { name: '1 adet' })).toHaveLength(0);
  });
});

describe('Yenileme paneli yetkisi', () => {
  const ciz = (izin: boolean) => {
    const defs = lwDefs(), degisti = vi.fn();
    render(<YenilemePaneli d={defs[0]} c={defs[0]!.cards[0] as CarkKarti} takimDegistirebilir={izin} kartSec={vi.fn()} degisti={degisti} />);
    return degisti;
  };
  it('bileme ve yeni takım düğmeleri takım değiştirme yetkisiyle görünür ve uygulanır', () => {
    const degisti = ciz(true);
    fireEvent.click(dugme('Bilendi, yeniden takıldı')!);
    expect(state.wear['m1']![0]).toMatchObject({ rg: 1, used: 0 });
    expect(degisti).toHaveBeenCalled();
    expect(dugme('Yeni takım takıldı (sıfırla)')).not.toBeNull();
  });
  it('yetkisizken yenileme düğmesi yoktur', () => {
    ciz(false);
    expect(dugme('Bilendi, yeniden takıldı')).toBeNull();
    expect(dugme('Yeni takım takıldı (sıfırla)')).toBeNull();
    expect(dugme('Düzeltildi')).toBeNull();
  });
});

describe('Analiz paneli yetkisi', () => {
  const ciz = (yazabilir: boolean) => {
    state.life.sel = 'p:0';
    const degisti = vi.fn();
    render(<AnalizPaneli res={lifeCompute()} yazabilir={yazabilir} geri={vi.fn()} degisti={degisti} />);
    return degisti;
  };
  it('kalibrasyon yazma yetkisiyle kaydedilir', () => {
    const degisti = ciz(true);
    fireEvent.change(screen.getByLabelText('Gözlenen ortalama ömür (dk)'), { target: { value: '90' } });
    fireEvent.click(dugme('Kaydet')!);
    expect(state.life.cal['em10|c45']).toBeCloseTo(1.5);
    expect(degisti).toHaveBeenCalled();
  });
  it('yetkisizken kalibrasyon kaydedilmez', () => {
    ciz(false);
    expect(dugme('Kaydet')).toBeNull();
    expect(dugme('Sıfırla')).toBeNull();
  });
});
