import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YazCevabi, YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { calismaOku } from './durum.ts';
import { BUYUK, CATISMA, CalismaYazici, ESKI_DEGISIKLIK, IZ_SINIRI, OTURUM, PLAN_YETKI, RET, bekleyenListesi, bekleyenler, type YaziciAyari } from './kayit.ts';
import type { PlanlamaCalismasi } from './tipler.ts';
import { ONEK, PLANLAMA_ANAHTARI } from './veri.ts';

// Belgeler uydurmadır.
function calisma(ek: Record<string, unknown> = {}): PlanlamaCalismasi {
  const c = calismaOku({ surum: 2, D: { siparisler: [], tezgahlar: [], urunler: [] }, dataVer: 3, plan: { dataVer: 3 }, iz: [], ...ek });
  if (c === null) throw new Error('okunmadı');
  return c;
}

function kur(ayar: Partial<YaziciAyari> = {}, cevap: (g: YazGovdesi) => Promise<YazCevabi> = async (g) => ({ kayit: { anahtar: g.anahtar, bicim: 'json', deger: g.deger, surum: (g.beklenenSurum ?? 0) + 1 } })) {
  const yazmalar: YazGovdesi[] = [];
  const uyarilar: string[] = [];
  const y = new CalismaYazici({
    calisma: calisma(), surum: 7, kim: 'Deneme Planlamaci', sayfa: () => 'Planlama motoru', simdi: () => 1000,
    yaz: (g) => { yazmalar.push(g); return cevap(g); }, uyar: (i) => { uyarilar.push(i); }, ...ayar,
  });
  return { y, yazmalar, uyarilar };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('CalismaYazici', () => {
  it('değişiklik veri sürümünü artırır, planı bayatlatır, ize yazar; art arda değişiklikler beklemeden sonra tek yazmada gider', async () => {
    const { y, yazmalar } = kur();
    expect(y.degistir('Ağırlık değişti', (t) => { t.w.sure = 5; })).toBe(true);
    y.degistir('Ağırlık değişti', (t) => { t.w.sure = 6; }, { ayrinti: 'süre' });
    expect(y.calisma.dataVer).toBe(5);
    expect(y.calisma.plan?.dataVer).toBe(3);
    expect(y.calisma.iz[0]).toEqual({ t: 1000, kim: 'Deneme Planlamaci', rol: '', sayfa: 'Planlama motoru', ne: 'Ağırlık değişti', ayrinti: 'süre' });
    expect(yazmalar).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(yazmalar).toHaveLength(1);
    expect(yazmalar[0]).toMatchObject({ anahtar: PLANLAMA_ANAHTARI, bicim: 'json', beklenenSurum: 7 });
    expect((yazmalar[0]?.deger as PlanlamaCalismasi).w.sure).toBe(6);
    expect(y.surum).toBe(8);
  });

  it('başarılı değişiklik bildirilir; bildirimin Geri al düğmesi değişikliği geri alır', () => {
    const iletiler: string[] = [];
    let geri: (() => void) | undefined;
    const { y } = kur({ bildir: (i, g) => { iletiler.push(i); if (g) geri = g; } });
    y.degistir('Ağırlık değişti', (t) => { t.w.sure = 2; });
    y.degistir('Tercih', (t) => { t.pref.a = 1; }, { planKoru: true });
    expect(iletiler).toEqual(['Ağırlık değişti. Plan yeniden çözülünce güncellenir.', 'Tercih.']);
    geri?.();
    expect(iletiler.at(-1)).toBe('Son değişiklik geri alındı.');
    expect(y.calisma.pref.a).toBeUndefined();
  });

  it('yalnız planlama anahtarına yazar; Reçete ve Rota kaydına hiç yazmaz (222 a)', async () => {
    const { y, yazmalar } = kur();
    y.degistir('a', (t) => { t.pref.x = 1; });
    y.degistir('b', (t) => { t.pref.x = 2; });
    await y.hepsiniYaz();
    expect(yazmalar.map((g) => g.anahtar)).toEqual([PLANLAMA_ANAHTARI]);
    expect(yazmalar.some((g) => g.anahtar === ONEK)).toBe(false);
  });

  it('planKoru: güncel plan güncel kalır; false dönen işlev değişiklik yapmaz', async () => {
    const { y, yazmalar } = kur();
    y.degistir('Tercih', (t) => { t.pref.yakinlik = 20; }, { planKoru: true });
    expect(y.calisma.plan?.dataVer).toBe(y.calisma.dataVer);
    expect(y.degistir('Hiç', () => false)).toBe(false);
    expect(y.calisma.iz).toHaveLength(1);
    await y.hepsiniYaz();
    expect(yazmalar).toHaveLength(1);
  });

  it('geri al son değişikliği geri getirir, veri sürümü geri gitmez; yığın boşsa false', async () => {
    const { y } = kur();
    expect(y.geriAlinabilir()).toBe(false);
    y.degistir('Ağırlık', (t) => { t.w.sure = 1; });
    expect(y.geriAl()).toBe(true);
    expect(y.calisma.w.sure).toBe(10);
    expect(y.calisma.dataVer).toBe(5);
    expect(y.calisma.plan?.dataVer).toBe(5);
    expect(y.calisma.iz[0]?.ne).toBe('Geri alındı');
    expect(y.geriAl()).toBe(false);
  });

  it('dinleyici her değişiklikte uyarılır; abonelik kalkınca uyarılmaz', () => {
    const { y } = kur();
    const d = vi.fn();
    const kaldir = y.abone(d);
    y.degistir('a', (t) => { t.pref.a = 1; });
    kaldir();
    y.degistir('b', (t) => { t.pref.b = 1; });
    expect(d).toHaveBeenCalledTimes(1);
  });

  it('sürüm çatışmasında (409) yazma durur, başkasının üstüne yazılmaz, sonraki değişiklik reddedilir', async () => {
    const { y, yazmalar, uyarilar } = kur({}, async () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'eski' }); });
    y.degistir('a', (t) => { t.pref.a = 1; });
    await y.hepsiniYaz();
    expect(uyarilar).toEqual([CATISMA]);
    expect(y.durdu).toBe(true);
    expect(y.degistir('b', (t) => { t.pref.b = 1; })).toBe(false);
    await y.hepsiniYaz();
    expect(yazmalar).toHaveLength(1);
  });

  it('yetkisiz yazma (403) plan yetkisi, oturumsuz (401) oturum iletisi verir; başka hata yeniden denenir', async () => {
    let n = 0;
    const { y, yazmalar, uyarilar } = kur({}, async (g) => {
      n += 1;
      if (n === 1) throw new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'yok' });
      if (n === 2) throw new ApiHatasi(401, { kod: 'OTURUM_YOK', mesaj: 'yok' });
      if (n === 3) throw new Error('ağ');
      return { kayit: { anahtar: g.anahtar, bicim: 'json', deger: g.deger, surum: 9 } };
    });
    y.degistir('a', (t) => { t.pref.a = 1; });
    await y.hepsiniYaz();
    y.degistir('b', (t) => { t.pref.b = 1; });
    await y.hepsiniYaz();
    y.degistir('c', (t) => { t.pref.c = 1; });
    await y.hepsiniYaz();
    y.degistir('d', (t) => { t.pref.d = 1; });
    await y.hepsiniYaz();
    expect(uyarilar).toEqual([PLAN_YETKI, OTURUM, RET]);
    expect(yazmalar).toHaveLength(4);
    expect(y.surum).toBe(9);
  });

  it('sınırı aşan belge gönderilmez, bir kez uyarılır', async () => {
    const { y, yazmalar, uyarilar } = kur({ azamiBayt: 200 });
    y.degistir('a', (t) => { t.pref.uzun = 'x'.repeat(300); });
    await y.hepsiniYaz();
    y.degistir('b', (t) => { t.pref.b = 1; });
    await y.hepsiniYaz();
    expect(yazmalar).toHaveLength(0);
    expect(uyarilar).toEqual([BUYUK]);
  });

  it('yazma yoldayken gelen değişiklik ardından ayrıca yazılır; iz sınırı korunur', async () => {
    let coz: (() => void) | null = null;
    const { y, yazmalar } = kur({ calisma: calisma({ iz: Array.from({ length: IZ_SINIRI }, (_, i) => ({ t: i, kim: '', rol: '', sayfa: '', ne: 'eski', ayrinti: '' })) }) },
      (g) => new Promise((r) => { coz = () => { r({ kayit: { anahtar: g.anahtar, bicim: 'json', deger: g.deger, surum: (g.beklenenSurum ?? 0) + 1 } }); }; }));
    y.degistir('a', (t) => { t.pref.a = 1; });
    expect(y.calisma.iz).toHaveLength(IZ_SINIRI);
    await vi.advanceTimersByTimeAsync(2000);
    y.degistir('b', (t) => { t.pref.b = 1; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(yazmalar).toHaveLength(1);
    (coz as (() => void) | null)?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(yazmalar).toHaveLength(2);
    expect(yazmalar[1]?.beklenenSurum).toBe(8);
  });

  it('sayfa tercihi değişikliği (GERI_ALANLAR dışı alan) geri alınınca eski hâline döner; önceden yoksa silinir', () => {
    const { y } = kur();
    y.degistir('Elle sıra', (t) => { (t as Record<string, unknown>).tpSira = ['2', '1']; }, { planKoru: true });
    y.degistir('Sıra riske göre', (t) => { (t as Record<string, unknown>).tpSira = []; }, { planKoru: true });
    expect(y.geriAl()).toBe(true);
    expect((y.calisma as Record<string, unknown>).tpSira).toEqual(['2', '1']);
    expect(y.geriAl()).toBe(true);
    expect('tpSira' in y.calisma).toBe(false);
  });

  it('sessiz değişiklik ize, bildirime ve geri yığınına girmez, veri sürümünü artırmaz; sunucuya sürüm denetimiyle yazılır', async () => {
    const bildir = vi.fn();
    const { y, yazmalar } = kur({ bildir });
    y.degistir('Gün başı', (t) => { (t as Record<string, unknown>).tpGun = { basi: { gun: '2026-10-25' } }; }, { sessiz: true });
    expect(y.calisma.iz).toHaveLength(0);
    expect(y.calisma.dataVer).toBe(3);
    expect(y.geriAlinabilir()).toBe(false);
    expect(bildir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(yazmalar).toHaveLength(1);
    expect(yazmalar[0]?.beklenenSurum).toBe(7);
    expect((yazmalar[0]?.deger as Record<string, unknown>).tpGun).toEqual({ basi: { gun: '2026-10-25' } });
  });

  it('geri adımları en yenisi önce listelenir; geriDon seçilen karardan öncesine tek adımda döner', () => {
    const { y } = kur();
    y.degistir('Bir', (t) => { t.w.sure = 1; });
    y.degistir('İki', (t) => { t.w.sure = 2; });
    y.degistir('Üç', (t) => { t.w.sure = 3; });
    expect(y.geriAdimlari().map((g) => g.ne)).toEqual(['Üç', 'İki', 'Bir']);
    expect(y.geriDon(2)).toBe(true);
    expect(y.calisma.w.sure).toBe(1);
    expect(y.calisma.iz[0]?.ne).toBe('Seçilen karardan öncesine dönüldü');
    expect(y.geriAdimlari().map((g) => g.ne)).toEqual(['Bir']);
    expect(y.geriDon(0)).toBe(false);
  });

  it('yalnız sessiz değişiklik çatışırsa hata gösterilmez, sayfa yeniden okur; ardından gelen sessiz değişiklik de sessizce bırakılır', async () => {
    const catismadaYenile = vi.fn();
    const { y, uyarilar } = kur({ catismadaYenile }, async () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'eski' }); });
    y.degistir('Gün başı', (t) => { t.pref.g = 1; }, { sessiz: true });
    await y.hepsiniYaz();
    expect(uyarilar).toEqual([]);
    expect(catismadaYenile).toHaveBeenCalledTimes(1);
    expect(y.durdu).toBe(true);
    expect(y.degistir('Gün başı', (t) => { t.pref.g = 2; }, { sessiz: true })).toBe(false);
    expect(uyarilar).toEqual([]);
  });

  it('sessiz değişiklikle birlikte kullanıcı değişikliği çatışırsa çatışma bildirilir', async () => {
    const catismadaYenile = vi.fn();
    const { y, uyarilar } = kur({ catismadaYenile }, async () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'eski' }); });
    y.degistir('Gün başı', (t) => { t.pref.g = 1; }, { sessiz: true });
    y.degistir('Ağırlık', (t) => { t.w.sure = 1; });
    await y.hepsiniYaz();
    expect(uyarilar).toEqual([CATISMA]);
    expect(catismadaYenile).not.toHaveBeenCalled();
  });

  it('kaydet bekleyen değişikliği beklemeden aynı sürüm denetimli yazmayla gönderir ve kayıtlı sürümü verir; değişiklik yoksa yazmaz', async () => {
    const { y, yazmalar } = kur();
    expect(await y.kaydet()).toBe(7);
    expect(yazmalar).toHaveLength(0);
    y.degistir('a', (t) => { t.pref.a = 1; });
    expect(await y.kaydet()).toBe(8);
    expect(yazmalar).toHaveLength(1);
    expect(yazmalar[0]).toMatchObject({ anahtar: PLANLAMA_ANAHTARI, beklenenSurum: 7 });
    await vi.runAllTimersAsync();
    expect(yazmalar).toHaveLength(1);
  });

  it('kaydet çatışmada (409) null verir, yazma durur ve çatışma her zamanki gibi bildirilir', async () => {
    const { y, yazmalar, uyarilar } = kur({}, async () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'eski' }); });
    y.degistir('a', (t) => { t.pref.a = 1; });
    expect(await y.kaydet()).toBeNull();
    expect(yazmalar[0]?.beklenenSurum).toBe(7);
    expect(uyarilar).toEqual([CATISMA]);
    expect(y.durdu).toBe(true);
    expect(await y.kaydet()).toBeNull();
  });

  it('kaydet başka hatada null verir; değişiklik bekler', async () => {
    const { y, uyarilar } = kur({}, async () => { throw new ApiHatasi(500, { kod: 'SUNUCU', mesaj: 'x' }); });
    y.degistir('a', (t) => { t.pref.a = 1; });
    expect(await y.kaydet()).toBeNull();
    expect(uyarilar).toEqual([RET]);
  });
});

describe('bekleyen değişiklikler (755 a)', () => {
  const veri = { siparisler: [{ id: 'S1', urun: 'U1', adet: 4, termin: null }, { id: 'S2', urun: 'U2', adet: 2, termin: null }], tezgahlar: [{ id: 'T1' }, { id: 'T2' }], urunler: [{ id: 'U1' }, { id: 'U2' }] };
  const plan = { dataVer: 3, ops: { 'S1.10': { id: 'S1.10', job: 'S1', m: 'T1', S: 10 }, 'S2.10': { id: 'S2.10', job: 'S2', m: 'T2', S: 12 } } };
  const kurP = (ek: Record<string, unknown> = {}) => kur({ calisma: calisma({ D: veri, plan, ...ek }) });

  it('plan varken değişiklik bekleyene ne, kim, zaman ve etkilediği siparişle girer; planKoru ve plansız değişiklik girmez', () => {
    const { y } = kurP();
    y.degistir('Adet değişti', (t) => { t.D.siparisler[0]!.adet = 6; }, { ayrinti: 'S1 4 -> 6' });
    y.degistir('Rota değişti', (t) => { (t.D.urunler[1] as Record<string, unknown>).rota = []; });
    y.degistir('Arıza', (t) => { t.down.push({ id: 'a1', m: 'T1', from: 20, to: 30 }); });
    y.degistir('Kilit', (t) => { t.locks['S2.10'] = { m: 'T2', S: 12 }; });
    y.degistir('Ağırlık', (t) => { t.w.famK = 0.5; });
    y.degistir('Tercih', (t) => { t.pref.a = 1; }, { planKoru: true });
    expect(bekleyenler(y.calisma).map((e) => [e.ne, e.kim, e.t, e.isler])).toEqual([
      ['Adet değişti', 'Deneme Planlamaci', 1000, ['S1']], ['Rota değişti', 'Deneme Planlamaci', 1000, ['S2']], ['Arıza', 'Deneme Planlamaci', 1000, ['S1']],
      ['Kilit', 'Deneme Planlamaci', 1000, ['S2']], ['Ağırlık', 'Deneme Planlamaci', 1000, ['*']],
    ]);
    expect(bekleyenler(y.calisma)[0]?.ayrinti).toBe('S1 4 -> 6');
    const p = kur({ calisma: calisma({ D: veri, plan: null }) }).y;
    p.degistir('Adet', (t) => { t.D.siparisler[0]!.adet = 6; });
    expect(p.calisma.bekleyen).toBeUndefined();
  });

  it('geri dönüş yol bazlı farktır: verinin tam kopyası tutulmaz', () => {
    const { y } = kurP();
    y.degistir('Adet değişti', (t) => { t.D.siparisler[0]!.adet = 6; });
    expect(bekleyenler(y.calisma)[0]?.geri).toEqual([{ yol: ['D', 'siparisler'], id: 'S1', once: { id: 'S1', urun: 'U1', adet: 4, termin: null } }]);
  });

  it('ret geri dönüş farkını uygular; ortadaki satır sonraki aynı veriye dokunuyorsa reddedilmez; hepsi reddedilince plan güncel', () => {
    const { y, uyarilar } = kurP();
    y.degistir('Adet', (t) => { t.D.siparisler[0]!.adet = 6; });
    y.degistir('Adet yine', (t) => { t.D.siparisler[0]!.adet = 8; });
    y.degistir('Yeni sipariş', (t) => { t.D.siparisler.push({ id: 'S3', urun: 'U1', adet: 1, termin: null }); });
    const [a, b, c] = bekleyenler(y.calisma);
    expect(y.bekleyeniReddet([a!.id])).toMatch(/sonraki "Adet yine" aynı veriye dokunuyor/);
    expect(uyarilar.at(-1)).toMatch(/Önce onu reddedin/);
    expect(y.bekleyeniReddet([c!.id])).toBeNull();
    expect(y.calisma.D.siparisler.map((x) => x.id)).toEqual(['S1', 'S2']);
    expect(y.calisma.plan?.dataVer).not.toBe(y.calisma.dataVer);
    expect(y.bekleyeniReddet([a!.id, b!.id])).toBeNull();
    expect(y.calisma.D.siparisler[0]?.adet).toBe(4);
    expect(y.calisma.bekleyen).toBeUndefined();
    expect(y.calisma.plan?.dataVer).toBe(y.calisma.dataVer);
  });

  it('kilit ve ağırlık reddi: eklenen kilit silinir, ağırlık eski değerine döner', () => {
    const { y } = kurP();
    y.degistir('Kilit', (t) => { t.locks['S2.10'] = { m: 'T2', S: 12 }; });
    y.degistir('Ağırlık', (t) => { t.w.famK = 0.5; });
    const famK = calisma({ D: veri, plan }).w.famK;
    expect(y.bekleyeniReddet(bekleyenler(y.calisma).map((e) => e.id))).toBeNull();
    expect(y.calisma.locks).toEqual({});
    expect(y.calisma.w.famK).toBe(famK);
  });

  it('geri al bekleyeni de geri alır', () => {
    const { y } = kurP();
    y.degistir('Adet', (t) => { t.D.siparisler[0]!.adet = 6; });
    y.degistir('Ağırlık', (t) => { t.w.famK = 0.5; });
    y.geriAl();
    expect(bekleyenler(y.calisma).map((e) => e.ne)).toEqual(['Adet']);
  });

  it('787 a: plan bu özellikten önce bayatladıysa yalnız uygulanabilen satır görünür ve reddedilemez; yeni değişiklik onun ardına girer', () => {
    const { y } = kurP({ dataVer: 5 });
    expect(bekleyenListesi(y.calisma).map((e) => [e.id, e.geri, e.isler])).toEqual([[ESKI_DEGISIKLIK, null, ['*']]]);
    y.degistir('Adet', (t) => { t.D.siparisler[0]!.adet = 6; });
    expect(bekleyenler(y.calisma).map((e) => e.id)).toEqual([ESKI_DEGISIKLIK, expect.any(String)]);
    expect(y.bekleyeniReddet([ESKI_DEGISIKLIK])).toMatch(/yalnız uygulanabilir/);
    expect(y.bekleyeniReddet([bekleyenler(y.calisma)[1]!.id])).toBeNull();
    expect(bekleyenler(y.calisma).map((e) => e.id)).toEqual([ESKI_DEGISIKLIK]);
    expect(y.calisma.plan?.dataVer).not.toBe(y.calisma.dataVer);
  });
});
