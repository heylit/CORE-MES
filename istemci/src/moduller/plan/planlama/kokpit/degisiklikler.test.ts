import { describe, expect, it } from 'vitest';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../tipler.ts';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import { ESKI_DEGISIKLIK } from '../kayit.ts';
import { bekleyenDegisiklikleri, degisiklikDokumu, degisiklikler, gelenEmirleri, gelenler, gerideEmirleri, gorunumdeBekleyenler, guncellemeEtkisi } from './degisiklikler.ts';

// Uydurma örnek (ORN-): şimdi 10. saat; torna 8'de başlayacaktı ve başlamadı, freze başladı, taşlama on dakika önce başlayacaktı.
const is = (id: string, S: number, ek: Partial<KokpitIsi> = {}): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: `Adım ${id}`, m: 'T1', S, C: S + 4, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const emir = (id: string, termin: number | null): KokpitEmri => ({ id, no: `ORN-UE-${id}`, urun: 'ORN-Flanş', adet: 1, termin, bitis: null, durum: 'iyi', gecikme: null, adimlar: [] });
const M: KokpitModeli = {
  simdi: 10, bas: 0, son: 336, acik: {}, durus: {}, tezgahlar: [{ id: 'T1', kod: 'ORN-T1', ad: '', fason: false }], emirler: [emir('1', 40), emir('2', null)],
  isler: { '1.10': is('1.10', 8), '1.20': is('1.20', 6, { basladi: true }), '2.10': is('2.10', 9.9), '2.20': is('2.20', 5, { fason: true }), '2.30': is('2.30', 12), '9.10': is('9.10', 7) },
};
const zaman = (t: number): string => `S${String(t)}`;
const an = (ms: number): string => `A${String(ms)}`;
const bekleyen = (id: string, ek: Partial<BekleyenDegisiklik> = {}): BekleyenDegisiklik => ({ id, ne: `Değişti ${id}`, ayrinti: '', kim: '', t: 0, isler: ['*'], geri: null, ...ek });

describe('degisiklikler (3317 a)', () => {
  it('plan geride: başlangıcı çeyrek saatten çok geçmiş, başlamamış, fason olmayan işler; en eski önce; emir ve termin yazılır', () => {
    const l = degisiklikler({ m: M, bekleyen: [], olaylar: [], zaman, an });
    expect(l.map((d) => [d.baslik, d.isId, d.emirId])).toEqual([['geride', '9.10', null], ['geride', '1.10', '1']]);
    expect(l[1]?.ne).toBe('ORN-UE-1 · Adım 1.10 · ORN-T1 · S8 başlayacaktı');
    expect(l[1]?.alt).toBe('2 sa geride · termin S40');
    // Modelde emri olmayan iş: emir numarası yerine iş kimliğinin emri yazılır, termin yazılmaz.
    expect(l[0]?.ne).toBe('9 · Adım 9.10 · ORN-T1 · S7 başlayacaktı');
    expect(l[0]?.alt).toBe('3 sa geride');
    // 3. adım: emre bağlı, kilitsiz geride iş emri yeniden dizilerek taşınır; emri modelde olmayan ve elle kilitli iş taşınamaz, kilit satırda yazar.
    expect(l.map((d) => d.yenidenDiz)).toEqual([undefined, true]);
    const k = degisiklikler({ m: { ...M, isler: { '1.10': is('1.10', 8, { kilitli: true }) } }, bekleyen: [], olaylar: [], zaman, an });
    expect(k.map((d) => [d.alt, d.yenidenDiz])).toEqual([['2 sa geride · termin S40 · elle kilitli, kilidi kalkmadan taşınmaz', undefined]]);
  });

  // 3335-2b: "Geride kalanları yeniden planla" geride işi olan emirleri verir; elle kilitli geride iş yeniden planlamada yerinde kalır.
  it('geride emirleri: geride işi olan emirler bir kez sayılır; başlamış, fason ve payın içindeki iş sayılmaz; elle kilitli iş ayrı sayılır', () => {
    expect(gerideEmirleri(M)).toEqual({ emirler: ['1', '9'], kilitli: 0 });
    const kilitli = { ...M, isler: { ...M.isler, '1.10': is('1.10', 8, { kilitli: true }), '9.20': is('9.20', 3) } };
    expect(gerideEmirleri(kilitli)).toEqual({ emirler: ['9'], kilitli: 1 });
    expect(gerideEmirleri({ simdi: 5, isler: M.isler })).toEqual({ emirler: [], kilitli: 0 });
  });

  it('gecikme süresi dakika ve saatle yazılır', () => {
    const m = { ...M, simdi: 10.5, isler: { a: is('1.10', 8), b: is('2.10', 10) } };
    expect(degisiklikler({ m, bekleyen: [], olaylar: [], zaman, an }).map((d) => d.alt)).toEqual(['2 sa 30 dk geride · termin S40', '30 dk geride']);
  });

  it('veri değişikliği: kaynak, kişi, zaman ve ayrıntı ikinci satırda; boş alan yazılmaz; emre bağlanmaz', () => {
    const l = degisiklikler({ m: { ...M, isler: {} }, olaylar: [], zaman, an, bekleyen: [bekleyen('a', { dis: true, kim: 'Deneme Kişi', t: 5, ayrinti: 'ORN-fark' }), bekleyen('b')] });
    expect(l.map((d) => [d.baslik, d.ne, d.alt, d.emirId])).toEqual([
      ['veri', 'Değişti a', 'Başka sayfa · Deneme Kişi · A5 · ORN-fark', null],
      ['veri', 'Değişti b', 'Bu sayfa', null],
    ]);
    // Tek başına uygulanabilen yalnız çalışmaya yazılmış satırdır; yazılmamış başka sayfa satırının bekleyen kimliği yoktur.
    expect(l.map((d) => d.bekleyenId)).toEqual([null, 'b']);
    // Kaydı tutulmamış önceki değişikliğin kaynağı bilinmez: "Bu sayfa" yazılmaz, ayrıntısı durur.
    const eski = degisiklikler({ m: { ...M, isler: {} }, olaylar: [], zaman, an, bekleyen: [bekleyen(ESKI_DEGISIKLIK, { ayrinti: 'ORN-ayrinti' })] });
    expect(eski.map((d) => d.alt)).toEqual(['ORN-ayrinti']);
  });

  it('saha olayları yeniden eskiye; emir numarasıyla emre bağlanır; satın alma olayı kaynağıyla ayrılır; sıra veri, saha, geride', () => {
    const olaylar = [
      { neden: 'satin-alma-termini' as const, zaman: '2026-10-20T08:00:00Z', uretimEmriId: 2, emirNo: 'ORN-UE-2', makineId: null, makineKod: null },
      { neden: 'durus' as const, zaman: '2026-10-20T09:00:00Z', uretimEmriId: null, emirNo: null, makineId: 1, makineKod: 'ORN-T1' },
      { neden: 'emir-iptal' as const, zaman: '2026-10-20T07:00:00Z', uretimEmriId: 8, emirNo: 'ORN-UE-8', makineId: null, makineKod: null },
    ];
    const l = degisiklikler({ m: M, bekleyen: [bekleyen('a')], olaylar, zaman, an });
    expect(l.map((d) => d.baslik)).toEqual(['veri', 'saha', 'saha', 'saha', 'geride', 'geride']);
    const saha = l.filter((d) => d.baslik === 'saha');
    expect(saha.map((d) => [d.ne, d.emirId])).toEqual([['Duruş: ORN-T1', null], ['Malzemenin geliş tarihi değişti: ORN-UE-2', '2'], ['Emir iptal edildi: ORN-UE-8', null]]);
    expect(saha[1]?.alt).toBe(`Satın alma · A${String(Date.parse('2026-10-20T08:00:00Z'))} · emrin başlangıcı etkilenebilir`);
    expect(saha[0]?.alt.startsWith('Saha · ')).toBe(true);
    expect(degisiklikDokumu(l)).toBe('1 veri · 3 saha · 2 geride');
  });

  // 3349: fason hizmet siparişinin firma tarihi girilince ya da değişince; kaynak satın almadır, emre bağlanır.
  it('fason firma tarihi olayı satın alma kaynağıyla ve ne olacağıyla yazılır', () => {
    const olaylar = [{ neden: 'fason-termini' as const, zaman: '2026-10-20T08:00:00Z', uretimEmriId: 2, emirNo: 'ORN-UE-2', makineId: null, makineKod: null }];
    const saha = degisiklikler({ m: M, bekleyen: [], olaylar, zaman, an }).filter((d) => d.baslik === 'saha');
    expect(saha.map((d) => [d.ne, d.emirId])).toEqual([['Fason firma tarihi değişti: ORN-UE-2', '2']]);
    expect(saha[0]?.alt).toBe(`Satın alma · A${String(Date.parse('2026-10-20T08:00:00Z'))} · fason dönüşü yeni firma tarihine göre kayabilir`);
  });

  it('dökümde sıfır olan tür yazılmaz; boş listede döküm boştur', () => {
    expect(degisiklikDokumu(degisiklikler({ m: M, bekleyen: [], olaylar: [], zaman, an }))).toBe('2 geride');
    expect(degisiklikDokumu([])).toBe('');
  });
});

// 3317-1b: "Veri değişti" satırlarının kaynağı Kokpit'te ve Motor'da aynı işlevdir.
describe('bekleyenDegisiklikleri', () => {
  const c = (dataVer: number, planVer: number | null, l: BekleyenDegisiklik[]): PlanlamaCalismasi =>
    ({ dataVer, plan: planVer === null ? null : { dataVer: planVer }, bekleyen: l }) as unknown as PlanlamaCalismasi;

  it('plan veriden eskiyse kayıtlı bekleyenleri verir; plan güncelse, plan yoksa ya da çalışma yoksa kayıtlı satır vermez', () => {
    expect(bekleyenDegisiklikleri(c(5, 4, [bekleyen('a'), bekleyen('b')]), null).map((b) => b.id)).toEqual(['a', 'b']);
    expect(bekleyenDegisiklikleri(c(5, 5, [bekleyen('a')]), null)).toEqual([]);
    expect(bekleyenDegisiklikleri(c(5, null, [bekleyen('a')]), null)).toEqual([]);
    expect(bekleyenDegisiklikleri(null, null)).toEqual([]);
  });

  it('bu açılışta gelen yazılmamış satır sona eklenir, plan güncelken de; kayıtlıysa ikinci kez yazılmaz', () => {
    const dis = bekleyen('dis', { dis: true });
    expect(bekleyenDegisiklikleri(c(5, 4, [bekleyen('a')]), dis).map((b) => b.id)).toEqual(['a', 'dis']);
    expect(bekleyenDegisiklikleri(c(5, 5, []), dis).map((b) => b.id)).toEqual(['dis']);
    expect(bekleyenDegisiklikleri(null, dis).map((b) => b.id)).toEqual(['dis']);
    expect(bekleyenDegisiklikleri(c(5, 4, [bekleyen('a'), bekleyen('dis')]), dis).map((b) => b.id)).toEqual(['a', 'dis']);
  });
});

// 3317 a (2. adım): taslakta uygulanan satır listeden düşer; taslağın kendi komutları satır olmaz.
describe('gorunumdeBekleyenler', () => {
  const g = (dataVer: number, planVer: number, l: BekleyenDegisiklik[]): PlanlamaCalismasi => ({ dataVer, plan: { dataVer: planVer }, bekleyen: l }) as unknown as PlanlamaCalismasi;
  const ortak = [bekleyen('a', { geri: [] }), bekleyen('b', { geri: [] })];

  it('görünümde duran satırlar kalır; dizmenin düşürdüğü satır çıkar; taslağın kendi bekleyeni eklenmez', () => {
    expect(gorunumdeBekleyenler(ortak, g(5, 4, ortak)).map((b) => b.id)).toEqual(['a', 'b']);
    expect(gorunumdeBekleyenler(ortak, g(6, 4, [ortak[1]!, bekleyen('taslak')])).map((b) => b.id)).toEqual(['b']);
    expect(gorunumdeBekleyenler(ortak, g(6, 6, []))).toEqual([]);
  });

  it('kaydı olmayan önceki değişiklik satırı görünüm bayatken durur, dizilince çıkar; yazılmamış başka sayfa satırı hep durur', () => {
    const eski = bekleyen(ESKI_DEGISIKLIK), dis = bekleyen('dis', { dis: true });
    expect(gorunumdeBekleyenler([eski, dis], g(6, 4, [bekleyen('taslak')])).map((b) => b.id)).toEqual([ESKI_DEGISIKLIK, 'dis']);
    expect(gorunumdeBekleyenler([eski, dis], g(6, 6, [])).map((b) => b.id)).toEqual(['dis']);
  });
});

// 3532: gelen değişikliğin gantt'taki işareti ve "Planı güncelle"nin sonucu.
describe('gelenler (3532)', () => {
  const m2: KokpitModeli = { ...M, tezgahlar: [...M.tezgahlar, { id: 'T2', kod: 'ORN-T2', ad: '', fason: false }], isler: { ...M.isler, '2.30': is('2.30', 12, { m: 'T2' }) } };
  const olay = (emirNo: string | null, makineKod: string | null) => ({ neden: 'durus' as const, zaman: '2026-10-20T09:00:00Z', uretimEmriId: null, emirNo, makineId: null, makineKod });

  it('veri emirlerin bütün işlerine, saha emrin olay tezgâhındaki işlerine, geride işin kendisine düşer; "*" işaret vermez', () => {
    const l = degisiklikler({ m: m2, zaman, an, bekleyen: [bekleyen('a', { isler: ['1'] }), bekleyen('b')], olaylar: [olay('ORN-UE-2', 'ORN-T2'), olay(null, 'ORN-T1')] });
    const g = gelenler(m2, l);
    const tur = (id: string) => g.isler.get(id)?.map((d) => d.baslik);
    // Bir işte birden çok tür: en acili önce (geride, saha, veri); işaret ilk türdür (Arayüz Z2).
    expect(tur('1.10')).toEqual(['geride', 'veri']);
    expect(tur('1.20')).toEqual(['veri']);
    expect(tur('2.30')).toEqual(['saha']);
    expect(tur('2.10')).toBeUndefined();
    // Emre bağlanamayan olay yalnız tezgâh satırındadır.
    expect([...g.satirlar.keys()]).toEqual(['T1']);
    expect(g.satirlar.get('T1')?.[0]?.ne).toBe('Duruş: ORN-T1');
  });

  it('olay tezgâhı yoksa emrin bütün işleri; işaretin yaktığı emirler o işin değişikliklerinin emirleridir', () => {
    const l = degisiklikler({ m: m2, zaman, an, bekleyen: [bekleyen('a', { isler: ['1', '2'] })], olaylar: [olay('ORN-UE-2', null)] });
    const g = gelenler(m2, l);
    expect(g.isler.get('2.20')?.map((d) => d.baslik)).toEqual(['saha', 'veri']);
    expect([...gelenEmirleri(m2, g, '1.10')].sort()).toEqual(['1', '2']);
    expect([...gelenEmirleri(m2, g, null)].sort()).toEqual(['1', '2', '9']);
    expect([...gelenEmirleri(m2, g, 'yok')]).toEqual([]);
  });
});

describe('guncellemeEtkisi (3532, Risk R2)', () => {
  it('yalnız güncellemeden hemen önceki yerine göre kayan işler sayılır; en çok kayan ve terminini ilk kez aşan emir', () => {
    // Elle taşınmış iş (1.20) güncellemeden önceki modelde zaten yeni yerindedir: güncelleme onu kaydırmadıysa sayılmaz.
    const once = { emirler: [{ ...emir('1', 40), bitis: 30 }, { ...emir('3', 20), bitis: 25 }], isler: { '1.10': is('1.10', 8), '1.20': is('1.20', 20), '3.10': is('3.10', 2) } };
    const sonra = { emirler: [{ ...emir('1', 40), bitis: 43 }, { ...emir('3', 20), bitis: 27 }], isler: { '1.10': is('1.10', 11), '1.20': is('1.20', 20), '3.10': is('3.10', 1, { m: 'T2' }), '4.10': is('4.10', 5) } };
    const e = guncellemeEtkisi(once, sonra);
    expect(e.kayan).toEqual([{ isId: '1.10', fark: 3, tezgahDegisti: false }, { isId: '3.10', fark: -1, tezgahDegisti: true }]);
    expect(e.enCok?.isId).toBe('1.10');
    // 3 zaten geçti (25 > 20): yeniden "gecikir" denmez.
    expect(e.geciken).toEqual(['ORN-UE-1']);
    expect(guncellemeEtkisi(once, once)).toEqual({ kayan: [], enCok: null, geciken: [] });
  });
});
