import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';

// 3701: Kalite Merkezi'nin balonlu resminden kontrol planı. İstemcinin `km-cizim.ts` kuralıyla aynıdır (istemci elle ya da yetkiliyken açılan
// pakette, sunucu taslak paket kurulurken uygular); iki yerin testi aynı beklentiyi taşır. Plan maddesi balon kimliğini taşır (`kmBalon`).

const kayitMi = (d: unknown): d is Record<string, unknown> => d !== null && typeof d === 'object' && !Array.isArray(d);

function planKalemi(b: KmResim['balonlar'][number]): Record<string, unknown> {
  const sinirli = b.alt !== null && b.ust !== null;
  return {
    freq: 'İlk parça',
    id: b.no, x: b.x ?? 0, y: b.y ?? 0, nom: b.nominal, crit: b.kritik, min: sinirli ? Number(b.alt) : 0, max: sinirli ? Number(b.ust) : 0, gauge: !sinirli,
    ...(b.yaziKutusu?.length === 5 ? { ar: b.yaziKutusu } : {}),
    ...(b.tolerans !== null ? { tol: b.tolerans } : {}),
    ...(b.alet !== null ? { tool: b.alet } : {}),
    ...(b.yontem !== null ? { m: b.yontem === 'cmm' ? 'cmm' : 'man' } : {}),
    ...(b.siklik !== null ? { freq: b.siklik } : {}),
    ...(b.tur !== null ? { l: b.tur } : {}),
    ...(b.yer ? { yer: [b.yer[0], b.yer[1]] } : {}),
    ...(b.yerKipi ? { yerKipi: b.yerKipi } : {}),
    kmBalon: b.id,
  };
}

// Operasyona balon grubu bağlıysa yalnız o grubun balonları, değilse resmin bütün balonları (3693).
function opBalonlari(r: Pick<KmResim, 'balonlar'> & { gruplar?: KmResim['gruplar'] }, opNo: number | null): { balonlar: KmResim['balonlar']; grup: string | null } {
  const atanan = opNo === null ? [] : (r.gruplar ?? []).filter((g) => g.operasyonlar.some((o) => o.opNo === opNo));
  if (atanan.length === 0) return { balonlar: r.balonlar, grup: null };
  const nolar = new Set(atanan.flatMap((g) => g.balonlar));
  return { balonlar: r.balonlar.filter((b) => nolar.has(b.no)), grup: atanan.map((g) => g.ad).join(', ') };
}

const etiket = (r: Pick<KmResim, 'ad' | 'revizyon' | 'balonlar'> & { gruplar?: KmResim['gruplar'] }, opNo: number | null): string => {
  const { balonlar, grup } = opBalonlari(r, opNo);
  return ['Kendiliğinden alındı', r.ad, r.revizyon ? 'Rev ' + r.revizyon : null, `${String(balonlar.length)} balon`, grup === null ? 'adıma göre ayırma yok' : `"${grup}" grubu`].filter((x) => x !== null).join(' · ');
};

// Taslağın elle konmuş (Çizim Merkezi dışı) dosyası resmin yerine geçmez; kişi dosyasını bilerek koymuştur.
const dosyaElle = (g: Record<string, unknown>): boolean => Array.isArray(g['files']) && g['files'].some((f) => !kayitMi(f) || typeof f['merkez'] !== 'number');

// Boş, bağsız ve kişinin bilerek boşaltmadığı taslak, tek aday resim varsa onun planıyla dolar. Aday: etkin, güncel revizyon, PDF resim, en az bir balonlu.
// Birden çok ya da hiç aday varsa dokunulmaz (seçim kişinindir; istemci "resim seçin" der). Zaman ve kişi yazılmaz: taslak her okumada aynı içeriği vermelidir.
export function kmTaslakDoldur(taslak: Record<string, unknown>, resimler: readonly KmResim[]): Record<string, unknown> | null {
  if (taslak['status'] !== 'draft' || typeof taslak['malzemeNo'] !== 'number' || dosyaElle(taslak)) return null;
  if (kayitMi(taslak['kmResim']) || (Array.isArray(taslak['plan']) && taslak['plan'].length > 0)) return null;
  const oto = taslak['otoKaynak'];
  if (kayitMi(oto) && kayitMi(oto['plan']) && oto['plan']['kaynak'] === 'el') return null;
  const adaylar = resimler.filter((r) => r.aktif && r.eski !== true && r.tur === 'resim' && r.balonlar.length > 0);
  if (adaylar.length !== 1) return null;
  const r = adaylar[0]!;
  const tmi = taslak['tmi'];
  const opNo = kayitMi(tmi) && typeof tmi['opNo'] === 'number' ? tmi['opNo'] : null;
  const plan = opBalonlari(r, opNo).balonlar.map(planKalemi);
  if (plan.length === 0) return null;
  return {
    ...taslak, plan, kmResim: { id: r.id, surum: r.surum },
    otoKaynak: { ...(kayitMi(oto) ? oto : {}), plan: { kaynak: 'km', etiket: etiket(r, opNo) } },
  };
}
