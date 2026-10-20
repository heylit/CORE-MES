import { z } from 'zod';
import { beklenenSurum, surumSemasi } from '../surum.ts';

const TARIH = /^\d{4}-\d{2}-\d{2}$/;

const tarihSemasi = z.string().regex(TARIH, 'Tarih GGGG-AA-GG biçiminde olmalı.').refine(
  (t) => {
    const d = new Date(`${t}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
  },
  'Geçerli bir tarih girin.',
);

// Boş ya da yalnız boşluktan oluşan metin "yok" demektir; sıfır ya da boş dizgi saklanmaz.
const istege = (azami: number) =>
  z.string().max(azami).nullish().transform((m) => {
    const kirpik = m?.trim();
    return kirpik ? kirpik : null;
  });

const zorunluMetin = (ileti: string, azami: number) => z.string().trim().min(1, ileti).max(azami);

export const SONUCLAR = ['uygun', 'uygunsuz'] as const;
export const DURUMLAR = ['kullanim-disi', 'kayit-yok', 'gecmis', 'yaklasan', 'gecerli'] as const;

export const sonucSemasi = z.enum(SONUCLAR);
export const durumSemasi = z.enum(DURUMLAR);

export const idParametresi = z.object({ id: z.coerce.number().int().positive() });
export const listeSorgusu = z.object({ ara: z.string().trim().max(80).optional() });

export const kalibrasyonGovdesi = z.object({
  // Verilmezse sunucu bugünü yazar (KLB-07); bugünden sonrası reddedilir, "bugün"ü sunucu bilir.
  tarih: tarihSemasi.optional(),
  sonuc: sonucSemasi,
  sertifikaNo: istege(80),
  aciklama: istege(500),
});

const aletAlanlari = {
  no: zorunluMetin('Alet numarası zorunlu.', 60).transform((n) => n.toUpperCase()),
  turId: z.number().int().positive('Tür seçin.'),
  ad: istege(120),
  olcmeAraligi: istege(120),
  yer: istege(120),
  periyotGun: z.number().int().min(1, 'Periyot en az 1 gün olmalı.').max(3650),
};

export const aletOlusturGovdesi = z.object({
  ...aletAlanlari,
  periyotGun: aletAlanlari.periyotGun.default(365),
  ilkKalibrasyon: kalibrasyonGovdesi.optional(),
});
// Güncelleme gövdesi tam kayıttır: varsayılan yalnız eklemede geçerlidir, yoksa eksik periyot vadeyi kaydırır.
export const aletGuncelleGovdesi = z.object({ ...aletAlanlari, ...beklenenSurum });
export const kullanimDisiGovdesi = z.object({ neden: zorunluMetin('Neden zorunlu.', 300) });

export const turOlusturGovdesi = z.object({ ad: zorunluMetin('Tür adı zorunlu.', 80) });
export const turGuncelleGovdesi = z.object({ ad: zorunluMetin('Tür adı zorunlu.', 80), aktif: z.boolean(), ...beklenenSurum });

export const aletSemasi = z.object({
  id: z.number().int(),
  no: z.string(),
  turId: z.number().int(),
  tur: z.string(),
  ad: z.string().nullable(),
  olcmeAraligi: z.string().nullable(),
  yer: z.string().nullable(),
  periyotGun: z.number().int(),
  kullanimDisi: z.boolean(),
  kullanimDisiNedeni: z.string().nullable(),
  // Hepsi son uygun kayıttan türetilir; kaydı olmayan aletde null.
  sonKalibrasyon: z.string().nullable(),
  vade: z.string().nullable(),
  kalanGun: z.number().int().nullable(),
  durum: durumSemasi,
  surum: surumSemasi,
});

export const kayitSemasi = z.object({
  id: z.number().int(),
  tarih: z.string(),
  sonuc: sonucSemasi,
  sertifikaNo: z.string().nullable(),
  aciklama: z.string().nullable(),
  kisiAd: z.string(),
});

// Ana sayfa kartı listeyi taşımadan yalnız özeti okur.
export const ozetCevabi = z.object({ vadesiGecen: z.number().int(), yaklasan: z.number().int() });
export const listeCevabi = z.object({
  aletler: z.array(aletSemasi),
  ozet: ozetCevabi,
});

export const aletAyrintiCevabi = aletSemasi.extend({
  sonKayitlar: z.array(kayitSemasi),
  kayitSayisi: z.number().int(),
});

export const turSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  aktif: z.boolean(),
  aletSayisi: z.number().int(),
  surum: surumSemasi,
});

export const turListesiCevabi = z.object({ turler: z.array(turSemasi) });

export const silmeCevabi = z.undefined();

export type Durum = z.output<typeof durumSemasi>;
export type Sonuc = z.output<typeof sonucSemasi>;
export type KalibrasyonGovdesi = z.input<typeof kalibrasyonGovdesi>;
export type AletOlusturGovdesi = z.input<typeof aletOlusturGovdesi>;
export type AletGuncelleGovdesi = z.input<typeof aletGuncelleGovdesi>;
export type KullanimDisiGovdesi = z.input<typeof kullanimDisiGovdesi>;
export type TurOlusturGovdesi = z.input<typeof turOlusturGovdesi>;
export type TurGuncelleGovdesi = z.input<typeof turGuncelleGovdesi>;
export type Alet = z.output<typeof aletSemasi>;
export type Kayit = z.output<typeof kayitSemasi>;
export type ListeCevabi = z.output<typeof listeCevabi>;
export type OzetCevabi = z.output<typeof ozetCevabi>;
export type AletAyrintiCevabi = z.output<typeof aletAyrintiCevabi>;
export type Tur = z.output<typeof turSemasi>;
export type TurListesiCevabi = z.output<typeof turListesiCevabi>;
