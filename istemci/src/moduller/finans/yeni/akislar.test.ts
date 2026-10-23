import { describe, expect, it } from 'vitest';
import {
  akisKomutu, bosDegerler, cekDurumKomutu, duzenliOdendiKomutu, firmaEtiketleri, MOTOR_KATEGORILERI, OLAY_GRUPLARI, OLAY_KATEGORILERI, OLAYLAR,
  takiptekiCekler, type AkisDegerleri, type CekDurumu, type Komut, type KomutSonucu, type OlayTuru,
} from './akislar.ts';
import { KAT_KOD } from './donustur.ts';
import { ornekHamVeri } from './ornek-ham-veri.ts';
import { finansiKur } from './veri.ts';

const BUGUN = '2026-10-15';
const { V, motor } = finansiKur(ornekHamVeri(), BUGUN);
// Firma 1 yalnız müşteri, firma 2 yalnız tedarikçi; firma 3 ikisidir ve açık EUR faturası vardır.
const musteri = firmaEtiketleri(V, 'gelir').find((e) => e.includes('M1'))!;
const tedarikci = firmaEtiketleri(V, 'gider').find((e) => e.startsWith('Deneme Tedarik'))!;
const deger = (tur: OlayTuru, ek: Partial<AkisDegerleri>): AkisDegerleri => ({ ...bosDegerler(tur, BUGUN), ...ek });

const komutlar = (s: KomutSonucu): Komut[] => {
  if ('hata' in s) throw new Error(`Komut kurulamadı: ${s.hata}`);
  return s.komutlar;
};

// Her olay sunucudaki tek bir yazma ucuna gider (sunucu/moduller/finans/uclar.ts); gövdenin belirleyici alanları beklenendir.
// Tekrar korumalı uçlar sunucudaki `tekrarKorumali` işaretiyle aynıdır. İstemci sözleşme şemasını değer olarak ithal edemez (zod).
const DURUMLAR: readonly [string, OlayTuru, Partial<AkisDegerleri>, string, Record<string, unknown>, boolean][] = [
  ['satış faturası', 'satis', { party: musteri, amount: '1000' }, 'POST /finans/belgeler/ekle', { yon: 'gelir', tur: 'fatura', firmaId: 1, tutar: 1000, kdvOrani: 20, paraBirimi: 'TRY', kur: 1 }, true],
  ['peşin satış', 'satis', { party: musteri, amount: '1000', method: 'pesin', hesap: '1' }, 'POST /finans/belgeler/ekle', { yon: 'gelir', pesin: { yontem: 'banka', hesapId: 1, tarih: BUGUN } }, true],
  ['alış faturası', 'alis', { party: tedarikci, amount: '500', cat: 'Kira' }, 'POST /finans/belgeler/ekle', { yon: 'gider', tur: 'fatura', kategori: 'kira', firmaId: 2, tutar: 500 }, true],
  ['banka tahsilatı', 'tahsilat', { party: musteri, amount: '100', hesap: '1' }, 'POST /finans/odemeler/ekle', { yon: 'gelir', firmaId: 1, yontem: 'banka', hesapId: 1, tutar: 100 }, true],
  ['banka ödemesi', 'odeme', { party: tedarikci, amount: '100', hesap: '1' }, 'POST /finans/odemeler/ekle', { yon: 'gider', firmaId: 2, yontem: 'banka', hesapId: 1, tutar: 100 }, true],
  ['çek alındı', 'cekal', { party: musteri, amount: '500' }, 'POST /finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: 1, tutar: 500 }, true],
  ['çek verildi', 'cekver', { party: tedarikci, amount: '500' }, 'POST /finans/cekler/ekle', { yon: 'verilen', tur: 'cek', firmaId: 2, tutar: 500 }, true],
  ['düzenli ödeme', 'sabit', { hesap: '1', amount: '5000' }, 'POST /finans/belgeler/ekle', { yon: 'gider', tur: 'faturasiz', firmaId: null, tutar: 5000, kdvOrani: 0 }, true],
  ['banka bakiyesi', 'banka', { hesap: '1', gercek: '150100' }, 'POST /finans/hesaplar/:id/esitle', { tarih: BUGUN, gercekBakiye: 150100 }, true],
  ['hesaplar arası aktarım', 'virman', { kaynak: '1', hedef: '2', amount: '100' }, 'POST /finans/virmanlar/ekle', { kaynakHesapId: 1, hedefHesapId: 2, tutar: 100 }, true],
  ['mahsup', 'mahsup', { satis: '3', alis: '2', satisTutari: '10' }, 'POST /finans/mahsuplar/ekle', { firmaId: 3, satisBelgeId: 3, alisBelgeId: 2, satisTutari: 10 }, true],
  ['avans düşme', 'avans', { odeme: '4', belge: '2', amount: '100' }, 'POST /finans/odemeler/:id/dagit', { dagitimlar: [{ belgeId: 2, belgeTutari: 100 }] }, true],
  ['satış iadesi', 'iadesat', { asil: '1', amount: '100' }, 'POST /finans/belgeler/ekle', { yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: 1, tutar: 100 }, true],
  ['alış iadesi', 'iadealis', { asil: '2', amount: '100' }, 'POST /finans/belgeler/ekle', { yon: 'gelir', tur: 'iade', kategori: 'alis_iadesi', iadeBelgeId: 2, tutar: 100 }, true],
];

describe('akisKomutu: olay -> uç', () => {
  it.each(DURUMLAR)('%s', (_, tur, ek, uc, govde, tekrar) => {
    const [k, ...geri] = komutlar(akisKomutu(tur, deger(tur, ek), V, motor));
    expect(geri).toHaveLength(0);
    expect(k!.uc).toBe(uc);
    expect(k!.tekrar).toBe(tekrar);
    expect(k!.govde).toMatchObject(govde);
  });

  it('form olayları tabloda eksiksizdir (çekin durumu kendi düğmeleriyle gider)', () => {
    const formOlaylari = OLAY_GRUPLARI.flatMap((g) => g.olaylar.map((o) => o.tur)).filter((t) => t !== 'cekdurum');
    expect(new Set(DURUMLAR.map((d) => d[1]))).toEqual(new Set(formOlaylari));
    expect(akisKomutu('cekdurum', deger('cekdurum', {}), V, motor)).toEqual({ hata: 'Bu olay form ile kaydedilmez.' });
  });

  it('senet seçilince çek ucuna senet türüyle gider', () => {
    const [k] = komutlar(akisKomutu('cekal', deger('cekal', { party: musteri, amount: '500', method: 'senet' }), V, motor));
    expect(k!.uc).toBe('POST /finans/cekler/ekle');
    expect((k!.govde as { tur: string }).tur).toBe('senet');
  });

  it('kredi taksiti anapara ve faiz için iki belge açar', () => {
    const k = komutlar(akisKomutu('sabit', deger('sabit', { hesap: '1', cat: 'kredi', principal: '1000', interest: '100' }), V, motor));
    expect(k.map((x) => (x.govde as { kategori: string }).kategori)).toEqual(['kredi_anapara', 'faiz']);
    for (const x of k) expect(x.uc).toBe('POST /finans/belgeler/ekle');
  });

  it('eksik girişte uca gitmez, nedenini söyler', () => {
    expect(akisKomutu('satis', deger('satis', { party: musteri }), V, motor)).toEqual({ hata: 'Tutar girin.' });
    expect(akisKomutu('odeme', deger('odeme', { party: tedarikci, amount: '100' }), V, motor)).toEqual({ hata: 'Hesap seçin.' });
    expect('hata' in akisKomutu('satis', deger('satis', { party: 'Olmayan firma', amount: '1' }), V, motor)).toBe(true);
    // Firma 3'ün açık EUR faturası var: TL tahsilat ona düşerken çapraz kur ister.
    const ikisi = firmaEtiketleri(V, 'gelir').find((e) => e !== musteri)!;
    expect(akisKomutu('tahsilat', deger('tahsilat', { party: ikisi, amount: '100', hesap: '1' }), V, motor)).toEqual({ hata: 'EUR belge için çapraz kur girin.' });
  });

  it('formdaki kategoriler motorun ve sunucunun kategorileridir', () => {
    for (const [ad] of [...OLAY_KATEGORILERI.satis, ...OLAY_KATEGORILERI.alis, ...OLAY_KATEGORILERI.sabit.filter(([k]) => k !== 'kredi')]) {
      expect(MOTOR_KATEGORILERI).toContain(ad);
      expect(KAT_KOD[ad]).toBeTruthy();
    }
  });

  it('her olayın başlığı ve simgesi vardır', () => {
    for (const o of Object.values(OLAYLAR)) expect(o.baslik && o.simge).toBeTruthy();
  });
});

describe('çekin durumu ve düzenli ödeme', () => {
  const portfoy = takiptekiCekler(V).find((c) => c.id === 1)!;
  it('tahsile verme yalnız sürümü gönderir', () => {
    const [k] = komutlar(cekDurumKomutu(V, motor, portfoy, 'tahsilde'));
    expect(k).toMatchObject({ uc: 'POST /finans/cekler/:id/tahsile-ver', parametre: { id: 1 }, tekrar: false, govde: { surum: 1 } });
  });
  const CEK: readonly [CekDurumu, string, Record<string, unknown>, boolean, { hesap?: string; party?: string }][] = [
    ['tahsil', 'POST /finans/cekler/:id/tahsil', { surum: 1, hesapId: 1, tarih: BUGUN }, false, { hesap: '1' }],
    ['odendi', 'POST /finans/cekler/:id/odendi', { surum: 1, hesapId: 1, tarih: BUGUN }, false, { hesap: '1' }],
    ['karsiliksiz', 'POST /finans/cekler/:id/karsiliksiz', { surum: 1, tarih: BUGUN }, false, {}],
    ['ciro', 'POST /finans/cekler/:id/ciro', { surum: 1, firmaId: 2, tarih: BUGUN }, true, { party: tedarikci }],
  ];
  it.each(CEK)('%s', (durum, uc, govde, tekrar, ek) => {
    const [k] = komutlar(cekDurumKomutu(V, motor, portfoy, durum, ek));
    expect(k!.uc).toBe(uc);
    expect(k!.parametre).toEqual({ id: 1 });
    expect(k!.tekrar).toBe(tekrar);
    expect(k!.govde).toMatchObject(govde);
  });

  it('düzenli ödeme "Ödendi" kendi ucuna gider', () => {
    const [k] = komutlar(duzenliOdendiKomutu(V, motor, 1));
    expect(k!.uc).toBe('POST /finans/duzenli-odemeler/:id/odendi');
    expect(k!.govde).toMatchObject({ tarih: BUGUN, hesapId: 1, yontem: 'banka' });
  });
});
