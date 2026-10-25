import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

// H2: stüdyonun onay akışı plan modülüne gider (zz40). Motor (emirler.betik dahil) ve zz40 gerçek; stüdyonun Onay sekmesi (zz22) ve
// köprü küçük taklit. Veriler uydurmadır.

interface Cagri { ad: string; govde: Record<string, unknown> }
interface Senaryo { id: string; ad: string; durum: string; taslak?: number; kararlar: { karar: string; not: string }[]; plan?: unknown; ozet?: unknown; D?: unknown }
interface Duzenek {
  S: () => { senaryolar: Senaryo[]; canli: string | null; canliSurum: number };
  cagrilar: Cagri[]; bildirimler: string[]; notlar: Record<string, string>;
  eylem: (ad: 'onaya' | 'canli' | 'geri' | 'vazgec', id: string) => void;
  ciz: (sayfa?: string, sek?: string) => void; paEylem: (act: string) => boolean; yenilendi: () => number;
  cevir: (kayit: unknown) => { siparisler: { id: string }[] };
}

const D = { meta: { baslangic: '2026-10-23' }, urunler: [{ id: 'U1', rota: [{ k: 'a' }, { k: 'b' }] }], siparisler: [{ id: '7', urun: 'U1', adet: 5, gelir: 900 }] };
const KAYIT = {
  items: [{ id: 'U1', code: 'U1', name: 'Ürün', type: 'mamul' }], opdefs: [], machines: [], stations: [], people: [],
  routes: { U1: { steps: [{ id: 's1', seq: 10, opNo: 10 }, { id: 's2', seq: 20, opNo: 20 }] } },
  orders: [{ id: 'E1', no: 'YEREL-1', itemId: 'U1', qty: 1, start: '2026-10-23', due: '2026-10-24', priority: 0, status: 'serbest' }],
};
const DURUM = {
  emirler: { orders: [{ id: '7', no: 'UE-7', itemId: 'U1', qty: 5, start: '2026-10-23', due: '2026-10-30', priority: 1, status: 'serbest' }] },
  planCanli: { planlanacak: ['UE-7|10', 'UE-7|20'] },
};
// 7.a makine 12'de, 7.b fasonda (yazılmaz, sayılmaz), X.z sunucuda karşılığı olmayan iş (sayılır).
const PLAN = { ops: { '7.a': { job: '7', m: '12', S: 8, C: 10 }, '7.b': { job: '7', m: '@f1', S: 12, C: 14 }, 'X.z': { job: 'X', m: '13', S: 1, C: 2 } }, ozet: { late: 0, wT: 0 } };

type Cevap = (govde: Record<string, unknown>) => unknown;
function duzenek(cevaplar: Record<string, Cevap> = {}, yetki = true, senaryolar?: () => unknown): Duzenek {
  const govde = `
    let S = { D: ${JSON.stringify(D)}, senaryolar: [], canli: null, canliSurum: 3, plan: ${JSON.stringify(PLAN)} };
    const U = { paNot: {}, sayfa: 'bugun', psSek: null }; const bildirimler = [];
    const TMI_ICINDE = true; const TMI_KAYNAK = { durum: ${JSON.stringify(DURUM)}, ek: null };
    const esc = x => String(x); const yetkili = () => ${String(yetki)}; const kim = () => ({ ad: 'Planlamacı' });
    const cxAl = () => ({ st: { now: 7 } });
    function bildir(m, tur) { bildirimler.push((tur || '') + ': ' + m); } function iz() {} function kaydet() {} function render() {}
    function rrOku() { return ${JSON.stringify(KAYIT)}; }
    function onayla(b, m, fn) { fn(); }
    ${planlamaMotoru()}
    const paAl = id => id === 'calisma' ? paCalisma() : S.senaryolar.find(x => x.id === id) || null;
    const paCalisma = () => ({ id: 'calisma', ad: 'Çalışma planı', durum: 'calisma', D: S.D, plan: S.plan, ozet: S.plan.ozet });
    const paKontrol = () => []; const paRedVar = K => K.some(k => k[0] === 'red');
    let sira = 0;
    const paSnap = (ad, durum) => ({ id: 's' + (++sira), ad, durum, D: clone(S.D), plan: clone(S.plan), ozet: clone(S.plan.ozet), kararlar: [] });
    const paEkle = s => S.senaryolar.push(s);
    const paKararYaz = (s, karar, not) => s.kararlar.push({ karar, not: (not || '').trim() });
    const paNot = id => (U.paNot[id] || '').trim();
    function paOnayaGonder() { throw new Error('taklit'); } function paYayinla() { throw new Error('taklit'); } function paGeri() { throw new Error('taklit'); }
    function paVazgec(id) { const s = paAl(id); if (s) s.durum = 'vazgecildi'; }
    function paEylem() { return false; }
    ${planlamaParcasi('zz40-sunucu-onay')}
    const eylemler = { onaya: id => paOnayaGonder(id), canli: id => paYayinla(id), geri: id => paGeri(id), vazgec: id => paVazgec(id) };
    return { S: () => S, bildirimler, notlar: U.paNot, eylem: (ad, id) => eylemler[ad](id),
      ciz: (sayfa, sek) => { if (sayfa) U.sayfa = sayfa; if (sek !== undefined) U.psSek = sek; render(); }, paEylem: act => paEylem(act, ''),
      yenilendi: () => window.yenilenen,
      cevir: kayit => tmiCevir(kayit, TMI_KAYNAK, S.D, '2026-10-23') };`;
  const cagrilar: Cagri[] = [];
  const window: { yenilenen: number; tmi: Record<string, unknown> } = {
    yenilenen: 0,
    tmi: {
      ...(senaryolar ? { planSenaryolari: (): Promise<unknown> => { cagrilar.push({ ad: 'senaryolar-oku', govde: {} }); return Promise.resolve(senaryolar()); } } : {}),
      yenile: (): void => { window.yenilenen += 1; },
      komut: (ad: string, g: Record<string, unknown>): Promise<unknown> => {
        cagrilar.push({ ad, govde: g });
        try { return Promise.resolve(cevaplar[ad]?.(g) ?? { sonuc: {} }); } catch (h) { return Promise.reject(h); }
      },
    },
  };
  const d = new Function('window', 'console', govde)(window, { error: () => undefined }) as Omit<Duzenek, 'cagrilar'>;
  return { ...d, cagrilar };
}
const bekle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => { setTimeout(r, 0); }); };
const acCevabi: Cevap = (g) => ({ sonuc: { senaryolar: [{ id: 41, ad: g['ad'], benim: true, durum: 'acik' }, { id: 40, ad: g['ad'], benim: false, durum: 'acik' }] } });

describe('stüdyonun onay akışı plan modülünde (H2)', () => {
  it('onaya gönder: plan kişiye açılan taslağa sunucunun emir ve OP numarasıyla yazılır, taslak notla onaya gider', async () => {
    const d = duzenek({ 'plan-senaryo-ac': acCevabi, 'plan-senaryo-yaz': () => ({ sonuc: { yazilan: 1, atlanan: 0 } }) });
    d.notlar['calisma'] = ' Acil sipariş öne alındı ';
    d.eylem('onaya', 'calisma');
    await bekle();
    expect(d.cagrilar.map((c) => c.ad)).toEqual(['plan-senaryo-ac', 'plan-senaryo-yaz', 'plan-senaryo-onaya-gonder']);
    const yaz = d.cagrilar[1]!.govde as { taslak: number; kuyruklar: { kaynak: unknown; isler: Record<string, unknown>[] }[] };
    expect(yaz.taslak).toBe(41);
    expect(yaz.kuyruklar).toHaveLength(1);
    expect(yaz.kuyruklar[0]!.kaynak).toEqual({ tur: 'makine', id: 12 });
    expect(yaz.kuyruklar[0]!.isler).toEqual([expect.objectContaining({ emirNo: 'UE-7', opNo: 10, elle: true, elleKaynak: true, dondurulmus: false })]);
    expect(d.cagrilar[2]!.govde).toEqual({ taslak: 41, not: 'Acil sipariş öne alındı' });
    const s = d.S().senaryolar[0]!;
    expect([s.durum, s.taslak, s.kararlar]).toEqual(['onay', 41, [{ karar: 'onaya', not: 'Acil sipariş öne alındı' }]]);
    expect(d.bildirimler.at(-1)).toMatch(/^tamam: Plan onaya gönderildi: 1 iş taslağa yazıldı; 1 iş sunucuda karşılığı olmadığı için yazılmadı \(X\.z\)/);
  });

  it('onaya gönderme reddedilirse açılan taslaktan vazgeçilir, stüdyoda onay kaydı oluşmaz', async () => {
    const d = duzenek({ 'plan-senaryo-ac': acCevabi, 'plan-senaryo-onaya-gonder': () => { throw new Error('Bu işlem için yetkiniz yok.'); } });
    d.eylem('onaya', 'calisma');
    await bekle();
    expect(d.cagrilar.map((c) => c.ad)).toEqual(['plan-senaryo-ac', 'plan-senaryo-yaz', 'plan-senaryo-onaya-gonder', 'plan-senaryo-vazgec']);
    expect(d.cagrilar[3]!.govde).toEqual({ taslak: 41 });
    expect(d.S().senaryolar).toEqual([]);
    expect(d.bildirimler).toEqual(['hata: Plan onaya gönderilemedi: Bu işlem için yetkiniz yok.']);
  });

  it('yazılacak iş yoksa sunucuda taslak açılmaz', async () => {
    const d = duzenek();
    (d.S() as unknown as { plan: typeof PLAN }).plan = { ops: { '7.b': PLAN.ops['7.b'] }, ozet: PLAN.ozet } as typeof PLAN;
    d.eylem('onaya', 'calisma');
    await bekle();
    expect(d.cagrilar).toEqual([]);
    expect(d.bildirimler[0]).toMatch(/^hata: Plan onaya gönderilemedi: Plana yazılacak iş yok/);
  });

  it('onayla ve canlıya al: onaydaki taslak plan modülünün canlıya alma ucundan alınır; sunucuya gitmemiş onay kaydı alınmaz', async () => {
    const d = duzenek();
    d.S().senaryolar.push({ id: 'eski', ad: 'Eski', durum: 'onay', kararlar: [], plan: PLAN, ozet: PLAN.ozet, D }, { id: 'o1', ad: 'Onay 1', durum: 'onay', taslak: 41, kararlar: [], plan: PLAN, ozet: PLAN.ozet, D });
    d.eylem('canli', 'eski');
    await bekle();
    expect(d.cagrilar).toEqual([]);
    expect(d.bildirimler).toEqual(['hata: Bu plan sunucuda onay beklemiyor; önce onaya gönderin.']);
    d.eylem('canli', 'o1');
    await bekle();
    expect(d.cagrilar).toEqual([{ ad: 'plan-senaryo-canliya-al', govde: { taslak: 41 } }]);
    expect([d.S().canli, d.S().canliSurum, d.S().senaryolar[1]!.durum]).toEqual(['o1', 4, 'canli']);
  });

  it('canlıya alma reddedilirse (dört göz) plan onayda kalır, canlı değişmez', async () => {
    const d = duzenek({ 'plan-senaryo-canliya-al': () => { throw new Error('Planı gönderen onaylayamaz.'); } });
    d.S().senaryolar.push({ id: 'o1', ad: 'Onay 1', durum: 'onay', taslak: 41, kararlar: [], plan: PLAN, ozet: PLAN.ozet, D });
    d.eylem('canli', 'o1');
    await bekle();
    expect([d.S().canli, d.S().canliSurum, d.S().senaryolar[0]!.durum]).toEqual([null, 3, 'onay']);
    expect(d.bildirimler).toEqual(['hata: Plan canlıya alınamadı: Planı gönderen onaylayamaz.']);
  });

  it('geri gönder gerekçe ister; gerekçeyle plan modülüne gider ve plan açığa döner', async () => {
    const d = duzenek();
    d.S().senaryolar.push({ id: 'o1', ad: 'Onay 1', durum: 'onay', taslak: 41, kararlar: [], plan: PLAN, ozet: PLAN.ozet, D });
    d.eylem('geri', 'o1');
    await bekle();
    expect(d.cagrilar).toEqual([]);
    expect(d.bildirimler).toEqual(['hata: Geri gönderme nedenini Not alanına yazın.']);
    d.notlar['o1'] = 'Teslim kayıyor';
    d.eylem('geri', 'o1');
    await bekle();
    expect(d.cagrilar).toEqual([{ ad: 'plan-senaryo-geri-gonder', govde: { taslak: 41, neden: 'Teslim kayıyor' } }]);
    expect(d.S().senaryolar[0]!.durum).toBe('acik');
  });

  it('onaydaki plandan vazgeçilince taslak önce onaydan çekilir, sonra kapanır', async () => {
    const d = duzenek();
    d.S().senaryolar.push({ id: 'o1', ad: 'Onay 1', durum: 'onay', taslak: 41, kararlar: [], plan: PLAN, ozet: PLAN.ozet, D });
    d.eylem('vazgec', 'o1');
    await bekle();
    expect(d.cagrilar.map((c) => c.ad)).toEqual(['plan-senaryo-onaydan-cek', 'plan-senaryo-vazgec']);
    expect(d.S().senaryolar[0]!.durum).toBe('vazgecildi');
  });

  it('kayıt çevirisi emirleri sunucudan alır, siparişin sayfadaki ayarını korur; yerel emir plana girmez', () => {
    const d = duzenek();
    const D2 = d.cevir(KAYIT) as { siparisler: { id: string; gelir?: number; oncelik?: number }[] };
    expect(D2.siparisler.map((x) => x.id)).toEqual(['7']);
    expect(D2.siparisler[0]).toMatchObject({ gelir: 900, oncelik: 1 });
  });

  // 524: ortak kayıt açılışta bir kez okunur ve plan yazmayan kayda yazamaz; onay durumu sunucudan eşitlenir (P5).
  const sun = (durum: string, ek: Record<string, unknown> = {}) => ({ id: 41, ad: 'Onay 1', durum, onay: null, ...ek });
  const onayda = (): Senaryo => ({ id: 'o1', ad: 'Onay 1', durum: 'onay', taslak: 41, kararlar: [], plan: PLAN, ozet: PLAN.ozet, D });

  it('kayıtta onayda görünen plan sunucuda canlıya alındıysa sayfada canlı görünür; kayda yazılmaz', async () => {
    const d = duzenek({}, true, () => ({ canliSurum: 9, senaryolar: [sun('canliya_alindi')] }));
    d.S().senaryolar.push({ ...onayda(), id: 'eski', durum: 'canli' }, onayda());
    d.S().canli = 'eski';
    d.ciz();
    await bekle();
    expect(d.cagrilar.map((c) => c.ad)).toEqual(['senaryolar-oku']);
    expect([d.S().canli, d.S().canliSurum, d.S().senaryolar.map((x) => x.durum)]).toEqual(['o1', 4, ['arsiv', 'canli']]);
  });

  it('sunucuda geri gönderilen plan açığa döner, geri gönderenin adı ve nedeni karar geçmişine girer', async () => {
    const d = duzenek({}, true, () => ({ canliSurum: 9, senaryolar: [sun('acik', { onay: { gonderen: 'A', gonderme: '2026-10-25T10:00:00Z', not: null, geriGonderen: 'Ornek Mudur', geriGonderme: '2026-10-25T11:00:00Z', geriNeden: 'Teslim kayiyor' } })] }));
    d.S().senaryolar.push(onayda());
    d.ciz();
    await bekle();
    expect(d.S().senaryolar[0]!.durum).toBe('acik');
    expect(d.S().senaryolar[0]!.kararlar).toEqual([expect.objectContaining({ karar: 'geri', kim: 'Ornek Mudur', not: 'Teslim kayiyor' })]);
  });

  it('sunucuda onayda olup kayıtta olmayan plan için bir kez yenile denir; Yenile kabuğa kaydı yeniden okutur; Onay sekmesine girişte yeniden okunur', async () => {
    const d = duzenek({}, true, () => ({ canliSurum: 3, senaryolar: [{ ...sun('onayda'), id: 42, ad: 'Onay 25.10', onay: { gonderen: 'Ornek Planlamaci' } }] }));
    d.ciz();
    await bekle();
    expect(d.bildirimler).toEqual(['uyari: Sunucuda onay bekleyen plan var: Onay 25.10 (gönderen Ornek Planlamaci). Bu sayfa plan gönderilmeden önce açıldı; görmek için yenileyin.']);
    d.ciz();
    await bekle();
    expect(d.cagrilar).toHaveLength(1);
    d.ciz('studyo', 'onay');
    await bekle();
    expect(d.cagrilar).toHaveLength(2);
    expect(d.bildirimler).toHaveLength(1);
    expect(d.paEylem('pa-yenile')).toBe(true);
    expect(d.yenilendi()).toBe(1);
  });

  it('sunucu okunamazsa ya da sunucuda da onaydaysa kayıttaki onay durumu değişmez', async () => {
    const d = duzenek({}, true, () => ({ canliSurum: 3, senaryolar: [sun('onayda')] }));
    d.S().senaryolar.push(onayda());
    d.ciz();
    await bekle();
    expect([d.S().senaryolar[0]!.durum, d.bildirimler]).toEqual(['onay', []]);
  });
});

// 524 (P9): stüdyo önizlemesinin önerisi (zz31-studyo psKarar). İşlev parçadan alınır; ölçüm (psOlc) ve yardımcılar taklittir.
describe('stüdyo önizlemesinin önerisi', () => {
  const parca = planlamaParcasi('zz31-studyo');
  const bas = parca.indexOf('function psKarar(');
  const govde = parca.slice(bas, parca.indexOf('\nfunction ', bas + 1));
  const karar = (once: { wT: number; late: number; ih: number }, sonra: { wT: number; late: number; ih: number }) => new Function(`
    const OLC = new Map(); const psOlc = p => OLC.get(p); const psYapamadi = () => null;
    const saat = x => x.toFixed(1) + ' sa'; const sayi = x => String(x);
    ${govde}
    const ref = { J: { A: { C: 10, T: 0 } }, ops: { a: { id: 'a', m: 'T1', S: 2 } } };
    const plan = { J: { A: { C: 8, T: 0 } }, ops: { a: { id: 'a', m: 'T2', S: 1 } } };
    OLC.set(ref, ${JSON.stringify({ ...once, kar: null })}); OLC.set(plan, ${JSON.stringify({ ...sonra, kar: null })});
    return psKarar(ref, { plan });`)() as { oneri: string; gerekce: string };

  it('kısıt ihlali artarken gecikme azalsa da önerisi Vazgeç; ihlal artmıyorsa gecikme azalınca Uygula', () => {
    const r = karar({ wT: 20, late: 2, ih: 8 }, { wT: 10, late: 2, ih: 9 });
    expect(r.oneri).toBe('vazgec');
    expect(r.gerekce).toBe('1 kısıt ihlali eklenir; ağırlıklı gecikme 10.0 sa azalsa da.');
    expect(karar({ wT: 20, late: 2, ih: 8 }, { wT: 10, late: 2, ih: 8 }).oneri).toBe('uygula');
  });
});
