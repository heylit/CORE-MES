import { cm1Coz, kimlikKodu } from './etiket-kodu.ts';

// Okutulan kodun ne olduğunu tek yer söyler; her modül kendi çözücüsünü yazarsa önekler ayrışır.
// Sonuç yalnız yönlendirir: kaydın varlığını sahibi modül kendi tablosundan doğrular.

// Raf etiketi rafın kendisini gösterir (#116); stok yeri göz olduğundan raf kodu konum kodu değildir, öneki ayrıdır.
// Refakat partisi (emir + depodan verilen lot) kendi kartını taşır; kart emri değil partiyi gösterdiği için öneki emirden ayrıdır.
// Komut (1909, 1912) bir kayıt göstermez: ekrandaki düğmenin barkodudur (komut kartı). Kaydı sahibi modül değil, okutulan ekran yorumlar.
export const KOD_ONEKI = { konum: 'LOC', malzeme: 'MLZ', lot: 'LOT', 'uretim-emri': 'UE', raf: 'RAF', 'refakat-partisi': 'RP', komut: 'CMD' } as const;

// uretim-emri iki biçimde gelir: refakat kartı QR'ı kimliği (UE:4512), elle yazılan ya da eski etiket emir numarasını (UE-004512) taşır.
export type KodTuru =
  | { tur: 'konum' | 'malzeme' | 'lot' | 'raf'; deger: string }
  | { tur: 'uretim-emri'; deger: string; bicim: 'kimlik' | 'no' }
  | { tur: 'refakat-partisi'; deger: string }
  | { tur: 'komut'; komut: Komut }
  | { tur: 'bilinmiyor'; deger: string };

// Komut kartındaki komutlar. Miktar tam sayıdır (karttaki sabit değerler); mod adı ekranın bildiği modlardan biri olmalıdır, burada
// yalnız biçimi denetlenir.
export const SABIT_KOMUTLAR = ['KAYDET', 'GERI-AL', 'EVET', 'VAZGEC', 'ARTI', 'EKSI'] as const;
export type SabitKomut = (typeof SABIT_KOMUTLAR)[number];
export type Komut = { ad: SabitKomut } | { ad: 'MIKTAR'; miktar: number } | { ad: 'MOD'; mod: string };
const MIKTAR = /^MIKTAR:(\d{1,6})$/;
const MOD = /^MOD:([A-Z]{2,20})$/;
function komutCoz(govde: string): Komut | null {
  if ((SABIT_KOMUTLAR as readonly string[]).includes(govde)) return { ad: govde as SabitKomut };
  const m = MIKTAR.exec(govde);
  if (m) return { ad: 'MIKTAR', miktar: Number(m[1]) };
  const d = MOD.exec(govde);
  return d ? { ad: 'MOD', mod: d[1]! } : null;
}
export const komutKodu = (k: Komut): string =>
  `${KOD_ONEKI.komut}:${k.ad === 'MIKTAR' ? `MIKTAR:${k.miktar}` : k.ad === 'MOD' ? `MOD:${k.mod}` : k.ad}`;

const KIMLIK = /^\d{1,9}$/;
const EMIR_NO = /^UE-\d+$/;
const LOT_NO = /^LT-\d+$/;

// Fabrika ayarındaki el okuyucu ABD klavyesinin tuşlarına basar; Türkçe Q düzenli bilgisayarda ":" tuşu "Ş", "-" tuşu "*" yazar.
// Okuyucu cihaz cihaz ayarlanmadan çalışsın diye geri çevrilir. Yalnız ham metin tanınmıyor ve çevrilen metin bilinen bir kod oluyorsa:
// elle yazılan metin ve kart numaraları (rakam ve A-F) olduğu gibi kalır.
const ABD_TUSU: Readonly<Record<string, string>> = { 'Ş': ':', 'ş': ':', '*': '-' };
const ABD_TUSU_DESENI = /[Şş*]/g;
export function okutmaDuzelt(ham: string): string {
  if (!/[Şş*]/.test(ham) || cozumle(ham).tur !== 'bilinmiyor') return ham;
  const duz = ham.replace(ABD_TUSU_DESENI, (c) => ABD_TUSU[c] ?? c);
  return cozumle(duz).tur === 'bilinmiyor' ? ham : duz;
}

export function kodTuru(ham: string): KodTuru {
  return cozumle(okutmaDuzelt(ham));
}

// 3758 b: etikete elle yazılacak kod gruplu basılır. Gövdesi yalnız rakam olan önekte (RP, MLZ) önek ile gövde arasına boşluk konur,
// beş hane ve üstü sağdan üçerli gruplanır ("RP 12 345"); öteki kodlar olduğu gibi kalır. Basılan biçim elle yazılınca aynı kodu verir.
const RAKAM_GOVDELI: ReadonlySet<string> = new Set([KOD_ONEKI['refakat-partisi'], KOD_ONEKI.malzeme]);
const gruplu = (rakam: string): string => (rakam.length < 5 ? rakam : rakam.replace(/\B(?=(\d{3})+$)/g, ' '));
export function okunurKod(kimlik: string): string {
  const m = /^([A-Z]+):(\d{1,9})$/.exec(kimlik);
  return m !== null && RAKAM_GOVDELI.has(m[1]!) ? `${m[1]!} ${gruplu(m[2]!)}` : kimlik;
}

// 3758 b: elle yazılan kodda önekten sonraki ayraç ":" yerine boşluk ya da tire olabilir; rakam gövdeli önekte (RP, MLZ) ayraçsız da
// olur, gövdedeki boşluk ve rakamlar arasındaki tire atılır, rakam yerine yazılan O sıfır, I ve L bir sayılır. Konum, lot ve raf gövdesi kullanıcının
// tanımıdır, ona dokunulmaz. UE dışarıda kalır: "UE-" emir numarasıdır, kimlikle karışmasın.
const HOSGORULU = /^(?:(LOC|LOT|RAF|MLZ|RP)(?:\s*[:-]\s*|\s+)|(MLZ|RP)(?=[\dOIL]))(.+)$/;
function hosgoruluCoz(ham: string): KodTuru | null {
  const m = HOSGORULU.exec(ham.trim().toUpperCase());
  if (m === null) return null;
  const onek = (m[1] ?? m[2])!;
  const govde = RAKAM_GOVDELI.has(onek) ? m[3]!.replace(/\s+/g, '').replace(/(?<=[\dOIL])-(?=[\dOIL])/g, '').replace(/O/g, '0').replace(/[IL]/g, '1') : m[3]!.replace(/\s+/g, '');
  const t = cozumle(`${onek}:${govde}`, false);
  return t.tur === 'bilinmiyor' ? null : t;
}

// Okuyucu ve elle giriş boşluk ve küçük harf katabilir; kodların hiçbiri boşluk taşımaz, harfleri büyüktür.
// Özet kod (`CM1/UE:142/...`) ilk alanıyla çözülür: kod neyi gösteriyorsa onu gösterir, ek alanlar okuyan ekranındır (etiket-kodu.ts).
// İlk alan sözlüğün bilmediği bir önekse (koli, hatalı parça) sonuç bilinmiyor kalır.
function cozumle(ham: string, hosgoru = true): KodTuru {
  const ozet = cm1Coz(ham);
  if (ozet !== null) {
    const t = cozumle(kimlikKodu(ozet));
    return t.tur === 'bilinmiyor' ? { tur: 'bilinmiyor', deger: ham.trim() } : t;
  }
  const kod = ham.replace(/\s+/g, '').toUpperCase();
  const ayrac = kod.indexOf(':');
  const onek = ayrac < 0 ? null : kod.slice(0, ayrac);
  const govde = ayrac < 0 ? kod : kod.slice(ayrac + 1);

  if (onek === KOD_ONEKI.konum && govde !== '') return { tur: 'konum', deger: govde };
  if (onek === KOD_ONEKI.malzeme && KIMLIK.test(govde)) return { tur: 'malzeme', deger: govde };
  if (onek === KOD_ONEKI.lot && govde !== '') return { tur: 'lot', deger: govde };
  if (onek === KOD_ONEKI.raf && govde !== '') return { tur: 'raf', deger: govde };
  if (onek === KOD_ONEKI['refakat-partisi'] && KIMLIK.test(govde)) return { tur: 'refakat-partisi', deger: govde };
  if (onek === KOD_ONEKI.komut) { const k = komutCoz(govde); if (k) return { tur: 'komut', komut: k }; }
  if (onek === KOD_ONEKI['uretim-emri'] && KIMLIK.test(govde)) return { tur: 'uretim-emri', deger: govde, bicim: 'kimlik' };
  if ((onek === null || onek === KOD_ONEKI['uretim-emri']) && EMIR_NO.test(govde)) return { tur: 'uretim-emri', deger: govde, bicim: 'no' };
  if (onek === null && LOT_NO.test(govde)) return { tur: 'lot', deger: govde };
  return (hosgoru ? hosgoruluCoz(ham) : null) ?? { tur: 'bilinmiyor', deger: ham.trim() };
}
