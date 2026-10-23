import { describe, expect, it } from 'vitest';
import {
  adayPuani, asamaTonu, degerlendirilebilirMi, degerlendirmeBekleyenler, departmanOrtalamalari, donemler, durumDegisimi, egitimGostergeleri,
  egitimSuz, enYuksekler, gorusmeSonrasiAsama, iseAlimGostergeleri, isgEksikler, kanalMetni, kanalSuresiDoldu, kaynakDagilimi, komsuAsama,
  kriterOrtalamalari, kriterPuani, oneriOzeti, performansSonucu, performansSuz, pozisyonKopyasi, pozisyonSirala, puanMetni, puanOrtalamasi,
  sertifikaDurumu, sonrakiGorusme, sonucDagilimi, surecteMi, yayinIsaretle, yayinKapat, yayindakiKanallar,
} from './kurallar.ts';

const ASAMALAR = ['Başvuru', 'Ön görüşme', 'Mülakat', 'Teklif', 'İşe alındı', 'Reddedildi'];
const BUGUN = '2026-10-23';

describe('puanlama', () => {
  it('yalniz sifirdan buyuk puanlarin ortalamasini alir, puan yoksa null', () => {
    expect(puanOrtalamasi({ skorlar: { a: 4, b: '5', c: 0, d: '' } })).toBe(4.5);
    expect(puanOrtalamasi({ skorlar: {} })).toBeNull();
    expect(puanOrtalamasi({})).toBeNull();
  });
  it('sonuc esikleri bugunku ekranla ayni', () => {
    expect(performansSonucu(4.5).etiket).toBe('Beklentinin çok üzerinde');
    expect(performansSonucu(4.49).etiket).toBe('Beklentinin üzerinde');
    expect(performansSonucu(2.5)).toEqual({ etiket: 'Beklentiyi karşılıyor', ton: 'info' });
    expect(performansSonucu(1.5).ton).toBe('warn');
    expect(performansSonucu(1).ton).toBe('bad');
    expect(performansSonucu(null)).toEqual({ etiket: 'Puanlanmadı', ton: null });
  });
  it('puan metni iki basamak, veri yoksa null', () => {
    expect(puanMetni(3.456)).toBe('3,46');
    expect(puanMetni(null)).toBeNull();
  });
});

describe('performans', () => {
  const ps = [
    { id: 'p1', empId: 'e1', donem: '2025 Yıllık', tarih: '2025-12-20', skorlar: { Iletisim: 5, Kalite: 4 } },
    { id: 'p2', empId: 'e2', donem: '2026 Yıllık', tarih: '2026-06-01', skorlar: { Iletisim: 2 } },
    { id: 'p3', empId: 'e1', donem: '2026 Yıllık', tarih: '2026-07-01', skorlar: {} },
  ];
  const dept = (e: string | undefined) => (e === 'e1' ? 'd1' : 'd2');
  const ad = (e: string | undefined) => (e === 'e1' ? 'Ayse Deneme' : 'Ali Ornek');
  it('donemler yeniden eskiye', () => expect(donemler(ps)).toEqual(['2026 Yıllık', '2025 Yıllık']));
  it('suzgec donem, departman ve ad aramasi; tarih azalan', () => {
    expect(performansSuz(ps, { donem: '', departman: '', arama: '' }, dept, ad).map((p) => p.id)).toEqual(['p3', 'p2', 'p1']);
    expect(performansSuz(ps, { donem: '2026 Yıllık', departman: 'd1', arama: '' }, dept, ad).map((p) => p.id)).toEqual(['p3']);
    expect(performansSuz(ps, { donem: '', departman: '', arama: 'ORNEK' }, dept, ad).map((p) => p.id)).toEqual(['p2']);
  });
  it('dagilim puansizi saymaz', () => {
    expect(sonucDagilimi(ps)).toEqual([{ etiket: 'Beklentinin çok üzerinde', deger: 1 }, { etiket: 'Gelişime açık', deger: 1 }]);
  });
  it('departman ve kriter ortalamalari', () => {
    expect(departmanOrtalamalari(ps, (e) => (e === 'e1' ? 'Uretim' : 'Ofis'))).toEqual([{ etiket: 'Uretim', deger: 4.5 }, { etiket: 'Ofis', deger: 2 }]);
    expect(kriterOrtalamalari(ps, ['Iletisim', 'Yok'])).toEqual([{ etiket: 'Iletisim', deger: 3.5 }, { etiket: 'Yok', deger: null }]);
  });
});

describe('egitim', () => {
  const ts = [
    { id: 't1', ad: 'Temel ISG', tur: 'İSG (zorunlu)', durum: 'Tamamlandı', tarih: '2026-02-01', sure: 8, maliyet: 1000, katilimcilar: ['e1', 'e2'], gecerlilik: '2027-02-01' },
    { id: 't2', ad: 'Eski ISG', tur: 'İSG (zorunlu)', durum: 'Tamamlandı', tarih: '2024-02-01', sure: 8, katilimcilar: ['e3'], gecerlilik: '2026-01-01' },
    { id: 't3', ad: 'CNC', kurum: 'Okul', tur: 'Teknik', durum: 'Planlandı', tarih: '2026-11-01', sure: 4, katilimcilar: ['e1'] },
  ];
  it('gostergeler yilin tamamlananlarindan', () => {
    expect(egitimGostergeleri(ts, '2026', 4)).toEqual({ tamamlanan: 1, katilimSaati: 16, kisiBasiSaat: 4, harcama: 1000 });
    expect(egitimGostergeleri(ts, '2026', 0).kisiBasiSaat).toBeNull();
  });
  it('suzgec tur, durum ve ad ya da kurum', () => {
    expect(egitimSuz(ts, { tur: 'Teknik', durum: '', arama: '' }).map((t) => t.id)).toEqual(['t3']);
    expect(egitimSuz(ts, { tur: '', durum: '', arama: 'okul' }).map((t) => t.id)).toEqual(['t3']);
    expect(egitimSuz(ts, { tur: '', durum: 'Tamamlandı', arama: '' }).map((t) => t.id)).toEqual(['t1', 't2']);
  });
  it('sertifika durumu: dolmus, 30 gun icinde, gecerli', () => {
    expect(sertifikaDurumu('2026-10-22', BUGUN)).toEqual({ tur: 'doldu' });
    expect(sertifikaDurumu('2026-11-22', BUGUN)).toEqual({ tur: 'yaklasiyor', tarih: '2026-11-22' });
    expect(sertifikaDurumu('2027-01-01', BUGUN)).toEqual({ tur: 'gecerli', tarih: '2027-01-01' });
    expect(sertifikaDurumu('', BUGUN)).toBeNull();
  });
  it('gecerli ISG egitimi olmayan aktifler', () => {
    const aktif = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }, { id: 'e4' }];
    expect(isgEksikler(ts, aktif, BUGUN).map((p) => p.id)).toEqual(['e3', 'e4']);
  });
});

describe('ise alim', () => {
  const gs = [
    { id: 'g1', candId: 'c1', tur: 'İK mülakatı', tarih: '2026-10-10', saat: '10:00', durum: 'Tamamlandı', oneri: 'Alınsın', skorlar: { A: 4, B: 5 } },
    { id: 'g2', candId: 'c1', tur: 'Teknik mülakat', tarih: '2026-10-12', durum: 'Tamamlandı', oneri: 'Kararsız', skorlar: { A: 3 } },
    { id: 'g3', candId: 'c1', tur: 'Yönetici mülakatı', tarih: '2026-10-25', durum: 'Planlandı' },
    { id: 'g4', candId: 'c2', tur: 'İK mülakatı', tarih: '2026-10-20', durum: 'Planlandı' },
    { id: 'g5', candId: 'silinmis', tarih: '2026-10-20', durum: 'Planlandı' },
  ];
  it('aday puani tamamlanan gorusmelerin ortalamasi', () => {
    expect(adayPuani(gs, 'c1')).toBe(3.75);
    expect(adayPuani(gs, 'c2')).toBeNull();
  });
  it('sonraki gorusme bugun ya da sonra', () => {
    expect(sonrakiGorusme(gs, 'c1', BUGUN)?.id).toBe('g3');
    expect(sonrakiGorusme(gs, 'c2', BUGUN)).toBeNull();
  });
  it('degerlendirme bekleyenler adayi olan gecmis planlilar', () => {
    expect(degerlendirmeBekleyenler(gs, (id) => id === 'c1' || id === 'c2', BUGUN).map((g) => g.id)).toEqual(['g4']);
    expect(degerlendirilebilirMi(gs[2]!, BUGUN)).toBe(false);
    expect(degerlendirilebilirMi(gs[3]!, BUGUN)).toBe(true);
  });
  it('oneri ozeti sabit sirayla', () => {
    expect(oneriOzeti(gs, 'c1', ['Kesinlikle alınsın', 'Alınsın', 'Kararsız', 'Alınmasın'])).toEqual([{ oneri: 'Alınsın', sayi: 1 }, { oneri: 'Kararsız', sayi: 1 }]);
  });
  it('gorusme planlaninca asama ileri alinir, geri alinmaz, biten adayda degismez', () => {
    expect(gorusmeSonrasiAsama({ id: 'c', asama: 'Başvuru' }, 'Telefon ön görüşmesi', ASAMALAR)).toBe('Ön görüşme');
    expect(gorusmeSonrasiAsama({ id: 'c' }, 'İK mülakatı', ASAMALAR)).toBe('Mülakat');
    expect(gorusmeSonrasiAsama({ id: 'c', asama: 'Teklif' }, 'İK mülakatı', ASAMALAR)).toBeNull();
    expect(gorusmeSonrasiAsama({ id: 'c', asama: 'Reddedildi' }, 'İK mülakatı', ASAMALAR)).toBeNull();
  });
  it('komsu asama sinirda kalir', () => {
    expect(komsuAsama({ id: 'c' }, -1, ASAMALAR)).toBe('Başvuru');
    expect(komsuAsama({ id: 'c', asama: 'Mülakat' }, 1, ASAMALAR)).toBe('Teklif');
    expect(surecteMi({ asama: 'İşe alındı' })).toBe(false);
    expect(asamaTonu(undefined)).toBe('info');
  });
  it('gostergeler: ortalama sure ve kabul orani, veri yoksa null', () => {
    const adaylar = [
      { id: 'c1', asama: 'İşe alındı', basvuruTarihi: '2026-09-01', iseAlimTarihi: '2026-09-21', teklifYanit: 'Kabul etti' },
      { id: 'c2', asama: 'Teklif', teklifYanit: 'Reddetti' },
      { id: 'c3', asama: 'Mülakat' },
    ];
    const g = iseAlimGostergeleri([{ id: 'j1', durum: 'Açık' }, { id: 'j2', durum: 'Onay bekliyor' }], adaylar, gs, 1, BUGUN);
    expect(g).toEqual({ acik: 1, onayBekleyen: 1, surecte: 2, haftalikGorusme: 1, bekleyen: 1, ortSure: 20, kabulOrani: 50 });
    expect(iseAlimGostergeleri([], [], [], 0, BUGUN)).toMatchObject({ ortSure: null, kabulOrani: null });
  });
  it('karsilastirma kriter puani ve en yuksek', () => {
    expect(kriterPuani(gs, 'c1', 'A')).toBe(3.5);
    expect(kriterPuani(gs, 'c1', 'Z')).toBeNull();
    expect(enYuksekler([3, null, 4])).toBe(4);
    expect(enYuksekler([3])).toBeNull();
  });
  it('kaynak dagilimi', () => {
    expect(kaynakDagilimi([{ id: 'a', kaynak: 'Web', asama: 'İşe alındı' }, { id: 'b', kaynak: 'Web' }, { id: 'c' }]))
      .toEqual([{ kaynak: 'Web', basvuru: 2, alinan: 1 }, { kaynak: 'Belirtilmemiş', basvuru: 1, alinan: 0 }]);
  });
});

describe('pozisyon', () => {
  it('acik olanlar once, sonra acilis tarihi azalan', () => {
    const js = [{ id: 'a', durum: 'Kapandı', acilis: '2026-10-01' }, { id: 'b', durum: 'Açık', acilis: '2026-01-01' }, { id: 'c', durum: 'Taslak', acilis: '2026-10-05' }];
    expect(pozisyonSirala(js).map((j) => j.id)).toEqual(['b', 'c', 'a']);
  });
  it('acilinca acilis tarihi yoksa bugun', () => {
    expect(durumDegisimi({ id: 'j', durum: 'Onay bekliyor' }, 'Açık', BUGUN)).toEqual({ id: 'j', durum: 'Açık', acilis: BUGUN });
    expect(durumDegisimi({ id: 'j', durum: 'Açık', acilis: '2026-01-01' }, 'Kapandı', BUGUN).acilis).toBe('2026-01-01');
  });
  it('yayin isaretlenince taslak pozisyon acilir, acik pozisyon degismez', () => {
    const r = yayinIsaretle({ id: 'j', durum: 'Taslak' }, 'k1', { tarih: BUGUN, bitis: '2026-11-22' }, BUGUN);
    expect(r.acildi).toBe(true);
    expect(r.kayit).toMatchObject({ durum: 'Açık', acilis: BUGUN, yayinlar: { k1: { durum: 'Yayında', bitis: '2026-11-22' } } });
    expect(yayinIsaretle({ id: 'j', durum: 'Açık', acilis: '2026-01-01' }, 'k1', {}, BUGUN).acildi).toBe(false);
    expect(yayindakiKanallar(r.kayit)).toEqual(['k1']);
    const kapali = yayinKapat(r.kayit, 'k1', BUGUN);
    expect(kapali.yayinlar?.['k1']).toMatchObject({ durum: 'Kapandı', kapanis: BUGUN, bitis: '2026-11-22' });
    expect(kanalSuresiDoldu({ durum: 'Yayında', bitis: '2026-10-01' }, BUGUN)).toBe(true);
  });
  it('kopya taslak, yayinsiz, ozel metinsiz', () => {
    const k = pozisyonKopyasi({ id: 'j', baslik: 'Operator', durum: 'Açık', ozelMetin: 'x', yayinlar: { k1: { durum: 'Yayında' } }, ilanKodu: 'IK-2026-001' }, 'job_2', 'IK-2026-002', BUGUN);
    expect(k).toEqual({ id: 'job_2', baslik: 'Operator (kopya)', durum: 'Taslak', yayinlar: {}, ilanKodu: 'IK-2026-002', acilis: BUGUN, sonBasvuru: '2026-11-22' });
  });
  it('ozel metinde kanal eki ve izleme baglantisi', () => {
    const m = kanalMetni('Kod: IK-1\nBasvuru: https://ornek.test/kariyer', 'IK-1', 'KN', 'https://ornek.test/kariyer', (a) => `${a}?kaynak=kn`);
    expect(m).toBe('Kod: IK-1-KN\nBasvuru: https://ornek.test/kariyer?kaynak=kn');
  });
});
