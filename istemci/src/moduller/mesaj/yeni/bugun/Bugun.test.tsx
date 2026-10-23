import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BEN, KISI_A, KISI_B, ornekBelgeler } from '../ornek-veri.ts';
import type { Gorev, Kayit, Toplanti, Zamanli } from '../tipler.ts';
import { OKUYAN, YAZAN, mesajAc, sunucuKur } from '../test-ortak.tsx';
import { bugunOzeti, gunSeridi, ozetCumlesi, selam } from './kurallar.ts';

// Örnek veri sabit güne bağlı (görev son tarihi, yarınki toplantı); saat o günün sabahına alınır, zamanlayıcılar gerçek kalır.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-23T08:00:00Z')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const SAAT = 3_600_000;
const GUN = 86_400_000;
const ogle = (simdi = Date.now()) => new Date(simdi).setHours(12, 0, 0, 0);
const k = <T,>(id: string, v: T): Kayit<T> => ({ ...v, id, surum: 1 });

describe('Bugün hesapları', () => {
  it('selam saate göre', () => {
    expect([4, 8, 12, 18, 22].map(selam)).toEqual(['İyi geceler', 'Günaydın', 'İyi günler', 'İyi akşamlar', 'İyi geceler']);
  });

  it('özet bekleyenleri sayar ve sıradaki toplantıyı söyler', () => {
    const simdi = ogle();
    const mt = k<Toplanti>('m1', { title: 'T', start: simdi + 30 * 60_000, by: KISI_A, attendees: [BEN], createdAt: 0, rsvp: { [BEN]: { u: BEN, r: 'yes', ts: 0 } } });
    const o = bugunOzeti({
      ben: BEN, simdi, okunan: {}, kanallar: [], onaylar: [], duyurular: [], siparisler: [], toplantilar: [mt],
      gorevler: [k<Gorev>('t1', { title: 'G', to: BEN, by: KISI_A, status: 'todo', due: null, createdAt: 0 })],
    });
    expect(o.bekleyen).toBe(1);
    expect(o.siradaki?.id).toBe('m1');
    expect(ozetCumlesi(o, simdi, () => '30 dk sonra')).toBe('Seni bekleyen 1 şey var. Sıradaki toplantı 30 dk sonra.');
    const bos = bugunOzeti({ ben: BEN, simdi, okunan: {}, kanallar: [], onaylar: [], duyurular: [], siparisler: [], toplantilar: [], gorevler: [] });
    expect(ozetCumlesi(bos, simdi, () => '')).toBe('Bekleyen işin yok. Bugün toplantın yok.');
  });

  it('teslimi 7 gün içindeki sevk edilmemiş siparişler tarihe göre; sevk edilen ve uzak olan yok', () => {
    const simdi = ogle();
    const s = (id: string, teslim: number | null, durum: 'sirada' | 'sevk' = 'sirada') => ({ id, no: id, musteri: 'M', urun: 'U', hedef: 1, birim: 'adet', teslim, durum, uretilen: null });
    const o = bugunOzeti({
      ben: BEN, simdi, okunan: {}, kanallar: [], onaylar: [], duyurular: [], toplantilar: [], gorevler: [],
      siparisler: [s('b', simdi + 3 * GUN), s('a', simdi + GUN), s('c', simdi + 9 * GUN), s('d', simdi, 'sevk'), s('e', null)],
    });
    expect(o.siparisler.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('şerit 07-20 aralığını öğelere ve şimdiye göre genişletir; toplantılar en çok iki şeritte', () => {
    const simdi = ogle();
    const gunBasi = new Date(simdi).setHours(0, 0, 0, 0);
    const mt = (id: string, saat: number, dur = 60) => k<Toplanti>(id, { title: id, start: gunBasi + saat * SAAT, dur, by: BEN, createdAt: 0 });
    const z = k<Zamanli>('z1', { cid: 'genel', by: BEN, text: `<@${KISI_A}> not`, sendAt: gunBasi + 22 * SAAT, status: 'bekliyor', createdAt: 0 });
    const s = gunSeridi({
      ben: BEN, simdi, ad: () => 'Örnek', gorevler: [], siparisler: [], zamanli: [z],
      toplantilar: [mt('a', 6), mt('b', 6.5), mt('c', 6.75)],
    });
    expect([s.ilkSaat, s.sonSaat]).toEqual([6, 23]);
    expect(s.ogeler.filter((o) => o.tur === 'toplanti').map((o) => o.serit)).toEqual([0, 1, 1]);
    expect(s.ogeler.find((o) => o.tur === 'zamanli')?.baslik).toBe('@Örnek not');
  });
});

describe('M3 Bugün', () => {
  it('selam, özet ve bölümler: davet, bahis, duyuru, onay, görev, takip', async () => {
    sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    mesajAc();
    expect(await screen.findByText(/, Deneme$/)).toBeTruthy();
    expect(screen.getByText(/^Seni bekleyen 4 şey var\./)).toBeTruthy();
    for (const b of ['Yanıt bekleyen davetler', 'Senden bahsedildi', 'Okunması gereken duyurular', 'Onayını bekleyenler', 'Görevlerin', 'Takip ettiklerin']) {
      expect(screen.getByRole('heading', { name: b })).toBeTruthy();
    }
    expect(screen.getByRole('group', { name: 'Bugünün akışı' })).toBeTruthy();
    expect(screen.queryByText('Masan tertemiz')).toBeNull();
  });

  it('bahis satırı kanalı açar', async () => {
    sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    mesajAc();
    const bolum = (await screen.findByRole('heading', { name: 'Senden bahsedildi' })).closest('section') as HTMLElement;
    fireEvent.click(within(bolum).getByRole('button', { name: /#genel/ }));
    await waitFor(() => { expect(screen.getByRole('tab', { selected: true }).textContent).toMatch(/^Sohbet/); });
  });

  it('bekleyen bir şey yoksa masan tertemiz der', async () => {
    sunucuKur({ ben: OKUYAN, belgeler: { 'channels/genel': { name: 'genel', createdAt: 0, createdBy: KISI_B } } });
    mesajAc();
    expect(await screen.findByText('Masan tertemiz')).toBeTruthy();
    expect(screen.getByText(/^Bekleyen işin yok\. Bugün toplantın yok\.$/)).toBeTruthy();
  });

  it('bugünkü toplantı sıradaki kartında Aç ile ayrıntıyı açar; web adresi olmayan bağlantıda Katıl yok', async () => {
    const simdi = Date.now();
    // Sürmekte olan toplantı: gece yarısına yakın koşuda da bugünün içinde kalır.
    const bas = Math.max(new Date(simdi).setHours(0, 0, 0, 0), simdi - 10 * 60_000);
    sunucuKur({
      ben: YAZAN,
      belgeler: { 'toplantilar/m1': { title: 'Vardiya toplantısı', start: bas, dur: 120, by: BEN, attendees: [KISI_A], link: 'javascript:alert(1)', createdAt: 0 } },
    });
    mesajAc();
    const ad = await screen.findByText('Vardiya toplantısı', { selector: 'b' });
    const kart = ad.closest('.tc-mb-siradaki') as HTMLElement;
    expect(within(kart).queryByText('Katıl')).toBeNull();
    fireEvent.click(within(kart).getByRole('button', { name: 'Aç' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
