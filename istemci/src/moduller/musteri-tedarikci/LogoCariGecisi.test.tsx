import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { LogoCrmDenetimiCevabi } from '#paylasilan/sozlesme/logo.ts';
import type {
  LogoCariGeriAlCevabi, LogoCariKartlariCevabi, LogoCariListeAdayi, LogoCariListeCevabi, LogoCariListeSatiri, LogoCariSatiri,
  LogoCariSonIslemCevabi, LogoCariTopluCevabi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { LogoCariGecisi } from './LogoCariGecisi.tsx';
import { cariDurumu, islemSecenekleri, onKontrolPlani, oneriIslemi } from './logo-cari-gecisi.ts';

// 3343, 3474-1: Logo geçişi cariler sekmesi, eşleştirme listesi. Cariler uydurmadır (ORN).
const YAZAN: Kullanici = { id: 1, ad: 'Deneme Yazan', islemler: ['sayfa.logo-gecisi', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz'] };
const OKUYAN: Kullanici = { id: 2, ad: 'Deneme Okuyan', islemler: ['sayfa.logo-gecisi', 'musteri-tedarikci.oku'] };

const aday = (firmaId: number, ek: Partial<LogoCariListeAdayi> = {}): LogoCariListeAdayi => ({
  firmaId, kod: `ORN-F-${firmaId}`, ad: `ORN Firma ${firmaId}`, aktif: true, neden: 'kod', logoyaBagli: false, baglanabilir: true, surum: 3, ...ek,
});
const liste = (kod: string, durum: LogoCariListeSatiri['durum'], adaylar: LogoCariListeAdayi[] = [], alinamaz: string | null = null): LogoCariListeSatiri =>
  ({ kod, ad: `ORN Deneme ${kod}`, durum, alinamaz, adaylar });
const L_YENI = liste('ORN-C-1', 'yeni');
const L_BAGLANABILIR = liste('ORN-C-2', 'baglanabilir', [aday(12)]);
const L_BAGLI = liste('ORN-C-3', 'bagli', [aday(13, { neden: 'cari-kodu', logoyaBagli: true, baglanabilir: false })]);
const L_ESLESIK = liste('ORN-C-4', 'eslesik', [aday(14), aday(15, { neden: 'cari-kodu' })]);
const L_ALINAMAZ = liste('ORN-C-5', 'alinamaz', [], 'Logo cari kodu 1-40 karakter olmalı.');
const SATIRLAR = [L_YENI, L_BAGLANABILIR, L_BAGLI, L_ESLESIK, L_ALINAMAZ];
const LISTE: LogoCariListeCevabi = {
  baglanti: true, okuma: { acik: true, sonOkuma: '2026-11-20T06:00:00Z' },
  sayilar: { tumu: 5, yeni: 1, baglanabilir: 1, bagli: 1, eslesik: 1, alinamaz: 1 },
  suzgec: 'tumu', uyan: 5, sayfa: 0, sonrakiSayfa: null, satirlar: SATIRLAR,
  secilebilir: [{ kod: L_YENI.kod, islem: 'al', firmaId: null, surum: null }, { kod: L_BAGLANABILIR.kod, islem: 'bagla', firmaId: 12, surum: 3 }],
};

const kart = (no: number, kod: string, ek: Partial<LogoCariSatiri> = {}): LogoCariSatiri => ({
  logoKayitNo: no, kod, ad: `ORN Deneme ${kod}`, aktif: true, vergiNo: null, il: null, telefon: null, eslesme: null, alinamaz: null,
  oneri: {
    kod, ad: `ORN Deneme ${kod}`, tur: 'musteri', ulkeKodu: 'TR', vergiNo: null, vergiDairesi: null, adres: null, ilce: null, il: null, postaKodu: null,
    telefon: null, ePosta: null, logoCariKodu: kod,
  },
  ...ek,
});
const K_YENI = kart(1, L_YENI.kod);
const K_BAGLANABILIR = kart(2, L_BAGLANABILIR.kod, { eslesme: { firmaId: 12, kod: 'ORN-F-12', ad: 'ORN Firma 12', neden: 'kod', baglanabilir: true, surum: 3 } });

const CRM_DENETIMI: LogoCrmDenetimiCevabi = {
  durum: 'tamam', neden: null, taranan: 3, eksik: false,
  satirlar: [
    { firmaId: 21, kod: 'ORN-F-21', ad: 'ORN Firma 21', cariKodu: 'ORN-C-21', sorun: 'crm-yok', sayi: null, secili: null },
    { firmaId: 22, kod: 'ORN-F-22', ad: 'ORN Firma 22', cariKodu: 'ORN-C-22', sorun: 'cok-bag', sayi: 3, secili: null },
    { firmaId: 23, kod: 'ORN-F-23', ad: 'ORN Firma 23', cariKodu: 'ORN-C-23', sorun: 'secim-kalkti', sayi: 1, secili: 'ORN-CRM-9' },
  ],
};
let crmDenetimiCevabi: LogoCrmDenetimiCevabi = CRM_DENETIMI;
let sonIslem: LogoCariSonIslemCevabi = { islem: null };
let kartlar: (kodlar: string[]) => LogoCariKartlariCevabi = (kodlar) => ({
  durum: 'tamam', ileti: null, cariler: [K_YENI, K_BAGLANABILIR].filter((k) => kodlar.includes(k.kod)), okunamayan: [],
});
const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });
function sunucuKur(kullanici: Kullanici, listeCevabi: LogoCariListeCevabi = LISTE) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/musteri-tedarikci/logo-cari/liste?')) return json(200, listeCevabi);
    if (yol === '/musteri-tedarikci/logo-cari/son-islem') return json(200, sonIslem);
    if (yol.startsWith('/musteri-tedarikci/logo-cari/kartlar?')) {
      return json(200, kartlar(decodeURIComponent(yol.split('kodlar=')[1] ?? '').split(',')));
    }
    if (yol.startsWith('/logo/cari-crm-kod?')) {
      return json(200, { durumlar: [{ kod: 'ORN-C-1', durum: 'var', neden: null, kodlar: null }, { kod: 'ORN-C-3', durum: 'var', neden: null, kodlar: null }, { kod: 'ORN-C-2', durum: 'yok', neden: null, kodlar: null }] });
    }
    if (yol === '/logo/crm-denetimi') return json(200, crmDenetimiCevabi);
    if (yontem === 'POST' && yol === '/musteri-tedarikci/logo-cari/toplu') {
      return json(200, {
        islem: '00000000-0000-4000-8000-000000000001',
        sonuclar: [
          { logoKodu: L_BAGLANABILIR.kod, islem: 'bagla', tamam: true, firma: { id: 12, kod: 'ORN-F-12', ad: 'ORN Firma 12' }, ileti: null },
          { logoKodu: L_YENI.kod, islem: 'al', tamam: false, firma: null, ileti: 'Bu kod CORE\'da başka firmada.' },
        ],
      } satisfies LogoCariTopluCevabi);
    }
    if (yontem === 'POST' && yol === '/musteri-tedarikci/logo-cari/geri-al') {
      return json(200, { geriAlinan: 1, atlanan: [] } satisfies LogoCariGeriAlCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Yok' });
  }));
  return istekler;
}
function ciz() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={istemci}><BildirimSaglayici><LogoCariGecisi /></BildirimSaglayici></QueryClientProvider>
    </MemoryRouter>,
  );
}
const satirBul = (tablo: HTMLElement, kod: string) => within(within(tablo).getAllByRole('row').find((r) => r.textContent?.includes(kod))!);

afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); crmDenetimiCevabi = CRM_DENETIMI; sonIslem = { islem: null };
  kartlar = (kodlar) => ({ durum: 'tamam', ileti: null, cariler: [K_YENI, K_BAGLANABILIR].filter((k) => kodlar.includes(k.kod)), okunamayan: [] });
});

describe('satır işlemi ve ön kontrol planı (3474-1)', () => {
  it('öneri: yeni -> al, tek bağlanabilir aday -> bağla; ötekilerde öneri yok', () => {
    expect(SATIRLAR.map(oneriIslemi)).toEqual([{ tur: 'al' }, { tur: 'bagla', firmaId: 12, surum: 3 }, null, null, null]);
  });

  it('seçenekler: adayı olan cari için yeni firma açılmaz; bağlı ve alınamazda seçenek yok', () => {
    expect(islemSecenekleri(L_YENI).map((o) => o.deger)).toEqual(['al', 'atla']);
    expect(islemSecenekleri(L_BAGLANABILIR).map((o) => o.deger)).toEqual(['bagla:12', 'atla']);
    expect(islemSecenekleri(L_ESLESIK).map((o) => o.deger)).toEqual(['bagla:14', 'bagla:15', 'atla']);
    expect(islemSecenekleri(L_BAGLI)).toEqual([]);
    expect(islemSecenekleri(L_ALINAMAZ)).toEqual([]);
  });

  it('ön kontrol: okunamayan, Logo\'da pasif ve CORE\'da vergi no ile bulunan "al" atlanır; komut yalnız kalanları taşır', () => {
    const vergiyle = kart(3, 'ORN-C-6', { eslesme: { firmaId: 16, kod: 'ORN-F-16', ad: 'ORN Firma 16', neden: 'vergi-no', baglanabilir: true, surum: 1 } });
    const pasif = kart(4, 'ORN-C-7', { aktif: false });
    const secim = new Map([
      [K_YENI.kod, { tur: 'al' as const }], [K_BAGLANABILIR.kod, { tur: 'bagla' as const, firmaId: 12, surum: 3 }],
      ['ORN-C-6', { tur: 'al' as const }], ['ORN-C-7', { tur: 'al' as const }], ['ORN-C-8', { tur: 'al' as const }],
    ]);
    const p = onKontrolPlani(secim, [K_YENI, K_BAGLANABILIR, vergiyle, pasif], [{ kod: 'ORN-C-8', ileti: 'Logo\'da bulunamadı.' }]);
    expect(p.govde).toEqual({ bagla: [{ logoKodu: K_BAGLANABILIR.kod, firmaId: 12, surum: 3 }], al: [{ logoKodu: K_YENI.kod }] });
    const neden = new Map(p.satirlar.filter((s) => s.islem === 'atla').map((s) => [s.kod, s.neden]));
    expect(neden.get('ORN-C-6')).toMatch(/CORE'da var: ORN-F-16 ORN Firma 16 \(aynı vergi no\)/);
    expect(neden.get('ORN-C-7')).toBe('Logo\'da kullanım dışı');
    expect(neden.get('ORN-C-8')).toBe('Logo\'da bulunamadı.');
    expect(cariDurumu(pasif)).toBe('pasif');
  });
});

describe('Logo geçişi cariler sekmesi (3474-1)', () => {
  it('firma yazamayana not gösterilir; liste istenmez', async () => {
    const istekler = sunucuKur(OKUYAN);
    ciz();
    expect(await screen.findByText(/firma yazma yetkisi ister/)).toBeTruthy();
    expect(istekler.some((i) => i.yol.includes('/logo-cari/'))).toBe(false);
    // 3480 Test T4: yazamayanda CRM de sorulmaz (yardımcıya istek gitmez).
    expect(istekler.some((i) => i.yol.startsWith('/logo/cari-crm'))).toBe(false);
  });

  it('liste aynadan gelir: durum, CORE karşılığı, süzgeç sayıları, son okuma; CRM rozeti bağlanmamış satırda da (3480)', async () => {
    const istekler = sunucuKur(YAZAN);
    ciz();
    const tablo = await screen.findByRole('table', { name: 'Logo carileri' });
    expect(istekler.some((i) => i.yol.startsWith('/musteri-tedarikci/logo-cari/liste?suzgec=tumu&sayfa=0'))).toBe(true);
    for (const ad of ['Yeni', 'Bağlanabilir', 'Bağlı', 'Elle bakılmalı', 'Alınamaz']) expect(within(tablo).getAllByText(ad).length).toBeGreaterThan(0);
    expect(screen.getByText(/Yeni \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Liste Logo'dan en son 20\.11 09:00 okundu/)).toBeTruthy();
    expect(await satirBul(tablo, L_BAGLI.kod).findByText('CRM')).toBeTruthy();
    // 3480: bağlanmamış carinin CRM'i de görünür; CRM'siz carede rozet yok; alınamaz cari sorulmaz.
    expect(await satirBul(tablo, L_YENI.kod).findByText('CRM')).toBeTruthy();
    expect(satirBul(tablo, L_BAGLANABILIR.kod).queryByText('CRM')).toBeNull();
    const crm = istekler.filter((i) => i.yol.startsWith('/logo/cari-crm-kod?')).map((i) => decodeURIComponent(i.yol));
    expect(crm).toEqual(['/logo/cari-crm-kod?kod=ORN-C-1,ORN-C-2,ORN-C-3,ORN-C-4']);
    expect(satirBul(tablo, L_ESLESIK.kod).getByRole('combobox', { name: `${L_ESLESIK.kod} ne yapılsın` })).toBeTruthy();
    expect(satirBul(tablo, L_BAGLI.kod).getByRole('button', { name: `${L_BAGLI.kod} firmayı aç` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Bağlı \(1\)/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/musteri-tedarikci/logo-cari/liste?suzgec=bagli'))).toBe(true));
  });

  it('liste okuması kapalıysa uyarı ve Logo yönetimine bağlantı', async () => {
    sunucuKur(YAZAN, { ...LISTE, okuma: { acik: false, sonOkuma: null } });
    ciz();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Logo liste okuması kapalı/);
    expect(screen.getByRole('link', { name: 'Logo yönetiminden' }).getAttribute('href')).toBe('/logo');
  });

  it('önerileri kabul et, ön kontrolde Logo\'dan okunur, tek komutla işlenir; sonuç satır satır', async () => {
    const istekler = sunucuKur(YAZAN);
    ciz();
    await screen.findByRole('table', { name: 'Logo carileri' });
    fireEvent.click(screen.getByRole('button', { name: 'Önerileri kabul et' }));
    expect(screen.getByText('2 seçili: 1 bağla, 1 yeni firma')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ön kontrol' }));
    const pencere = await screen.findByRole('dialog', { name: 'Ön kontrol' });
    fireEvent.click(await within(pencere).findByRole('button', { name: '1 bağla, 1 al' }));
    expect(istekler.filter((i) => i.yol.startsWith('/musteri-tedarikci/logo-cari/kartlar?'))).toHaveLength(1);
    const sonuc = await screen.findByRole('dialog', { name: 'Sonuç' });
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({
      bagla: [{ logoKodu: L_BAGLANABILIR.kod, firmaId: 12, surum: 3 }], al: [{ logoKodu: L_YENI.kod }],
    });
    expect(within(sonuc).getByText('1 bağlandı, 0 firma açıldı, 1 işlenemedi.')).toBeTruthy();
    expect(within(sonuc).getByText(/başka firmada/)).toBeTruthy();
    expect(screen.queryByText(/seçili:/)).toBeNull();
  });

  it('elle bakılacak satırda aday seçilince satır seçilir; Atla seçimden çıkarır', async () => {
    sunucuKur(YAZAN);
    ciz();
    const tablo = await screen.findByRole('table', { name: 'Logo carileri' });
    const secim = satirBul(tablo, L_ESLESIK.kod).getByRole('combobox', { name: `${L_ESLESIK.kod} ne yapılsın` });
    fireEvent.change(secim, { target: { value: 'bagla:15' } });
    expect(screen.getByText('1 seçili: 1 bağla, 0 yeni firma')).toBeTruthy();
    expect((satirBul(tablo, L_ESLESIK.kod).getByRole('checkbox', { name: `${L_ESLESIK.kod} seç` }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(secim, { target: { value: 'atla' } });
    expect(screen.queryByText(/seçili:/)).toBeNull();
  });

  it('Logo okuması kapalı dönerse ön kontrol durur ve komut gitmez', async () => {
    kartlar = () => ({ durum: 'kapali', ileti: 'Logo bağlantısı kapalı.', cariler: [], okunamayan: [] });
    const istekler = sunucuKur(YAZAN);
    ciz();
    await screen.findByRole('table', { name: 'Logo carileri' });
    fireEvent.click(screen.getByRole('button', { name: /Süzgeçtekilerin tümünü seç \(2\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ön kontrol' }));
    const pencere = await screen.findByRole('dialog', { name: 'Ön kontrol' });
    expect((await within(pencere).findByRole('alert')).textContent).toBe('Logo bağlantısı kapalı.');
    expect((within(pencere).getByRole('button', { name: 'Okunuyor' }) as HTMLButtonElement).disabled).toBe(true);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('son toplu işlem şeridi: sonucu açar, geri al onayla gider', async () => {
    sonIslem = {
      islem: {
        islem: '00000000-0000-4000-8000-000000000002', zaman: '2026-11-20T07:00:00Z', geriAlinabilir: true,
        satirlar: [{ logoKodu: L_YENI.kod, islem: 'al', tamam: true, firma: { id: 30, kod: L_YENI.kod, ad: 'ORN Deneme' }, ileti: null, geriAlindi: false, geriIleti: null }],
      },
    };
    const istekler = sunucuKur(YAZAN);
    ciz();
    const serit = await screen.findByRole('region', { name: 'Son toplu işlem' });
    expect(serit.textContent).toMatch(/0 bağlandı, 1 firma açıldı, 0 işlenemedi/);
    fireEvent.click(within(serit).getByRole('button', { name: 'Geri al' }));
    const onay = await screen.findByRole('dialog', { name: 'Son toplu işlemi geri al' });
    expect(within(onay).getByText('1 firma pasife alınır; silinmez. Açık kaydı olan firma atlanır.')).toBeTruthy();
    expect(within(onay).getByText('0 bağlama çözülür; firmanın önceki kodu ve Logo cari kodu geri yazılır.')).toBeTruthy();
    expect(within(onay).getByText(/aynı cari yeniden toplu alınamaz/)).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/musteri-tedarikci/logo-cari/geri-al')?.govde)
      .toEqual({ islem: '00000000-0000-4000-8000-000000000002' }));
  });

  it('3391-2: CRM bağı denetimi düğmeyle gider; düzeltilecek müşteriler sorunuyla listelenir, firma açılır', async () => {
    const istekler = sunucuKur(YAZAN);
    ciz();
    const dugme = await screen.findByRole('button', { name: 'Denetle' });
    expect(istekler.some((i) => i.yol === '/logo/crm-denetimi')).toBe(false);
    fireEvent.click(dugme);
    const tablo = await screen.findByRole('table', { name: 'CRM bağı düzeltilecek müşteriler' });
    expect(istekler.filter((i) => i.yol === '/logo/crm-denetimi')).toHaveLength(1);
    expect(screen.getAllByRole('status').some((d) => /3 cari denetlendi; 3 düzeltilecek\.$/.test(d.textContent ?? ''))).toBe(true);
    expect(within(tablo).getByText('CRM yok')).toBeTruthy();
    expect(within(tablo).getByText('CRM ×3')).toBeTruthy();
    expect(within(tablo).getByText('Seçim geçersiz')).toBeTruthy();
    expect(within(tablo).getByText(/Seçili kod Logo'da artık bağlı değil/)).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: 'ORN Firma 22 firmasını aç' })).toBeTruthy();
  });

  it('3391-2: denetim yarıda kalırsa neden ve denetlenen sayısı uyarıda, okunanlar tabloda; sınırda kalanlar için not', async () => {
    crmDenetimiCevabi = { ...CRM_DENETIMI, durum: 'okunamadi', neden: 'Köprüye ulaşılamadı.', taranan: 2, eksik: true, satirlar: CRM_DENETIMI.satirlar.slice(0, 1) };
    sunucuKur(YAZAN);
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: 'Denetle' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Köprüye ulaşılamadı. 2 cari denetlendi.');
    expect(within(screen.getByRole('table', { name: 'CRM bağı düzeltilecek müşteriler' })).getByText('CRM yok')).toBeTruthy();
    cleanup();
    crmDenetimiCevabi = { ...CRM_DENETIMI, eksik: true };
    sunucuKur(YAZAN);
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: 'Denetle' }));
    await waitFor(() => expect(screen.getAllByRole('status').some((d) => /İlk 500 müşteri denetlendi; kalanlar için firmaları tek tek açın\.$/.test(d.textContent ?? ''))).toBe(true));
  });

  it('3391-2: yazamayana CRM bağı denetimi gösterilmez', async () => {
    sunucuKur(OKUYAN);
    ciz();
    expect(await screen.findByText(/firma yazma yetkisi ister/)).toBeTruthy();
    expect(screen.queryByText('CRM bağı denetimi')).toBeNull();
  });
});
