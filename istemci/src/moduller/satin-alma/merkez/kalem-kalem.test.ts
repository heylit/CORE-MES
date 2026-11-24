import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep, Teklif } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, talepSatiri } from './test-ekrani.ts';

const K1 = '00000000-0000-4000-8000-0000000000c1';
const K2 = '00000000-0000-4000-8000-0000000000c2';
const QA = '00000000-0000-4000-8000-0000000000a1';
const QB = '00000000-0000-4000-8000-0000000000b1';
const teklif = (id: string, firmaId: number, ad: string, fiyat: string, ek: Partial<Teklif['fiyatlar'][number]> = {}): Teklif => ({
  id, firmaId, tedarikciAdi: ad, teklifTarihi: '2026-10-05', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
  nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 0, avansYuzdesi: '0', garantiAy: 12,
  teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0,
  fiyatlar: [{ kalemId: K1, birimFiyat: fiyat, ...ek }, { kalemId: K2, birimFiyat: fiyat }],
});
const talep = (ek: Partial<Talep> = {}): Talep => ({
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme talep', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'degerlendirme', iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: K1, katalogId: null, ad: 'Deneme kalem', ozellik: '', miktar: '10', birim: 'adet', kategori: '' }, { id: K2, katalogId: null, ad: 'Bağlı kalem', ozellik: '', miktar: '5', birim: 'adet', kategori: '' }],
  teklifIstekleri: [], teklifler: [teklif(QA, 3, 'Deneme A', '100', { enAzMiktar: '5' }), teklif(QB, 4, 'Deneme B', '150')],
  karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
  kalemBaglari: [{ kalemId: K2, uygulanan: null, fason: null }],
  ...ek,
});
const acilis = (t: Talep, islemler?: string[]): AcilisCevabi => ({
  kullanici: { id: 7, ad: 'Deneme Alıcı', ...(islemler ? { islemler } : {}) }, talepler: [t], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
  },
} as AcilisCevabi);

type Istek = { yol: string; govde: unknown };
function sunucu(t: Talep, zarf: unknown[] = []): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (yol: string, init?: RequestInit) => {
    const govde = init?.body ? JSON.parse(String(init.body)) : null;
    istekler.push({ yol: String(yol), govde });
    const cevap = String(yol).includes('/kalem-zarflari') ? { kalemler: zarf }
      : String(yol).includes('/kaydet') ? { ...(govde as Talep), id: t.id, no: t.no, surum: (govde as Talep).surum + 1 } : acilis(t);
    return new Response(JSON.stringify(cevap), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return istekler;
}
async function ac(t: Talep): Promise<{ kok: HTMLElement; kapat: () => void }> {
  const kok = document.createElement('div');
  document.body.append(kok);
  const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
  await vi.waitFor(() => expect(talepSatiri(kok, t.id)).not.toBeNull());
  talepSatiri(kok, t.id)!.click();
  await vi.waitFor(() => expect(kok.querySelector('[data-sa-karar-matrisi]')).not.toBeNull());
  return { kok, kapat };
}
const yaz = (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('3442-5 kalem kalem karşılaştırma ve bölme', () => {
  it('karar tablosunda kalem başına tedarikçi fiyatları görünür; bağlı kalemde Böl yoktur ve nedeni yazılır', async () => {
    const t = talep();
    sunucu(t);
    const { kok, kapat } = await ac(t);
    const k1 = kok.querySelector<HTMLElement>(`.sa-kr-genis [data-kr-kalem="${K1}"]`)!;
    expect(k1.querySelectorAll('[data-act="kr-ata"]')).toHaveLength(2);
    const secili = k1.querySelector<HTMLElement>('[data-act="kr-ata"][aria-pressed="true"]')!;
    expect(secili.dataset.qid).toBe(QA);
    expect(secili.textContent).toContain('en ucuz');
    expect(k1.querySelector('[data-act="kk-bol"]')).not.toBeNull();
    const k2 = kok.querySelector<HTMLElement>(`.sa-kr-genis [data-kr-kalem="${K2}"]`)!;
    expect(k2.querySelector('[data-act="kk-bol"]')).toBeNull();
    expect(k2.textContent).toContain('bağlı kalem bölünemez');
    kapat();
  });

  it('Böl: toplam eşit olmadan bölünmez; eşitlenince kalem iki satıra ayrılır, karar göndermez; çubuktan bölünmüş karar onaya gider', async () => {
    const t = talep();
    const istekler = sunucu(t);
    const { kok, kapat } = await ac(t);
    kok.querySelector<HTMLElement>(`.sa-kr-genis [data-act="kk-bol"][data-item="${K1}"]`)!.click();
    const dugme = document.querySelector<HTMLButtonElement>('[data-act="kk-bol-yes"]')!;
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>('#kk-kabul')?.dataset.kkKabul).toBe('tamam'));
    const a = document.querySelector<HTMLInputElement>(`[data-kk-q="${QA}"]`)!, b = document.querySelector<HTMLInputElement>(`[data-kk-q="${QB}"]`)!;
    expect(a.value).toBe('10');
    expect(dugme.disabled).toBe(true);
    yaz(a, '6'); yaz(b, '3');
    expect(dugme.disabled).toBe(true);
    expect(document.querySelector('#kk-ozet')!.textContent).toContain('eşit değil');
    yaz(a, '4'); yaz(b, '6');
    // Pay en az miktarın altında: sipariş en az miktarla verilir, uyarılır (1099 a).
    expect(document.querySelector('#kk-ozet')!.textContent).toContain('en az 5');
    yaz(a, '5'); yaz(b, '5');
    expect(dugme.disabled).toBe(false);
    // Pay en az miktarda kaldığı için birim tam kalemdekiyle aynı; kademe notu yalnız fiyat farklıysa yazılır.
    expect(document.querySelector('[data-kk-kademe]')).toBeNull();
    expect(dugme.textContent).toBe('Böl');
    dugme.click();
    await vi.waitFor(() => expect(istekler.some((i) => i.yol.endsWith('/kaydet'))).toBe(true));
    const g = istekler.find((i) => i.yol.endsWith('/kaydet'))!.govde as Talep;
    const bolunen = g.kalemler.filter((x) => x.ad === 'Deneme kalem');
    expect(bolunen.map((x) => Number(x.miktar))).toEqual([5, 5]);
    expect(bolunen.some((x) => x.id === K1)).toBe(false);
    expect(g.kalemler.find((x) => x.id === K2)?.miktar).toBe('5');
    expect(g.karar).toBeNull();
    expect(g.durum).toBe('degerlendirme');
    expect(g.hareketler.at(-1)?.metin).toContain('Deneme kalem 10 → 5 Deneme A + 5 Deneme B');
    // Bölünen satırlar tabloda kendi tedarikçisinde seçili; gönderim çubuktan.
    await vi.waitFor(() => expect(kok.querySelector(`.sa-kr-genis [data-kr-kalem="${bolunen[1]!.id}"]`)).not.toBeNull());
    expect(kok.querySelector<HTMLElement>(`.sa-kr-genis [data-act="kr-ata"][data-item="${bolunen[0]!.id}"][aria-pressed="true"]`)?.dataset.qid).toBe(QA);
    expect(kok.querySelector<HTMLElement>(`.sa-kr-genis [data-act="kr-ata"][data-item="${bolunen[1]!.id}"][aria-pressed="true"]`)?.dataset.qid).toBe(QB);
    const gerekce = kok.querySelector<HTMLTextAreaElement>('[data-kr-gerekce]')!;
    yaz(gerekce as unknown as HTMLInputElement, 'Termin riski');
    const once = istekler.length;
    kok.querySelector<HTMLElement>('[data-kr-cubuk] [data-act="kr-gonder"]')!.click();
    await vi.waitFor(() => expect(istekler.slice(once).some((i) => i.yol.endsWith('/kaydet'))).toBe(true));
    const g2 = istekler.slice(once).find((i) => i.yol.endsWith('/kaydet'))!.govde as Talep;
    expect(g2.karar?.mod).toBe('bolunmus');
    expect(g2.karar?.bolunme).toEqual(expect.arrayContaining([{ kalemId: bolunen[0]!.id, teklifId: QA }, { kalemId: bolunen[1]!.id, teklifId: QB }]));
    expect(g2.durum).toBe('onayda');
    kapat();
  });

  it('kabul sınırı daraltılmış kalem bölünmez', async () => {
    const t = talep();
    sunucu(t, [{ kalemId: K1, malzemeNo: 9, kabul: { yalnizAyni: true, sartliKabul: false, kaliteler: null, durumlar: null, payMm: null }, zarf: { kaliteler: [], durumlar: [], payMm: null } }]);
    const { kok, kapat } = await ac(t);
    kok.querySelector<HTMLElement>(`.sa-kr-genis [data-act="kk-bol"][data-item="${K1}"]`)!.click();
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>('#kk-kabul')?.dataset.kkKabul).toBe('red'));
    yaz(document.querySelector<HTMLInputElement>(`[data-kk-q="${QA}"]`)!, '5'); yaz(document.querySelector<HTMLInputElement>(`[data-kk-q="${QB}"]`)!, '5');
    expect(document.querySelector<HTMLButtonElement>('[data-act="kk-bol-yes"]')!.disabled).toBe(true);
    expect(document.querySelector('#kk-kabul')!.textContent).toContain('kabul sınırını daraltmış');
    kapat();
  });

  it('onaylanmış kararda Böl kapalıdır', async () => {
    // Önceki testlerin talebi (sürüm 2) bellekte kalır; ayrı kimlik.
    const t = talep({
      id: '00000000-0000-4000-8000-000000000102', no: 'ST-2026-002', durum: 'onayda',
      karar: { mod: 'tek', teklifId: QA, bolunme: [], gerekce: '', kararVerenKisiId: 7, kararVerenAdi: 'Deneme Alıcı', kararTarihi: '2026-10-12', ogrenilenler: '', sabitKurlar: [], siparisler: [], kurKilidi: null },
      onaylar: [{ id: '00000000-0000-4000-8000-0000000000e1', zaman: '2026-10-12T09:00:00.000Z', kisiId: 8, kisiAdi: 'Deneme Onaylayan', sonuc: 'onay', dortGozsuz: false, notlar: '' }],
    });
    sunucu(t);
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(talepSatiri(kok, t.id)).not.toBeNull());
    talepSatiri(kok, t.id)!.click();
    await vi.waitFor(() => expect(kok.querySelector('.sa-adim-govde')).not.toBeNull());
    // Onaylı talep sipariş adımında açılır; karşılaştırma adımına adım şeridindeki gibi geçilir.
    const git = document.createElement('button');
    git.dataset.act = 'tab'; git.dataset.tab = 'compare';
    kok.querySelector('.sa-adim-govde')!.append(git);
    git.click();
    await vi.waitFor(() => expect(kok.querySelector('[data-sa-karar-matrisi]')).not.toBeNull());
    expect(kok.querySelector('[data-act="kk-bol"]')).toBeNull();
    expect(kok.querySelector<HTMLButtonElement>(`.sa-kr-genis [data-act="kr-ata"][data-item="${K1}"]`)!.disabled).toBe(true);
    expect(kok.querySelector('[data-kr-kilit]')!.textContent).toContain('Onaylanmış karar değişmez');
    kapat();
  });
});
