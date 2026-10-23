import type { IkPuantajCevabi, IkPuantajKaydi, PuantajDurumu } from '#paylasilan/sozlesme/ik.ts';
import type { Bordro, Devam, Egitim, Izin, Performans, Personel } from '../tipler.ts';

// IK İşlemlerim ekranlarının saf hesapları. Tarih 'GGGG-AA-GG' metnidir; karşılaştırma metin sırasıyla yapılır.
// Kaynak: ik-modulu app.js (viewMe, viewMyLeaves, viewMyPays, viewApprovals, viewTeam, viewTeamMember, viewTeamCal)
// ve v3 yamasındaki Mesailerim; davranış bugünkü paketle aynıdır.

export const IZIN_ONAYLI = 'Onaylandı';
export const IZIN_BEKLIYOR = 'Beklemede';
export const IZIN_RED = 'Reddedildi';
export const IZIN_IPTAL = 'İptal';
export const YILLIK_IZIN = 'Yıllık izin';
export const RAPOR_IZNI = 'Hastalık / rapor';

// Bordroya fazla mesai olarak giren devam türleri ve resmi tatil çalışması (v3 TmiMesailerim).
export const FAZLA_MESAI_TURLERI = ['Fazla mesai', 'Hafta tatili çalışması'] as const;
export const RESMI_TATIL_TURU = 'Resmi tatil çalışması';
export const DEVAMSIZLIK_TURU = 'Devamsızlık';
// 4857 sayılı İş Kanunu md. 41; ayarlarda `yillikMesaiLimit` yoksa.
export const VARSAYILAN_YILLIK_MESAI_SINIRI = 270;

export function sayi(v: unknown): number {
  const n = Number.parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Ekranda sayı Türkçe yazılır ("1,5"); veri yoksa çağıran "—" yazar.
export function sayiMetni(n: number): string {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

// Kayıtta gün sayısı yoksa sıfır uydurulmaz.
export function izinGunuMetni(gun: unknown): string {
  const n = Number.parseFloat(String(gun ?? '').replace(',', '.'));
  return Number.isFinite(n) ? `${sayiMetni(n)} gün` : '— gün';
}

export function gunMetni(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function metindenGun(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function gunEkle(s: string, n: number): string {
  const d = metindenGun(s);
  if (!d) return s;
  d.setDate(d.getDate() + n);
  return gunMetni(d);
}

// Bugün çalışan: işe girmiş, çıkış tarihi geçmemiş ve "Ayrıldı" değil (engine isActive).
export function calisiyorMu(p: Personel, bugun: string): boolean {
  if (p.iseGiris && p.iseGiris.slice(0, 10) > bugun) return false;
  const cikis = p.cikisTarihi?.slice(0, 10);
  if (cikis && cikis < bugun) return false;
  if (p.durum === 'Ayrıldı' && (!cikis || cikis < bugun)) return false;
  return true;
}

// "3 yıl 2 ay"; yıl ve ay yoksa gün (format.js durationText).
export function sureMetni(bas: string | null | undefined, bit: string): string | null {
  const a = metindenGun(bas);
  const b = metindenGun(bit);
  if (!a || !b || b < a) return null;
  const ayEkle = (d: Date, n: number) => {
    const x = new Date(d);
    const gun = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + n);
    x.setDate(Math.min(gun, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
    return x;
  };
  let yil = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) yil--;
  let c = ayEkle(a, 12 * yil);
  let ay = 0;
  while (ayEkle(c, 1) <= b) { c = ayEkle(c, 1); ay++; }
  const gun = Math.round((b.getTime() - c.getTime()) / 864e5);
  const parca: string[] = [];
  if (yil) parca.push(`${yil} yıl`);
  if (ay) parca.push(`${ay} ay`);
  if (!yil && !ay) parca.push(`${gun} gün`);
  return parca.join(' ');
}

export function kisininIzinleri(izinler: readonly Izin[], personel: string): Izin[] {
  return izinler.filter((l) => l.empId === personel).sort((a, b) => (b.baslangic ?? '').localeCompare(a.baslangic ?? ''));
}

const kapsar = (l: Izin, gun: string) => (l.baslangic ?? '') <= gun && (l.bitis ?? l.baslangic ?? '') >= gun;

export function bugunIzinde(izinler: readonly Izin[], personel: string, bugun: string): Izin | null {
  return izinler.find((l) => l.empId === personel && l.durum === IZIN_ONAYLI && kapsar(l, bugun)) ?? null;
}

export function sonrakiIzin(izinler: readonly Izin[], personel: string, bugun: string): Izin | null {
  return izinler
    .filter((l) => l.empId === personel && l.durum === IZIN_ONAYLI && (l.baslangic ?? '') > bugun)
    .sort((a, b) => (a.baslangic ?? '').localeCompare(b.baslangic ?? ''))[0] ?? null;
}

export function denemede(p: Personel, bugun: string): boolean {
  return !!p.denemeBitis && p.denemeBitis.slice(0, 10) >= bugun;
}

/* ---------- İzin talebi ---------- */

export interface TalepDenetimi {
  // Bitiş başlangıçtan önce: süre gösterilmez, talep gönderilmez.
  ters: boolean;
  // Aynı kişinin onaylı ya da bekleyen izniyle çakışan kayıtlar.
  cakisan: Izin[];
}

export function talepDenetimi(kendiIzinleri: readonly Izin[], baslangic: string, bitis: string): TalepDenetimi {
  if (!baslangic || !bitis || bitis < baslangic) return { ters: true, cakisan: [] };
  const cakisan = kendiIzinleri.filter((l) => (l.durum === IZIN_ONAYLI || l.durum === IZIN_BEKLIYOR)
    && (l.baslangic ?? '') <= bitis && (l.bitis ?? l.baslangic ?? '') >= baslangic);
  return { ters: false, cakisan };
}

// İş günüyle sayılmayan izinde takvim günü (countDays workOnly=false).
export function takvimGunu(baslangic: string, bitis: string): number {
  const a = metindenGun(baslangic);
  const b = metindenGun(bitis);
  if (!a || !b || b < a) return 0;
  return Math.round((b.getTime() - a.getTime()) / 864e5) + 1;
}

/* ---------- Bordrolarım ---------- */

// Yalnız kesinleşmiş (sunucunun hesabı `snap` olan) aylar, yeniden eskiye.
export function kesinBordrolar(bordrolar: readonly Bordro[], personel: string): Bordro[] {
  return bordrolar.filter((r) => r.empId === personel && !!r.snap && !!r.donem).sort((a, b) => (b.donem ?? '').localeCompare(a.donem ?? ''));
}

export function bordroYillari(bordrolar: readonly Bordro[]): string[] {
  return [...new Set(bordrolar.map((r) => (r.donem ?? '').slice(0, 4)))];
}

// Bordronun tutarı kaydın kendisinde yoksa kesinleşmiş hesaptan.
export function bordroAlani(r: Bordro, alan: string): number {
  const kendi = (r as unknown as Record<string, unknown>)[alan];
  return sayi(kendi !== undefined ? kendi : (r.snap ?? {})[alan]);
}

// Çalışanın "Gördüm, onaylıyorum" zamanı (IK-43); yeniden kesinleşen bordroda sunucu siler.
export function bordroOnayi(r: Bordro): string | null {
  const g = r['gordum'];
  return typeof g === 'string' && g !== '' ? g : null;
}

export interface YilToplami { toplam: number; sgkIss: number; gvDv: number; net: number }

export function yilToplami(bordrolar: readonly Bordro[]): YilToplami {
  const top = (alan: string) => bordrolar.reduce((t, r) => t + bordroAlani(r, alan), 0);
  return { toplam: top('toplam'), sgkIss: top('sgk') + top('iss'), gvDv: top('gv') + top('dv'), net: top('net') };
}

/* ---------- Mesailerim ---------- */

export interface MesaiOzeti {
  kayitlar: Devam[];
  fazla: number;
  resmiTatil: number;
  // Aynı güne iki devamsızlık kaydı bir gün sayılır (borç 195).
  devamsizGun: number;
  yil: string;
  yilFazla: number;
  sinir: number;
  kalan: number;
  ton: 'normal' | 'uyari' | 'hata';
}

export function mesaiOzeti(devamlar: readonly Devam[], personel: string, ay: string, sinirAyari: unknown): MesaiOzeti {
  const sinir = sayi(sinirAyari) || VARSAYILAN_YILLIK_MESAI_SINIRI;
  const yil = ay.slice(0, 4);
  const kisinin = devamlar.filter((d) => d.empId === personel);
  const kayitlar = kisinin.filter((d) => (d.tarih ?? '').startsWith(ay)).sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
  const saat = (turler: readonly string[]) => kayitlar.filter((d) => turler.includes(d.tur ?? '')).reduce((t, d) => t + sayi(d.saat), 0);
  const yilFazla = kisinin
    .filter((d) => (d.tarih ?? '').startsWith(yil) && (FAZLA_MESAI_TURLERI as readonly string[]).includes(d.tur ?? ''))
    .reduce((t, d) => t + sayi(d.saat), 0);
  return {
    kayitlar,
    fazla: saat(FAZLA_MESAI_TURLERI),
    resmiTatil: saat([RESMI_TATIL_TURU]),
    devamsizGun: new Set(kayitlar.filter((d) => d.tur === DEVAMSIZLIK_TURU).map((d) => d.tarih)).size,
    yil,
    yilFazla,
    sinir,
    kalan: Math.max(0, sinir - yilFazla),
    ton: yilFazla > sinir ? 'hata' : yilFazla > sinir * 0.85 ? 'uyari' : 'normal',
  };
}

/* ---------- Onaylar ---------- */

export function bekleyenTalepler(izinler: readonly Izin[], ekip: ReadonlySet<string>): Izin[] {
  return izinler
    .filter((l) => l.durum === IZIN_BEKLIYOR && !!l.empId && ekip.has(l.empId))
    .sort((a, b) => (a.baslangic ?? '').localeCompare(b.baslangic ?? ''));
}

export function sonKararlar(izinler: readonly Izin[], ekip: ReadonlySet<string>, adet = 8): Izin[] {
  return izinler
    .filter((l) => !!l.empId && ekip.has(l.empId) && (l.durum === IZIN_ONAYLI || l.durum === IZIN_RED) && !!l.karar)
    .sort((a, b) => (b.karar ?? '').localeCompare(a.karar ?? ''))
    .slice(0, adet);
}

// Aynı tarihlerde ekipten izinde (onaylı ya da bekleyen) olan başka kişilerin izinleri.
export function cakisanEkipIzinleri(talep: Izin, izinler: readonly Izin[], ekip: ReadonlySet<string>): Izin[] {
  const bas = talep.baslangic ?? '';
  const bit = talep.bitis ?? bas;
  return izinler.filter((x) => x.id !== talep.id && !!x.empId && ekip.has(x.empId) && x.empId !== talep.empId
    && (x.durum === IZIN_ONAYLI || x.durum === IZIN_BEKLIYOR)
    && (x.baslangic ?? '') <= bit && (x.bitis ?? x.baslangic ?? '') >= bas);
}

/* ---------- Ekip ve izin takvimi ---------- */

function ayParcalari(ay: string): [number, number] {
  return [Number(ay.slice(0, 4)), Number(ay.slice(5, 7))];
}

export function ayinGunleri(ay: string): string[] {
  const [y, m] = ayParcalari(ay);
  const son = new Date(y, m, 0).getDate();
  return Array.from({ length: son }, (_, i) => `${ay}-${String(i + 1).padStart(2, '0')}`);
}

// Takvimde görünen izin: onaylı ya da bekleyen.
export function takvimIzni(izinler: readonly Izin[], personel: string, gun: string): Izin | null {
  return izinler.find((l) => l.empId === personel && (l.durum === IZIN_ONAYLI || l.durum === IZIN_BEKLIYOR) && kapsar(l, gun)) ?? null;
}

export function enFazlaAyniGun(izinler: readonly Izin[], kisiler: readonly string[], gunler: readonly string[]): number {
  return Math.max(0, ...gunler.map((g) => kisiler.filter((p) => takvimIzni(izinler, p, g) !== null).length));
}


/* ---------- Performans ve eğitim (ekip üyesi, benim sayfam) ---------- */

export function sonPerformans(kayitlar: readonly Performans[], personel: string): Performans | null {
  return kayitlar.filter((p) => p.empId === personel).sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''))[0] ?? null;
}

// Kriter puanlarının ortalaması; puan yoksa null (format.js perfAvg sıfır döner, ekranda "—").
export function performansOrtalamasi(p: Performans): number | null {
  const skorlar = (p as unknown as { skorlar?: Record<string, unknown> }).skorlar ?? {};
  const v = Object.values(skorlar).map(sayi).filter((x) => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export type PerformansTonu = 'tamam' | 'bilgi' | 'uyari' | 'hata' | 'pasif';

export function performansEtiketi(ortalama: number | null): { etiket: string; ton: PerformansTonu } {
  if (!ortalama) return { etiket: 'Puanlanmadı', ton: 'pasif' };
  if (ortalama >= 4.5) return { etiket: 'Beklentinin çok üzerinde', ton: 'tamam' };
  if (ortalama >= 3.5) return { etiket: 'Beklentinin üzerinde', ton: 'tamam' };
  if (ortalama >= 2.5) return { etiket: 'Beklentiyi karşılıyor', ton: 'bilgi' };
  if (ortalama >= 1.5) return { etiket: 'Gelişime açık', ton: 'uyari' };
  return { etiket: 'Beklentinin altında', ton: 'hata' };
}

export function kisininEgitimleri(egitimler: readonly Egitim[], personel: string): Egitim[] {
  return egitimler.filter((x) => (x.katilimcilar ?? []).includes(personel)).sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}

/* ---------- Mesailerim: salt okunur puantaj takvimi (ik_puantaj_ekran.js TmiKisiTakvim, TmiPuHucre, TmiPuToplam) ---------- */

type PuantajKisi = IkPuantajCevabi['kisiler'][number];

export const PUANTAJ_DURUM_ADI: Record<PuantajDurumu, string> = {
  calisti: 'Çalıştı', izinli: 'İzinli', raporlu: 'Raporlu', devamsiz: 'Devamsız', hafta_tatili: 'Hafta tatili', resmi_tatil: 'Resmî tatil',
};
const PUANTAJ_FAZLA = ['Fazla mesai', 'Hafta tatili çalışması', 'Resmi tatil çalışması'];
export const DEVAM_KISA: Record<string, string> = {
  'Fazla mesai': 'FM', 'Hafta tatili çalışması': 'HTÇ', 'Resmi tatil çalışması': 'RTÇ', 'Geç kalma': 'GK', 'Erken çıkış': 'EÇ',
  'Devamsızlık': 'D', 'Görevlendirme': 'GÖ',
};

// Ayın içinde çalışma dönemi var mı (engine employedInMonth).
export function aydaCalisiyor(p: Personel, ay: string): boolean {
  const gunler = ayinGunleri(ay);
  const ilk = gunler[0] ?? `${ay}-01`;
  const son = gunler[gunler.length - 1] ?? ilk;
  if (p.iseGiris && p.iseGiris.slice(0, 10) > son) return false;
  const cikis = p.cikisTarihi?.slice(0, 10);
  if (cikis && cikis < ilk) return false;
  if (!cikis && p.durum === 'Ayrıldı') return false;
  return true;
}

// Dakikayı bir ondalıklı saate çevirir; veri yoksa null.
export function dakikaSaat(dk: number | null | undefined): number | null {
  return dk == null ? null : Math.round(dk / 6) / 10;
}

export type HucreSinifi = 'kapali' | 'tatil' | 'acik' | 'fazla' | 'eksik' | 'devamsiz' | 'izinli' | 'raporlu' | 'oneri';

export interface PuantajHucresi {
  tarih: string;
  kayit: IkPuantajKaydi | null;
  devam: Devam[];
  siniflar: HucreSinifi[];
  // Hücrenin açıklaması (başlık ipucu): vardiya adı, saatler, durum, devam kayıtları.
  aciklama: string;
  // Kayıt yokken gösterilen kısa işaret ("i" onaylı izin, "–" girilmemiş iş günü).
  isaret: string | null;
}

// Saat alanı boş bırakılmış olabilir (gövde olduğu gibi saklanır); boş saat "—" gösterilir, sıfır yazılmaz.
export function saatVar(d: Devam): boolean {
  const v: unknown = d.saat;
  return v !== '' && v !== null && v !== undefined;
}

function devamYazisi(d: Devam): string {
  const s = saatVar(d) ? `: ${sayiMetni(sayi(d.saat))} sa` : '';
  return `${d.tur}${s} (devam kaydı, ${d.onay || IZIN_ONAYLI})`;
}

// Planı bilinmeyen kişide kapalı gün motorun iş günü takviminden; motor yoksa işaretlenmez.
function kapaliMi(k: PuantajKisi | null, gun: string, isGunu: ((d: Date) => boolean) | null): 'tatil' | 'kapali' | null {
  const plan = k?.plan?.find((g) => g.tarih === gun) ?? null;
  if (plan) return plan.kapali === 'tatil' ? 'tatil' : plan.kapali || plan.dakika === 0 ? 'kapali' : null;
  if (k?.plan) return null;
  const d = metindenGun(gun);
  return d && isGunu && !isGunu(d) ? 'kapali' : null;
}

export function puantajHucresi(
  k: PuantajKisi | null, personel: string, gun: string, devamlar: readonly Devam[], izinler: readonly Izin[], bugunGun: string,
  isGunu: ((d: Date) => boolean) | null,
): PuantajHucresi {
  const kayit = k?.kayitlar.find((r) => r.tarih === gun) ?? null;
  const plan = k?.plan?.find((g) => g.tarih === gun) ?? null;
  const kapali = kapaliMi(k, gun, isGunu);
  const dv = devamlar.filter((x) => x.empId === personel && x.tarih === gun);
  const siniflar: HucreSinifi[] = [];
  const bas: string[] = [];
  let isaret: string | null = null;
  if (kapali) siniflar.push(kapali);
  if (plan?.ad) bas.push(plan.ad);
  if (kayit) {
    if (kayit.durum === 'calisti') {
      if (kayit.cikis) bas.push(`${kayit.giris}–${kayit.cikis}, ${sayiMetni(dakikaSaat(kayit.calismaDakika) ?? 0)} sa`);
      else { siniflar.push('acik'); bas.push(`Giriş ${kayit.giris}, çıkış girilmedi`); }
      if ((kayit.fazlaDakika ?? 0) > 0) { siniflar.push('fazla'); bas.push(`${kayit.fazlaTuru}: ${sayiMetni(dakikaSaat(kayit.fazlaDakika) ?? 0)} sa`); }
    } else {
      if (kayit.durum === 'devamsiz' || kayit.durum === 'izinli' || kayit.durum === 'raporlu') siniflar.push(kayit.durum);
      bas.push(PUANTAJ_DURUM_ADI[kayit.durum]);
    }
    if (kayit.aciklama) bas.push(kayit.aciklama);
  } else if (dv.length) {
    if (dv.some((x) => x.tur === DEVAMSIZLIK_TURU)) siniflar.push('devamsiz');
  } else if (izinler.some((l) => l.empId === personel && l.durum === IZIN_ONAYLI && kapsar(l, gun))) {
    isaret = 'i'; siniflar.push('oneri'); bas.push('Onaylı izin; puantaja girilmedi');
  } else if (!kapali && gun <= bugunGun && plan && plan.dakika > 0) {
    isaret = '–'; siniflar.push('eksik'); bas.push('Giriş-çıkış girilmedi');
  }
  if (dv.some((x) => PUANTAJ_FAZLA.includes(x.tur ?? '')) && !siniflar.includes('fazla')) siniflar.push('fazla');
  dv.forEach((x) => bas.push(devamYazisi(x)));
  return { tarih: gun, kayit, devam: dv, siniflar, aciklama: bas.join(' · '), isaret };
}

export interface PuantajToplami { calismaDakika: number; fazlaDakika: number; izinGun: number; devamsizGun: number }

// Fazla saat devam kayıtlarındandır (bordroya giren); devamsız gün puantaj ve devam kaydının birleşimidir.
export function puantajToplami(k: PuantajKisi | null, personel: string, ay: string, devamlar: readonly Devam[]): PuantajToplami {
  const t: PuantajToplami = { calismaDakika: 0, fazlaDakika: 0, izinGun: 0, devamsizGun: 0 };
  const devamsiz = new Set<string>();
  (k?.kayitlar ?? []).forEach((r) => {
    if (r.calismaDakika) t.calismaDakika += r.calismaDakika;
    if (r.durum === 'izinli' || r.durum === 'raporlu') t.izinGun++;
    if (r.durum === 'devamsiz') devamsiz.add(r.tarih);
  });
  devamlar.filter((x) => x.empId === personel && (x.tarih ?? '').startsWith(ay)).forEach((x) => {
    if (PUANTAJ_FAZLA.includes(x.tur ?? '')) t.fazlaDakika += sayi(x.saat) * 60;
    if (x.tur === DEVAMSIZLIK_TURU && x.tarih) devamsiz.add(x.tarih);
  });
  t.devamsizGun = devamsiz.size;
  return t;
}
