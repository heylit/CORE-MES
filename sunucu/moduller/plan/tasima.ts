import { tasimaTakvimi } from './plan-girdisi.ts';
import { surenIs, surenKalani } from './atolye-komutlari-kurallar.ts';
import { tasimaItmesi, type BagTuru, type TasimaIsi, type TasimaSonucu } from './tasima-kurallar.ts';

// Elle taşımanın girdisi (2790): işler çalışmanın planından, takvim ve aynı emrin öncülleri motorun derlemesinden. Biten adım beklenmez
// (motor da beklemez); başlamış, biten ve donuk bölgedeki iş yerinde kalır. Taşınan iş donuk bölgede olsa da elle taşınır (önceki davranış).
// Saati geçmiş ama gerçekleşme kaydı olmayan iş (done var, act yok) bitmemiştir: taşınır, ardılı olarak itilir, öncül olarak beklenir.
// Taşınan iş sürüyorsa (3414-6 a) durdurulmuş sayılır: takvim kalan adetle kurulur, iş sabit değildir; yapılan kısım geçmişte kalır.
// Önizleme ve taşıma komutu aynı hesabı kullanır.
type Nesne = Record<string, unknown>;
const nesne = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);
const E = 1e-9;

export function tasimaHesabi(calisma0: Nesne, simdi: number, g: { isId: string; tezgah: string; baslangic: number }): TasimaSonucu {
  const plan = nesne(calisma0.plan) ? calisma0.plan : null;
  const ops = plan !== null && nesne(plan.ops) ? plan.ops : {};
  const tasinan = ops[g.isId];
  const durdur = nesne(tasinan) && surenIs(tasinan);
  const w0 = nesne(calisma0.w) ? calisma0.w : {};
  const calisma = durdur ? { ...calisma0, w: { ...w0, durdurulan: { ...(nesne(w0.durdurulan) ? w0.durdurulan : {}), [g.isId]: 1 } } } : calisma0;
  const t = tasimaTakvimi(calisma, simdi);
  // Saati geçmiş, başlamamış iş (3414): varsayılan çalışıyor sayılır ve yerinde kalır; çalışma ayarı açıksa öteki adımlarla birlikte kayar.
  const gerideTasinir = nesne(calisma.w) && calisma.w.gerideTasinir === true;
  const isler = new Map<string, TasimaIsi>();
  const biten = new Set<string>();
  for (const [id, r] of Object.entries(ops)) {
    if (!nesne(r) || typeof r.S !== 'number' || typeof r.C !== 'number' || !Number.isFinite(r.S) || !Number.isFinite(r.C)) continue;
    const bitti = Boolean(r.done) && (Boolean(r.act) || Boolean(r.bitti));
    const gecmis = Boolean(r.done) && !bitti;
    if (bitti) biten.add(id);
    const lot1 = typeof r.lot1 === 'number' && Number.isFinite(r.lot1) ? r.lot1 : r.C;
    const basladi = (Boolean(r.act) || bitti) && !(durdur && id === g.isId);
    const geride = !basladi && !gecmis && r.S < simdi - E;
    const donuk = !basladi && !gecmis && !geride && r.S < t.donuk - E;
    const sabit = basladi || (id !== g.isId && (donuk || (geride && !gerideTasinir)));
    isler.set(id, {
      id, job: String(r.job), opNo: t.opNo[id] ?? id, m: String(r.m), S: r.S, C: r.C, lot1, sabit, fas: Boolean(r.fas),
      ...(sabit ? { neden: bitti ? 'bitti' as const : basladi ? 'basladi' as const : geride ? 'geride' as const : 'donuk' as const } : {}),
    });
  }
  // 3488 a: yerleşmeyen adım elle yerleştiriliyorsa planda satırı yoktur; derlemede varsa verilen yerdeki süresiyle taşınan iş olarak eklenir.
  if (!nesne(tasinan) && t.opNo[g.isId] !== undefined) {
    // Bitmemiş öncülü de planda yoksa adım öncülsüz yerleşir ve canlıya öncülünden önce yazılır; önce öncül yerleştirilmeli.
    const yerlesmeyen = (t.onculler[g.isId] ?? []).find(([o]) => !isler.has(o));
    if (yerlesmeyen !== undefined) {
      const o = yerlesmeyen[0];
      return { gecerli: false, ileti: `Önce OP ${t.opNo[o] ?? o} adımını yerleştirin; OP ${t.opNo[g.isId] ?? g.isId} ondan sonra gelir. Taşıma yapılmadı.`, isler: [] };
    }
    const job = Object.entries(t.emirler).find(([, l]) => l.some((a) => a.id === g.isId))?.[0];
    // Tezgâh uygun değilse ya da ufka sığmıyorsa itme hesabı aynı nedenle reddeder; burada yer yalnız başlangıç değeridir.
    const y = t.yer(g.isId, g.tezgah, Math.max(g.baslangic, simdi));
    const S = y?.S ?? g.baslangic, C = y !== null && Number.isFinite(y.C) ? y.C : S;
    if (job !== undefined) isler.set(g.isId, { id: g.isId, job, opNo: t.opNo[g.isId]!, m: g.tezgah, S, C, lot1: y !== null && Number.isFinite(y.lot1) ? y.lot1 : C, sabit: false, fas: false });
  }
  const onculler = new Map<string, (readonly [string, BagTuru])[]>();
  for (const id of isler.keys()) {
    const l = (t.onculler[id] ?? []).filter(([p]) => isler.has(p) && !biten.has(p));
    if (l.length > 0) onculler.set(id, l);
  }
  const sonuc = tasimaItmesi({ isler, onculler, simdi, donuk: t.donuk, ufuk: t.ufuk, tasimaSaat: t.tasimaSaat, yer: t.yer, saatMetni: t.saatMetni, tezgahAdi: t.tezgahAdi }, g.isId, g.tezgah, g.baslangic);
  if (!durdur || !sonuc.gecerli) return sonuc;
  const k = surenKalani(calisma0, g.isId);
  const adet = k === null ? 'kalan adet' : `yapılan ${String(k.yapilan)} adet yerinde kaldı, kalan ${String(k.kalan)} adet`;
  const not = `OP ${t.opNo[g.isId] ?? g.isId} durdurulmuş sayıldı: ${adet} yeni yerine planlandı. Canlıya geçmesi için işin terminalde durdurulması gerekir.`;
  return { ...sonuc, ileti: sonuc.ileti === null ? not : `${not} ${sonuc.ileti}` };
}
