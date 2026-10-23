// Performans, eğitim ve işe alım ekranlarının saf hesapları (205 a). Tarihler 'YYYY-AA-GG' metnidir; bugün dışarıdan verilir.
// Veri yoksa null döner; sıfır uydurulmaz.

export type Ton = 'ok' | 'info' | 'warn' | 'bad';

type Puanlar = Readonly<Record<string, unknown>> | undefined;
interface PuanliKayit { skorlar?: Puanlar }

export const satirlar = (metin: unknown): string[] =>
  String(metin ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

const sayi = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const ortalama = (degerler: readonly number[]): number | null =>
  degerler.length ? degerler.reduce((a, b) => a + b, 0) / degerler.length : null;

export function gunFarki(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function gunEkle(gun: string, n: number): string {
  return new Date(Date.parse(`${gun}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const tarihMi = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

// --- Puanlama (performans ve görüşme ortak) ---

export function puanOrtalamasi(k: PuanliKayit): number | null {
  return ortalama(Object.values(k.skorlar ?? {}).map(sayi).filter((x) => x > 0));
}

export const PERFORMANS_SONUCLARI = [
  'Beklentinin çok üzerinde', 'Beklentinin üzerinde', 'Beklentiyi karşılıyor', 'Gelişime açık', 'Beklentinin altında',
] as const;

export function performansSonucu(ort: number | null): { etiket: string; ton: Ton | null } {
  if (ort === null) return { etiket: 'Puanlanmadı', ton: null };
  if (ort >= 4.5) return { etiket: PERFORMANS_SONUCLARI[0], ton: 'ok' };
  if (ort >= 3.5) return { etiket: PERFORMANS_SONUCLARI[1], ton: 'ok' };
  if (ort >= 2.5) return { etiket: PERFORMANS_SONUCLARI[2], ton: 'info' };
  if (ort >= 1.5) return { etiket: PERFORMANS_SONUCLARI[3], ton: 'warn' };
  return { etiket: PERFORMANS_SONUCLARI[4], ton: 'bad' };
}

export const puanMetni = (v: number | null): string | null =>
  v === null ? null : (Math.round(v * 100) / 100).toLocaleString('tr-TR');

// --- Performans ---

export interface PerformansKaydi extends PuanliKayit { id: string; empId?: string; donem?: string; tarih?: string }

export function donemler(ps: readonly PerformansKaydi[]): string[] {
  return [...new Set(ps.map((p) => p.donem).filter((d): d is string => !!d))].sort().reverse();
}

export interface PerformansSuzgeci { donem: string; departman: string; arama: string }

export function performansSuz<P extends PerformansKaydi>(
  ps: readonly P[], s: PerformansSuzgeci, departmani: (empId: string | undefined) => string | undefined,
  adi: (empId: string | undefined) => string,
): P[] {
  const q = s.arama.trim().toLocaleLowerCase('tr');
  return ps
    .filter((p) => !s.donem || p.donem === s.donem)
    .filter((p) => !s.departman || departmani(p.empId) === s.departman)
    .filter((p) => !q || adi(p.empId).toLocaleLowerCase('tr').includes(q))
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}

export function sonucDagilimi(ps: readonly PerformansKaydi[]): { etiket: string; deger: number }[] {
  return PERFORMANS_SONUCLARI
    .map((etiket) => ({ etiket, deger: ps.filter((p) => performansSonucu(puanOrtalamasi(p)).etiket === etiket).length }))
    .filter((d) => d.deger > 0);
}

export function departmanOrtalamalari(
  ps: readonly PerformansKaydi[], departmanAdi: (empId: string | undefined) => string,
): { etiket: string; deger: number }[] {
  const gruplar = new Map<string, number[]>();
  for (const p of ps) {
    const o = puanOrtalamasi(p);
    if (o === null) continue;
    const d = departmanAdi(p.empId);
    gruplar.set(d, [...(gruplar.get(d) ?? []), o]);
  }
  return [...gruplar].map(([etiket, v]) => ({ etiket, deger: ortalama(v) ?? 0 })).sort((a, b) => b.deger - a.deger);
}

export function kriterOrtalamalari(kayitlar: readonly PuanliKayit[], kriterler: readonly string[]): { etiket: string; deger: number | null }[] {
  return kriterler.map((k) => ({ etiket: k, deger: ortalama(kayitlar.map((p) => sayi(p.skorlar?.[k])).filter((x) => x > 0)) }));
}

// --- Eğitim ---

export const ISG_TURU = 'İSG (zorunlu)';
export const EGITIM_DURUMLARI = ['Planlandı', 'Tamamlandı', 'İptal'] as const;

export interface EgitimKaydi { id: string; ad?: string; kurum?: string; tur?: string; durum?: string; tarih?: string; sure?: unknown; maliyet?: unknown; gecerlilik?: string; katilimcilar?: readonly string[] }

export interface EgitimSuzgeci { tur: string; durum: string; arama: string }

export function egitimSuz<E extends EgitimKaydi>(ts: readonly E[], s: EgitimSuzgeci): E[] {
  const q = s.arama.trim().toLocaleLowerCase('tr');
  return ts
    .filter((t) => !s.tur || t.tur === s.tur)
    .filter((t) => !s.durum || t.durum === s.durum)
    .filter((t) => !q || `${t.ad ?? ''} ${t.kurum ?? ''}`.toLocaleLowerCase('tr').includes(q))
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}

export interface EgitimGostergeleri { tamamlanan: number; katilimSaati: number; kisiBasiSaat: number | null; harcama: number }

export function egitimGostergeleri(ts: readonly EgitimKaydi[], yil: string, aktifCalisan: number): EgitimGostergeleri {
  const biten = ts.filter((t) => t.durum === 'Tamamlandı' && (t.tarih ?? '').startsWith(yil));
  const saat = biten.reduce((s, t) => s + sayi(t.sure) * (t.katilimcilar ?? []).length, 0);
  return {
    tamamlanan: biten.length,
    katilimSaati: saat,
    kisiBasiSaat: aktifCalisan ? Math.round((saat / aktifCalisan) * 10) / 10 : null,
    harcama: biten.reduce((s, t) => s + sayi(t.maliyet), 0),
  };
}

export type SertifikaDurumu = { tur: 'doldu' } | { tur: 'yaklasiyor'; tarih: string } | { tur: 'gecerli'; tarih: string } | null;

export function sertifikaDurumu(gecerlilik: unknown, bugun: string): SertifikaDurumu {
  if (!tarihMi(gecerlilik)) return null;
  const g = gecerlilik.slice(0, 10);
  if (g < bugun) return { tur: 'doldu' };
  return gunFarki(bugun, g) <= 30 ? { tur: 'yaklasiyor', tarih: g } : { tur: 'gecerli', tarih: g };
}

// Geçerli İSG eğitimi: türü İSG (zorunlu), tamamlanmış, sertifika bitişi yok ya da geçmemiş.
export function isgEksikler<P extends { id: string }>(ts: readonly EgitimKaydi[], aktifler: readonly P[], bugun: string): P[] {
  const tamam = new Set<string>();
  for (const t of ts) {
    if (t.tur !== ISG_TURU || t.durum !== 'Tamamlandı') continue;
    if (tarihMi(t.gecerlilik) && t.gecerlilik.slice(0, 10) < bugun) continue;
    for (const k of t.katilimcilar ?? []) tamam.add(k);
  }
  return aktifler.filter((p) => !tamam.has(p.id));
}

// --- İşe alım ---

export const BITEN_ASAMALAR = ['İşe alındı', 'Reddedildi'] as const;
export const VARSAYILAN_ASAMA = 'Başvuru';

export interface AdayKaydi { id: string; ad?: string; soyad?: string; jobId?: string; asama?: string; kaynak?: string; basvuruTarihi?: string; iseAlimTarihi?: string; teklifYanit?: string; maasBeklentisi?: unknown }
export interface GorusmeKaydi extends PuanliKayit { id: string; candId?: string; tur?: string; tarih?: string; saat?: string; durum?: string; oneri?: string }

export const adayAdi = (c: Pick<AdayKaydi, 'ad' | 'soyad'> | null | undefined): string =>
  c ? (`${c.ad ?? ''} ${c.soyad ?? ''}`.trim() || 'İsimsiz aday') : '—';

export const asamasi = (c: Pick<AdayKaydi, 'asama'>): string => c.asama || VARSAYILAN_ASAMA;
export const surecteMi = (c: Pick<AdayKaydi, 'asama'>): boolean => !(BITEN_ASAMALAR as readonly string[]).includes(asamasi(c));
export const gorusmeTamamMi = (i: Pick<GorusmeKaydi, 'durum'>): boolean => i.durum === 'Tamamlandı';

const anahtar = (i: GorusmeKaydi) => `${i.tarih ?? ''}${i.saat ?? ''}`;

export function adayGorusmeleri<G extends GorusmeKaydi>(gs: readonly G[], adayId: string): G[] {
  return gs.filter((i) => i.candId === adayId).sort((a, b) => anahtar(a).localeCompare(anahtar(b)));
}

export function adayPuani(gs: readonly GorusmeKaydi[], adayId: string): number | null {
  return ortalama(adayGorusmeleri(gs, adayId).filter(gorusmeTamamMi).map(puanOrtalamasi).filter((x): x is number => x !== null));
}

export function sonrakiGorusme<G extends GorusmeKaydi>(gs: readonly G[], adayId: string, bugun: string): G | null {
  return adayGorusmeleri(gs, adayId).find((i) => i.durum === 'Planlandı' && tarihMi(i.tarih) && i.tarih.slice(0, 10) >= bugun) ?? null;
}

// Tarihi geçmiş ama sonucu girilmemiş görüşmeler; adayı silinmiş olanlar sayılmaz.
export function degerlendirmeBekleyenler<G extends GorusmeKaydi>(gs: readonly G[], adayVar: (id: string | undefined) => boolean, bugun: string): G[] {
  return gs.filter((i) => i.durum === 'Planlandı' && tarihMi(i.tarih) && i.tarih.slice(0, 10) < bugun && adayVar(i.candId));
}

export function degerlendirilebilirMi(i: GorusmeKaydi, bugun: string): boolean {
  return i.durum === 'Planlandı' && tarihMi(i.tarih) && i.tarih.slice(0, 10) <= bugun;
}

export function oneriOzeti(gs: readonly GorusmeKaydi[], adayId: string, oneriler: readonly string[]): { oneri: string; sayi: number }[] {
  const m = new Map<string, number>();
  for (const i of adayGorusmeleri(gs, adayId)) if (i.oneri && gorusmeTamamMi(i)) m.set(i.oneri, (m.get(i.oneri) ?? 0) + 1);
  return oneriler.filter((o) => m.has(o)).map((o) => ({ oneri: o, sayi: m.get(o) ?? 0 }));
}

export const ONERI_TONU: Readonly<Record<string, Ton>> = { 'Kesinlikle alınsın': 'ok', Alınsın: 'ok', Kararsız: 'warn', Alınmasın: 'bad' };

export function asamaTonu(asama: string | undefined): Ton {
  if (asama === 'İşe alındı') return 'ok';
  if (asama === 'Reddedildi') return 'bad';
  if (asama === 'Teklif') return 'warn';
  return 'info';
}

export function gorusmeTonu(durum: string | undefined): Ton | null {
  if (durum === 'Tamamlandı') return 'ok';
  if (durum === 'Planlandı') return 'info';
  if (durum === 'Aday gelmedi') return 'bad';
  return null;
}

// Görüşme planlanınca aday en az ilgili aşamaya taşınır; geri alınmaz.
export function gorusmeSonrasiAsama(aday: AdayKaydi, gorusmeTuru: string | undefined, asamalar: readonly string[]): string | null {
  if (!surecteMi(aday)) return null;
  const hedef = gorusmeTuru === 'Telefon ön görüşmesi' ? 'Ön görüşme' : 'Mülakat';
  return asamalar.indexOf(asamasi(aday)) < asamalar.indexOf(hedef) ? hedef : null;
}

export function komsuAsama(aday: AdayKaydi, yon: -1 | 1, asamalar: readonly string[]): string {
  const i = asamalar.indexOf(asamasi(aday));
  return asamalar[Math.max(0, Math.min(asamalar.length - 1, i + yon))] ?? VARSAYILAN_ASAMA;
}

export interface IseAlimGostergeleri { acik: number; onayBekleyen: number; surecte: number; haftalikGorusme: number; bekleyen: number; ortSure: number | null; kabulOrani: number | null }

export function iseAlimGostergeleri(
  pozisyonlar: readonly PozisyonKaydi[], adaylar: readonly AdayKaydi[], gs: readonly GorusmeKaydi[], bekleyen: number, bugun: string,
): IseAlimGostergeleri {
  const hafta = gunEkle(bugun, 7);
  const alinan = adaylar.filter((c) => c.asama === 'İşe alındı' && tarihMi(c.basvuruTarihi) && tarihMi(c.iseAlimTarihi));
  const kabul = adaylar.filter((c) => c.teklifYanit === 'Kabul etti').length;
  const ret = adaylar.filter((c) => c.teklifYanit === 'Reddetti').length;
  return {
    acik: pozisyonlar.filter((j) => j.durum === 'Açık').length,
    onayBekleyen: pozisyonlar.filter((j) => j.durum === 'Onay bekliyor').length,
    surecte: adaylar.filter(surecteMi).length,
    haftalikGorusme: gs.filter((i) => i.durum === 'Planlandı' && tarihMi(i.tarih) && i.tarih.slice(0, 10) >= bugun && i.tarih.slice(0, 10) <= hafta).length,
    bekleyen,
    ortSure: ortalama(alinan.map((c) => gunFarki(String(c.basvuruTarihi).slice(0, 10), String(c.iseAlimTarihi).slice(0, 10)))),
    kabulOrani: kabul + ret ? Math.round((kabul / (kabul + ret)) * 100) : null,
  };
}

// Karşılaştırma: kriter başına tamamlanan görüşmelerin ortalaması; her kriterde en yüksek (birden çok aday varsa) vurgulanır.
export function kriterPuani(gs: readonly GorusmeKaydi[], adayId: string, kriter: string): number | null {
  return ortalama(adayGorusmeleri(gs, adayId).filter(gorusmeTamamMi).map((i) => sayi(i.skorlar?.[kriter])).filter((x) => x > 0));
}

export function enYuksekler(degerler: readonly (number | null)[]): number | null {
  const v = degerler.filter((x): x is number => x !== null);
  return v.length > 1 ? Math.max(...v) : null;
}

// --- Pozisyon ---

export interface KanalYayini { durum?: string; tarih?: string; bitis?: string; link?: string; not?: string; kapanis?: string }
export interface PozisyonKaydi { id: string; baslik?: string; durum?: string; acilis?: string; sonBasvuru?: string; yayinlar?: Readonly<Record<string, KanalYayini | undefined>> }

export const POZISYON_DURUMLARI = ['Taslak', 'Onay bekliyor', 'Açık', 'Beklemede', 'Kapandı'] as const;

export interface DurumGecisi { hedef: string; etiket: string; birincil: boolean }

export const POZISYON_AKISI: Readonly<Record<string, readonly DurumGecisi[]>> = {
  Taslak: [{ hedef: 'Onay bekliyor', etiket: 'Onaya gönder', birincil: false }],
  'Onay bekliyor': [{ hedef: 'Açık', etiket: 'Onayla ve yayına hazırla', birincil: true }, { hedef: 'Taslak', etiket: 'Taslağa geri al', birincil: false }],
  Açık: [{ hedef: 'Beklemede', etiket: 'Durdur', birincil: false }, { hedef: 'Kapandı', etiket: 'Kapat', birincil: false }],
  Beklemede: [{ hedef: 'Açık', etiket: 'Yeniden aç', birincil: true }, { hedef: 'Kapandı', etiket: 'Kapat', birincil: false }],
  Kapandı: [{ hedef: 'Açık', etiket: 'Yeniden aç', birincil: false }],
};

export function pozisyonTonu(durum: string | undefined): Ton | null {
  if (durum === 'Açık') return 'ok';
  if (durum === 'Beklemede' || durum === 'Onay bekliyor') return 'warn';
  if (!durum || durum === 'Taslak') return 'info';
  return null;
}

export const pozisyonDurumMetni = (durum: string | undefined): string => (durum === 'Açık' ? 'Açık (yayında)' : durum || 'Taslak');

export function pozisyonSirala<J extends PozisyonKaydi>(js: readonly J[]): J[] {
  return [...js].sort((a, b) => (a.durum === 'Açık' ? 0 : 1) - (b.durum === 'Açık' ? 0 : 1) || (b.acilis ?? '').localeCompare(a.acilis ?? ''));
}

export function yayindakiKanallar(j: PozisyonKaydi): string[] {
  return Object.entries(j.yayinlar ?? {}).filter(([, y]) => y?.durum === 'Yayında').map(([k]) => k);
}

export function durumDegisimi<J extends PozisyonKaydi>(j: J, hedef: string, bugun: string): J {
  return { ...j, durum: hedef, ...(hedef === 'Açık' && !j.acilis ? { acilis: bugun } : {}) };
}

// Kanalda yayın işaretlenince taslak, onay bekleyen ya da beklemedeki pozisyon açılır.
export function yayinIsaretle<J extends PozisyonKaydi>(j: J, kanal: string, yayin: Omit<KanalYayini, 'durum'>, bugun: string): { kayit: J & Required<Pick<PozisyonKaydi, 'yayinlar'>>; acildi: boolean } {
  const yayinlar = { ...(j.yayinlar ?? {}), [kanal]: { durum: 'Yayında', not: '', link: '', ...yayin } };
  const acildi = ['Taslak', 'Onay bekliyor', 'Beklemede'].includes(j.durum ?? '');
  return { kayit: { ...j, yayinlar, ...(acildi ? { durum: 'Açık', acilis: j.acilis || bugun } : {}) }, acildi };
}

export function yayinKapat<J extends PozisyonKaydi>(j: J, kanal: string, bugun: string): J & Required<Pick<PozisyonKaydi, 'yayinlar'>> {
  return { ...j, yayinlar: { ...(j.yayinlar ?? {}), [kanal]: { ...(j.yayinlar?.[kanal] ?? {}), durum: 'Kapandı', kapanis: bugun } } };
}

export function kanalSuresiDoldu(y: KanalYayini | undefined, bugun: string): boolean {
  return y?.durum === 'Yayında' && tarihMi(y.bitis) && y.bitis.slice(0, 10) < bugun;
}

export function pozisyonKopyasi<J extends PozisyonKaydi & { ozelMetin?: unknown; ilanKodu?: string }>(
  j: J, yeniKimlik: string, ilanKodu: string, bugun: string,
): J {
  const { ozelMetin: _, ...kalan } = j;
  return {
    ...(kalan as J), id: yeniKimlik, durum: 'Taslak', yayinlar: {}, acilis: bugun, ilanKodu,
    sonBasvuru: gunEkle(bugun, 30), baslik: `${j.baslik ?? ''} (kopya)`,
  };
}

// Kaydedilmiş özel metinde ilan kodu ve başvuru bağlantısı kanala göre değişir.
export function kanalMetni(
  ozelMetin: string, ilanKodu: string, kanalKodu: string | undefined, basvuruAdresi: string | undefined, izlemeli: (adres: string) => string,
): string {
  let metin = ilanKodu ? ozelMetin.split(ilanKodu).join(ilanKodu + (kanalKodu ? `-${kanalKodu}` : '')) : ozelMetin;
  if (basvuruAdresi) metin = metin.split(basvuruAdresi).join(izlemeli(basvuruAdresi));
  return metin;
}

export function kaynakDagilimi(adaylar: readonly AdayKaydi[]): { kaynak: string; basvuru: number; alinan: number }[] {
  const m = new Map<string, { basvuru: number; alinan: number }>();
  for (const c of adaylar) {
    const k = c.kaynak || 'Belirtilmemiş';
    const v = m.get(k) ?? { basvuru: 0, alinan: 0 };
    v.basvuru += 1;
    if (c.asama === 'İşe alındı') v.alinan += 1;
    m.set(k, v);
  }
  return [...m].map(([kaynak, v]) => ({ kaynak, ...v })).sort((a, b) => b.basvuru - a.basvuru);
}

export function goreliGun(gun: string, bugun: string): string {
  const n = gunFarki(bugun, gun);
  if (n === 0) return 'Bugün';
  if (n === 1) return 'Yarın';
  if (n === -1) return 'Dün';
  return n > 0 ? `${n} gün sonra` : `${-n} gün önce`;
}

// Planlı görüşmeler güne göre gruplanır (tarih ve saat sırasıyla).
export function gunlereGore<G extends GorusmeKaydi>(gs: readonly G[]): { gun: string; gorusmeler: G[] }[] {
  const gruplar: { gun: string; gorusmeler: G[] }[] = [];
  for (const g of [...gs].sort((a, b) => anahtar(a).localeCompare(anahtar(b)))) {
    const gun = (g.tarih ?? '').slice(0, 10);
    const son = gruplar.at(-1);
    if (son && son.gun === gun) son.gorusmeler.push(g);
    else gruplar.push({ gun, gorusmeler: [g] });
  }
  return gruplar;
}

export function yaklasanGorusmeler<G extends GorusmeKaydi>(gs: readonly G[], adayVar: (id: string | undefined) => boolean, bugun: string): G[] {
  return gs.filter((i) => i.durum === 'Planlandı' && tarihMi(i.tarih) && i.tarih.slice(0, 10) >= bugun && adayVar(i.candId));
}

export function sonTamamlananlar<G extends GorusmeKaydi>(gs: readonly G[], adayVar: (id: string | undefined) => boolean, bugun: string, gunSayisi = 30): G[] {
  const sinir = gunEkle(bugun, -gunSayisi);
  return gs
    .filter((i) => gorusmeTamamMi(i) && tarihMi(i.tarih) && i.tarih.slice(0, 10) >= sinir && adayVar(i.candId))
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}
