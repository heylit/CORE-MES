// Okutulan kodun ne olduğunu tek yer söyler; her modül kendi çözücüsünü yazarsa önekler ayrışır.
// Sonuç yalnız yönlendirir: kaydın varlığını sahibi modül kendi tablosundan doğrular.

// Raf etiketi rafın kendisini gösterir (#116); stok yeri göz olduğundan raf kodu konum kodu değildir, öneki ayrıdır.
// Refakat partisi (emir + depodan verilen lot) kendi kartını taşır; kart emri değil partiyi gösterdiği için öneki emirden ayrıdır.
export const KOD_ONEKI = { konum: 'LOC', malzeme: 'MLZ', lot: 'LOT', 'uretim-emri': 'UE', raf: 'RAF', 'refakat-partisi': 'RP' } as const;

// uretim-emri iki biçimde gelir: refakat kartı QR'ı kimliği (UE:4512), elle yazılan ya da eski etiket emir numarasını (UE-004512) taşır.
export type KodTuru =
  | { tur: 'konum' | 'malzeme' | 'lot' | 'raf'; deger: string }
  | { tur: 'uretim-emri'; deger: string; bicim: 'kimlik' | 'no' }
  | { tur: 'refakat-partisi'; deger: string }
  | { tur: 'bilinmiyor'; deger: string };

const KIMLIK = /^\d{1,9}$/;
const EMIR_NO = /^UE-\d+$/;
const LOT_NO = /^LT-\d+$/;

// Okuyucu ve elle giriş boşluk ve küçük harf katabilir; kodların hiçbiri boşluk taşımaz, harfleri büyüktür.
export function kodTuru(ham: string): KodTuru {
  const kod = ham.replace(/\s+/g, '').toUpperCase();
  const ayrac = kod.indexOf(':');
  const onek = ayrac < 0 ? null : kod.slice(0, ayrac);
  const govde = ayrac < 0 ? kod : kod.slice(ayrac + 1);

  if (onek === KOD_ONEKI.konum && govde !== '') return { tur: 'konum', deger: govde };
  if (onek === KOD_ONEKI.malzeme && KIMLIK.test(govde)) return { tur: 'malzeme', deger: govde };
  if (onek === KOD_ONEKI.lot && govde !== '') return { tur: 'lot', deger: govde };
  if (onek === KOD_ONEKI.raf && govde !== '') return { tur: 'raf', deger: govde };
  if (onek === KOD_ONEKI['refakat-partisi'] && KIMLIK.test(govde)) return { tur: 'refakat-partisi', deger: govde };
  if (onek === KOD_ONEKI['uretim-emri'] && KIMLIK.test(govde)) return { tur: 'uretim-emri', deger: govde, bicim: 'kimlik' };
  if ((onek === null || onek === KOD_ONEKI['uretim-emri']) && EMIR_NO.test(govde)) return { tur: 'uretim-emri', deger: govde, bicim: 'no' };
  if (onek === null && LOT_NO.test(govde)) return { tur: 'lot', deger: govde };
  return { tur: 'bilinmiyor', deger: ham.trim() };
}
