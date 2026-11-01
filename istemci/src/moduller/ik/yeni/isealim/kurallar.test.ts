import { describe, expect, it } from 'vitest';
import type { Aday, Egitim, Gorusme, Performans, Personel, Pozisyon } from '../tipler.ts';
import {
  adayPuani, asamaKaydir, degerlendirmeBekleyenler, durumDegistir, egitimOzeti, gorusmeSonrasiAsama, gunEkle, gunFarki, iseAlimOzeti, iseGirisTaslagi,
  isgEksikleri, kanalMetni, kriterOrtalamasi, oneriSayilari, performansOzeti, performansSonucu, performanslariSuz, pozisyonKopyasi, puanOrtalamasi,
  sertifikaDurumu, sonrakiGorusme, sorulariEkle, soruSetleri, yayindaIsaretle, yayindanKaldir,
} from './kurallar.ts';

const BUGUN = '2026-10-31';
const ASAMALAR = ['Başvuru', 'Ön görüşme', 'Mülakat', 'Teklif', 'İşe alındı', 'Reddedildi'];
const kisi = (id: string, o: Partial<Personel> = {}): Personel => ({ id, kind: 'emp', ad: id, ...o });
const perf = (id: string, o: Partial<Performans>): Performans => ({ id, kind: 'perf', ...o });
const gor = (id: string, o: Partial<Gorusme>): Gorusme => ({ id, kind: 'intv', candId: 'cand_a', ...o });
const aday = (id: string, o: Partial<Aday> = {}): Aday => ({ id, kind: 'cand', ...o });
const poz = (o: Partial<Pozisyon> = {}): Pozisyon => ({ id: 'job_1', kind: 'job', ...o });

describe('tarih', () => {
  it('gün farkı ve gün ekleme yerel gün metniyle', () => {
    expect(gunFarki('2026-10-01', '2026-10-31')).toBe(30);
    expect(gunFarki(undefined, BUGUN)).toBeNull();
    expect(gunEkle('2026-12-25', 7)).toBe('2027-01-01');
  });
});

describe('performans', () => {
  it('ortalama yalnız sıfırdan büyük puanlardan; puan yoksa null', () => {
    expect(puanOrtalamasi({ a: 4, b: 5, c: 0 })).toBe(4.5);
    expect(puanOrtalamasi({})).toBeNull();
  });
  it('sonuç eşikleri bugünkü gibi', () => {
    expect(performansSonucu(4.5).etiket).toBe('Beklentinin çok üzerinde');
    expect(performansSonucu(3.49).etiket).toBe('Beklentiyi karşılıyor');
    expect(performansSonucu(1.4).etiket).toBe('Beklentinin altında');
    expect(performansSonucu(null)).toEqual({ etiket: 'Puanlanmadı', ton: 'pasif' });
  });
  it('süzme ve özet', () => {
    const kisiler = [kisi('emp_a', { departmanId: 'd1' }), kisi('emp_b', { departmanId: 'd2' })];
    const l = [perf('p1', { empId: 'emp_a', donem: '2026 Yıllık', tarih: '2026-01-01', skorlar: { İletişim: 5 } }), perf('p2', { empId: 'emp_b', donem: '2025 Yıllık', tarih: '2025-01-01', skorlar: { İletişim: 2 } })];
    const bul = (id: string | undefined) => kisiler.find((k) => k.id === id);
    expect(performanslariSuz(l, { ara: '', donem: '', departman: 'd2' }, bul, (id) => id ?? '').map((x) => x.id)).toEqual(['p2']);
    const o = performansOzeti(l, ['İletişim', 'Takım'], (id) => bul(id)?.departmanId ?? '');
    expect(o.departman).toEqual([{ etiket: 'd1', deger: 5 }, { etiket: 'd2', deger: 2 }]);
    expect(o.yetkinlik).toEqual([{ etiket: 'İletişim', deger: 3.5 }, { etiket: 'Takım', deger: 0 }]);
    expect(o.dagilim.map((x) => x.etiket)).toEqual(['Beklentinin çok üzerinde', 'Gelişime açık']);
  });
});

describe('eğitim', () => {
  const egt = (id: string, o: Partial<Egitim>): Egitim => ({ id, kind: 'train', ...o });
  it('yılın tamamlanan eğitimleri, katılım saati ve harcama', () => {
    const l = [egt('t1', { durum: 'Tamamlandı', tarih: '2026-03-01', sure: 4, katilimcilar: ['a', 'b'], maliyet: 1000 }), egt('t2', { durum: 'Planlandı', tarih: '2026-05-01', sure: 8 })];
    expect(egitimOzeti(l, '2026', 4)).toEqual({ tamamlanan: 1, saat: 8, harcama: 1000, kisiBasi: 2 });
  });
  it('geçerli İSG eğitimi olmayanlar: süresi dolan sertifika sayılmaz', () => {
    const l = [
      egt('t1', { tur: 'İSG (zorunlu)', durum: 'Tamamlandı', katilimcilar: ['emp_a'], gecerlilik: '2027-01-01' }),
      egt('t2', { tur: 'İSG (zorunlu)', durum: 'Tamamlandı', katilimcilar: ['emp_b'], gecerlilik: '2026-01-01' }),
    ];
    expect(isgEksikleri(l, [kisi('emp_a'), kisi('emp_b')], BUGUN).map((p) => p.id)).toEqual(['emp_b']);
    expect(sertifikaDurumu('2026-11-15', BUGUN)).toBe('yakin');
    expect(sertifikaDurumu('2026-10-01', BUGUN)).toBe('doldu');
    expect(sertifikaDurumu(undefined, BUGUN)).toBe('yok');
  });
});

describe('aday ve görüşme', () => {
  const l = [
    gor('i1', { durum: 'Tamamlandı', tarih: '2026-10-01', skorlar: { A: 4, B: 2 }, oneri: 'Alınsın' }),
    gor('i2', { durum: 'Tamamlandı', tarih: '2026-10-05', skorlar: { A: 5 }, oneri: 'Alınsın' }),
    gor('i3', { durum: 'Planlandı', tarih: '2026-10-20' }),
    gor('i4', { durum: 'Planlandı', tarih: '2026-11-03' }),
  ];
  it('puan tamamlanan görüşmelerin ortalamasıdır', () => {
    expect(adayPuani(l, 'cand_a')).toBe(4);
    expect(kriterOrtalamasi(l, 'A')).toBe(4.5);
    expect(oneriSayilari(l, 'cand_a', ['Kesinlikle alınsın', 'Alınsın'])).toEqual([{ oneri: 'Alınsın', sayi: 2 }]);
  });
  it('sonraki görüşme ve değerlendirme bekleyenler', () => {
    expect(sonrakiGorusme(l, 'cand_a', BUGUN)?.id).toBe('i4');
    expect(degerlendirmeBekleyenler(l, BUGUN, () => true).map((g) => g.id)).toEqual(['i3']);
    expect(degerlendirmeBekleyenler(l, BUGUN, () => false)).toEqual([]);
  });
  it('aşama kaydırma sınırda kalır; görüşme aşamayı yalnız ileri alır', () => {
    expect(asamaKaydir(ASAMALAR, { asama: 'Başvuru' }, -1)).toBe('Başvuru');
    expect(asamaKaydir(ASAMALAR, { asama: 'Mülakat' }, 1)).toBe('Teklif');
    expect(gorusmeSonrasiAsama(ASAMALAR, aday('c', { asama: 'Başvuru' }), 'Telefon ön görüşmesi')).toBe('Ön görüşme');
    expect(gorusmeSonrasiAsama(ASAMALAR, aday('c', { asama: 'Teklif' }), 'İK mülakatı')).toBeNull();
    expect(gorusmeSonrasiAsama(ASAMALAR, aday('c', { asama: 'Reddedildi' }), 'İK mülakatı')).toBeNull();
  });
  it('işe alım özeti', () => {
    const adaylar = [
      aday('a1', { asama: 'İşe alındı', basvuruTarihi: '2026-09-01', iseAlimTarihi: '2026-09-21', teklifYanit: 'Kabul etti' }),
      aday('a2', { asama: 'Mülakat', teklifYanit: 'Reddetti' }),
    ];
    const o = iseAlimOzeti([poz({ durum: 'Açık' }), poz({ id: 'j2', durum: 'Onay bekliyor' })], adaylar, [gor('x', { durum: 'Planlandı', tarih: '2026-11-04' })], BUGUN, () => true);
    expect(o).toEqual({ acik: 1, onayBekleyen: 1, surecte: 1, yediGun: 1, bekleyen: 0, ortalamaSure: 20, kabulOrani: 50 });
  });
  it('işe giriş taslağı: başlama tarihi geçmişse bugün, teklif ücreti önce', () => {
    const t = iseGirisTaslagi(aday('a', { ad: 'Ada', soyad: 'Deneme', baslayabilir: '2026-01-01', teklifUcret: 50000, maasBeklentisi: 45000 }), poz({ baslik: 'Operatör', departmanId: 'd1' }), BUGUN);
    expect(t).toMatchObject({ ad: 'Ada', pozisyon: 'Operatör', departmanId: 'd1', iseGiris: BUGUN, brutMaas: 50000 });
  });
});

describe('pozisyon ve ilan', () => {
  it('açılan pozisyona açılış tarihi yazılır, var olan korunur', () => {
    expect(durumDegistir(poz({ durum: 'Onay bekliyor' }), 'Açık', BUGUN).acilis).toBe(BUGUN);
    expect(durumDegistir(poz({ acilis: '2026-01-01' }), 'Açık', BUGUN).acilis).toBe('2026-01-01');
  });
  it('kanal yayında işaretlenince taslak pozisyon açılır; kaldırınca kapanış tarihi', () => {
    const { pozisyon, acildi } = yayindaIsaretle(poz({ durum: 'Taslak' }), 'k2', { tarih: BUGUN, bitis: '2026-11-30', link: '', not: '' }, BUGUN);
    expect(acildi).toBe(true);
    expect(pozisyon).toMatchObject({ durum: 'Açık', acilis: BUGUN, yayinlar: { k2: { durum: 'Yayında' } } });
    expect(yayindaIsaretle(poz({ durum: 'Kapandı' }), 'k2', { tarih: BUGUN, bitis: '', link: '', not: '' }, BUGUN).acildi).toBe(false);
    expect(yayindanKaldir(pozisyon, 'k2', BUGUN).yayinlar?.['k2']).toMatchObject({ durum: 'Kapandı', kapanis: BUGUN });
  });
  it('özel metin kanal ekli ilan koduyla ve izleme ekiyle', () => {
    const p = poz({ ilanKodu: 'IK-2026-001', ozelMetin: 'Kod IK-2026-001, başvuru http://kariyer.yerel' });
    const m = kanalMetni(p, { id: 'k2', ad: 'Kanal', kod: 'KN' }, () => 'şablon', (u) => `${u}?kaynak=kanal`, 'http://kariyer.yerel');
    expect(m).toBe('Kod IK-2026-001-KN, başvuru http://kariyer.yerel?kaynak=kanal');
    expect(kanalMetni(poz(), null, () => 'şablon', (u) => u, '')).toBe('şablon');
  });
  it('kopya pozisyon taslak, yayınsız ve özel metinsiz başlar', () => {
    const k = pozisyonKopyasi(poz({ baslik: 'Operatör', durum: 'Açık', ozelMetin: 'x', yayinlar: { k1: { durum: 'Yayında' } } }), 'job_2', 'IK-2026-002', BUGUN);
    expect(k).toMatchObject({ id: 'job_2', durum: 'Taslak', yayinlar: {}, ilanKodu: 'IK-2026-002', baslik: 'Operatör (kopya)', sonBasvuru: '2026-11-30' });
    expect('ozelMetin' in k).toBe(false);
  });
});

describe('soru bankası', () => {
  it('ayarda liste yoksa varsayılan; eklemede tekrar eden soru eklenmez', () => {
    expect(soruSetleri({}, [{ id: 'q1', ad: 'Genel', sorular: 'A' }]).map((s) => s.id)).toEqual(['q1']);
    expect(soruSetleri({ soruSetleri: [] }, [{ id: 'q1', ad: 'Genel', sorular: 'A' }])).toEqual([]);
    expect(sorulariEkle('A\nB', { id: 'q', ad: 'x', sorular: 'B\nC' })).toBe('A\nB\nC');
  });
});
