import { describe, expect, it, vi } from 'vitest';
import type { Talep, Tedarikci } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { backend } from './store.ts';
import { pasifEki } from './calc.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { katalogSunucuya, tedarikciEkrana, talepEkrana, talepSunucuya, transport } from './tasiyici.ts';
import { S } from './store.ts';
import { uid } from './util.ts';

const K1 = '00000000-0000-4000-8000-000000000011';
const K2 = '00000000-0000-4000-8000-000000000012';
const QA = '00000000-0000-4000-8000-0000000000a1';
const QB = '00000000-0000-4000-8000-0000000000b1';

// Sunucunun sade biçimde gönderdiği (sondaki sıfırsız) her alanı dolu bir talep.
const TALEP: Talep = {
  id: '00000000-0000-4000-8000-000000000001', no: 'ST-2026-001', baslik: 'Deneme bakım sarfı', birim: 'Bakım', talepEdenKisiId: 5, talepEdenAdi: 'Deneme Zeynep', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null,
  acanKisiId: 5, oncelik: 'acil', ihtiyacTarihi: '2026-10-22', notlar: 'Not', durum: 'siparis_verildi', iptalNedeni: '',
  agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 },
  kalemler: [
    { id: K1, katalogId: null, ad: 'Rulman', ozellik: 'SKF', miktar: '40', birim: 'adet', kategori: 'Bakım' },
    { id: K2, katalogId: '00000000-0000-4000-8000-0000000000c1', ad: 'Gres', ozellik: '', miktar: '36.5', birim: 'kg', kategori: '' },
  ],
  teklifIstekleri: [{ firmaId: 3, gonderim: '2026-10-01', sonTarih: '2026-10-04' }, { firmaId: 4, gonderim: '2026-10-01', sonTarih: null }],
  teklifler: [
    { id: QA, firmaId: 3, tedarikciAdi: 'Deneme A', teklifTarihi: '2026-10-05', gecerlilik: '2026-10-20', paraBirimi: 'USD', kur: '41.25', iskontoYuzdesi: '2.5',
      nakliye: '450', digerMasraf: '12.75', teslimSekli: 'Fabrikamıza teslim', nakliyeDahil: false, terminGun: 7, vadeGun: 60, avansYuzdesi: '30', garantiAy: 12,
      teknikUygun: true, notlar: 'n', ilkToplam: '1200', revizyon: 1, fiyatlar: [{ kalemId: K1, birimFiyat: '10.5' }, { kalemId: K2, birimFiyat: '7.125' }] },
    { id: QB, firmaId: 4, tedarikciAdi: 'Deneme B', teklifTarihi: '2026-10-06', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
      nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: null, vadeGun: 0, avansYuzdesi: '0', garantiAy: null,
      teknikUygun: false, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId: K1, birimFiyat: '420' }] },
  ],
  karar: {
    mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: K1, teklifId: QB }, { kalemId: K2, teklifId: QA }], gerekce: 'Termin', kararVerenKisiId: 7, kararVerenAdi: 'Deneme Karar Veren',
    kararTarihi: '2026-10-06', ogrenilenler: 'Ambalaj', sabitKurlar: [{ paraBirimi: 'USD', kur: '41.5' }],
    siparisler: [
      { teklifId: QA, no: 'SP-2026-001', siparisNo: 'SA-1', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-14', teslimDurumu: 'tamam', kalite: 'kismi_sorun', logo: { durum: 'gonderildi', kayitNo: '4711', hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null },
        satirlar: [{ id: 11, kalemId: K2, miktar: '36.5', birim: 'kg', teslimAlinan: '36.5', sonTeslimTarihi: '2026-10-13', fazlaTeslim: null }] },
      { teklifId: QB, no: 'SP-2026-002', siparisNo: 'SA-2', siparisTarihi: '2026-10-07', beklenenTeslim: null, teslimDurumu: 'bekleniyor', kalite: null, logo: null,
        satirlar: [{ id: 12, kalemId: K1, miktar: '40', birim: 'adet', teslimAlinan: null, sonTeslimTarihi: null, fazlaTeslim: null }] },
    ],
  },
  onaylar: [{ id: '00000000-0000-4000-8000-0000000000d1', zaman: '2026-10-06T10:00:00.000Z', kisiId: 9, kisiAdi: 'Deneme Müdür', sonuc: 'onay', dortGozsuz: false, notlar: 'Uygun' }],
  hareketler: [{ id: '00000000-0000-4000-8000-0000000000e1', zaman: '2026-10-01T08:00:00.000Z', kisiId: 5, kisiAdi: 'Deneme Zeynep', metin: 'Talep açıldı' }],
  senaryolar: [{ id: '00000000-0000-4000-8000-0000000000f1', ad: 'Yarı yarıya', kisiId: 7, kisiAdi: 'Deneme Ayşe', olusturma: '2026-10-05T09:00:00.000Z',
    paylar: [{ kalemId: K1, teklifId: QA, miktar: '20' }, { kalemId: K1, teklifId: QB, miktar: '20' }], dengeler: [{ kalemId: K1, denge: null }] }],
  surum: 4, olusturma: '2026-10-01T08:00:00.000Z', guncelleme: '2026-10-07T08:00:00.000Z',
};

describe('TMI taşıyıcısı', () => {
  it('V-33: talep ekran biçimine ve geri çevrilince sunucunun kendi alanları dışında aynı döner (müdür onayı 403 hatasının kalıcı koruması)', () => {
    const geri = talepSunucuya(talepEkrana(TALEP));
    const { no: _n, talepEdenAdi: _a, teslimYontemi: _y, uretimEmriNo: _u, acanKisiId: _k, surum: _s, olusturma: _o, guncelleme: _g, onaylar, hareketler, senaryolar, ...beklenen } = TALEP;
    const { onaylar: gOnay, hareketler: gHareket, senaryolar: gSenaryo, ...gelen } = geri;
    // Siparişte yalnız satın almanın alanları geri gider (teslim ve kalite stoktan ve GKK'dan okunur).
    // Karar verenin adı yalnız çıkışta gelir; sunucuya karar veren kişi kimliği gider, ad gitmez.
    const yalniz = (k: typeof beklenen.karar) => k && { ...k, kararVerenAdi: undefined, siparisler: k.siparisler.map(({ teklifId, siparisNo, siparisTarihi, beklenenTeslim }) => ({ teklifId, siparisNo, siparisTarihi, beklenenTeslim })) };
    expect(gelen).toEqual({ ...beklenen, karar: yalniz(beklenen.karar) });
    // Yalnız eklenen kayıtlarda kişi ve zaman sunucunundur: kimlik, sonuç ve metin korunur.
    expect(gOnay.map((o) => [o.id, o.sonuc, o.notlar])).toEqual(onaylar.map((o) => [o.id, o.sonuc, o.notlar]));
    expect(gHareket.map((h) => [h.id, h.metin])).toEqual(hareketler.map((h) => [h.id, h.metin]));
    expect(gSenaryo.map((s) => [s.id, s.ad, s.paylar, s.dengeler])).toEqual(senaryolar.map((s) => [s.id, s.ad, s.paylar, s.dengeler]));
  });

  it("SAT-38: teslim tarihi stoktan (yalnız tamamlanınca), kalite GKK'dan ekrana eşlenir; sunucuya teslim bilgisi gitmez", () => {
    const r = talepEkrana(TALEP);
    expect(r.award?.mode).toBe('split');
    expect(r.award?.orders?.[QA]).toEqual({
      orderNo: 'SP-2026-001', poNo: 'SA-1', orderDate: '2026-10-07', expectedDate: '2026-10-14', deliveredDate: '2026-10-13', quality: 'partial', excess: [],
      logo: { durum: 'gonderildi', kayitNo: '4711', hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null },
    });
    const tek = talepEkrana({ ...TALEP, karar: { ...TALEP.karar!, mod: 'tek', teklifId: QA, bolunme: [], siparisler: [TALEP.karar!.siparisler[0]!] } });
    expect([tek.award?.mode, tek.award?.orderNo, tek.award?.poNo, tek.award?.quality]).toEqual(['single', 'SP-2026-001', 'SA-1', 'partial']);
    expect(talepSunucuya(tek).karar?.siparisler).toEqual([{ teklifId: QA, siparisNo: 'SA-1', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-14' }]);
    // Kısmi ya da bekleyen siparişte teslim tarihi boş görünür.
    expect(r.award?.orders?.[QB]?.deliveredDate).toBe('');
  });

  it('B-001: karar veren ekranda kişi no değil adıyla görünür; adı olmayan kararda boş; sunucuya ad gitmez', () => {
    expect(talepEkrana(TALEP).award?.by).toBe('Deneme Karar Veren');
    expect(talepEkrana({ ...TALEP, karar: { ...TALEP.karar!, kararVerenAdi: null } }).award?.by).toBe('');
    const geri = talepSunucuya(talepEkrana(TALEP)).karar;
    expect(geri?.kararVerenKisiId).toBe(7);
    expect(geri).not.toHaveProperty('kararVerenAdi');
  });

  it('SH1 a: kalanı aşan teslim sipariş satırında "fazla teslim" olarak ekrana gelir; sunucuya gitmez', () => {
    const asan = { ...TALEP.karar!.siparisler[0]!, satirlar: [{ ...TALEP.karar!.siparisler[0]!.satirlar[0]!, teslimAlinan: '38', fazlaTeslim: '1.5' }] };
    const tek = talepEkrana({ ...TALEP, karar: { ...TALEP.karar!, mod: 'tek', teklifId: QA, bolunme: [], siparisler: [asan] } });
    expect(tek.award?.excess).toEqual([{ item: 'Gres', qty: 1.5, unit: 'kg' }]);
    const bol = talepEkrana({ ...TALEP, karar: { ...TALEP.karar!, siparisler: [asan, TALEP.karar!.siparisler[1]!] } });
    expect([bol.award?.orders?.[QA]?.excess, bol.award?.orders?.[QB]?.excess]).toEqual([[{ item: 'Gres', qty: 1.5, unit: 'kg' }], []]);
    expect(talepSunucuya(tek).karar?.siparisler).toEqual([{ teklifId: QA, siparisNo: 'SA-1', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-14' }]);
  });

  it('Borç 36: siparişteki kalem değişikliği ayrı komutla, son sürüm ve gerekçeyle gider; sunucu reddederse false döner', async () => {
    const fetchSahte = vi.fn(async () => new Response(JSON.stringify(TALEP), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchSahte);
    try {
      talepEkrana(TALEP);
      expect(await backend.siparisKalemiDegistir(TALEP.id, K1, 42.5, 'adet', 'İhtiyaç arttı')).toBe(true);
      const [url, istek] = fetchSahte.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`/api/satin-alma-talepleri/${TALEP.id}/siparis-kalemi-degistir`);
      expect(JSON.parse(String(istek.body))).toEqual({ kalemId: K1, miktar: '42.5', birim: 'adet', gerekce: 'İhtiyaç arttı', surum: 4 });
      fetchSahte.mockImplementation(async () => new Response(JSON.stringify({ hata: { kod: 'YETKI_YOK', ileti: 'Yetkiniz yok.' } }), { status: 403, headers: { 'content-type': 'application/json' } }));
      expect(await backend.siparisKalemiDegistir(TALEP.id, K1, 1, 'adet', 'x')).toBe(false);
      expect(await backend.siparisKalemiDegistir('00000000-0000-4000-8000-000000000999', K1, 1, 'adet', 'x')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('D6 b: sipariş faturaları siparişin anahtarıyla okunur; bağ istek kimliğiyle gider, ağ kopunca aynı kimlikle yinelenir; sunucu reddederse null döner', async () => {
    const LISTE = { faturalar: [{ id: 7, belgeNo: 'DN-1', belgeTarihi: '2026-10-09', aciklama: null, bagli: true, baskaSipariste: false }] };
    const cevap = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
    const fetchSahte = vi.fn(async () => cevap(LISTE));
    vi.stubGlobal('fetch', fetchSahte);
    try {
      expect(await backend.siparisFaturalari(TALEP.id, QA)).toEqual(LISTE.faturalar);
      expect(String((fetchSahte.mock.calls[0] as unknown as [string])[0])).toBe(`/api/satin-alma-siparis-faturalari?talepId=${TALEP.id}&teklifId=${QA}`);
      fetchSahte.mockReset();
      fetchSahte.mockImplementationOnce(async () => { throw new TypeError('ağ koptu'); }).mockImplementation(async () => cevap(LISTE));
      expect(await backend.siparisFaturasiBagla(TALEP.id, QA, 7, true)).toEqual(LISTE.faturalar);
      const istekler = fetchSahte.mock.calls.map((c) => c as unknown as [string, RequestInit]);
      expect(istekler.length).toBe(2);
      expect(istekler[0]![0]).toBe(`/api/satin-alma-talepleri/${TALEP.id}/siparis-faturasi`);
      expect(JSON.parse(String(istekler[0]![1].body))).toEqual({ teklifId: QA, belgeId: 7, bagla: true });
      const kimlikler = istekler.map(([, i]) => new Headers(i.headers).get(ISTEK_KIMLIGI_BASLIGI));
      expect(kimlikler[0]).toBeTruthy();
      expect(kimlikler[1]).toBe(kimlikler[0]);
      fetchSahte.mockImplementation(async () => cevap({ hata: { kod: 'GECERSIZ', ileti: 'Fatura başka bir siparişe bağlı; önce oradan kaldırın.' } }, 422));
      expect(await backend.siparisFaturasiBagla(TALEP.id, QA, 7, true)).toBeNull();
      expect(await backend.siparisFaturalari(TALEP.id, QA)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('S-03: düz http bağlamında (randomUUID yok) ekran kimliği yine üretilir, v4 biçiminde', () => {
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => b.fill(7) });
    try {
      expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('S-07 ve S-09: ağ kopunca yeni talep ekranda kalır, uyarı görünür; aynı kimlik ve aynı gövdeyle yeniden gider, gidince uyarı kalkar', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<span id="kayit-uyari" hidden></span>';
    // talepEkrana kimliği "sunucuda var" diye işaretler; ekran verisi yeni kimlikle kopyalanınca talep sunucuda yoktur (açma yolu).
    const yeni = { ...talepEkrana(TALEP), id: '00000000-0000-4000-8000-000000000778', status: 'draft' as const };
    let kopuk = true;
    const istekler: { kimlik: string | null; govde: string }[] = [];
    const fetchSahte = vi.fn(async (_url: string, i: RequestInit) => {
      istekler.push({ kimlik: new Headers(i.headers).get(ISTEK_KIMLIGI_BASLIGI), govde: String(i.body) });
      if (kopuk) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ ...TALEP, id: yeni.id, durum: 'taslak' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchSahte);
    try {
      S.requests[yeni.id] = yeni;
      transport.write('requests', yeni.id, yeni);
      await vi.advanceTimersByTimeAsync(3_500);
      expect(istekler.length).toBeGreaterThanOrEqual(3);
      expect(document.getElementById('kayit-uyari')!.hidden).toBe(false);
      expect(S.requests[yeni.id]).toBeDefined();
      kopuk = false;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(document.getElementById('kayit-uyari')!.hidden).toBe(true);
      expect(new Set(istekler.map((x) => x.kimlik)).size).toBe(1);
      expect(new Set(istekler.map((x) => x.govde)).size).toBe(1);
      expect(S.requests[yeni.id]?.status).toBe('draft');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('S-07: sunucu reddederse (4xx) yeniden denenmez, ekran sunucudan yeniden yüklenir', async () => {
    const yollar: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      yollar.push(url);
      return new Response(JSON.stringify({ hata: { kod: 'GECERSIZ', ileti: 'Olmaz.' } }), { status: 422, headers: { 'content-type': 'application/json' } });
    }));
    try {
      talepEkrana(TALEP);
      transport.write('requests', TALEP.id, talepEkrana(TALEP));
      await vi.waitFor(() => expect(yollar).toContain('/api/satin-alma-acilis'));
      expect(yollar.filter((u) => u.endsWith('/kaydet'))).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Değer eşlemesi: durum, öncelik ve sayılar; TRY teklifinde kur gönderilmez', () => {
    const r = talepEkrana(TALEP);
    expect([r.status, r.priority, r.items[1]?.qty, r.quotes[0]?.prices[K2], r.quotes[0]?.fxRate]).toEqual(['ordered', 'urgent', 36.5, 7.125, 41.25]);
    const g = talepSunucuya({ ...r, quotes: r.quotes.map((q) => ({ ...q, currency: 'TRY', fxRate: 5 })) });
    expect(g.teklifler.every((q) => q.kur === null)).toBe(true);
  });

  it('SA2 b: katalog kalemi karta bağlı yazılır; ad, kategori ve birim sunucuya gitmez, kartsız kalem yazılmaz', () => {
    const m = { id: K1, code: 'HM-00001', name: 'Karttaki ad', category: 'Metal', unit: 'kg', spec: 'SKF', notes: 'Not', aliases: ['6205'], createdAt: 1, malzemeNo: 7 };
    expect(katalogSunucuya(m, 3)).toEqual({ id: K1, malzemeNo: 7, ozellik: 'SKF', notlar: 'Not', takmaAdlari: ['6205'], surum: 3 });
    expect(() => katalogSunucuya({ ...m, malzemeNo: undefined }, null)).toThrow('malzeme kartına');
  });

  it('SAT-41 S5 a: finansta pasif firma ekrana active:false gelir; seçim listelerinde adın yanına (pasif) yazılır, aktifte ve bilinmeyende yazılmaz', () => {
    const ted: Tedarikci = {
      firmaId: 3, ad: 'Deneme Tedarik', vergiNo: null, yetkili: null, telefon: null, eposta: null, sehir: null, firmaAktif: true, firmaSurum: 2,
      durum: 'onayli', kaliteDurumu: null, puan: 4, notlar: '', kategoriler: [], degerlendirmeler: [], surum: 1, olusturma: '2026-10-01T08:00:00.000Z',
    };
    const aktif = tedarikciEkrana(ted);
    const pasif = tedarikciEkrana({ ...ted, firmaId: 4, firmaAktif: false });
    expect([aktif.active, pasif.active]).toEqual([true, false]);
    expect([pasifEki(aktif), pasifEki(pasif), pasifEki({})]).toEqual(['', ' (pasif)', '']);
  });

  it('236 a: ekranın tedarikçi durumu Kalite Merkezi onayından türer; Aday ve Askıda askıda işaretlenir, kaydı olmayan onaylı sayılır', () => {
    const ted: Tedarikci = {
      firmaId: 5, ad: 'Deneme Kalite', vergiNo: null, yetkili: null, telefon: null, eposta: null, sehir: null, firmaAktif: true, firmaSurum: 1,
      durum: 'askida', kaliteDurumu: null, puan: 3, notlar: '', kategoriler: [], degerlendirmeler: [], surum: 1, olusturma: '2026-10-01T08:00:00.000Z',
    };
    const durumu = (kaliteDurumu: Tedarikci['kaliteDurumu']) => { const e = tedarikciEkrana({ ...ted, kaliteDurumu }); return [e.status, e.kaliteDurumu]; };
    // Satın almanın eski durum sütunu (burada askida) ekranın durumunu belirlemez.
    expect(durumu(null)).toEqual(['approved', null]);
    expect(durumu('Onaylı')).toEqual(['approved', 'Onaylı']);
    expect(durumu('Şartlı onaylı')).toEqual(['trial', 'Şartlı onaylı']);
    expect(durumu('Aday')).toEqual(['suspended', 'Aday']);
    expect(durumu('Askıda')).toEqual(['suspended', 'Askıda']);
  });
});
