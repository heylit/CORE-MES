// Terminal kural 1/5 (kullanıcı kararı): bir kez çalışmış işte son numune reddedildiyse, revizyon değiştiyse ya da paketin içeriği (kontrol planı,
// adımlar, dokümanlar, uyarılar, numune planı, rotadan gelen süreler, istasyon, makine, rota revizyonu) son yayından sonra değiştiyse yeniden başlatmada ilk parça onayı
// kendiliğinden istenmez: Hazırlık ara onayda değişikliği görür ve kararı verir (`fpRe`). Kararın anı ve o ana kadar karara bağlanmış numuneler
// sunucuda damgalanır; kapı sunucudadır (sunucu/moduller/arkon/kurallar.ts yenidenIlkParcaAcik), ekran karşılığı ilk-parca.ts'tedir.

export interface AraOnayNumunesi { id: string; pkgId?: string; rev?: string; rotaRev?: string; status?: string; items?: number[]; results?: Record<string, { ok?: boolean } | undefined>; decidedAt?: number }
export interface YenidenKarar { on: boolean; key: string; why: AraOnayTuru; by?: string; at?: number; once?: string[] }
export interface AraOnayPaketi {
  id: string; rev?: string; rotaRev?: string; plan?: unknown; steps?: unknown; files?: unknown; rules?: { warns?: unknown } | null; samp?: unknown;
  cycle?: unknown; setup?: unknown; op?: unknown; machine?: unknown; mc?: unknown; yayinImza?: Record<string, string> | null; fpRe?: YenidenKarar | null;
}
export type AraOnayTuru = 'red' | 'revizyon' | 'degisiklik';
export interface AraOnayNedeni { tur: AraOnayTuru; etiket: string }

const KARARLI = new Set(['approved', 'deviation', 'rejected']);

const kanonik = (d: unknown): string => JSON.stringify(d, (_k, v: unknown) =>
  (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)) ?? '';

// Kısa imza yalnız "değişti mi" sorusu içindir (güvenlik değeri yok): FNV-1a 32 bit.
function imza(d: unknown): string {
  let h = 0x811c9dc5;
  const m = kanonik(d);
  for (let i = 0; i < m.length; i++) h = Math.imul(h ^ m.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const IMZA_ALANLARI = [
  ['plan', 'Kontrol planı'], ['steps', 'Operasyon adımları'], ['files', 'Dokümanlar'], ['warns', 'Uyarılar'], ['samp', 'Numune planı'],
  ['cycle', 'Çevrim süresi'], ['setup', 'Ayar süresi'], ['op', 'Operasyon'],
  // Plan işi başka istasyona ya da makineye taşıyınca CORE paketi `machine` ve `mc` alanlarını yeniden yazar. 3755: `rev` parça (çizim)
  // revizyonu, `rotaRev` rota harfidir; bu alanlardan önce `rev` rota harfiydi.
  ['machine', 'İstasyon'], ['mc', 'Makine'], ['rev', 'Parça revizyonu'], ['rotaRev', 'Rota revizyonu'],
] as const;

export function paketImzasi(p: AraOnayPaketi): Record<string, string> {
  // Dosyanın içeriği (bayt) imzaya girmez: ad, tür, boyut ve anahtar değişikliği yeter, büyük dosya her çizimde yeniden okunmaz.
  const dosyalar = Array.isArray(p.files) ? p.files.map((f: Record<string, unknown>) => ({ kind: f['kind'], name: f['name'], size: f['size'], key: f['key'], merkezOzet: f['merkezOzet'] })) : p.files;
  const deger = (a: string): unknown => (a === 'warns' ? p.rules?.warns : a === 'files' ? dosyalar : (p as unknown as Record<string, unknown>)[a]);
  return Object.fromEntries(IMZA_ALANLARI.map(([a]) => [a, imza(deger(a))]));
}

const kararliNumuneler = (p: AraOnayPaketi, numuneler: readonly AraOnayNumunesi[]) =>
  numuneler.filter((n) => n.pkgId === p.id && KARARLI.has(n.status ?? '')).sort((a, b) => (a.decidedAt ?? 0) - (b.decidedAt ?? 0));

// Ara onayın nedenleri ve kararın bağlandığı anahtar. Anahtar nedenler ve içerik değişince değişir: karar verildikten sonra yeni bir değişiklik
// yeniden sorulur. Neden yoksa null.
export function araOnayNedenleri(p: AraOnayPaketi, numuneler: readonly AraOnayNumunesi[]): { nedenler: AraOnayNedeni[]; anahtar: string } | null {
  const son = kararliNumuneler(p, numuneler).at(-1);
  const nedenler: AraOnayNedeni[] = [];
  if (son?.status === 'rejected') nedenler.push({ tur: 'red', etiket: 'Son numune reddedildi' });
  if (son) {
    // 3755: rotaRev'siz (eski) numunenin `rev`i rota harfidir; paketin rota harfiyle karşılaştırılır, parça revizyonu o numunede bilinmez.
    const rotaHarfi = p.rotaRev ?? p.rev ?? '';
    if (son.rotaRev === undefined) {
      if ((son.rev ?? '') !== rotaHarfi) nedenler.push({ tur: 'revizyon', etiket: `Rota revizyonu değişti: Rota ${son.rev || '-'} → Rota ${rotaHarfi || '-'}` });
    } else {
      if ((son.rev ?? '') !== (p.rev ?? '')) nedenler.push({ tur: 'revizyon', etiket: `Parça revizyonu değişti: Rev ${son.rev || '-'} → Rev ${p.rev || '-'}` });
      if (son.rotaRev !== rotaHarfi) nedenler.push({ tur: 'revizyon', etiket: `Rota revizyonu değişti: Rota ${son.rotaRev || '-'} → Rota ${rotaHarfi || '-'}` });
    }
  }
  const simdiki = paketImzasi(p);
  if (p.yayinImza) {
    const revizyonVar = nedenler.some((n) => n.tur === 'revizyon');
    // rotaRev'siz yayın imzasında `rev` rota harfinin imzasıdır: rota harfiyle karşılaştırılır, parça revizyonu sorulmaz.
    const eskiImza = p.yayinImza['rotaRev'] === undefined;
    const karsilik = (a: string): string | undefined => (eskiImza && a === 'rev' ? imza(p.rotaRev ?? p.rev) : simdiki[a]);
    for (const [a, etiket] of IMZA_ALANLARI) {
      const revAlani = a === 'rev' || a === 'rotaRev';
      if (revAlani && revizyonVar) continue;
      const etiketi = eskiImza && a === 'rev' ? 'Rota revizyonu' : etiket;
      if (p.yayinImza[a] !== undefined && p.yayinImza[a] !== karsilik(a)) nedenler.push({ tur: revAlani ? 'revizyon' : 'degisiklik', etiket: `${etiketi} değişti` });
    }
  }
  if (nedenler.length === 0) return null;
  return { nedenler, anahtar: [...new Set(nedenler.map((n) => n.tur))].join('+') + ':' + (son?.id ?? '-') + ':' + (p.rev ?? '') + ':' + imza(simdiki) };
}
