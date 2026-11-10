import type { PlanlanamamaNedeni } from '#paylasilan/sozlesme/plan.ts';

// 2780: yerleşmeyen işin tek ve somut nedeni. Metin tek cümledir, tek kaynak ya da istasyon adı taşır; "ya da" ile birden çok olasılık
// yazılmaz. Ölçülemeyen neden "bilinmiyor"dur, tahmin yazılmaz. Planlanabilirlik sayfası (2779) aynı kodları okur.
export interface PlanlanamamaHedefi { tur: 'istasyon' | 'makine' | 'kisi'; id: number; ad: string }
export interface YerlesmemeNedeni { kod: PlanlanamamaNedeni; metin: string; hedef: PlanlanamamaHedefi | null }

export const yerlesmemeNedeni = (kod: PlanlanamamaNedeni, metin: string, hedef: PlanlanamamaHedefi | null = null): YerlesmemeNedeni => ({ kod, metin, hedef });

// Kimliği tam sayı olmayan kaynak (motorun fasoncu ya da kişi tezgâhı) hedef olmaz.
export function hedef(tur: PlanlanamamaHedefi['tur'], id: unknown, ad: string | null | undefined): PlanlanamamaHedefi | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? { tur, id: n, ad: ad ?? String(n) } : null;
}

export const NEDEN_OLCULEMEDI = yerlesmemeNedeni('bilinmiyor', 'Sunucu motoru yerleştiremedi; nedeni ölçülemedi.');
export const sureBos = (istasyon: PlanlanamamaHedefi | null) =>
  yerlesmemeNedeni('sure-bos', `Adımın ${istasyon === null ? '' : `${istasyon.ad} istasyonundaki `}işlem süresi girilmemiş.`, istasyon);
export const istasyonPasif = (istasyon: PlanlanamamaHedefi) => yerlesmemeNedeni('istasyon-pasif', `${istasyon.ad} istasyonu pasif.`, istasyon);
export const makineYok = (istasyon: PlanlanamamaHedefi) => yerlesmemeNedeni('makine-yok', `${istasyon.ad} istasyonunda aktif makine yok.`, istasyon);
export const yetkinKisiYok = (istasyon: PlanlanamamaHedefi) =>
  yerlesmemeNedeni('yetkin-kisi-yok', `${istasyon.ad} insanlı istasyonunda yetkin kişi tanımlı değil.`, istasyon);
export const istasyonKisiVardiyasiz = (istasyon: PlanlanamamaHedefi) =>
  yerlesmemeNedeni('kisi-vardiyasiz', `${istasyon.ad} istasyonundaki yetkin kişilerin hiçbirinin vardiyası seçilmemiş.`, istasyon);
// B-2482-33: adımda insanlı istasyonun makinesi seçili; motor o makineye istasyonun vardiyalı yetkin kişisini ister. Düzeltme kişidedir
// (vardiya ya da yetkinlik); makine adı iletide kalır ki kullanıcı adımı tanısın.
export const insanliMakine = (makineAdi: string, istasyon: PlanlanamamaHedefi, yetkinVar: boolean) => (yetkinVar
  ? yerlesmemeNedeni('kisi-vardiyasiz', `${makineAdi} makinesi insanlı ${istasyon.ad} istasyonunda; istasyondaki yetkin kişilerin hiçbirinin vardiyası seçilmemiş.`, istasyon)
  : yerlesmemeNedeni('yetkin-kisi-yok', `${makineAdi} makinesi insanlı ${istasyon.ad} istasyonunda; istasyonda yetkin kişi tanımlı değil.`, istasyon));

// Motorun 'zaman' nedeni (aday tezgâh var, ufukta yer yok) aday tezgâhların ölçüsüyle ayrılır. Ölçüler motorun kendi derlemesindendir.
export interface ZamanAdayi {
  makine: PlanlanamamaHedefi | null;
  // Ufuk içinde tezgâhın işleme açık saati (vardiya takvimi, tatil ve kapalı gün düşülmüş).
  acikSaat: number;
  // İşin bu tezgâhta ayar ve işleme süresi, saat.
  sureSaat: number;
  // Tezgâhın işçi kısıtı ufkun hiçbir diliminde karşılanmıyor (yetkin kişi, grup personeli ya da ayarcı).
  personelYok: boolean;
}
export function zamanNedeni(g: { ufukGun: number; malzemeHazirSaat: number | null; adaylar: readonly ZamanAdayi[] }): YerlesmemeNedeni {
  const ufuk = `planlama ufkunda (${String(g.ufukGun)} gün)`;
  if (g.malzemeHazirSaat !== null && g.malzemeHazirSaat >= g.ufukGun * 24) return yerlesmemeNedeni('malzeme', `Malzemesi ${ufuk} karşılanmıyor.`);
  const l = g.adaylar;
  if (l.length === 0) return NEDEN_OLCULEMEDI;
  const ad = (a: ZamanAdayi) => a.makine?.ad ?? 'aday tezgâh';
  const ilk = l[0]!;
  if (l.every((a) => !(a.acikSaat > 0))) {
    return yerlesmemeNedeni('takvim-yok', l.length === 1 ? `${ad(ilk)} tezgâhının ${ufuk} vardiyası yok.` : `Aday tezgâhların hiçbirinin ${ufuk} vardiyası yok (${l.map(ad).join(', ')}).`, ilk.makine);
  }
  const vardiyali = l.filter((a) => a.acikSaat > 0);
  if (vardiyali.every((a) => a.personelYok)) {
    const p = vardiyali[0]!;
    return yerlesmemeNedeni('kisi-vardiyasiz', `${ad(p)} tezgâhı için ${ufuk} vardiyada çalışacak yetkin kişi yok.`, p.makine);
  }
  const uygun = vardiyali.filter((a) => !a.personelYok);
  const saat = (x: number) => (Math.round(x * 10) / 10).toLocaleString('tr-TR');
  if (uygun.every((a) => a.sureSaat > a.acikSaat)) {
    const p = uygun.reduce((x, y) => (y.acikSaat > x.acikSaat ? y : x));
    return yerlesmemeNedeni('ufuk', `İşin süresi (${saat(p.sureSaat)} sa) ${ad(p)} tezgâhının ${ufuk} açık süresinden (${saat(p.acikSaat)} sa) uzun.`, p.makine);
  }
  const p = uygun[0]!;
  return yerlesmemeNedeni('ufuk', uygun.length === 1 ? `${ad(p)} tezgâhı ${ufuk} dolu.` : `Aday tezgâhlar ${ufuk} dolu (${uygun.map(ad).join(', ')}).`, p.makine);
}
