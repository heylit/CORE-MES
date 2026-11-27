import { tasimaTakvimi } from './plan-girdisi.ts';
import { surenIs, surenKalani } from './atolye-komutlari-kurallar.ts';
import { tasimaItmesi, type BagTuru, type PayBolmesi, type TasimaIsi, type TasimaSonucu } from './tasima-kurallar.ts';

// Elle taşımanın girdisi (2790): işler çalışmanın planından, takvim ve aynı emrin öncülleri motorun derlemesinden. Biten adım beklenmez
// (motor da beklemez); başlamış, biten ve donuk bölgedeki iş yerinde kalır. Taşınan iş donuk bölgede olsa da elle taşınır (önceki davranış).
// Saati geçmiş ama gerçekleşme kaydı olmayan iş (done var, act yok) bitmemiştir: taşınır, ardılı olarak itilir, öncül olarak beklenir.
// Taşınan iş sürüyorsa (3414-6 a) durdurulmuş sayılır: takvim kalan adetle kurulur, iş sabit değildir; yapılan kısım geçmişte kalır.
// Sahada hâlâ çalışan iş taşınmaz (3793).
// Önizleme ve taşıma komutu aynı hesabı kullanır.
type Nesne = Record<string, unknown>;
const nesne = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);
const E = 1e-9;

// 3791: bölünmüş adımın payı da taşınır. Pay motorda ayrı işlemdir (adım kimliği, adım~2...) ve yeri kilitle sabitlenir; ama payın tezgâhını
// adımın elle bölme kaydı (elleBol) belirler, kilit onu değiştirmez. Bu yüzden başka tezgâha taşınan payın kaydı yeni tezgâhla yazılır; rotadaki
// "paralel böl" payı da elle bölmeye döner (bölme kaydı olmayınca pay kilidi adımı tek parçaya indirirdi, engine.js compile). Kayıt planın
// pay bilgisinden (ops[..].pay) kurulur: payların sırası ve adedi aynen korunur. Pay değilse null; kurulamazsa neden metni.
export function payBolmesi(calisma: Nesne, g: { isId: string; tezgah: string }): PayBolmesi | string | null {
  const plan = nesne(calisma.plan) ? calisma.plan : null;
  const ops = plan !== null && nesne(plan.ops) ? plan.ops : {};
  const r = ops[g.isId];
  if (!nesne(r) || !nesne(r.pay) || typeof r.pay.asil !== 'string' || typeof r.pay.n !== 'number' || r.pay.n < 2) return null;
  const adim = r.pay.asil;
  const kayit: { adet: number; m: string }[] = [];
  for (let k = 1; k <= r.pay.n; k++) {
    const id = k === 1 ? adim : `${adim}~${String(k)}`, y = ops[id];
    if (!nesne(y) || !nesne(y.pay) || typeof y.pay.adet !== 'number' || typeof y.m !== 'string') return 'Bölünmüş adımın payları planda eksik; sayfayı yenileyin.';
    kayit.push({ adet: y.pay.adet, m: id === g.isId ? g.tezgah : y.m });
  }
  const eski = nesne(calisma.elleBol) ? calisma.elleBol[adim] : undefined;
  const ayni = Array.isArray(eski) && JSON.stringify(eski) === JSON.stringify(kayit);
  if (String(r.m) !== g.tezgah && (Boolean(r.act) || (typeof r.pay.sayilan === 'number' && r.pay.sayilan > 0))) return 'Başlamış ya da sayımı olan payın tezgâhı bölmede kalır; payı aynı tezgâhta başka saate taşıyın.';
  return ayni ? null : { adim, kayit };
}
export function tasimaHesabi(calisma1: Nesne, simdi: number, g: { isId: string; tezgah: string; baslangic: number }): TasimaSonucu {
  const bolme = payBolmesi(calisma1, g);
  if (typeof bolme === 'string') return { gecerli: false, ileti: bolme, isler: [] };
  const calisma0 = bolme === null ? calisma1 : { ...calisma1, elleBol: { ...(nesne(calisma1.elleBol) ? calisma1.elleBol : {}), [bolme.adim]: bolme.kayit } };
  const sonuc = pay0(calisma0, simdi, g);
  return bolme !== null && sonuc.gecerli ? { ...sonuc, bolme } : sonuc;
}
function pay0(calisma0: Nesne, simdi: number, g: { isId: string; tezgah: string; baslangic: number }): TasimaSonucu {
  const plan = nesne(calisma0.plan) ? calisma0.plan : null;
  const ops = plan !== null && nesne(plan.ops) ? plan.ops : {};
  const tasinan = ops[g.isId];
  const durdur = nesne(tasinan) && surenIs(tasinan);
  // 3793 (istek 5, 5a): sahada çalışan adım (sunucunun çalışıyor dediği, bitişsiz gerçekleşen) Kokpit'te taşınmaz; sunucu da taşımaz.
  // Yalnız sahada duraklatılmış ya da durmuş adım taşınır.
  const g0 = nesne(calisma0.gercek) ? calisma0.gercek[g.isId] : null;
  if (durdur && nesne(g0) && g0.sunucu && g0.S != null && g0.C == null) {
    return { gecerli: false, ileti: 'Adım sahada çalışıyor; Kokpit\'te taşınmaz. Önce terminalde durdurun ya da duraklatın, sonra taşıyın.', isler: [] };
  }
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
