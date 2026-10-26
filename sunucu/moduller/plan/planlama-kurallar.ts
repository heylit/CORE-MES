import type { PlanAyari } from '#paylasilan/sozlesme/plan.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunBasi, tesisSaati } from '#paylasilan/zaman.ts';
import type { EmirKaydi } from '../recete-rota/disari.ts';

// Planlama çalışmasının saf kuralları (658 b: planlama ve motoru plan modülündedir; Reçete ve Rota yalnız veri verir).

const nesne = (d: unknown): Record<string, unknown> | null => (typeof d === 'object' && d !== null && !Array.isArray(d) ? (d as Record<string, unknown>) : null);

// Canlı plan ayarı prototipin `settings` alan adlarıyla.
export function ayarCevir(a: PlanAyari): DurumCevabi['settings'] {
  return { rule: a.kural, dir: a.yon, buffer: a.tamponGun, freezeDays: a.dondurmaGun, peopleLimit: a.personelKisiti, planDrafts: a.taslakEmirler };
}

// Sahibinin `CalisanAdim` biçimi (plan/disari.ts). Sağlam adet emir diliminden, adet adımın adedinden (yoksa emir adedi) eklenir; dilimde olmayan adım (emir okunmadı,
// rotasız emir değil) gelmez.
export interface CalisanAdimKaydi { anahtar: string; makineId: number | null; baslangic: string | null; sayimAni: string | null; kalanVerimliDk: number }
export function calisanAdimlariCevir(
  adimlar: readonly CalisanAdimKaydi[], emirler: readonly EmirKaydi[], adimAdetleri: NonNullable<DurumCevabi['adimAdetleri']> = {},
): NonNullable<DurumCevabi['calisanAdimlar']> {
  const emre = new Map(emirler.map((e) => [e.emirNo, e]));
  return adimlar.flatMap((a) => {
    const i = a.anahtar.lastIndexOf('|');
    const e = emre.get(a.anahtar.slice(0, i));
    const ie = e?.isEmirleri.find((x) => String(x.opNo) === a.anahtar.slice(i + 1));
    if (e === undefined || ie === undefined) return [];
    return [{
      anahtar: a.anahtar, makineId: a.makineId === null ? null : String(a.makineId), baslangic: a.baslangic, sayimAni: a.sayimAni,
      kalanVerimliDk: a.kalanVerimliDk, saglam: ie.canliAdet ?? 0, adet: adimAdetleri[a.anahtar] ?? e.adet,
    }];
  });
}


// Planın saat ekseni (motor/engine.betik parseT): başlangıç günü 00:00'dan duvar saatiyle saat; gün sayımı takvim günüdür (UTC aritmetiği,
// yaz saati sayılmaz). An ile eksen arasında çeviri tesisin saat dilimindedir.
const GUN_MS = 86_400_000;
const gunMs = (tarih: string): number => { const [y, a, g] = tarih.split('-').map(Number) as [number, number, number]; return Date.UTC(y, a - 1, g); };
export function planSaati(baslangic: string, an: number | string): number {
  const d = tesisSaati(typeof an === 'number' ? an : Date.parse(an));
  return (gunMs(d.slice(0, 10)) - gunMs(baslangic)) / 3_600_000 + Number(d.slice(11, 13)) + Number(d.slice(14, 16)) / 60;
}
export function planGunu(baslangic: string, gun: number): string {
  return new Date(gunMs(baslangic) + gun * GUN_MS).toISOString().slice(0, 10);
}
// 512 1 a: sunucu motoruna plan taslağının kabul edilmiş ek vardiyası verilir; çalışmanınkinin yerine geçer. Gün çalışmanın ekseninde
// (D.meta.baslangic); motor ekseni kaydırırken ek vardiyayı da kaydırır. Ekseni olmayan çalışma değişmez.
export function taslakEkMesaisi(calisma: unknown, ekMesai: readonly { makineId: number; gun: string; vardiyaId: number }[]): unknown {
  const c = calisma as { D?: { meta?: { baslangic?: unknown } } } | null;
  const baslangic = c?.D?.meta?.baslangic;
  if (typeof baslangic !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(baslangic)) return calisma;
  return { ...c, ekMesai: ekMesai.map((e) => ({ m: String(e.makineId), gun: (gunMs(e.gun) - gunMs(baslangic)) / GUN_MS, vardiya: String(e.vardiyaId) })) };
}
export function planAni(baslangic: string, saat: number): string {
  const dk = Math.round(saat * 60); const gun = Math.floor(dk / 1440);
  return new Date(tesisGunBasi(planGunu(baslangic, gun)) + (dk - gun * 1440) * 60_000).toISOString();
}

// Termin, planın saat ekseninde (motor/engine.betik parseT): tarih ya da "tarih saat" duvar saatidir; sayı zaten eksendedir.
export function terminSaati(baslangic: string, termin: unknown): number | null {
  if (typeof termin === 'number') return Number.isFinite(termin) ? termin : null;
  if (typeof termin !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(termin.trim());
  if (!m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)) - gunMs(baslangic)) / 3_600_000;
}

// Bitiş tarihi akışı (455/2 a): plan kaydedilirken siparişin son bitişi öncekinden yarım saat ya da daha çok oynadıysa ayrı satır eklenir,
// üstüne yazılmaz. Kural planlama sayfasınınkiyle aynıdır (zx-sevkiyat svKaydet): plan güncel değilse (veri planından sonra değişti) satır
// düşmez, havuzdaki sipariş atlanır, sipariş başına son 50 satır kalır. Sayfa aynı bitişi kendisi eklediyse ikinci satır düşmez. Gönderilen
// değer akışı taşımıyorsa kayıttakinin üstüne eklenir; akış kaybolmaz. Zaman ve kişi sunucudandır.
const BITIS_KAYMASI_SAAT = 0.5;
const BITIS_AKISI_EN_COK = 50;
const PLAN_KAYNAK_ADLARI: Record<string, string> = {
  sifir: 'Sıfırdan kur', iyilestir: 'Mevcut planı iyileştir', onar: 'Canlıya göre onar', oneri: 'Çözücü önerisi', ekip: 'Ekip: motor + HiGHS',
};
export interface BitisSatiri { C: number; t: number; kaynak: string; kim: string; due: number | null }
export function bitisAkisiEkle(yeni: unknown, eski: unknown, kim: string, an: number): unknown {
  const c = nesne(yeni);
  const plan = nesne(c?.['plan']);
  const J = nesne(plan?.['J']);
  const D = nesne(c?.['D']);
  const baslangic = nesne(D?.['meta'])?.['baslangic'];
  const siparisler = D?.['siparisler'];
  if (!c || !plan || !J || plan['dataVer'] !== c['dataVer'] || !Array.isArray(siparisler) || typeof baslangic !== 'string') return yeni;
  const kaynakKodu = typeof plan['kaynak'] === 'string' && plan['kaynak'] !== '' ? plan['kaynak'] : 'plan';
  const kaynak = PLAN_KAYNAK_ADLARI[kaynakKodu] ?? kaynakKodu;
  const onceki = nesne(c['sevkIz']) ?? nesne(nesne(eski)?.['sevkIz']) ?? {};
  const akis: Record<string, unknown> = { ...onceki };
  let degisti = c['sevkIz'] === undefined && Object.keys(onceki).length > 0;
  for (const s of siparisler as unknown[]) {
    const sip = nesne(s);
    const id = sip?.['id'];
    if (!sip || sip['havuz'] || (typeof id !== 'string' && typeof id !== 'number')) continue;
    const bitis = nesne(J[String(id)])?.['C'];
    if (typeof bitis !== 'number' || !Number.isFinite(bitis)) continue;
    const l = Array.isArray(akis[String(id)]) ? (akis[String(id)] as unknown[]) : [];
    const son = nesne(l[l.length - 1])?.['C'];
    if (typeof son === 'number' && Math.abs(son - bitis) < BITIS_KAYMASI_SAAT) continue;
    const satir: BitisSatiri = { C: bitis, t: an, kaynak, kim, due: terminSaati(baslangic, sip['termin']) };
    akis[String(id)] = [...l, satir].slice(-BITIS_AKISI_EN_COK);
    degisti = true;
  }
  return degisti ? { ...c, sevkIz: akis } : yeni;
}

// 499 a, 503 a (sayfanın zz40 soKuyruklari'yla aynı süzgeç): çalışma planının plan modülüne yazılabilecek işleri. Biten iş yazılmaz;
// fason ('@...') sayfada kalır; kişi ya da sunucuda karşılığı olmayan (planlanacak iş emri değil) iş yazılamaz. dokunulmaz: çalışmada biten
// ya da fason olan anahtarlar (canlıdaki yerleri bu yazmayla değişmez).
export interface CalismaIsi { k: string; anahtar: string; makineId: number; S: number; C: number }
export function calismaIsleri(
  ops: readonly { id: string; m: string; S: number; C: number; bitti: boolean }[], kimlik: Readonly<Record<string, string>>, planlanacak: ReadonlySet<string>,
): { yazilacak: CalismaIsi[]; yazilamaz: string[]; dokunulmaz: Set<string> } {
  const yazilacak: CalismaIsi[] = [];
  const yazilamaz = new Set<string>();
  const dokunulmaz = new Set<string>();
  for (const r of ops) {
    const anahtar = kimlik[r.id];
    if (r.bitti || r.m.startsWith('@')) { if (anahtar !== undefined) dokunulmaz.add(anahtar); continue; }
    if (!/^\d+$/.test(r.m) || anahtar === undefined || !planlanacak.has(anahtar)) { yazilamaz.add(anahtar ?? r.id); continue; }
    yazilacak.push({ k: r.id, anahtar, makineId: Number(r.m), S: r.S, C: r.C });
  }
  return { yazilacak, yazilamaz: [...yazilamaz], dokunulmaz };
}

export type FarkTuru = 'yeni' | 'tezgah' | 'sira' | 'eksik';
// 499 a: çalışma planı ile canlı plan. Saat kıyaslanmaz: canlıya almada saatleri plan modülü kurar (ADR 0018, son söz sunucuda), çalışmanın
// canlıya taşıdığı tezgâh ve tezgâhtaki sıradır. canli: anahtar -> canlıdaki parçalar (bölünmemiş işte tek; kişi kaynağında makineId null).
// yeni: canlıda yeri yok; tezgah: canlıdaki hiçbir parçası o tezgâhta değil; sira: aynı tezgâhtaki ortak işlerin sırasında yeri değişen
// (en uzun ortak sıranın dışında kalan, en az iş); eksik: canlıda var, çalışmada yazılacak değil (dokunulmaz hariç).
export function calismaFarki(
  isler: readonly CalismaIsi[], dokunulmaz: ReadonlySet<string>,
  canli: ReadonlyMap<string, readonly { makineId: number | null; baslangic: string }[]>, kimligi: (anahtar: string) => string | null,
): { tezgah: number; sira: number; yeni: number; eksik: number; isler: { k: string | null; anahtar: string; tur: FarkTuru }[] } {
  const y = { tezgah: 0, sira: 0, yeni: 0, eksik: 0, isler: [] as { k: string | null; anahtar: string; tur: FarkTuru }[] };
  const ekle = (k: string | null, anahtar: string, tur: FarkTuru) => { y[tur]++; y.isler.push({ k, anahtar, tur }); };
  const calismada = new Set<string>();
  const tezgahta = new Map<number, { i: CalismaIsi; canliAn: number }[]>();
  for (const i of isler) {
    calismada.add(i.anahtar);
    const parcalar = canli.get(i.anahtar);
    if (parcalar === undefined || parcalar.length === 0) { ekle(i.k, i.anahtar, 'yeni'); continue; }
    const ayni = parcalar.filter((p) => p.makineId === i.makineId);
    if (ayni.length === 0) { ekle(i.k, i.anahtar, 'tezgah'); continue; }
    tezgahta.set(i.makineId, [...(tezgahta.get(i.makineId) ?? []), { i, canliAn: Math.min(...ayni.map((p) => Date.parse(p.baslangic))) }]);
  }
  for (const l of tezgahta.values()) {
    const calismaSirasi = [...l].sort((p, q) => p.i.S - q.i.S || p.i.k.localeCompare(q.i.k));
    const canliSirasi = new Map([...l].sort((p, q) => p.canliAn - q.canliAn || p.i.k.localeCompare(q.i.k)).map((x, n) => [x.i.k, n]));
    const yerinde = enUzunArtan(calismaSirasi.map((x) => canliSirasi.get(x.i.k)!));
    calismaSirasi.forEach((x, n) => { if (!yerinde.has(n)) ekle(x.i.k, x.i.anahtar, 'sira'); });
  }
  for (const anahtar of canli.keys()) if (!calismada.has(anahtar) && !dokunulmaz.has(anahtar)) ekle(kimligi(anahtar), anahtar, 'eksik');
  return y;
}

// En uzun artan alt dizinin konumları (O(n log n)); eşitlikte ilk bulunan.
function enUzunArtan(a: readonly number[]): Set<number> {
  const uclar: number[] = [];
  const onceki = new Array<number>(a.length).fill(-1);
  for (let n = 0; n < a.length; n++) {
    let alt = 0;
    let ust = uclar.length;
    while (alt < ust) { const o = (alt + ust) >> 1; if (a[uclar[o]!]! < a[n]!) alt = o + 1; else ust = o; }
    if (alt > 0) onceki[n] = uclar[alt - 1]!;
    uclar[alt] = n;
  }
  const y = new Set<number>();
  for (let n = uclar.length > 0 ? uclar[uclar.length - 1]! : -1; n >= 0; n = onceki[n]!) y.add(n);
  return y;
}

// 503 a: yazılacak işler plan modülünün kuyruk diliyle (sayfanın soKuyruklari): tezgâh başına çalışmadaki başlangıç sırasıyla, kuyruğun
// başlangıcı şimdiden önce olamaz; yer ve sıra planlamacının kararıdır (elle, elleKaynak), saat önizlemedir.
export function calismaKuyruklari(baslangic: string, isler: readonly CalismaIsi[], simdi: number) {
  const gruplar = new Map<number, CalismaIsi[]>();
  for (const i of isler) gruplar.set(i.makineId, [...(gruplar.get(i.makineId) ?? []), i]);
  return [...gruplar].map(([makineId, l]) => {
    const sirali = [...l].sort((p, q) => p.S - q.S);
    return {
      kaynak: { tur: 'makine' as const, id: makineId },
      baslangic: new Date(Math.max(simdi, Date.parse(planAni(baslangic, sirali[0]!.S)))).toISOString(),
      isler: sirali.map((i) => {
        const b = i.anahtar.lastIndexOf('|');
        return {
          emirNo: i.anahtar.slice(0, b), opNo: Number(i.anahtar.slice(b + 1)), dondurulmus: false, elle: true, elleKaynak: true,
          onizleme: { baslangic: planAni(baslangic, i.S), bitis: planAni(baslangic, i.C) },
        };
      }),
    };
  });
}

// 507 2 a: çalışmanın ek vardiyaları plan modülünün diliyle (makine ve vardiya kimliği sayı, gün takvim günü). Sayı olmayan kimlik
// (sayfada elle girilmiş tezgâh ya da vardiya) yazılamaz; sayısı döner.
export function calismaEkMesaisi(baslangic: string, l: readonly { m: string; gun: number; vardiya: string }[]) {
  const satirlar: { makineId: number; gun: string; vardiyaId: number }[] = [];
  const anahtarlar = new Set<string>();
  let yazilamaz = 0;
  for (const e of l) {
    if (!/^\d+$/.test(e.m) || !/^\d+$/.test(e.vardiya) || Number(e.m) === 0 || Number(e.vardiya) === 0) { yazilamaz++; continue; }
    const x = { makineId: Number(e.m), gun: planGunu(baslangic, e.gun), vardiyaId: Number(e.vardiya) };
    const a = `${String(x.makineId)}|${x.gun}|${String(x.vardiyaId)}`;
    if (!anahtarlar.has(a)) { anahtarlar.add(a); satirlar.push(x); }
  }
  return { satirlar, yazilamaz };
}

// 507 3 a (503'ün tersi): plan taslağının yerleri çalışmanın planına (S.plan.ops) ve kilitlerine (S.locks) yazılır; deger kayıttaki
// çalışmadır, kopyası döner. Saatler kaydın kendi ekseninde (D.meta.baslangic). Yalnız çalışmada işlemi olan ve bitmemiş iş yazılır; işlemin
// ayar başlangıcı (Su) ve ilk parti (lot1) aynı kayar. Taslakta kilitli iş çalışmada kilitlenir, kilitsizin kilidi kalkar. Plan "güncel
// değil" işaretlenir (dataVer boş): sayfa yeniden çözer.
export interface TaslakYeri { k: string; anahtar: string; makineId: number; baslangic: string; bitis: string; kilitli: boolean }
export function taslaktanCalismaya(deger: unknown, yerler: readonly TaslakYeri[]): { deger: Record<string, unknown>; yazilan: number; kilitli: number; atlanan: string[] } | null {
  const S = JSON.parse(JSON.stringify(deger ?? null)) as {
    D?: { meta?: { baslangic?: unknown } }; plan?: { ops?: Record<string, Record<string, unknown>>; dataVer?: unknown } | null; locks?: Record<string, unknown>;
  } | null;
  const eksen = S?.D?.meta?.baslangic;
  if (S === null || typeof eksen !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eksen) || !S.plan?.ops) return null;
  const ops = S.plan.ops;
  const locks: Record<string, unknown> = { ...(S.locks ?? {}) };
  const atlanan: string[] = [];
  let yazilan = 0;
  let kilitli = 0;
  for (const y of yerler) {
    const r = ops[y.k];
    if (!r || r.done) { atlanan.push(y.anahtar); continue; }
    const S0 = planSaati(eksen, y.baslangic);
    const C = planSaati(eksen, y.bitis);
    const kay = typeof r.S === 'number' && Number.isFinite(r.S) ? S0 - r.S : 0;
    const kaydir = (a: string, ust: number) => { if (typeof r[a] === 'number' && Number.isFinite(r[a])) r[a] = Math.min(ust, (r[a] as number) + kay); };
    kaydir('Su', S0);
    kaydir('lot1', C);
    Object.assign(r, { m: String(y.makineId), S: S0, C });
    yazilan++;
    if (y.kilitli) { locks[y.k] = { m: String(y.makineId), S: S0 }; kilitli++; } else delete locks[y.k];
  }
  S.locks = locks;
  S.plan.dataVer = null;
  return { deger: S as Record<string, unknown>, yazilan, kilitli, atlanan };
}

// 525 1 a: açık satın alma siparişinden kalan miktar ve beklenen teslim günü, plandaki malzeme koduyla. Miktar kalemin birimindedir: birimi
// malzemenin biriminden farklı satır çevrilmeden toplanamaz, alınmaz; kalanı olmayan satır da alınmaz.
export interface AcikSiparisGelisi { kod: string; miktar: number; tarih: string | null; siparisNo: string }
export function acikSiparisSatirlari(
  malzemeler: readonly { id: string; kayitNo: number; unit: string | null }[],
  gelisler: ReadonlyMap<number, readonly { tarih: string | null; miktar: string; birim: string; siparisNo: string }[]>,
): AcikSiparisGelisi[] {
  return malzemeler.flatMap((m) => (gelisler.get(m.kayitNo) ?? [])
    .filter((g) => g.birim === m.unit && Number(g.miktar) > 0)
    .map((g) => ({ kod: m.id, miktar: Number(g.miktar), tarih: g.tarih, siparisNo: g.siparisNo })));
}

// 533 a: planın "olması gereken" tarihi Satın Alma'ya bildirilir: malzemeyi kullanan ilk işin kayıtlı plandaki başlangıcı eksi muayene süresi
// (durum.betik tmIhtiyac), planın günü olarak. Havuzdaki sipariş ve bitmiş işlem sayılmaz. Plan ya da başlangıç günü yoksa liste boştur.
export function gerekenTarihler(calisma: unknown): { kod: string; gerekenTarih: string }[] {
  const nesne = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const dizi = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(nesne) : []);
  const c = nesne(calisma), D = nesne(c['D']);
  const bas = nesne(D['meta'])['baslangic'];
  const taban = typeof bas === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bas) ? Date.parse(`${bas}T00:00:00Z`) : Number.NaN;
  if (!Number.isFinite(taban)) return [];
  const ilk = new Map<string, number>();
  for (const r of Object.values(nesne(nesne(c['plan'])['ops'])).map(nesne)) {
    const S = r['S'], job = r['job'];
    if (r['done'] || typeof S !== 'number' || !Number.isFinite(S) || typeof job !== 'string') continue;
    ilk.set(job, Math.min(ilk.get(job) ?? Infinity, S));
  }
  const muayene = new Map(dizi(D['malzemeler']).map((m) => [String(m['kod']), Number(m['muayeneGun']) || 0]));
  const gerek = new Map<string, number>();
  for (const s of dizi(D['siparisler'])) {
    const t = ilk.get(String(s['id']));
    if (s['havuz'] === true || t === undefined) continue;
    for (const r of dizi(s['malzeme'])) {
      const kod = String(r['kod']);
      gerek.set(kod, Math.min(gerek.get(kod) ?? Infinity, t - (muayene.get(kod) ?? 0) * 24));
    }
  }
  return [...gerek].map(([kod, t]) => ({ kod, gerekenTarih: new Date(taban + Math.floor(t / 24) * 86_400_000).toISOString().slice(0, 10) }));
}
