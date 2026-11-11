import type { GeriBildirimDurumu, GeriBildirimKonusu, MenuTercihiCevabi, MiniPanoCevabi, TemaCevabi, TemaTercihi } from '#paylasilan/sozlesme/profil.ts';

// PRF-1: kişinin profilinde son 50 geri bildirimi görünür; daha eskisi okuyanın listesindedir.
export const PROFIL_GERI_BILDIRIM_SINIRI = 50;

// PRF-2: profildeki izin listesi bugünden bir yıl geriye ve bir yıl ileriye bakar (önümüzdeki onaylı izinler dahil).
// PRF-3: fazla mesai bu takvim yılının başından bugüne.
export function profilAraliklari(bugun: string): { izinBaslangic: string; izinBitis: string; mesaiBaslangic: string; mesaiBitis: string } {
  const [y, a, g] = bugun.split('-').map(Number) as [number, number, number];
  const kaydir = (yil: number): string => {
    // 29 Şubat bir yıl kayınca 28 Şubat olur: geçersiz tarih motorda reddedilir.
    const gun = a === 2 && g === 29 ? 28 : g;
    return `${String(yil).padStart(4, '0')}-${String(a).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
  };
  return { izinBaslangic: kaydir(y - 1), izinBitis: kaydir(y + 1), mesaiBaslangic: `${String(y).padStart(4, '0')}-01-01`, mesaiBitis: bugun };
}

// PRF-4: fazla mesai toplamı yalnız saati girilmiş satırların toplamıdır; hiç saat yoksa null (sıfır uydurulmaz).
export function mesaiToplami(satirlar: readonly { saat: number | null }[]): number | null {
  const saatler = satirlar.map((s) => s.saat).filter((s): s is number => s !== null);
  if (saatler.length === 0) return null;
  return Math.round(saatler.reduce((t, s) => t + s, 0) * 100) / 100;
}

// PRF-5: kaydı olmayan kişinin teması null, sürümü 0 (ilk seçim bu sürümle yazılır); tema uydurulmaz.
export function temaCevabiYap(satir: { tema: TemaTercihi; surum: number } | null): TemaCevabi {
  return satir === null ? { tema: null, surum: 0 } : { tema: satir.tema, surum: satir.surum };
}

// PRF-6: kaydı olmayan kişide bütün mini panolar açık, açılışta öneri kapalı, sürüm 0; kapalı liste sıralı döner.
export function miniPanoCevabiYap(satir: { kapali: readonly string[]; acilistaOner: boolean; surum: number } | null): MiniPanoCevabi {
  return satir === null
    ? { kapali: [], acilistaOner: false, surum: 0 }
    : { kapali: [...satir.kapali].sort(), acilistaOner: satir.acilistaOner, surum: satir.surum };
}

// PRF-7 (2951): kaydı olmayan kişinin sık kullanılanı yoktur, sürümü 0; liste kişinin seçtiği sırayla döner.
export function menuCevabiYap(satir: { sayfalar: readonly string[]; surum: number } | null, acabildigi: ReadonlySet<string>): MenuTercihiCevabi {
  return satir === null ? { sayfalar: [], surum: 0 } : { sayfalar: acabildigiSayfalar(satir.sayfalar, acabildigi), surum: satir.surum };
}

// PRF-8 (2951): seçilen her yol bilinen bir menü sayfası olmalı; bilinmeyenler döner.
export function bilinmeyenMenuSayfalari(secilen: readonly string[], bilinen: ReadonlySet<string>): string[] {
  return secilen.filter((yol) => !bilinen.has(yol));
}

// PRF-9 (2951): liste kişinin açabildiği sayfalara süzülür, sıra korunur. Yazarken açamadığı sayfa kaydedilmez; okurken
// yetkisi sonradan kalkan sayfa dönmez. Yetki vermez, yalnız görünürlüktür.
export function acabildigiSayfalar(sayfalar: readonly string[], acabildigi: ReadonlySet<string>): string[] {
  return sayfalar.filter((yol) => acabildigi.has(yol));
}

// Geri Bildirim Merkezi (kart 2192).

// GBM-1: takip satırı olmayan kayıt "yeni"dir; durum uydurulmaz, satır ilk yazımda açılır.
export function kayitDurumu(takip: { durum: GeriBildirimDurumu } | null): GeriBildirimDurumu {
  return takip === null ? 'yeni' : takip.durum;
}

// GBM-2: yanıt açık kaydı "yanıtlandı"ya taşır; çözülmüş ya da kapanmış kayda yazılan ek yanıt durumu değiştirmez.
export function yanitSonrasiDurum(durum: GeriBildirimDurumu): GeriBildirimDurumu {
  return durum === 'yeni' || durum === 'inceleniyor' ? 'yanitlandi' : durum;
}

// GBM-3: yanıt çalışana rol adıyla görünür (2192-2 b). Yanıtlayanın yönetici bayrağı olmayan rollerinden adı sıraca ilki;
// yalnız bayraklı rolü varsa "Yönetim". Kişi adı imzaya girmez.
export const YONETIM_IMZASI = 'Yönetim';
export function yanitImzasi(roller: readonly { ad: string; yonetici: boolean }[]): string {
  const adlar = roller.filter((r) => !r.yonetici).map((r) => r.ad).sort((a, b) => a.localeCompare(b, 'tr'));
  return adlar[0] ?? YONETIM_IMZASI;
}

// GBM-4: toplama tek kademedir. Kayıt kendine bağlanmaz; başka kayda bağlı olana bağlanılmaz; kendisine bağlı kayıt olan
// kayıt başkasına bağlanmaz. Hata metni döner, geçerse null.
export function anaKayitHatasi(a: { id: number; anaKayitId: number | null; ananinAnasi: number | null; bagliSayisi: number }): string | null {
  if (a.anaKayitId === null) return null;
  if (a.anaKayitId === a.id) return 'Kayıt kendisine bağlanamaz.';
  if (a.ananinAnasi !== null) return `#${a.anaKayitId} başka bir kayda bağlı; ana kayda bağlayın (#${a.ananinAnasi}).`;
  if (a.bagliSayisi > 0) return 'Bu kayda bağlı kayıtlar var; önce onları ayırın ya da bu kaydı ana kayıt olarak bırakın.';
  return null;
}

// GBM-5: pasif kategori yeni kayda seçilmez; kayıtta zaten seçili olan pasif kategori kalabilir.
export function kategoriSecilebilir(k: { id: number; etkin: boolean } | null, mevcutId: number | null): boolean {
  return k !== null && (k.etkin || k.id === mevcutId);
}

// GBM-6: ilk yanıt süresinin ortancası (saat, iki ondalık); yanıtlanmış kayıt yoksa null (sıfır uydurulmaz).
export function ortanca(degerler: readonly number[]): number | null {
  if (degerler.length === 0) return null;
  const s = [...degerler].sort((a, b) => a - b);
  const o = Math.floor(s.length / 2);
  const orta = s[o] ?? 0;
  const deger = s.length % 2 === 1 ? orta : ((s[o - 1] ?? orta) + orta) / 2;
  return Math.round(deger * 100) / 100;
}

// GBM-7: eğilim son altı ayı gösterir (bu ay dahil); başlangıç altı ay önceki ayın ilk günüdür. Gelmeyen ay sıfır satırla
// listelenir (o ay kayıt yoktur, sayı gerçektir); süre yoksa null kalır.
export const OZET_AY_SAYISI = 6;
export function ozetAylari(bugun: string): string[] {
  const [y, a] = bugun.split('-').map(Number) as [number, number];
  const aylar: string[] = [];
  for (let i = OZET_AY_SAYISI - 1; i >= 0; i -= 1) {
    const toplam = y * 12 + (a - 1) - i;
    aylar.push(`${String(Math.floor(toplam / 12)).padStart(4, '0')}-${String((toplam % 12) + 1).padStart(2, '0')}`);
  }
  return aylar;
}

// GBM-8: konu "uygulama" olan kayıt ayrı türle duyurulur; alıcısı Bildirim yönetiminden ayrı seçilebilir.
export const gelenBildirimTuru = (konu: GeriBildirimKonusu): 'profil.geri-bildirim-geldi' | 'profil.uygulama-geri-bildirimi-geldi' =>
  (konu === 'uygulama' ? 'profil.uygulama-geri-bildirimi-geldi' : 'profil.geri-bildirim-geldi');

// GBM-9: yazana kapanış bildirimi yalnız kayıt açıkken "çözüldü" ya da "kapandı"ya geçince gider; sonuçlanmış kayıt
// iki sonuç arasında değişirse ikinci kez gitmez.
const SONUCLANMIS: readonly GeriBildirimDurumu[] = ['cozuldu', 'kapandi'];
export const kapanisBildirilir = (onceki: GeriBildirimDurumu, yeni: GeriBildirimDurumu): boolean =>
  SONUCLANMIS.includes(yeni) && !SONUCLANMIS.includes(onceki);
