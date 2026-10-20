import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, KatalogKaydi } from '#paylasilan/sozlesme/satin-alma.ts';
import type { SonPartilerCevabi } from '#paylasilan/sozlesme/stok.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { merkeziBagla } from './bagla.ts';

const json = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
// Malzeme, parti ve belge adları uydurmadır.
const kalem = (id: string, malzemeNo: number, ad: string): KatalogKaydi => ({
  id, kod: `HM-${malzemeNo}`, ad, kategori: 'Hammadde', birim: 'kg', ozellik: '', notlar: '', takmaAdlari: [], malzemeNo, surum: 1, olusturma: '2026-10-01T08:00:00.000Z',
});
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [], tedarikciler: [], firmaKartlari: [],
  katalog: [kalem('00000000-0000-4000-8000-0000000000d1', 21, 'Deneme çubuk'), kalem('00000000-0000-4000-8000-0000000000d2', 22, 'Deneme levha')],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
};
const partiler: SonPartilerCevabi = {
  partiler: [
    { partiId: 5, lotNo: 'L-2026-0005', tedarikciPartiNo: 'TP-1', dokumNo: 'D-9', sertifikaNo: 'S-77', kayitZamani: '2026-10-10T07:00:00.000Z', belgeler: [{ id: 31, ad: 'Deneme sertifika', tur: 'sertifika', harf: 'A' }] },
    { partiId: 4, lotNo: 'L-2026-0004', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, kayitZamani: '2026-10-01T07:00:00.000Z', belgeler: [] },
  ],
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('Malzemelerde son partiler ve sertifikalar (hammadde sertifikası)', () => {
  it('malzeme sayfası partileri stoktan bir kez okur; sertifika no ve belge bağlantısı görünür, sertifikasız parti işaretlenir', async () => {
    const istekler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const yol = String(adres).replace('/api', '');
      istekler.push(yol);
      if (yol.startsWith('/stok/malzemeler/21/son-partiler')) return json(partiler);
      if (yol.startsWith('/stok/malzemeler/22/son-partiler')) return json({ partiler: [] });
      return json(acilis);
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'materials', yol: '/satin-alma/malzemeler', git: () => {} });
    await vi.waitFor(() => expect(kok.querySelector('[data-act="open-mat"]')).not.toBeNull());
    const ac = (ad: string) => [...kok.querySelectorAll<HTMLElement>('[data-act="open-mat"]')].find((e) => e.textContent?.includes(ad))!.click();

    ac('Deneme çubuk');
    await vi.waitFor(() => expect(kok.querySelector('[data-sa-partiler] table')).not.toBeNull());
    const satirlar = [...kok.querySelectorAll('[data-sa-partiler] tbody tr')];
    expect(satirlar).toHaveLength(2);
    expect(satirlar[0]!.textContent).toContain('S-77');
    // Lot no stokun kendi numarasıdır; tedarikçi parti numarası olmayan partide de görünür.
    expect([...satirlar].map((s) => s.querySelectorAll('td')[1]!.textContent)).toEqual(['L-2026-0005', 'L-2026-0004']);
    const a = satirlar[0]!.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/cizimler/belge/31');
    expect(a.textContent).toBe('Deneme sertifika (A)');
    expect(satirlar[1]!.querySelector('.flag.warn')?.textContent).toBe('yok');
    expect(satirlar[1]!.textContent).toContain('eklenmedi');
    expect(istekler.filter((y) => y.startsWith('/stok/')).length).toBe(1);

    kok.querySelector<HTMLElement>('[data-act="go"][data-page="materials"]')!.click();
    await vi.waitFor(() => expect(kok.querySelector('[data-act="open-mat"]')).not.toBeNull());
    ac('Deneme levha');
    await vi.waitFor(() => expect(kok.querySelector('[data-sa-partiler]')?.textContent).toContain('tedarikçi partisi yok'));
    expect(istekler.filter((y) => y.startsWith('/stok/'))).toEqual(['/stok/malzemeler/21/son-partiler', '/stok/malzemeler/22/son-partiler']);
    kapat();
  });
});
