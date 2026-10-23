// Saf iş kuralları; veritabanı ve saat yok. Kural numaraları KURAL-TEST.md'de testlerine bağlıdır.
import {
  DEGER_EN_COK, GOREV_EN_UZUN_GUN, GOREV_ILERI_GUN, TUTAR_EN_COK, YEMEK_ILERI_GUN,
  type Arac, type AracDurumu, type DemirbasDurumu, type ElleDurum, type IadeDurumu, type AracUyarisi, type BugunIsi, type GorevDurumu, type KontrolGrubu, type KontrolTuru, type SiklikBirimi, type Talep, type TalepDurumu, type YapildiVerisi, type YemekBildirVerisi,
} from '#paylasilan/sozlesme/idari-isler.ts';

export const TALEP_YOK = 'Talep bulunamadı.';
export const KISI_YOK = 'Kişi bulunamadı ya da pasif.';
export const YALNIZ_ACAN = 'Talebi yalnız açan kişi geri çekebilir.';

// IDR-02: durum geçişleri. Kapanan, reddedilen ve geri çekilen talep son durumdadır.
export type TalepKomutu = 'ustlen' | 'birak' | 'kapat' | 'reddet' | 'geri-cek';
const GECISLER: Readonly<Record<TalepKomutu, { kaynak: readonly TalepDurumu[]; hedef: TalepDurumu }>> = {
  ustlen: { kaynak: ['yeni'], hedef: 'yapiliyor' },
  birak: { kaynak: ['yapiliyor'], hedef: 'yeni' },
  kapat: { kaynak: ['yeni', 'yapiliyor'], hedef: 'kapandi' },
  reddet: { kaynak: ['yeni', 'yapiliyor'], hedef: 'reddedildi' },
  'geri-cek': { kaynak: ['yeni'], hedef: 'geri_cekildi' },
};
const DURUM_ADI: Readonly<Record<TalepDurumu, string>> = {
  yeni: 'yeni', yapiliyor: 'yapılan', kapandi: 'kapanmış', reddedildi: 'reddedilmiş', geri_cekildi: 'geri çekilmiş',
};
const KOMUT_ADI: Readonly<Record<TalepKomutu, string>> = {
  ustlen: 'üstlenilemez', birak: 'bırakılamaz', kapat: 'kapatılamaz', reddet: 'reddedilemez', 'geri-cek': 'geri çekilemez',
};

export function gecisHedefi(komut: TalepKomutu): TalepDurumu {
  return GECISLER[komut].hedef;
}

export function gecisReddi(durum: TalepDurumu, komut: TalepKomutu): string | null {
  if (GECISLER[komut].kaynak.includes(durum)) return null;
  return `${DURUM_ADI[durum]} talep ${KOMUT_ADI[komut]}.`.replace(/^./, (h) => h.toLocaleUpperCase('tr'));
}

// IDR-03: geri çekmeyi yalnız açan yapar.
export function geriCekmeReddi(acanKisiId: number, kisiId: number): string | null {
  return acanKisiId === kisiId ? null : YALNIZ_ACAN;
}

export const sonDurumMu = (durum: TalepDurumu): boolean => durum === 'kapandi' || durum === 'reddedildi' || durum === 'geri_cekildi';

// IDR-09: Bugün sırası: acil talep, süresi geçen kontrol ve araç uyarısı, yeni talep, yapılan talep, yaklaşan kontrol ve araç uyarısı;
// her grupta eski (ya da erken) önce.
export function bugunSirasi(a: BugunIsi, b: BugunIsi): number {
  const derece = (i: BugunIsi): number => {
    if (i.tur === 'kontrol') return i.kontrol.kalanGun < 0 ? 1 : 4;
    if (i.tur === 'arac') return i.arac.uyarilar.some((u) => u.gecti) ? 1 : 4;
    return i.talep.aciliyet === 'acil' ? 0 : i.talep.durum === 'yeni' ? 2 : 3;
  };
  // Araçta zaman, uyarı veren en erken muayene ya da sigorta tarihidir; yalnız km uyarısı varsa tarihlilerden sonra gelir.
  const aracZamani = (a: Arac): string => a.uyarilar
    .map((u) => (u.tur === 'muayene' ? a.muayeneTarihi : u.tur === 'sigorta' ? a.sigortaTarihi : null))
    .filter((t): t is string => t !== null)
    .sort()[0] ?? '~';
  const zaman = (i: BugunIsi): string => (i.tur === 'kontrol' ? i.kontrol.sonrakiTarih : i.tur === 'arac' ? aracZamani(i.arac) : i.talep.acilma);
  const kimlik = (i: BugunIsi): number => (i.tur === 'kontrol' ? i.kontrol.id : i.tur === 'arac' ? i.arac.id : i.talep.id);
  return derece(a) - derece(b) || (zaman(a) < zaman(b) ? -1 : zaman(a) > zaman(b) ? 1 : kimlik(a) - kimlik(b));
}

// IDR-10: kişinin Bugün işleri: bütün yeni talepler ve kişinin üstlendiği yapılanlar.
export function senden(talep: Talep, kisiId: number): boolean {
  return talep.durum === 'yeni' || (talep.durum === 'yapiliyor' && talep.ustlenenKisiId === kisiId);
}

export const KONTROL_YOK = 'Kontrol kalemi bulunamadı.';
export const KONTROL_BITTI = 'Biten kalem değiştirilemez.';
export const FIRMA_YOK = 'Firma bulunamadı ya da pasif.';
export const YAPILMA_GELECEK = 'Yapılma tarihi bugünden sonra olamaz.';
export const ATIK_MIKTARI = 'Atık tesliminde miktar ve birim zorunlu.';
export const YALNIZ_ATIK_MIKTARI = 'Miktar yalnız atık tesliminde yazılır.';
export const MIKTAR_ARTI = 'Miktar sıfırdan büyük olmalı.';
export const SONRAKI_GEREK = 'Sıklığı olmayan kalemde sonraki tarih girilir.';
export const SONRAKI_ONCE = 'Sonraki tarih yapılma tarihinden sonra olmalı.';

// Tarihler GGGG-AA-GG metnidir; saat dilimi kayması olmasın diye UTC gün olarak hesaplanır.
const gun = (t: string): number => Date.parse(`${t}T00:00:00Z`) / 86_400_000;
const metin = (d: Date): string => d.toISOString().slice(0, 10);

export function gunFarki(sonra: string, once: string): number {
  return Math.round(gun(sonra) - gun(once));
}

// IDR-11: sonraki tarih yapılmadan sıklık kadar sonradır; ay ve yılda ay sonu taşmaz (31 Ocak + 1 ay = 28/29 Şubat).
export function tarihEkle(tarih: string, deger: number, birim: SiklikBirimi): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  if (birim === 'gun' || birim === 'hafta') {
    d.setUTCDate(d.getUTCDate() + deger * (birim === 'hafta' ? 7 : 1));
    return metin(d);
  }
  const ay = d.getUTCMonth() + deger * (birim === 'yil' ? 12 : 1);
  const hedef = new Date(Date.UTC(d.getUTCFullYear(), ay, 1));
  const sonGun = new Date(Date.UTC(hedef.getUTCFullYear(), hedef.getUTCMonth() + 1, 0)).getUTCDate();
  hedef.setUTCDate(Math.min(d.getUTCDate(), sonGun));
  return metin(hedef);
}

// IDR-12: süresi geçen, 30 gün içinde, daha sonra.
export const YAKIN_GUN = 30;
export function kontrolGrubu(kalanGun: number): KontrolGrubu {
  return kalanGun < 0 ? 'gecti' : kalanGun <= YAKIN_GUN ? 'yakin' : 'sonra';
}

// IDR-14: Bugün'e süresi geçen ve 7 gün içindeki kalem düşer.
export const BUGUN_GUN = 7;
export const bugundeMi = (kalanGun: number): boolean => kalanGun <= BUGUN_GUN;

interface KontrolOzu { tur: KontrolTuru; siklikDeger: number | null; siklikBirim: SiklikBirimi | null }

// IDR-13: "yapıldı" kaydının denetimi ve sonraki tarihi. Ret alanıyla döner.
export function yapildiSonucu(
  k: KontrolOzu, g: Pick<YapildiVerisi, 'yapilma' | 'sonrakiTarih' | 'miktar' | 'birim'>, bugun: string,
): { sonraki: string } | { ileti: string; alan: string } {
  if (g.yapilma > bugun) return { ileti: YAPILMA_GELECEK, alan: 'yapilma' };
  if (k.tur === 'atik' && (g.miktar === null || g.birim === null)) return { ileti: ATIK_MIKTARI, alan: g.miktar === null ? 'miktar' : 'birim' };
  if (k.tur !== 'atik' && (g.miktar !== null || g.birim !== null)) return { ileti: YALNIZ_ATIK_MIKTARI, alan: 'miktar' };
  if (g.miktar !== null && !(Number(g.miktar) > 0)) return { ileti: MIKTAR_ARTI, alan: 'miktar' };
  const sonraki = g.sonrakiTarih
    ?? (k.siklikDeger !== null && k.siklikBirim !== null ? tarihEkle(g.yapilma, k.siklikDeger, k.siklikBirim) : null);
  if (sonraki === null) return { ileti: SONRAKI_GEREK, alan: 'sonrakiTarih' };
  if (sonraki <= g.yapilma) return { ileti: SONRAKI_ONCE, alan: 'sonrakiTarih' };
  return { sonraki };
}

export const YEMEK_GECMIS = 'Geçmiş güne yemek sayısı bildirilmez.';
export const YEMEK_ILERI = `En çok ${YEMEK_ILERI_GUN} gün sonrası bildirilir.`;
export const NEDEN_GEREK = 'Düzeltmenin gerekçesi zorunlu.';
export const HESAP_DEGISTI = 'Kadro, izinli ya da fazla mesai sayısı değişti; sayılar yenilendi, yeniden bakıp bildirin.';
export const SAYI_EKSI = 'Bildirilecek sayı sıfırdan küçük olamaz.';

export interface YemekHesabi { kadro: number; izinli: number; fazlaMesai: number }

// IDR-18: günün kadrosu, vardiya kadrosunda olup o gün vardiyası başlayan kişilerdir; izinli, bu kişilerden o gün onaylı izinde olanlardır.
// Fazla mesai, o gün İK'da fazla mesai ya da tatil çalışması kaydı olan tekil kişilerdir; izinde görünen sayılmaz (ikisi birden olamaz,
// izin daha yeni karardır).
export function yemekKadrosu(
  calisanlar: readonly number[], izinliler: readonly number[], fazlaMesaililer: readonly number[] = [],
): YemekHesabi {
  const kadro = new Set(calisanlar);
  const izinde = new Set(izinliler);
  return {
    kadro: kadro.size,
    izinli: new Set(izinliler.filter((k) => kadro.has(k))).size,
    fazlaMesai: new Set(fazlaMesaililer.filter((k) => !izinde.has(k))).size,
  };
}

// IDR-16: bildirilecek sayı = kadro - izinli + fazla mesai + ziyaretçi + düzeltme.
export function yemekSayisi(g: Pick<YemekBildirVerisi, 'kadro' | 'izinli' | 'fazlaMesai' | 'ziyaretci' | 'duzeltme'>): number {
  return g.kadro - g.izinli + g.fazlaMesai + g.ziyaretci + g.duzeltme;
}

// IDR-17: bildirim denetimi. Gün bugün ile 7 gün sonrası arasındadır; düzeltme gerekçelidir; ekranın gördüğü kadro ve izinli sunucunun
// hesabıyla aynıdır (araya giren izin ya da fazla mesai kaydı sayıyı sessizce değiştirmesin); sayı eksi olmaz.
export function yemekBildirimReddi(
  g: YemekBildirVerisi, hesap: YemekHesabi, bugun: string,
): { ileti: string; alan: string } | null {
  if (g.tarih < bugun) return { ileti: YEMEK_GECMIS, alan: 'tarih' };
  if (gunFarki(g.tarih, bugun) > YEMEK_ILERI_GUN) return { ileti: YEMEK_ILERI, alan: 'tarih' };
  if (g.duzeltme !== 0 && g.duzeltmeNedeni === null) return { ileti: NEDEN_GEREK, alan: 'duzeltmeNedeni' };
  if (g.kadro !== hesap.kadro || g.izinli !== hesap.izinli || g.fazlaMesai !== hesap.fazlaMesai) return { ileti: HESAP_DEGISTI, alan: 'kadro' };
  if (yemekSayisi(g) < 0) return { ileti: SAYI_EKSI, alan: 'duzeltme' };
  return null;
}

export const ARAC_YOK = 'Araç bulunamadı.';
export const PLAKA_GECERSIZ = 'Plaka "34 ABC 123" biçiminde olmalı.';
export const PLAKA_VAR = 'Bu plaka kayıtlı.';
export const KM_GERI = 'Km geriye yazılamaz.';

// IDR-20: plaka il kodu (01-81), 1-3 harf ve 2-5 rakamdır; boşluksuz ya da küçük harfle yazılan plaka "34 ABC 123" biçimine çevrilir.
export function plakaBicimle(metin: string): string | null {
  const sade = metin.replace(/[\s-]+/g, '').toUpperCase();
  const p = /^(\d{2})([A-Z]{1,3})(\d{2,5})$/.exec(sade);
  if (p === null) return null;
  const il = Number(p[1]);
  if (il < 1 || il > 81) return null;
  return `${p[1]} ${p[2]} ${p[3]}`;
}

// IDR-21: km azalmaz (sayaç değişimi açıklamayla yeni kartla izlenir).
export function kmReddi(eski: number | null, yeni: number | null): string | null {
  return eski !== null && yeni !== null && yeni < eski ? KM_GERI : null;
}

// IDR-19: muayene ve sigorta 30 gün içinde ya da geçmişse, bakıma 1000 km ya da daha az kaldıysa uyarı; pasif araçta uyarı yok.
export const ARAC_UYARI_GUN = 30;
export const BAKIM_UYARI_KM = 1000;
interface AracOzu {
  durum: AracDurumu; km: number | null; sonrakiBakimKm: number | null; muayeneTarihi: string | null; sigortaTarihi: string | null;
}
export function aracUyarilari(a: AracOzu, bugun: string): AracUyarisi[] {
  if (a.durum === 'pasif') return [];
  const sonuc: AracUyarisi[] = [];
  for (const [tur, tarih] of [['muayene', a.muayeneTarihi], ['sigorta', a.sigortaTarihi]] as const) {
    if (tarih === null) continue;
    const kalan = gunFarki(tarih, bugun);
    if (kalan <= ARAC_UYARI_GUN) sonuc.push({ tur, gecti: kalan < 0, kalanGun: kalan, kalanKm: null });
  }
  if (a.km !== null && a.sonrakiBakimKm !== null) {
    const kalan = a.sonrakiBakimKm - a.km;
    if (kalan <= BAKIM_UYARI_KM) sonuc.push({ tur: 'bakim', gecti: kalan < 0, kalanGun: null, kalanKm: kalan });
  }
  return sonuc;
}

// IDR-22: Bugün'e muayenesi ya da sigortası geçen ya da 7 gün içinde olan ve bakım km'si geçen araç düşer.
export const aracBugundeMi = (uyarilar: readonly AracUyarisi[]): boolean =>
  uyarilar.some((u) => u.gecti || (u.kalanGun !== null && u.kalanGun <= BUGUN_GUN));

export const GOREV_YOK = 'Araç görevi bulunamadı.';
export const GOREV_TARIH_GECMIS = 'Geçmiş güne araç talebi açılmaz.';
export const GOREV_TARIH_ILERI = `En çok ${GOREV_ILERI_GUN} gün sonrasına talep açılır.`;
export const DONUS_ONCE = 'Dönüş tarihi gidiş tarihinden önce olamaz.';
export const GOREV_UZUN = `Görev en çok ${GOREV_EN_UZUN_GUN} gün sürer.`;
export const ARAC_VERILEMEZ = 'Pasif ya da serviste olan araç göreve verilmez.';
export const ARAC_DOLU = 'Araç bu tarihlerde başka bir görevde.';
export const CIKIS_KM_GERI = 'Çıkış km\'si aracın kayıtlı km\'sinden küçük olamaz.';
export const DONUS_KM_GERI = 'Dönüş km\'si çıkış km\'sinden küçük olamaz.';

// IDR-23: görev durum geçişleri. Onaylı görev de reddedilebilir ve geri çekilebilir (araç çıkmadan); yoldaki görev yalnız dönüşle kapanır.
export type GorevKomutu = 'onayla' | 'reddet' | 'geri-cek' | 'cikis' | 'donus';
const GOREV_GECISLERI: Readonly<Record<GorevKomutu, { kaynak: readonly GorevDurumu[]; hedef: GorevDurumu }>> = {
  onayla: { kaynak: ['bekliyor'], hedef: 'onaylandi' },
  reddet: { kaynak: ['bekliyor', 'onaylandi'], hedef: 'reddedildi' },
  'geri-cek': { kaynak: ['bekliyor', 'onaylandi'], hedef: 'geri_cekildi' },
  cikis: { kaynak: ['onaylandi'], hedef: 'yolda' },
  donus: { kaynak: ['yolda'], hedef: 'tamamlandi' },
};
const GOREV_DURUM_ADI: Readonly<Record<GorevDurumu, string>> = {
  bekliyor: 'bekleyen', onaylandi: 'onaylı', yolda: 'yoldaki', tamamlandi: 'tamamlanmış', reddedildi: 'reddedilmiş', geri_cekildi: 'geri çekilmiş',
};
const GOREV_KOMUT_ADI: Readonly<Record<GorevKomutu, string>> = {
  onayla: 'onaylanamaz', reddet: 'reddedilemez', 'geri-cek': 'geri çekilemez', cikis: 'çıkışı yazılamaz', donus: 'dönüşü yazılamaz',
};

export function gorevHedefi(komut: GorevKomutu): GorevDurumu {
  return GOREV_GECISLERI[komut].hedef;
}

export function gorevGecisReddi(durum: GorevDurumu, komut: GorevKomutu): string | null {
  if (GOREV_GECISLERI[komut].kaynak.includes(durum)) return null;
  return `${GOREV_DURUM_ADI[durum]} görev ${GOREV_KOMUT_ADI[komut]}.`.replace(/^./, (h) => h.toLocaleUpperCase('tr'));
}

// IDR-24: talep bugün ile 60 gün sonrası arasında açılır; dönüş gidişten önce olmaz; görev en çok 30 gün sürer.
export function gorevTarihReddi(g: { tarih: string; donusTarihi: string }, bugun: string): { ileti: string; alan: string } | null {
  if (g.tarih < bugun) return { ileti: GOREV_TARIH_GECMIS, alan: 'tarih' };
  if (gunFarki(g.tarih, bugun) > GOREV_ILERI_GUN) return { ileti: GOREV_TARIH_ILERI, alan: 'tarih' };
  if (g.donusTarihi < g.tarih) return { ileti: DONUS_ONCE, alan: 'donusTarihi' };
  if (gunFarki(g.donusTarihi, g.tarih) > GOREV_EN_UZUN_GUN) return { ileti: GOREV_UZUN, alan: 'donusTarihi' };
  return null;
}

// IDR-25: pasif ya da serviste olan araç göreve verilmez; aynı araç kesişen tarihlerde iki onaylı ya da yoldaki görevde olmaz (çakışma sorguda).
export function aracVerilemezMi(durum: AracDurumu): boolean {
  return durum === 'pasif' || durum === 'serviste';
}

// IDR-26: çıkış km'si aracın kayıtlı km'sinden, dönüş km'si çıkıştan küçük olmaz.
export function cikisKmReddi(aracKm: number | null, km: number): string | null {
  return aracKm !== null && km < aracKm ? CIKIS_KM_GERI : null;
}
export function donusKmReddi(cikisKm: number, km: number): string | null {
  return km < cikisKm ? DONUS_KM_GERI : null;
}

export const MASRAF_YOK = 'Masraf kaydı bulunamadı.';
export const MASRAF_IPTALLI = 'Masraf kaydı zaten iptal edilmiş.';
export const MASRAF_GELECEK = 'Masraf tarihi bugünden ileri olamaz.';
export const TUTAR_GECERSIZ = 'Tutar sıfırdan büyük, en çok iki kuruş basamaklı olmalı.';

// IDR-27: tutar sıfırdan büyük, en çok iki kuruş basamaklı ve sınır içinde; masraf tarihi bugünden ileri değil.
export function masrafReddi(g: { tutar: string; tarih: string }, bugun: string): { ileti: string; alan: string } | null {
  if (g.tarih > bugun) return { ileti: MASRAF_GELECEK, alan: 'tarih' };
  return tutarGecerliMi(g.tutar, TUTAR_EN_COK) ? null : { ileti: TUTAR_GECERSIZ, alan: 'tutar' };
}

function tutarGecerliMi(tutar: string, enCok: string): boolean {
  const kurus = tutar.split('.')[1] ?? '';
  return !tutar.startsWith('-') && kurus.length <= 2 && Number(tutar) > 0 && Number(tutar) <= Number(enCok);
}

export const DEMIRBAS_YOK = 'Demirbaş bulunamadı.';
export const ZIMMET_YOK = 'Zimmet kaydı bulunamadı.';
export const DEGER_GECERSIZ = 'Değer sıfırdan büyük, en çok iki kuruş basamaklı olmalı.';
export const ZIMMETLENEMEZ = 'Yalnız boşta olan demirbaş zimmetlenir.';
export const ZIMMETLI_ELLE = 'Zimmetli demirbaşın durumu iadeyle değişir.';
export const HURDA_SON = 'Hurdaya ayrılmış demirbaşın durumu değişmez.';
export const VERILIS_GELECEK = 'Veriliş tarihi bugünden ileri olamaz.';
export const IADE_GELECEK = 'İade tarihi bugünden ileri olamaz.';
export const IADE_ONCE = 'İade tarihi veriliş tarihinden önce olamaz.';
export const ZIMMET_IADE_EDILMIS = 'Zimmet zaten iade alınmış.';
export const ZIMMET_BAGLI = 'Zimmet zaten bir kişiye bağlı.';

// Ekranda ve zimmet formunda görünen demirbaş numarası.
export const demirbasNo = (id: number): string => `DB-${String(id).padStart(5, '0')}`;

// IDR-29: değer yoksa null; varsa sıfırdan büyük, en çok iki kuruş basamaklı ve sınır içinde.
export function degerReddi(deger: string | null): string | null {
  return deger === null || tutarGecerliMi(deger, DEGER_EN_COK) ? null : DEGER_GECERSIZ;
}

// IDR-30: zimmetli durumu yalnız zimmet yazar ve iade bitirir; hurda son durumdur.
export function elleDurumReddi(mevcut: DemirbasDurumu, yeni: ElleDurum): string | null {
  if (mevcut === yeni) return null;
  if (mevcut === 'zimmetli') return ZIMMETLI_ELLE;
  if (mevcut === 'hurda') return HURDA_SON;
  return null;
}

export function zimmetlemeReddi(durum: DemirbasDurumu, verilis: string, bugun: string): { ileti: string; alan: string } | null {
  if (durum !== 'bosta') return { ileti: ZIMMETLENEMEZ, alan: 'kisiId' };
  if (verilis > bugun) return { ileti: VERILIS_GELECEK, alan: 'verilis' };
  return null;
}

// IDR-31: iade bugünden ileri ve verilişten önce olmaz; iade durumu demirbaşın yeni durumunu belirler.
export function iadeReddi(verilis: string | null, iade: string, bugun: string): string | null {
  if (iade > bugun) return IADE_GELECEK;
  if (verilis !== null && iade < verilis) return IADE_ONCE;
  return null;
}

export function iadeSonrasiDurum(iadeDurumu: IadeDurumu): DemirbasDurumu {
  return iadeDurumu === 'saglam' ? 'bosta' : iadeDurumu === 'hasarli' ? 'bakimda' : 'kayip';
}
