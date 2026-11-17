import { tasimaTakvimi } from './plan-girdisi.ts';
import { tasimaItmesi, type BagTuru, type TasimaIsi, type TasimaSonucu } from './tasima-kurallar.ts';

// Elle taşımanın girdisi (2790): işler çalışmanın planından, takvim ve aynı emrin öncülleri motorun derlemesinden. Biten adım beklenmez
// (motor da beklemez); başlamış, biten ve donuk bölgedeki iş yerinde kalır. Taşınan iş donuk bölgede olsa da elle taşınır (önceki davranış).
// Saati geçmiş ama gerçekleşme kaydı olmayan iş (done var, act yok) bitmemiştir: taşınır, ardılı olarak itilir, öncül olarak beklenir.
// Önizleme ve taşıma komutu aynı hesabı kullanır.
type Nesne = Record<string, unknown>;
const nesne = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);
const E = 1e-9;

export function tasimaHesabi(calisma: Nesne, simdi: number, g: { isId: string; tezgah: string; baslangic: number }): TasimaSonucu {
  const plan = nesne(calisma.plan) ? calisma.plan : null;
  const ops = plan !== null && nesne(plan.ops) ? plan.ops : {};
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
    const basladi = Boolean(r.act) || bitti;
    const geride = !basladi && !gecmis && r.S < simdi - E;
    const donuk = !basladi && !gecmis && !geride && r.S < t.donuk - E;
    const sabit = basladi || (id !== g.isId && (donuk || (geride && !gerideTasinir)));
    isler.set(id, {
      id, job: String(r.job), opNo: t.opNo[id] ?? id, m: String(r.m), S: r.S, C: r.C, lot1, sabit, fas: Boolean(r.fas),
      ...(sabit ? { neden: bitti ? 'bitti' as const : basladi ? 'basladi' as const : geride ? 'geride' as const : 'donuk' as const } : {}),
    });
  }
  const onculler = new Map<string, (readonly [string, BagTuru])[]>();
  for (const id of isler.keys()) {
    const l = (t.onculler[id] ?? []).filter(([p]) => isler.has(p) && !biten.has(p));
    if (l.length > 0) onculler.set(id, l);
  }
  return tasimaItmesi({ isler, onculler, simdi, donuk: t.donuk, ufuk: t.ufuk, tasimaSaat: t.tasimaSaat, yer: t.yer, saatMetni: t.saatMetni, tezgahAdi: t.tezgahAdi }, g.isId, g.tezgah, g.baslangic);
}
