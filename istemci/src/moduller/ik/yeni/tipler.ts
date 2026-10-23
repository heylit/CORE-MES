import type { IkTuru } from '#paylasilan/sozlesme/ik.ts';

// Kayıtlar uygulamanın biçimindedir (ik-modulu docs/VERI-MODELI.md); sunucu gövdeyi olduğu gibi saklar, denetlediği alanları ayrıca okur.
// Bu yüzden her alan isteğe bağlıdır ve bilinmeyen alan korunur: ekran okuduğu kaydı değiştirip aynen geri yazar.
export interface Kayit {
  id: string;
  kind: IkTuru;
  [alan: string]: unknown;
}

export interface Personel extends Kayit {
  kind: 'emp';
  ad?: string; soyad?: string; tckn?: string; dogumTarihi?: string; dogumYeri?: string; cinsiyet?: string; medeniDurum?: string;
  cocukSayisi?: number; kanGrubu?: string; uyruk?: string; engelDurumu?: string; askerlik?: string; egitim?: string; okul?: string;
  ehliyet?: string; yabanciDil?: string;
  telefon?: string; eposta?: string; kisiselEposta?: string; il?: string; ilce?: string; adres?: string;
  acilKisi?: string; acilYakinlik?: string; acilTelefon?: string;
  sicilNo?: string; departmanId?: string; pozisyon?: string; yakaTipi?: string; kademe?: string; yoneticiId?: string;
  iseGiris?: string; denemeBitis?: string; sozlesmeTuru?: string; sozlesmeBitis?: string; calismaSekli?: string; lokasyon?: string;
  sgkNo?: string; durum?: string;
  brutMaas?: number; yanHakTutar?: number; yemekYontem?: string; yemekHesap?: string; yemekDeger?: number;
  yolYontem?: string; yolHesap?: string; yolDeger?: number; tesvikId?: string;
  primler?: Record<string, { aktif?: boolean; deger?: number }>;
  besKatilim?: boolean; banka?: string; iban?: string; oncekiKullanim?: number; yanHaklar?: string;
  cikisTarihi?: string; cikisKodu?: string; cikisNotu?: string;
  ucretGecmisi?: { tarih: string; brut: number; neden?: string; not?: string }[];
  hareketler?: { tarih: string; alan: string; eski?: unknown; yeni?: unknown }[];
  belgeler?: Record<string, { ok?: boolean; tarih?: string }>;
  notlar?: { t: string; m: string }[];
  cikisListesi?: Record<string, string>;
  // Personel kartındaki "TMI kullanıcısı" ve "İş merkezi" (IK-25).
  kisiId?: number; isMerkeziId?: number;
}

export interface Departman extends Kayit {
  kind: 'dept';
  ad?: string; kod?: string; giderHesabi?: string; yoneticiId?: string; butce?: number; aciklama?: string;
}

export interface Izin extends Kayit {
  kind: 'leave';
  empId?: string; tur?: string; baslangic?: string; bitis?: string; gun?: number; durum?: string; vekil?: string; aciklama?: string;
  talepTarihi?: string; karar?: string; kaynak?: string; onaylayanId?: string;
}

export interface Devam extends Kayit {
  kind: 'att';
  empId?: string; tarih?: string; tur?: string; saat?: number; onay?: string; aciklama?: string;
}

export interface Bordro extends Kayit {
  kind: 'pay';
  empId?: string; donem?: string;
  brut?: number; gun?: number; ek?: number; mesaiSaat?: number; tatilSaat?: number; kesinti?: number;
  toplam?: number; net?: number; gv?: number; dv?: number; sgk?: number; iss?: number; maliyet?: number;
  snap?: Record<string, unknown>;
}

export interface Performans extends Kayit {
  kind: 'perf';
  empId?: string; donem?: string; degerlendirenId?: string; tarih?: string; skorlar?: Record<string, number>;
  hedefler?: string; guclu?: string; gelisim?: string; aksiyon?: string;
}

export interface Egitim extends Kayit {
  kind: 'train';
  ad?: string; tur?: string; kurum?: string; durum?: string; tarih?: string; sure?: number; maliyet?: number; gecerlilik?: string;
  katilimcilar?: string[]; aciklama?: string;
}

export interface Pozisyon extends Kayit {
  kind: 'job';
  baslik?: string; departmanId?: string; adet?: number; gerekce?: string; yerineId?: string; talepEdenId?: string; sorumluId?: string;
  durum?: string; acilis?: string; butce?: string; ucretMin?: number; ucretMax?: number;
  ilanBaslik?: string; lokasyon?: string; calismaSekli?: string; calismaTuru?: string; deneyim?: string; egitimSeviye?: string;
  ozet?: string; sorumluluklar?: string; nitelikler?: string; tercih?: string; yanHaklar?: string; ucretGoster?: boolean;
  sonBasvuru?: string; ilanKodu?: string; basvuruEposta?: string; basvuruLink?: string; mulakatSorulari?: string; aciklama?: string;
  yayinlar?: Record<string, { durum?: string; tarih?: string; bitis?: string; link?: string; not?: string }>;
  ozelMetin?: string;
}

export interface Aday extends Kayit {
  kind: 'cand';
  ad?: string; soyad?: string; eposta?: string; telefon?: string; jobId?: string; il?: string; kaynak?: string; refEmpId?: string;
  basvuruTarihi?: string; asama?: string; kvkk?: boolean;
  mevcutSirket?: string; mevcutPozisyon?: string; tecrubeYil?: number; egitim?: string; okul?: string; yabanciDil?: string;
  cvLink?: string; ozet?: string;
  maasBeklentisi?: number; baslayabilir?: string; teklifUcret?: number; teklifTarihi?: string; teklifYanit?: string; teklifNot?: string;
  redNedeni?: string; notlar?: string; empId?: string; iseAlimTarihi?: string; redTarihi?: string;
}

export interface Gorusme extends Kayit {
  kind: 'intv';
  candId?: string; tur?: string; tarih?: string; saat?: string; sure?: number; sekil?: string; yer?: string; durum?: string;
  gorusmeciler?: string[]; skorlar?: Record<string, number>; oneri?: string; guclu?: string; zayif?: string; notlar?: string;
  degerlendirmeTarihi?: string;
}

export interface KayitTurleri {
  emp: Personel; dept: Departman; leave: Izin; att: Devam; pay: Bordro; perf: Performans; train: Egitim; job: Pozisyon; cand: Aday; intv: Gorusme;
}

// Ayarlar tek nesnedir; alanlarını ayar ekranı ve motor okur (VERI-MODELI.md "Ayarlar").
export type IkAyarlar = Record<string, unknown> & { sirket?: string };
