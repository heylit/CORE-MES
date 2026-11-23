import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ekranliBagla, sekme, talepSatiri } from './test-ekrani.ts';
import { acilisOku, merkezAc } from './bagla.ts';
import { jobs } from './roles.ts';
import { nextStep } from './views.ts';
import type { PurchaseRequest } from './tipler.ts';

// 3467: Teklif al adımının girişleri, e-posta taslağının kenar durumları, form yolu ve taslağın sıfırlanması.
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
const ted = (firmaId: number, ad: string, eposta: string | null) => ({
  firmaId, ad, vergiNo: null, yetkili: null, telefon: null, eposta, sehir: null, firmaAktif: true, firmaSurum: null,
  durum: 'aktif', kaliteDurumu: null, puan: null, notlar: '', kategoriler: [], degerlendirmeler: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z',
}) as unknown as AcilisCevabi['tedarikciler'][number];
const POSTALI = ted(41, 'ORN- Postalı Tedarikçi', 'orn@ornek.invalid');
const POSTASIZ = ted(42, 'ORN- Postasız Tedarikçi', null);
const talep = (id: string, no: string, durum: Talep['durum'], ek: Partial<Talep> = {}): Talep => ({
  id, no, baslik: `ORN- ${no}`, birim: null, talepEdenKisiId: 5, talepEdenAdi: 'ORN- Kişi', teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null, acanKisiId: 5,
  oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum, iptalNedeni: '', agirliklar: null,
  kalemler: [{ id: `${id.slice(0, -2)}c1`, katalogId: null, ad: 'ORN- Kalem', ozellik: '', miktar: '2', birim: 'adet', kategori: '' }],
  teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-10-12T08:00:00.000Z', guncelleme: '2026-10-12T08:00:00.000Z',
  ...ek,
});
const T1 = talep('00000000-0000-4000-8000-000000000201', 'ST-2026-011', 'taslak');
const T2 = talep('00000000-0000-4000-8000-000000000301', 'ST-2026-012', 'teklif_isteniyor', { teklifIstekleri: [{ firmaId: 41, gonderim: '2026-11-18', sonTarih: '2026-11-21' }] });
const T3 = talep('00000000-0000-4000-8000-000000000401', 'ST-2026-013', 'iptal');

const pr = (r: Partial<PurchaseRequest>): PurchaseRequest => ({
  id: 'p1', no: 'ST-2026-001', title: 'ORN', department: '', requester: '', needDate: '', notes: '', priority: 'normal',
  items: [{ id: 'k1', name: 'ORN- Kalem', spec: '', qty: 1, unit: 'adet' }], quotes: [], rfqs: [], log: [], createdAt: 0, status: 'draft', ...r,
} as PurchaseRequest);

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('3467 Teklif al girişleri', () => {
  it('adresteki ?bolum=rfq tanınır', () => {
    expect(acilisOku(new URLSearchParams('talep=x&bolum=rfq'))).toEqual({ talep: 'x', bolum: 'rfq' });
  });
  it('cevabı beklenen talepte Hatırlat Teklif al adımına gider', () => {
    const n = nextStep(pr({ status: 'rfq', rfqs: [{ supplierId: '41', sentAt: '2026-11-18', dueDate: '2026-11-21' }] }));
    expect(n.b.find((b) => b[1] === 'Hatırlat')?.[3]).toBe('rfq');
  });
});

describe('3467 Teklif al ekranı', () => {
  it('Teklif iste Teklif al adımını açar; e-posta kenar durumları, form Geri ile seçim korunur, merkez formunda logo, taslak talebe özgü', async () => {
    const acilis: AcilisCevabi = {
      kullanici: { id: 7, ad: 'ORN- Alıcı' }, talepler: [T1, T2, T3], tedarikciler: [POSTALI, POSTASIZ], firmaKartlari: [], katalog: [],
      ayarlar: {
        sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
        kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], dortGoz: true, surum: 1,
      },
      teklifIstekFormu: {
        icerik: { baslik: 'TEKLİF İSTEME FORMU', giris: '', istenenler: [], kapanis: '', imza1: '', imza2: '', alt: '' },
        surum: 1, kurum: { unvan: 'ORN- Atölye', adres: '', telefon: '', eposta: '', vergi: '' },
      },
    } as AcilisCevabi;
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => new Response(JSON.stringify(adres === '/api/kurum-logosu' ? { logo: LOGO } : acilis), { status: 200, headers: { 'content-type': 'application/json' } })));
    const pano: string[] = [];
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (m: string) => { pano.push(m); } } });
    // jsdom kaydırma yapmaz; "Teklif iste" adımı açınca bölüme kaydırır.
    Element.prototype.scrollIntoView = () => undefined;
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = ekranliBagla(kok, { rol: 'buyer', sayfa: 'requests', yol: '/satin-alma/talepler', git: () => {} });
    await vi.waitFor(() => expect(talepSatiri(kok, T1.id)).not.toBeNull());

    // İş kutusunda taslak talebin işi Teklif al adımına götürür.
    expect(jobs().draft?.find((j) => j.r.id === T1.id)?.tab).toBe('rfq');

    talepSatiri(kok, T1.id)!.click();
    const bolum = () => kok.querySelector('#main .sa-adim-govde')?.getAttribute('data-sec');
    await vi.waitFor(() => expect(bolum()).toBe('rfq'));
    sekme(kok, 'items')!.click();
    await vi.waitFor(() => expect(bolum()).toBe('items'));
    // "Şimdi yapılacak"ın ana düğmesi (Teklif iste) Teklif al adımını açar.
    const ana = kok.querySelector<HTMLButtonElement>('#sa-ekran .tc-dugme-birincil')!;
    expect(ana.textContent).toContain('Teklif iste');
    ana.click();
    await vi.waitFor(() => expect(bolum()).toBe('rfq'));

    const kutu = (id: number) => kok.querySelector<HTMLInputElement>(`#main [data-rfq="${String(id)}"]`)!;
    const degistir = (el: HTMLElement) => { el.dispatchEvent(new Event('change', { bubbles: true })); };
    const alici = () => kok.querySelector('#rfq-alici')?.textContent;
    const posta = () => kok.querySelector<HTMLAnchorElement>('#rfq-posta')!;
    // Genel taslakta alıcı yok.
    await vi.waitFor(() => expect(alici()).toBe('tedarikçi seçin'));
    expect(posta().hidden).toBe(true);
    // E-postası olmayan tedarikçi: alıcı yazılmaz, programda açma düğmesi gizli.
    kutu(42).click(); degistir(kutu(42));
    const sec = kok.querySelector<HTMLSelectElement>('#rfq-prev')!;
    // 3589: işaretlenen tedarikçi taslağa kendiliğinden gelir.
    expect(sec.value).toBe('42');
    expect(alici()).toBe('e-posta adresi kayıtlı değil');
    // Elle seçilen Genel, başka tedarikçi işaretlenince korunur; işaret kalkınca seçim kalanlara döner.
    sec.value = ''; degistir(sec);
    kutu(41).click(); degistir(kutu(41));
    expect(sec.value).toBe('');
    expect(alici()).toBe('tedarikçi seçin');
    sec.value = '41'; degistir(sec);
    expect(alici()).toBe('orn@ornek.invalid');
    kutu(41).click(); degistir(kutu(41));
    expect(sec.value).toBe('42');
    expect(alici()).toBe('e-posta adresi kayıtlı değil');
    expect(posta().hidden).toBe(true);
    expect(posta().getAttribute('href')).toBeNull();
    // Kopyalanan metin konuyla başlar.
    kok.querySelector<HTMLButtonElement>('#main [data-act="copy-rfq"]')!.click();
    await vi.waitFor(() => expect(pano).toHaveLength(1));
    expect(pano[0]).toMatch(/^Konu: Fiyat teklifi talebi, ST-2026-011 ORN- ST-2026-011\n\n/);

    // Form: logo basılır; Geri seçimi ve son tarihi korur.
    const tarih = kok.querySelector<HTMLInputElement>('#rfq-due')!;
    tarih.value = '2026-12-01'; degistir(tarih);
    kok.querySelector<HTMLButtonElement>('#main [data-act="rfq-form"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('#ifo-kagit img.doc-logo')?.getAttribute('src')).toBe(LOGO));
    document.querySelector<HTMLButtonElement>('[data-act="rfq-form-back"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('#ifo-kagit')).toBeNull());
    expect(kutu(42).checked).toBe(true);
    expect(kok.querySelector<HTMLInputElement>('#rfq-due')!.value).toBe('2026-12-01');
    expect(alici()).toBe('e-posta adresi kayıtlı değil');

    // Başka talep: önceki talebin seçimi taşınmaz; cevabı beklenen tedarikçi seçilemez.
    merkezAc({ talep: T2.id, bolum: 'rfq' });
    await vi.waitFor(() => expect(kok.querySelector('[data-sa-geri]')?.nextElementSibling?.textContent).toBe(T2.no));
    await vi.waitFor(() => expect(bolum()).toBe('rfq'));
    expect(kutu(42).checked).toBe(false);
    expect(kutu(41).disabled).toBe(true);
    expect(kok.querySelector<HTMLInputElement>('#rfq-due')!.value).not.toBe('2026-12-01');
    expect(kok.querySelector('.sa-ekran-adim-ozet')?.textContent).toBe('Teklif al: 1 tedarikçiden istendi');
    // Teklifler adımında bekleyen notu.
    sekme(kok, 'quotes')!.click();
    await vi.waitFor(() => expect(kok.querySelector('[data-sa-rfq-bekleyen]')?.textContent).toContain('1 tedarikçiden cevap bekleniyor'));

    // Kapalı (iptal) talepte Teklif iste bölümü çizilmez.
    merkezAc({ talep: T3.id, bolum: 'rfq' });
    await vi.waitFor(() => expect(kok.querySelector('[data-sa-geri]')?.nextElementSibling?.textContent).toBe(T3.no));
    await vi.waitFor(() => expect(bolum()).toBe('rfq'));
    expect(kok.querySelector('#sa-rfq')).toBeNull();
    kapat();
  });
});
