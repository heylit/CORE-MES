import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { SmartesEmirDurumlariCevabi } from '#paylasilan/sozlesme/smartes.ts';
import type { AdimDurumuCevabi, AdimliEmirAyrintisi, Emir, EmirAyrintiCevabi, IsEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi, type EmirParcalari } from './EmirAyrintisi.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 3039: emir sayfasının adım listesinde satırın sağı (statü, kim yazdı, karar bekleyen, eksik alt parça, adımın menüsü). Adım listesi
// üstteki modülden gelir; burada yerine her adım için ek'i çağıran yalın bir liste verilir. Veriler uydurmadır.
const EMIR = {
  id: 5, emirNo: 'UE-0005', parcaNo: 'DNM-005', parcaAd: 'Deneme flanş', adet: 40, istasyon: { id: 3, ad: 'Deneme Tezgah 1' }, durum: 'basladi', acan: { id: 7, ad: 'Deneme Planlamaci' },
  acilma: '2026-10-06T08:00:00+00:00', baslama: '2026-10-06T09:00:00+00:00', bitis: null, iptal: null, saglamAdet: null, malzemeNo: 501, canli: null,
} satisfies Emir;
const ADIM = {
  isEmriId: 51, opNo: 10, ad: 'Testere kesim', durum: 'tamam', calisma: null, bagimlilik: 'bekleyen', fason: false, hedef: 40, yapilan: 40, yuzde: 100,
  sistemStatusu: 'bitti', nedenler: ['Bitmiş adımda gürültü'], maddeler: [], elle: null, onaylar: [], elleEksikler: [], gecmis: [], tedarik: [], liste: [], ekMaddeler: [], sablon: null,
} satisfies AdimDurumuCevabi['adimlar'][number];
const DURUM = {
  emirId: 5, emirNo: 'UE-0005', urun: { kod: 'DNM-005', ad: 'Deneme flanş' }, adet: 40, teslim: null, durum: 'basladi', rotaYuzde: 50,
  hazirlik: { maddeler: [], muafiyetler: [], isEmirleri: [] }, yetki: { ekMadde: false, sablon: false },
  adimlar: [
    ADIM,
    {
      ...ADIM, isEmriId: 52, opNo: 20, ad: 'CNC freze', durum: 'bekliyor', yapilan: 0, yuzde: 0, sistemStatusu: 'program', nedenler: ['CNC kurulumu (NC) eksik'],
      elle: { statu: 'malzeme', not: 'Çubuk bekleniyor', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' },
    },
    { ...ADIM, isEmriId: 53, opNo: 30, ad: 'Taşlama', durum: 'bekliyor', yapilan: 0, yuzde: 0, sistemStatusu: 'program', nedenler: ['CNC kurulumu (NC) eksik'] },
  ],
} satisfies AdimDurumuCevabi;
const isEmri = (opNo: number, ek: Partial<IsEmri> = {}): IsEmri => ({
  id: 50 + opNo / 10, opNo, sira: opNo / 10, tip: { id: 1, ad: 'Tornalama', kod: 'TOR' }, ad: `Adım ${String(opNo)}`, tur: 'rota', ekAciklama: null,
  kaynak: { tur: 'makine', id: 4, kod: 'M-1', ad: 'Tezgah' }, istasyon: { id: 2, kod: 'IS-1', ad: 'İstasyon 1' }, ayarSuresiDk: '10', birimSureDk: '2',
  terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, durum: 'bekliyor', baslama: null, bitis: null, saglamAdet: null,
  bilesenler: [], adaylar: [], fason: null, uretimYeriDegisimi: null, ...ek,
});
const ADIMLI: AdimliEmirAyrintisi = {
  id: 5, emirNo: 'UE-0005', urun: { id: 501, kod: 'DNM-005', ad: 'Deneme flanş' }, adet: 40, oncelik: 3, baslangic: null, teslim: null, durum: 'basladi', arsiv: false,
  kaynakRotaRevizyonId: 1, adimSayisi: 3, tamamAdim: 1, siradaki: null, aciklama: null, acilma: '2026-10-06T08:00:00+00:00', surum: 4, eski: null,
  isEmirleri: [
    isEmri(10, { durum: 'tamam', saglamAdet: 40 }),
    isEmri(20, { kararBekliyor: 3, eksikAltParcalar: [{ ad: 'K1', malzeme: { id: 77, kod: 'DNM-ALT', ad: 'Deneme burç' } }] }),
    isEmri(30, { kaynak: { tur: 'fason', id: 41, kod: 'F-01', ad: 'Deneme kaplama' }, istasyon: null }),
  ],
};
const ILERLEME: EmirAyrintiCevabi['ilerleme'] = {
  esas: 'adim', rota: 33, adimlar: [
    { opNo: 10, ad: 'Testere kesim', dal: null, durum: 'tamam', hedef: 40, yapilan: 40, yuzde: 100 },
    { opNo: 20, ad: 'CNC freze', dal: null, durum: 'bekliyor', hedef: 40, yapilan: 0, yuzde: 0 },
  ],
};
const parcalar: EmirParcalari = {
  sar: (icerik) => icerik,
  islemler: () => null,
  adimlar: (_id, ek) => (
    <ol aria-label="Adımlar">
      {[10, 20, 30].map((op) => <li key={op}>OP {op} {ek(op, <span>yedek rozet</span>)}</li>)}
    </ol>
  ),
  malzeme: () => null,
};
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: () => <EmirAyrintisi parcalar={parcalar} /> }];
const yollar = {
  'GET /uretim-emirleri/5': () => json(200, { emir: EMIR, kayitlar: [], ilerleme: ILERLEME } satisfies EmirAyrintiCevabi),
  'GET /adimli-emirler/5/adim-durumu': () => json(200, DURUM),
  'GET /adimli-emirler/5': () => json(200, { emir: ADIMLI }),
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Emir sayfasında adım satırı (3039)', () => {
  it('her adımda Adım Durumu statüsü; elle yazıldıysa kim ve ne zaman, değilse bekleyen adımda ilk neden; bitmiş adımda neden yok', async () => {
    sunucuKur(OKUYUCU, yollar);
    ac(ekran, '/uretim-emirleri/5');
    const liste = await screen.findByRole('list', { name: 'Adımlar' });
    const satir = (op: number) => within(liste).getByText(`OP ${String(op)}`, { exact: false }).closest('li')!;
    expect(await within(satir(20)).findByText('Malzeme bekliyor')).toBeTruthy();
    expect(within(satir(20)).getByText(/^Elle: Deneme Müdür · /).getAttribute('title')).toBe('Çubuk bekleniyor');
    expect(within(satir(10)).getByText('Bitti')).toBeTruthy();
    expect(within(satir(10)).queryByText('Bitmiş adımda gürültü')).toBeNull();
    expect(within(satir(30)).getByText('CNC kurulumu (NC) eksik')).toBeTruthy();
    expect(within(liste).queryByText('yedek rozet')).toBeNull();
  });

  it('1787c ve K21 a: karar bekleyen sayım ve eksik alt parça adımın yanında; fason adım yeriyle', async () => {
    sunucuKur(OKUYUCU, yollar);
    ac(ekran, '/uretim-emirleri/5');
    const liste = await screen.findByRole('list', { name: 'Adımlar' });
    expect(await within(liste).findByText('Karar bekleyen 3')).toBeTruthy();
    expect(within(liste).getByText('Alt parça bekleniyor: K1 DNM-ALT')).toBeTruthy();
    expect(within(liste).getByText('Dış üretim: F-01 Deneme kaplama')).toBeTruthy();
  });

  it('"Şu an" kutusu sıradaki adımın statüsünü ve yazan kişiyi söyler', async () => {
    sunucuKur(OKUYUCU, yollar);
    ac(ekran, '/uretim-emirleri/5');
    const ozet = await screen.findByRole('group', { name: 'Emrin özeti' });
    expect(await within(ozet).findByText('Sırada · Malzeme bekliyor · Deneme Müdür')).toBeTruthy();
    expect(within(ozet).getByText('OP 20 CNC freze')).toBeTruthy();
  });

  it('adımın menüsü: Adım Durumu sayfası olana geçiş, emri yazana iç/fason; ikisi de yoksa menü yok', async () => {
    sunucuKur(OKUYUCU, yollar);
    ac(ekran, '/uretim-emirleri/5');
    await screen.findByText('Malzeme bekliyor');
    expect(screen.queryByRole('button', { name: 'OP 20 için' })).toBeNull();
    cleanup();
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.duzenle'] }, yollar);
    const Matris = () => <p>Adım Durumu sayfası</p>;
    ac([...ekran, { yol: '/adim-durumu', ekran: Matris }], '/uretim-emirleri/5');
    await screen.findByText('Malzeme bekliyor');
    fireEvent.click(await screen.findByRole('button', { name: 'OP 20 için' }));
    expect(screen.getByRole('menuitem', { name: 'Fasona al' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: "Adım Durumu'nda aç" }));
    expect(await screen.findByText('Adım Durumu sayfası')).toBeTruthy();
  });
});

describe('Emir sayfasında SmartES rozeti (3346)', () => {
  const SMARTES = {
    emirler: [{
      emirId: 5,
      toplam: { durum: 'durdu', gonderilmez: null, gonderilen: 1, toplam: 2, opNo: 20, neden: 'SmartES reddetti: Kilitli' },
      adimlar: [
        { isEmriId: 51, opNo: 10, ad: 'Testere kesim', durum: 'gonderildi', gonderilmez: null, smartesNo: 'UE-0005-10', neden: null },
        { isEmriId: 52, opNo: 20, ad: 'CNC freze', durum: 'durdu', gonderilmez: null, smartesNo: 'UE-0005-20', neden: 'SmartES reddetti: Kilitli' },
        { isEmriId: 53, opNo: 30, ad: 'Taşlama', durum: null, gonderilmez: 'esleme-yok', smartesNo: null, neden: null },
      ],
    }],
  } satisfies SmartesEmirDurumlariCevabi;
  it('başlıkta "SmartES: Durdu" ve nereye gidileceği; adımda rozet, neden ve gitmeyen adımın nedeni', async () => {
    const istekler = sunucuKur(OKUYUCU, { ...yollar, 'GET /smartes/emir-durumlari': () => json(200, SMARTES) });
    ac(ekran, '/uretim-emirleri/5');
    const liste = await screen.findByRole('list', { name: 'Adımlar' });
    await within(liste).findAllByText('SmartES: Durdu');
    // Başlıkta (adım listesinin dışında) toplam rozet ve yetkisize "Yöneticiye bildirin".
    expect(screen.getAllByText('SmartES: Durdu').filter((e) => !liste.contains(e))).toHaveLength(1);
    expect(screen.getByText('Yöneticiye bildirin')).toBeTruthy();
    const satir = (op: number) => within(liste).getByText(`OP ${String(op)}`, { exact: false }).closest('li')!;
    expect(within(satir(10)).getByText("SmartES'te").closest('[title]')?.getAttribute('title')).toBe('SmartES iş emri UE-0005-10');
    expect(within(satir(20)).getByText('SmartES: Durdu')).toBeTruthy();
    expect(within(satir(20)).getByText('SmartES reddetti: Kilitli')).toBeTruthy();
    expect(within(satir(30)).getByText("SmartES'e gitmez").getAttribute('title')).toMatch(/eşlemesi yok/);
    // Başlık ve satırlar tek istekle okunur.
    expect(istekler.filter((i) => i.yol.startsWith('/smartes/emir-durumlari')).map((i) => i.yol)).toEqual(['/smartes/emir-durumlari?emir=5']);
  });
  it('okunamazsa "Okunamadı" yazar, gönderilmez ile karışmaz', async () => {
    sunucuKur(OKUYUCU, { ...yollar, 'GET /smartes/emir-durumlari': () => json(500, { kod: 'SUNUCU', mesaj: 'x' }) });
    ac(ekran, '/uretim-emirleri/5');
    const liste = await screen.findByRole('list', { name: 'Adımlar' });
    await screen.findAllByText('SmartES: okunamadı');
    expect(screen.getAllByText('SmartES: okunamadı').filter((e) => !liste.contains(e))).toHaveLength(1);
    expect(within(liste).queryByText('SmartES: okunamadı')).toBeNull();
    expect(screen.queryByText("SmartES'e gitmez")).toBeNull();
  });
  it('emri okuma yetkisi olmayan (yalnız Adım Durumu) için istek atılmaz, rozet yok', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: ['sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/uretim-emirleri/5');
    await screen.findByText('UE-0005');
    expect(istekler.some((i) => i.yol.startsWith('/smartes/'))).toBe(false);
    expect(screen.queryByText(/SmartES/)).toBeNull();
  });
});
