import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, DurumRotaAdimi, DurumRotaRevizyonu, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { CIHAZ_ANAHTARLARI, ONEK } from './ReceteRotaCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { YAZAR, ac, prototipiCalistir, yazilan, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Rota bölümü rota modülüne bağlıdır (kart #1184): taslak aç, düzenle→kaydet, onaya gönder→onayla→yürürlüğe al; sunucu reddi uyarı olarak görünür.
// Sunucu taklidi rota modülünün uçlarını (taslak-ac, kaydet, onay akışı) bellekte oynar. Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

type Sira = 'taslak' | 'onay_bekliyor' | 'onayli' | 'yururlukte' | 'iptal';
interface AdimGovdesi {
  opNo: number | null; operasyonTipiId: number; ad: string; kaynak: { tur: string; id: number } | null; ayarSuresiDk: number | null; islemSuresiDk: number | null;
  degisimSuresiDk: number | null; bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdedi: number | null; firePayiYuzde: number; makineKullanimi: 'tek' | 'paralel';
  enKucukParca: number | null; yenidenAyar: boolean; adaylar: Array<{ kaynak: { tur: string; id: number }; ayarSuresiDk: number | null; birimSureDk: number | null }>;
  bilesenler: Array<{ malzemeId: number; miktar: number; fireYuzde: number }>; yanUrunler: Array<{ malzemeId: number; miktar: number }>; terminGun?: number | null;
}
interface SunucuRev { id: number; harf: string; durum: Sira; surum: number; aciklama: string | null; adimlar: AdimGovdesi[] }
interface Sunucu {
  revler: SunucuRev[];
  sonraki: number;
  yazmalar: Array<{ yol: string; govde: Record<string, unknown> }>;
  // Yolun son parçasına göre sunucunun vereceği ret (örnek: onayla).
  ret: Record<string, { durum: number; govde: unknown }>;
  // Kayıtlı belge (verilmezse BELGE): önceki oturumdan kalan yerel taslak gibi durumlar için.
  belge?: unknown;
  // Oturumdaki kişi (verilmezse YAZAR: rota.onayla işlemi yok).
  kullanici?: Kullanici;
}
const URUN = 13;

const adimGovdesi = (p: Partial<AdimGovdesi> = {}): AdimGovdesi => ({
  opNo: 10, operasyonTipiId: 1, ad: 'Lazer kesim', kaynak: { tur: 'istasyon', id: 31 }, ayarSuresiDk: 5, islemSuresiDk: 2, degisimSuresiDk: null, bagimlilik: 'bekleyen', devirAdedi: null,
  firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true, adaylar: [], bilesenler: [{ malzemeId: 11, miktar: 1, fireYuzde: 0 }], yanUrunler: [], ...p,
});
const sayi = (v: number | null): number | null => v;

function adimCevir(a: AdimGovdesi, sira: number): DurumRotaAdimi {
  const aday = a.adaylar.filter((x) => x.kaynak.tur === 'istasyon');
  const toplam = a.islemSuresiDk === null ? null : a.islemSuresiDk + (a.degisimSuresiDk ?? 0);
  return {
    id: `${String(URUN)}-o${String(a.opNo)}`, seq: (sira + 1) * 10, opNo: a.opNo ?? 0, opId: String(a.operasyonTipiId), name: a.ad,
    stationId: a.kaynak?.tur === 'istasyon' ? String(a.kaynak.id) : null, machineId: a.kaynak?.tur === 'makine' ? String(a.kaynak.id) : null,
    kisiId: a.kaynak?.tur === 'kisi' ? String(a.kaynak.id) : null, fasonId: a.kaynak?.tur === 'fason' ? String(a.kaynak.id) : null, terminGun: a.terminGun ?? null,
    setup: sayi(a.ayarSuresiDk), proc: a.islemSuresiDk, chg: a.degisimSuresiDk, cycle: toplam,
    dep: a.bagimlilik === 'akisli' ? 'ortulu' : a.bagimlilik === 'bagimsiz' ? 'bagimsiz' : 'bagimli', depQty: a.devirAdedi, rejectPct: a.firePayiYuzde,
    split: a.makineKullanimi === 'paralel' ? 'bol' : 'tek', minLot: a.enKucukParca, resetup: a.yenidenAyar,
    alts: aday.map((x) => String(x.kaynak.id)), altTimes: Object.fromEntries(aday.map((x) => [String(x.kaynak.id), { setup: x.ayarSuresiDk, cycle: x.birimSureDk }])),
    digerAdaylar: [], ins: a.bilesenler.map((b) => ({ itemId: String(b.malzemeId), qty: b.miktar, scrap: b.fireYuzde })),
    outs: a.yanUrunler.map((y) => ({ itemId: String(y.malzemeId), qty: y.miktar, kind: 'yan' as const })),
  };
}
const DURUM_ADI: Record<Sira, DurumRotaRevizyonu['status'] | null> = { taslak: 'taslak', onay_bekliyor: 'onay', onayli: 'onayli', yururlukte: 'yururlukte', iptal: null };

function durumKur(s: Sunucu): DurumCevabi {
  const revizyonlar: DurumRotaRevizyonu[] = s.revler.flatMap((r) => {
    const status = DURUM_ADI[r.durum];
    if (status === null) return [];
    return [{ id: String(r.id), itemId: String(URUN), no: r.harf, status, surum: r.surum, note: r.aciklama ?? '', created: r.id * 1000, approvedAt: null,
      data: { base: null, steps: r.adimlar.map(adimCevir) } }];
  });
  const routes: Record<string, DurumRotaRevizyonu['data']> = {};
  for (const r of revizyonlar) if (r.status === 'yururlukte') routes[r.itemId] = r.data;
  return {
    items: [{ id: String(URUN), kayitNo: URUN, code: 'MM-0001', name: 'Deneme ürün', type: 'mamul', unit: 'adet', cost: null, stock: 10, min: null, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true },
      { id: '11', kayitNo: 11, code: 'HM-0001', name: 'Deneme sac', type: 'ham', unit: 'kg', cost: null, stock: 10, min: null, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }],
    units: [{ kod: 'adet', aktif: true }],
    opdefs: [
      { id: '1', code: 'KES-LZR', abbr: 'LZR', name: 'Lazer kesim', group: 'KES', groupName: 'Kesim', stationId: '31', setup: 5, cycle: 2, aktif: true },
      { id: '2', code: 'KYN-MIG', abbr: 'MIG', name: 'Gazaltı kaynak', group: 'KYN', groupName: 'Kaynak', stationId: '32', setup: 5, cycle: 2, aktif: true },
    ],
    wcs: [{ id: '1', code: 'IM-1', name: 'Merkez', week: null, aktif: true }],
    stations: [
      { id: '31', code: 'IS-31', name: 'Lazer', wcId: '1', eff: 100, opPer: 1, count: 0, cost: null, aktif: true },
      { id: '32', code: 'IS-32', name: 'Kaynak', wcId: '1', eff: 100, opPer: 1, count: 0, cost: null, aktif: true },
    ],
    machines: [], people: [], cal: { shifts: [], holidays: [] }, routes, routeRevs: revizyonlar, fasonFirms: [{ id: '41', code: 'F-01', name: 'Deneme kaplama' }], settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], maliyet: null, malzemeKesildi: false,
  };
}

const BELGE = {
  version: 7, name: 'Deneme fabrika', cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  wcs: [], stations: [], opdefs: [], items: [{ id: 'iMM', code: 'MM-0001', name: 'Deneme ürün', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }], routes: {},
};

function sunucuKur(s: Sunucu): void {
  const bul = (yol: string): SunucuRev | undefined => s.revler.find((r) => yol.startsWith(`/rota/revizyonlar/${String(r.id)}/`));
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const kisi = s.kullanici ?? YAZAR;
    if (yol === '/oturum') return json(200, { kullanici: kisi } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: kisi.id, ad: kisi.ad }, yazabilir: true } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: s.belge ?? BELGE, surum: 1 }] } satisfies KayitlarCevabi);
    if (yontem === 'GET' && yol === '/plan/planlama-kaynagi') return json(200, durumKur(s));
    if (yontem !== 'POST' || !yol.startsWith('/rota/')) return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    const g = JSON.parse(String(secenek?.body)) as Record<string, unknown>;
    s.yazmalar.push({ yol, govde: g });
    const ret = s.ret[yol.split('/').at(-1) ?? ''];
    if (ret) return json(ret.durum, ret.govde);
    if (yol === `/rota/urunler/${String(URUN)}/taslak-ac`) {
      if (s.revler.some((r) => r.durum === 'taslak' || r.durum === 'onay_bekliyor')) return json(409, { kod: 'CAKISMA', mesaj: 'Bu ürünün açık bir revizyonu var; önce onu bitirin ya da iptal edin.' });
      const kaynak = g['kaynak'] as { tur: string; revizyonId?: number };
      const kopya = kaynak.tur === 'revizyon' ? (s.revler.find((r) => r.id === kaynak.revizyonId)?.adimlar ?? []) : [];
      s.sonraki += 1;
      const yeni: SunucuRev = { id: s.sonraki, harf: String.fromCharCode(65 + s.revler.length), durum: 'taslak', surum: 1, aciklama: null, adimlar: JSON.parse(JSON.stringify(kopya)) as AdimGovdesi[] };
      s.revler.push(yeni);
      return json(200, { id: yeni.id, durum: yeni.durum, surum: yeni.surum });
    }
    const r = bul(yol);
    if (!r) return json(404, { kod: 'BULUNAMADI', mesaj: 'Revizyon bulunamadı.' });
    if (g['surum'] !== r.surum) return json(409, { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: 'eski-surum' } });
    const komut = yol.split('/').at(-1);
    const izinli: Record<string, Sira[]> = { kaydet: ['taslak'], 'onaya-gonder': ['taslak'], 'geri-gonder': ['onay_bekliyor'], onayla: ['onay_bekliyor'], 'yururluge-al': ['onayli'], iptal: ['taslak', 'onay_bekliyor'] };
    if (!(izinli[komut ?? ''] ?? []).includes(r.durum)) return json(409, { kod: 'CAKISMA', mesaj: `Revizyon ${r.durum} durumundayken bu işlem yapılamaz.` });
    if (komut === 'kaydet') {
      const adimlar = g['adimlar'] as AdimGovdesi[];
      let sonOp = Math.max(0, ...s.revler.flatMap((x) => x.adimlar.map((a) => a.opNo ?? 0)));
      r.adimlar = adimlar.map((a) => { if (a.opNo === null) { sonOp += 10; return { ...a, opNo: sonOp }; } return a; });
      r.aciklama = g['aciklama'] as string | null;
    } else if (komut === 'onaya-gonder') r.durum = 'onay_bekliyor';
    else if (komut === 'geri-gonder') r.durum = 'taslak';
    else if (komut === 'iptal') r.durum = 'iptal';
    else if (komut === 'onayla' || komut === 'yururluge-al') {
      const yururluge = komut === 'yururluge-al' || g['yururlugeAl'] === true;
      if (yururluge) for (const x of s.revler) if (x.durum === 'yururlukte') x.durum = 'onayli';
      r.durum = yururluge ? 'yururlukte' : 'onayli';
    }
    r.surum += 1;
    return json(200, { id: r.id, durum: r.durum, surum: r.surum });
  }));
}

let dinleyici: ((e: MessageEvent) => void) | null = null;
function koprusunuKur(): void {
  const isle = kopruKur(CIHAZ_ANAHTARLARI);
  dinleyici = (e: MessageEvent) => {
    const m = e.data as { kanal?: string; yon?: string; id?: number; tip?: string; veri?: unknown } | null;
    if (m?.kanal !== 'recete-rota' || m.yon !== 'istek' || typeof m.id !== 'number' || typeof m.tip !== 'string' || m.tip === 'kayit-yaz') return;
    const cerceve = Array.from(document.querySelectorAll('iframe')).reverse().find((f) => f.getAttribute('srcdoc') === null);
    const yanit = (govde: Record<string, unknown>) => {
      const w = cerceve?.contentWindow as (Window & { MessageEvent: typeof MessageEvent }) | null | undefined;
      if (!w) return;
      w.dispatchEvent(new w.MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'yanit', id: m.id, ...govde }, source: w.parent }));
    };
    isle(m.tip, m.veri).then((veri) => { yanit({ ok: true, veri }); }, (h: unknown) => { yanit({ ok: false, ...kopruHatasi(h) }); });
  };
  window.addEventListener('message', dinleyici);
}

async function ekranAc(s: Sunucu) {
  sunucuKur(s);
  koprusunuKur();
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const b = await prototipiCalistir(html);
  const pencere = b.defaultView as unknown as Window & { eval: (k: string) => unknown };
  const ifade = <T,>(k: string): T => JSON.parse((pencere.eval(`JSON.stringify(${k})`) as string | undefined) ?? 'null') as T;
  await waitFor(() => { expect(ifade<boolean>('!!BAGLI.durum')).toBe(true); }, { timeout: 10000 });
  // Kaynaklar da sunucudan gelmiş olmalı (adımın istasyonu sunucu kimliğidir).
  await waitFor(() => { expect(ifade<string[]>('st.stations.map(x=>x.id)')).toEqual(['31', '32']); }, { timeout: 10000 });
  const al = <T extends Element>(k: string): T => { const el = b.querySelector<T>(k); expect(el, k).not.toBeNull(); return el!; };
  const bildirim = () => Array.from(b.querySelectorAll('#toasts .toast')).map((t) => t.textContent).join(' | ');
  const calistir = (k: string): void => { pencere.eval(k); };
  const tikla = (k: string) => { fireEvent.click(al(k)); };
  return { b, ifade, al, bildirim, calistir, tikla };
}

const ONAYCI: Kullanici = { ...YAZAR, islemler: [...YAZAR.islemler, 'rota.onayla'] };
const sunucuBaslangic = (revler: SunucuRev[] = []): Sunucu => ({ revler, sonraki: revler.reduce((m, r) => Math.max(m, r.id), 100), yazmalar: [], ret: {} });
afterEach(() => { if (dinleyici !== null) window.removeEventListener('message', dinleyici); dinleyici = null; cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

// Prototipin adım biçimi (yerel düzenleme): istasyon kimliği sunucununkidir.
const YEREL_ADIM = `{id:"pa", seq:10, opId:"1", stationId:"31", setup:5, proc:2, chg:null, cycle:2, dep:"bagimli", depQty:1, rejectPct:0, split:"tek", minLot:0, resetup:true, alts:[], altTimes:{}, ins:[{id:"ga", itemId:"11", qty:1, scrap:0, status:""}], outs:[], outItem:"", outStatus:"", transfer:0}`;
const yazilanlar = (s: Sunucu): string[] => s.yazmalar.map((y) => y.yol.replace('/rota/', '').replace(/revizyonlar\/\d+/, 'revizyonlar/#'));

describe('Rota rota modülüne bağlıdır (kart #1184)', () => {
  it('RTB-1: yürürlükteki sunucu rotası ekranda adımlarıyla (istasyon dahil) görünür; sunucuda olmayan alanlar yerelde kalır', async () => {
    const s = sunucuBaslangic([{ id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: 'İlk', adimlar: [adimGovdesi({ opNo: 10 }), adimGovdesi({ opNo: 20, ad: 'Kaynak', operasyonTipiId: 2, kaynak: { tur: 'istasyon', id: 32 }, bagimlilik: 'akisli', devirAdedi: 4 })] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade<string[]>('(st.routes["13"]||{steps:[]}).steps.map(x=>x.id)')).toEqual(['13-o10', '13-o20']); });
    expect(e.ifade('st.routes["13"].steps.map(x=>[x.seq,x.opId,x.stationId,x.dep,x.depQty])')).toEqual([[10, '1', '31', 'bagimli', 1], [20, '2', '32', 'ortulu', 4]]);
    expect(e.ifade('st.routeRevs.map(r=>[r.id,r.no,r.status,r.surum])')).toEqual([['7', 'A', 'yururlukte', 3]]);
    expect(s.yazmalar).toEqual([]);
  }, 40000);

  it('ticari mal ve hizmet girdi listesinde çıkmaz, yan ürün listesinde çıkar; adı yazılsa da girdi olarak eklenmez', async () => {
    const e = await ekranAc(sunucuBaslangic());
    e.ifade(`(st.items.push({id:"15", kayitNo:15, code:"TM-0001", name:"Deneme ticari", type:"ham", girdiOlabilir:false}, {id:"16", kayitNo:16, code:"HZ-0001", name:"Deneme hizmet", type:"hizmet", girdiOlabilir:false}), 1)`);
    expect(e.ifade<string[]>('cardOptions(null, true).map(o=>o.itemId)')).not.toContain('15');
    expect(e.ifade<string[]>('cardOptions(null, true).map(o=>o.itemId)')).not.toContain('16');
    expect(e.ifade<string[]>('cardOptions(null, true).map(o=>o.itemId)')).toContain('11');
    expect(e.ifade<string[]>('cardOptions(null, false).map(o=>o.itemId)')).toEqual(expect.arrayContaining(['15', '16']));
    expect(e.ifade<boolean[]>('["15","16","11"].map(id=>girdiOlur(item(id)))')).toEqual([false, false, true]);
  }, 40000);

  it('RTB-2: ilk rota yerelde kurulunca taslak açılır ve bütün içerik sürümle kaydedilir; ekran sunucunun adım kimliğine geçer', async () => {
    const s = sunucuBaslangic();
    const e = await ekranAc(s);
    e.calistir(`routeEdit(()=>{ st.routes["13"] = {base:1, steps:[${YEREL_ADIM}]}; })`);
    await waitFor(() => { expect(s.yazmalar.length).toBe(2); }, { timeout: 10000 });
    expect(yazilanlar(s)).toEqual(['urunler/13/taslak-ac', 'revizyonlar/#/kaydet']);
    expect(s.yazmalar[0]?.govde).toEqual({ kaynak: { tur: 'bos' } });
    expect(s.yazmalar[1]?.govde).toEqual({ surum: 1, aciklama: 'İlk rota', adimlar: [adimGovdesi({ opNo: null, birimSureDk: undefined } as Partial<AdimGovdesi>)].map((a) => ({
      opNo: null, operasyonTipiId: a.operasyonTipiId, ad: 'Lazer kesim', kaynak: a.kaynak, ayarSuresiDk: 5, birimSureDk: null, islemSuresiDk: 2, degisimSuresiDk: null, terminGun: null,
      bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true, adaylar: [], bilesenler: [{ malzemeId: 11, miktar: 1, fireYuzde: 0 }], yanUrunler: [],
    })) });
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>[r.id,r.status,r.sunucu===true])')).toEqual([['101', 'taslak', true]]); });
    expect(e.ifade('st.routeRevs[0].data.steps.map(x=>x.id)')).toEqual(['13-o10']);
    // Yürürlükteki rota değişmedi: taslak onaylanana kadar plan eskisiyle devam eder.
    expect(e.ifade('st.routes["13"]')).toBeNull();
  }, 40000);

  it('RTB-3: yürürlükteki rotayı düzenlemek o revizyondan taslak açar; ikinci düzenleme yeni taslak açmadan sürümle kaydedilir; OP numaraları korunur', async () => {
    const s = sunucuBaslangic([{ id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: null, adimlar: [adimGovdesi({ opNo: 10 }), adimGovdesi({ opNo: 20, operasyonTipiId: 2, ad: 'Kaynak', kaynak: { tur: 'istasyon', id: 32 } })] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade<number>('(st.routes["13"]||{steps:[]}).steps.length')).toBe(2); });
    e.calistir('routeEdit(()=>{ st.routes["13"].steps[0].setup = 9; })');
    await waitFor(() => { expect(s.yazmalar.length).toBe(2); }, { timeout: 10000 });
    expect(s.yazmalar[0]?.govde).toEqual({ kaynak: { tur: 'revizyon', revizyonId: 7 } });
    const ilk = s.yazmalar[1]?.govde as { surum: number; adimlar: AdimGovdesi[] };
    expect(ilk.surum).toBe(1);
    expect(ilk.adimlar.map((a) => [a.opNo, a.ayarSuresiDk, a.kaynak?.id])).toEqual([[10, 9, 31], [20, 5, 32]]);
    await waitFor(() => { expect(e.ifade('st.routeRevs.find(r=>r.id==="101").surum')).toBe(2); });
    e.calistir('routeEdit(()=>{ st.routes["13"].steps[1].proc = 7; })');
    await waitFor(() => { expect(s.yazmalar.length).toBe(3); }, { timeout: 10000 });
    expect(yazilanlar(s)).toEqual(['urunler/13/taslak-ac', 'revizyonlar/#/kaydet', 'revizyonlar/#/kaydet']);
    const ikinci = s.yazmalar[2]?.govde as { surum: number; adimlar: AdimGovdesi[] };
    expect(ikinci.surum).toBe(2);
    expect(ikinci.adimlar.map((a) => [a.opNo, a.ayarSuresiDk, a.islemSuresiDk])).toEqual([[10, 9, 2], [20, 5, 7]]);
    expect(s.revler.find((r) => r.id === 7)?.durum).toBe('yururlukte');
  }, 40000);

  it('RTB-4: taslak onaya gönderilir, onaylanıp yürürlüğe alınır; rota aynı adımlarla sunucuda yürürlüktedir ve plan onu kullanır', async () => {
    const s = { ...sunucuBaslangic(), kullanici: ONAYCI };
    const e = await ekranAc(s);
    e.calistir(`routeEdit(()=>{ st.routes["13"] = {base:1, steps:[${YEREL_ADIM}]}; })`);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.id)')).toEqual(['101']); }, { timeout: 10000 });
    await waitFor(() => { expect(e.ifade('st.routeRevs[0].imza === rotaImza(st.routeRevs[0])')).toBe(true); });
    e.calistir('ui.tab = "schema"; ui.root = "13"; render();');
    e.tikla('[data-act="revPanel"][data-v="submit"]');
    (e.al('#revNote') as HTMLInputElement).value = 'Kesim sırası düzeltildi';
    e.tikla('[data-act="revSubmit"]');
    await waitFor(() => { expect(s.revler[0]?.durum).toBe('onay_bekliyor'); }, { timeout: 10000 });
    // Açıklama onaya gitmeden önce sunucuya yazıldı, onay güncel sürümle gitti.
    expect(yazilanlar(s)).toEqual(['urunler/13/taslak-ac', 'revizyonlar/#/kaydet', 'revizyonlar/#/kaydet', 'revizyonlar/#/onaya-gonder']);
    expect(s.yazmalar[2]?.govde).toMatchObject({ surum: 2, aciklama: 'Kesim sırası düzeltildi' });
    expect(s.yazmalar[3]?.govde).toEqual({ surum: 3 });
    await waitFor(() => { expect(e.ifade('st.routeRevs[0].status')).toBe('onay'); });
    e.tikla('[data-act="revPanel"][data-v="approve"]');
    e.tikla('[data-act="revApprove"]');
    expect(s.revler[0]?.durum).toBe('onay_bekliyor');
    e.tikla('[data-act="revApprove"]');
    await waitFor(() => { expect(s.revler[0]?.durum).toBe('yururlukte'); }, { timeout: 10000 });
    expect(s.yazmalar.at(-1)).toEqual({ yol: '/rota/revizyonlar/101/onayla', govde: { surum: 4, yururlugeAl: true } });
    await waitFor(() => { expect(e.ifade('st.routes["13"].steps.map(x=>[x.id,x.stationId,x.opId])')).toEqual([['13-o10', '31', '1']]); });
    // Kabul: yürürlüğe alınan rotanın adımları rota modülünün tuttuğuyla aynıdır (istasyon dahil).
    expect(s.revler[0]?.adimlar.map((a) => [a.opNo, a.kaynak])).toEqual([[10, { tur: 'istasyon', id: 31 }]]);
    expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['yururlukte']);
  }, 60000);

  it('RTB-4b: işlem süresi boş adım onaya gitmez, ekrandaki OP numarasıyla seçilir; boş hazırlık 0 olarak kaydedilir (kullanıcı kararı 14.10.2026)', async () => {
    const s = sunucuBaslangic();
    const e = await ekranAc(s);
    const adim = YEREL_ADIM.replace('setup:5, proc:2', 'setup:"", proc:null');
    e.calistir(`routeEdit(()=>{ st.routes["13"] = {base:1, steps:[${adim}]}; })`);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.id)')).toEqual(['101']); }, { timeout: 10000 });
    await waitFor(() => { expect(e.ifade('st.routeRevs[0].imza === rotaImza(st.routeRevs[0])')).toBe(true); });
    expect((s.yazmalar[1]?.govde as { adimlar: AdimGovdesi[] }).adimlar.map((a) => [a.ayarSuresiDk, a.islemSuresiDk])).toEqual([[0, null]]);
    e.calistir('ui.tab = "schema"; ui.root = "13"; render();');
    e.tikla('[data-act="revPanel"][data-v="submit"]');
    e.tikla('[data-act="revSubmit"]');
    await waitFor(() => { expect(e.bildirim()).toContain('OP 10'); }, { timeout: 10000 });
    expect(e.bildirim()).toContain('işlem süresi girilmeli');
    expect(e.bildirim()).not.toContain('ayar');
    expect(yazilanlar(s)).not.toContain('revizyonlar/#/onaya-gonder');
    expect(e.ifade('ui.sel && ui.sel.kind === "step" ? ui.sel.itemId : null')).toBe('13');
    expect(s.revler[0]?.durum).toBe('taslak');
  }, 40000);

  // Kart #1372: ilk adımda giren yoksa Terminal neyi tüketeceğini bilemez; taslak kaydedilir ama onaya gitmez, eksik adım seçilir ve ekranda yazılır.
  it('RTB-12: girensiz ilk adım onaya gitmez; taslak kaydedilir, eksik adım seçilir ve rota çubuğunda eksik yazılır', async () => {
    const s = sunucuBaslangic();
    const e = await ekranAc(s);
    const adim = YEREL_ADIM.replace('ins:[{id:"ga", itemId:"11", qty:1, scrap:0, status:""}]', 'ins:[]');
    e.calistir(`routeEdit(()=>{ st.routes["13"] = {base:1, steps:[${adim}]}; })`);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.id)')).toEqual(['101']); }, { timeout: 10000 });
    await waitFor(() => { expect(e.ifade('st.routeRevs[0].imza === rotaImza(st.routeRevs[0])')).toBe(true); });
    expect((s.yazmalar[1]?.govde as { adimlar: AdimGovdesi[] }).adimlar.map((a) => a.bilesenler)).toEqual([[]]);
    e.calistir('ui.tab = "schema"; ui.root = "13"; render();');
    expect(e.b.querySelector('.revbar .rota-eksik')?.textContent).toContain('OP 10 Lazer kesim: giren (hammadde ya da yarı mamul) seçilmeli');
    e.tikla('[data-act="revPanel"][data-v="submit"]');
    e.tikla('[data-act="revSubmit"]');
    await waitFor(() => { expect(e.bildirim()).toContain('Rota eksik, onaya gönderilmedi'); }, { timeout: 10000 });
    expect(yazilanlar(s)).not.toContain('revizyonlar/#/onaya-gonder');
    expect(e.ifade('ui.sel && ui.sel.kind === "step" ? ui.sel.itemId : null')).toBe('13');
    expect(Array.from(e.b.querySelectorAll('.rota-eksik')).map((x) => x.textContent).join(' ')).toContain('Eksik rota onaya gönderilemez');
    expect(s.revler[0]?.durum).toBe('taslak');
  }, 40000);

  it('RTB-5: sunucu onayı reddederse iletisi uyarı olarak görünür ve revizyon onayda kalır; yürürlüğe alma ayrı komuttur', async () => {
    const s = { ...sunucuBaslangic([{ id: 9, harf: 'A', durum: 'onay_bekliyor', surum: 4, aciklama: null, adimlar: [adimGovdesi()] }]), kullanici: ONAYCI };
    s.ret['onayla'] = { durum: 403, govde: { kod: 'YETKI_YOK', mesaj: 'Onaya gönderdiğin ya da düzenlediğin revizyonu onaylayamazsın.' } };
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['onay']); });
    e.calistir('ui.tab = "schema"; ui.root = "13"; ui.revPanel = "approve"; render();');
    e.tikla('[data-act="revApprove"]');
    e.tikla('[data-act="revApprove"]');
    await waitFor(() => { expect(e.bildirim()).toContain('Onaya gönderdiğin ya da düzenlediğin revizyonu onaylayamazsın.'); }, { timeout: 10000 });
    expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['onay']);
    expect(e.ifade('st.routes["13"]')).toBeNull();
    delete s.ret['onayla'];
    e.tikla('[data-act="revApproveOnly"]');
    await waitFor(() => { expect(s.revler[0]?.durum).toBe('onayli'); }, { timeout: 10000 });
    expect(s.yazmalar.at(-1)).toEqual({ yol: '/rota/revizyonlar/9/onayla', govde: { surum: 4, yururlugeAl: false } });
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['onayli']); });
    e.calistir('ui.revPanel = null; render();');
    e.tikla('.rv-list [data-act="revSee"]');
    e.tikla('[data-act="revActivate"]');
    e.tikla('[data-act="revActivate"]');
    await waitFor(() => { expect(s.revler[0]?.durum).toBe('yururlukte'); }, { timeout: 10000 });
    expect(s.yazmalar.at(-1)).toEqual({ yol: '/rota/revizyonlar/9/yururluge-al', govde: { surum: 5 } });
    await waitFor(() => { expect(e.ifade<number>('st.routes["13"].steps.length')).toBe(1); });
  }, 60000);

  // Akış A provası O1: onay komutunun reddi kayıt hatası değildir; ileti hangi işlemin yapılamadığını söyler, kayıt yazması sürer.
  it('RTB-5b: onay 403 alırsa ileti "Onaylanamadı" der, "taslağına kaydedilemedi" demez; sonraki değişiklik yine kaydedilir', async () => {
    const s = sunucuBaslangic([{ id: 9, harf: 'A', durum: 'onay_bekliyor', surum: 4, aciklama: null, adimlar: [adimGovdesi()] }]);
    s.ret['onayla'] = { durum: 403, govde: { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' } };
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['onay']); });
    e.calistir('ui.tab = "schema"; ui.root = "13"; ui.revPanel = "approve"; render();');
    e.tikla('[data-act="revApproveOnly"]');
    await waitFor(() => { expect(e.bildirim()).toContain('Onaylanamadı: Bu işlem için yetkiniz yok.'); }, { timeout: 10000 });
    expect(e.bildirim()).not.toContain('kaydedilemedi');
    expect(e.b.querySelector('.revbar')?.textContent ?? '').not.toContain('kaydedilemedi');
    expect(e.ifade('st.routeRevs[0].kayitHatasi')).toBeNull();
    const once = yazilan.length;
    e.calistir('st.name = "Deneme fabrika 2"; save();');
    await waitFor(() => { expect(yazilan.length).toBeGreaterThan(once); }, { timeout: 10000 });
  }, 60000);

  it('RTB-6: sürüm çakışması ve kaydet reddi uyarı olarak görünür; taslak ekranda kalır, aynı içerik yeniden denenmez', async () => {
    const s = sunucuBaslangic([{ id: 9, harf: 'A', durum: 'taslak', surum: 4, aciklama: null, adimlar: [adimGovdesi()] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['taslak']); });
    s.ret['kaydet'] = { durum: 422, govde: { kod: 'DOGRULAMA', mesaj: 'OP 10 iki kez kullanılamaz.' } };
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 8; })');
    await waitFor(() => { expect(e.bildirim()).toContain('OP 10 iki kez kullanılamaz.'); }, { timeout: 10000 });
    expect(e.ifade('openRev("13").data.steps[0].setup')).toBe(8);
    const denemeler = s.yazmalar.length;
    await new Promise((coz) => { setTimeout(coz, 1500); });
    expect(s.yazmalar.length).toBe(denemeler);
    // Sürüm çakışması: ekran sunucudakiyle yenilenir ve çakışma iletisi görünür.
    delete s.ret['kaydet'];
    const sunucudaki = s.revler[0];
    if (sunucudaki) { sunucudaki.surum = 6; sunucudaki.adimlar = [adimGovdesi({ ayarSuresiDk: 3 })]; }
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 11; })');
    await waitFor(() => { expect(e.bildirim()).toContain(ESKI_SURUM_ILETISI); }, { timeout: 10000 });
    await waitFor(() => { expect(e.ifade('openRev("13").data.steps[0].setup')).toBe(3); }, { timeout: 10000 });
    expect(e.ifade('openRev("13").surum')).toBe(6);
  }, 60000);

  it('RTB-7: kaydet reddi onaya gönderirken nedeniyle söylenir; sunucunun adım alanı ekrandaki OP numarasına çevrilir', async () => {
    const s = sunucuBaslangic([{ id: 9, harf: 'A', durum: 'taslak', surum: 4, aciklama: null, adimlar: [adimGovdesi()] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['taslak']); });
    s.ret['kaydet'] = { durum: 422, govde: { kod: 'DOGRULAMA', mesaj: 'OP 30: devir adedi yalnız akışlı adımda girilir.', alan: 'adimlar.0.devirAdedi' } };
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 8; })');
    await waitFor(() => { expect(e.bildirim()).toContain('devir adedi'); }, { timeout: 10000 });
    expect(e.bildirim()).toMatch(/^OP 10 /);
    expect(e.bildirim()).not.toContain('OP 30');
    e.calistir('ui.tab = "schema"; ui.root = "13"; render();');
    e.tikla('[data-act="revPanel"][data-v="submit"]');
    e.tikla('[data-act="revSubmit"]');
    await waitFor(() => { expect(e.bildirim()).toContain('Taslak rota modülüne kaydedilemedi: OP 10'); }, { timeout: 10000 });
    expect(e.bildirim()).toContain('devir adedi yalnız akışlı adımda girilir.');
    expect(yazilanlar(s)).not.toContain('revizyonlar/#/onaya-gonder');
  }, 40000);

  it('RTB-10: taslak başka yerde onaylanınca kaydedilmemiş değişiklik onaylı revizyona yazılmaz; yeni taslak revizyona taşınır ve kaydedilir', async () => {
    const s = sunucuBaslangic([{ id: 9, harf: 'A', durum: 'taslak', surum: 4, aciklama: null, adimlar: [adimGovdesi({ opNo: 10 })] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['taslak']); });
    // kayıt reddedilir: değişiklik ekranda kaydedilmemiş kalır
    s.ret['kaydet'] = { durum: 422, govde: { kod: 'DOGRULAMA', mesaj: 'Deneme reddi.' } };
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 8; })');
    await waitFor(() => { expect(e.bildirim()).toContain('Deneme reddi.'); }, { timeout: 10000 });
    delete s.ret['kaydet'];
    const r9 = s.revler[0];
    if (r9) { r9.durum = 'onayli'; r9.surum = 5; }
    const once = s.yazmalar.length;
    e.calistir('baglaYukle()');
    await waitFor(() => { expect(e.bildirim()).toContain('yeni taslak revizyona taşındı'); }, { timeout: 10000 });
    await waitFor(() => { expect(s.revler.length).toBe(2); }, { timeout: 10000 });
    await waitFor(() => { expect(s.revler[1]?.adimlar[0]?.ayarSuresiDk).toBe(8); }, { timeout: 10000 });
    expect(s.yazmalar.slice(once).map((y) => y.yol.replace(/revizyonlar\/\d+/, 'revizyonlar/#'))).toEqual(['/rota/urunler/13/taslak-ac', '/rota/revizyonlar/#/kaydet']);
    expect(s.yazmalar[once]?.govde).toEqual({ kaynak: { tur: 'revizyon', revizyonId: 9 } });
    expect(r9?.durum).toBe('onayli');
    expect(e.bildirim()).not.toContain('onaylı durumundayken');
  }, 60000);

  it('RTB-13: sunucu ilerlemişken yerelde kalan kaydedilmemiş eski taslak korunmaz; sunucudaki alınır, uyarı görünür ve sonraki düzenleme çakışmadan kaydedilir', async () => {
    const s = sunucuBaslangic([{ id: 9, harf: 'A', durum: 'taslak', surum: 4, aciklama: null, adimlar: [adimGovdesi({ opNo: 10 })] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['taslak']); });
    s.ret['kaydet'] = { durum: 422, govde: { kod: 'DOGRULAMA', mesaj: 'Deneme reddi.' } };
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 8; })');
    await waitFor(() => { expect(e.bildirim()).toContain('Deneme reddi.'); }, { timeout: 10000 });
    delete s.ret['kaydet'];
    // Başka bir oturum aynı taslağı kaydetti: sunucu sürüm 6'da, ayar süresi 3.
    const r9 = s.revler[0];
    if (r9) { r9.surum = 6; r9.adimlar = [adimGovdesi({ opNo: 10, ayarSuresiDk: 3 })]; }
    e.calistir('baglaYukle()');
    await waitFor(() => { expect(e.bildirim()).toContain('kaydedilmemiş eski değişiklik'); }, { timeout: 10000 });
    expect(e.ifade('openRev("13").surum')).toBe(6);
    expect(e.ifade('openRev("13").data.steps[0].setup')).toBe(3);
    const once = s.yazmalar.length;
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 9; })');
    await waitFor(() => { expect(r9?.adimlar[0]?.ayarSuresiDk).toBe(9); }, { timeout: 10000 });
    expect(s.yazmalar.slice(once).map((y) => (y.govde as { surum?: number }).surum)).toEqual([6]);
    expect(e.bildirim()).not.toContain(ESKI_SURUM_ILETISI);
  }, 60000);

  it('RTB-14: sayfa açılışı rotaya yazmaz: önceki oturumdan kalan yerel fark onaydaki revizyonu taslağa döndürmez, sunucudaki alınır; kullanıcının düzenlemesi yine kaydedilir (uçtan uca deneme Y6)', async () => {
    const s = sunucuBaslangic([{ id: 9, harf: 'A', durum: 'onay_bekliyor', surum: 4, aciklama: null, adimlar: [adimGovdesi()] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status)')).toEqual(['onay']); });
    e.calistir('openRev("13").data.steps[0].setup = 8; save(); baglaYukle();');
    await new Promise((coz) => { setTimeout(coz, 1500); });
    expect(s.yazmalar).toEqual([]);
    expect(s.revler[0]?.durum).toBe('onay_bekliyor');
    await waitFor(() => { expect(e.ifade('[openRev("13").status, openRev("13").data.steps[0].setup, rotaDirty(openRev("13"))]')).toEqual(['onay', 5, false]); });
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 7; })');
    await waitFor(() => { expect(s.yazmalar.length).toBe(2); }, { timeout: 10000 });
    expect(yazilanlar(s)).toEqual(['revizyonlar/#/geri-gonder', 'revizyonlar/#/kaydet']);
  }, 60000);

  it('RTB-15: sunucu reddedince durum satırı "yazıldı" demez, nedeniyle kaydedilemedi der; kayıt bitince yazıldı der (uçtan uca deneme Y4)', async () => {
    const s = sunucuBaslangic();
    s.ret['taslak-ac'] = { durum: 403, govde: { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' } };
    const e = await ekranAc(s);
    e.calistir(`routeEdit(()=>{ st.routes["13"] = {base:1, steps:[${YEREL_ADIM}]}; })`);
    await waitFor(() => { expect(e.bildirim()).toContain('Bu işlem için yetkiniz yok.'); }, { timeout: 10000 });
    e.calistir('ui.tab = "schema"; ui.root = "13"; render();');
    const satir = () => e.al('.rv-status').textContent ?? '';
    expect(satir()).toContain('taslağına kaydedilemedi: Bu işlem için yetkiniz yok.');
    expect(satir()).not.toContain('yazıldı');
    delete s.ret['taslak-ac'];
    e.calistir('routeEdit(()=>{ openRev("13") && (st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data))); st.routes["13"].steps[0].setup = 6; })');
    await waitFor(() => { expect(s.revler.length).toBe(1); }, { timeout: 10000 });
    await waitFor(() => { e.calistir('render();'); expect(satir()).toContain('taslağına yazıldı.'); }, { timeout: 10000 });
  }, 60000);

  it('RTB-16: ürünün sunucuda açık taslağı varken kayıttaki eski yerel taslak gösterilmez ve için taslak açılmaz; düzenleme sunucudaki taslağa kaydedilir (uçtan uca deneme Y5)', async () => {
    const s = sunucuBaslangic([{ id: 9, harf: 'A', durum: 'taslak', surum: 4, aciklama: 'İlk rota', adimlar: [adimGovdesi()] }]);
    s.belge = { ...BELGE, routeRevs: [{ id: 'rvyerel1', itemId: '13', no: 'A', status: 'taslak', data: { base: 1, steps: [] }, note: 'İlk rota', created: 1, updated: 1 }] };
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>[r.id,r.status])')).toEqual([['9', 'taslak']]); });
    await new Promise((coz) => { setTimeout(coz, 1500); });
    expect(s.yazmalar).toEqual([]);
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 7; })');
    await waitFor(() => { expect(s.yazmalar.length).toBe(1); }, { timeout: 10000 });
    expect(yazilanlar(s)).toEqual(['revizyonlar/#/kaydet']);
    expect(s.revler[0]?.adimlar.map((a) => [a.opNo, a.ayarSuresiDk])).toEqual([[10, 7]]);
  }, 60000);

  it('RTB-17: yerel taslak sunucuya yazılmadan önce ürüne başka yerde taslak açılırsa içerik o taslağa kaydedilir; ikinci taslak ve 409 olmaz (uçtan uca deneme Y5)', async () => {
    const s = sunucuBaslangic();
    const e = await ekranAc(s);
    e.calistir(`routeEdit(()=>{ st.routes["13"] = {base:1, steps:[${YEREL_ADIM}]}; })`);
    s.revler.push({ id: 9, harf: 'A', durum: 'taslak', surum: 4, aciklama: null, adimlar: [adimGovdesi({ ayarSuresiDk: 1 })] });
    e.calistir('baglaYukle()');
    await waitFor(() => { expect(s.yazmalar.length).toBe(1); }, { timeout: 10000 });
    expect(yazilanlar(s)).toEqual(['revizyonlar/#/kaydet']);
    expect(s.revler.map((r) => r.id)).toEqual([9]);
    expect(s.revler[0]?.adimlar.map((a) => [a.opNo, a.ayarSuresiDk, a.kaynak?.id])).toEqual([[10, 5, 31]]);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>[r.id,r.status])')).toEqual([['9', 'taslak']]); });
  }, 60000);

  it('RTB-18: onaydaki revizyonu başka yetkili açıp sekmeleri gezip onaylayınca yalnız onay yazılır; sayfa onun adına geri gönderip kaydetmez (uçtan uca deneme, ikinci tur)', async () => {
    const s = sunucuBaslangic([
      { id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: null, adimlar: [adimGovdesi({ opNo: 10 })] },
      { id: 9, harf: 'B', durum: 'onay_bekliyor', surum: 4, aciklama: 'Makine', adimlar: [adimGovdesi({ opNo: 10 }), adimGovdesi({ opNo: 20, ad: 'Kaynak', operasyonTipiId: 2, kaynak: { tur: 'istasyon', id: 32 }, ayarSuresiDk: null, bagimlilik: 'akisli', devirAdedi: 4, adaylar: [{ kaynak: { tur: 'istasyon', id: 31 }, ayarSuresiDk: null, birimSureDk: null }] })] },
    ]);
    // Ortak kayıtta gönderenin sayfasının bıraktığı kopya: sunucu revizyonu, imzası verisinden farklı (kirli).
    s.belge = { ...BELGE, routeRevs: [{ id: '9', itemId: '13', no: 'B', status: 'onay', sunucu: true, sunucuDurum: 'onay', surum: 4, imza: 'eski', opNolar: [10, 20], data: { base: 1, steps: [] }, note: 'Eski', created: 1, updated: 1 }] };
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('openRev("13") && [openRev("13").id, openRev("13").status]')).toEqual(['9', 'onay']); });
    for (const sekme of ['schema', 'orders', 'plan', 'kanban', 'res', 'items', 'ops', 'stock', 'op', 'sureler', 'studio', 'schema']) { e.calistir(`ui.tab = "${sekme}"; ui.root = "13"; render();`); }
    e.calistir('ui.sel = {kind:"step", id:"13-o20", itemId:"13", qty:1}; render();');
    await new Promise((coz) => { setTimeout(coz, 1500); });
    expect(s.yazmalar).toEqual([]);
    e.calistir('rotaYurut("revApprove", openRev("13"))');
    e.calistir('rotaYurut("revApprove", openRev("13"))');
    await waitFor(() => { expect(s.yazmalar.length).toBeGreaterThan(0); }, { timeout: 10000 });
    await new Promise((coz) => { setTimeout(coz, 1000); });
    expect(yazilanlar(s)).toEqual(['revizyonlar/#/onayla']);
    expect(s.revler.map((r) => r.durum)).toEqual(['onayli', 'yururlukte']);
  }, 60000);

  it('RTB-24: sayfayı açmak ana kaydı yazmaz: sunucunun kartları ve operasyonları ekrana uygulanır, kayda yazılmaz; kullanıcının değişikliği yine yazılır (geçiş planı R0)', async () => {
    const s = sunucuBaslangic([{ id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: null, adimlar: [adimGovdesi()] }]);
    s.belge = { ...BELGE, items: [...BELGE.items, { id: 'fg1', code: 'FG-001', name: 'Yerel örnek', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }] };
    const e = await ekranAc(s);
    expect(e.ifade<string[]>('st.items.filter(i=>i.bagli).map(i=>i.id)')).toEqual(['13', '11']);
    e.calistir('baglaYukle()');
    await new Promise((coz) => { setTimeout(coz, 1500); });
    expect(yazilan).toEqual([]);
    expect(s.yazmalar).toEqual([]);
    e.calistir('st.name = "Deneme fabrika 2"; save();');
    await waitFor(() => { expect(yazilan.length).toBe(1); }, { timeout: 10000 });
  }, 60000);

  it('RTB-19: onaydaki revizyonda şemada gezinmek (adım, girdi, kart seçmek, panel açıp kapamak) rotaya yazmaz; revizyon onayda kalır (kayıt R8, Y6)', async () => {
    const s = sunucuBaslangic([
      { id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: null, adimlar: [adimGovdesi({ opNo: 10 })] },
      { id: 9, harf: 'B', durum: 'onay_bekliyor', surum: 4, aciklama: 'Makine', adimlar: [adimGovdesi({ opNo: 10 }), adimGovdesi({ opNo: 20, ad: 'Kaynak', operasyonTipiId: 2, kaynak: { tur: 'istasyon', id: 32 }, ayarSuresiDk: null, bagimlilik: 'akisli', devirAdedi: 4, bilesenler: [] })] },
    ]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('openRev("13") && [openRev("13").id, openRev("13").status]')).toEqual(['9', 'onay']); });
    e.calistir('ui.tab = "schema"; render();');
    // Ürünü listeden aç: kullanıcının "ürünü açtı" dediği adım.
    // Ürünü listeden aç ve gezin: tıklama sayfanın kendi dinleyicisinden geçer (şemada routeEdit sarmalı dahil).
    const bas = (act: string, ek: Record<string, string> = {}) => {
      const d = e.b.createElement('button');
      d.dataset['act'] = act;
      for (const [k, v] of Object.entries(ek)) d.dataset[k] = v;
      e.b.body.appendChild(d);
      fireEvent.click(d);
      d.remove();
    };
    bas('ulAc', { id: '13' });
    await new Promise((coz) => { setTimeout(coz, 1500); });
    expect(yazilanlar(s)).toEqual([]);
    const GEZINTI = new Set(['selStep', 'selIn', 'selOut', 'selItem', 'selStepById', 'closeInsp', 'revSee', 'revFocus', 'revPanel', 'setRoot', 'zoom', 'schMode', 'toggleSub', 'adimPaneli', 'cvHelp', 'cvFull', 'qtyMode', 'kview']);
    const basilan: string[] = [];
    // Her eylemin ekrandaki her düğmesine sırayla basılır; her basış ekranı yeniden çizdiği için düğme her seferinde yeniden aranır.
    for (const act of GEZINTI) {
      for (let i = 0; i < 6; i++) {
        const d = Array.from(e.b.querySelectorAll<HTMLElement>(`[data-act="${act}"]`))[i];
        if (d === undefined) break;
        basilan.push(act);
        fireEvent.click(d);
      }
    }
    await new Promise((coz) => { setTimeout(coz, 1500); });
    expect(basilan.length).toBeGreaterThan(3);
    expect(yazilanlar(s)).toEqual([]);
    expect(s.revler.map((r) => r.durum)).toEqual(['yururlukte', 'onay_bekliyor']);
  }, 60000);

  it('RTB-20: taslağı düzenleyen sayfa açık kalırken revizyon başka yerde onaya gönderilirse sayfa onu geri göndermez, kaydetmez (kayıt R8, Y6)', async () => {
    const s = sunucuBaslangic([{ id: 9, harf: 'A', durum: 'taslak', surum: 4, aciklama: null, adimlar: [adimGovdesi()] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('openRev("13") && openRev("13").status')).toBe('taslak'); });
    e.calistir('routeEdit(()=>{ st.routes["13"] = JSON.parse(JSON.stringify(openRev("13").data)); st.routes["13"].steps[0].setup = 7; })');
    await waitFor(() => { expect(yazilanlar(s)).toEqual(['revizyonlar/#/kaydet']); }, { timeout: 10000 });
    await waitFor(() => { expect(e.ifade('rotaDirty(openRev("13"))')).toBe(false); });
    // Planlamacı başka sayfada onaya gönderir; bu sayfa durumu yeniden okur (odak, yenileme).
    const r = s.revler[0]!;
    r.durum = 'onay_bekliyor'; r.surum += 1;
    e.calistir('baglaYukle()');
    await waitFor(() => { expect(e.ifade('openRev("13").status')).toBe('onay'); });
    e.calistir('ui.tab = "schema"; ui.root = "13"; render();');
    await new Promise((coz) => { setTimeout(coz, 1500); });
    expect(yazilanlar(s)).toEqual(['revizyonlar/#/kaydet']);
    expect(r.durum).toBe('onay_bekliyor');
  }, 60000);

  it('RTB-21: iptal edilmiş revizyondan sonra açılan taslak sunucunun harfiyle anılır; ileti ve durum satırı yerel harfi söylemez (kayıt R8)', async () => {
    const s = sunucuBaslangic([{ id: 4, harf: 'A', durum: 'iptal', surum: 2, aciklama: null, adimlar: [adimGovdesi()] }]);
    const e = await ekranAc(s);
    e.calistir(`routeEdit(()=>{ st.routes["13"] = {base:1, steps:[${YEREL_ADIM}]}; })`);
    expect(e.bildirim()).toContain('taslak revizyonu açıldı');
    expect(e.bildirim()).not.toContain('Rev A');
    await waitFor(() => { expect(yazilanlar(s)).toEqual(['urunler/13/taslak-ac', 'revizyonlar/#/kaydet']); }, { timeout: 10000 });
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>[r.id,r.no,r.status])')).toEqual([['101', 'B', 'taslak']]); });
    e.calistir('ui.tab = "schema"; ui.root = "13"; render();');
    await waitFor(() => { e.calistir('render();'); expect(e.al('.rv-status').textContent).toContain('Rev B taslağına yazıldı.'); }, { timeout: 10000 });
  }, 60000);

  it('RTB-22: "Taslağı sil" seçili sunucu revizyonunu iptal eder; kayıttan kalan görünmeyen yerel taslağa dokunmaz (kayıt R8)', async () => {
    const s = sunucuBaslangic([{ id: 4, harf: 'A', durum: 'taslak', surum: 2, aciklama: null, adimlar: [adimGovdesi()] }]);
    s.belge = { ...BELGE, routeRevs: [{ id: 'rvak4wz2n', itemId: '13', no: 'A', status: 'taslak', data: { base: 1, steps: [] }, note: '', created: 1, updated: 1 }] };
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.id)')).toEqual(['4']); });
    e.calistir('rotaYurut("revDiscard", openRev("13"))');
    e.calistir('rotaYurut("revDiscard", openRev("13"))');
    await waitFor(() => { expect(yazilanlar(s)).toEqual(['revizyonlar/#/iptal']); }, { timeout: 10000 });
    expect(s.yazmalar[0]?.yol).toBe('/rota/revizyonlar/4/iptal');
    expect(s.revler[0]?.durum).toBe('iptal');
  }, 60000);

  it('RTB-23: yeni emir formunun ürün listesinde yalnız sunucudaki ürünler çıkar; kayıttan kalan yerel örnek ürün çıkmaz (kayıt R8)', async () => {
    const s = sunucuBaslangic([{ id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: null, adimlar: [adimGovdesi()] }]);
    s.belge = { ...BELGE, items: [...BELGE.items, { id: 'fg1', code: 'FG-001', name: 'Yerel örnek', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }] };
    const e = await ekranAc(s);
    expect(e.ifade<string[]>('st.items.map(i=>i.id)')).toContain('fg1');
    e.calistir('ui.tab = "orders"; ui.newOrder = true; render();');
    expect(Array.from(e.al<HTMLSelectElement>('#noItem').options).map((o) => o.value)).toEqual(['13']);
  }, 60000);

  it('RTB-11: adım panelinin başında iç ya da dış üretim seçilir; dışta fason firma ve termin günü girilir, rota modülüne fason kaynak olarak süresiz ve adaysız yazılır; içte istasyona döner (kart #1310)', async () => {
    const s = sunucuBaslangic([{ id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: null, adimlar: [adimGovdesi({ opNo: 10 }), adimGovdesi({ opNo: 20, operasyonTipiId: 2, ad: 'Kaynak', kaynak: { tur: 'istasyon', id: 32 }, adaylar: [{ kaynak: { tur: 'istasyon', id: 31 }, ayarSuresiDk: null, birimSureDk: null }] })] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade<number>('(st.routes["13"]||{steps:[]}).steps.length')).toBe(2); });
    e.calistir('ui.tab = "schema"; ui.root = "13"; ui.sel = {kind:"step", id:"13-o20", itemId:"13", qty:1}; render();');
    const degistir = (k: string, v: string) => { const el = e.al<HTMLInputElement | HTMLSelectElement>(k); fireEvent.change(el, { target: { value: v } }); };
    const yer = (v: 'ic' | 'dis') => e.al<HTMLButtonElement>(`#insp button[data-act="uretimYeri"][data-v="${v}"]`);
    expect([yer('ic').getAttribute('aria-pressed'), yer('dis').getAttribute('aria-pressed'), yer('dis').disabled]).toEqual(['true', 'false', false]);
    expect(e.b.querySelector('#insp select[data-f="fasonId"]')).toBeNull();
    // Tek fason firma varsa dış seçimi onu alır.
    fireEvent.click(yer('dis'));
    await waitFor(() => { expect(e.b.querySelector('#insp input[data-f="terminGun"]')).not.toBeNull(); });
    expect(e.al<HTMLSelectElement>('#insp select[data-f="fasonId"]').value).toBe('41');
    expect(Array.from(e.al<HTMLSelectElement>('#insp select[data-f="fasonId"]').options).map((o) => [o.value, o.textContent])).toEqual([['', 'Fason firma seç…'], ['41', 'F-01 Deneme kaplama']]);
    expect(e.b.querySelector('#insp select[data-f="stationId"]')).toBeNull();
    degistir('#insp input[data-f="terminGun"]', '5');
    const sonAdim = () => (s.yazmalar.filter((y) => y.yol.endsWith('/kaydet')).at(-1)?.govde as { adimlar: AdimGovdesi[] } | undefined)?.adimlar[1];
    await waitFor(() => { expect(sonAdim()?.terminGun).toBe(5); }, { timeout: 10000 });
    expect(sonAdim()).toMatchObject({ opNo: 20, kaynak: { tur: 'fason', id: 41 }, ayarSuresiDk: null, islemSuresiDk: null, degisimSuresiDk: null, makineKullanimi: 'tek', enKucukParca: null, adaylar: [] });
    // Sunucudan dönen fason adım panelde ve adım kutusunda firmasıyla görünür; iç seçilince operasyonun istasyonuna döner, termin silinir.
    await waitFor(() => { expect(e.ifade('openRev("13").data.steps[1].fasonId')).toBe('41'); }, { timeout: 10000 });
    e.calistir('render()');
    expect(e.al<HTMLSelectElement>('#insp select[data-f="fasonId"]').value).toBe('41');
    expect(yer('dis').getAttribute('aria-pressed')).toBe('true');
    expect(e.b.querySelector('.opbox[data-id="13-o20"] .ost')?.textContent).toBe('Dış üretim: F-01 Deneme kaplama');
    fireEvent.click(yer('ic'));
    await waitFor(() => { expect(sonAdim()?.kaynak).toEqual({ tur: 'istasyon', id: 32 }); }, { timeout: 10000 });
    expect(sonAdim()?.terminGun).toBeNull();
  }, 60000);

  it('RTB-11b: fason işaretli firma yoksa dış üretim seçimi görünür ama kapalıdır ve nedenini söyler', async () => {
    const s = sunucuBaslangic([{ id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: null, adimlar: [adimGovdesi({ opNo: 10 })] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade<number>('(st.routes["13"]||{steps:[]}).steps.length')).toBe(1); });
    e.calistir('BAGLI.durum.fasonFirms = []; ui.tab = "schema"; ui.root = "13"; ui.sel = {kind:"step", id:"13-o10", itemId:"13", qty:1}; render();');
    expect(e.al<HTMLButtonElement>('#insp button[data-act="uretimYeri"][data-v="dis"]').disabled).toBe(true);
    expect(e.al('#insp .uretim-yeri').textContent).toContain('Fason işaretli firma yok');
  }, 60000);

  it('RTB-8: sağ panelde alan değişince panel kaydırma yerinde kalır; başka adım seçilince baştan açılır', async () => {
    const s = sunucuBaslangic([{ id: 7, harf: 'A', durum: 'yururlukte', surum: 3, aciklama: null, adimlar: [adimGovdesi({ opNo: 10 }), adimGovdesi({ opNo: 20, operasyonTipiId: 2, ad: 'Kaynak', kaynak: { tur: 'istasyon', id: 32 } })] }]);
    const e = await ekranAc(s);
    await waitFor(() => { expect(e.ifade<number>('(st.routes["13"]||{steps:[]}).steps.length')).toBe(2); });
    e.calistir('ui.tab = "schema"; ui.root = "13"; ui.sel = {kind:"step", id:"13-o10", itemId:"13", qty:1}; render();');
    const panel = () => e.al('#insp') as HTMLElement;
    panel().scrollTop = 240;
    e.calistir('renderSchema(true)');
    expect(panel().scrollTop).toBe(240);
    e.calistir('render()');
    expect(panel().scrollTop).toBe(240);
    e.calistir('ui.sel = {kind:"step", id:"13-o20", itemId:"13", qty:1}; renderSchema(true);');
    expect(panel().scrollTop).toBe(0);
  }, 40000);

  // Akış A provası O1: rota.onayla işlemi olmayan planlamacı onay düğmelerini görmez (sunucu yine reddeder); onaycı görür.
  it('RTB-13: rota.onayla yoksa Onayla, geri gönder ve yürürlüğe al düğmeleri gizlidir, Onaya gönder görünür; işlemi olan kişi onları görür', async () => {
    const revler = (): SunucuRev[] => [
      { id: 9, harf: 'A', durum: 'onayli', surum: 2, aciklama: null, adimlar: [adimGovdesi()] },
      { id: 10, harf: 'B', durum: 'onay_bekliyor', surum: 4, aciklama: null, adimlar: [adimGovdesi()] },
    ];
    const gorunur = async (kullanici: Kullanici): Promise<Record<string, boolean>> => {
      const e = await ekranAc({ ...sunucuBaslangic(revler()), kullanici });
      await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.status).sort()')).toEqual(['onay', 'onayli']); });
      const bak = (k: string): boolean => { const el = e.b.querySelector(k); return el !== null && e.b.defaultView!.getComputedStyle(el).display !== 'none'; };
      e.calistir('ui.tab = "schema"; ui.root = "13"; ui.revSel = {"13":"10"}; ui.revPanel = "approve"; render();');
      const onayda = { onayla: bak('[data-act="revPanel"][data-v="approve"]'), onaylaYurut: bak('[data-act="revApprove"]'), yalnizOnayla: bak('[data-act="revApproveOnly"]'), geriGonder: bak('[data-act="revReturn"]'), dene: bak('[data-act="revTry"]') };
      e.calistir('ui.revSel = {"13":"9"}; ui.revPanel = null; render();');
      const sonuc = { ...onayda, yururlugeAl: bak('[data-act="revActivate"]') };
      cleanup();
      if (dinleyici !== null) window.removeEventListener('message', dinleyici);
      dinleyici = null;
      return sonuc;
    };
    expect(await gorunur(YAZAR)).toEqual({ onayla: false, onaylaYurut: false, yalnizOnayla: false, geriGonder: false, dene: true, yururlugeAl: false });
    expect(await gorunur(ONAYCI)).toEqual({ onayla: true, onaylaYurut: true, yalnizOnayla: true, geriGonder: true, dene: true, yururlugeAl: true });
  }, 60000);

  it('RTB-9: adım kimliği malzeme + OP no; yeni adım kaydedilince çıktı seçimi kalır, eski "o<no>" anahtarı yeni kimliğe çevrilir; girdi sunucu kuralıyla hesaplanır', async () => {
    const s = sunucuBaslangic();
    const e = await ekranAc(s);
    const ikinci = YEREL_ADIM.replace('id:"pa", seq:10', 'id:"pb", seq:20');
    e.calistir(`routeEdit(()=>{ st.routes["13"] = {base:1, steps:[${YEREL_ADIM.replace('outItem:""', 'outItem:"11"')}, ${ikinci}]}; })`);
    await waitFor(() => { expect(e.ifade('st.routeRevs.map(r=>r.data.steps.map(x=>x.id))')).toEqual([['13-o10', '13-o20']]); }, { timeout: 10000 });
    expect(e.ifade('st.routeRevs[0].data.steps.map(x=>x.outItem)')).toEqual(['11', '']);
    expect(e.ifade('[yeniAdimAnahtari("step:o10", "13"), yeniAdimAnahtari("step:13-o10", "13"), yeniAdimAnahtari("KRN", "13"), yeniAdimAnahtari("", "13")]'))
      .toEqual(['step:13-o10', 'step:13-o10', 'KRN', '']);
    const l = '[{id:"a",dep:"bagimli"},{id:"b",dep:"bagimsiz"},{id:"c",dep:"bagimli"},{id:"d",dep:"bagimsiz"}]';
    expect(e.ifade(`[0,1,2,3].map(i=>tuketilenAdimlar(${l}, i).map(x=>x.id))`)).toEqual([[], [], ['a', 'b'], []]);
    expect(e.ifade('withDrafts(()=>statusLabel("step:13-o10"))')).toBe('OP 10 Lazer kesim');
  }, 40000);
});
