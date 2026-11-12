import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep, Teklif } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { talepEkrana } from './tasiyici.ts';
import { ekranliBagla, talepSatiri } from './test-ekrani.ts';

// 3100: kg stoklu çubukta sunucunun verdiği yaklaşık adet merkezde kalem satırının altında görünür; karşılığı olmayan kalemde görünmez.
const K1 = '00000000-0000-4000-8000-0000000003c1';
const K2 = '00000000-0000-4000-8000-0000000003c2';
const QA = '00000000-0000-4000-8000-0000000003a1';
const QB = '00000000-0000-4000-8000-0000000003b1';
const teklif = (id: string, firmaId: number, ad: string, fiyat: string): Teklif => ({
  id, firmaId, tedarikciAdi: ad, teklifTarihi: '2026-10-05', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
  nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: 12,
  teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId: K1, birimFiyat: fiyat }, { kalemId: K2, birimFiyat: fiyat }],
});
const t: Talep = {
  id: '00000000-0000-4000-8000-000000000301', no: 'ST-2026-003', baslik: 'Deneme kg talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'degerlendirme', iptalNedeni: '', agirliklar: null,
  kalemler: [
    { id: K1, katalogId: null, ad: 'Deneme çubuk', ozellik: '', miktar: '10', birim: 'kg', kategori: '' },
    { id: K2, katalogId: null, ad: 'Deneme levha', ozellik: '', miktar: '7', birim: 'kg', kategori: '' },
  ],
  kalemKarsiliklari: [{ kalemId: K1, miktar: '4', birim: 'adet' }],
  teklifIstekleri: [], teklifler: [teklif(QA, 3, 'Deneme A', '100'), teklif(QB, 4, 'Deneme B', '150')],
  karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
};
const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [t], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

// Kalemin miktar satırı ("10 kg ...") hangi öğede yazıyorsa onlar; karşılık aynı öğenin içindedir.
// Paylaştırma tablosu (.simt) kapsam dışıdır: Kurgu ve ön izlemede orada karşılık yok.
const miktarSatirlari = (kok: ParentNode, miktar: string) =>
  [...kok.querySelectorAll<HTMLElement>('.sub')].filter((e) => !e.closest('table.simt')).map((e) => e.textContent ?? '').filter((s) => s.startsWith(miktar));

describe('3100 merkezde kalem karşılığı', () => {
  it('taşıyıcı sunucunun karşılığını yalnız kendi kalemine yazar', () => {
    const r = talepEkrana(t);
    expect(r.items.map((i) => i.karsilik ?? null)).toEqual(['≈ 4 adet', null]);
    expect(talepEkrana({ ...t, kalemKarsiliklari: undefined }).items.every((i) => i.karsilik === undefined)).toBe(true);
  });

  it('teklif karşılaştırma ve karar dağılımı satırında karşılığı olan kalemde "≈ 4 adet" görünür, olmayanda görünmez', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(acilis), { status: 200, headers: { 'content-type': 'application/json' } })));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(talepSatiri(kok, t.id)).not.toBeNull());
    talepSatiri(kok, t.id)!.click();
    await vi.waitFor(() => expect(kok.querySelector('.sa-karar')).not.toBeNull());

    // Karşılaştırma tablosu ve (kapalı ayrıntıdaki) dağılım düzenleyicisi: ikisi de çubuğun satırını yazar.
    const cubuk = miktarSatirlari(kok, '10 kg');
    expect(cubuk.length).toBeGreaterThanOrEqual(2);
    expect(cubuk.every((s) => s.includes('(≈ 4 adet)'))).toBe(true);
    expect(kok.querySelector('details.sa-detay')?.textContent).toContain('10 kg (≈ 4 adet)');
    const levha = miktarSatirlari(kok, '7 kg');
    expect(levha.length).toBeGreaterThanOrEqual(2);
    expect(levha.some((s) => s.includes('≈'))).toBe(false);
    kapat();
  });
});
