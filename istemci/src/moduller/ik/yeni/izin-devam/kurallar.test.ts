import { describe, expect, it } from 'vitest';
import type { IkPuantajCevabi, IkPuantajKaydi, IkPuantajPlanGunu } from '#paylasilan/sozlesme/ik.ts';
import type { Devam, Izin, Personel } from '../tipler.ts';
import {
  aktarimKaydi, ayGunleri, ayindaCalisiyor, bakiyeAsimi, dakikaSaat, devamlariSuz, devamOzeti, gunDenetle, gunTemizle, gunYazimi, haftaGunu, izinDenetle,
  izindenSonraKalan, izinleriSuz, izinYillari, mesaiSiniri, onaylananGun, puHucre, puKapali, puKisileri, puOneriler, puToplam, takvimHucresi,
  takvimSatirlari, topluDenetle, topluGunler, yillikFazlaMesai,
} from './kurallar.ts';

const ADLAR: Record<string, string> = { emp_a: 'Ayşe Deniz', emp_b: 'Burak Ilgaz', emp_c: 'Can Ova' };
const ad = (p: string | undefined) => ADLAR[p ?? ''] ?? '';
const tarihYaz = (t: string | undefined) => t ?? '';

const izin = (id: string, o: Partial<Izin>): Izin => ({ id, kind: 'leave', empId: 'emp_a', tur: 'Yıllık izin', durum: 'Onaylandı', ...o });

describe('izinler', () => {
  const ls = [
    izin('leave_1', { baslangic: '2026-03-02', bitis: '2026-03-04', gun: 3 }),
    izin('leave_2', { baslangic: '2026-05-10', bitis: '2026-05-11', gun: 2, durum: 'Beklemede', empId: 'emp_b' }),
    izin('leave_3', { baslangic: '2026-07-01', bitis: '2026-07-01', gun: 1, tur: 'Mazeret izni' }),
    izin('leave_4', { baslangic: '2025-12-30', bitis: '2026-01-02', gun: 3, durum: 'Reddedildi' }),
  ];

  it('bekleyeni uste, sonra baslangica gore yeniden eskiye siralar; yil bitisle de eslesir', () => {
    expect(izinleriSuz(ls, { ara: '', durum: '', tur: '', yil: '2026' }, ad).map((l) => l.id)).toEqual(['leave_2', 'leave_3', 'leave_1', 'leave_4']);
    expect(izinleriSuz(ls, { ara: '', durum: '', tur: '', yil: '2025' }, ad).map((l) => l.id)).toEqual(['leave_4']);
  });

  it('durum, tur ve ad aramasiyla suzer (Turkce kucuk harf)', () => {
    expect(izinleriSuz(ls, { ara: 'BURAK', durum: '', tur: '', yil: 'tum' }, ad).map((l) => l.id)).toEqual(['leave_2']);
    expect(izinleriSuz(ls, { ara: 'ayşe', durum: 'Onaylandı', tur: 'Mazeret izni', yil: 'tum' }, ad).map((l) => l.id)).toEqual(['leave_3']);
  });

  it('yil listesi ve onaylanan gun toplami', () => {
    expect(izinYillari(ls, '2027')).toEqual(['2027', '2026', '2025']);
    expect(onaylananGun(ls)).toBe(4);
  });

  it('takvim: ayla kesisen etkin izinler kisi kisi, ada gore; rapor ve bekleyen tonu', () => {
    const t = [...ls, izin('leave_5', { empId: 'emp_c', baslangic: '2026-03-04', bitis: '2026-03-05', tur: 'Hastalık / rapor', durum: 'Beklemede' })];
    const satirlar = takvimSatirlari(t, '2026-03', (p) => ADLAR[p]!);
    expect(satirlar.map((s) => s.personel)).toEqual(['emp_a', 'emp_c']);
    expect(takvimHucresi(satirlar[1]!.izinler, '2026-03-05')?.tonlar).toEqual(['onayli', 'bekliyor', 'rapor']);
    expect(takvimHucresi(satirlar[0]!.izinler, '2026-03-05')).toBeNull();
  });

  it('ay gunleri ve hafta gunu', () => {
    expect(ayGunleri('2028-02')).toHaveLength(29);
    expect(ayGunleri('2026-04').at(-1)).toBe('2026-04-30');
    expect(haftaGunu('2026-10-19')).toBe(0);
    expect(haftaGunu('2026-10-25')).toBe(6);
  });

  it('denetim: zorunlu alan, tarih sirasi, cakisma, ise giris', () => {
    const p: Personel = { id: 'emp_a', kind: 'emp', iseGiris: '2026-02-01' };
    expect(izinDenetle({ id: 'leave_x', kind: 'leave' }, ls, null, tarihYaz).map((h) => h.alan)).toEqual(['empId', 'tur', 'baslangic', 'bitis']);
    expect(izinDenetle(izin('leave_x', { baslangic: '2026-03-05', bitis: '2026-03-01' }), ls, p, tarihYaz)).toEqual([{ alan: 'bitis', ileti: 'Bitiş tarihi başlangıçtan önce olamaz.' }]);
    const cakisan = izinDenetle(izin('leave_x', { baslangic: '2026-03-04', bitis: '2026-03-06', durum: 'Beklemede' }), ls, p, tarihYaz);
    expect(cakisan[0]?.ileti).toBe('Bu tarihlerle çakışan bir izin var: Yıllık izin, 2026-03-02 – 2026-03-04 (Onaylandı).');
    expect(izinDenetle(izin('leave_1', { baslangic: '2026-03-02', bitis: '2026-03-04' }), ls, p, tarihYaz)).toEqual([]);
    expect(izinDenetle(izin('leave_x', { baslangic: '2026-03-04', bitis: '2026-03-06', durum: 'İptal' }), ls, p, tarihYaz)).toEqual([]);
    expect(izinDenetle(izin('leave_x', { baslangic: '2026-01-20', bitis: '2026-01-21' }), [], p, tarihYaz)[0]?.alan).toBe('baslangic');
  });

  it('bakiye asimi: yalniz etkin yillik izinde; onceki onayli gun geri eklenir', () => {
    expect(bakiyeAsimi(izin('l', { gun: 6 }), null, 5)).toBe(5);
    expect(bakiyeAsimi(izin('l', { gun: 6 }), izin('l', { gun: 2 }), 5)).toBeNull();
    expect(bakiyeAsimi(izin('l', { gun: 6, tur: 'Mazeret izni' }), null, 0)).toBeNull();
    expect(bakiyeAsimi(izin('l', { gun: 6, durum: 'Reddedildi' }), null, 0)).toBeNull();
    expect(izindenSonraKalan(izin('l', { gun: 3, durum: 'Beklemede' }), 10)).toBe(7);
    expect(izindenSonraKalan(izin('l', { gun: 3 }), 10)).toBe(10);
  });
});

const devam = (id: string, o: Partial<Devam>): Devam => ({ id, kind: 'att', empId: 'emp_a', onay: 'Onaylandı', ...o });

describe('devam ve mesai', () => {
  const ds = [
    devam('att_1', { tarih: '2026-03-02', tur: 'Fazla mesai', saat: 2 }),
    devam('att_2', { tarih: '2026-03-07', tur: 'Hafta tatili çalışması', saat: 4.5 }),
    devam('att_3', { tarih: '2026-03-09', tur: 'Resmi tatil çalışması', saat: 8 }),
    devam('att_4', { tarih: '2026-03-10', tur: 'Devamsızlık', saat: 7.5 }),
    devam('att_5', { tarih: '2026-03-10', tur: 'Devamsızlık', }),
    devam('att_6', { tarih: '2026-03-10', tur: 'Devamsızlık', empId: 'emp_b' }),
    devam('att_7', { tarih: '2026-03-11', tur: 'Geç kalma', empId: 'emp_b' }),
    devam('att_8', { tarih: '2026-04-01', tur: 'Fazla mesai', saat: 3, empId: 'emp_b' }),
  ];

  it('ay, tur ve ad suzgeci; tarihe gore yeniden eskiye', () => {
    expect(devamlariSuz(ds, '2026-03', { tur: '', ara: 'burak' }, ad).map((a) => a.id)).toEqual(['att_7', 'att_6']);
    expect(devamlariSuz(ds, '2026-03', { tur: 'Fazla mesai', ara: '' }, ad).map((a) => a.id)).toEqual(['att_1']);
  });

  it('ay ozeti: devamsizlik kisi basina ayri gun', () => {
    expect(devamOzeti(ds, '2026-03')).toEqual({ fazlaSaat: 6.5, resmiTatilSaat: 8, gecKalma: 1, devamsizGun: 2 });
    expect(devamOzeti(ds, '2026-05')).toEqual({ fazlaSaat: 0, resmiTatilSaat: 0, gecKalma: 0, devamsizGun: 0 });
  });

  it('yillik fazla mesai: coktan aza, sinira gore ton; sinir ayarsizsa 270', () => {
    const aktif: Personel[] = [{ id: 'emp_a', kind: 'emp' }, { id: 'emp_b', kind: 'emp' }, { id: 'emp_c', kind: 'emp' }];
    expect(yillikFazlaMesai(ds, aktif, '2026', 7).map((x) => [x.personel.id, x.saat, x.ton])).toEqual([['emp_a', 6.5, 'uyari'], ['emp_b', 3, null]]);
    expect(yillikFazlaMesai(ds, aktif, '2026', 6)[0]?.ton).toBe('hata');
    expect(mesaiSiniri('')).toBe(270);
    expect(mesaiSiniri('180')).toBe(180);
  });
});

const kayit = (o: Partial<IkPuantajKaydi>): IkPuantajKaydi => ({
  tarih: '2026-03-02', durum: 'calisti', giris: '08:00', cikis: '17:00', aciklama: null, surum: 3, yazan: 'x', yazildi: '2026-03-02T17:00:00Z',
  calismaDakika: 480, fazlaDakika: 0, fazlaTuru: null, ...o,
});
const plan = (tarih: string, o: Partial<IkPuantajPlanGunu> = {}): IkPuantajPlanGunu =>
  ({ tarih, dakika: 480, baslangic: '08:00', bitis: '17:00', kapali: null, ad: null, ...o });
const isGunu = (t: string) => haftaGunu(t) < 5;

describe('puantaj', () => {
  const v: IkPuantajCevabi = {
    ay: '2026-03',
    gunler: ayGunleri('2026-03'),
    kisiler: [
      {
        personel: 'emp_b', kilitli: false,
        plan: [plan('2026-03-02'), plan('2026-03-03'), plan('2026-03-04'), plan('2026-03-07', { dakika: 0, baslangic: null, bitis: null, kapali: 'kapali' }), plan('2026-03-09', { kapali: 'tatil', ad: 'Tatil' })],
        kayitlar: [
          kayit({ fazlaDakika: 90, fazlaTuru: 'Fazla mesai', calismaDakika: 570 }),
          kayit({ tarih: '2026-03-03', cikis: null, calismaDakika: null, fazlaDakika: null }),
          kayit({ tarih: '2026-03-05', durum: 'raporlu', giris: null, cikis: null, calismaDakika: null }),
          kayit({ tarih: '2026-03-06', durum: 'devamsiz', giris: null, cikis: null, calismaDakika: null }),
        ],
      },
      { personel: 'emp_a', kilitli: true, plan: null, kayitlar: [] },
      { personel: 'emp_z', kilitli: false, plan: null, kayitlar: [] },
    ],
  };
  const b = (o: { izinler?: Izin[]; devamlar?: Devam[] } = {}) => ({ izinler: o.izinler ?? [], devamlar: o.devamlar ?? [], isGunu, bugun: '2026-03-20' });
  const kb = v.kisiler[0]!, ka = v.kisiler[1]!;

  it('ayinda calisiyor: ise giris ve cikis ayla kesisir', () => {
    expect(ayindaCalisiyor({ id: 'p', kind: 'emp', iseGiris: '2026-03-31' }, '2026-03')).toBe(true);
    expect(ayindaCalisiyor({ id: 'p', kind: 'emp', iseGiris: '2026-04-01' }, '2026-03')).toBe(false);
    expect(ayindaCalisiyor({ id: 'p', kind: 'emp', cikisTarihi: '2026-02-28' }, '2026-03')).toBe(false);
    expect(ayindaCalisiyor({ id: 'p', kind: 'emp', cikisTarihi: '2026-03-01' }, '2026-03')).toBe(true);
    expect(ayindaCalisiyor({ id: 'p', kind: 'emp', durum: 'Ayrıldı' }, '2026-03')).toBe(false);
  });

  it('kapali gun: plandan; plansiz kiside sirket takviminden', () => {
    expect(puKapali(kb, '2026-03-07', isGunu)).toBe('kapali');
    expect(puKapali(kb, '2026-03-09', isGunu)).toBe('tatil');
    expect(puKapali(kb, '2026-03-08', isGunu)).toBeNull();
    expect(puKapali(ka, '2026-03-08', isGunu)).toBe('kapali');
    expect(puKapali(ka, '2026-03-02', isGunu)).toBeNull();
  });

  it('hucre: calisma saati, acik cikis, durum kisaltmasi, eksik gun, izin, devam kaydi', () => {
    expect(puHucre(kb, 'emp_b', '2026-03-02', b())).toMatchObject({ metin: '9,5', tonlar: ['fazla'] });
    expect(puHucre(kb, 'emp_b', '2026-03-03', b())).toMatchObject({ metin: '08:00', tonlar: ['acik'], baslik: 'Giriş 08:00, çıkış girilmedi' });
    expect(puHucre(kb, 'emp_b', '2026-03-05', b())).toMatchObject({ metin: 'R', tonlar: ['raporlu'] });
    expect(puHucre(kb, 'emp_b', '2026-03-04', b())).toMatchObject({ metin: '–', tonlar: ['eksik'] });
    expect(puHucre(kb, 'emp_b', '2026-03-09', b())).toMatchObject({ metin: '', tonlar: ['tatil'], baslik: 'Tatil' });
    const iz = [izin('l', { empId: 'emp_a', baslangic: '2026-03-02', bitis: '2026-03-03' })];
    expect(puHucre(ka, 'emp_a', '2026-03-02', b({ izinler: iz }))).toMatchObject({ metin: 'i', tonlar: ['oneri'] });
    const dv = [devam('d1', { tarih: '2026-03-04', tur: 'Fazla mesai', saat: 2 }), devam('d2', { tarih: '2026-03-04', tur: 'Resmi tatil çalışması', saat: 1.5 })];
    const h = puHucre(ka, 'emp_a', '2026-03-04', b({ devamlar: dv }));
    expect(h).toMatchObject({ metin: '+3,5', tonlar: ['fazla'] });
    expect(h.baslik).toBe('Fazla mesai: 2 sa (devam kaydı, Onaylandı) · Resmi tatil çalışması: 1,5 sa (devam kaydı, Onaylandı)');
    expect(puHucre(ka, 'emp_a', '2026-03-05', b({ devamlar: [devam('d3', { tarih: '2026-03-05', tur: 'Devamsızlık' })] }))).toMatchObject({ metin: 'D', tonlar: ['devamsiz'] });
  });

  it('hucre: ileri tarihte eksik isareti yok', () => {
    const k = { ...kb, plan: [plan('2026-03-25')] };
    expect(puHucre(k, 'emp_b', '2026-03-25', b()).tonlar).toEqual([]);
  });

  it('toplam: devamsiz gun puantaj ve devam kaydinin birlesimi; fazla devam kaydindan', () => {
    const dv = [devam('d', { empId: 'emp_b', tarih: '2026-03-06', tur: 'Devamsızlık' }), devam('e', { empId: 'emp_b', tarih: '2026-03-12', tur: 'Devamsızlık' }), devam('f', { empId: 'emp_b', tarih: '2026-03-02', tur: 'Fazla mesai', saat: 1.5 })];
    expect(puToplam(kb, 'emp_b', '2026-03', dv)).toEqual({ calismaDakika: 570, fazlaDakika: 90, izinGun: 1, devamsizGun: 2 });
    expect(dakikaSaat(570)).toBe('9,5');
    expect(dakikaSaat(null)).toBe('');
  });

  it('kisiler: personeli olmayan duser, arama, departman, kilitli haric', () => {
    const personeller: Record<string, Personel> = { emp_a: { id: 'emp_a', kind: 'emp', departmanId: 'dept_1' }, emp_b: { id: 'emp_b', kind: 'emp', departmanId: 'dept_2' } };
    const s = { personel: (id: string) => personeller[id] ?? null, ad: (id: string) => ADLAR[id] ?? '', ara: '', departman: '' };
    expect(puKisileri(v, s).map((k) => k.personel)).toEqual(['emp_a', 'emp_b']);
    expect(puKisileri(v, { ...s, departman: 'dept_2' }).map((k) => k.personel)).toEqual(['emp_b']);
    expect(puKisileri(v, { ...s, kilitliHaric: true }).map((k) => k.personel)).toEqual(['emp_b']);
    expect(puKisileri(v, { ...s, ara: 'ayş' }).map((k) => k.personel)).toEqual(['emp_a']);
  });

  it('oneriler: ayni gun ve turde devam kaydi olan duser; aktarim kaydi beklemede', () => {
    expect(puOneriler(v.kisiler, []).map((o) => [o.personel, o.kayit.tarih])).toEqual([['emp_b', '2026-03-02']]);
    expect(puOneriler(v.kisiler, [devam('d', { empId: 'emp_b', tarih: '2026-03-02', tur: 'Fazla mesai' })])).toEqual([]);
    expect(aktarimKaydi('att_x', 'emp_b', kb.kayitlar[0]!)).toEqual({ id: 'att_x', kind: 'att', empId: 'emp_b', tarih: '2026-03-02', tur: 'Fazla mesai', saat: 1.5, onay: 'Beklemede', aciklama: 'Puantajdan' });
  });

  it('tek gun: denetim ve yazim govdesi', () => {
    expect(gunDenetle({ durum: 'calisti', giris: '', cikis: '', aciklama: '' })).toBe('Çalışılan günde giriş saati gerekir.');
    expect(gunDenetle({ durum: 'calisti', giris: '08:00', cikis: '08:00', aciklama: '' })).toBe('Çıkış girişle aynı olamaz.');
    expect(gunDenetle({ durum: 'izinli', giris: '', cikis: '', aciklama: '' })).toBeNull();
    expect(gunYazimi('emp_b', '2026-03-05', { durum: 'raporlu', giris: '08:00', cikis: '17:00', aciklama: ' not ' }, kb.kayitlar[2]!))
      .toEqual({ personel: 'emp_b', tarih: '2026-03-05', durum: 'raporlu', giris: null, cikis: null, aciklama: 'not', surum: 3 });
    expect(gunYazimi('emp_a', '2026-03-05', { durum: 'calisti', giris: '22:00', cikis: '06:00', aciklama: '' }, null))
      .toEqual({ personel: 'emp_a', tarih: '2026-03-05', durum: 'calisti', giris: '22:00', cikis: '06:00', aciklama: null, surum: null });
    expect(gunTemizle('emp_b', '2026-03-02', kb.kayitlar[0]!)).toMatchObject({ durum: null, surum: 3 });
  });

  it('toplu: aralik, bos gun, kapali gun, vardiya saati, ise giris ve bugun siniri', () => {
    const personeller: Record<string, Personel> = { emp_b: { id: 'emp_b', kind: 'emp', iseGiris: '2026-03-03' } };
    const bb = { personel: (id: string) => personeller[id] ?? null, isGunu, bugun: '2026-03-08' };
    const secim = { baslangic: '2026-03-01', bitis: '2026-03-31', durum: 'calisti' as const, vardiyaSaati: true, giris: '08:00', cikis: '17:00', yalnizBos: true, kapaliAtla: true, kisiler: new Set(['emp_b']) };
    expect(topluGunler(v, [kb], secim, bb).map((g) => g.tarih)).toEqual(['2026-03-04']);
    const elle = topluGunler(v, [kb], { ...secim, vardiyaSaati: false, kapaliAtla: false }, bb);
    expect(elle.map((g) => g.tarih)).toEqual(['2026-03-04', '2026-03-07', '2026-03-08']);
    expect(elle[0]).toMatchObject({ giris: '08:00', cikis: '17:00', surum: null });
    const ustune = topluGunler(v, [kb], { ...secim, durum: 'izinli', yalnizBos: false, kapaliAtla: false }, bb);
    expect(ustune.find((g) => g.tarih === '2026-03-05')).toMatchObject({ durum: 'izinli', giris: null, surum: 3 });
    expect(topluDenetle([])).toBe('Yazılacak gün yok.');
    expect(topluDenetle([{ personel: 'emp_b', tarih: '2026-03-04', durum: 'calisti', giris: null, cikis: null, aciklama: null, surum: null }])).toBe('Çalışılan günde giriş saati gerekir.');
    expect(topluDenetle(Array.from({ length: 501 }, () => elle[0]!))).toMatch(/en çok 500 gün/);
  });
});
