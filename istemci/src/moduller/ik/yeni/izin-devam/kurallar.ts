import type { IkPuantajCevabi, IkPuantajGunuGirdisi, IkPuantajKaydi, IkPuantajPlanGunu, PuantajDurumu } from '#paylasilan/sozlesme/ik.ts';
import type { Devam, Izin, Personel } from '../tipler.ts';

// Izinler, Devam ve mesai, Puantaj ekranlarinin tarayicidaki hesaplari (205 a). Bugunku ekranin kurallariyla ayni; sunucu ayrica denetler.
// Tarihler ISO metnidir (YYYY-AA-GG); karsilastirma metinle yapilir, saat dilimi kaymasi olmaz.

type PuKisi = IkPuantajCevabi['kisiler'][number];

const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
export const sayiYaz = (n: number): string => SAYI.format(n);
// Bos ya da gecersiz alan toplama sifir katar (bugunku num); gosterimde bos alan "—" kalir.
export const sayi = (v: unknown): number => {
  const n = Number.parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const kucuk = (s: unknown): string => String(s ?? '').toLocaleLowerCase('tr-TR');
const bosMu = (v: unknown): boolean => v === '' || v === null || v === undefined;

/* ---------------- izinler ---------------- */

export const SONUCLANMIS = ['Reddedildi', 'İptal'];
export const ETKIN_IZIN = ['Onaylandı', 'Beklemede'];
export const RAPOR_TURU = 'Hastalık / rapor';
export const YILLIK_IZIN = 'Yıllık izin';

export interface IzinSuzgeci { ara: string; durum: string; tur: string; yil: string }
export const TUM_YILLAR = 'tum';

// Talepler sekmesi: yil baslangic ya da bitisle eslesir; bekleyenler ustte, sonra baslangica gore yeniden eskiye.
export function izinleriSuz(izinler: readonly Izin[], s: IzinSuzgeci, ad: (personel: string | undefined) => string): Izin[] {
  const q = kucuk(s.ara.trim());
  return izinler
    .filter((l) => s.yil === TUM_YILLAR || (l.baslangic ?? '').startsWith(s.yil) || (l.bitis ?? '').startsWith(s.yil))
    .filter((l) => !s.durum || l.durum === s.durum)
    .filter((l) => !s.tur || l.tur === s.tur)
    .filter((l) => !q || kucuk(ad(l.empId)).includes(q))
    .sort((a, b) => {
      const ab = a.durum === 'Beklemede', bb = b.durum === 'Beklemede';
      if (ab !== bb) return ab ? -1 : 1;
      return (b.baslangic ?? '').localeCompare(a.baslangic ?? '');
    });
}

// Yil secimi: kayitlarin baslangic yillari ve bu yil, yeniden eskiye.
export function izinYillari(izinler: readonly Izin[], buYil: string): string[] {
  return [...new Set(izinler.map((l) => (l.baslangic ?? '').slice(0, 4)).filter(Boolean).concat([buYil]))].sort().reverse();
}

export const onaylananGun = (izinler: readonly Izin[]): number =>
  izinler.filter((l) => l.durum === 'Onaylandı').reduce((t, l) => t + sayi(l.gun), 0);

// Ayin gunleri, ISO metin.
export function ayGunleri(ay: string): string[] {
  const [y, m] = ay.split('-').map(Number);
  const son = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return Array.from({ length: son }, (_, i) => `${ay}-${String(i + 1).padStart(2, '0')}`);
}
// Pazartesi 0 ... pazar 6.
export const haftaGunu = (tarih: string): number => (new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7;

const kesisir = (l: Izin, bas: string, bit: string): boolean => !!l.baslangic && !!l.bitis && l.baslangic <= bit && l.bitis >= bas;

// Takvim sekmesi: ayla kesisen onayli ve bekleyen izinler, kisi kisi; kisiler ada gore.
export function takvimSatirlari(izinler: readonly Izin[], ay: string, ad: (personel: string) => string): { personel: string; izinler: Izin[] }[] {
  const gunler = ayGunleri(ay);
  const bas = gunler[0]!, bit = gunler[gunler.length - 1]!;
  const kisiler = new Map<string, Izin[]>();
  for (const l of izinler) {
    if (!l.empId || !ETKIN_IZIN.includes(l.durum ?? '') || !kesisir(l, bas, bit)) continue;
    kisiler.set(l.empId, [...(kisiler.get(l.empId) ?? []), l]);
  }
  return [...kisiler.entries()].map(([personel, ls]) => ({ personel, izinler: ls })).sort((a, b) => ad(a.personel).localeCompare(ad(b.personel), 'tr'));
}

export type TakvimTonu = 'onayli' | 'bekliyor' | 'rapor';
export function takvimHucresi(izinler: readonly Izin[], tarih: string): { izin: Izin; tonlar: TakvimTonu[] } | null {
  const izin = izinler.find((l) => kesisir(l, tarih, tarih));
  if (!izin) return null;
  const tonlar: TakvimTonu[] = ['onayli'];
  if (izin.durum === 'Beklemede') tonlar.push('bekliyor');
  if (izin.tur === RAPOR_TURU) tonlar.push('rapor');
  return { izin, tonlar };
}

export interface AlanHatasi { alan: keyof Izin; ileti: string }

// Izin formunun kaydetmeden onceki denetimi: zorunlu alanlar, tarih sirasi, ayni kiside cakisan etkin izin, ise giristen once baslangic.
export function izinDenetle(
  k: Izin,
  izinler: readonly Izin[],
  personel: Personel | null,
  tarihYaz: (t: string | undefined) => string,
): AlanHatasi[] {
  const h: AlanHatasi[] = [];
  for (const alan of ['empId', 'tur', 'baslangic', 'bitis'] as const) if (bosMu(k[alan])) h.push({ alan, ileti: 'Bu alan zorunlu.' });
  if (k.baslangic && k.bitis && k.bitis < k.baslangic) h.push({ alan: 'bitis', ileti: 'Bitiş tarihi başlangıçtan önce olamaz.' });
  if (k.baslangic && k.bitis && !SONUCLANMIS.includes(k.durum ?? '')) {
    const c = izinler.find((l) => l.id !== k.id && l.empId === k.empId && ETKIN_IZIN.includes(l.durum ?? '') && kesisir(l, k.baslangic!, k.bitis!));
    if (c) h.push({ alan: 'baslangic', ileti: `Bu tarihlerle çakışan bir izin var: ${c.tur ?? ''}, ${tarihYaz(c.baslangic)} – ${tarihYaz(c.bitis)} (${c.durum ?? ''}).` });
  }
  if (personel?.iseGiris && k.baslangic && k.baslangic < personel.iseGiris) h.push({ alan: 'baslangic', ileti: 'İzin başlangıcı işe giriş tarihinden önce olamaz.' });
  return h;
}

// Yillik izinde kalan asilirsa uyari (kayit durmaz). Onceden onaylanmis ayni iznin gunu kalana geri eklenir.
export function bakiyeAsimi(k: Izin, onceki: Izin | null, kalan: number): number | null {
  if (k.tur !== YILLIK_IZIN || SONUCLANMIS.includes(k.durum ?? '')) return null;
  const geri = onceki && onceki.tur === YILLIK_IZIN && onceki.durum === 'Onaylandı' ? sayi(onceki.gun) : 0;
  return sayi(k.gun) > kalan + geri ? kalan + geri : null;
}

// Izin formunda "bu izinden sonra kalan": onaylanmis izin bakiyeden zaten dusmustur.
export const izindenSonraKalan = (l: Izin, kalan: number): number => (l.durum === 'Onaylandı' ? kalan : kalan - sayi(l.gun));

/* ---------------- devam ve mesai ---------------- */

export const FAZLA_MESAI_TURLERI = ['Fazla mesai', 'Hafta tatili çalışması'];
export const VARSAYILAN_MESAI_SINIRI = 270;

export function devamlariSuz(kayitlar: readonly Devam[], ay: string, s: { tur: string; ara: string }, ad: (p: string | undefined) => string): Devam[] {
  const q = kucuk(s.ara.trim());
  return kayitlar
    .filter((a) => (a.tarih ?? '').startsWith(ay))
    .filter((a) => !s.tur || a.tur === s.tur)
    .filter((a) => !q || kucuk(ad(a.empId)).includes(q))
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}

export interface DevamOzeti { fazlaSaat: number; resmiTatilSaat: number; gecKalma: number; devamsizGun: number }
// Ayin toplamlari, suzgecten bagimsiz. Devamsizlik kisi basina ayri gun sayilir (ayni gune iki kayit bir gun).
export function devamOzeti(kayitlar: readonly Devam[], ay: string): DevamOzeti {
  const ayin = kayitlar.filter((a) => (a.tarih ?? '').startsWith(ay));
  const saat = (turler: readonly string[]) => ayin.filter((a) => turler.includes(a.tur ?? '')).reduce((t, a) => t + sayi(a.saat), 0);
  return {
    fazlaSaat: saat(FAZLA_MESAI_TURLERI),
    resmiTatilSaat: saat(['Resmi tatil çalışması']),
    gecKalma: ayin.filter((a) => a.tur === 'Geç kalma').length,
    devamsizGun: new Set(ayin.filter((a) => a.tur === 'Devamsızlık').map((a) => `${a.empId}|${a.tarih}`)).size,
  };
}

export type SinirTonu = 'hata' | 'uyari' | null;
// Yillik fazla mesai: yalniz saati olan aktif kisiler, coktan aza; sinirin %85'i uyari, siniri asan hata.
export function yillikFazlaMesai(kayitlar: readonly Devam[], aktifler: readonly Personel[], yil: string, sinir: number): { personel: Personel; saat: number; ton: SinirTonu }[] {
  return aktifler
    .map((personel) => ({
      personel,
      saat: kayitlar.filter((a) => a.empId === personel.id && (a.tarih ?? '').startsWith(yil) && FAZLA_MESAI_TURLERI.includes(a.tur ?? '')).reduce((t, a) => t + sayi(a.saat), 0),
    }))
    .filter((x) => x.saat > 0)
    .sort((a, b) => b.saat - a.saat)
    .map((x) => ({ ...x, ton: x.saat > sinir ? 'hata' : x.saat > sinir * 0.85 ? 'uyari' : null }));
}

export const mesaiSiniri = (ayar: unknown): number => sayi(ayar) || VARSAYILAN_MESAI_SINIRI;

/* ---------------- puantaj ---------------- */

// Kisi o ay calisiyor mu: ise giris ay sonundan once, cikis ay basindan sonra (motordaki employedInMonth ile ayni).
export function ayindaCalisiyor(p: Personel, ay: string): boolean {
  const gunler = ayGunleri(ay);
  if (p.iseGiris && p.iseGiris > gunler[gunler.length - 1]!) return false;
  if (p.cikisTarihi) return p.cikisTarihi >= gunler[0]!;
  return p.durum !== 'Ayrıldı';
}

export const PUANTAJ_DURUM_ADI: Record<PuantajDurumu, { ad: string; kisa: string }> = {
  calisti: { ad: 'Çalıştı', kisa: '' },
  izinli: { ad: 'İzinli', kisa: 'İ' },
  raporlu: { ad: 'Raporlu', kisa: 'R' },
  devamsiz: { ad: 'Devamsız', kisa: 'D' },
  hafta_tatili: { ad: 'Hafta tatili', kisa: 'HT' },
  resmi_tatil: { ad: 'Resmî tatil', kisa: 'RT' },
};
export const PUANTAJ_GUN_ADI = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
// Sozlesmedeki PUANTAJ_FAZLA_TURLERI ve IK_TOPLU_SINIR'in karsiligi: istemci paylasilandan yalniz tip ithal eder; eksik tur derlemede yakalanir.
const FAZLA_TURU = { 'Fazla mesai': true, 'Hafta tatili çalışması': true, 'Resmi tatil çalışması': true } satisfies Record<NonNullable<IkPuantajKaydi['fazlaTuru']>, true>;
const PUANTAJ_FAZLA: readonly string[] = Object.keys(FAZLA_TURU);
const IK_TOPLU_SINIR = 500;
const DEVAM_KISA: Record<string, string> = {
  'Fazla mesai': 'FM', 'Hafta tatili çalışması': 'HTÇ', 'Resmi tatil çalışması': 'RTÇ', 'Geç kalma': 'GK', 'Erken çıkış': 'EÇ', 'Devamsızlık': 'D', 'Görevlendirme': 'GÖ',
};
export const devamKisa = (tur: string | undefined): string => DEVAM_KISA[tur ?? ''] ?? (tur ?? '').slice(0, 2);

// Dakikayi saatin onda birine yuvarlar.
export const dakikaSaat = (dk: number | null | undefined): string => (dk === null || dk === undefined ? '' : sayiYaz(Math.round(dk / 6) / 10));
const devamSaati = (x: Devam): string => (bosMu(x.saat) ? '' : sayiYaz(sayi(x.saat)));
export const devamYazisi = (x: Devam): string => `${x.tur ?? ''}${devamSaati(x) ? `: ${devamSaati(x)} sa` : ''} (devam kaydı, ${x.onay || 'Onaylandı'})`;

export const puKisi = (v: IkPuantajCevabi | null, p: string): PuKisi | null => v?.kisiler.find((k) => k.personel === p) ?? null;
export const puKayit = (k: PuKisi | null, t: string): IkPuantajKaydi | null => k?.kayitlar.find((r) => r.tarih === t) ?? null;
export const puPlan = (k: PuKisi | null, t: string): IkPuantajPlanGunu | null => k?.plan?.find((g) => g.tarih === t) ?? null;

// Planli kiside kapali gun plandandir; plani bilinmeyen kiside hafta sonu ve tatil sirketin takviminden (isGunu).
export function puKapali(k: PuKisi | null, t: string, isGunu: (t: string) => boolean): 'tatil' | 'kapali' | null {
  const g = puPlan(k, t);
  if (g) return g.kapali === 'tatil' ? 'tatil' : g.kapali || g.dakika === 0 ? 'kapali' : null;
  if (k?.plan) return null;
  return isGunu(t) ? null : 'kapali';
}
const izinde = (izinler: readonly Izin[], p: string, t: string): boolean =>
  izinler.some((l) => l.empId === p && l.durum === 'Onaylandı' && (l.baslangic ?? '') <= t && (l.bitis || l.baslangic || '') >= t);
const gunDevamlari = (devamlar: readonly Devam[], p: string, t: string): Devam[] => devamlar.filter((x) => x.empId === p && x.tarih === t);

export type PuantajTonu = 'tatil' | 'kapali' | 'acik' | 'fazla' | 'oneri' | 'eksik' | 'devamsiz' | Exclude<PuantajDurumu, 'calisti' | 'devamsiz'>;
export interface PuantajHucresi { metin: string; tonlar: PuantajTonu[]; baslik: string; devamlar: Devam[] }

// Hucre: kayit, yoksa ayni gunun devam kaydi, yoksa onayli izin (soluk, puantaja yazilmaz), yoksa gecmis plan gununde eksik isareti.
export function puHucre(k: PuKisi | null, p: string, t: string, b: { izinler: readonly Izin[]; devamlar: readonly Devam[]; isGunu: (t: string) => boolean; bugun: string }): PuantajHucresi {
  const r = puKayit(k, t), g = puPlan(k, t), kap = puKapali(k, t, b.isGunu), dv = gunDevamlari(b.devamlar, p, t);
  const tonlar: PuantajTonu[] = [], bas: string[] = [];
  let metin = '';
  if (kap) tonlar.push(kap);
  if (g?.ad) bas.push(g.ad);
  if (r) {
    if (r.durum === 'calisti') {
      if (r.cikis) { metin = dakikaSaat(r.calismaDakika); bas.push(`${r.giris}–${r.cikis}, ${metin} sa`); } else { metin = r.giris ?? ''; tonlar.push('acik'); bas.push(`Giriş ${r.giris}, çıkış girilmedi`); }
      if ((r.fazlaDakika ?? 0) > 0) { tonlar.push('fazla'); bas.push(`${r.fazlaTuru}: ${dakikaSaat(r.fazlaDakika)} sa`); }
    } else { metin = PUANTAJ_DURUM_ADI[r.durum].kisa; tonlar.push(r.durum); bas.push(PUANTAJ_DURUM_ADI[r.durum].ad); }
    if (r.aciklama) bas.push(r.aciklama);
  } else if (dv.length) {
    const fz = dv.filter((x) => PUANTAJ_FAZLA.includes(x.tur ?? ''));
    metin = fz.length ? `+${sayiYaz(fz.reduce((u, x) => u + sayi(x.saat), 0))}` : devamKisa(dv[0]!.tur);
    if (dv.some((x) => x.tur === 'Devamsızlık')) tonlar.push('devamsiz');
  } else if (izinde(b.izinler, p, t)) { metin = 'i'; tonlar.push('oneri'); bas.push('Onaylı izin; puantaja girilmedi'); }
  else if (!kap && t <= b.bugun && g && g.dakika > 0) { metin = '–'; tonlar.push('eksik'); bas.push('Giriş-çıkış girilmedi'); }
  if (dv.some((x) => PUANTAJ_FAZLA.includes(x.tur ?? '')) && !tonlar.includes('fazla')) tonlar.push('fazla');
  dv.forEach((x) => bas.push(devamYazisi(x)));
  return { metin, tonlar, baslik: bas.join(' · '), devamlar: dv };
}

export interface PuantajToplami { calismaDakika: number; fazlaDakika: number; izinGun: number; devamsizGun: number }
// Fazla saat devam kayitlarindandir (bordroya giren); devamsiz gun puantaj ve devam kaydinin birlesimi, ayni gun bir kez.
export function puToplam(k: PuKisi | null, p: string, ay: string, devamlar: readonly Devam[]): PuantajToplami {
  const s: PuantajToplami = { calismaDakika: 0, fazlaDakika: 0, izinGun: 0, devamsizGun: 0 };
  const dgun = new Set<string>();
  for (const r of k?.kayitlar ?? []) {
    if (r.calismaDakika) s.calismaDakika += r.calismaDakika;
    if (r.durum === 'izinli' || r.durum === 'raporlu') s.izinGun++;
    if (r.durum === 'devamsiz') dgun.add(r.tarih);
  }
  for (const x of devamlar) {
    if (x.empId !== p || !(x.tarih ?? '').startsWith(ay)) continue;
    if (PUANTAJ_FAZLA.includes(x.tur ?? '')) s.fazlaDakika += sayi(x.saat) * 60;
    if (x.tur === 'Devamsızlık') dgun.add(x.tarih!);
  }
  s.devamsizGun = dgun.size;
  return s;
}

// Matristeki kisiler: kaydi olan, arama ve departman suzgeciyle, ada gore.
export function puKisileri(v: IkPuantajCevabi, b: { personel: (id: string) => Personel | null; ad: (id: string) => string; ara: string; departman: string; kilitliHaric?: boolean }): PuKisi[] {
  const q = kucuk(b.ara.trim());
  return v.kisiler
    .filter((k) => b.personel(k.personel) !== null)
    .filter((k) => !b.kilitliHaric || !k.kilitli)
    .filter((k) => !q || kucuk(b.ad(k.personel)).includes(q))
    .filter((k) => !b.departman || b.personel(k.personel)?.departmanId === b.departman)
    .sort((x, y) => b.ad(x.personel).localeCompare(b.ad(y.personel), 'tr'));
}

// Fazla mesai onerileri: ayni gun ve turde devam kaydi olanlar duser.
export function puOneriler(kisiler: readonly PuKisi[], devamlar: readonly Devam[]): { personel: string; kayit: IkPuantajKaydi }[] {
  return kisiler.flatMap((k) => k.kayitlar
    .filter((r) => (r.fazlaDakika ?? 0) > 0 && r.fazlaTuru && !devamlar.some((x) => x.empId === k.personel && x.tarih === r.tarih && x.tur === r.fazlaTuru))
    .map((kayit) => ({ personel: k.personel, kayit })));
}

// Oneriden devam kaydi: onay "Beklemede", saat ondalik; kimligi cagiran verir, sistem alanlarini sunucu yazar.
export const aktarimKaydi = (id: string, personel: string, r: IkPuantajKaydi): Devam => ({
  id, kind: 'att', empId: personel, tarih: r.tarih, ...(r.fazlaTuru ? { tur: r.fazlaTuru } : {}), saat: Math.round((r.fazlaDakika ?? 0) / 6) / 10, onay: 'Beklemede', aciklama: 'Puantajdan',
});

export interface GunGirdisi { durum: PuantajDurumu; giris: string; cikis: string; aciklama: string }
// Tek gun penceresi: calisilan gunde giris zorunlu, cikis girisle ayni olamaz; saat yalniz calisilan gunde yazilir.
export function gunDenetle(g: GunGirdisi): string | null {
  if (g.durum !== 'calisti') return null;
  if (!g.giris) return 'Çalışılan günde giriş saati gerekir.';
  if (g.cikis && g.cikis === g.giris) return 'Çıkış girişle aynı olamaz.';
  return null;
}
export function gunYazimi(personel: string, tarih: string, g: GunGirdisi, onceki: IkPuantajKaydi | null): IkPuantajGunuGirdisi {
  const cal = g.durum === 'calisti';
  return { personel, tarih, durum: g.durum, giris: cal ? g.giris || null : null, cikis: cal ? g.cikis || null : null, aciklama: g.aciklama.trim() || null, surum: onceki?.surum ?? null };
}
export const gunTemizle = (personel: string, tarih: string, onceki: IkPuantajKaydi): IkPuantajGunuGirdisi =>
  ({ personel, tarih, durum: null, giris: null, cikis: null, aciklama: null, surum: onceki.surum });

export interface TopluSecim {
  baslangic: string; bitis: string; durum: PuantajDurumu; vardiyaSaati: boolean; giris: string; cikis: string;
  yalnizBos: boolean; kapaliAtla: boolean; kisiler: ReadonlySet<string>;
}
// Toplu giris: secili kisiler ve aralik (bugune kadar, calisma donemi icinde). Vardiya saatiyle doldurmada vardiyasi olmayan gun atlanir.
export function topluGunler(v: IkPuantajCevabi, kisiler: readonly PuKisi[], s: TopluSecim, b: { personel: (id: string) => Personel | null; isGunu: (t: string) => boolean; bugun: string }): IkPuantajGunuGirdisi[] {
  const cal = s.durum === 'calisti', vr = cal && s.vardiyaSaati, out: IkPuantajGunuGirdisi[] = [];
  for (const k of kisiler) {
    if (!s.kisiler.has(k.personel)) continue;
    const e = b.personel(k.personel);
    for (const t of v.gunler) {
      if (t < s.baslangic || t > s.bitis || t > b.bugun) continue;
      if (e?.iseGiris && t < e.iseGiris) continue;
      if (e?.cikisTarihi && t > e.cikisTarihi) continue;
      const r = puKayit(k, t), g = puPlan(k, t);
      if (r && s.yalnizBos) continue;
      if (s.kapaliAtla && puKapali(k, t, b.isGunu)) continue;
      let giris: string | null = null, cikis: string | null = null;
      if (cal) {
        if (vr) { if (!g?.baslangic || g.kapali) continue; giris = g.baslangic; cikis = g.bitis; } else { giris = s.giris || null; cikis = s.cikis || null; }
      }
      out.push({ personel: k.personel, tarih: t, durum: s.durum, giris, cikis, aciklama: r?.aciklama ?? null, surum: r?.surum ?? null });
    }
  }
  return out;
}
export function topluDenetle(g: readonly IkPuantajGunuGirdisi[]): string | null {
  if (!g.length) return 'Yazılacak gün yok.';
  if (g.some((x) => x.durum === 'calisti' && !x.giris)) return 'Çalışılan günde giriş saati gerekir.';
  if (g.length > IK_TOPLU_SINIR) return `Bir seferde en çok ${IK_TOPLU_SINIR} gün yazılır; aralığı ya da kişileri daraltın.`;
  return null;
}
