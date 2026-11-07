import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import * as bicim from './bicim.ts';
import { createEngine, createMemoryDb } from './motor.ts';
import { BEKLENEN } from './motor-davranis.beklenen.ts';
import * as sabitler from './sabitler.ts';

// Motorun bütün işlevlerinin sentetik girdideki sonuçları motor-davranis.beklenen.ts'da sabittir: tipleme ya da düzenleme hesabı
// değiştirmesin diye her sayı, tarih ve metin birebir karşılaştırılır (kuruş yuvarlaması yok). motor-esitlik.test.ts eski
// uygulamayla eşitliği dar bir girdide ölçer; bu test her dalı (kilitli ve taslak bordro, yan hak, prim, teşvik, kıdem ve ihbar,
// ilan metni, önbellek yenilenmesi) kapsar. Sapma bilinçliyse beklenen dosya o değişiklikle `davranisOzeti()` çıktısından yenilenir.

type Islev = (...a: unknown[]) => unknown;
type Motor = Record<string, Islev>;
type Bellek = { setSettings: (s: unknown) => void; upsert: (r: unknown) => void; remove: (id: string) => void; records: () => unknown[] };

// Karşılaştırılabilir biçim: Infinity, NaN, -0, undefined ve tarih JSON'da kaybolmasın diye metne çevrilir; tarih yerel saatle
// yazılır, çalıştıran makinenin saat dilimi sonuca karışmaz.
const iki = (n: number): string => String(n).padStart(2, '0');
function ozet(v: unknown): unknown {
  if (v === undefined) return '~undefined';
  if (typeof v === 'number') return Object.is(v, -0) ? '~-0' : Number.isFinite(v) ? v : `~${String(v)}`;
  if (typeof v === 'function') return '~islev';
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? '~gecersiz-tarih'
      : `~${String(v.getFullYear())}-${iki(v.getMonth() + 1)}-${iki(v.getDate())} ${iki(v.getHours())}:${iki(v.getMinutes())}`;
  }
  if (v instanceof Set) return { '~kume': [...v].map(ozet) };
  if (v instanceof Map) return { '~harita': [...v].map(ozet) };
  if (Array.isArray(v)) return v.map(ozet);
  if (v && typeof v === 'object' && typeof (v as { kind?: unknown }).kind === 'string' && typeof (v as { id?: unknown }).id === 'string') {
    return `~kayit:${(v as { id: string }).id}`;
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, d]) => [k, ozet(d)]));
  return v;
}

// Büyük ve tekrarlı yapılar (birleşik ayarlar) özetle karşılaştırılır: FNV-1a, ozet() biçiminin JSON metni üstünde.
function iz(v: unknown): string {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(ozet(v))) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return `~iz:${h.toString(16)}`;
}

// Sentetik TC kimlik ve IBAN: denetim haneleri algoritmayla hesaplanır, gerçek numara yazılmaz.
function tckn(dokuz: string): string {
  const d = dokuz.split('').map(Number) as [number, number, number, number, number, number, number, number, number];
  const d10 = ((((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return dokuz + String(d10) + String(d11);
}
function iban(govde: string): string {
  const sayisal = (govde + 'TR00').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const ch of sayisal) r = (r * 10 + Number(ch)) % 97;
  return 'TR' + iki(98 - r) + govde;
}

const PERSONEL = [
  {
    id: 'emp_1', kind: 'emp', ad: 'Ad1', soyad: 'Soyad1', iseGiris: '2015-03-10', dogumTarihi: '1970-05-01', brutMaas: 60000, pozisyon: 'CNC operatörü',
    departmanId: 'dept_1', ucretGecmisi: [{ tarih: '2026-04-01', brut: 65000 }, { tarih: '2026-01-01', brut: 55000 }, { tarih: '2026-09-01', brut: 70000 }],
    yemekYontem: 'Yemek kartı / çeki', yemekDeger: 350, engelDurumu: '2. derece', besKatilim: true, tesvikId: 't2',
    primler: { p1: { aktif: true, deger: 15 }, p4: { aktif: true }, p2: { aktif: false } }, devredenIzin: 3, oncekiKullanim: 2,
    belgeler: { 'Özgeçmiş': { ok: true }, 'Vesikalık fotoğraf': { ok: false } },
  },
  {
    id: 'emp_2', kind: 'emp', ad: 'Ad2', soyad: '', iseGiris: '2026-02-16', cikisTarihi: '2026-09-10', durum: 'Ayrıldı', brutMaas: 45000,
    pozisyon: 'Planlama uzmanı', dogumTarihi: '2009-01-01', yolYontem: 'Servis', yemekYontem: 'Nakit', yemekHesap: 'Aylık sabit tutar', yemekDeger: 4000,
  },
  {
    id: 'emp_3', kind: 'emp', ad: 'Ad3', soyad: 'Soyad3', iseGiris: '2024-07-01', brutMaas: 33030, kademe: 'Uzman', yakaTipi: 'Mavi yaka', tesvikId: 't6111',
    yemekYontem: 'İşyerinde yemek', yolYontem: 'Toplu taşıma kartı / bilet', yolHesap: 'Brüt ücretin yüzdesi', yolDeger: 2, engelDurumu: '1. derece',
  },
  { id: 'emp_4', kind: 'emp', ad: '', soyad: '', brutMaas: '40.000,5', pozisyon: 'Genel Müdür', durum: 'Ayrıldı' },
  { id: 'emp_5', kind: 'emp', ad: 'Ad5', soyad: 'Soyad5', iseGiris: '2027-01-01', brutMaas: 50000, pozisyon: 'Depo sorumlusu', tesvikId: 'yok-boyle' },
  { id: 'emp_6', kind: 'emp', ad: 'Ad6', soyad: 'Soyad6', iseGiris: '2025-11-03', brutMaas: 52000, gunluk: true, pozisyon: 'Kalite mühendisi', tesvikId: 't5' },
];
const DIGER = [
  { id: 'dept_1', kind: 'dept', ad: 'Üretim' }, { id: 'dept_2', kind: 'dept', ad: 'İdari' }, { id: 'dept_3', kind: 'dept' },
  { id: 'leave_1', kind: 'leave', empId: 'emp_1', tur: 'Yıllık izin', baslangic: '2026-04-06', bitis: '2026-04-10', gun: 5, durum: 'Onaylandı' },
  { id: 'leave_2', kind: 'leave', empId: 'emp_1', tur: 'Yıllık izin', baslangic: '2026-08-03', bitis: '2026-08-04', gun: '2', durum: 'Beklemede' },
  { id: 'leave_3', kind: 'leave', empId: 'emp_1', tur: 'Ücretsiz izin', baslangic: '2026-05-11', bitis: '2026-05-13', durum: 'Onaylandı' },
  { id: 'leave_4', kind: 'leave', empId: 'emp_3', tur: 'Hastalık / rapor', baslangic: '2026-05-28', bitis: '2026-06-03', durum: 'Onaylandı' },
  { id: 'leave_5', kind: 'leave', empId: 'emp_3', tur: 'Ücretsiz izin', baslangic: '2026-07-01', bitis: '2026-07-31', durum: 'Onaylandı' },
  { id: 'leave_6', kind: 'leave', empId: 'emp_6', tur: 'Mazeret izni', durum: 'Onaylandı' },
  { id: 'leave_7', kind: 'leave', empId: 'emp_2', tur: 'Ücretsiz izin', baslangic: '2026-03-02', bitis: '2026-03-06', durum: 'Reddedildi' },
  { id: 'att_1', kind: 'att', empId: 'emp_1', tarih: '2026-05-04', tur: 'Fazla mesai', saat: 6 },
  { id: 'att_2', kind: 'att', empId: 'emp_1', tarih: '2026-05-19', tur: 'Resmi tatil çalışması', saat: '7,5' },
  { id: 'att_3', kind: 'att', empId: 'emp_1', tarih: '2026-05-10', tur: 'Hafta tatili çalışması', saat: 4 },
  { id: 'att_4', kind: 'att', empId: 'emp_3', tarih: '2026-06-02', tur: 'Fazla mesai', saat: 3 },
  {
    id: 'pay_emp_1_2026-01', kind: 'pay', empId: 'emp_1', donem: '2026-01', brut: 55000, gun: 30, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0,
    paramAd: 'Kayıtlı dönem', snap: { matrah: 46000.25, aMat: 28075.5, net: 41000.1, brut: 55000, toplam: 55000 },
  },
  { id: 'pay_emp_1_2026-03', kind: 'pay', empId: 'emp_1', donem: '2026-03', brut: 56000, ek: 1000, mesaiSaat: 2, tatilSaat: 0, kesinti: 500 },
  { id: 'pay_emp_6_2026-07', kind: 'pay', empId: 'emp_6', donem: '2026-07', brut: 52000, gun: 30, snap: { matrah: 44000, aMat: 28075.5 } },
  {
    id: 'job_1', kind: 'job', baslik: 'CNC Operatörü', ilanKodu: 'IK-2026-001', departmanId: 'dept_1', lokasyon: 'Organize Sanayi, Şehir', calismaSekli: 'İş yerinde',
    calismaTuru: 'Tam zamanlı', deneyim: '2 yıl', egitimSeviye: 'Lise', adet: 2, ucretGoster: true, ucretMin: 40000, ucretMax: 55000, sonBasvuru: '2026-06-01',
    durum: 'Açık', ozet: 'Tezgâhta seri üretim yapılacak. Vardiyalı çalışılır.', sorumluluklar: 'Tezgâh hazırlığı\nÖlçüm\nBakım\nRaporlama',
    nitelikler: 'Bay eleman\n25-35 yaş arası\nAskerlik hizmetini tamamlamış', tercih: 'Fanuc bilgisi', basvuruLink: 'https://ornek.invalid/basvuru?x=1',
  },
  { id: 'job_2', kind: 'job', baslik: 'Planlama Uzmanı', ilanBaslik: 'Üretim Planlama Uzmanı', ilanKodu: 'IK-2026-002', aciklama: 'Planlama deneyimi', ucretGoster: true, ucretMax: 70000 },
  { id: 'job_3', kind: 'job', baslik: 'Stajyer', ilanKodu: 'X-1', sorumluluklar: '', nitelikler: '', basvuruEposta: 'kariyer@ornek.invalid', yanHaklar: 'Servis\nYemek' },
];

const OZEL_AYAR = {
  sirket: 'Örnek Sanayi', cumartesiIsGunu: true, raporKesinti: false, varsayilanTesvik: 't5',
  tatiller: '01-01 Yılbaşı\n2026-05-19 Bayram\n2026-06-02 Ek tatil\nbozuk satır\n10-29 Cumhuriyet',
  yemekYontem: 'Nakit', yemekHesap: 'Günlük tutar × fiili gün', yemekDeger: 320, yemekGvNakit: 300, yemekSgkNakit: 300,
  yolYontem: 'Toplu taşıma kartı / bilet', yolHesap: 'Aylık sabit tutar', yolDeger: 3000, yolGvKart: 158, yolSgkKart: 'limit',
  engelliInd1: 9900, engelliInd2: 5700, engelliInd3: 2400, besOran: 3, aylikSaat: 0, mesaiCarpan: '', ubgtCarpan: 2,
  dilimler: '158000:15\n330000:20\nbozuk\n1200000:27\n4300000:35\n:40', izin1: 0, izinYasMin: 22, kidemTavan: 0,
  ihbar1: 3, ihbar4: 0, sirketTanitim: 'Kısa tanıtım.', kariyerEposta: 'ik@ornek.invalid', kvkkLink: 'https://ornek.invalid/kvkk', ilanLokasyon: 'Şehir',
  primler: [
    { id: 'p1', ad: 'Performans primi', tur: 'oran', deger: 10, siklik: 'ceyrek', aylar: '', atama: 'herkes', kidem: false },
    { id: 'p2', ad: 'İkramiye', tur: 'maas', deger: 0.5, siklik: 'yarim', aylar: '', atama: 'beyaz', kidem: true },
    { id: 'p3', ad: 'Bayram harçlığı', tur: 'sabit', deger: 5000, siklik: 'ozel', aylar: '3; 5, 13 x', atama: 'mavi', kidem: false },
    { id: 'p4', ad: 'Vardiya primi', tur: 'sabit', deger: 2000, siklik: 'her', aylar: '', atama: 'yok', kidem: true },
    { id: 'p5', ad: 'Yıl sonu', tur: 'sabit', deger: 7000, siklik: 'yillik', aylar: '12', atama: 'herkes', kidem: true },
    { id: 'p6', ad: 'Yıllık boş', tur: 'sabit', deger: 1, siklik: 'yillik', aylar: '', atama: 'yok', kidem: false },
  ],
  tesvikler: [
    { id: 't0', ad: 'Yok', tur: 'yok', deger: 0 }, { id: 't5', ad: 'Puan', tur: 'puan', deger: 5 },
    { id: 't6111', ad: 'Asgari', tur: 'asgari', deger: 0 }, { id: 'tsabit', ad: 'Sabit', tur: 'sabit', deger: 1500 },
  ],
  ilanKanallari: [{ id: 'k1', ad: 'Kariyer sayfası', url: '', kod: 'WEB', aktif: true }, { id: 'k2', ad: 'İş Ağı Çğüşöı', url: 'https://is.ornek.invalid', kod: 'IA' }, { id: 'k3', ad: 'Kapalı', aktif: false }],
  donemler: [
    { id: 'd2', ad: 'İkinci', baslangic: '2026-07-01', params: { asgariBrut: 36000, sgkTavan: 324000, kidemTavan: 80000, damgaOran: 0.759 } },
    { id: 'd1', ad: 'Birinci', baslangic: '2026-01-01', params: { asgariBrut: 33030 } },
    { id: 'd0', ad: 'Eski', baslangic: '', params: {} },
  ],
};

const AYLAR = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-09', '2026-12'];
const GUNLER = ['2026-01-01', '2026-03-20', '2026-05-16', '2026-05-17', '2026-05-19', '2026-06-02', '2026-06-13', '2026-10-29', '2027-01-01'];

// Taslak ve kilit kancası: yalnız bordro yolunu değiştirir.
function kancaOzeti(m: Motor): Record<string, unknown> {
  const c = (ad: string, ...a: unknown[]): unknown => m[ad]!(...a);
  return {
    payroll: AYLAR.map((a) => PERSONEL.map((k) => c('payroll', c('get', k.id), a))),
    payInputs: ['2026-05', '2026-06'].map((a) => PERSONEL.map((k) => c('payInputs', c('get', k.id), ...a.split('-').map(Number)))),
  };
}

function motorOzeti(m: Motor, db: Bellek): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  const c = (ad: string, ...a: unknown[]): unknown => m[ad]!(...a);
  const kisiler = PERSONEL.map((k) => c('get', k.id));
  o['S'] = iz(c('S'));
  o['periods'] = c('periods');
  o['periodAt'] = ['', '2025-06-01', '2026-01-01', '2026-06-30', '2026-07-01', '2030-01-01'].map((d) => (c('periodAt', d) as { id: string }).id);
  o['periodEnd'] = (c('periods') as unknown[]).map((p) => c('periodEnd', p));
  o['periodStatus'] = (c('periods') as unknown[]).map((p) => c('periodStatus', p));
  o['settingsFor'] = [null, ...(c('periods') as unknown[])].map((p) => iz(c('settingsFor', p)));
  o['pickParams'] = c('pickParams', { asgariBrut: 1, yok: 2, primler: [{ id: 'x' }], raporKesinti: false });
  o['withPeriod'] = [iz(c('withPeriod', '2025-01-01', () => c('S'))), c('withPeriod', '', () => c('P', 'asgariBrut')), c('withPeriod', '2026-08-01', () => c('P', 'kidemTavan'))];
  o['kisi'] = kisiler.map((e) => ({
    salaryHist: c('salaryHist', e), salaryAt: ['2025-01-01', '2026-01-01', '2026-03-31', '2026-04-01', '2026-12-31'].map((d) => c('salaryAt', e, d)),
    curBrut: c('curBrut', e), nextRaise: c('nextRaise', e), fullName: c('fullName', e), empName: c('empName', (e as { id: string }).id),
    isActive: [undefined, new Date(2026, 0, 1), new Date(2026, 8, 10), new Date(2026, 8, 11), new Date(2027, 0, 1)].map((d) => (d ? c('isActive', e, d) : c('isActive', e))),
    employedInMonth: [[2026, 1], [2026, 2], [2026, 9], [2026, 10], [2027, 1]].map(([y, a]) => c('employedInMonth', e, y, a)),
    leaveBalance: [undefined, new Date(2026, 8, 30), new Date(2030, 0, 1), new Date(2015, 0, 1)].map((d) => (d ? c('leaveBalance', e, d) : c('leaveBalance', e))),
    autoDaysInfo: AYLAR.map((a) => c('autoDaysInfo', e, ...a.split('-').map(Number))),
    fiiliGun: AYLAR.map((a) => c('fiiliGun', e, ...a.split('-').map(Number))),
    payInputs: AYLAR.map((a) => c('payInputs', e, ...a.split('-').map(Number))),
    payroll: AYLAR.map((a) => c('payroll', e, a)),
    engelliIndirim: c('engelliIndirim', e), missingDocs: c('missingDocs', e), benefitMonthly: c('benefitMonthly', e),
    benefitCfg: ['yemek', 'yol'].map((k) => c('benefitCfg', e, k)), tesvikOf: c('tesvikOf', e), empPrims: c('empPrims', e),
    primFor: [1, 3, 5, 6, 12].map((a) => c('primFor', e, a, 50000)), primMonthlyKidem: c('primMonthlyKidem', e),
    attHours: c('attHours', (e as { id: string }).id, '2026-05', ['Fazla mesai', 'Hafta tatili çalışması', 'Resmi tatil çalışması']),
  }));
  o['activeEmps'] = (c('activeEmps') as { id: string }[]).map((e) => e.id);
  o['sortedEmps'] = (c('sortedEmps') as { id: string }[]).map((e) => e.id);
  o['sortedDepts'] = (c('sortedDepts') as { id: string }[]).map((e) => e.id);
  o['adlar'] = [c('fullName', null), c('fullName', undefined), c('empName', ''), c('empName', 'yok'), c('deptName', 'dept_1'), c('deptName', 'dept_3'), c('deptName', null)];
  o['docList'] = c('docList');
  o['criteria'] = c('criteria');
  o['holidays'] = c('holidays');
  o['gunler'] = GUNLER.map((d) => [c('isHoliday', bicim.pd(d)), c('isWorkday', bicim.pd(d))]);
  o['countDays'] = [[null, new Date(2026, 0, 1), true], [new Date(2026, 4, 1), new Date(2026, 4, 31), false], [new Date(2026, 4, 1), new Date(2026, 4, 31), true],
    [new Date(2026, 4, 31), new Date(2026, 4, 1), true], [new Date(2020, 0, 1), new Date(2030, 0, 1), false]].map((a) => c('countDays', ...a));
  o['annualBase'] = [0, 1, 5, 6, 14, 15, 30].map((k) => c('annualBase', k));
  o['ageMin'] = c('ageMin');
  o['brackets'] = c('brackets');
  o['taxOn'] = [-5, 0, 1, 157999.99, 158000, 190000, 400001, 1e7].map((x) => c('taxOn', x));
  o['calcMonth'] = [
    [{ brut: 50000 }, 0, 1], [{ brut: 50000, gun: '' }, 0, 1], [{ brut: 50000, gun: 45 }, 100000, 3, 50000], [{ brut: '60000', gun: '-3', ek: 500, mesaiSaat: 10, tatilSaat: 8, kesinti: 250, bes: true, engelliInd: 3000 }, 250000, 6],
    [{ brut: 400000, gun: 30, emp: kisiler[0], Y: 2026, M: 5, primDetay: [{ ad: 'x', tutar: 1 }] }, 2000000, 5, 140000],
    [{ brut: 33030, emp: kisiler[2], Y: 2026, M: 6 }, 0, 6], [{ brut: 45000, emp: kisiler[1], Y: 2026, M: 3 }, 0, 3], [{ brut: 52000, emp: kisiler[5], Y: 2026, M: 2 }, 0, 2],
  ].map((a) => c('calcMonth', ...a));
  o['benefitCalc'] = [
    ['yemek', { yontem: 'Yok' }, 50000, 20], ['yemek', { yontem: '' }, 50000, 20], ['yemek', { yontem: 'Servis' }, 50000, 20],
    ['yemek', { yontem: 'Nakit', hesap: 'Günlük tutar × fiili gün', deger: 400 }, 50000, 22], ['yemek', { yontem: 'Yemek kartı / çeki', hesap: 'Aylık sabit tutar', deger: 9000 }, 50000, 22],
    ['yol', { yontem: 'Nakit', hesap: 'Brüt ücretin yüzdesi', deger: 3 }, 50000, 22], ['yol', { yontem: 'Toplu taşıma kartı / bilet', hesap: 'x', deger: 100 }, 50000, 22],
  ].map((a) => c('benefitCalc', ...a));
  o['settingsList'] = ['primler', 'tesvikler', 'ilanKanallari', 'yok'].map((k) => c('settingsList', k));
  o['tesvikById'] = ['t0', 't5', 'tsabit', 'yok', undefined].map((k) => c('tesvikById', k));
  const primler = c('settingsList', 'primler') as unknown[];
  o['prim'] = primler.map((p) => ({
    months: c('primMonths', p), amount: [c('primAmount', p, 40000), c('primAmount', p, 40000, ''), c('primAmount', p, 40000, '2,5'), c('primAmount', p, 40000, null)],
    defaultOn: kisiler.map((e) => c('primDefaultOn', p, e)), desc: c('primDesc', p),
  }));
  o['primMonthsOzel'] = [{ siklik: 'yillik', aylar: '0' }, { siklik: 'yillik', aylar: '15' }, { siklik: 'ozel' }, { siklik: 'yok' }].map((p) => c('primMonths', p));
  o['P'] = ['asgariBrut', 'yok', 'mesaiCarpan', 'dilimler'].map((k) => c('P', k));
  o['noticeWeeks'] = [[0], [5, 30], [6, 0], [17], [18, 0], [18, 1], [35], [36, 0], [36, 5], [100]].map((a) => c('noticeWeeks', ...a));
  o['sgkIsverenEtkin'] = c('sgkIsverenEtkin');
  o['exitCode'] = ['04 Belirsiz', '', null, 3].map((k) => [c('exitCodeOf', k), c('noticeRule', c('exitCodeOf', k))]);
  o['noticeRule03'] = c('noticeRule', '03');
  o['severance'] = [
    { giris: '2015-03-10', cikis: '2026-06-30', brut: 60000, yanHak: 5000, kod: '04 x', izinGun: 12 },
    { giris: '2015-03-10', cikis: '2026-08-15', brut: 120000, yanHak: '', kod: '03 x', izinGun: '3,5', cum: 900000 },
    { giris: '2026-01-05', cikis: '2026-06-30', brut: 40000, kod: '' }, { giris: '2020-02-29', cikis: '2025-02-28', brut: 50000, kod: '22 x', cum: '' },
    { giris: '2026-06-30', cikis: '2026-01-01', brut: 1 }, { giris: '', cikis: '2026-01-01' }, { giris: '2019-01-01', brut: 70000, kod: '08' },
  ].map((g) => c('severance', g));
  o['severanceCore'] = c('withPeriod', '2026-03-01', () => c('severanceCore', { giris: '2010-01-01', cikis: '2026-03-01', brut: 90000, kod: '10' }));
  o['brutNetMonths'] = [33030, 100000].map((b) => (c('brutNetMonths', b) as unknown[]).map(iz));
  o['netToBrut'] = [28075.5, 0, 75000].map((n) => (c('netToBrut', n) as { aylik: number; net: number }[]).map((r) => [r.aylik, r.net, iz(r)]));
  o['channels'] = c('channels');
  o['newJobCode'] = c('newJobCode');
  const isler = ['job_1', 'job_2', 'job_3'].map((id) => c('get', id));
  const kanallar = [undefined, ...(c('channels') as unknown[])];
  o['trackLink'] = [['', isler[0], kanallar[1]], ['https://a.invalid', isler[0], undefined], ['https://a.invalid/x?y=1', isler[1], kanallar[2]], ['https://a.invalid', {}, { ad: 'İĞÜŞÖÇ ıi -x-' }]].map((a) => c('trackLink', ...a));
  o['autoPerks'] = c('autoPerks');
  o['ilan'] = isler.map((j) => ({
    parts: kanallar.map((k) => iz(c('postingParts', j, k))), text: kanallar.map((k) => c('postingText', j, k)),
    short: kanallar.map((k) => iz(c('postingShort', j, k))), html: kanallar.map((k) => iz(c('postingHTML', j, k))), checks: c('postingChecks', j),
  }));
  o['postingChecksMetin'] = [{ ilanBaslik: 'Bayan personel, evli, boy: 170, fotoğraflı, 18 yaş altında olmayan, müslüman, bakımlı', askerlik: 1, ozelMetin: 'askerlikle ilişiği olmayan' }]
    .map((j) => c('postingChecks', j));
  // Önbellek: aynı ayar nesnesi yeniden kullanılır, yeni nesne verilince dönem ve tatil önbelleği yenilenir.
  const s1 = c('S');
  o['onbellekAyni'] = c('S') === s1;
  db.setSettings({ asgariBrut: 40000, tatiller: '06-15 Deneme', cumartesiIsGunu: true });
  o['onbellekYeni'] = [c('S') === s1, iz(c('periods')), c('holidays'), c('isWorkday', new Date(2026, 5, 15)), c('isWorkday', new Date(2026, 5, 13))];
  db.upsert({ id: 'emp_7', kind: 'emp', ad: 'Ad7', soyad: 'S', iseGiris: '2026-06-01', brutMaas: 30000 });
  db.remove('emp_4');
  o['bellekKayit'] = [(c('activeEmps') as { id: string }[]).map((e) => e.id), db.records().length, c('all', 'yok'), c('get', 'emp_4'), c('get', '')];
  return o;
}

function bicimOzeti(): Record<string, unknown> {
  const F = bicim as unknown as Record<string, Islev>;
  const c = (ad: string, ...a: unknown[]): unknown => F[ad]!(...a);
  const d = (s: string): unknown => c('pd', s);
  return {
    esc: c('esc', `<a href="x" title='y'>&</a>`), escBos: [c('esc', null), c('esc', undefined), c('esc', 0)],
    uid: /^p_[0-9a-z]+$/.test(String(c('uid', 'p'))), pad: [c('pad', 1), c('pad', 12), c('pad', 123)],
    num: ['', '12', '12,5', '1.234,5', ' 7 ', 'abc', null, undefined, 3, true, 'Infinity', '-0', '1e3'].map((v) => c('num', v)),
    lower: [c('lower', 'İSTANBUL ILIK'), c('lower', null)], today: c('today'),
    pd: ['2026-02-30', '2026-01-15T10:00', '15.01.2026', '', null, 5].map((v) => c('pd', v)),
    ymd: c('ymd', new Date(2026, 0, 5)), addDays: c('addDays', new Date(2026, 1, 27), 3), addMonths: [c('addMonths', new Date(2026, 0, 31), 1), c('addMonths', new Date(2024, 1, 29), -12)],
    addYears: c('addYears', new Date(2024, 1, 29), 1), diffDays: [c('diffDays', d('2026-03-28'), d('2026-03-30')), c('diffDays', d('2026-10-24'), d('2026-10-26'))],
    fullYears: [c('fullYears', d('2000-06-15'), d('2026-06-14')), c('fullYears', d('2000-06-15'), d('2026-06-15'))],
    durationParts: [c('durationParts', d('2015-03-10'), d('2026-06-30')), c('durationParts', null, d('2026-01-01')), c('durationParts', d('2026-02-01'), d('2026-01-01'))],
    durationText: [c('durationText', d('2015-03-10'), d('2026-06-30')), c('durationText', d('2026-01-01'), d('2026-01-12')), c('durationText', d('2026-01-01'), d('2026-03-01'))],
    MONTHS: bicim.MONTHS, DAYS_SHORT: bicim.DAYS_SHORT,
    fmtDate: ['2026-06-05', new Date(2026, 11, 31), '', null].map((v) => c('fmtDate', v)),
    fmtDateShort: ['2026-06-05', new Date(2026, 11, 31), 'x'].map((v) => c('fmtDateShort', v)),
    fmtMoney: [[1234.567], [1234.567, true], [''], [null], [undefined], ['abc'], ['12.5'], [0], [-0.005], [NaN]].map((a) => c('fmtMoney', ...a)),
    fmtNum: [0, null, 1234.5678, '12', -3].map((v) => c('fmtNum', v)),
    relDay: [0, 1, -1, 5, -5].map((n) => c('relDay', c('addDays', c('today'), n))),
    validTCKN: [tckn('100000001'), tckn('234567891'), '00000000000', '12345678901', '1234567890', 'abcdefghijk', tckn('100000001').slice(0, 10) + '0'].map((v) => c('validTCKN', v)),
    validIBAN: [iban('0001000000000000000000001'.slice(0, 22)), 'TR000001000000000000000000', ' tr' + iban('0001000000000000000000001'.slice(0, 22)).slice(2), 'DE00'].map((v) => c('validIBAN', v)),
    fmtIBAN: [c('fmtIBAN', 'tr12 3456789012345678901234 56'), c('fmtIBAN', null)],
    mod97: c('mod97', '123456789'), ibanNumeric: c('ibanNumeric', 'TR12AB'),
    lines: [c('lines', ' a \n\nb\n  '), c('lines', null), c('lines', 5)], deep: [c('deep', { a: [1, { b: 2 }], c: undefined }), c('deep', undefined)],
    nextOccurrence: [c('nextOccurrence', '1990-06-20', new Date(2026, 5, 15)), c('nextOccurrence', '1990-06-10', new Date(2026, 5, 15)), c('nextOccurrence', '', new Date(2026, 5, 15)), c('nextOccurrence', '1990-06-15', new Date(2026, 5, 15))],
    perfAvg: [{ skorlar: { a: 4, b: '5', c: 0, d: 'x' } }, {}, { skorlar: { a: '3,5' } }].map((p) => c('perfAvg', p)),
    perfLabel: [0, 1, 1.5, 2.5, 3.5, 4.5, 5].map((v) => c('perfLabel', v)),
  };
}

function sabitOzeti(): Record<string, unknown> {
  const pozisyonlar = ['', 'CNC Operatörü', 'Üretim Müdürü', 'Bakım teknisyeni', 'Genel müdür yardımcısı', 'Muhasebe asistanı', 'Vardiya Şefi', 'Stajyer', 'Kalite mühendisi',
    'Forklift operatörü', 'Satış temsilcisi', 'Depo sorumlusu', 'Yardımcı eleman', 'İnsan kaynakları', 'çırak', 'CTO', 'Koordinatör'];
  return {
    ...Object.fromEntries(Object.entries(sabitler).filter(([, v]) => typeof v !== 'function')),
    inferCollar: [...pozisyonlar, null, undefined].map((p) => sabitler.inferCollar(p as string)),
    inferLevel: [...pozisyonlar, null].map((p) => sabitler.inferLevel(p as string)),
    collarOf: [{ yakaTipi: 'Mavi yaka', pozisyon: 'Müdür' }, { yakaTipi: 'x', pozisyon: 'operatör' }, null, undefined, {}].map((e) => sabitler.collarOf(e as never)),
    levelOf: [{ kademe: 'Uzman', pozisyon: 'Müdür' }, { kademe: 'x', pozisyon: 'operatör' }, null, {}].map((e) => sabitler.levelOf(e as never)),
  };
}

// Saat sabitlenir (tesis günü 2026-06-15): "bugün"e bağlı işlevler (aktif dönem, yürürlükteki ücret, ilan kodu) her gün aynı sonucu verir.
export function davranisOzeti(): unknown {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-06-15T09:00:00Z') });
  try {
    const kayitlar = (): unknown[] => [...PERSONEL, ...DIGER].map((r) => structuredClone(r));
    const varsayilan = createMemoryDb({ records: kayitlar() as never[], settings: {} as never }) as unknown as Bellek;
    const ozel = createMemoryDb({ records: kayitlar() as never[], settings: structuredClone(OZEL_AYAR) as never }) as unknown as Bellek;
    const kancali = createMemoryDb({ records: kayitlar() as never[], settings: {} as never }) as unknown as Bellek;
    const kanca = {
      draft: (ym: string, id: string): unknown => (ym === '2026-05' && id === 'emp_3' ? { brut: 40000, ek: 250, mesaiSaat: 1, tatilSaat: 0, kesinti: 0 }
        : ym === '2026-06' && id === 'emp_1' ? { brut: 70000, gun: 20, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 100 } : null),
      unlocked: (ym: string): boolean => ym === '2026-07',
    };
    return ozet({
      varsayilan: motorOzeti(createEngine(varsayilan as never, {} as never) as unknown as Motor, varsayilan),
      ozel: motorOzeti(createEngine(ozel as never) as unknown as Motor, ozel),
      kancali: kancaOzeti(createEngine(kancali as never, kanca as never) as unknown as Motor),
      bicim: bicimOzeti(),
      sabitler: sabitOzeti(),
      bosBellek: (() => { const b = createMemoryDb() as unknown as Bellek & { all: Islev; settings: Islev }; return [b.records(), b.all('emp'), b.settings()]; })(),
    });
  } finally {
    mock.timers.reset();
  }
}

describe('İK motoru: davranış sabit', () => {
  const gercek = davranisOzeti() as Record<string, unknown>;
  const beklenen = BEKLENEN as Record<string, unknown>;
  for (const bolum of Object.keys(beklenen)) {
    test(bolum, () => {
      assert.deepEqual(gercek[bolum], beklenen[bolum]);
    });
  }
  test('bölümler aynı', () => {
    assert.deepEqual(Object.keys(gercek).sort(), Object.keys(beklenen).sort());
  });
});
