import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EslesmeHatasi, kur, parcala } from './eslesme.ts';
import type { SatirDegeri, Satirlar } from './eslesme.ts';
import { TUR_TANIMLARI } from './sema.ts';
import type { Alan, TurTanimi } from './sema.ts';

// Veritabanının döndürdüğü biçim: sayısal sütun metin, saat saniyeli (sunucu/cekirdek/db.ts tip ayrıştırıcıları).
function veritabanindan(t: TurTanimi, s: Satirlar): Satirlar {
  const tipler = new Map<string, Alan>();
  const ekle = (alanlar: readonly Alan[], onek = '') => { for (const a of alanlar) tipler.set(onek + a.s, a); };
  ekle(t.alanlar);
  if (t.ozet) { ekle(t.ozet.alanlar, t.ozet.onek); for (const n of t.ozet.nesneler) ekle(n.alanlar, t.ozet.onek + n.onek); }
  const cevir = (satir: SatirDegeri, yerel?: Map<string, Alan>): SatirDegeri => Object.fromEntries(Object.entries(satir).map(([k, v]) => {
    const a = yerel?.get(k) ?? tipler.get(k);
    if (v === null || !a || a.bag) return [k, v];
    if (['tutar', 'hesap', 'sayi'].includes(a.t)) return [k, String(v)];
    if (a.t === 'saat') return [k, `${String(v)}:00`];
    return [k, v];
  }));
  const altlar: Record<string, SatirDegeri[]> = {};
  for (const l of [...t.listeler, ...(t.ozet?.listeler ?? [])]) {
    const yerel = new Map(l.alanlar.map((a) => [a.s, a]));
    altlar[l.tablo] = (s.altlar[l.tablo] ?? []).map((r) => cevir(r, yerel));
  }
  return { ana: cevir(s.ana), altlar };
}

const gidipGel = (tur: keyof typeof TUR_TANIMLARI, kayit: Record<string, unknown>) => {
  const t = TUR_TANIMLARI[tur];
  const s = veritabanindan(t, parcala(t, kayit));
  return kur(t, String(kayit['id']), s.ana, s.altlar);
};
const hata = (tur: keyof typeof TUR_TANIMLARI, kayit: Record<string, unknown>, alan: RegExp) =>
  assert.throws(() => parcala(TUR_TANIMLARI[tur], kayit), (e: unknown) => e instanceof EslesmeHatasi && alan.test(e.alan));

describe('İK kayıt eşlemesi (tam ayrıştırma)', () => {
  test('personel: alanlar, ücret geçmişi, belgeler, notlar, çıkış listesi ve primler gidip gelir', () => {
    const e = {
      id: 'emp_1', kind: 'emp', ad: 'Ayşe', soyad: 'Kaya', tckn: '10000000146', dogumTarihi: '1990-04-15', cinsiyet: 'Kadın', cocukSayisi: 2,
      departmanId: 'dept_1', yoneticiId: 'emp_9', iseGiris: '2021-03-01', brutMaas: 48250.5, besKatilim: true, yemekDeger: 330, kisiId: 7, isMerkeziId: 2,
      ucretGecmisi: [{ tarih: '2021-03-01', brut: 30000, neden: 'İşe giriş' }, { tarih: '2026-01-01', brut: 48250.5, neden: 'Yıllık zam', not: 'Toplu' }],
      belgeler: { 'Adli sicil kaydı': { ok: true, tarih: '2021-03-01' }, 'Diploma': { ok: false } },
      notlar: [{ t: '2026-09-19T00:00:00.000Z', m: 'Hedef toplantısı' }],
      cikisListesi: { sgk: '2026-08-12', bordro: '2026-08-15' },
      primler: { p2: { aktif: true }, p1: { aktif: true, deger: 15 } },
    };
    assert.deepEqual(gidipGel('emp', e), e);
  });

  test('boş değerler sütunda NULL, kurarken kayıtta yok', () => {
    const geri = gidipGel('emp', { id: 'emp_2', kind: 'emp', ad: 'A', soyad: 'B', isMerkeziId: 1, telefon: '', brutMaas: null, notlar: [], createdAt: 'x', demo: true });
    assert.deepEqual(geri, { id: 'emp_2', kind: 'emp', ad: 'A', soyad: 'B', isMerkeziId: 1 });
  });

  test('pozisyon yayınları, performans ve görüşme puanları, eğitim katılımcıları gidip gelir', () => {
    const j = { id: 'job_1', kind: 'job', baslik: 'Torna', durum: 'Açık', adet: 2, ucretMin: 40000, ucretMax: 50000, ucretGoster: true, isMerkeziId: 3,
      yayinlar: { k2: { durum: 'Yayında', tarih: '2026-07-21', bitis: '2026-10-21', link: 'kariyer-sayfasi-ilan-1', not: 'Standart' }, k3: { durum: 'Kapandı', kapanis: '2026-09-01' } } };
    assert.deepEqual(gidipGel('job', j), j);
    const p = { id: 'perf_1', kind: 'perf', empId: 'emp_1', donem: '2026 / 1', skorlar: { 'İş kalitesi': 5, 'Verimlilik': 3 } };
    assert.deepEqual(gidipGel('perf', p), p);
    const g = { id: 'intv_1', kind: 'intv', candId: 'cand_1', tarih: '2026-10-09', saat: '15:30', gorusmeciler: ['emp_1', 'emp_2'], skorlar: { 'İletişim becerisi': 4 } };
    assert.deepEqual(gidipGel('intv', g), g);
    const tr = { id: 'train_1', kind: 'train', ad: 'İSG', katilimcilar: ['emp_1', 'emp_3'], sure: 8, maliyet: 1250 };
    assert.deepEqual(gidipGel('train', tr), tr);
  });

  test('bordro: girdiler, hesap sonucu, yemek-yol-teşvik nesneleri ve prim dökümü gidip gelir', () => {
    const b = {
      id: 'pay_emp_1_2026-09', kind: 'pay', empId: 'emp_1', donem: '2026-09', brut: 58000, gun: 30, ek: 2000, mesaiSaat: 0, tatilSaat: 0, kesinti: 0,
      toplam: 60000, net: 46140.68, gv: 4654.62, dv: 204.7, sgk: 8400, iss: 600, maliyet: 74250, paramId: 'd2026b', paramAd: '2026 Temmuz–Aralık',
      snap: {
        aylik: 58000, gun: 30, brut: 58000, ek: 2000, mesaiUcret: 0, ucret: 60000, yanTutar: 0, toplam: 60000, sgkMatrah: 60000, sgk: 8400, iss: 600, ind: 0,
        matrah: 51000, cumOnce: 349996, gvHam: 10269.72, gvIst: 5615.1, gv: 4654.62, dvHam: 455.4, dvIst: 250.6977, dv: 204.7023, bes: 0, kesinti: 0,
        net: 46140.677700, ayni: 0, banka: 46140.6777, isvBrut: 13050, tInd: 0, isvSgk: 13050, isvIss: 1200, maliyet: 74250, aMat: 28075.5, paramAd: '2026 Temmuz–Aralık',
        yemek: { tutar: 0, gvIst: 0, sgkIst: 0, ayni: true, yontem: 'İşyerinde yemek', fg: 21, hizmet: true },
        yol: { tutar: 0, gvIst: 0, sgkIst: 0, ayni: true, yontem: 'Servis', fg: 21, hizmet: true },
        tesvik: null,
        primDetay: [{ ad: 'Vardiya primi', tutar: 2000 }],
      },
    };
    assert.deepEqual(gidipGel('pay', b), b);
    const t = { ...b, snap: { ...b.snap, tesvik: { id: 't6111', ad: '6111', tur: 'asgari', deger: 0 }, primDetay: null } };
    assert.deepEqual(gidipGel('pay', t), t);
  });

  test('tanımsız alan, yanlış tip, geçersiz seçenek, bozuk tarih ve boş zorunlu alan reddedilir', () => {
    hata('emp', { id: 'e', kind: 'emp', ad: 'A', soyad: 'B', isMerkeziId: 1, ayakkabiNo: 42 }, /ayakkabiNo/);
    hata('emp', { id: 'e', kind: 'emp', ad: 'A', soyad: 'B', isMerkeziId: 1, brutMaas: 'çok' }, /brutMaas/);
    hata('emp', { id: 'e', kind: 'emp', ad: 'A', soyad: 'B', isMerkeziId: 1, cinsiyet: 'Bilinmez' }, /cinsiyet/);
    hata('emp', { id: 'e', kind: 'emp', ad: 'A', soyad: 'B', isMerkeziId: 1, iseGiris: '2026-02-30' }, /iseGiris/);
    hata('emp', { id: 'e', kind: 'emp', ad: 'A', soyad: 'B' }, /isMerkeziId/);
    hata('emp', { id: 'e', kind: 'emp', ad: 'A', soyad: 'B', isMerkeziId: 1, belgeler: { X: { ok: true, renk: 'mavi' } } }, /renk/);
    hata('emp', { id: 'e', kind: 'emp', ad: 'A', soyad: 'B', isMerkeziId: 1, cocukSayisi: 1.5 }, /cocukSayisi/);
    hata('leave', { id: 'l', kind: 'leave', empId: 'emp 1', tur: 'Yıllık izin', baslangic: '2026-01-01', bitis: '2026-01-02', durum: 'Beklemede' }, /empId/);
    hata('pay', { id: 'p', kind: 'pay', empId: 'e', donem: '2026-13' }, /donem/);
    hata('intv', { id: 'i', kind: 'intv', candId: 'c', saat: '25:00' }, /saat/);
  });
});
