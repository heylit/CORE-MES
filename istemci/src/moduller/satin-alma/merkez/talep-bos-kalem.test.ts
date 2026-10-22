import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { merkeziBagla } from './bagla.ts';

const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
};
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('yeni talep formu', () => {
  it('kalemsiz kayıt denemesinden sonra satır doldurulunca talep açılır; ilk deneme istek göndermez', async () => {
    const acilan: { kalemler: { ad: string; miktar: string }[] }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yol = new URL(adres, 'http://x').pathname;
      if (yol.endsWith('/satin-alma-talepleri/ac')) {
        const g = JSON.parse(String(secenek?.body)) as { id: string; baslik: string; kalemler: { id: string; ad: string; miktar: string; birim: string }[] };
        acilan.push(g);
        const t: Talep = {
          id: g.id, no: 'ST-2026-001', baslik: g.baslik, birim: null, talepEdenKisiId: 7, talepEdenAdi: 'Deneme Alıcı', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 7,
          oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'taslak', iptalNedeni: '', agirliklar: null,
          kalemler: g.kalemler.map((k) => ({ id: k.id, katalogId: null, ad: k.ad, ozellik: '', miktar: k.miktar, birim: k.birim, kategori: '' })),
          teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-22T08:00:00.000Z', guncelleme: '2026-10-22T08:00:00.000Z',
        };
        return json(200, t);
      }
      return json(200, acilis);
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(kok.querySelector('#main .loading')).toBeNull());
    kok.querySelector<HTMLElement>('[data-act="new-request"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('#r-title')).not.toBeNull());
    document.querySelector<HTMLInputElement>('#r-title')!.value = 'Deneme talep';
    document.querySelector<HTMLElement>('[data-act="save-request"]')!.click();
    expect(acilan).toHaveLength(0);

    const satir = document.querySelector<HTMLElement>('#items-box tr[data-i]')!;
    satir.querySelector<HTMLInputElement>('[data-it="name"]')!.value = 'Deneme kalem';
    satir.querySelector<HTMLInputElement>('[data-it="qty"]')!.value = '2';
    document.querySelector<HTMLElement>('[data-act="save-request"]')!.click();
    await vi.waitFor(() => expect(acilan).toHaveLength(1));
    expect(acilan[0]!.kalemler).toMatchObject([{ ad: 'Deneme kalem', miktar: '2' }]);
    kapat();
  });
});
