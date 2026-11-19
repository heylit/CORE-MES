import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimliEmirAyrintisi, EmirAyrintiCevabi, GecmisGirisCevabi, IsEmri, IzlemeEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Menu, type MenuOgesi } from '../../ortak/arayuz/index.ts';
import { EmirAyrintisi, type EmirParcalari } from './EmirAyrintisi.tsx';
import { girilebilirAdimlar } from './GecmisGiris.tsx';
import { YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

// 3455-1: geçmiş üretim girişi emir sayfasında. Veriler uydurmadır.
const YONETICI: typeof YAZAR = { ...YAZAR, islemler: [...YAZAR.islemler, 'uretim-emirleri.gecmis-giris'] };
const EMIR = {
  id: 3, emirNo: 'EM-3', parcaNo: 'DNM-001', parcaAd: 'Deneme mil', adet: 120, istasyon: null, durum: 'planli', acan: { id: 7, ad: 'Deneme Planlamaci' },
  acilma: '2026-10-06T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null, malzemeNo: 501,
} satisfies IzlemeEmri;
const adim = (opNo: number, ek: Partial<IsEmri> = {}): IsEmri => ({
  id: opNo, opNo, sira: opNo / 10, tip: { id: 1, ad: 'Tornalama', kod: 'TOR' }, ad: `Adım ${opNo}`, tur: 'rota', ekAciklama: null,
  kaynak: { tur: 'makine', id: 4, kod: 'M-1', ad: 'Tezgah' }, istasyon: { id: 2, kod: 'IS-1', ad: 'İstasyon 1' }, ayarSuresiDk: '10', birimSureDk: '2',
  terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, durum: 'bekliyor', baslama: null, bitis: null, saglamAdet: null,
  bilesenler: [], adaylar: [], fason: null, uretimYeriDegisimi: null, gecmisGiris: null, ...ek,
});
const ayrinti = (isEmirleri: IsEmri[]): AdimliEmirAyrintisi => ({
  id: 3, emirNo: 'EM-3', urun: { id: 501, kod: 'DNM-001', ad: 'Deneme mil' }, adet: 120, oncelik: 3, baslangic: null, teslim: null, durum: 'planli', arsiv: false,
  kaynakRotaRevizyonId: 1, adimSayisi: isEmirleri.length, tamamAdim: 0, siradaki: null, aciklama: null, acilma: '2026-10-06T08:00:00+00:00', surum: 4,
  isEmirleri, eski: null,
});
const parcalar: EmirParcalari = {
  sar: (i) => i,
  islemler: (_id, ek: readonly MenuOgesi[]) => (ek.length > 0 ? <Menu etiket="Emir işlemleri" metin="İşlemler" ogeler={[...ek]} /> : <p>Ek işlem yok</p>),
  adimlar: () => null,
  malzeme: () => null,
};
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: () => <EmirAyrintisi parcalar={parcalar} /> }];
const UC = [adim(10), adim(20), adim(30)];
const GIRILMIS = [
  adim(10, {
    durum: 'tamam', saglamAdet: 118, baslama: '2026-11-01T05:00:00+00:00', bitis: '2026-11-10T14:00:00+00:00',
    gecmisGiris: {
      giren: { id: 7, ad: 'Deneme Yonetici' }, zaman: '2026-11-19T10:00:00+00:00', stokYazildi: false, operator: null, baslama: null, bitis: '2026-11-10',
      hurda: 2, hurdaNedeni: { id: 5, ad: 'Deneme takım kırılması' },
    },
  }),
  adim(20), adim(30),
];
const yollar = (isEmirleri: IsEmri[], ek: Record<string, (g: unknown) => Response> = {}) => ({
  'GET /uretim-emirleri/3': () => json(200, { emir: EMIR, kayitlar: [] } satisfies EmirAyrintiCevabi),
  'GET /adimli-emirler/3': () => json(200, { emir: ayrinti(isEmirleri) }),
  'GET /hurda-nedenleri': () => json(200, { nedenler: [{ id: 5, kod: 'TK', ad: 'Deneme takım kırılması', aktif: true, sira: 1 }], onerilenKod: 'H-1' }),
  'GET /kisiler': () => json(200, { kisiler: [] }),
  ...ek,
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3455-1 geçmiş üretim girişi', () => {
  it('girilebilir adımlar: ilk bekleyenden ardışık; fasonda, başlamışta ve son adımda durur; dallı emirde yok', () => {
    expect(girilebilirAdimlar(UC).map((a) => a.opNo)).toEqual([10, 20]);
    expect(girilebilirAdimlar(GIRILMIS).map((a) => a.opNo)).toEqual([20]);
    expect(girilebilirAdimlar([adim(10), adim(20, { kaynak: { tur: 'fason', id: 1, kod: null, ad: 'F' } }), adim(30)]).map((a) => a.opNo)).toEqual([10]);
    expect(girilebilirAdimlar([adim(10, { durum: 'calisiyor' }), adim(20)])).toEqual([]);
    expect(girilebilirAdimlar([adim(10, { dal: { ad: 'K1', malzeme: { id: 1, kod: 'A', ad: 'A' }, kaynakOpNo: 10 } }), adim(20)])).toEqual([]);
  });

  it('yetkisi olmayan menüde görmez', async () => {
    sunucuKur(YAZAR, yollar(UC));
    ac(ekran, '/uretim-emirleri/3');
    await screen.findByText('EM-3');
    fireEvent.click(await screen.findByRole('button', { name: 'Emir işlemleri' }));
    expect(screen.getByRole('menuitem', { name: 'Beklet' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Geçmiş üretim gir' })).toBeNull();
  });

  it('yönetici menüden pencereyi açar', async () => {
    sunucuKur(YONETICI, yollar(UC));
    ac(ekran, '/uretim-emirleri/3');
    fireEvent.click(await screen.findByRole('button', { name: 'Emir işlemleri' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Geçmiş üretim gir' }));
    expect(await screen.findByRole('dialog', { name: /geçmiş üretim gir/ })).toBeTruthy();
  });

  it('yönetici seçtiği adıma kadar adet ve tarih girer; stok varsayılan yazılmaz; gövde sürüm ve adımlarla gider', async () => {
    const istekler = sunucuKur(YONETICI, yollar(UC, {
      'POST /adimli-emirler/3/gecmis-giris': () => json(200, { emir: ayrinti(GIRILMIS), uyari: null } satisfies GecmisGirisCevabi),
    }));
    ac(ekran, '/uretim-emirleri/3?islem=gecmis-giris');
    const pencere = await screen.findByRole('dialog');
    const secim = await within(pencere).findByLabelText('Hangi adıma kadar bitti?');
    fireEvent.change(secim, { target: { value: '20' } });
    fireEvent.change(within(pencere).getByLabelText('Başlama tarihi'), { target: { value: '2026-11-01' } });
    fireEvent.change(within(pencere).getByLabelText('Bitiş tarihi'), { target: { value: '2026-11-10' } });
    const saglamlar = within(pencere).getAllByLabelText('Sağlam') as HTMLInputElement[];
    expect(saglamlar.map((s) => s.value)).toEqual(['120', '120']);
    fireEvent.change(saglamlar[1]!, { target: { value: '118' } });
    fireEvent.change(within(pencere).getAllByLabelText('Hurda')[1]!, { target: { value: '2' } });
    fireEvent.change(await within(pencere).findByLabelText('Hurda nedeni'), { target: { value: '5' } });
    expect((within(pencere).getByLabelText('Stoğa hareket yaz') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST')).toBe(true); });
    const post = istekler.find((i) => i.yontem === 'POST');
    expect(post?.kimlik).toBeTruthy();
    expect(post).toMatchObject({
      yol: '/adimli-emirler/3/gecmis-giris',
      govde: {
        surum: 4, baslama: '2026-11-01', bitis: '2026-11-10', stokaYaz: false,
        adimlar: [
          { opNo: 10, saglam: 120, hurda: 0, hurdaNedeniId: null, operatorId: null, baslama: null, bitis: null },
          { opNo: 20, saglam: 118, hurda: 2, hurdaNedeniId: 5, operatorId: null, baslama: null, bitis: null },
        ],
      },
    });
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
  });

  it('sağlam varsayılanı girdi eksi hurdadır; aşım, nedensiz hurda ve ters tarih kayıttan önce uyarılır', async () => {
    const istekler = sunucuKur(YONETICI, yollar(UC));
    ac(ekran, '/uretim-emirleri/3?islem=gecmis-giris');
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(await within(pencere).findByLabelText('Hangi adıma kadar bitti?'), { target: { value: '20' } });
    fireEvent.change(within(pencere).getByLabelText('Başlama tarihi'), { target: { value: '2026-11-05' } });
    fireEvent.change(within(pencere).getByLabelText('Bitiş tarihi'), { target: { value: '2026-11-01' } });
    expect(within(pencere).getAllByRole('group').map((g) => g.querySelector('legend')?.textContent)).toEqual(['OP10 Adım 10 · İstasyon 1 · girdi 120', 'OP20 Adım 20 · İstasyon 1 · girdi 120']);
    fireEvent.change(within(pencere).getAllByLabelText('Hurda')[1]!, { target: { value: '2' } });
    const saglam = () => (within(pencere).getAllByLabelText('Sağlam') as HTMLInputElement[]).map((g) => g.value);
    expect(saglam()).toEqual(['120', '118']);
    fireEvent.change(within(pencere).getAllByLabelText('Hurda')[0]!, { target: { value: '3' } });
    expect(saglam()).toEqual(['117', '115']);
    expect(within(pencere).getAllByRole('group')[1]?.querySelector('legend')?.textContent).toContain('girdi 117');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(within(pencere).getByRole('alert').textContent).toContain('Bitiş tarihi başlama tarihinden önce olamaz');
    fireEvent.change(within(pencere).getByLabelText('Bitiş tarihi'), { target: { value: '2026-11-10' } });
    fireEvent.change(within(pencere).getAllByLabelText('Sağlam')[0]!, { target: { value: '119' } });
    expect(within(pencere).getByText('Sağlam ve hurda toplamı girdiyi (120) aşıyor.')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(within(pencere).getByText(/OP10: sağlam ve hurda toplamı adıma giren adedi aşamaz/)).toBeTruthy();
    fireEvent.change(within(pencere).getAllByLabelText('Sağlam')[0]!, { target: { value: '117' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(within(pencere).getByText('OP10, OP20: hurda nedeni seçin.')).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('stok kutusu işaretlenince gövdede stokaYaz true gider ve not değişir', async () => {
    const istekler = sunucuKur(YONETICI, yollar(UC, {
      'POST /adimli-emirler/3/gecmis-giris': () => json(200, { emir: ayrinti(GIRILMIS), uyari: null } satisfies GecmisGirisCevabi),
    }));
    ac(ekran, '/uretim-emirleri/3?islem=gecmis-giris');
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(await within(pencere).findByLabelText('Hangi adıma kadar bitti?'), { target: { value: '10' } });
    fireEvent.change(within(pencere).getByLabelText('Başlama tarihi'), { target: { value: '2026-11-01' } });
    fireEvent.change(within(pencere).getByLabelText('Bitiş tarihi'), { target: { value: '2026-11-10' } });
    expect(within(pencere).getByText('Stok değişmez; yalnız emrin adımları ilerler.')).toBeTruthy();
    fireEvent.click(within(pencere).getByLabelText('Stoğa hareket yaz'));
    expect(within(pencere).getByText('Sağlam ve hurda adet stok hareketi olarak da yazılır.')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({ govde: { stokaYaz: true } }); });
  });

  it('sunucu reddi pencerede görünür; adım seçilmeden gönderilmez', async () => {
    const istekler = sunucuKur(YONETICI, yollar(UC, {
      'POST /adimli-emirler/3/gecmis-giris': () => json(422, { kod: 'DOGRULAMA', mesaj: 'Adımın sağlam ve hurda toplamı önceki adımın sağlamını aşamaz.' }),
    }));
    ac(ekran, '/uretim-emirleri/3?islem=gecmis-giris');
    const pencere = await screen.findByRole('dialog');
    await within(pencere).findByLabelText('Hangi adıma kadar bitti?');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(within(pencere).getByRole('alert').textContent).toContain('Hangi adıma kadar');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.change(within(pencere).getByLabelText('Hangi adıma kadar bitti?'), { target: { value: '10' } });
    fireEvent.change(within(pencere).getByLabelText('Başlama tarihi'), { target: { value: '2026-11-01' } });
    fireEvent.change(within(pencere).getByLabelText('Bitiş tarihi'), { target: { value: '2026-11-10' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText(/önceki adımın sağlamını aşamaz/)).toBeTruthy();
  });

  it('girilmiş adım şeritte görünür; yönetici son girişi onayla geri alır', async () => {
    let adimlar = GIRILMIS;
    const istekler = sunucuKur(YONETICI, yollar([], {
      'GET /adimli-emirler/3': () => json(200, { emir: ayrinti(adimlar) }),
      'POST /adimli-emirler/3/gecmis-giris/geri-al': () => { adimlar = UC; return json(200, { emir: ayrinti(UC), uyari: null } satisfies GecmisGirisCevabi); },
    }));
    ac(ekran, '/uretim-emirleri/3');
    const serit = await screen.findByRole('region', { name: 'Geçmiş girişle biten adımlar' });
    expect(serit.textContent).toContain('OP10 Adım 10: 118 sağlam, 2 hurda (Deneme takım kırılması)');
    expect(serit.textContent).toContain('Üretim 01.11.2026 - 10.11.2026');
    expect(serit.textContent).toContain('Giren Deneme Yonetici');
    expect(serit.textContent).toContain('Stok yazılmadı');
    const sonHareket = screen.getByText('Son hareket').closest('.tc-emir-ozet');
    expect(sonHareket?.textContent).toContain('Geçmiş giriş');
    fireEvent.click(within(serit).getByRole('button', { name: 'OP10 girişini geri al' }));
    const onay = await screen.findByRole('dialog');
    fireEvent.click(within(onay).getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({ yol: '/adimli-emirler/3/gecmis-giris/geri-al', govde: { surum: 4 } }); });
    await waitFor(() => { expect(screen.queryByRole('region', { name: 'Geçmiş girişle biten adımlar' })).toBeNull(); });
  });
});
