import { afterEach, describe, expect, it } from 'vitest';
import type { Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, bump } from './store.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
import { talepEkrana, talepSunucuya } from './tasiyici.ts';
import { boardHTML, filteredRequests, reqTable, tabItems, talepGovdesi } from './views.ts';
import { kalemAdiParcayla } from './kalem-bagi.ts';
import { poText } from './docs.ts';
import type { OrderInfo } from './calc.ts';
import { rfqText } from './ui.ts';

const K1 = '00000000-0000-4000-8000-000000000011';
const K2 = '00000000-0000-4000-8000-000000000012';
const TALEP: Talep = {
  id: '00000000-0000-4000-8000-000000000101', no: 'ST-2026-001', baslik: 'Deneme kaplama', birim: null, talepEdenKisiId: 5, talepEdenAdi: 'Deneme Kişi', teslimYontemi: null,
  uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5, oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'taslak', iptalNedeni: '', agirliklar: null,
  kalemler: [
    { id: K1, katalogId: null, ad: 'Deneme kaplama hizmeti', ozellik: '', miktar: '40', birim: 'adet', kategori: '' },
    { id: K2, katalogId: null, ad: 'Deneme vida', ozellik: '', miktar: '10', birim: 'adet', kategori: '' },
  ],
  kalemBaglari: [{
    kalemId: K1, uygulanan: { no: 7, kod: 'DNM-7', ad: 'Deneme flanş' },
    fason: { isEmriId: 3, uretimEmriId: 11, emirNo: 'UE-2026-001', opNo: 30, adim: 'Kaplama', firmaId: 4, firmaAdi: 'Deneme Kaplama' },
  }],
  teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1,
  olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
};

afterEach(() => { S.requests = {}; S.ready = false; });

// 2429: hizmet talebinde seçilen parça ve fason adımı satın almaya gelir; kalemin altında ve teklif isteme metninde görünür.
describe('kalem bağları (2429)', () => {
  it('taşıyıcı bağları kaleme koyar, kayıtta geri göndermez', () => {
    const r = talepEkrana(TALEP);
    expect(r.items[0]!.parca).toEqual({ no: 7, kod: 'DNM-7', ad: 'Deneme flanş' });
    expect(r.items[0]!.fason).toEqual({ emirNo: 'UE-2026-001', opNo: 30, adim: 'Kaplama', firmaAdi: 'Deneme Kaplama' });
    expect(r.items[1]!.parca).toBeUndefined();
    expect(JSON.stringify(talepSunucuya(r))).not.toContain('Deneme flanş');
  });

  it('kalemin altında parça ve fason satırı, bağsız kalemde yok', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const el = document.createElement('div');
    el.innerHTML = tabItems(talepEkrana(TALEP));
    const satirlar = [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('[data-sa-kalem-bagi]')].map((s) => s.textContent));
    expect(satirlar).toEqual([['Uygulanacak malzeme: DNM-7 Deneme flanş', 'Fason: UE-2026-001, Op 30 Kaplama, Deneme Kaplama'], []]);
  });

  it('teklif isteme metninde parça ve yapılacak işlem; fason firması, iç emir no ve silinmiş kart numarası gitmez', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const metin = rfqText(talepEkrana(TALEP), '', '2026-10-20');
    expect(metin).toContain('1. Deneme kaplama hizmeti, 40 adet\n   Parça: DNM-7 Deneme flanş\n   İşlem: Op 30 Kaplama\n2. Deneme vida');
    expect(metin).not.toContain('UE-2026-001');
    expect(metin).not.toContain('Deneme Kaplama\n');
    const silinmis = { ...TALEP, kalemBaglari: [{ kalemId: K1, uygulanan: { no: 7, kod: null, ad: null }, fason: null }] };
    expect(rfqText(talepEkrana(silinmis), '', '2026-10-20')).toContain('1. Deneme kaplama hizmeti, 40 adet\n2. Deneme vida');
  });
});

// 2873: satın alma fason hizmet talebinin hangi malzemeye uygulanacağını talebe girmeden, listede ve panoda görür.
describe('uygulanacak malzeme listede (2873)', () => {
  const ozet = (html: string) => {
    const el = document.createElement('div');
    el.innerHTML = html;
    return [...el.querySelectorAll('[data-sa-uygulanan]')].map((s) => s.textContent);
  };
  const ikinci = { ...TALEP.kalemBaglari![0]!, kalemId: K2, uygulanan: { no: 8, kod: 'DNM-8', ad: 'Deneme mil' }, fason: null };

  it('listede ve panoda tek malzeme kod ve adıyla', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true;
    const r = talepEkrana(TALEP);
    S.requests = { [r.id]: r }; bump();
    expect(ozet(reqTable([r]))).toEqual(['Uygulanacak malzeme: DNM-7 Deneme flanş']);
    expect(ozet(boardHTML())).toEqual(['Uygulanacak malzeme: DNM-7 Deneme flanş']);
  });

  it('birden çok malzemede ilki ve kalan sayısı; aynı malzeme bir kez sayılır', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    expect(ozet(reqTable([talepEkrana({ ...TALEP, kalemBaglari: [...TALEP.kalemBaglari!, ikinci] })]))).toEqual(['Uygulanacak malzeme: DNM-7 Deneme flanş +1']);
    const ayni = { ...ikinci, uygulanan: TALEP.kalemBaglari![0]!.uygulanan };
    expect(ozet(reqTable([talepEkrana({ ...TALEP, kalemBaglari: [...TALEP.kalemBaglari!, ayni] })]))).toEqual(['Uygulanacak malzeme: DNM-7 Deneme flanş']);
  });

  it('bağsız talepte satır yok; silinmiş kart numarasıyla', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    expect(ozet(reqTable([talepEkrana({ ...TALEP, kalemBaglari: [] })]))).toEqual([]);
    const silinmis = { ...TALEP, kalemBaglari: [{ kalemId: K1, uygulanan: { no: 7, kod: null, ad: null }, fason: null }] };
    expect(ozet(reqTable([talepEkrana(silinmis)]))).toEqual(['Uygulanacak malzeme: kart 7']);
  });

  it('malzeme adı kaçırılarak basılır', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const kotu = { ...TALEP, kalemBaglari: [{ kalemId: K1, uygulanan: { no: 9, kod: 'X', ad: '<img src=x onerror=alert(1)>' }, fason: null }] };
    const el = document.createElement('div');
    el.innerHTML = reqTable([talepEkrana(kotu)]);
    expect(el.querySelector('img')).toBeNull();
  });
});

// 2875: satın alma uygulanacak malzemeyi karşılaştırmada ve sipariş bölümünde görür; fason firmasına giden sipariş metni
// teklif isteme metniyle aynı satırları taşır (parça ve işlem; fason firması, iç emir no, silinmiş kart numarası gitmez).
describe('uygulanacak malzeme karşılaştırma ve siparişte (2875)', () => {
  const QA = '00000000-0000-4000-8000-000000000201';
  const teklifli: Talep = {
    ...TALEP,
    teklifler: [{ id: QA, firmaId: 3, tedarikciAdi: 'Deneme Tedarik', teklifTarihi: '2026-10-05', gecerlilik: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0',
      nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: null,
      teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0,
      fiyatlar: [{ kalemId: K1, birimFiyat: '100', iskontoYuzdesi: '0', terminGun: null, enAzMiktar: null }, { kalemId: K2, birimFiyat: '5', iskontoYuzdesi: '0', terminGun: null, enAzMiktar: null }] }],
  } as Talep;
  afterEach(() => { V.tab = null; });

  it('karşılaştırma tablosunda bağlı kalemin altında, bağsız kalemde yok', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true;
    const r = talepEkrana(teklifli);
    S.requests = { [r.id]: r }; V.tab = 'compare'; bump();
    const el = document.createElement('div');
    el.innerHTML = talepGovdesi(r);
    const satirlar = [...el.querySelectorAll('table.matrix tr')].filter((tr) => /Deneme (kaplama hizmeti|vida)/.test(tr.textContent ?? ''))
      .map((tr) => [...tr.querySelectorAll('[data-sa-uygulanan]')].map((x) => x.textContent));
    expect(satirlar).toEqual([['Uygulanacak malzeme: DNM-7 Deneme flanş'], []]);
  });

  it('sipariş bölümünde kalem adının yanında', () => {
    const r = talepEkrana(TALEP);
    expect(r.items.map(kalemAdiParcayla)).toEqual(['Deneme kaplama hizmeti (DNM-7 Deneme flanş)', 'Deneme vida']);
  });

  it('sipariş metninde parça ve işlem; fason firması ve iç emir no yok', () => {
    S.settings = { ...DEFAULT_SETTINGS }; S.ready = true; bump();
    const r = talepEkrana(teklifli);
    const o = { qid: QA, q: r.quotes[0]!, supplierId: '', items: r.items, orderNo: 'SA-1', poNo: '', orderDate: '', expectedDate: '', deliveredDate: '', quality: '', excess: [], logo: null } as unknown as OrderInfo;
    const metin = poText(r, o);
    expect(metin).toMatch(/1\. Deneme kaplama hizmeti: 40 adet × [^\n]+\n {3}Parça: DNM-7 Deneme flanş\n {3}İşlem: Op 30 Kaplama\n2\. Deneme vida: /);
    expect(metin).not.toContain('UE-2026-001');
    expect(metin).not.toContain('Deneme Kaplama');
  });
});

// 2875: talep listesi araması uygulanacak malzemenin kodu ve adıyla da bulur.
describe('talep araması uygulanacak malzemeyle (2875)', () => {
  afterEach(() => { V.q = ''; V.status = 'open'; });
  it('kodla ve adla bulur, bağsız talep gelmez', () => {
    const r = talepEkrana(TALEP);
    const bagsiz = talepEkrana({ ...TALEP, id: '00000000-0000-4000-8000-000000000102', no: 'ST-2026-002', kalemBaglari: [] });
    S.requests = { [r.id]: r, [bagsiz.id]: bagsiz }; V.status = 'all';
    V.q = 'dnm-7'; expect(filteredRequests().map((x) => x.no)).toEqual(['ST-2026-001']);
    V.q = 'flanş'; expect(filteredRequests().map((x) => x.no)).toEqual(['ST-2026-001']);
  });
});
