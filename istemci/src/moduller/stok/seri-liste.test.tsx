import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { BakiyeSatiri, KodCozCevabi, SeriListeCevabi, SeriSatiri } from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';
import { blokOnerisi, csvMetni, sayimPlani, secilebilir, seriBloklari, seriTuru, tasimaPlani } from './seri-liste.ts';

// Seri liste (1915): sentetik kayıtlar.
const satir = (id: number, kod: string, adet: string | null = null, islendi: string | null = null): SeriSatiri =>
  ({ id, sira: id, kod, adet, okutma: '2026-11-03T09:00:00+03:00', islendi });
const bakiye = (malzemeId: number, partiId: number, konumId: number, konumKod: string, statuId: number | null = null): BakiyeSatiri => ({
  id: malzemeId * 100 + partiId + konumId, malzemeId, malzemeAd: `Deneme ${malzemeId}`, konumId, konumKod, partiId, partiEtiketi: `LT-${partiId}`,
  miktar: '10.000', ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId, kaliteDurumu: 'serbest',
});
const goz = (id: number, kod: string, bakiyeler: BakiyeSatiri[] = []): KodCozCevabi => ({
  tur: 'konum', bakiyeler,
  konum: { id, kod, tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: bakiyeler.length, haritaGozId: null, haritaAlanId: null, surum: 1 },
});
const lot = (partiId: number, malzemeId: number, bakiyeler: BakiyeSatiri[]): KodCozCevabi => ({
  tur: 'lot', parti: { id: partiId, lotNo: `LT-${partiId}`, etiket: `LT-${partiId}` }, toplam: '10', bakiyeler,
  ozet: { id: malzemeId, tur: 'hammadde', kod: `HM-${malzemeId}`, ad: `Deneme ${malzemeId}`, onayDurumu: 'onayli', kullanilabilir: true, birim: 'adet' },
});
const COZ: Record<string, KodCozCevabi> = {
  'LOC:A-01-1': goz(41, 'A-01-1', [bakiye(1, 7, 41, 'A-01-1')]),
  'LOC:B-02-1': goz(42, 'B-02-1'),
  'LOT:LT-7': lot(7, 1, [bakiye(1, 7, 41, 'A-01-1')]),
  'LOT:LT-8': lot(8, 2, [bakiye(2, 8, 43, 'C-01-1')]),
  'LOT:LT-9': lot(9, 3, [bakiye(3, 9, 43, 'C-01-1'), bakiye(3, 9, 44, 'C-01-2')]),
};
const coz = (k: string) => COZ[k];

describe('seri-liste kurallari', () => {
  it('tur, secilebilir satir ve goz bloklari okutma sirasindan cikar', () => {
    expect(seriTuru('LOC:A-01-1')).toBe('goz');
    expect(seriTuru('LOT:LT-7')).toBe('lot');
    expect(seriTuru('rastgele')).toBe('bilinmiyor');
    const s = [satir(1, 'LOT:LT-8', '1'), satir(2, 'LOC:A-01-1'), satir(3, 'LOT:LT-7', '2'), satir(4, 'LOT:LT-9', '1', '2026-11-03T10:00:00+03:00')];
    expect(secilebilir(s[0]!)).toBe(true);
    expect(secilebilir(s[1]!)).toBe(false);
    expect(secilebilir(s[3]!)).toBe(false);
    const b = seriBloklari(s);
    expect(b.map((x) => [x.goz?.id ?? null, x.satirlar.map((y) => y.id)])).toEqual([[null, [1]], [2, [3, 4]]]);
    expect(blokOnerisi(b[0]!, coz)).toMatch(/Göz okutulmadan/);
    expect(blokOnerisi(b[1]!, coz)).toMatch(/bu gözde kayıtlı: say/);
  });

  it('tasima yalniz tek ve statusuz kaynakli satiri yazar; gerisi nedeniyle atlanir', () => {
    const p = tasimaPlani([satir(1, 'LOT:LT-8', '2'), satir(2, 'LOT:LT-9', '1'), satir(3, 'LOT:LT-7', '1'), satir(4, 'LOT:LT-8', '0')], coz, 41);
    expect(p.isler).toEqual([{ satirId: 1, govde: { malzemeId: 2, kaynakKonumId: 43, partiId: 8, hedefKonumId: 41, miktar: '2', aciklama: 'Seri liste' } }]);
    expect(p.atlanan.map((a) => a.satirId)).toEqual([2, 3, 4]);
    expect(p.atlanan[0]!.neden).toMatch(/2 yerde/);
    expect(p.atlanan[1]!.neden).toBe('Zaten hedef gözde');
  });

  it('sayim gozun kor sayimidir; adet listedekidir, goz satiri da islenir', () => {
    const b = seriBloklari([satir(1, 'LOC:A-01-1'), satir(2, 'LOT:LT-7', '3')]);
    const p = sayimPlani(b[0]!, new Set([2]), coz);
    expect('hata' in p).toBe(false);
    if ('hata' in p) return;
    expect(p.govde).toEqual({ konumId: 41, satirlar: [{ malzemeId: 1, partiId: 7, sayilanMiktar: '3' }] });
    expect(p.satirIdler).toEqual([1, 2]);
    expect(sayimPlani(seriBloklari([satir(5, 'LOT:LT-7', '1')])[0]!, new Set([5]), coz)).toEqual({ hata: 'Göz okutulmadan sayım olmaz' });
  });

  it('csv ayiraci noktali virgul; ayirac iceren alan tirnaklanir', () => {
    expect(csvMetni([satir(1, 'LOT:LT-7', '2')], () => 'A;B').split('\n')).toEqual(['Sıra;Kod;Tür;Ad;Adet;İşlendi', '1;LOT:LT-7;Lot;"A;B";2;']);
  });
});

const ozet = { id: 3, kaynak: 'okutma' as const, acilis: '2026-11-03T09:00:00+03:00', degisim: '2026-11-03T09:05:00+03:00', kapanis: null, satirSayisi: 4, acikSatir: 4 };
function kur(kullanici: Kullanici, satirlar: SeriSatiri[], ekListeler: SeriListeCevabi['liste'][] = []) {
  let liste: SeriListeCevabi = { liste: ozet, satirlar };
  const istekler = sunucuKur(kullanici, {});
  vi.mocked(fetch).mockImplementation(async (adres, secenek) => {
    const yol = String(adres).replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) as Record<string, unknown> : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici });
    if (yol.startsWith('/stok/kod-coz')) {
      const kod = decodeURIComponent(yol.split('kod=')[1] ?? '');
      return json(200, COZ[kod] ?? { tur: 'bilinmiyor', kod });
    }
    if (yol === '/stok/seri-listeler') return json(200, { listeler: [liste.liste, ...ekListeler] });
    if (yol === '/stok/seri-listeler/3') return json(200, liste);
    const ek = ekListeler.find((l) => yol === `/stok/seri-listeler/${l.id}`);
    if (ek) return json(200, { liste: ek, satirlar: [] });
    if (yol === '/stok/seri-listeler/3/islendi') {
      const ids = (govde?.satirIdler ?? []) as number[];
      liste = { ...liste, satirlar: liste.satirlar.map((s) => (ids.includes(s.id) ? { ...s, islendi: '2026-11-03T10:00:00+03:00' } : s)) };
      return json(200, liste);
    }
    if (yol === '/stok/seri-listeler/3/satirlar/1/sil') {
      liste = { ...liste, satirlar: liste.satirlar.filter((s) => s.id !== 1) };
      return json(200, liste);
    }
    if (yol === '/stok/tasima') return json(200, { hareketId: 1 });
    if (yol === '/stok/sayim') return json(200, { hareketIdler: [], farkSayisi: 0, onayaGiden: 0 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  });
  return istekler;
}
const SATIRLAR = [satir(1, 'LOT:LT-8', '2'), satir(2, 'LOC:A-01-1'), satir(3, 'LOT:LT-7', '3'), satir(4, 'LOT:LT-9', '1')];

describe('Seri listeler ekrani (1915)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('acik listelerde satira basmak o listeyi acar; secili liste birincil degil, aria-current tasir', async () => {
    kur(DEPOCU, SATIRLAR, [{ ...ozet, id: 4, acilis: '2026-11-03T08:00:00+03:00', satirSayisi: 0, acikSatir: 0 }]);
    ac('/stok/seri-listeler');
    const tablo = await screen.findByRole('table', { name: 'Açık listeler' });
    await screen.findByRole('region', { name: 'Göz A-01-1' });
    fireEvent.click(within(tablo).getAllByRole('row')[2]!.querySelector('td[data-baslik="Kaynak"]')!);
    expect(await screen.findByText('Liste boş.')).toBeTruthy();
    expect(within(tablo).getAllByRole('row')[2]!.querySelector('[aria-current="true"]')).not.toBeNull();
    expect(tablo.querySelector('.tc-dugme-birincil')).toBeNull();
  });

  it('bloklar gozle ayrilir; secilenler gozdeki goze tasinir, cok yerli satir atlanip listede kalir', async () => {
    const istekler = kur(DEPOCU, SATIRLAR);
    ac('/stok/seri-listeler');
    const blok = await screen.findByRole('region', { name: 'Göz A-01-1' });
    expect(await within(blok).findByText(/Bir kısmı başka yerde kayıtlı/)).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Göz okutulmadan' })).toBeTruthy();
    // Bloklar ve açık listeler tek satırlı kayan tablodur; okunan satırın adı solda yapışık.
    const satirlar = within(blok).getByRole('table', { name: 'Göz A-01-1' });
    expect(satirlar.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(satirlar).getByRole('columnheader', { name: 'Okunan' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(screen.getByRole('table', { name: 'Açık listeler' }).closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect((await screen.findByLabelText('Seç Deneme 2 · LT-8')).closest('[data-tur]')?.getAttribute('data-tur')).toBe('lot');
    fireEvent.click(await screen.findByLabelText('Seç Deneme 2 · LT-8'));
    fireEvent.click(screen.getByLabelText('Seç Deneme 3 · LT-9'));
    fireEvent.click(screen.getByRole('button', { name: /Taşı…/ }));
    const karar = screen.getByRole('group', { name: 'Taşı' });
    fireEvent.click(within(karar).getByRole('button', { name: /Taşımayı kaydet/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/seri-listeler/3/islendi')?.govde).toEqual({ satirIdler: [1] }));
    expect(istekler.filter((i) => i.yol === '/stok/tasima').map((i) => i.govde)).toEqual([
      { malzemeId: 2, kaynakKonumId: 43, partiId: 8, hedefKonumId: 41, miktar: '2', aciklama: 'Seri liste' },
    ]);
    expect(await screen.findByText(/İşlenmeyen satırlar listede kaldı/)).toBeTruthy();
    expect(screen.getByText(/2 yerde kayıtlı/)).toBeTruthy();
  });

  it('blok sayimi gozun sayim ucuna gider; hic sayim yetkisi olmayana Say ve Tasi gorunmez', async () => {
    const istekler = kur(DEPOCU, SATIRLAR);
    ac('/stok/seri-listeler');
    const blok = await screen.findByRole('region', { name: 'Göz A-01-1' });
    fireEvent.click(await within(blok).findByRole('button', { name: 'Bloğu seç' }));
    fireEvent.click(screen.getByRole('button', { name: /Say…/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Say' })).getByRole('button', { name: /Sayımı kaydet/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sayim')?.govde).toEqual({ konumId: 41, satirlar: [
      { malzemeId: 1, partiId: 7, sayilanMiktar: '3' }, { malzemeId: 3, partiId: 9, sayilanMiktar: '1' },
    ] }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/seri-listeler/3/islendi')?.govde).toEqual({ satirIdler: [2, 3, 4] }));
    cleanup();
    kur({ id: 9, ad: 'Deneme Operatör', islemler: ['sayfa.stok', 'stok.istek'] }, SATIRLAR);
    ac('/stok/seri-listeler');
    expect(await screen.findByRole('button', { name: /Depo sepetine/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Taşı…/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Say…/ })).toBeNull();
  });

  it('satir silinir; hafizadan aktar yeni listeyi hafiza kaynagiyla acar', async () => {
    const istekler = kur(DEPOCU, SATIRLAR);
    ac('/stok/seri-listeler');
    fireEvent.click(await screen.findByRole('button', { name: 'Sil Deneme 2 · LT-8' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sil Deneme 2 · LT-8' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Hafızadan aktar/ }));
    const p = await screen.findByRole('dialog', { name: 'Hafızadan aktar' });
    fireEvent.change(within(p).getByLabelText('Aktarılan kodlar'), { target: { value: 'LOC:A-01-1\nLOT:LT-7\n' } });
    fireEvent.click(within(p).getByRole('button', { name: /Yeni listeye aktar \(2\)/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/seri-listeler/okutma-ekle')?.govde).toEqual({ kaynak: 'hafiza', kodlar: ['LOC:A-01-1', 'LOT:LT-7'] }));
  });
});
