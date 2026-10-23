import type { BUTCE_KALEMLERI } from '#paylasilan/sozlesme/finans.ts';
import type { Komut } from '../akislar.ts';
import { KAT_KOD, sayi, type BeklenenOdeme } from '../donustur.ts';
import { diffDays, isPnl, kdvByMonth, PNL_GIDER, sum, ymAdd, type FinansMotoru, type KdvAyi, type SiparisKalemi } from '../motor.ts';

// Nakit planı, bütçe ve vergi bölümlerinin saf hesapları (prototipte VIEWS.nakit, butce, vergi ve cashBridge). Motorun
// dışında kalan, yalnız bu bölümlerin kullandığı hesaplardır; motor değişmez.

/* ---------- Nakit planı ---------- */
export const siparisListesi = (beklenen: readonly BeklenenOdeme[]): SiparisKalemi[] => beklenen as unknown as SiparisKalemi[];

export interface KopruParcasi { g: string; v: number }
const KOPRU_GRUPLARI: readonly [string, 1 | -1][] = [
  ['Mevcut faturaların tahsili', 1], ['Çek ve senet tahsili', 1], ['Yeni satışlardan tahsilat', 1], ['Tedarikçi ödemeleri', -1], ['Yeni alımlar', -1],
  ['Maaş, kira ve düzenli ödemeler', -1], ['Verilen çekler', -1], ['KDV', -1],
];
// "Nakit nereden gelip nereye gidiyor?": varsayılan senaryoyla 13 haftanın kalemleri gruplara toplanır (prototip cashBridge).
export function nakitKoprusu(motor: FinansMotoru): { start: number; end: number; parts: KopruParcasi[] } {
  const f = motor.forecast(motor.emptyState().scen);
  const duzenliAdlari = new Set(motor.durum.recurring.map((r) => r.name));
  const g = KOPRU_GRUPLARI.map(([ad]) => ad);
  const tot: Record<string, number> = Object.fromEntries(g.map((ad) => [ad, 0]));
  for (const w of f.weeks) for (const x of w.items) {
    const l = x.label;
    const grup = l.startsWith('Tahsilat:') ? g[0]! : /(Çek|Senet) tahsili/.test(l) ? g[1]! : l.startsWith('Yeni satışlardan') ? g[2]!
      : l.startsWith('Ödeme:') ? g[3]! : l.startsWith('Yeni alımlara') ? g[4]! : l.startsWith('Verilen') ? g[6]! : l.startsWith('Tahmini KDV') ? g[7]!
        : duzenliAdlari.has(l) ? g[5]! : g[3]!;
    tot[grup] = tot[grup]! + x.amt;
  }
  return { start: f.open, end: f.end, parts: g.map((ad) => ({ g: ad, v: tot[ad]! })).filter((p) => Math.abs(p.v) > 1) };
}

// Köprü grafiğinin yüzen çubukları: bugün, her grup [önceki, sonraki], 13. hafta.
export function kopruCubuklari(k: ReturnType<typeof nakitKoprusu>): { etiket: string; aralik: [number, number]; tur: 'bakiye' | 'giris' | 'cikis' }[] {
  const satirlar: { etiket: string; aralik: [number, number]; tur: 'bakiye' | 'giris' | 'cikis' }[] = [{ etiket: 'Bugün', aralik: [0, k.start], tur: 'bakiye' }];
  let run = k.start;
  for (const p of k.parts) { satirlar.push({ etiket: p.g, aralik: [run, run + p.v], tur: p.v >= 0 ? 'giris' : 'cikis' }); run += p.v; }
  satirlar.push({ etiket: '13. hafta', aralik: [0, k.end], tur: 'bakiye' });
  return satirlar;
}

/* ---------- Bütçe ---------- */
export type ButceDurumu = 'yok' | 'asildi' | 'sinirda' | 'hizli' | 'plan';
export const BUTCE_DURUM_ADI: Record<ButceDurumu, string> = { yok: 'Bütçe yok', asildi: 'Aşıldı', sinirda: 'Sınırda', hizli: 'Hızlı gidiyor', plan: 'Plan dahilinde' };
export function butceDurumu(butce: number, gercek: number, ayOrani: number): ButceDurumu {
  if (!butce) return 'yok';
  const r = gercek / butce;
  return r > 1.1 ? 'asildi' : r > 1 ? 'sinirda' : r > ayOrani + 0.15 ? 'hizli' : 'plan';
}

// Seçilebilen aylar: bu ay ve önceki iki ay. Ayın ilk haftasında geçen ay açılır (prototip ui.budYm).
export const butceAylari = (bugun: string): string[] => [0, -1, -2].map((k) => ymAdd(bugun.slice(0, 7), k));
export const ilkButceAyi = (bugun: string): string => (Number(bugun.slice(8, 10)) <= 7 ? ymAdd(bugun.slice(0, 7), -1) : bugun.slice(0, 7));

export interface ButceSatiri { kalem: string; butce: number; gercek: number; kalan: number; durum: ButceDurumu; yilOrt: number }
export interface ButceTablosu {
  ay: string; buAy: boolean; ayOrani: number; satirlar: ButceSatiri[]; toplamButce: number; toplamGercek: number; hedef: number; satis: number;
}
export function butceTablosu(motor: FinansMotoru, ay: string): ButceTablosu {
  const s = motor.durum, bugun = motor.bugun, buAy = ay === bugun.slice(0, 7), yil = bugun.slice(0, 4);
  const gercek: Record<string, number> = {}, yilda: Record<string, number> = {};
  for (const t of s.tx) {
    if (t.type !== 'gider' || !isPnl(t)) continue;
    if (t.date.slice(0, 7) === ay) gercek[t.cat] = (gercek[t.cat] ?? 0) + t.amount;
    if (t.date.slice(0, 4) === yil) yilda[t.cat] = (yilda[t.cat] ?? 0) + t.amount;
  }
  const aySayisi = Number(bugun.slice(5, 7));
  const ayOrani = buAy ? Number(bugun.slice(8, 10)) / new Date(Number(yil), Number(bugun.slice(5, 7)), 0).getDate() : 1;
  const satirlar = PNL_GIDER.map((k) => {
    const b = Number(s.budget[k]) || 0, a = gercek[k] ?? 0;
    return { kalem: k, butce: b, gercek: a, kalan: b - a, durum: butceDurumu(b, a, ayOrani), yilOrt: (yilda[k] ?? 0) / aySayisi };
  });
  return {
    ay, buAy, ayOrani, satirlar, toplamButce: sum(satirlar, (x) => x.butce), toplamGercek: sum(satirlar, (x) => x.gercek), hedef: Number(s.revenueTarget) || 0,
    satis: sum(s.tx.filter((t) => t.type === 'gelir' && t.date.slice(0, 7) === ay), (t) => t.amount),
  };
}

// Sunucunun bütçe kalemi kodu (satış hedefi ayrı kalemdir); bütçesi tutulmayan gider kalemi null.
// İstemci sözleşmeden yalnız tip alır (zod pakete girmez); liste tiple eşlenir, kalem eklenince derleme düşer.
export type ButceKalemi = (typeof BUTCE_KALEMLERI)[number];
const BUTCE_KALEMI: Record<ButceKalemi, true> = {
  mal_alimi: true, personel: true, sgk_stopaj: true, kira: true, enerji: true, lojistik: true, pazarlama: true, faiz: true, diger_gider: true,
  kur_farki_gideri: true, satis_hedefi: true,
};
export function butceKalemi(etiket: string): ButceKalemi | null {
  const k = KAT_KOD[etiket];
  return k && k in BUTCE_KALEMI ? (k as ButceKalemi) : null;
}

// Bütçe girişi "bu aydan itibaren" geçerlidir (prototip buAyBasi); tutar eksi olamaz.
export function butceKomutu(kalem: ButceKalemi, bugun: string, tutar: number): Komut {
  return {
    uc: 'POST /finans/butce/belirle', tekrar: false, basari: 'Bütçe bu aydan itibaren geçerli.',
    govde: { kategori: kalem, baslangicAyi: `${bugun.slice(0, 7)}-01`, aylikTutar: Math.max(0, sayi(tutar)) },
  };
}

// "Son 6 ay ortalamasıyla doldur": tamamlanmış son altı ayın gider ortalaması, bine yuvarlanır; boş kalem gönderilmez.
export function altiAyKomutlari(motor: FinansMotoru): Komut[] {
  const aylar = motor.completeMonths(6);
  return PNL_GIDER.flatMap((k) => {
    const v = sum(aylar, (m) => m.byCat[k] ?? 0) / 6, kalem = butceKalemi(k);
    return v > 0 && kalem ? [{ ...butceKomutu(kalem, motor.bugun, Math.round(v / 1000) * 1000), basari: 'Bütçe son 6 ayın ortalamasıyla dolduruldu.' }] : [];
  });
}

/* ---------- Vergi ---------- */
export interface VergiOzeti { aylar: KdvAyi[]; buAy: KdvAyi | undefined; gecenAy: KdvAyi | undefined; takvim: ReturnType<FinansMotoru['taxCalendar']> }
export function vergiOzeti(motor: FinansMotoru): VergiOzeti {
  const aylar = kdvByMonth(motor.durum.tx).slice(-7), ym = motor.bugun.slice(0, 7);
  return { aylar, buAy: aylar.find((m) => m.ym === ym), gecenAy: aylar.filter((m) => m.ym < ym).slice(-1)[0], takvim: motor.taxCalendar(75) };
}
// Beyan satırının rengi: 5 gün içinde risk, 15 gün içinde uyarı.
export const kalanGunTonu = (gun: number): 'hata' | 'uyari' | 'tamam' => (gun <= 5 ? 'hata' : gun <= 15 ? 'uyari' : 'tamam');
export const kalanGun = (tarih: string, bugun: string): number => diffDays(tarih, bugun);
