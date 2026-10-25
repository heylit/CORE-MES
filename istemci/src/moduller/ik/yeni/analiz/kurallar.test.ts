import { describe, expect, it } from 'vitest';
import type { IkYetkisi } from '../yetki.ts';
import { ALAN_ADLARI } from './alanlar.ts';
import {
  acikGorevler, gorevDurumuDegistir, gorevler, geriAlinabilir, geriAlmaKaydi, geriGetirilebilir, gunlukCsv, gunlukGruplari, gunlukSuz, gunlukYazabilir,
  kayitEtiketi, panoOzeti, rapor, sonGunMetni, type AnalizMotoru, type AnalizVerisi, type GunlukSatiri,
} from './kurallar.ts';

// Sentetik veri: ad ve kimlikler uydurmadır.
const BUGUN = new Date(2026, 9, 15);

const motor = (ek: Partial<AnalizMotoru> = {}): AnalizMotoru => ({
  aktifMi: (p, t) => !p.cikisTarihi || new Date(p.cikisTarihi) > (t ?? BUGUN),
  izinBakiyesi: () => ({ kalan: 5, sonrakiGun: 14 }),
  eksikBelgeler: () => [],
  guncelBrut: () => 40000,
  aydaCalisiyor: (p) => !p.cikisTarihi,
  yaka: (p) => (p.departmanId === 'dept_ofis' ? 'Beyaz yaka' : 'Mavi yaka'),
  kademe: () => 'Uzman',
  yakalar: ['Beyaz yaka', 'Mavi yaka'],
  kademeler: ['Uzman'],
  donemBaslangiclari: () => ['2026-01-01', '2026-07-01'],
  ayar: () => undefined,
  ...ek,
});

const veri = (ek: Partial<AnalizVerisi> = {}): AnalizVerisi => ({
  personel: [
    { id: 'emp_a', kind: 'emp', ad: 'Deneme', soyad: 'Bir', departmanId: 'dept_ofis', iseGiris: '2020-03-01', tckn: '1', sgkNo: '1' },
    { id: 'emp_b', kind: 'emp', ad: 'Deneme', soyad: 'İki', departmanId: 'dept_atolye', iseGiris: '2026-10-01', tckn: '1', sgkNo: '1' },
  ],
  departmanlar: [{ id: 'dept_ofis', kind: 'dept', ad: 'Ofis' }, { id: 'dept_atolye', kind: 'dept', ad: 'Atölye' }],
  izinler: [], devam: [], egitimler: [], gorusmeler: [], adaylar: [], pozisyonlar: [], bordrolar: [], gorevDurumu: {},
  ...ek,
} as AnalizVerisi);

describe('Pano özeti', () => {
  it('aktif sayı, bu ay giriş, yaka bölünmesi ve departman dağılımı', () => {
    const o = panoOzeti(veri(), motor(), BUGUN);
    expect(o.aktif).toBe(2);
    expect(o.giris).toBe(1);
    expect(o.yaka).toEqual({ beyaz: 1, mavi: 1 });
    expect(o.departmanlar.map((d) => d[0]).sort()).toEqual(['Atölye', 'Ofis']);
  });

  it('bekleyen izin ve başlangıcı geçmiş talep uyarısı', () => {
    const o = panoOzeti(veri({ izinler: [{ id: 'leave_1', kind: 'leave', empId: 'emp_a', durum: 'Beklemede', baslangic: '2026-10-10', bitis: '2026-10-12', gun: 3, tur: 'Yıllık izin' }] } as Partial<AnalizVerisi>), motor(), BUGUN);
    expect(o.bekleyen).toHaveLength(1);
    expect(o.uyarilar.some((u) => u.baslik.startsWith('Başlangıç tarihi geçmiş 1 izin talebi'))).toBe(true);
  });

  it('eksi izin bakiyesi kötü uyarıdır; zimmet uyarısı yoktur', () => {
    const o = panoOzeti(veri(), motor({ izinBakiyesi: () => ({ kalan: -2, sonrakiGun: 14 }) }), BUGUN);
    expect(o.uyarilar[0]).toMatchObject({ kotu: true, gorunum: 'izin' });
    expect(o.uyarilar.some((u) => /zimmet/i.test(u.baslik))).toBe(false);
  });
});

describe('Yapılacaklar', () => {
  it('bekleyen izin karar düğmeleri taşır; yeni girişte SGK bildirgesi gecikmiş görünür', () => {
    const g = gorevler(veri({ izinler: [{ id: 'leave_1', kind: 'leave', empId: 'emp_a', durum: 'Beklemede', baslangic: '2026-10-20', bitis: '2026-10-21', gun: 2, tur: 'Yıllık izin' }] } as Partial<AnalizVerisi>), motor(), BUGUN);
    const izin = g.find((x) => x.anahtar === 'leave:leave_1');
    expect(izin?.dugmeler.map((d) => d.eylem.tur)).toEqual(['izin-karar', 'izin-karar']);
    expect(izin?.kova).toBe('week');
    expect(g.find((x) => x.anahtar === 'sgkin:emp_b')?.kova).toBe('late');
  });

  it('geçen ayın bordrosu kesinleşmemişse iş çıkar; kesinleşince düşer', () => {
    expect(gorevler(veri(), motor(), BUGUN).some((x) => x.anahtar === 'pay:2026-09')).toBe(true);
    const bordrolar = ['emp_a', 'emp_b'].map((id) => ({ id: `pay_${id}_2026-09`, kind: 'pay', empId: id, donem: '2026-09', snap: { net: 1 }, gordum: true }));
    expect(gorevler(veri({ bordrolar } as Partial<AnalizVerisi>), motor(), BUGUN).some((x) => x.anahtar === 'pay:2026-09')).toBe(false);
  });

  it('ertelenen ve gizlenen iş açık listeden düşer, geri alınınca döner', () => {
    const v = veri();
    const ilk = gorevler(v, motor(), BUGUN);
    const anahtar = ilk[0]!.anahtar;
    const ertelenmis = gorevDurumuDegistir(v.gorevDurumu, anahtar, 'ertele', BUGUN);
    expect(ertelenmis[anahtar]).toEqual({ ertele: '2026-10-22' });
    const g2 = gorevler({ ...v, gorevDurumu: ertelenmis }, motor(), BUGUN);
    expect(acikGorevler(g2).some((x) => x.anahtar === anahtar)).toBe(false);
    const geri = gorevDurumuDegistir(ertelenmis, anahtar, 'geri', BUGUN);
    expect(acikGorevler(gorevler({ ...v, gorevDurumu: geri }, motor(), BUGUN)).some((x) => x.anahtar === anahtar)).toBe(true);
  });

  it('son gün metni', () => {
    expect(sonGunMetni('2026-10-13', BUGUN)).toBe('2 gün gecikti');
    expect(sonGunMetni('2026-10-15', BUGUN)).toBe('bugün');
    expect(sonGunMetni(null, BUGUN)).toBe('');
  });
});

describe('Raporlar', () => {
  it('yalnız aktif çalışanları sayar; veri yoksa ortalama null', () => {
    const v = veri({ personel: [...veri().personel, { id: 'emp_c', kind: 'emp', ad: 'Ayrılan', soyad: 'Kişi', cikisTarihi: '2026-05-01' }] } as Partial<AnalizVerisi>);
    const r = rapor(v, motor(), BUGUN, String);
    expect(r.aktif).toBe(2);
    expect(r.yaka.beyaz + r.yaka.mavi).toBe(2);
    expect(r.girisCikis).toHaveLength(12);
    const bos = rapor(veri({ personel: [] }), motor(), BUGUN, String);
    expect(bos.yaka.beyazOzet.ortalamaBrut).toBeNull();
  });
});

describe('Değişiklik günlüğü', () => {
  const satir = (ek: Partial<GunlukSatiri>): GunlukSatiri => ({ id: 'g1', t: '2026-10-14T09:30:00Z', op: 'guncelle', rk: 'emp', rid: 'emp_a', label: 'Deneme Bir', by: { name: 'Yönetici' }, ...ek });

  it('süzgeç dönemi, işlemi ve aramayı uygular; günlere böler', () => {
    const s = [satir({}), satir({ id: 'g2', t: '2026-08-01T10:00:00Z' }), satir({ id: 'g3', op: 'ekle', t: '2026-10-14T08:00:00Z' })];
    expect(gunlukSuz(s, {}, ALAN_ADLARI, BUGUN).map((l) => l.id)).toEqual(['g1', 'g3']);
    expect(gunlukSuz(s, { gun: 'tum', op: 'guncelle' }, ALAN_ADLARI, BUGUN).map((l) => l.id)).toEqual(['g1', 'g2']);
    expect(gunlukSuz(s, { gun: 'tum', q: 'yok böyle' }, ALAN_ADLARI, BUGUN)).toHaveLength(0);
    expect(gunlukGruplari(gunlukSuz(s, { gun: 'tum' }, ALAN_ADLARI, BUGUN)).map(([g, l]) => [g, l.length])).toEqual([['2026-10-14', 2], ['2026-08-01', 1]]);
  });

  it('geri alma: önceki değer döner, sonradan değişen alan çakışma olur', () => {
    const l = satir({ changes: [{ f: 'pozisyon', from: 'Usta', to: 'Şef' }, { f: 'telefon', from: null, to: '5' }] });
    const temiz = geriAlmaKaydi({ id: 'emp_a', pozisyon: 'Şef', telefon: '5' }, l, ALAN_ADLARI);
    expect(temiz.cakisan).toEqual([]);
    expect(temiz.yeni).toEqual({ id: 'emp_a', pozisyon: 'Usta' });
    expect(geriAlmaKaydi({ id: 'emp_a', pozisyon: 'Müdür', telefon: '5' }, l, ALAN_ADLARI).cakisan).toHaveLength(1);
  });

  it('büyük değerli güncelleme geri alınmaz; silinen kayıt yalnız yoksa ve anlık hali varsa geri gelir', () => {
    expect(geriAlinabilir(satir({ changes: [{ f: 'belgeler', big: true }] }), true)).toBe(false);
    expect(geriAlinabilir(satir({ changes: [{ f: 'pozisyon', from: 'a', to: 'b' }] }), false)).toBe(false);
    expect(geriGetirilebilir(satir({ op: 'sil', snap: { id: 'emp_a' } }), false)).toBe(true);
    expect(geriGetirilebilir(satir({ op: 'sil', snap: { id: 'emp_a' } }), true)).toBe(false);
    expect(geriGetirilebilir(satir({ op: 'sil', snap: null }), false)).toBe(false);
  });

  it('geri alma kaydın kendi yazma yetkisini ister; bordro ve bilinmeyen tür hiç geri alınmaz', () => {
    const yetki = { personelYaz: true, izinYaz: false } as IkYetkisi;
    expect(gunlukYazabilir(satir({ rk: 'emp' }), yetki)).toBe(true);
    expect(gunlukYazabilir(satir({ rk: 'leave' }), yetki)).toBe(false);
    expect(gunlukYazabilir(satir({ rk: 'pay' }), { ...yetki, bordroKesinlestir: true })).toBe(false);
    expect(gunlukYazabilir(satir({ rk: 'asset' }), yetki)).toBe(false);
  });

  it('gizli alan CSV ve tabloda yalnız "değişti" yazar; kayıt adı kimliğin yerine geçer', () => {
    const l = satir({ changes: [{ f: 'brut', big: true, gizli: true }, { f: 'departmanId', from: 'dept_ofis', to: null }] });
    const c = gunlukCsv([l], ALAN_ADLARI, (id) => (id === 'dept_ofis' ? 'Ofis' : null));
    expect(c.satirlar[0]?.slice(6)).toEqual(['değişti', 'değişti']);
    expect(c.satirlar[1]?.slice(6)).toEqual(['Ofis', '—']);
  });

  it('kayıt etiketi bağlı kişiyi depodan çözer', () => {
    const al = (id: string) => (id === 'emp_a' ? { id, kind: 'emp', ad: 'Deneme', soyad: 'Bir' } : null);
    expect(kayitEtiketi({ id: 'pay_emp_a_2026-09', kind: 'pay', empId: 'emp_a', donem: '2026-09' }, al)).toBe('Deneme Bir: 2026-09 bordrosu');
    expect(kayitEtiketi({ id: 'att_1', kind: 'att', empId: 'emp_x', tur: 'Mesai', tarih: '2026-10-01' }, al)).toBe('—: Mesai 01.10.2026');
  });
});
