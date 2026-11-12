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

// 3050 a: bekletme durum değil işarettir; bekleyen emrin yeri olan adımı yerinde kalır, yeri olmayanı motor yerleştirmez.
export const EMIR_BEKLEMEDE = yerlesmemeNedeni('emir-beklemede', 'Emir beklemede; bekletme kaldırılınca motor yerleştirir.');
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
  // Hazırlık ayarcı isterse: hazırlığın süresi ve ufukta tezgâhın hazırlık dilimlerinde ayarcının kesintisiz bulunduğu en uzun süre, saat.
  ayarci?: { gerekSaat: number; enUzunSaat: number } | null;
  // Hazırlığın süresi ve ufukta tezgâhın kesintisiz bloklarının (vardiyaların molalar içindeki birleşimi) en uzun çalışma süresi, saat.
  blok?: { gerekSaat: number; enUzunSaat: number } | null;
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
  const personelli = vardiyali.filter((a) => !a.personelYok);
  // 600 dakikanın üstünde saat de yazılır ki uzun hazırlık bir bakışta okunsun.
  const dk = (x: number) => { const d = Math.round(x * 60); return d > 600 ? `${d.toLocaleString('tr-TR')} dk, ${(Math.round(x * 10) / 10).toLocaleString('tr-TR')} sa` : `${d.toLocaleString('tr-TR')} dk`; };
  const blokSigmaz = (a: ZamanAdayi) => a.blok != null && a.blok.gerekSaat > a.blok.enUzunSaat + 1e-9;
  if (personelli.every(blokSigmaz)) {
    const p = personelli.reduce((x, y) => (y.blok!.enUzunSaat > x.blok!.enUzunSaat ? y : x));
    return yerlesmemeNedeni('takvim-yok', `${ad(p)} tezgâhında hazırlık (${dk(p.blok!.gerekSaat)}) tezgâhın kesintisiz çalıştığı süreden (${dk(p.blok!.enUzunSaat)}) uzun; hazırlık bölünmez. Hazırlık süresini kontrol edin ya da tezgâhın vardiyasını uzatın.`, p.makine);
  }
  const ayarSigmaz = (a: ZamanAdayi) => blokSigmaz(a) || (a.ayarci != null && a.ayarci.gerekSaat > a.ayarci.enUzunSaat + 1e-9);
  if (personelli.every(ayarSigmaz)) {
    const ayarcili = personelli.filter((a) => !blokSigmaz(a));
    const p = ayarcili.reduce((x, y) => (y.ayarci!.enUzunSaat > x.ayarci!.enUzunSaat ? y : x));
    const z = p.ayarci!;
    return yerlesmemeNedeni('kisi-vardiyasiz', z.enUzunSaat > 0
      ? `${ad(p)} tezgâhında hazırlık (${dk(z.gerekSaat)}) ayarcının kesintisiz bulunduğu süreden (${dk(z.enUzunSaat)}) uzun; hazırlık süresini kontrol edin ya da tezgâhın ayarcısız vardiyalarına ayarcı atayın.`
      : `${ad(p)} tezgâhının vardiyalarında ${ufuk} ayarcı yok.`, p.makine);
  }
  const uygun = personelli.filter((a) => !ayarSigmaz(a));
  const saat = (x: number) => (Math.round(x * 10) / 10).toLocaleString('tr-TR');
  if (uygun.every((a) => a.sureSaat > a.acikSaat)) {
    const p = uygun.reduce((x, y) => (y.acikSaat > x.acikSaat ? y : x));
    return yerlesmemeNedeni('ufuk', `İşin süresi (${saat(p.sureSaat)} sa) ${ad(p)} tezgâhının ${ufuk} açık süresinden (${saat(p.acikSaat)} sa) uzun.`, p.makine);
  }
  const p = uygun[0]!;
  return yerlesmemeNedeni('ufuk', uygun.length === 1 ? `${ad(p)} tezgâhı ${ufuk} dolu.` : `Aday tezgâhlar ${ufuk} dolu (${uygun.map(ad).join(', ')}).`, p.makine);
}

// 2779: planlanabilirlik sayfasının adım kontrolleri. Her yuva bir kontroldür ve kodu 2780 listesindendir; ölçülemeyen yuva uydurulmaz,
// 'olculemedi' döner. Kök ilk 'eksik' yuvanın kodudur.
export type KontrolYuvasi = 'rota' | 'sure' | 'kaynak' | 'yetki' | 'takvim' | 'kisi' | 'malzeme' | 'ufuk' | 'oncul';
export type KontrolOlcusu = { durum: 'tamam' } | { durum: 'olculemedi' } | { durum: 'eksik'; neden: YerlesmemeNedeni };
export interface AdimKontrolu { kod: PlanlanamamaNedeni; durum: 'tamam' | 'eksik' | 'olculemedi'; metin: string; hedef: PlanlanamamaHedefi | null; yaklasik: boolean }
const YUVALAR: Record<KontrolYuvasi, { kod: PlanlanamamaNedeni; tamam: string; kapsar: readonly PlanlanamamaNedeni[] }> = {
  rota: { kod: 'rotada-yok', tamam: 'Adım ürünün yürürlükteki rotasında.', kapsar: ['rotada-yok'] },
  sure: { kod: 'sure-bos', tamam: 'İşlem süresi girilmiş.', kapsar: ['sure-bos'] },
  kaynak: {
    kod: 'makine-yok', tamam: 'Adımın aktif makinesi ya da yetkin kişisi var.',
    kapsar: ['istasyon-yok', 'istasyon-pasif', 'makine-yok', 'makine-pasif', 'kisi-pasif', 'yetkin-kisi-yok', 'insanli-makine', 'ek-adaysiz'],
  },
  yetki: { kod: 'yetki-disi', tamam: 'Adımın kaynakları görebildiğiniz kaynaklar içinde.', kapsar: ['yetki-disi'] },
  takvim: { kod: 'takvim-yok', tamam: 'Tezgâhın vardiyası var.', kapsar: ['takvim-yok'] },
  kisi: { kod: 'kisi-vardiyasiz', tamam: 'Vardiyada çalışacak yetkin kişi var.', kapsar: ['kisi-vardiyasiz'] },
  malzeme: { kod: 'malzeme', tamam: 'Malzemesi planlama ufkunda karşılanıyor.', kapsar: ['malzeme'] },
  ufuk: { kod: 'ufuk', tamam: 'Planlama ufkunda yer var.', kapsar: ['ufuk'] },
  oncul: { kod: 'oncul', tamam: 'Önceki adımlar yerleşti.', kapsar: ['oncul', 'bagli-parti'] },
};
export const EMIR_YUVALARI: readonly KontrolYuvasi[] = ['rota', 'sure', 'kaynak', 'yetki', 'takvim', 'kisi', 'malzeme', 'ufuk', 'oncul'];
// Rota sekmesi emre bağlı yuvaları (rota revizyonu, yetki, malzeme, ufuk, öncül) döndürmez.
export const ROTA_YUVALARI: readonly KontrolYuvasi[] = ['sure', 'kaynak', 'takvim', 'kisi'];
const OLCULEMEDI = 'Ölçülmedi; önce üstteki eksik giderilmeli.';
export const yuvasi = (kod: PlanlanamamaNedeni): KontrolYuvasi | null =>
  (Object.keys(YUVALAR) as KontrolYuvasi[]).find((y) => YUVALAR[y].kapsar.includes(kod)) ?? null;

export function kontrolleriKur(yuvalar: readonly KontrolYuvasi[], olc: (y: KontrolYuvasi) => KontrolOlcusu, ek: YerlesmemeNedeni | null = null):
{ kok: PlanlanamamaNedeni | null; kontroller: AdimKontrolu[] } {
  const kontroller: AdimKontrolu[] = yuvalar.map((y) => {
    const o = olc(y), yaklasik = y === 'ufuk';
    if (o.durum === 'eksik') return { kod: o.neden.kod, durum: 'eksik', metin: o.neden.metin, hedef: o.neden.hedef, yaklasik };
    return { kod: YUVALAR[y].kod, durum: o.durum, metin: o.durum === 'tamam' ? YUVALAR[y].tamam : OLCULEMEDI, hedef: null, yaklasik };
  });
  if (ek !== null) kontroller.push({ kod: ek.kod, durum: 'eksik', metin: ek.metin, hedef: ek.hedef, yaklasik: false });
  return { kok: kontroller.find((k) => k.durum === 'eksik')?.kod ?? null, kontroller };
}

// Motorun tanısı sırayla ölçer: kaynak (adayNedeni), sonra zaman (malzeme, tezgâh vardiyası, kişi, ufuk). Tanının yuvasından önceki yuva
// yalnız tanı onu geçtiyse 'tamam'dır; öncül, bölünmüş ve elle sıralı işte motor adımın kendi kontrollerine bakmaz.
const TANI_GECTI: Partial<Record<KontrolYuvasi, readonly KontrolYuvasi[]>> = {
  yetki: ['kaynak'], takvim: ['kaynak'], kisi: ['kaynak'], malzeme: ['kaynak'], ufuk: ['kaynak', 'takvim', 'kisi', 'malzeme'],
};
export const ROTADA_YOK = yerlesmemeNedeni('rotada-yok', 'Adım ürünün yürürlükteki rotasında yok; emir eski rota revizyonundan açıldı.');
export function emirAdimKontrolleri(n: YerlesmemeNedeni, a: { rotadaVar: boolean; sureVar: boolean; istasyon: PlanlanamamaHedefi | null }) {
  const e = yuvasi(n.kod);
  return kontrolleriKur(EMIR_YUVALARI, (y) => {
    if (y === e) return { durum: 'eksik', neden: n };
    if (y === 'rota') return a.rotadaVar ? { durum: 'tamam' } : { durum: 'eksik', neden: ROTADA_YOK };
    if (y === 'sure') return a.sureVar ? { durum: 'tamam' } : { durum: 'eksik', neden: sureBos(a.istasyon) };
    return e !== null && TANI_GECTI[e]?.includes(y) ? { durum: 'tamam' } : { durum: 'olculemedi' };
  }, e === null ? n : null);
}
