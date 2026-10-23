import { describe, expect, it } from 'vitest';
import type { IkPuantajCevabi } from '#paylasilan/sozlesme/ik.ts';
import type { Bordro, Devam, Izin, Personel } from '../tipler.ts';
import {
  izinGunuMetni,
  aydaCalisiyor, ayinGunleri, bekleyenTalepler, bordroAlani, bordroYillari, bugunIzinde, cakisanEkipIzinleri, calisiyorMu,
  denemede, enFazlaAyniGun, kesinBordrolar, kisininIzinleri, mesaiOzeti, performansEtiketi, performansOrtalamasi, puantajHucresi,
  puantajToplami, sonKararlar, sonrakiIzin, sureMetni, takvimGunu, talepDenetimi, yilToplami,
} from './kurallar.ts';

const kisi = (x: Partial<Personel> & { id: string }): Personel => ({ ...x, kind: 'emp' });

const izin = (id: string, empId: string, baslangic: string, bitis: string, durum: string, ek: Partial<Izin> = {}): Izin => ({
  id, kind: 'leave', empId, tur: 'Yıllık izin', baslangic, bitis, gun: 1, durum, ...ek,
});

describe('kişi ve süre', () => {
  it('çalışan: girmemiş, çıkmış ve ayrılmış kişi çalışmıyor', () => {
    expect(calisiyorMu(kisi({ id: 'a', iseGiris: '2026-01-01' }), '2026-10-23')).toBe(true);
    expect(calisiyorMu(kisi({ id: 'a', iseGiris: '2026-11-01' }), '2026-10-23')).toBe(false);
    expect(calisiyorMu(kisi({ id: 'a', cikisTarihi: '2026-10-22' }), '2026-10-23')).toBe(false);
    expect(calisiyorMu(kisi({ id: 'a', cikisTarihi: '2026-10-23' }), '2026-10-23')).toBe(true);
    expect(calisiyorMu(kisi({ id: 'a', durum: 'Ayrıldı' }), '2026-10-23')).toBe(false);
  });

  it('süre metni yıl ve ay; ikisi yoksa gün; veri yoksa null', () => {
    expect(sureMetni('2023-08-10', '2026-10-23')).toBe('3 yıl 2 ay');
    expect(sureMetni('2026-10-01', '2026-10-23')).toBe('22 gün');
    expect(sureMetni(null, '2026-10-23')).toBeNull();
    expect(sureMetni('2026-11-01', '2026-10-23')).toBeNull();
  });

  it('deneme süresi bitiş günü dahil', () => {
    expect(denemede(kisi({ id: 'a', denemeBitis: '2026-10-23' }), '2026-10-23')).toBe(true);
    expect(denemede(kisi({ id: 'a', denemeBitis: '2026-10-22' }), '2026-10-23')).toBe(false);
    expect(denemede(kisi({ id: 'a' }), '2026-10-23')).toBe(false);
  });

  it('ay içinde çalışma dönemi', () => {
    const p = kisi({ id: 'a', iseGiris: '2026-10-31' });
    expect(aydaCalisiyor(p, '2026-10')).toBe(true);
    expect(aydaCalisiyor(p, '2026-09')).toBe(false);
    expect(aydaCalisiyor(kisi({ id: 'b', cikisTarihi: '2026-09-30' }), '2026-10')).toBe(false);
    expect(aydaCalisiyor(kisi({ id: 'c', durum: 'Ayrıldı' }), '2026-10')).toBe(false);
  });
});

describe('izinler', () => {
  it('gün sayısı yazılır; kayıtta yoksa sıfır uydurulmaz', () => {
    expect(izinGunuMetni(2.5)).toBe('2,5 gün');
    expect(izinGunuMetni(undefined)).toBe('— gün');
  });

  const liste = [
    izin('1', 'a', '2026-10-20', '2026-10-24', 'Onaylandı'),
    izin('2', 'a', '2026-11-03', '2026-11-04', 'Onaylandı'),
    izin('3', 'a', '2026-11-01', '2026-11-01', 'Beklemede'),
    izin('4', 'a', '2026-12-01', '2026-12-02', 'Reddedildi'),
    izin('5', 'b', '2026-10-23', '2026-10-23', 'Beklemede'),
  ];

  it('kişinin izinleri yeniden eskiye', () => {
    expect(kisininIzinleri(liste, 'a').map((l) => l.id)).toEqual(['4', '2', '3', '1']);
  });

  it('bugün izinde yalnız onaylı izin; sonraki izin yalnız onaylı ve ileri tarihli', () => {
    expect(bugunIzinde(liste, 'a', '2026-10-23')?.id).toBe('1');
    expect(bugunIzinde(liste, 'b', '2026-10-23')).toBeNull();
    expect(sonrakiIzin(liste, 'a', '2026-10-23')?.id).toBe('2');
  });

  it('talep: ters aralık ve onaylı ya da bekleyen izinle çakışma', () => {
    expect(talepDenetimi(liste, '2026-10-25', '2026-10-24').ters).toBe(true);
    expect(talepDenetimi(liste, '2026-10-24', '2026-10-25').cakisan.map((l) => l.id)).toEqual(['1']);
    expect(talepDenetimi(liste, '2026-12-01', '2026-12-01').cakisan).toEqual([]);
  });

  it('takvim günü uçlar dahil; ters aralıkta sıfır', () => {
    expect(takvimGunu('2026-10-30', '2026-11-02')).toBe(4);
    expect(takvimGunu('2026-11-02', '2026-10-30')).toBe(0);
  });
});

describe('bordrolarım', () => {
  const b = (id: string, donem: string, snap: Record<string, unknown> | null, ek: Partial<Bordro> = {}): Bordro => ({
    id, kind: 'pay', empId: 'a', donem, ...(snap ? { snap } : {}), ...ek,
  });
  const liste = [
    b('p1', '2025-12', { toplam: 100, net: 70, sgk: 14, iss: 1, gv: 10, dv: 1 }),
    b('p2', '2026-01', { toplam: 200, net: 150, sgk: 28, iss: 2, gv: 15, dv: 2 }),
    b('p3', '2026-02', null),
    b('p4', '2026-03', { toplam: 300, net: 210, sgk: 42, iss: 3, gv: 30, dv: 3 }, { net: 205 }),
  ];

  it('yalnız kesinleşmiş aylar, yeniden eskiye; yıllar sırayla', () => {
    const k = kesinBordrolar(liste, 'a');
    expect(k.map((r) => r.id)).toEqual(['p4', 'p2', 'p1']);
    expect(bordroYillari(k)).toEqual(['2026', '2025']);
  });

  it('alan kayıtta varsa kayıttan, yoksa kesinleşmiş hesaptan', () => {
    expect(bordroAlani(liste[3]!, 'net')).toBe(205);
    expect(bordroAlani(liste[3]!, 'toplam')).toBe(300);
  });

  it('yıl toplamı', () => {
    expect(yilToplami(kesinBordrolar(liste, 'a').filter((r) => r.donem?.startsWith('2026')))).toEqual({ toplam: 500, sgkIss: 75, gvDv: 50, net: 355 });
  });
});

describe('mesailerim', () => {
  // Saat gövdede metin de olabilir ("2,5"); tip sayıdır, ekran ikisini de okur.
  const d = (id: string, tarih: string, tur: string, saat: number | string, ek: Partial<Devam> = {}): Devam => ({ id, kind: 'att', empId: 'a', tarih, tur, saat: saat as number, ...ek });
  const liste = [
    d('1', '2026-10-05', 'Fazla mesai', 3),
    d('2', '2026-10-06', 'Hafta tatili çalışması', '2,5'),
    d('3', '2026-10-07', 'Resmi tatil çalışması', 8),
    d('4', '2026-10-08', 'Devamsızlık', ''),
    d('5', '2026-10-08', 'Devamsızlık', ''),
    d('6', '2026-03-01', 'Fazla mesai', 200),
    d('7', '2026-10-09', 'Fazla mesai', 4, { empId: 'b' }),
  ];

  it('ayın fazla mesaisi, resmi tatil, devamsız gün ve yıllık sınır', () => {
    const o = mesaiOzeti(liste, 'a', '2026-10', undefined);
    expect(o.kayitlar.map((x) => x.id)).toEqual(['4', '5', '3', '2', '1']);
    expect(o.fazla).toBe(5.5);
    expect(o.resmiTatil).toBe(8);
    expect(o.devamsizGun).toBe(1);
    expect(o.yilFazla).toBe(205.5);
    expect(o.sinir).toBe(270);
    expect(o.kalan).toBe(64.5);
    expect(o.ton).toBe('normal');
  });

  it('sınır ayardan; yüzde 85 üstü uyarı, üstü hata', () => {
    expect(mesaiOzeti(liste, 'a', '2026-10', 240).ton).toBe('uyari');
    expect(mesaiOzeti(liste, 'a', '2026-10', 200).ton).toBe('hata');
    expect(mesaiOzeti(liste, 'a', '2026-10', 200).kalan).toBe(0);
  });
});

describe('onaylar ve ekip', () => {
  const ekip = new Set(['b', 'c']);
  const liste = [
    izin('1', 'b', '2026-11-05', '2026-11-06', 'Beklemede'),
    izin('2', 'c', '2026-11-01', '2026-11-05', 'Beklemede'),
    izin('3', 'x', '2026-11-01', '2026-11-05', 'Beklemede'),
    izin('4', 'c', '2026-11-06', '2026-11-06', 'Onaylandı', { karar: '2026-10-20' }),
    izin('5', 'b', '2026-09-01', '2026-09-01', 'Reddedildi', { karar: '2026-08-20' }),
    izin('6', 'b', '2026-09-03', '2026-09-03', 'İptal', { karar: '2026-08-21' }),
  ];

  it('bekleyenler yalnız ekipten, başlangıca göre', () => {
    expect(bekleyenTalepler(liste, ekip).map((l) => l.id)).toEqual(['2', '1']);
  });

  it('son kararlar onay ve red, karara göre yeniden eskiye', () => {
    expect(sonKararlar(liste, ekip).map((l) => l.id)).toEqual(['4', '5']);
  });

  it('çakışan: ekipten başka kişinin onaylı ya da bekleyen izni', () => {
    expect(cakisanEkipIzinleri(liste[0]!, liste, ekip).map((l) => l.id)).toEqual(['2', '4']);
  });

  it('takvim: günler ve aynı güne en çok izin', () => {
    expect(ayinGunleri('2026-02')).toHaveLength(28);
    expect(enFazlaAyniGun(liste, ['b', 'c'], ayinGunleri('2026-11'))).toBe(2);
  });

  it('performans ortalaması ve etiketi; puan yoksa null', () => {
    const p = { id: 'p', kind: 'perf' as const, empId: 'b', skorlar: { a: 4, b: 5, c: 0 } };
    expect(performansOrtalamasi(p)).toBe(4.5);
    expect(performansEtiketi(4.5)).toEqual({ etiket: 'Beklentinin çok üzerinde', ton: 'tamam' });
    expect(performansOrtalamasi({ id: 'q', kind: 'perf' })).toBeNull();
    expect(performansEtiketi(null).etiket).toBe('Puanlanmadı');
  });
});

describe('puantaj takvimi', () => {
  const kayit = (tarih: string, durum: IkPuantajCevabi['kisiler'][number]['kayitlar'][number]['durum'], ek = {}) => ({
    tarih, durum, giris: null, cikis: null, aciklama: null, surum: 1, yazan: 'x', yazildi: '2026-10-01T08:00:00+03:00',
    calismaDakika: null, fazlaDakika: null, fazlaTuru: null, ...ek,
  });
  const plan = (tarih: string, dakika: number, kapali: 'tatil' | 'kapali' | null = null) => ({ tarih, dakika, baslangic: null, bitis: null, kapali, ad: 'Gündüz' });
  const k = {
    personel: 'a', kilitli: false,
    plan: [plan('2026-10-01', 450), plan('2026-10-02', 450), plan('2026-10-03', 0, 'kapali'), plan('2026-10-04', 450), plan('2026-10-29', 0, 'tatil')],
    kayitlar: [
      kayit('2026-10-01', 'calisti', { giris: '08:00', cikis: '18:00', calismaDakika: 540, fazlaDakika: 90, fazlaTuru: 'Fazla mesai' }),
      kayit('2026-10-02', 'izinli'),
      kayit('2026-10-05', 'devamsiz'),
    ],
  } as IkPuantajCevabi['kisiler'][number];
  const devam: Devam[] = [
    { id: 'd1', kind: 'att', empId: 'a', tarih: '2026-10-05', tur: 'Devamsızlık' },
    { id: 'd2', kind: 'att', empId: 'a', tarih: '2026-10-06', tur: 'Fazla mesai', saat: 2 },
  ];
  const izinler = [izin('i', 'a', '2026-10-07', '2026-10-07', 'Onaylandı')];

  it('çalışılan gün fazla ile, kapalı ve tatil gün, girilmemiş iş günü', () => {
    const h1 = puantajHucresi(k, 'a', '2026-10-01', devam, izinler, '2026-10-23', null);
    expect(h1.siniflar).toEqual(['fazla']);
    expect(h1.aciklama).toBe('Gündüz · 08:00–18:00, 9 sa · Fazla mesai: 1,5 sa');
    expect(puantajHucresi(k, 'a', '2026-10-03', [], [], '2026-10-23', null).siniflar).toEqual(['kapali']);
    expect(puantajHucresi(k, 'a', '2026-10-29', [], [], '2026-10-23', null).siniflar).toEqual(['tatil']);
    const eksik = puantajHucresi(k, 'a', '2026-10-04', [], [], '2026-10-23', null);
    expect(eksik).toMatchObject({ isaret: '–', siniflar: ['eksik'] });
    expect(puantajHucresi(k, 'a', '2026-10-04', [], [], '2026-10-03', null).isaret).toBeNull();
  });

  it('devam kaydı ve onaylı izin hücrede görünür', () => {
    expect(puantajHucresi(k, 'a', '2026-10-06', devam, izinler, '2026-10-23', null).siniflar).toEqual(['fazla']);
    expect(puantajHucresi(k, 'a', '2026-10-07', devam, izinler, '2026-10-23', null)).toMatchObject({ isaret: 'i', siniflar: ['oneri'] });
  });

  it('planı olmayan kişide kapalı gün motorun takviminden; motor yoksa işaretlenmez', () => {
    const plansiz = { ...k, plan: null };
    const pazar = (d: Date) => d.getDay() !== 0;
    expect(puantajHucresi(plansiz, 'a', '2026-10-04', [], [], '2026-10-23', pazar).siniflar).toEqual(['kapali']);
    expect(puantajHucresi(plansiz, 'a', '2026-10-04', [], [], '2026-10-23', null).siniflar).toEqual([]);
  });

  it('toplam: devamsız gün puantaj ve devam kaydının birleşimi, aynı gün bir kez', () => {
    expect(puantajToplami(k, 'a', '2026-10', devam)).toEqual({ calismaDakika: 540, fazlaDakika: 120, izinGun: 1, devamsizGun: 1 });
    expect(puantajToplami(null, 'a', '2026-10', [])).toEqual({ calismaDakika: 0, fazlaDakika: 0, izinGun: 0, devamsizGun: 0 });
  });
});
