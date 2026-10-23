import type { VeriIslemi } from '#paylasilan/islemler.ts';
import type { IkAlani, IkRolu, IkTuru, PuantajDurumu } from '#paylasilan/sozlesme/ik.ts';

/* İnsan Kaynakları kuralları: IK-1..IK-26. Saf fonksiyonlar; veritabanı ve saat yok (bugün parametre olarak gelir). */

export type Govde = Record<string, unknown>;
export interface KuralHatasi { kod: 'YETKI_YOK' | 'GECERSIZ' | 'DOGRULAMA' | 'CAKISMA'; mesaj: string; alan?: string }

const yetki = (mesaj: string): KuralHatasi => ({ kod: 'YETKI_YOK', mesaj });
const gecersiz = (mesaj: string): KuralHatasi => ({ kod: 'GECERSIZ', mesaj });
const cakisma = (mesaj: string): KuralHatasi => ({ kod: 'CAKISMA', mesaj });
const dogrulama = (mesaj: string, alan: string): KuralHatasi => ({ kod: 'DOGRULAMA', mesaj, alan });
const metin = (v: unknown): string => (typeof v === 'string' ? v : '');
const dolu = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

// IK-0: her yazma alanının kendi işlemi vardır; uç o işlemi ister ("her rol her şeyi yazar" tek uç yoktur).
export const IK_ALANLARI = {
  personel: { tur: 'emp', islem: 'ik.personel-yaz' },
  departmanlar: { tur: 'dept', islem: 'ik.personel-yaz' },
  izinler: { tur: 'leave', islem: 'ik.izin-yaz' },
  devam: { tur: 'att', islem: 'ik.devam-yaz' },
  performans: { tur: 'perf', islem: 'ik.performans-yaz' },
  egitimler: { tur: 'train', islem: 'ik.egitim-yaz' },
  pozisyonlar: { tur: 'job', islem: 'ik.ise-alim-yaz' },
  adaylar: { tur: 'cand', islem: 'ik.ise-alim-yaz' },
  gorusmeler: { tur: 'intv', islem: 'ik.ise-alim-yaz' },
} as const satisfies Record<IkAlani, { tur: Exclude<IkTuru, 'pay'>; islem: VeriIslemi }>;

// Kişinin herhangi bir İK yazma işlemi var mı (yoksa ekran salt okunur açılır).
export const IK_YAZMA_ISLEMLERI: readonly string[] = [
  'ik.personel-yaz', 'ik.ucret-yaz', 'ik.izin-yaz', 'ik.izin-talep', 'ik.izin-onay', 'ik.devam-yaz', 'ik.devam-onay', 'ik.bordro-kesinlestir', 'ik.bordro-kilit-ac',
  'ik.performans-yaz', 'ik.egitim-yaz', 'ik.ise-alim-yaz', 'ik.pozisyon-onay', 'ik.ayar-yaz',
];

// IK-1: adres kimliği kaydın kimliğidir; kaydın türü uca uyar.
export function govdeKimligiDenetle(kimlik: string, tur: IkTuru, govde: Govde): KuralHatasi | null {
  if (govde['id'] !== kimlik) return dogrulama('Kaydın kimliği adresle aynı olmalı.', 'govde.id');
  if (govde['kind'] !== tur) return dogrulama('Kaydın türü bu uca uymuyor.', 'govde.kind');
  return null;
}

// IK-2: tek kayıt en çok 64 KB (dosya içeriği kayda girmez; büyük kayıt denetim kaydını da şişirir).
export const AZAMI_KAYIT_BAYT = 64 * 1024;
export function boyutDenetle(govde: Govde): KuralHatasi | null {
  return Buffer.byteLength(JSON.stringify(govde), 'utf8') > AZAMI_KAYIT_BAYT ? gecersiz('Kayıt çok büyük (en çok 64 KB).') : null;
}

// IK-3: kayıt zamanı, karar tarihi ve onaylayan sunucudan yazılır; istemcinin değeri atılır.
const SUNUCU_ALANLARI: Record<string, readonly string[]> = {
  '*': ['createdAt', 'updatedAt'],
  leave: ['talepTarihi', 'karar', 'onaylayanId'],
};
export function istemciAlanlariniAyikla(tur: IkTuru, govde: Govde): Govde {
  const temiz: Govde = { ...govde };
  for (const a of [...(SUNUCU_ALANLARI['*'] ?? []), ...(SUNUCU_ALANLARI[tur] ?? [])]) delete temiz[a];
  return temiz;
}

// IK-4: türün zorunlu alanları; kalan alanları ekran belirler.
const eksiMi = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && Number(v) < 0;

export function turDenetle(tur: IkTuru, g: Govde): KuralHatasi | null {
  switch (tur) {
    case 'emp':
      if (!dolu(g['ad'])) return dogrulama('Ad boş olamaz.', 'govde.ad');
      if (!dolu(g['soyad'])) return dogrulama('Soyad boş olamaz.', 'govde.soyad');
      break;
    case 'dept':
      if (!dolu(g['ad'])) return dogrulama('Departman adı boş olamaz.', 'govde.ad');
      // IK-79: eksi bütçe gider raporunu ters çevirir (Soru 112 b; veritabanında da kısıt).
      if (eksiMi(g['butce'])) return dogrulama('Bütçe eksi olamaz.', 'govde.butce');
      break;
    case 'leave': {
      if (!dolu(g['empId'])) return dogrulama('İzin bir personele bağlı olmalı.', 'govde.empId');
      if (!dolu(g['tur'])) return dogrulama('İzin türü boş olamaz.', 'govde.tur');
      const b = metin(g['baslangic']); const s = metin(g['bitis']);
      if (!TARIH.test(b) || !TARIH.test(s)) return dogrulama('İzin tarihleri GGGG-AA-GG biçiminde olmalı.', 'govde.baslangic');
      if (s < b) return dogrulama('Bitiş başlangıçtan önce olamaz.', 'govde.bitis');
      // IK-52: bakiye bu sayıyla düşer; sıfır ya da eksi gün bakiyeyi korur ya da artırır, takvim gününden fazlası şişirir.
      const gun = g['gun'];
      const takvimGunu = (Date.parse(`${s}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000 + 1;
      if (typeof gun !== 'number' || !Number.isFinite(gun) || gun <= 0 || gun > takvimGunu) {
        return dogrulama(`İzin günü 0'dan büyük ve tarih aralığındaki ${takvimGunu} günden az ya da eşit olmalı.`, 'govde.gun');
      }
      if (!['Beklemede', 'Onaylandı', 'Reddedildi', 'İptal'].includes(metin(g['durum']))) return dogrulama('İzin durumu geçersiz.', 'govde.durum');
      break;
    }
    case 'att': case 'perf':
      if (!dolu(g['empId'])) return dogrulama('Kayıt bir personele bağlı olmalı.', 'govde.empId');
      // IK-79: eksi süre fazla mesaiyi düşürür ve bordroya öyle geçer (Soru 112 b; veritabanında da kısıt).
      if (tur === 'att' && eksiMi(g['saat'])) return dogrulama('Süre eksi olamaz.', 'govde.saat');
      break;
    case 'job':
      if (!dolu(g['baslik'])) return dogrulama('Pozisyon adı boş olamaz.', 'govde.baslik');
      if (!['Taslak', 'Onay bekliyor', 'Açık', 'Beklemede', 'Kapandı'].includes(metin(g['durum']) || 'Taslak')) return dogrulama('Pozisyon durumu geçersiz.', 'govde.durum');
      break;
    case 'intv':
      if (!dolu(g['candId'])) return dogrulama('Görüşme bir adaya bağlı olmalı.', 'govde.candId');
      break;
    default:
      break;
  }
  return null;
}

/* ---------------- iş merkezi kapsamı: IK-27 (kullanıcı kararları 6, A, B; 08.10.2026) ---------------- */

const sayiMi = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
// Kaydın iş merkezi: personel ve pozisyonda kendi alanı; personele bağlı kayıtta personelin; aday ve görüşmede pozisyonun.
// Eğitim ve departman tek iş merkezine bağlı değildir (null); eğitimin katılımcıları ayrıca denetlenir.
export function kayitIsMerkezi(tur: IkTuru, g: Govde, bul: (kimlik: string) => Govde | null): number | null {
  const al = (kimlik: unknown): Govde | null => (typeof kimlik === 'string' ? bul(kimlik) : null);
  switch (tur) {
    case 'emp': case 'job': return sayiMi(g['isMerkeziId']) ? g['isMerkeziId'] : null;
    case 'leave': case 'att': case 'perf': case 'pay': { const e = al(g['empId']); return e && sayiMi(e['isMerkeziId']) ? e['isMerkeziId'] : null; }
    case 'cand': { const j = al(g['jobId']); return j && sayiMi(j['isMerkeziId']) ? j['isMerkeziId'] : null; }
    case 'intv': { const c = al(g['candId']); return c ? kayitIsMerkezi('cand', c, bul) : null; }
    default: return null;
  }
}
export function katilimciIsMerkezleri(g: Govde, bul: (kimlik: string) => Govde | null): (number | null)[] {
  return (Array.isArray(g['katilimcilar']) ? g['katilimcilar'] : []).map((k) => kayitIsMerkezi('leave', { empId: k }, bul));
}

/* ---------------- devam onayı: IK-77, IK-78 ---------------- */

export type DevamOnayi = 'Onaylandı' | 'Beklemede';
const DEVAM_ICERIGI = ['empId', 'tarih', 'tur', 'saat'] as const;
const devamOnayiOku = (g: Govde): DevamOnayi => (g['onay'] === 'Onaylandı' ? 'Onaylandı' : 'Beklemede');

// IK-77: devam kaydının onayı ayrı işlemdir (ik.devam-onay, Soru 105 a): kaydı giren onayını kendi veremez. Yetkisi olmayanın, onaycının
// kendi kaydının ve onaylı kaydı içeriğiyle değiştirenin yazdığı onay geçmez, kayıt onay bekler. Form "Onaylandı" önerdiği için ret
// yerine kayıt beklemeye alınır ve kişiye söylenir.
export function devamOnayiKur(g: { onceki: Govde | null; yeni: Govde; islemler: readonly string[]; benimPersonel: string | null }): { onay: DevamOnayi; uyari: string | null } {
  const istenen = devamOnayiOku(g.yeni);
  const kendi = g.benimPersonel !== null && metin(g.yeni['empId']) === g.benimPersonel;
  const yetkili = g.islemler.includes('ik.devam-onay') && !kendi;
  const degisti = g.onceki !== null && DEVAM_ICERIGI.some((k) => !esitMi(g.onceki![k] ?? null, g.yeni[k] ?? null));
  const onay = yetkili ? istenen : g.onceki === null || degisti ? 'Beklemede' : devamOnayiOku(g.onceki);
  if (onay === istenen) return { onay, uyari: null };
  return { onay, uyari: kendi && g.islemler.includes('ik.devam-onay') ? 'Kendi devam kaydınız onay bekler; başka bir onaycı onaylar.' : 'Devam kaydı onay bekliyor; onayı devam onay yetkisi olan verir.' };
}

// IK-78: onay ucu kaydın içeriğini değiştirmez; kimse kendi devam kaydını onaylayamaz.
export function devamOnayDenetle(onceki: Govde, benimPersonel: string | null): KuralHatasi | null {
  return benimPersonel !== null && metin(onceki['empId']) === benimPersonel ? yetki('Kendi devam kaydınızı onaylayamazsınız.') : null;
}

/* ---------------- izinler: IK-5..IK-9 ---------------- */

export type IzinUcu = 'kaydet' | 'talep' | 'karar' | 'onay';
export interface IzinGecisi {
  onceki: Govde | null;
  yeni: Govde;
  islemler: readonly string[];
  // İsteği yapan kişinin personel kaydı (IK-25); yoksa null.
  benimPersonel: string | null;
  uc: IzinUcu;
  // Talebin sahibi isteği yapanın ekibinde mi (IK-24).
  ekipte: boolean;
}

const IZIN_ICERIGI = ['empId', 'tur', 'baslangic', 'bitis', 'gun'] as const;
export const izinIcerigiDegistiMi = (a: Govde, b: Govde): boolean => IZIN_ICERIGI.some((k) => esitMi(a[k] ?? null, b[k] ?? null) === false);

export function izinGecisiDenetle(g: IzinGecisi): KuralHatasi | null {
  const onay = g.islemler.includes('ik.izin-onay');
  const once = g.onceki ? metin(g.onceki['durum']) : null;
  const sonra = metin(g.yeni['durum']);
  const kendi = g.benimPersonel !== null && metin(g.yeni['empId']) === g.benimPersonel;
  // IK-5: sonuçlanmış talep (ret, iptal) değişmez; yeni talep açılır.
  if (once === 'Reddedildi' || once === 'İptal') return gecersiz('Sonuçlanmış izin talebi değiştirilemez; yeni talep açın.');
  if (g.onceki && metin(g.onceki['empId']) !== metin(g.yeni['empId']) && once !== 'Beklemede') return gecersiz('Onaylanmış iznin personeli değiştirilemez.');
  if (g.uc === 'talep') {
    // IK-9: çalışan yalnız kendi adına talep açar, yalnız bekleyen talebini değiştirir ya da geri çeker.
    if (!kendi) return yetki('Yalnız kendi adınıza izin talebi açabilirsiniz.');
    if (g.onceki && metin(g.onceki['empId']) !== g.benimPersonel) return yetki('Bu talep sizin değil.');
    if (g.onceki === null && sonra !== 'Beklemede') return gecersiz('Yeni talep onay bekleyerek açılır.');
    if (g.onceki !== null && once !== 'Beklemede') return gecersiz('Yalnız onay bekleyen talebinizi değiştirebilirsiniz.');
    if (sonra !== 'Beklemede' && sonra !== 'İptal') return yetki('İzni onaylamak ya da reddetmek yöneticinin işidir.');
    return null;
  }
  if (g.uc === 'karar') {
    if (g.onceki === null || once !== 'Beklemede') return gecersiz('Yalnız onay bekleyen talebe karar verilir.');
    if (sonra !== 'Onaylandı' && sonra !== 'Reddedildi') return gecersiz('Karar onay ya da ret olmalı.');
    // IK-7: kimse kendi izin talebine karar veremez.
    if (kendi) return yetki('Kendi izin talebinize karar veremezsiniz.');
    // IK-8: bütün izinleri yazamayan onaycı yalnız ekibindeki çalışanın talebine karar verir.
    if (!g.islemler.includes('ik.izin-yaz') && !g.ekipte) return yetki('Yalnız ekibinizdeki çalışanların taleplerine karar verebilirsiniz.');
    if (izinIcerigiDegistiMi(g.onceki, g.yeni)) return gecersiz('Karar verirken talebin içeriği değiştirilemez.');
    return null;
  }
  // kaydet (izinleri yazan İK)
  const karar = sonra === 'Onaylandı' || sonra === 'Reddedildi';
  if (once === null) {
    if (karar && !onay) return yetki('Onaylı ya da reddedilmiş izin girmek için onay yetkisi gerekir.');
    if (karar && kendi) return yetki('Kendi izninize karar veremezsiniz.');
    return null;
  }
  if (once === 'Beklemede') {
    if (karar && !onay) return yetki('İzni onaylamak ya da reddetmek için onay yetkisi gerekir.');
    if (karar && kendi) return yetki('Kendi izin talebinize karar veremezsiniz.');
    return null;
  }
  // once === 'Onaylandı'
  if (sonra === 'Beklemede' || sonra === 'Reddedildi') return gecersiz('Onaylanmış izin geri çevrilemez; gerekiyorsa iptal edin.');
  // IK-6: onaylı iznin içeriği ve iptali onay yetkisi ister.
  if (sonra === 'İptal' && !onay) return yetki('Onaylanmış izni iptal etmek için onay yetkisi gerekir.');
  if (izinIcerigiDegistiMi(g.onceki!, g.yeni) && !onay) return yetki('Onaylanmış iznin tarihleri ya da türü onay yetkisi olmadan değişmez.');
  return null;
}

// Soru 55: yıllık ve mazeret izninin günü iş günüyle sınırlıdır (ekran da bu iki türü iş günüyle sayar; rapor, doğum gibi izinler takvim günüdür).
// Pazar ve (İK ayarı iş günü demedikçe) cumartesi iş günü değildir; tatil ve kapalı günler kişinin vardiya takviminden gelir. Takvim bilinmiyorsa
// (null) yalnız hafta sonu düşer.
export const IS_GUNU_IZIN_TURLERI: readonly string[] = ['Yıllık izin', 'Mazeret izni'];
export function izinIsGunu(baslangic: string, bitis: string, cumartesiIsGunu: boolean, tatiller: ReadonlySet<string> | null): number {
  let sayi = 0;
  for (let t = Date.parse(`${baslangic}T00:00:00Z`); t <= Date.parse(`${bitis}T00:00:00Z`); t += 86_400_000) {
    const hafta = new Date(t).getUTCDay();
    if (hafta === 0 || (hafta === 6 && !cumartesiIsGunu)) continue;
    if (tatiller?.has(new Date(t).toISOString().slice(0, 10))) continue;
    sayi++;
  }
  return sayi;
}

export function izinGunuDenetle(gun: number, isGunu: number): KuralHatasi | null {
  if (isGunu === 0) return dogrulama('Seçilen tarihlerde iş günü yok (hafta sonu ya da tatil).', 'govde.baslangic');
  if (gun > isGunu) return dogrulama(`İzin günü tarih aralığındaki ${isGunu} iş gününden fazla olamaz.`, 'govde.gun');
  return null;
}

// IK-80 (soru 142 b): resmî tatil listesinin sahibi İK'dır; Vardiya takvimi ve izin sayımı bu listeyi okur. Yılı boş satır her yıl
// tekrarlar. Takvimde olmayan gün (29 Şubat artık olmayan yılda, 31 Nisan) atlanır; aynı gün iki kez yazılmışsa ilki kalır.
export interface ResmiTatilSatiri { yil: number | null; ay: number; gun: number; ad: string }
export function resmiTatilTarihleri(satirlar: readonly ResmiTatilSatiri[], baslangic: string, bitis: string): { tarih: string; ad: string | null }[] {
  const sonuc = new Map<string, string | null>();
  const ilkYil = Number(baslangic.slice(0, 4));
  const sonYil = Number(bitis.slice(0, 4));
  const iki = (n: number): string => String(n).padStart(2, '0');
  for (const t of satirlar) {
    for (let yil = t.yil ?? ilkYil; yil <= (t.yil ?? sonYil); yil++) {
      const d = new Date(Date.UTC(yil, t.ay - 1, t.gun));
      if (d.getUTCFullYear() !== yil || d.getUTCMonth() !== t.ay - 1 || d.getUTCDate() !== t.gun) continue;
      const tarih = `${String(yil).padStart(4, '0')}-${iki(t.ay)}-${iki(t.gun)}`;
      if (tarih < baslangic || tarih > bitis || sonuc.has(tarih)) continue;
      sonuc.set(tarih, t.ad.trim() || null);
    }
  }
  return [...sonuc].sort(([a], [b]) => (a < b ? -1 : 1)).map(([tarih, ad]) => ({ tarih, ad }));
}

// Soru 75: Vardiya'nın takvim hesabıyla aynı seçim (iş merkezi x hafta günü, yalnız açık vardiya, seçili vardiya varsa yalnız o).
export interface VardiyaTanimi { id: number; ad: string; baslangic: string; bitis: string; aktif: boolean }
export interface VardiyaMatrisSatiri { isMerkeziId: number; gun: number; vardiyaId: number }
export function haftalikVardiyaPlani(
  isMerkeziId: number, vardiyaId: number | null, matris: readonly VardiyaMatrisSatiri[], vardiyalar: readonly VardiyaTanimi[],
): { gun: number; vardiyalar: { ad: string; baslangic: string; bitis: string }[] }[] {
  const tanim = new Map(vardiyalar.map((v) => [v.id, v]));
  return [1, 2, 3, 4, 5, 6, 7].map((gun) => ({
    gun,
    vardiyalar: matris
      .filter((m) => m.isMerkeziId === isMerkeziId && m.gun === gun && (vardiyaId === null || m.vardiyaId === vardiyaId))
      .flatMap((m) => { const v = tanim.get(m.vardiyaId); return v?.aktif ? [{ ad: v.ad, baslangic: v.baslangic, bitis: v.bitis }] : []; })
      .sort((a, b) => a.baslangic.localeCompare(b.baslangic) || a.ad.localeCompare(b.ad, 'tr')),
  }));
}

/* ---------------- pozisyonlar (kadro talebi): IK-10..IK-12 ---------------- */

export interface PozisyonGecisi {
  onceki: Govde | null;
  yeni: Govde;
  islemler: readonly string[];
  kisiId: number;
  gonderenKisiId: number | null;
  dortGozAcik: boolean;
}

const GECISLER: Record<string, readonly string[]> = {
  '': ['Taslak', 'Onay bekliyor', 'Açık'],
  Taslak: ['Taslak', 'Onay bekliyor'],
  'Onay bekliyor': ['Onay bekliyor', 'Taslak', 'Açık'],
  Açık: ['Açık', 'Beklemede', 'Kapandı'],
  Beklemede: ['Beklemede', 'Açık', 'Kapandı'],
  Kapandı: ['Kapandı', 'Açık'],
};
const KADRO_ALANLARI = ['baslik', 'departmanId', 'adet', 'ucretMin', 'ucretMax', 'gerekce'] as const;
const pozisyonDurumu = (g: Govde | null): string => (g === null ? '' : metin(g['durum']) || 'Taslak');

export function pozisyonGecisiDenetle(g: PozisyonGecisi): KuralHatasi | null {
  const once = pozisyonDurumu(g.onceki);
  const sonra = pozisyonDurumu(g.yeni);
  const onay = g.islemler.includes('ik.pozisyon-onay');
  // IK-10: durum yalnız tanımlı yollarla değişir; açılış ve yeniden açılış onay ister.
  if (!(GECISLER[once] ?? []).includes(sonra)) return gecersiz(`Pozisyon "${once || 'yeni'}" durumundan "${sonra}" durumuna geçemez.`);
  const acilis = sonra === 'Açık' && once !== 'Açık' && once !== 'Beklemede';
  if (acilis && !onay) return yetki('Pozisyonu açmak (kadro talebini onaylamak) için onay yetkisi gerekir.');
  // IK-11: dört göz açıkken talebi onaya gönderen kişi onaylayamaz; doğrudan açık kayıt da aynı kişinin onayıdır.
  if (acilis && g.dortGozAcik && (once === '' || g.gonderenKisiId === g.kisiId)) return yetki('Kendi onaya gönderdiğiniz kadro talebini onaylayamazsınız.');
  // IK-12: onaylanmış pozisyonun kadro bilgileri onay yetkisi olmadan değişmez.
  if (g.onceki && ['Açık', 'Beklemede', 'Kapandı'].includes(once) && !onay && KADRO_ALANLARI.some((k) => !esitMi(g.onceki![k] ?? null, g.yeni[k] ?? null))) {
    return yetki('Onaylanmış pozisyonun kadro bilgileri (unvan, departman, kişi sayısı, ücret aralığı) onay yetkisi olmadan değişmez.');
  }
  return null;
}

/* ---------------- personel: IK-13, IK-14 ---------------- */

const UCRET_ALANLARI = ['brutMaas', 'ucretGecmisi'] as const;
// IK-13: ücret ve ücret geçmişi ancak ücret yetkisiyle değişir (yeni kayıtta ücret girilmesi de).
export function ucretDenetle(onceki: Govde | null, yeni: Govde, islemler: readonly string[]): KuralHatasi | null {
  if (islemler.includes('ik.ucret-yaz')) return null;
  const degisti = UCRET_ALANLARI.some((k) => !esitMi(onceki?.[k] ?? null, yeni[k] ?? null));
  return degisti ? yetki('Ücret bilgisini değiştirmek için ücret yetkisi gerekir.') : null;
}

// IK-14: kişi kendi personel kaydının yalnız iletişim alanlarını değiştirir.
export const ILETISIM_ALANLARI = ['telefon', 'eposta', 'adres', 'acilKisi', 'acilYakinlik', 'acilTelefon'] as const;
export function iletisimDenetle(kimlik: string, benimPersonel: string | null): KuralHatasi | null {
  return benimPersonel !== null && kimlik === benimPersonel ? null : yetki('Yalnız kendi iletişim bilgilerinizi değiştirebilirsiniz.');
}

/* ---------------- bordro: IK-15..IK-17 ---------------- */

// IK-16: kesinleşmiş ay yeniden kesinleştirmek kilit açma yetkisi ister.
export function kesinlestirmeDenetle(kesinlesmisVar: boolean, islemler: readonly string[]): KuralHatasi | null {
  return kesinlesmisVar && !islemler.includes('ik.bordro-kilit-ac') ? yetki('Bu ayın bordrosu kesinleşmiş; yeniden kesinleştirmek için kilit açma yetkisi gerekir.') : null;
}

export interface BordroSonucu {
  gun: number; brut: number; toplam: number; net: number; gv: number; dv: number; sgk: number; iss: number; maliyet: number;
  matrah: number; aMat: number; inp?: unknown; locked?: unknown; [alan: string]: unknown;
}
// IK-15: bordro kaydını sunucu kurar; tutarlar motorun hesabıdır (istemciden yalnız girdiler gelir).
export function bordroKaydi(personel: string, donem: string, girdi: { brut: number; ek: number; mesaiSaat: number; tatilSaat: number; kesinti: number }, sonuc: BordroSonucu, donemAdi: string, donemKimligi: string): Govde {
  const snap: Govde = JSON.parse(JSON.stringify({ ...sonuc, inp: undefined, locked: undefined })) as Govde;
  return {
    kind: 'pay', id: bordroKimligi(personel, donem), empId: personel, donem,
    brut: girdi.brut, gun: sonuc.gun, ek: girdi.ek, mesaiSaat: girdi.mesaiSaat, tatilSaat: girdi.tatilSaat, kesinti: girdi.kesinti,
    toplam: sonuc.toplam, net: sonuc.net, gv: sonuc.gv, dv: sonuc.dv, sgk: sonuc.sgk, iss: sonuc.iss, maliyet: sonuc.maliyet,
    snap, paramId: donemKimligi, paramAd: donemAdi,
  };
}
export const bordroKimligi = (personel: string, donem: string): string => `pay_${personel}_${donem}`;

/* ---------------- bordro onayı: IK-40..IK-46 ---------------- */

export interface BordroOnayDurumu {
  // Onaylanmak istenen bordro; yoksa (ya da iptalse) ay kesinleşmemiştir.
  bordro: { empId: string; surum: number; iptal: boolean } | null;
  benimPersonel: string | null;
  // İstemcinin okuyup onayladığı sürüm.
  okunanSurum: number;
  // Bu kesinleştirme (sürüm) için onay zaten var mı.
  onayVar: boolean;
}

// IK-41: onay yalnız kişinin kendi, kesinleşmiş bordrosu için; IK-42: bir kez; IK-43: okunan sürüm güncel olmalı (yeniden kesinleşen
// bordro yeniden onaylanır). Sıra: kesinleşmemiş (409), başkasının (403), eski sürüm (409, servis), zaten onaylı (409).
export function bordroOnayDenetle(d: BordroOnayDurumu): KuralHatasi | 'ESKI_SURUM' | null {
  if (d.bordro === null || d.bordro.iptal) return cakisma('Bu ayın bordrosu henüz kesinleşmedi; onay kesinleşmeden verilemez.');
  if (d.benimPersonel === null || d.bordro.empId !== d.benimPersonel) return yetki('Yalnız kendi bordronuzu onaylayabilirsiniz.');
  if (d.okunanSurum !== d.bordro.surum) return 'ESKI_SURUM';
  if (d.onayVar) return cakisma('Bu bordroyu zaten onayladınız; onay geri alınmaz.');
  return null;
}

/* ---------------- yönetici paneli özeti: IK-53 ---------------- */

export const RAPOR_TURU = 'Hastalık / rapor';
// Bugün onaylı izni süren kişi sayısı. Aynı gün raporu da olan kişi bir kez, raporlu sayılır.
export function bugunIzindekiler(izinler: readonly Govde[], gun: string): { izinli: number; raporlu: number } {
  const izinli = new Set<string>();
  const raporlu = new Set<string>();
  for (const g of izinler) {
    if (metin(g['durum']) !== 'Onaylandı' || metin(g['baslangic']) > gun || metin(g['bitis']) < gun) continue;
    (metin(g['tur']) === RAPOR_TURU ? raporlu : izinli).add(metin(g['empId']));
  }
  for (const k of raporlu) izinli.delete(k);
  return { izinli: izinli.size, raporlu: raporlu.size };
}

// IK-31: çalışan devam ve mesai kayıtlarından yalnız kendisininkini görür (IK-35: ekibininkini değil).
export function devamGorunurMu(empId: string | null, benimPersonel: string | null): boolean {
  return empId !== null && benimPersonel !== null && empId === benimPersonel;
}

/* ---------------- ayarlar ve parametre dönemleri: IK-20 ---------------- */

export interface Donem { id: string; ad?: string; baslangic: string; params?: unknown }
export interface AyarDegisikligi {
  eskiDonemler: readonly Donem[];
  yeniDonemler: readonly Donem[];
  kilitliKimlikler: ReadonlySet<string>;
  // Geçmişe dönük dönem açılamaz: bu ayın başı ya da son kesinleşmiş aydan sonraki ay (büyüğü).
  enErkenBaslangic: string;
}
export function ayarDegisikligiDenetle(a: AyarDegisikligi): KuralHatasi | null {
  for (const eski of a.eskiDonemler) {
    const yeni = a.yeniDonemler.find((d) => d.id === eski.id);
    if (!a.kilitliKimlikler.has(eski.id)) continue;
    if (!yeni) return gecersiz(`Kilitli parametre dönemi silinemez: ${eski.ad ?? eski.id}.`);
    if (yeni.baslangic !== eski.baslangic || !esitMi(eski.params ?? null, yeni.params ?? null)) {
      return gecersiz(`Kilitli parametre döneminin değerleri değişmez (${eski.ad ?? eski.id}); değişikliği ileri tarihli yeni bir dönemle yapın.`);
    }
  }
  for (const yeni of a.yeniDonemler) {
    const eski = a.eskiDonemler.find((d) => d.id === yeni.id);
    if (!/^\d{4}-\d{2}-01$/.test(yeni.baslangic)) return gecersiz('Parametre dönemi ayın ilk günü başlar.');
    if ((!eski || eski.baslangic !== yeni.baslangic) && yeni.baslangic < a.enErkenBaslangic) {
      return gecersiz(`Parametre dönemi geçmişe dönük açılamaz; en erken ${a.enErkenBaslangic}.`);
    }
  }
  if (new Set(a.yeniDonemler.map((d) => d.baslangic)).size !== a.yeniDonemler.length) return gecersiz('Aynı tarihte başlayan iki parametre dönemi olamaz.');
  return null;
}

export function enErkenDonemBaslangici(bugun: string, kesinlesmisAylar: readonly string[]): string {
  const ayBasi = `${bugun.slice(0, 7)}-01`;
  const son = [...kesinlesmisAylar].sort().pop();
  if (!son) return ayBasi;
  const [y, m] = son.split('-').map(Number) as [number, number];
  const sonraki = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return sonraki > ayBasi ? sonraki : ayBasi;
}

/* ---------------- görünürlük ve ekip: IK-21, IK-24, IK-25 ---------------- */

// IK-21: rol işlemden ve ekipten çıkar; ekranın kendi rol ayarı geçersizdir.
export function ikRolu(islemler: readonly string[], ekipVar: boolean): IkRolu {
  if (islemler.includes('ik.oku')) return 'ik';
  return ekipVar ? 'yonetici' : 'calisan';
}

// IK-24: ekip, personel kaydındaki yönetici bağı (alt kademeler dahil) ve yöneticisi olduğu departmanlardır.
export function ekipKimlikleri(personeller: readonly Govde[], departmanlar: readonly Govde[], yonetici: string | null): Set<string> {
  const ekip = new Set<string>();
  if (yonetici === null) return ekip;
  const aktif = personeller.filter((e) => !dolu(e['cikisTarihi']));
  const bolumler = new Set(departmanlar.filter((d) => d['yoneticiId'] === yonetici).map((d) => metin(d['id'])));
  for (const e of aktif) if (e['id'] !== yonetici && (e['yoneticiId'] === yonetici || bolumler.has(metin(e['departmanId'])))) ekip.add(metin(e['id']));
  let buyudu = true;
  while (buyudu) {
    buyudu = false;
    for (const e of aktif) {
      const id = metin(e['id']);
      if (!ekip.has(id) && id !== yonetici && ekip.has(metin(e['yoneticiId']))) { ekip.add(id); buyudu = true; }
    }
  }
  return ekip;
}

// IK-25: kişi ile personel kaydı, personel kartındaki "TMI kullanıcısı" alanıyla eşleşir (karar 2, 08.10.2026); alan tekildir.
export function personelBul(personeller: readonly Govde[], kisiId: number): string | null {
  const bulunan = personeller.filter((e) => e['kisiId'] === kisiId);
  return bulunan.length === 1 ? metin(bulunan[0]!['id']) : null;
}

// IK-21: ekip üyesinin kaydında yalnız bu alanlar görünür (ücret, kimlik, banka, adres, sağlık yok). Doğum tarihi izin hak
// edişinin yaş kuralı için gerekir.
export const EKIP_ALANLARI = [
  'id', 'kind', 'ad', 'soyad', 'sicilNo', 'pozisyon', 'departmanId', 'yoneticiId', 'iseGiris', 'cikisTarihi', 'durum', 'denemeBitis',
  'sozlesmeTuru', 'sozlesmeBitis', 'calismaSekli', 'telefon', 'eposta', 'yakaTipi', 'kademe', 'oncekiKullanim', 'dogumTarihi',
] as const;
export const YONETICI_ALANLARI = ['id', 'kind', 'ad', 'soyad', 'pozisyon', 'departmanId'] as const;
export const alanlariSec = (g: Govde, alanlar: readonly string[]): Govde =>
  Object.fromEntries(alanlar.filter((a) => g[a] !== undefined).map((a) => [a, g[a]]));

// Ekip ve çalışan ekranının ihtiyacı olmayan, bütün şirketi ilgilendiren ayarlar.
export const GIZLI_AYARLAR = ['gorevler', 'maliyetPlani'] as const;

/* ---------------- değişiklik geçmişi: IK-22 ---------------- */

export interface Degisiklik { f: string; from?: unknown; to?: unknown; big?: boolean; gizli?: boolean }
const ATLANAN = new Set(['createdAt', 'updatedAt']);
const bos = (v: unknown): unknown => (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ? null : v);

// IK-72 (karar 84): IBAN, ücret, kan grubu ve engel durumu geçmişe değer olarak yazılmaz, yalnız değiştiği yazılır. Geçmişi okuyan
// herkes bu değerleri görürdü; kartın kendisi ise alan yetkisiyle süzülür. Karardan önce yazılmış satırlar yerinde kalır, okurken
// değerleri aynı biçimde gizlenir.
export const GECMISTE_GIZLI_ALANLAR: readonly string[] = ['iban', 'brutMaas', 'ucretGecmisi', 'kanGrubu', 'engelDurumu'];
export const gecmisteGizliMi = (alan: string): boolean => GECMISTE_GIZLI_ALANLAR.includes(alan);

// Ekrandaki günlükle aynı ölçü: boş değerler eşittir; büyük ve gizli alan yalnız adıyla yazılır (geri alınamaz).
export function degisiklikler(eski: Govde | null, yeni: Govde | null): Degisiklik[] {
  const alanlar = new Set([...Object.keys(eski ?? {}), ...Object.keys(yeni ?? {})]);
  const sonuc: Degisiklik[] = [];
  for (const f of alanlar) {
    if (ATLANAN.has(f)) continue;
    const a = bos(eski?.[f]); const b = bos(yeni?.[f]);
    const ja = JSON.stringify(a); const jb = JSON.stringify(b);
    if (ja === jb) continue;
    if (gecmisteGizliMi(f)) sonuc.push({ f, big: true, gizli: true });
    else sonuc.push(ja.length + jb.length > 6000 ? { f, big: true } : { f, from: a, to: b });
  }
  return sonuc;
}

/* ---------------- özel nitelikli kişisel veri: IK-73 ---------------- */

// IK-73 (karar 88 a): kan grubu ve engel durumu özel nitelikli kişisel veridir (KVKK m.6); `ik.ozel-veri-oku` olmadan kartta
// görünmez ve değiştirilemez. Kişi kendi kaydında görür. Yetkisiz kişinin gönderdiği kayıtta bu alanlar yoksa ya da boşsa eski değer
// korunur: ekranı alanı dolu görmediği için kaydetmesi değeri silmemelidir.
export const OZEL_VERI_ALANLARI: readonly string[] = ['kanGrubu', 'engelDurumu'];
export const OZEL_VERI_ISLEMI = 'ik.ozel-veri-oku' satisfies VeriIslemi;
export const ozelVeriyiAyikla = (g: Govde): Govde => Object.fromEntries(Object.entries(g).filter(([a]) => !OZEL_VERI_ALANLARI.includes(a)));

export function ozelVeriDenetle(onceki: Govde | null, yeni: Govde, islemler: readonly string[]): KuralHatasi | null {
  if (islemler.includes(OZEL_VERI_ISLEMI)) return null;
  const degisti = OZEL_VERI_ALANLARI.some((k) => bos(yeni[k]) !== null && !esitMi(bos(onceki?.[k]), bos(yeni[k])));
  return degisti ? yetki('Kan grubu ve engel durumunu değiştirmek için özel veri yetkisi gerekir.') : null;
}

// Yetkisiz kişinin boş gönderdiği özel alanlar eski değerle tamamlanır.
export function ozelVeriyiKoru(onceki: Govde | null, yeni: Govde, islemler: readonly string[]): Govde {
  if (islemler.includes(OZEL_VERI_ISLEMI) || onceki === null) return yeni;
  const sonuc = { ...yeni };
  for (const k of OZEL_VERI_ALANLARI) if (bos(sonuc[k]) === null && onceki[k] !== undefined) sonuc[k] = onceki[k];
  return sonuc;
}

/* ---------------- izin onayı bildirimi: IK-75 ---------------- */
// İzin "Beklemede"ye girince onaylayanlara haber gider; bekleyen talebin düzeltilmesi yeni haber değildir.
export function izinOnayBildirimi(onceki: Govde | null, yeni: Govde, kisiAdi: string): { baslik: string; metin: string } | null {
  if (yeni['durum'] !== 'Beklemede' || onceki?.['durum'] === 'Beklemede') return null;
  const parcalar = [kisiAdi, yeni['tur'], `${String(yeni['baslangic'] ?? '')} - ${String(yeni['bitis'] ?? '')}`].filter((p) => dolu(p)).map(String);
  return { baslik: 'İzin talebi onay bekliyor', metin: parcalar.join(' · ') };
}

/* ---------------- çıkışta zimmet: IK-74 ---------------- */

// IK-74 (karar 168 c, 244 a): çıkış engellenmez; çıkış tarihi yazılı kişinin iade edilmemiş zimmeti varsa yazan uyarılır. Zimmetin sahibi
// İdari İşler'dir; açık zimmetleri çağıran verir.
export function cikisZimmetUyarisi(personel: Govde, acik: readonly { demirbasNo: string; markaModel: string | null }[]): string | null {
  if (!dolu(personel['cikisTarihi']) || acik.length === 0) return null;
  const adlar = acik.map((z) => (dolu(z.markaModel) ? `${z.demirbasNo} ${z.markaModel}` : z.demirbasNo));
  return `Çıkış kaydedildi; kişinin üzerinde iade edilmemiş ${acik.length} zimmet var: ${adlar.join(', ')}.`;
}

// Günlükte görünen kayıt adı.
export function etiket(tur: string, g: Govde | null, adlar: ReadonlyMap<string, string>): string {
  if (!g) return '';
  const ad = (k: unknown): string => adlar.get(metin(k)) ?? '';
  switch (tur) {
    case 'emp': return `${metin(g['ad'])} ${metin(g['soyad'])}`.trim();
    case 'dept': case 'train': return metin(g['ad']);
    case 'job': return metin(g['ilanBaslik']) || metin(g['baslik']);
    case 'cand': return `${metin(g['ad'])} ${metin(g['soyad'])}`.trim();
    case 'leave': return `${ad(g['empId'])}: ${metin(g['tur'])} ${metin(g['baslangic'])}–${metin(g['bitis'])}`;
    case 'pay': return `${ad(g['empId'])}: ${metin(g['donem'])} bordrosu`;
    case 'att': case 'perf': return `${ad(g['empId'])}: ${metin(g['tur']) || metin(g['donem'])}`.trim();
    case 'ayarlar': return 'Ayarlar';
    default: return metin(g['id']);
  }
}

/* ---------------- yardımcı ---------------- */

// Anahtar sırasından bağımsız eşitlik (JSON değerleri için).
export function esitMi(a: unknown, b: unknown): boolean {
  return siraliJson(a) === siraliJson(b);
}
function siraliJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(siraliJson).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${siraliJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

// IK-55: kişisel özetteki fazla mesai, devam kaydının bu türleridir (geç kalma, devamsızlık ve görevlendirme fazla mesai değildir).
export const FAZLA_MESAI_TURLERI = ['Fazla mesai', 'Hafta tatili çalışması', 'Resmi tatil çalışması'] as const;

// IK-56: yıllık mesai sınırı dönem ayarındaki saattir; sayı değilse ya da sıfır ve altıysa bilinmiyor (null), sıfır uydurulmaz.
export function yillikMesaiSiniri(ayar: Readonly<Record<string, unknown>>): number | null {
  const n = Number(ayar['yillikMesaiLimit']);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ---------------- puantaj: IK-60..IK-69 (kart #1571) ---------------- */

export interface PuantajGunu { durum: PuantajDurumu | null; giris: string | null; cikis: string | null }
const dakikasi = (saat: string): number => Number(saat.slice(0, 2)) * 60 + Number(saat.slice(3, 5));

// IK-61: çalışılan günde giriş saati vardır, öteki durumlarda saat yazılmaz; IK-62: çıkış girişle aynı olamaz (önceyse ertesi gündür).
export function puantajGunuDenetle(g: PuantajGunu): KuralHatasi | null {
  if (g.durum === null) return null;
  if (g.durum !== 'calisti') {
    return g.giris !== null || g.cikis !== null ? dogrulama('Giriş ve çıkış saati yalnız çalışılan günde yazılır.', 'giris') : null;
  }
  if (g.giris === null) return dogrulama('Çalışılan günde giriş saati girilmeli.', 'giris');
  if (g.cikis !== null && g.cikis === g.giris) return dogrulama('Çıkış saati girişle aynı olamaz.', 'cikis');
  return null;
}

// IK-63: ileri tarihe puantaj yazılmaz; IK-64: işe girişten önce ve işten çıkıştan sonra yazılmaz.
export function puantajTarihiDenetle(tarih: string, bugun: string, iseGiris: string | null, cikisTarihi: string | null): KuralHatasi | null {
  if (tarih > bugun) return gecersiz('İleri tarihe puantaj yazılmaz.');
  if (iseGiris !== null && iseGiris !== '' && tarih < iseGiris) return gecersiz('İşe giriş tarihinden önceki güne puantaj yazılmaz.');
  if (cikisTarihi !== null && cikisTarihi !== '' && tarih > cikisTarihi) return gecersiz('İşten çıkış tarihinden sonraki güne puantaj yazılmaz.');
  return null;
}

// IK-65: bordrosu kesinleşmiş ayın puantajı bordro kilidini açma yetkisi olmadan değişmez (IK-16 ile aynı yetki).
export function puantajKilidiDenetle(kesinlesmis: boolean, islemler: readonly string[]): KuralHatasi | null {
  return kesinlesmis && !islemler.includes('ik.bordro-kilit-ac')
    ? yetki('Bu ayın bordrosu kesinleşti; puantajı değiştirmek için bordro kilidini açma yetkisi gerekir.') : null;
}

// An aralığı (epoch milisaniye).
export interface Aralik { bas: number; bit: number }
const GUN_MS = 86_400_000;
const kesisim = (a: Aralik, b: Aralik): number => Math.max(0, Math.min(a.bit, b.bit) - Math.max(a.bas, b.bas));

// Günün başından (tesis saati) giriş ve çıkış; çıkış girişten önceyse ertesi gündür (IK-62).
export function calismaAraligi(gunBasi: number, giris: string, cikis: string): Aralik {
  const bas = gunBasi + dakikasi(giris) * 60_000;
  const bit = gunBasi + dakikasi(cikis) * 60_000;
  return { bas, bit: bit <= bas ? bit + GUN_MS : bit };
}

// IK-68: çalışma = çıkış - giriş - çalışmanın içinde kalan vardiya molaları; fazla = çalışma - planın net süresi (en az sıfır). Plan o gün
// başlayan vardiyaların net aralıkları ve molalarıdır; iki vardiya (ya da vardiya ile fazla mesai) arasındaki boşluk mola değildir, orada
// çalışılan süre fazladır. Boş plan çalışma günü değildir. Plan bilinmiyorsa (null) fazla da bilinmez.
export interface GunPlani { araliklar: readonly Aralik[]; molalar: readonly Aralik[] }
export function calismaHesabi(calisma: Aralik, plan: GunPlani | null): { calismaDakika: number; fazlaDakika: number | null } {
  const brut = calisma.bit - calisma.bas;
  if (plan === null) return { calismaDakika: Math.round(brut / 60_000), fazlaDakika: null };
  const mola = plan.molalar.reduce((t, m) => t + kesisim(calisma, m), 0);
  const planNet = plan.araliklar.reduce((t, p) => t + (p.bit - p.bas), 0);
  const net = brut - mola;
  return { calismaDakika: Math.round(net / 60_000), fazlaDakika: Math.max(0, Math.round((net - planNet) / 60_000)) };
}

export type FazlaTuru = (typeof FAZLA_MESAI_TURLERI)[number];
// IK-69: önerilen tür; tatil günü resmî tatil, çalışma planı olmayan (kapalı ya da vardiyasız) gün hafta tatili, öteki gün fazla mesai.
// İzinli gün planı sıfırdır ama hafta tatili değildir.
export function fazlaTuru(fazlaDakika: number | null, gun: { dakika: number; kapali: 'tatil' | 'kapali' | null; izinli: boolean } | null): FazlaTuru | null {
  if (fazlaDakika === null || fazlaDakika <= 0) return null;
  if (gun?.kapali === 'tatil') return 'Resmi tatil çalışması';
  if (gun !== null && !gun.izinli && (gun.kapali === 'kapali' || gun.dakika === 0)) return 'Hafta tatili çalışması';
  return 'Fazla mesai';
}
