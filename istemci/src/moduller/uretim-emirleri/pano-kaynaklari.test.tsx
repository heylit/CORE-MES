import { describe, expect, it } from 'vitest';
import type { OzetCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { durusOlcusu, gunListesi, kuyrukKalemi, planlanacakKalemi, uretimOlculeri, uretimSerileri } from './pano-kaynaklari.tsx';

const ozet = (ek: Partial<OzetCevabi>): OzetCevabi => ({ planlanacak: 0, acik: 0, kuyrugum: 0, bugunSaglam: 0, ...ek });

describe('uretim emirleri pano kaynaklari (kart 1585)', () => {
  it('planlanacak ve kuyruk sifirdan buyukse kalem; kuyruk terminali acar', () => {
    expect(planlanacakKalemi(ozet({ planlanacak: 4 }))[0]).toMatchObject({ baslik: '4 emir plana alınmayı bekliyor', eylem: 'Planla' });
    expect(planlanacakKalemi(ozet({ planlanacak: null }))).toEqual([]);
    expect(kuyrukKalemi(ozet({ kuyrugum: 2 }))[0]?.yol).toBe('/uretim-terminali');
    expect(kuyrukKalemi(ozet({}))).toEqual([]);
  });

  it('bugunun kaydi yoksa deger null; kiyas onceki kayitli gun, tarihiyle', () => {
    const c = { gunler: [{ gun: '2026-10-30', saglam: 300, hurda: 5 }, { gun: '2026-10-31', saglam: 320, hurda: 2 }] };
    const [saglam, hurda] = uretimOlculeri(c, '2026-11-01');
    expect(saglam).toMatchObject({ deger: null, kiyas: { etiket: '31.10', deger: 320, iyiYon: 'artis' }, seri: [300, 320] });
    expect(hurda?.kiyas?.iyiYon).toBe('azalis');
    const [bugun] = uretimOlculeri(c, '2026-10-31');
    expect(bugun).toMatchObject({ deger: 320, kiyas: { etiket: '30.10', deger: 300 } });
    expect(uretimOlculeri({ gunler: [] }, '2026-11-01')[0]).toMatchObject({ deger: null, kiyas: null, seri: [] });
  });

  it('durus dagilimi en uzun nedenden; bos donemde olcu yok', () => {
    const c = { nedenler: [{ neden: { id: 1, ad: 'Ayar' }, adet: 2, dakika: 30.4 }, { neden: { id: 2, ad: 'Arıza' }, adet: 1, dakika: 90 }] };
    expect(durusOlcusu(c)[0]?.dagilim).toEqual([{ etiket: 'Arıza', deger: 90 }, { etiket: 'Ayar', deger: 30 }]);
    expect(durusOlcusu({ nedenler: [] })).toEqual([]);
  });
});

describe('uretim grafikleri (kart 1773)', () => {
  it('pencere gunleri sirali; kaydi olmayan gun null, oran yalniz uretimi olan gunde', () => {
    expect(gunListesi('2026-11-01', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    const v = uretimSerileri({ gunler: [{ gun: '2026-10-30', saglam: 90, hurda: 10 }, { gun: '2026-11-01', saglam: 0, hurda: 0 }] }, '2026-11-01', 3);
    expect(v.etiketler).toEqual(['30.10', '31.10', '01.11']);
    expect(v.saglam).toEqual([90, null, 0]);
    expect(v.hurdaOrani).toEqual([10, null, null]);
  });
});
