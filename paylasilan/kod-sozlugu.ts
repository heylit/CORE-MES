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

// Okuyucu ve elle giriş boşluk ve küçük harf katabilir; kodların hiçbiri boşluk taşımaz, harfleri büyüktür.
function cozumle(ham: string): KodTuru {
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
  return { tur: 'bilinmiyor', deger: ham.trim() };
}
