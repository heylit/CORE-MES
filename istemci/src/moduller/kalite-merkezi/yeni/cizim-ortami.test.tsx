import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCizimOrtami } from '../../../ortak/cizim/ortam.tsx';
import { aletGecerliMi } from '../../../ortak/cizim/cekirdek/olcum-aleti.ts';

const islemler = vi.hoisted(() => ({ liste: [] as string[] }));
const apiGet = vi.hoisted(() => vi.fn());
vi.mock('../../../ortak/veri/yetki.ts', () => ({
  useYetki: () => ({ hazir: true, var: (i: string) => islemler.liste.includes(i), herhangi: (...l: string[]) => l.some((i) => islemler.liste.includes(i)) }),
}));
vi.mock('../../../ortak/veri/api.ts', () => ({ api: { get: apiGet } }));

const { KaliteMerkeziCizimOrtami, cihazKaydi, cihazOnbellegi, kalibrasyonAletleri } = await import('./cizim-ortami.tsx');

// Uydurma deneme verisi; gerçek alet parkı değildir.
const alet = (o: Record<string, unknown>) => ({
  id: 1, no: 'DNM-1', turId: 1, tur: 'Kumpas', ad: null, olcmeAraligi: null, yer: null, periyotGun: 365, kullanimDisi: false,
  kullanimDisiNedeni: null, sonKalibrasyon: '2026-10-01', vade: null, kalanGun: null, durum: 'gecerli', surum: 1, ...o,
});
const LISTE = { aletler: [alet({}), alet({ id: 2, no: 'DNM-2', kullanimDisi: true }), alet({ id: 3, no: 'DNM-3', sonKalibrasyon: null })], ozet: { vadesiGecen: 0, yaklasan: 0 } };

function Aletler() {
  const { aletler } = useCizimOrtami();
  return <ul aria-label="aletler">{aletler.map((a) => <li key={a.id}>{a.no}</li>)}</ul>;
}
function ac() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><KaliteMerkeziCizimOrtami><Aletler /></KaliteMerkeziCizimOrtami></QueryClientProvider>);
}

afterEach(() => { cleanup(); apiGet.mockReset(); islemler.liste = []; window.localStorage.clear(); });

describe('Kalite Merkezi çizim ortamı (2032 a, kart 2033)', () => {
  it('ölçü aletleri Kalibrasyon listesinden gelir: kullanım dışı ve kaydı olmayan alet geçerli sayılmaz', () => {
    const l = kalibrasyonAletleri(LISTE as never);
    expect(l.map((a) => a.id)).toEqual(['tmi-alet-1', 'tmi-alet-2', 'tmi-alet-3']);
    const simdi = new Date('2026-11-03T12:00').getTime();
    expect(l.map((a) => aletGecerliMi(a, simdi))).toEqual([true, false, false]);
    expect(l[2]).not.toHaveProperty('last');
    expect(kalibrasyonAletleri(undefined)).toEqual([]);
  });

  it('izinli: alet okuma yetkisi olan kişide liste okunur ve teknik resme verilir', async () => {
    islemler.liste = ['kalite-merkezi.oku', 'kalibrasyon.oku'];
    apiGet.mockResolvedValue(LISTE);
    ac();
    await waitFor(() => { expect(screen.getAllByRole('listitem').map((x) => x.textContent)).toEqual(['DNM-1', 'DNM-2', 'DNM-3']); });
    expect(apiGet).toHaveBeenCalledWith('/olcu-aletleri');
  });

  it('reddedilen: alet okuma yetkisi olmayan kişide istek gönderilmez, liste boş kalır', async () => {
    islemler.liste = ['kalite-merkezi.oku'];
    ac();
    expect(await screen.findByRole('list', { name: 'aletler' })).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('okuma ayarı Üretim Hazırlık ile aynı cihaz kaydındadır', () => {
    window.localStorage.setItem('arkon:readCfg', JSON.stringify({ ocr: false }));
    expect(cihazKaydi.oku('readCfg')).toEqual({ ocr: false });
    cihazKaydi.yaz('balonAyari', { boy: 1.25 });
    expect(JSON.parse(window.localStorage.getItem('arkon:balonAyari') ?? 'null')).toEqual({ boy: 1.25 });
    cihazKaydi.yaz('balonAyari', null);
    expect(window.localStorage.getItem('arkon:balonAyari')).toBeNull();
  });

  it('IndexedDB yoksa önbellek bu açılışta bellekte tutar; olmayan kayıt null döner', async () => {
    const o = cihazOnbellegi(() => Promise.resolve(null));
    expect(await o.get('pdf:yok')).toBeNull();
    await o.put('pdf:a#1', { w: 1 });
    expect(await o.get('pdf:a#1')).toEqual({ w: 1 });
  });
});
