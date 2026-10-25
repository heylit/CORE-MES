import { describe, expect, it } from 'vitest';
import { finansiKur } from '../veri.ts';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import type { Komut } from '../akislar.ts';
import {
  ayarKomutu, duzenliEkleKomutu, duzenliGuncelleKomutu, duzenliKaldirKomutu, faizKomutu, hesapDurumKomutu, hesapKomutu, kdvKomutu, kiymetEkleKomutu,
  kiymetPasifKomutu, kurKomutu, kurulumKomutlari, topluAktarKomutu,
} from './komutlar.ts';

// Ayarlar'ın her komutu sunucuda tanımlı bir yazma ucuna gider; değer, sunucudaki tekrar koruması işaretidir (finans uclar.ts).
const SUNUCU = new Map<string, boolean>([
  ['POST /finans/ayar/guncelle', false],
  ['POST /finans/duzenli-odemeler/ekle', true],
  ['POST /finans/duzenli-odemeler/:id/guncelle', false],
  ['POST /finans/hesaplar/ekle', false],
  ['POST /finans/hesaplar/:id/guncelle', false],
  ['POST /finans/hesaplar/:id/pasif', false],
  ['POST /finans/hesaplar/:id/aktif', false],
  ['POST /finans/kdv-oranlari/ekle', false],
  ['POST /finans/kurlar/ekle', false],
  ['POST /finans/kurlar/guncelle', false],
  ['POST /finans/faizler/ekle', true],
  ['POST /finans/sabit-kiymetler/ekle', true],
  ['POST /finans/sabit-kiymetler/:id/pasif', false],
  ['POST /finans/toplu-ice-aktar', true],
]);

const { V } = finansiKur(ornekHamVeri(), '2026-10-20');
const hesap = V.hesaplar[0]!, dz = V.duzenliOdemeler[0]!;
const kiymet = { id: 7, surum: 2 } as never;
const KOMUTLAR: [string, Komut][] = [
  ['ayar', ayarKomutu(V.ayar, V.sirketAdi, { riskToleransi: 10 })],
  ['düzenli ekle', duzenliEkleKomutu()],
  ['düzenli güncelle', duzenliGuncelleKomutu(dz, 'tutar', '9000')],
  ['düzenli kaldır', duzenliKaldirKomutu(dz)],
  ['hesap ekle', hesapKomutu({ ad: 'A', tur: 'kasa', pb: 'TRY', acilis: '0', acilisTarihi: '2026-10-20', bankaAdi: '', logoKodu: '' }, null)],
  ['hesap güncelle', hesapKomutu({ ad: 'A', tur: 'banka', pb: 'TRY', acilis: '0', acilisTarihi: '2026-01-01', bankaAdi: 'B', logoKodu: '' }, hesap)],
  ['hesap pasif', hesapDurumKomutu(hesap)],
  ['hesap aktif', hesapDurumKomutu({ ...hesap, aktif: false })],
  ['kdv', kdvKomutu('10', '2026-11-01')],
  ['kur ekle', kurKomutu(V, 'usd', '2026-10-20', '33')],
  ['kur düzelt', kurKomutu(V, 'EUR', '2026-10-01', '36')],
  ['faiz', faizKomutu('TRY', '2026-11-01', '3.1')],
  ['sabit kıymet ekle', kiymetEkleKomutu({ ad: 'Torna', makineKodu: '', alisTarihi: '2026-10-01', bedel: '1000', pb: 'try', kur: '', omurAy: '120', yontem: 'normal', kalinti: '0', devirTarihi: '', devirBirikmis: '', aciklama: '' })],
  ['sabit kıymet pasif', kiymetPasifKomutu(kiymet, '2026-10-31')],
  ['toplu aktar', topluAktarKomutu([{ belgeTarihi: '2026-10-01', yon: 'gelir', kategori: 'urun_satisi', firma: 'A', aciklama: 'S', tutar: 10.005, kdvOrani: 20, vade: '2026-10-01' }])],
];

describe('F4 ayar komutları', () => {
  it.each(KOMUTLAR)('%s: sunucudaki uca gider, tekrar koruması aynı', (_, k) => {
    expect(SUNUCU.has(k.uc)).toBe(true);
    expect(k.tekrar).toBe(SUNUCU.get(k.uc));
    expect(k.uc.includes(':id')).toBe(k.parametre !== undefined);
  });

  it('gövdeler', () => {
    const b = Object.fromEntries(KOMUTLAR.map(([ad, k]) => [ad, k]));
    expect(b['düzenli güncelle']!.govde).toMatchObject({ ad: 'Kira', tutar: 9000, surum: 1, aktif: true });
    expect(b['hesap güncelle']!).toMatchObject({ uc: 'POST /finans/hesaplar/:id/guncelle', parametre: { id: 1 }, govde: { bankaAdi: 'B', logoKodu: null, surum: 1 } });
    expect(b['hesap pasif']!.uc).toBe('POST /finans/hesaplar/:id/pasif');
    expect(b['hesap aktif']!.uc).toBe('POST /finans/hesaplar/:id/aktif');
    expect(b['kur ekle']!).toMatchObject({ uc: 'POST /finans/kurlar/ekle', govde: { paraBirimi: 'USD', kur: 33 } });
    expect(b['kur düzelt']!).toMatchObject({ uc: 'POST /finans/kurlar/guncelle', govde: { paraBirimi: 'EUR', surum: 1 } });
    expect(b['sabit kıymet ekle']!.govde).toEqual({
      ad: 'Torna', makineKodu: null, paraBirimi: 'TRY', bedel: 1000, alisTarihi: '2026-10-01', omurAy: 120, yontem: 'normal', kalintiDegeri: 0,
      devirTarihi: null, devirBirikmisTl: null, aciklama: null,
    });
    expect(b['sabit kıymet pasif']!).toMatchObject({ parametre: { id: 7 }, govde: { pasifTarihi: '2026-10-31', surum: 2 } });
    expect((b['toplu aktar']!.govde as { satirlar: { tutar: number }[] }).satirlar[0]!.tutar).toBe(10.01);
  });

  it('ilk kurulum: önce hesaplar, en son kurulum tamam işareti', () => {
    const k = kurulumKomutlari(V, { ad: 'X', sektor: 'genel', esik: '50000', bankaAd: '', banka: '1000', kasa: '0' }, '2026-10-20');
    expect(k.map((x) => x.uc)).toEqual(['POST /finans/hesaplar/ekle', 'POST /finans/ayar/guncelle']);
    expect(k[0]!.govde).toMatchObject({ ad: 'Banka', tur: 'banka', acilisBakiyesi: 1000, acilisTarihi: '2026-10-20' });
    // Satın almadaki şirket adı esastır.
    expect(k[1]!.govde).toMatchObject({ sirketAdi: 'Deneme Sirketi', sektor: 'genel', nakitEsigi: 50000, kurulumTamam: true });
    expect(kurulumKomutlari(V, { ad: 'X', sektor: 'genel', esik: '0', bankaAd: '', banka: '0', kasa: '0' }, '2026-10-20')).toHaveLength(1);
  });
});
