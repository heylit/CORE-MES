import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import type { Pkg } from './tipler.ts';

// 3131: bekletilen emrin (3050 a) paketleri Hazırlık'ta "Beklemede · neden" işaretiyle görünür; beklemeyen emirde işaret yok.
// Arkon deposu dosya içinde paylaşılır: kimlikler bu dosyaya özgüdür. Adlar uydurmadır (ORN-).

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const TESIS = { wcs: [{ id: 'TAL', name: 'ORN merkez' }], sts: [{ id: 'ORN-IST', name: 'ORN tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const paket = (id: string, no: string, emirId: number, isEmriId: number, bekletme?: string): Pkg => ({
  id, no, opType: 'cnc', st: {}, partNo: 'ORN-P', part: 'ORN parça', rev: 'A', op: 'Op 10', machine: 'ORN-IST', target: 40, cycle: 30,
  due: '', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], status: 'published', version: 1, dirty: false,
  createdAt: 1, updatedAt: 2, by: 'ORN', publishedAt: 2, tmi: { emirId, isEmriId, opNo: 10, ...(bekletme ? { bekletme } : {}) },
} as Pkg);

describe('3131 Hazırlık bekleme işareti', () => {
  it('kart ve tablo başlığında bekleyen emir nedeniyle işaretlenir, beklemeyen emirde işaret yok', async () => {
    const a = paket('tmi-ie-bk1', 'ORN-UE-BK1', 71, 711, 'Malzeme bekleniyor'), b = paket('tmi-ie-bk2', 'ORN-UE-BK2', 72, 721);
    sunucuKur(YONETICI, { belgeler: { pkgs: [a, b].map((p) => ({ kimlik: p.id, surum: 1, govde: p })), kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    arkonAc('/arkon/hazirlik');
    const cip = await screen.findByTitle('Operatörde gizli; emir devam edince görünür.', {}, { timeout: 10000 });
    expect(cip.textContent).toBe('Beklemede · Malzeme bekleniyor');
    expect(screen.getAllByTitle('Operatörde gizli; emir devam edince görünür.')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Tablo' }));
    const tablo = await screen.findByRole('table', { name: 'Hazırlık takip tablosu' }, { timeout: 10000 });
    const bekleyen = within(tablo).getByText('ORN-UE-BK1').closest('tr')!;
    expect(within(bekleyen).getByText('Beklemede · Malzeme bekleniyor')).toBeTruthy();
    expect(within(within(tablo).getByText('ORN-UE-BK2').closest('tr')!).queryByText(/Beklemede/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Beklemede' }));
    expect(within(tablo).queryByText('ORN-UE-BK2')).toBeNull();
    expect(within(tablo).getByText('ORN-UE-BK1')).toBeTruthy();
  }, 40000);
});
