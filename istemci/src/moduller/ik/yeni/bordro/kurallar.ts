import type { Donem } from '../motor.ts';
import type { Bordro, Departman, IkAyarlar, Kayit, Personel, Pozisyon, Aday } from '../tipler.ts';
import { bordroKimligi, type AySonucu, type BordroMotoru, type BordroSonucu, type GunBilgisi, type SanalPersonel } from './motor-yuzu.ts';

// Bordro, maliyet planı ve ayar ekranlarının saf kuralları (205 a). Vergi, prim ve tazminat hesabı burada yoktur: hepsi motorun
// sonucundan okunur; burada yalnız satır kurma, toplama, süzme ve ayar nesnesinin birleştirilmesi vardır.

export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;

export function ayParcala(ay: string): [number, number] {
  const [y, m] = ay.split('-').map(Number) as [number, number];
  return [y, m];
}
export const iki = (n: number): string => String(n).padStart(2, '0');
export const ayEtiketi = (ay: string): string => { const [y, m] = ayParcala(ay); return `${AY_ADLARI[m - 1] ?? ''} ${y}`; };
export const yuvarla = (v: number): number => Math.round(v * 100) / 100;
const sayi = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/* ---------------- bordro tablosu ---------------- */

export interface BordroSatiri { personel: Personel; sonuc: BordroSonucu; gunBilgisi: GunBilgisi }

// Ayda bordrosu olan kişiler: motorun sıralı listesi, o ay çalışanlar.
export function bordroSatirlari(m: BordroMotoru, ay: string): BordroSatiri[] {
  const [y, a] = ayParcala(ay);
  return m.sortedEmps().filter((e) => m.employedInMonth(e, y, a)).flatMap((e) => {
    const sonuc = m.payroll(e, ay);
    return sonuc ? [{ personel: e, sonuc, gunBilgisi: m.autoDaysInfo(e, y, a) }] : [];
  });
}

export interface BordroToplami { aylik: number; ek: number; mesai: number; yan: number; toplam: number; kesinti: number; gv: number; dv: number; banka: number; maliyet: number; tesvik: number }

export function bordroToplami(satirlar: readonly BordroSatiri[]): BordroToplami {
  const t: BordroToplami = { aylik: 0, ek: 0, mesai: 0, yan: 0, toplam: 0, kesinti: 0, gv: 0, dv: 0, banka: 0, maliyet: 0, tesvik: 0 };
  for (const { sonuc: r } of satirlar) {
    t.aylik += r.aylik; t.ek += r.ek; t.mesai += r.mesaiUcret; t.yan += r.yanTutar; t.toplam += r.toplam; t.kesinti += r.sgk + r.iss;
    t.gv += r.gv; t.dv += r.dv; t.banka += r.banka; t.maliyet += r.maliyet; t.tesvik += r.tInd;
  }
  return t;
}

export type BordroDurumu =
  | { tur: 'taslak-degisti' } | { tur: 'duzeltme' } | { tur: 'kesinlesti' } | { tur: 'kismen'; kesin: number; toplam: number } | { tur: 'taslak' };

export function kesinlesenSayisi(kayitlar: ReadonlyMap<string, Kayit>, satirlar: readonly BordroSatiri[], ay: string): number {
  return satirlar.filter((s) => (kayitlar.get(bordroKimligi(s.personel.id, ay)) as Bordro | undefined)?.snap !== undefined).length;
}

export function bordroDurumu(kesin: number, toplam: number, taslakVar: boolean, kilitAcik: boolean): BordroDurumu {
  if (taslakVar) return { tur: 'taslak-degisti' };
  if (kilitAcik) return { tur: 'duzeltme' };
  if (kesin > 0 && kesin === toplam) return { tur: 'kesinlesti' };
  if (kesin > 0) return { tur: 'kismen', kesin, toplam };
  return { tur: 'taslak' };
}

// Kesinleştirmeye giden kayıtlar: yalnız girdiler (hesap sunucuda; veri.ts bordroGirdisi).
export function kesinlestirmeKayitlari(satirlar: readonly BordroSatiri[], ay: string): Bordro[] {
  return satirlar.map(({ personel, sonuc }) => ({
    id: bordroKimligi(personel.id, ay), kind: 'pay', empId: personel.id, donem: ay,
    brut: sayi(sonuc.inp.brut), gun: sonuc.gun, ek: sayi(sonuc.inp.ek), mesaiSaat: sayi(sonuc.inp.mesaiSaat),
    tatilSaat: sayi(sonuc.inp.tatilSaat), kesinti: sayi(sonuc.inp.kesinti),
  }));
}

export type GirdiAlani = 'brut' | 'gun' | 'ek' | 'mesaiSaat' | 'tatilSaat' | 'kesinti';

// Hücre değişince taslak, o anki girdiden başlar (çerçevedeki gibi); boş hücre sıfırdır.
export function taslakGuncelle(
  taslak: Readonly<Record<string, BordroSonucu['inp']>>, personel: string, mevcut: BordroSonucu['inp'], alan: GirdiAlani, deger: string,
): Record<string, BordroSonucu['inp']> {
  const onceki = taslak[personel] ?? {
    brut: mevcut.brut, gun: mevcut.gun, ek: mevcut.ek, mesaiSaat: mevcut.mesaiSaat, tatilSaat: mevcut.tatilSaat, kesinti: mevcut.kesinti,
  };
  return { ...taslak, [personel]: { ...onceki, [alan]: deger === '' ? 0 : sayi(deger.replace(',', '.')) } };
}

// Kesinleşen bordroların onayı (IK-45): çalışan "Gördüm, onaylıyorum" dediyse kayıtta onay zamanı vardır.
export function onayDurumu(kayitlar: ReadonlyMap<string, Kayit>, satirlar: readonly BordroSatiri[], ay: string) {
  const kesin = satirlar
    .map((s) => kayitlar.get(bordroKimligi(s.personel.id, ay)) as Bordro | undefined)
    .filter((b): b is Bordro => b !== undefined && b.snap !== undefined);
  return { kesin, onaylayan: kesin.filter((b) => Boolean(b['gordum'])), onaylamayan: kesin.filter((b) => !b['gordum']) };
}

/* ---------------- dışa aktarma satırları ---------------- */

export type CsvHucresi = string | number | null;
export interface CsvTablosu { basliklar: string[]; satirlar: CsvHucresi[][] }

const kisaTarih = (v: string | undefined): string => {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

export function bordroListesi(satirlar: readonly BordroSatiri[], adSoyad: (e: Personel) => string, departmanAdi: (id: string | undefined) => string): CsvTablosu {
  return {
    basliklar: ['Çalışan', 'Sicil', 'Departman', 'Prim günü', 'Aylık brüt', 'Gün karşılığı brüt', 'Prim / ek ödeme', 'Fazla mesai', 'Yemek yardımı',
      'Yol yardımı', 'Toplam brüt', 'Prime esas kazanç', 'SGK işçi', 'İşsizlik işçi', 'Gelir vergisi matrahı', 'Gelir vergisi', 'Damga vergisi',
      'BES', 'Diğer kesinti', 'Net (yan haklar dahil)', 'Kart / ayni ödemeler', 'Bankaya ödenecek', 'SGK işveren (teşviksiz)', 'Teşvik',
      'Teşvik indirimi', 'SGK işveren', 'İşsizlik işveren', 'İşveren maliyeti'],
    satirlar: satirlar.map(({ personel: e, sonuc: r }) => [
      adSoyad(e), e.sicilNo ?? '', departmanAdi(e.departmanId), r.gun, r.aylik, r.brut, r.ek, r.mesaiUcret, r.yemek ? r.yemek.tutar : 0,
      r.yol ? r.yol.tutar : 0, r.toplam, r.sgkMatrah, r.sgk, r.iss, r.matrah, r.gv, r.dv, r.bes, r.kesinti, r.net, r.ayni, r.banka, r.isvBrut,
      r.tesvik ? r.tesvik.ad : '', r.tInd, r.isvSgk, r.isvIss, r.maliyet,
    ]),
  };
}

// Eksik gün nedeni (MUHSGK): 01 istirahat, 13 diğer (ücretsiz izin), 12 birden fazla neden.
export function eksikGunNedeni(gun: number, b: GunBilgisi): string {
  if (gun >= 30) return '';
  if (b.rapor && b.ucretsiz) return '12';
  if (b.rapor) return '01';
  if (b.ucretsiz) return '13';
  return '';
}

export function muhsgkListesi(satirlar: readonly BordroSatiri[], ay: string, cikisKodu: (k: string | undefined) => string): CsvTablosu {
  const buAy = (d: string | undefined): boolean => Boolean(d?.startsWith(ay));
  return {
    basliklar: ['T.C. kimlik no', 'Ad', 'Soyad', 'SGK sicil no', 'Belge türü', 'Kanun no', 'Prim günü', 'Eksik gün', 'Eksik gün nedeni',
      'Hak edilen ücret', 'Prim, ikramiye ve benzeri', 'Prime esas kazanç', 'İşe giriş', 'İşten çıkış', 'Çıkış nedeni kodu', 'GV matrahı',
      'Hesaplanan GV', 'Asgari ücret GV istisnası', 'Kesilecek GV', 'Hesaplanan DV', 'Asgari ücret DV istisnası', 'Kesilecek DV'],
    satirlar: satirlar.map(({ personel: e, sonuc: r, gunBilgisi }) => {
      const neden = eksikGunNedeni(r.gun, gunBilgisi);
      return [
        e.tckn ?? '', e.ad ?? '', e.soyad ?? '', e.sgkNo ?? '', '1', r.tesvik?.kanunNo ?? '', r.gun, r.gun < 30 && neden ? 30 - r.gun : '', neden,
        r.brut + r.mesaiUcret, r.ek, r.sgkMatrah, buAy(e.iseGiris) ? kisaTarih(e.iseGiris) : '', buAy(e.cikisTarihi) ? kisaTarih(e.cikisTarihi) : '',
        buAy(e.cikisTarihi) ? cikisKodu(e.cikisKodu) : '', r.matrah, r.gvHam, r.gvIst, r.gv, r.dvHam, r.dvIst, r.dv,
      ];
    }),
  };
}

export interface HesapKodlari { hesapGider?: unknown; hesapPersonel?: unknown; hesapVergi?: unknown; hesapSgk?: unknown; hesapDiger?: unknown }

// Muhasebe fişi: gider ve işveren payı departmanın gider hesabına borç, net/vergi/SGK/diğer alacak; son satır dengeyi söyler.
export function muhasebeFisi(
  satirlar: readonly BordroSatiri[], ay: string, kodlar: HesapKodlari, departman: (id: string | undefined) => Departman | null,
): CsvTablosu {
  const etiket = ayEtiketi(ay);
  const hesaplar = new Map<string, { brut: number; isv: number; adlar: Set<string> }>();
  const T = { net: 0, gv: 0, dv: 0, sgk: 0, iss: 0, isvSgk: 0, isvIss: 0, bes: 0, kes: 0 };
  for (const { personel: e, sonuc: r } of satirlar) {
    const d = departman(e.departmanId);
    const kod = String(d?.giderHesabi || kodlar.hesapGider || '');
    const a = hesaplar.get(kod) ?? { brut: 0, isv: 0, adlar: new Set<string>() };
    a.brut += r.toplam; a.isv += r.isvSgk + r.isvIss;
    if (d?.ad) a.adlar.add(d.ad);
    hesaplar.set(kod, a);
    T.net += r.net; T.gv += r.gv; T.dv += r.dv; T.sgk += r.sgk; T.iss += r.iss; T.isvSgk += r.isvSgk; T.isvIss += r.isvIss; T.bes += r.bes; T.kes += r.kesinti;
  }
  const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  const satir: [string, string, string, number | '', number | ''][] = [];
  for (const [kod, a] of hesaplar) {
    const ds = [...a.adlar].join(', ');
    const ek = ds ? ` (${ds})` : '';
    satir.push([kod, 'Ücret giderleri', `${etiket} brüt ücret, prim ve yan haklar${ek}`, yuvarla(a.brut), '']);
    satir.push([kod, 'SGK işveren payları', `${etiket} SGK ve işsizlik işveren payı, teşvik sonrası${ek}`, yuvarla(a.isv), '']);
  }
  satir.push([s(kodlar.hesapPersonel), 'Personele borçlar', `${etiket} net ücretler`, '', yuvarla(T.net)]);
  satir.push([s(kodlar.hesapVergi), 'Ödenecek vergi ve fonlar', `${etiket} gelir vergisi kesintisi`, '', yuvarla(T.gv)]);
  satir.push([s(kodlar.hesapVergi), 'Ödenecek vergi ve fonlar', `${etiket} damga vergisi kesintisi`, '', yuvarla(T.dv)]);
  satir.push([s(kodlar.hesapSgk), 'Ödenecek sosyal güvenlik kesintileri', `${etiket} SGK ve işsizlik işçi payı`, '', yuvarla(T.sgk + T.iss)]);
  satir.push([s(kodlar.hesapSgk), 'Ödenecek sosyal güvenlik kesintileri', `${etiket} SGK ve işsizlik işveren payı`, '', yuvarla(T.isvSgk + T.isvIss)]);
  if (T.bes) satir.push([s(kodlar.hesapDiger), 'Ödenecek diğer yükümlülükler', `${etiket} BES kesintisi`, '', yuvarla(T.bes)]);
  if (T.kes) satir.push([s(kodlar.hesapDiger), 'Ödenecek diğer yükümlülükler', `${etiket} diğer kesintiler (avans, icra vb.)`, '', yuvarla(T.kes)]);
  const borc = satir.reduce((x, r) => x + (r[3] || 0), 0);
  const alacak = satir.reduce((x, r) => x + (r[4] || 0), 0);
  return {
    basliklar: ['Hesap kodu', 'Hesap adı', 'Açıklama', 'Borç', 'Alacak'],
    satirlar: [...satir, ['', 'TOPLAM', Math.abs(borc - alacak) < 0.05 ? 'Fiş dengeli' : 'Fark var, kontrol edin', yuvarla(borc), yuvarla(alacak)]],
  };
}

/* ---------------- toplu ücret güncelleme ---------------- */

export type ZamYontemi = 'yuzde' | 'sabit' | 'min';
export interface ZamSecimi { tarih: string; departman: string; yaka: string; yontem: ZamYontemi; deger: number; yuvarlama: number }
export interface ZamSatiri { personel: Personel; mevcut: number; yeni: number }

export function zamPlani(
  personeller: readonly Personel[], s: ZamSecimi, ucret: (e: Personel, tarih: string) => number, yakasi: (e: Personel) => string,
): ZamSatiri[] {
  const yuvar = (x: number): number => (s.yuvarlama ? Math.ceil(x / s.yuvarlama) * s.yuvarlama : yuvarla(x));
  return personeller
    .filter((e) => (!s.departman || e.departmanId === s.departman) && (!s.yaka || yakasi(e) === s.yaka))
    .map((e) => {
      const mevcut = ucret(e, s.tarih);
      const yeni = s.yontem === 'yuzde' ? yuvar(mevcut * (1 + s.deger / 100)) : s.yontem === 'sabit' ? yuvar(mevcut + s.deger) : Math.max(mevcut, s.deger);
      return { personel: e, mevcut, yeni };
    })
    .filter((x) => x.yeni !== x.mevcut);
}

// Ücret geçmişine yeni satır (aynı tarihli satırın yerine); bugünkü brüt, motorun ücret kuralıyla yeniden okunur.
export function zamUygula(
  e: Personel, tarih: string, brut: number, neden: string, not: string, gecmis: (e: Personel) => { tarih: string; brut: number }[],
  ucret: (e: Personel, tarih: string) => number, bugun: string,
): Personel {
  let h = gecmis(e) as NonNullable<Personel['ucretGecmisi']>;
  if (!h.length) h = [{ tarih: e.iseGiris || '2000-01-01', brut: sayi(e.brutMaas), neden: 'İşe giriş' }];
  h = h.filter((x) => x.tarih !== tarih);
  h.push({ tarih, brut: yuvarla(brut), neden, ...(not ? { not } : {}) });
  h.sort((a, b) => a.tarih.localeCompare(b.tarih));
  const n: Personel = { ...e, ucretGecmisi: h };
  return { ...n, brutMaas: ucret(n, bugun) };
}

/* ---------------- maliyet planı ---------------- */

export interface PlanKadrosu { pozisyon?: string; departmanId?: string; brut?: number; ay?: number; adet?: number }
export interface MaliyetPlani { yil: number; zam1: number; zam2: number; acik: boolean; ekler: PlanKadrosu[] }

export function planDurumu(kayitli: unknown, bugun: string): MaliyetPlani {
  const sv = (kayitli && typeof kayitli === 'object' ? kayitli : {}) as Partial<MaliyetPlani>;
  const [y, m] = ayParcala(bugun.slice(0, 7));
  return {
    yil: sayi(sv.yil) || (m >= 9 ? y + 1 : y), zam1: sv.zam1 ?? 25, zam2: sv.zam2 ?? 10, acik: sv.acik ?? true,
    ekler: Array.isArray(sv.ekler) ? sv.ekler.map((k) => ({ ...k })) : [],
  };
}

export type PlanTuru = 'mevcut' | 'acik' | 'plan';
export interface PlanKisisi { e: Personel | SanalPersonel; tur: PlanTuru; departman: string }

const gunu = (v: string | undefined): string => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

export function departmanOrtalamasi(m: BordroMotoru, departman: string | undefined): number {
  const xs = m.activeEmps().filter((e) => e.departmanId === departman).map((e) => m.curBrut(e)).filter(Boolean);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : m.P('asgariBrut');
}

export function planKisileri(
  m: BordroMotoru, p: MaliyetPlani, personeller: readonly Personel[], pozisyonlar: readonly Pozisyon[], adaylar: readonly Aday[], bugun: string,
): PlanKisisi[] {
  const Y = p.yil;
  const out: PlanKisisi[] = personeller
    .filter((e) => !gunu(e.cikisTarihi) || gunu(e.cikisTarihi) >= `${Y}-01-01`)
    .filter((e) => !gunu(e.iseGiris) || gunu(e.iseGiris) <= `${Y}-12-31`)
    .map((e) => ({ e, tur: 'mevcut', departman: e.departmanId ?? '' }));
  const [by, bm] = ayParcala(bugun.slice(0, 7));
  const baslangic = Y > by ? 1 : Math.min(12, bm + 1);
  if (p.acik) {
    for (const j of pozisyonlar.filter((x) => x.durum === 'Açık' || x.durum === 'Onay bekliyor')) {
      const kalan = Math.max(0, (sayi(j.adet) || 1) - adaylar.filter((c) => c.jobId === j.id && c.asama === 'İşe alındı').length);
      const min = sayi(j.ucretMin); const max = sayi(j.ucretMax);
      const brut = min && max ? (min + max) / 2 : min || max || departmanOrtalamasi(m, j.departmanId);
      for (let i = 0; i < kalan; i++) {
        out.push({
          e: { id: `_j${j.id}_${i}`, kind: 'emp', ad: j.baslik ?? '', soyad: '(açık pozisyon)', iseGiris: `${Y}-${iki(baslangic)}-01`, brutMaas: brut, departmanId: j.departmanId ?? '', pozisyon: j.baslik ?? '' },
          tur: 'acik', departman: j.departmanId ?? '',
        });
      }
    }
  }
  p.ekler.forEach((h, k) => {
    for (let i = 0; i < Math.max(1, sayi(h.adet) || 1); i++) {
      out.push({
        e: { id: `_h${k}_${i}`, kind: 'emp', ad: h.pozisyon || 'Yeni kadro', soyad: '(plan)', iseGiris: `${Y}-${iki(Math.min(12, Math.max(1, sayi(h.ay) || 1)))}-01`, brutMaas: sayi(h.brut), departmanId: h.departmanId || '', pozisyon: h.pozisyon || '' },
        tur: 'plan', departman: h.departmanId || '',
      });
    }
  });
  return out;
}

export interface PlanAyi { maliyet: number; toplam: number; net: number; brut: number }
export interface PlanSatiri extends PlanKisisi { aylar: (PlanAyi | null)[]; yil: number; brutYil: number }

// Her kişi için 12 ay: girdiyi motor kurar, zam katsayısı uygulanır (asgari ücretin altına inmez), ayın hesabı motorundur.
export function planHesapla(m: BordroMotoru, p: MaliyetPlani, kisiler: readonly PlanKisisi[]): PlanSatiri[] {
  const Y = p.yil; const f1 = 1 + sayi(p.zam1) / 100; const f2 = 1 + sayi(p.zam2) / 100;
  return kisiler.map((x) => {
    const aylar: (PlanAyi | null)[] = [];
    let cum = 0; let aCum = 0;
    const g = gunu(x.e.iseGiris);
    for (let ay = 1; ay <= 12; ay++) {
      const r = m.withPeriod(`${Y}-${iki(ay)}-01`, () => {
        const inp = m.payInputs(x.e, Y, ay);
        if (!inp) return null;
        let k = 1;
        if (x.tur === 'mevcut' && (!g || g < `${Y}-01-01`)) k *= f1;
        if (ay >= 7 && (!g || g < `${Y}-07-01`)) k *= f2;
        const girdi = { ...inp, brut: Math.max(Math.round(sayi(inp.brut) * k), m.P('asgariBrut')), ek: sayi(inp.ek) * k };
        const res = m.calcMonth(girdi, cum, ay, aCum);
        cum += res.matrah; aCum += res.aMat;
        return res;
      });
      aylar.push(r ? { maliyet: r.maliyet, toplam: r.toplam, net: r.net, brut: r.brut } : null);
    }
    return { ...x, aylar, yil: aylar.reduce((a, r) => a + (r ? r.maliyet : 0), 0), brutYil: aylar.reduce((a, r) => a + (r ? r.toplam : 0), 0) };
  });
}

export interface DepartmanPlani { departman: string; kisi: number; yeni: number; brut: number; maliyet: number }
export function departmanPlani(satirlar: readonly PlanSatiri[]): DepartmanPlani[] {
  return [...new Set(satirlar.map((r) => r.departman))].map((d) => {
    const rs = satirlar.filter((r) => r.departman === d);
    return { departman: d, kisi: rs.filter((r) => r.aylar[11]).length, yeni: rs.filter((r) => r.tur !== 'mevcut').length, brut: rs.reduce((a, r) => a + r.brutYil, 0), maliyet: rs.reduce((a, r) => a + r.yil, 0) };
  }).sort((a, b) => b.maliyet - a.maliyet);
}

export const aylikMaliyet = (satirlar: readonly PlanSatiri[]): number[] =>
  Array.from({ length: 12 }, (_, i) => satirlar.reduce((a, r) => a + (r.aylar[i]?.maliyet ?? 0), 0));

// Plan yılından önceki yılın gerçekleşen maliyeti (plan yılı gelecekteyse karşılaştırma için).
export function buYilMaliyeti(m: BordroMotoru, personeller: readonly Personel[], yil: number): number {
  let t = 0;
  for (const e of personeller) for (let ay = 1; ay <= 12; ay++) t += m.payroll(e, `${yil}-${iki(ay)}`)?.maliyet ?? 0;
  return t;
}

export interface Yukumluluk { personel: Personel; kidem: number; ihbar: number; izin: number; gun: number }

// Bugün işveren çıkarsaydı: kıdem (1 yıl şartıyla), ihbar ve kullanılmamış izin ücreti; tutarlar motorun tazminat hesabından.
export function yukumlulukler(m: BordroMotoru, bugun: string, cikisKodu: string): Yukumluluk[] {
  const an = new Date(`${bugun}T00:00:00`);
  return m.activeEmps().flatMap((e) => {
    if (!m.curBrut(e)) return [];
    const izinGun = Math.max(0, m.leaveBalance(e, an).kalan);
    const r = m.severance({
      giris: e.iseGiris ?? '', cikis: bugun, brut: m.salaryAt(e, bugun), yanHak: Math.round(sayi(e.yanHakTutar) + m.benefitMonthly(e) + m.primMonthlyKidem(e)),
      kod: cikisKodu, izinGun, cum: '',
    });
    return r ? [{ personel: e, kidem: r.yearOk ? r.kBrut : 0, ihbar: r.nBrut, izin: r.izBrut, gun: izinGun }] : [];
  });
}

export function planCsv(satirlar: readonly PlanSatiri[], adSoyad: (e: Personel | SanalPersonel) => string, departmanAdi: (id: string) => string): CsvTablosu {
  const DURUM: Record<PlanTuru, string> = { mevcut: 'Mevcut', acik: 'Açık pozisyon', plan: 'Planlanan' };
  return {
    basliklar: ['Ad soyad', 'Durum', 'Departman', ...AY_ADLARI.map((a) => `${a} maliyet`), 'Yıllık maliyet', 'Yıllık toplam brüt'],
    satirlar: satirlar.map((r) => [adSoyad(r.e), DURUM[r.tur], r.departman ? departmanAdi(r.departman) : '', ...r.aylar.map((c) => (c ? c.maliyet : 0)), r.yil, r.brutYil]),
  };
}

// "3 yıl 2 ay" (iki tarih arası, takvim yılı ve ayıyla).
export function sureMetni(baslangic: string | undefined, bitis: string): string {
  const a = gunu(baslangic);
  if (!a) return '';
  const [y1, m1, d1] = a.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = bitis.split('-').map(Number) as [number, number, number];
  let ay = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (ay < 0) ay = 0;
  const yil = Math.floor(ay / 12); const kalan = ay % 12;
  return [yil ? `${yil} yıl` : '', kalan ? `${kalan} ay` : '', !yil && !kalan ? '1 aydan az' : ''].filter(Boolean).join(' ');
}

/* ---------------- parametre dönemleri ---------------- */

// Yeni dönem en erken bu ayın başında, kesinleşmiş son bordronun ertesi ayından önce açılamaz (geçmiş hesap bozulmasın).
export function enErkenDonem(bugun: string, bordrolar: readonly Bordro[]): string {
  let min = `${bugun.slice(0, 7)}-01`;
  const son = bordrolar.filter((r) => r.snap && r.donem).map((r) => String(r.donem)).sort().pop();
  if (son) {
    const [y, m] = ayParcala(son);
    const ertesi = m === 12 ? `${y + 1}-01-01` : `${y}-${iki(m + 1)}-01`;
    if (ertesi > min) min = ertesi;
  }
  return min;
}

export function sonrakiAyBasi(bugun: string): string {
  const [y, m] = ayParcala(bugun.slice(0, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${iki(m + 1)}-01`;
}

export type YeniDonemSonucu = { tamam: true; donemler: Donem[]; donem: Donem; ayBasinaCekildi: boolean } | { tamam: false; hata: string };

export function yeniDonem(
  donemler: readonly Donem[], g: { ad: string; baslangic: string; kaynak: string; not: string }, enErken: string, kimlik: string,
): YeniDonemSonucu {
  if (!g.baslangic) return { tamam: false, hata: 'Başlangıç tarihi girin.' };
  const bas = g.baslangic.endsWith('-01') ? g.baslangic : `${g.baslangic.slice(0, 8)}01`;
  if (bas < enErken) return { tamam: false, hata: 'Dönem bu tarihten önce başlayamaz; geçmişe dönük dönem açılamaz.' };
  if (donemler.some((p) => p.baslangic === bas)) return { tamam: false, hata: 'Bu tarihte başlayan bir dönem zaten var.' };
  const kaynak = donemler.find((p) => p.id === g.kaynak) ?? donemler[donemler.length - 1];
  const donem: Donem = { id: kimlik, ad: g.ad.trim() || 'Yeni dönem', baslangic: bas, not: g.not.trim(), params: structuredClone(kaynak?.params ?? {}) };
  return { tamam: true, donemler: [...donemler.map((p) => structuredClone(p)), donem], donem, ayBasinaCekildi: bas !== g.baslangic };
}

export interface IceAktarmaSonucu { donemler: Donem[]; eklenen: string[]; atlanan: string[] }

// Kapalı ağ kurulumu için JSON'dan dönem: geçersiz, aynı tarihli ve geçmişe dönük olan atlanır; mevcut dönem değişmez.
export function donemIceAktar(
  veri: unknown, mevcut: readonly Donem[], enErken: string, parametreSec: (p: Record<string, unknown>) => Record<string, unknown>, kimlik: () => string,
): IceAktarmaSonucu | null {
  const liste = Array.isArray(veri) ? veri : veri && typeof veri === 'object' && Array.isArray((veri as { donemler?: unknown }).donemler) ? (veri as { donemler: unknown[] }).donemler : null;
  if (!liste) return null;
  const donemler = mevcut.map((p) => structuredClone(p));
  const eklenen: string[] = []; const atlanan: string[] = [];
  for (const ham of liste) {
    const p = (ham && typeof ham === 'object' ? ham : {}) as { ad?: unknown; baslangic?: unknown; not?: unknown; params?: unknown };
    const bas = String(p.baslangic ?? '');
    const ad = p.ad === undefined ? '' : String(p.ad);
    if (!/^\d{4}-\d{2}-01$/.test(bas) || !p.params || typeof p.params !== 'object') { atlanan.push(`${ad || '?'}: geçersiz`); continue; }
    if (donemler.some((x) => x.baslangic === bas)) { atlanan.push(`${ad || bas}: bu tarihte dönem var`); continue; }
    if (bas < enErken) { atlanan.push(`${ad || bas}: geçmişe dönük`); continue; }
    const yeni: Donem = { id: kimlik(), ad: ad || `Dönem ${bas}`, baslangic: bas, not: p.not === undefined ? '' : String(p.not), params: parametreSec(p.params as Record<string, unknown>) };
    donemler.push(yeni); eklenen.push(yeni.ad);
  }
  return { donemler, eklenen, atlanan };
}

export function donemBordroAyi(d: Donem, bitis: string | null, bordrolar: readonly Bordro[]): number {
  return new Set(bordrolar.filter((r) => r.snap && r.donem && `${r.donem}-01` >= d.baslangic && (!bitis || `${r.donem}-01` <= bitis)).map((r) => r.donem)).size;
}

/* ---------------- ayarlar ---------------- */

export type AyarTaslagi = Readonly<Record<string, unknown>>;

// Taslaktaki dönem parametreleri seçili dönemin params'ına, öbürleri genel ayara yazılır. Dönem listesi hiç kaydedilmemişse
// motorun varsayılan dönemleri ilk kayıtta yazılır (çerçevedeki gibi).
export function ayarlariBirlestir(
  ayarlar: IkAyarlar, taslak: AyarTaslagi, donemAnahtarlari: readonly string[], donemler: readonly Donem[], seciliDonem: string,
): IkAyarlar {
  const ust: IkAyarlar = { ...ayarlar };
  const donemli: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(taslak)) (donemAnahtarlari.includes(k) ? donemli : ust)[k] = v;
  if (Object.keys(donemli).length) {
    ust['donemler'] = donemler.map((p) => (p.id === seciliDonem ? { ...structuredClone(p), params: { ...structuredClone(p.params), ...structuredClone(donemli) } } : structuredClone(p)));
  } else if (!Array.isArray(ayarlar['donemler']) || !(ayarlar['donemler'] as unknown[]).length) {
    ust['donemler'] = donemler.map((p) => structuredClone(p));
  }
  return ust;
}

export const taslakDonemliMi = (taslak: AyarTaslagi, donemAnahtarlari: readonly string[]): boolean =>
  Object.keys(taslak).some((k) => donemAnahtarlari.includes(k));

// Kayıtlı tarifenin özeti: dilim, oran, dilim sonuna kadar toplam vergi (son dilimde yok).
export function dilimOzeti(dilimler: readonly (readonly [number, number])[]): { alt: number; ust: number | null; oran: number; birikmis: number | null }[] {
  let onceki = 0; let toplam = 0;
  return dilimler.map(([sinir, oran]) => {
    const ust = sinir === Infinity ? null : sinir;
    const vergi = ust === null ? null : (ust - onceki) * oran / 100;
    const satir = { alt: onceki, ust, oran, birikmis: vergi === null ? null : toplam + vergi };
    if (vergi !== null && ust !== null) { toplam += vergi; onceki = ust; }
    return satir;
  });
}

export type ListeSatiri = Record<string, unknown>;
export const listeyeEkle = (liste: readonly ListeSatiri[], satir: ListeSatiri): ListeSatiri[] => [...liste, satir];
export const listedenSil = (liste: readonly ListeSatiri[], sira: number): ListeSatiri[] => liste.filter((_, i) => i !== sira);
export const listeDegistir = (liste: readonly ListeSatiri[], sira: number, alan: string, deger: unknown): ListeSatiri[] =>
  liste.map((s, i) => (i === sira ? { ...s, [alan]: deger } : s));

// Ay ayın tabloda gösterimi için ayrıntı: 12 ay satırı ve yıl toplamı.
export function yilToplami(aylar: readonly AySonucu[]) {
  return {
    brut: aylar.reduce((a, r) => a + r.brut, 0), kesinti: aylar.reduce((a, r) => a + r.sgk + r.iss, 0), gv: aylar.reduce((a, r) => a + r.gv, 0),
    dv: aylar.reduce((a, r) => a + r.dv, 0), net: aylar.reduce((a, r) => a + r.net, 0), maliyet: aylar.reduce((a, r) => a + r.maliyet, 0),
  };
}

/* ---------------- hesaplayıcılar ---------------- */

export type HesapDegerleri = Readonly<Record<string, string>>;

export function hesapVarsayilanlari(bugun: string, cikisKodu: string): Record<string, string> {
  return {
    brut: '50000', ay: '1', net: '40000', giris: '2019-03-01', cikis: bugun, kbrut: '60000', yanHak: '4500', kod: cikisKodu, izinGun: '6', cum: '',
    iGiris: '2015-06-15', iDogum: '1975-04-10', iTarih: bugun, mBrut: '50000', mSaat: '12', fsSaat: '0', htSaat: '0', ubgtGun: '0',
  };
}

// Personel seçilince tazminat, izin ve mesai hesaplayıcısının alanları kişinin kaydından ve motorun ücret kuralından dolar.
export function hesapOnDoldur(m: BordroMotoru, e: Personel, bugun: string): Record<string, string> {
  const bitis = gunu(e.cikisTarihi) || bugun;
  const an = new Date(`${bitis}T00:00:00`);
  return {
    emp: e.id, giris: e.iseGiris ?? '', cikis: bitis, kbrut: String(m.salaryAt(e, bitis)),
    yanHak: String(Math.round(sayi(e.yanHakTutar) + m.benefitMonthly(e) + m.primMonthlyKidem(e))), kod: e.cikisKodu ?? '',
    izinGun: String(Math.max(0, m.leaveBalance(e, an).kalan)), cum: '', iGiris: e.iseGiris ?? '', iDogum: e.dogumTarihi ?? '',
    mBrut: String(m.curBrut(e)), brut: String(m.curBrut(e)),
  };
}

export const hesapSayisi = (v: string | undefined): number => sayi(String(v ?? '').replace(',', '.'));

// Fazla mesai hesaplayıcısı (çerçevede ekranın kendi hesabıydı, motorda yok): saatlik ücret aylık brüt / aylık saat, katsayılar
// dönem parametresi; parametre boşsa kanuni varsayılan.
export interface MesaiUcreti { saatlik: number; gunluk: number; fazla: number; fazlaSure: number; haftaTatili: number; resmiTatil: number; toplam: number }
export function mesaiUcreti(P: (k: string) => number, brut: number, saat: { mSaat: number; fsSaat: number; htSaat: number; ubgtGun: number }): MesaiUcreti {
  const p = (k: string, v: number): number => P(k) || v;
  const saatlik = brut / p('aylikSaat', 225); const gunluk = brut / 30;
  const fazla = saat.mSaat * saatlik * p('mesaiCarpan', 1.5); const fazlaSure = saat.fsSaat * saatlik * p('fazlaSurelerCarpan', 1.25);
  const haftaTatili = saat.htSaat * saatlik * p('haftaTatiliCarpan', 1.5); const resmiTatil = saat.ubgtGun * gunluk * p('ubgtCarpan', 1);
  return { saatlik, gunluk, fazla, fazlaSure, haftaTatili, resmiTatil, toplam: fazla + fazlaSure + haftaTatili + resmiTatil };
}
