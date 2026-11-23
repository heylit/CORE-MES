import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { KartAlternatifleriCevabi, KartZarfiCevabi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { KatalogKarti } from '../tipler.ts';
import { YETKISIZ, type MalzemeYetkisi } from '../yetki.ts';
import { YONETICI, json, sunucuKur, yeniIstemci } from '../test-ortak.tsx';
import { KartAlternatifleri } from './KartAlternatifleri.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3463-1: kart föyündeki Alternatifler bölümü (ORN- örnek veri).
const kart = (no: number, kod: string): KatalogKarti => ({
  kimlik: `k${no}`, no, surum: 1, kayit: { id: `k${no}`, tur: 'hammadde', form: 'cubuk', com: { kod, ad: `ORN çubuk ${kod}`, birim: 'm' } },
} as unknown as KatalogKarti);
const ANA = kart(1, 'ORN-HM-0142');
const KOPYA = kart(2, 'ORN-HM-0988');
const ZARF: KartZarfiCevabi = {
  kart: { no: 1, kod: 'ORN-HM-0142', ad: 'ORN çubuk C45 Ø50', aile: 'metal', sinif: 'celik' },
  zarf: {
    kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
    kalite: { istenen: 'C45', acik: true, secenekler: [{ deger: '42CrMo4', tur: 'ust', notu: null }], kaynak: { kapsamTuru: 'kart', kapsam: '1' }, sinir: true },
    durum: { istenen: null, acik: true, secenekler: [], kaynak: null, sinir: false },
    form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: { kapsamTuru: 'kart', kapsam: '1' } }],
    pay: { tur: 'yuzde', deger: 15, enAzMm: 3, kaynak: null },
    boy: { anahtar: 'l', istenen: 3000, uzunKesilir: true, kaynak: null, enAz: null, enCok: null, sinirKaynak: null },
    yuzey: { istenen: null, serbest: false, kaynak: null, secenekler: [], sinir: false },
  },
  kartlar: [3, 4, 5, 6, 7].map((no) => ({
    no, kod: `ORN-HM-01${String(no)}0`, ad: `ORN aday ${String(no)}`, kalite: 'C45', durum: null, form: 'cubuk', olcu: { d: 52, l: 3000 }, sonuc: 'icinde' as const, nedenler: [],
  })),
};
const BOLUM: KartAlternatifleriCevabi = {
  siniri: [
    { id: 11, kapsamTuru: 'kart', kapsam: '1', nitelik: 'kalite', degerler: [{ deger: 'C45', tur: 'tam' }, { deger: '42CrMo4', tur: 'ust' }], alt: null, ust: null, surum: 1 },
    { id: 12, kapsamTuru: 'kart', kapsam: '1', nitelik: 'd', degerler: null, alt: 50, ust: 55, surum: 3 },
  ],
  esdegerler: [], setler: [], secili: [], genisEsik: 50, hesap: '2026-11-22T18:00:00Z',
};
// 3572-1: bir set (iki uyan kart, biri tekil satırlı), bir elle kart, bir önerilmeyen.
const SET: KartAlternatifleriCevabi['setler'][number] = {
  id: 7, ad: 'ORN Kalın çubuk', tur: 'tam', sira: 0, kullanimYerleri: ['talep', 'satin_alma', 'uretim'], notu: 'ORN fazla talaş', genisOnay: false,
  nitelikler: [{ nitelik: 'form', kip: null, degerler: ['cubuk'], alt: null, ust: null, payAlt: null, payUst: null }, { nitelik: 'd', kip: null, degerler: null, alt: 50, ust: 56, payAlt: null, payUst: null }],
  uyanSayisi: 2, surum: 2, guncelleme: '2026-11-22T18:00:00Z',
  uyanlar: [
    { no: 3, kod: 'ORN-HM-0130', ad: 'ORN aday 3', neden: 'd 52', yeni: true, durum: 'gecer' },
    { no: 4, kod: 'ORN-HM-0140', ad: 'ORN aday 4', neden: 'd 52', yeni: false, durum: 'tekil' },
  ],
};
const SECILI: KartAlternatifleriCevabi['secili'] = [
  { alternatifNo: 4, kod: 'ORN-HM-0140', ad: 'ORN aday 4', iptal: false, onerilmez: false, tur: 'ust', sira: 1, kullanimYerleri: ['talep'], notu: null, setler: [7], kuraldan: true, surum: 1 },
  { alternatifNo: 5, kod: 'ORN-HM-0150', ad: 'ORN aday 5', iptal: false, onerilmez: true, tur: null, sira: null, kullanimYerleri: null, notu: 'ORN sertlik tutmadı', setler: [], kuraldan: true, surum: 2 },
];
const DOLU: KartAlternatifleriCevabi = { ...BOLUM, setler: [SET], secili: SECILI, esdegerler: [{ no: 9, kod: 'ORN-HM-0990', ad: 'ORN kopya' }] };
const yollar = (ek = {}) => ({
  'GET /malzeme-alternatifleri/zarf/1': () => json(200, ZARF),
  'GET /malzeme-alternatifleri/kart/1': () => json(200, BOLUM),
  ...ek,
});
const ac = (yetki: MalzemeYetkisi) => render(
  <QueryClientProvider client={yeniIstemci()}><BildirimSaglayici>
    <KartAlternatifleri kart={ANA} kartlar={[ANA, KOPYA]} yetki={yetki} ac={vi.fn()} />
  </BildirimSaglayici></QueryClientProvider>,
);
const TANIM: MalzemeYetkisi = { ...YETKISIZ, oku: true, yaz: true, tanimYaz: true };

const satirKodlari = () => screen.getAllByRole('row').slice(1).map((r) => within(r).queryAllByText(/^ORN-HM-|^ORN Kalın/)[0]?.textContent ?? '');

describe('Kart föyünde alternatifler (3463-1, 3572-1)', () => {
  test('okuyan Ana seti kaynağıyla ve kuraldan gelenleri tek tabloda görür; düzenleme düğmesi yok', async () => {
    sunucuKur(YONETICI, yollar());
    ac({ ...YETKISIZ, oku: true });
    // Kalite kodu harf büyüklüğüyle düz yazılır, tür ayrı rozette.
    expect(await screen.findByText('42CrMo4')).toBeTruthy();
    expect(screen.getByText('üst muadil')).toBeTruthy();
    expect(screen.getByText('50 – 55')).toBeTruthy();
    expect(screen.getAllByText('Kartın kuralı').length).toBeGreaterThan(0);
    expect(screen.getByText('Alternatifler (5)')).toBeTruthy();
    expect(screen.getAllByText('Kuraldan')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /sınırını düzenle/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kart bağla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ana karttan başlat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Önerilmesin' })).toBeNull();
  });

  test('K4 sırası: set ve elle kart kullanıcının sırasıyla, kuraldan gelen sete uyanı ve elle ekleneni tekrar etmez, önerilmeyen ve eşdeğer altta', async () => {
    sunucuKur(YONETICI, yollar({ 'GET /malzeme-alternatifleri/kart/1': () => json(200, DOLU) }));
    ac({ ...YETKISIZ, oku: true });
    expect(await screen.findByText('Alternatifler (6)')).toBeTruthy();
    expect(satirKodlari()).toEqual(['ORN Kalın çubuk', 'ORN-HM-0140', 'ORN-HM-0160', 'ORN-HM-0170', 'ORN-HM-0150', 'ORN-HM-0990']);
    expect(screen.getByText('ORN Kalın çubuk setine de uyar; bu satır geçer')).toBeTruthy();
    expect(screen.getByText('Neden: ORN sertlik tutmadı')).toBeTruthy();
    expect(screen.getByText('Hiçbir yerde')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2 kart uyuyor · 1 yeni' }));
    expect(screen.getByText('tekil satır geçer')).toBeTruthy();
  });

  test('tanım yazan kuraldan geleni nedenle önerilmesin diye işaretler ve önerilmeyeni sürümüyle geri alır', async () => {
    const istekler = sunucuKur(YONETICI, yollar({
      'GET /malzeme-alternatifleri/kart/1': () => json(200, DOLU),
      'POST /malzeme-alternatifleri/secili/onerilmesin': () => json(200, { tamam: true }),
      'POST /malzeme-alternatifleri/secili/kaldir': () => json(200, { tamam: true }),
    }));
    ac(TANIM);
    expect(await screen.findByText('Alternatifler (6)')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Önerilmesin' })[0]!);
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Neden'), { target: { value: 'ORN çapak' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Önerilmesin' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/secili/onerilmesin')?.govde).toEqual({ anaNo: 1, alternatifNo: 6, neden: 'ORN çapak' }));
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/secili/kaldir')?.govde).toEqual({ anaNo: 1, alternatifNo: 5, surum: 2 }));
  });

  test('sıra okları bütün sırayı gönderir; elle kart yukarı alınınca setin önüne geçer', async () => {
    const istekler = sunucuKur(YONETICI, yollar({
      'GET /malzeme-alternatifleri/kart/1': () => json(200, DOLU), 'POST /malzeme-alternatifleri/sira': () => json(200, { tamam: true }),
    }));
    ac(TANIM);
    fireEvent.click(await screen.findByRole('button', { name: 'ORN-HM-0140 yukarı' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/sira')?.govde).toEqual({
      anaNo: 1, ogeler: [{ tur: 'kart', no: 4 }, { tur: 'set', no: 7 }],
    }));
  });

  test('set penceresi canlı sayar, eşik üstünde işaret ister ve seti gövdesiyle kaydeder', async () => {
    const istekler = sunucuKur(YONETICI, yollar({
      'GET /malzeme-alternatifleri/kart/1/set-onizleme': () => json(200, { uyanSayisi: 60, uyanlar: [], sartli: false, hesap: '2026-11-22T18:00:00Z' }),
      'POST /malzeme-alternatifleri/setler/kaydet': () => json(200, { id: 8, tur: 'tam', uyanSayisi: 60 }),
    }));
    ac(TANIM);
    fireEvent.click(await screen.findByRole('button', { name: 'Boş alternatif kartı' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Ad'), { target: { value: 'ORN Geniş' } });
    fireEvent.click(within(within(pencere).getByRole('radiogroup', { name: 'Ø kipi' })).getByRole('radio', { name: 'Aralık' }));
    fireEvent.change(within(pencere).getByLabelText('Ø en az (mm)'), { target: { value: '50' } });
    expect(await within(pencere).findByText('Uyan kart: 60')).toBeTruthy();
    expect(within(pencere).getByText(/işlem serbest · Ø en az 50/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText('Geniş kart için işaret gerekir.')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/malzeme-alternatifleri/setler/kaydet')).toBe(false);
    fireEvent.click(within(pencere).getByLabelText('Bu kadar geniş olduğunu biliyorum'));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Üretim' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/setler/kaydet')?.govde).toEqual({
      anaNo: 1, ad: 'ORN Geniş', tur: 'tam', kullanimYerleri: ['talep', 'satin_alma'], notu: null, genisOnay: true,
      nitelikler: [{ nitelik: 'd', kip: 'aralik', degerler: null, alt: 50, ust: null, payAlt: null, payUst: null }],
    }));
  });

  test('3593: Ana karttan başlat her alanı Birebir açar; çap Pay yapılınca özet ve gövde ana ölçüyü izler', async () => {
    const ana = { ...ANA, kayit: { ...ANA.kayit, grade: 'ORN-6082', dims: { d: 40, l: 3000 }, opts: { durum: 'T6' } } } as unknown as KatalogKarti;
    const istekler = sunucuKur(YONETICI, yollar({
      'GET /malzeme-alternatifleri/kart/1/set-onizleme': () => json(200, { uyanSayisi: 0, uyanlar: [], sartli: false, hesap: '2026-11-22T18:00:00Z' }),
      'POST /malzeme-alternatifleri/setler/kaydet': () => json(200, { id: 8, tur: 'tam', uyanSayisi: 0 }),
    }));
    render(
      <QueryClientProvider client={yeniIstemci()}><BildirimSaglayici>
        <KartAlternatifleri kart={ana} kartlar={[ana, KOPYA]} yetki={TANIM} ac={vi.fn()} />
      </BildirimSaglayici></QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ana karttan başlat' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Ad'), { target: { value: 'ORN Pay' } });
    fireEvent.click(within(within(pencere).getByRole('radiogroup', { name: 'Ø kipi' })).getByRole('radio', { name: 'Pay' }));
    fireEvent.change(within(pencere).getByLabelText('Ø yukarı pay (mm)'), { target: { value: '5' } });
    expect(within(pencere).getByText(/ORN-6082 · T6 · işlem yok · .*Ø 40–45 \(−0\/\+5\) · boy birebir 3\.000/)).toBeTruthy();
    expect(await within(pencere).findByText('Uyan kart yok')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    const birebir = (nitelik: string) => ({ nitelik, kip: 'birebir', degerler: null, alt: null, ust: null, payAlt: null, payUst: null });
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/setler/kaydet')?.govde).toMatchObject({
      ad: 'ORN Pay',
      nitelikler: [
        birebir('form'), birebir('kalite'), birebir('durum'), birebir('islem'), birebir('standart'), birebir('yuzey'),
        { nitelik: 'd', kip: 'pay', degerler: null, alt: null, ust: null, payAlt: 0, payUst: 5 }, birebir('l'),
      ],
    }));
  });

  test('3593: uyanı olmayan alternatif kartı sınır olarak gider yazar; Kopyala aynı formdaki kartlara gönderir', async () => {
    const bos = { ...SET, uyanSayisi: 0, uyanlar: [] };
    const istekler = sunucuKur(YONETICI, yollar({
      'GET /malzeme-alternatifleri/kart/1': () => json(200, { ...BOLUM, setler: [bos] }),
      'POST /malzeme-alternatifleri/setler/7/kopyala': () => json(200, { kopyalar: [{ hedefNo: 2, id: 9, uyanSayisi: 0 }] }),
    }));
    ac(TANIM);
    expect(await screen.findByText('Uyan kart yok; teklif ve siparişe sınır olarak gider.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ORN Kalın çubuk başka malzemelere kopyala' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByLabelText(/ORN-HM-0988/));
    fireEvent.click(within(pencere).getByRole('button', { name: '1 karta kopyala' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/setler/7/kopyala')?.govde).toEqual({ surum: 2, hedefler: [{ no: 2, surum: 1 }], genisOnay: false }));
  });

  test('hammadde dışı kartta Set ekle kapalı ve nedenli; Kart ekle sınır dışı kartı uyarıyla ekler', async () => {
    const sarf = { ...ANA, kayit: { ...ANA.kayit, tur: 'sarf' } } as unknown as KatalogKarti;
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/secili/kaydet': () => json(200, { tamam: true }) }));
    render(
      <QueryClientProvider client={yeniIstemci()}><BildirimSaglayici>
        <KartAlternatifleri kart={sarf} kartlar={[sarf, KOPYA]} yetki={TANIM} ac={vi.fn()} />
      </BildirimSaglayici></QueryClientProvider>,
    );
    expect(((await screen.findByRole('button', { name: 'Ana karttan başlat' })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/alternatif kartı kurulamaz/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Kart ekle' })[0]!);
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /ORN-HM-0988/ }));
    expect(within(pencere).getByText(/kabul sınırının dışında/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Şartlı' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/secili/kaydet')?.govde).toEqual({
      anaNo: 1, alternatifNo: 2, tur: 'sartli', kullanimYerleri: ['talep', 'satin_alma', 'uretim'], notu: null,
    }));
  });

  test('tanım yazan ölçü aralığını sürümüyle kaydeder', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/siniri/kaydet': () => json(200, { tamam: true }) }));
    ac(TANIM);
    fireEvent.click(await screen.findByRole('button', { name: 'd (mm) sınırını düzenle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('En çok (mm)'), { target: { value: '56,5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/siniri/kaydet')?.govde).toEqual({
      kapsamTuru: 'kart', kapsam: '1', nitelik: 'd', degerler: null, alt: 50, ust: 56.5, surum: 3,
    }));
  });

  test('kartın sınırı sürümüyle kaldırılır; şartlı kart rozetle, kapalı zarf notla görünür', async () => {
    const zarf = { ...ZARF, zarf: { ...ZARF.zarf!, kapali: true, gerekce: 'ORN gerekçe' }, kartlar: [{ ...ZARF.kartlar[0]!, sonuc: 'sartli' as const, nedenler: ['Kalite şartlı'] }] };
    const istekler = sunucuKur(YONETICI, yollar({
      'GET /malzeme-alternatifleri/zarf/1': () => json(200, zarf),
      'POST /malzeme-alternatifleri/siniri/12/kaldir': () => json(200, { tamam: true }),
    }));
    ac(TANIM);
    expect(await screen.findByText(/Alternatif kapalı/)).toBeTruthy();
    expect(screen.getAllByText('Şartlı').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'd (mm) sınırını düzenle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kartın sınırını kaldır' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/siniri/12/kaldir')?.govde).toEqual({ surum: 3 }));
  });

  test('eşdeğer kart onay penceresiyle bağlanır', async () => {
    const istekler = sunucuKur(YONETICI, yollar({ 'POST /malzeme-alternatifleri/esdeger/bagla': () => json(200, { tamam: true }) }));
    ac(TANIM);
    fireEvent.change(await screen.findByLabelText('Eşdeğer kartın kodu (aynı malzeme, farklı kart)'), { target: { value: 'ORN-HM-0988' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kart bağla' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/birbirinin yerine sınırsız kabul edilir/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-alternatifleri/esdeger/bagla')?.govde).toEqual({ kartNo: 1, esdegerNo: 2 }));
  });
});
