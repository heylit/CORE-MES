using System;
using System.Collections.Generic;

namespace LogoYardimcisi
{
    // Logo Objects nesne türleri (DataObjectType; rehber §1.3).
    public static class Nesne
    {
        public const int Malzeme = 0;
        public const int MalzemeFisi = 1;
        public const int AlinanHizmet = 2;
        public const int SatisSiparisi = 3;
        public const int SatinAlmaSiparisi = 4;
        public const int VerilenHizmet = 85;
        public const int TalepKarsilama = 88;
        public const int TalepFisi = 98;
        public const int SatisTeklifi = 135;
    }

    // Logo'ya yazma yalnız bu arayüzle, Logo Objects (COM) nesneleriyle yapılır; SQL ile yazılmaz (rehber §0 kural 1).
    // Bütün çağrılar tek STA iş parçacığından, sırayla gelir. Oturum açılamazsa LogoBaglanamadi, çağrı sırasında koparsa LogoOturumKoptu atılır.
    // Başarıda null, Logo reddettiyse LogoHatasi döner.
    public interface ILogoYazici
    {
        // ImportFromXmlStr(kök, xml) + Post.
        LogoHatasi XmlEkle(int nesne, string kok, string xml);

        // New() + başlık alanları sırayla + her satır için AppendLine ve alanları + son alanlar + Post. Yeni kaydın numarası INTERNAL_REFERENCE'tan (yoksa 0).
        LogoHatasi AlanlaEkle(int nesne, AlanListesi baslik, List<AlanListesi> satirlar, AlanListesi son, out int yeniRef);

        // Read(ref) + başlık alanları + satır değişiklikleri (satırın INTERNAL_REFERENCE'ıyla eşlenir) + AppendLine ile yeni satırlar + Post.
        // Eşlenemeyen satır varsa Post edilmez, hata döner.
        LogoHatasi Guncelle(int nesne, int kayit, AlanListesi baslik, Dictionary<int, AlanListesi> satirlar, List<AlanListesi> yeniSatirlar);

        // Delete(ref).
        LogoHatasi Sil(int nesne, int kayit);

        // Read(ref) sonrası satırların INTERNAL_REFERENCE'ları, satır sırasıyla. Okunamazsa null.
        List<int> SatirRefleri(int nesne, int kayit);

        // Ölçme (rehber §0 kural 4): Read(ref) + ExportToXmlStr(kök). Okunamazsa null.
        string DisaAktar(int nesne, int kayit, string kok);

        // Read(ref) sonrası alan dökümü (FieldName = Value), satırlar dahil. Okunamazsa null.
        List<string> AlanDokumu(int nesne, int kayit);
    }

    public sealed class KodAd
    {
        public string Kod;
        public string Ad;
    }

    public sealed class MalzemeKaydi
    {
        public int Ref;
        public string Kod;
        public string Ad;
        public int KartTuru;
        public string OzelKod;
        public string Aciklama2;
        public string Aciklama3;
        public string BirimSeti;
        // ITEMS.ACTIVE 1 (VARSAYIM: 0 kullanımda, 1 kullanım dışı; --olc ile doğrulanır).
        public bool Pasif;
    }

    // Logo stok toplamı: malzeme ve ambar başına eldeki miktar (GNTOTST, VARSAYIM; --olc ile doğrulanır).
    public sealed class StokToplami
    {
        public int MalzemeRef;
        public string MalzemeKodu;
        public int AmbarNo;
        public decimal Miktar;
    }

    // Malzeme hareketi (STLINE satırı, kart 2961-D4). Giriş/çıkış IOCODE'dan: 1, 2 giriş; 3, 4 çıkış (VARSAYIM; Sorgular.Dogrulanmadi).
    public sealed class MalzemeHareketi
    {
        public int Ref;
        public DateTime Tarih;
        public int FisTuru;
        public int GirisCikis;
        public string FisNo;
        public decimal Miktar;
        public int AmbarNo;
        public string Birim;
    }

    // Alış faturası satırı (son alış fiyatı, kart 2961-D4). Fiyat yerel para; döviz türü ve döviz fiyatı ayrı (PRCURR, PRPRICE).
    public sealed class AlisFiyati
    {
        public int Ref;
        public DateTime Tarih;
        public string CariKod;
        public string FaturaNo;
        public decimal Miktar;
        public string Birim;
        public decimal Fiyat;
        public int DovizTuru;
        public decimal DovizFiyati;
    }

    // Cari kart (CLCARD). Alan adları Logo'nun genel adlandırmasından (VARSAYIM; Sorgular.Dogrulanmadi).
    public sealed class CariKaydi
    {
        public int Ref;
        public string Kod;
        public string Ad;
        public int KartTuru;
        public string VergiNo;
        public string TcNo;
        public string VergiDairesi;
        public string Adres1;
        public string Adres2;
        public string Ilce;
        public string Il;
        public string PostaKodu;
        public string Telefon;
        public string EPosta;
        public bool Pasif;
    }

    public sealed class HizmetKaydi
    {
        public int Ref;
        public string Kod;
        public string Ad;
        // SRVCARD.ACTIVE 1 (VARSAYIM: ITEMS.ACTIVE gibi 0 kullanımda, 1 kullanım dışı; Sorgular.Dogrulanmadi).
        public bool Pasif;
    }

    public sealed class FisBasligi
    {
        public int Ref;
        public string No;
        public int Durum;
        public bool Iptal;
        public string CariKod;
        public decimal NetToplam;
        public int DovizTuru;
        public decimal Kur;
    }

    public sealed class FisSatiri
    {
        public int Ref;
        public int SatirTuru;
        public string Kod;
        public decimal Miktar;
        public bool Kapali;
        public int TeklifSatirRef;
    }

    public sealed class TeklifSatiri
    {
        public int Ref;
        public int SatirTuru;
        public string Kod;
        public decimal Miktar;
        public decimal Fiyat;
        public decimal Kdv;
        public decimal Iskonto;
        public string Birim;
        public decimal SipariseDonen;
        public int DovizTuru;
        public decimal DovizFiyati;
    }

    public sealed class TalepSatiri
    {
        public int Ref;
        public int Durum;
        public decimal Miktar;
        public decimal Karsilanan;
    }

    public sealed class Karsilama
    {
        public int Ref;
        public int SiparisSatirRef;
        public int TalepSatirRef;
        public decimal Miktar;
    }

    public sealed class MalKabulSatiri
    {
        public int Ref;
        public int SiparisSatirRef;
        public int SiparisRef;
        public string FisNo;
        public string MalzemeKodu;
        public decimal Miktar;
        public string Birim;
    }

    public sealed class FaturaOzeti
    {
        public int Ref;
        public string No;
    }

    // Logo'dan okuma yalnız bu arayüzle, salt okunur SELECT'lerle yapılır (rehber §0 kural 1; sorgular Sorgular.cs'te).
    // Bulunamayan kayıt 0 ya da null döner.
    public interface ILogoOkuma
    {
        int MalzemeRef(string kod);
        MalzemeKaydi Malzeme(string kod);
        // 2114b: kart kayıt numarasıyla, kullanım dışı bilgisiyle; yoksa null. Hizmet kart türüyle (alınan 1, verilen 2) aranır.
        MalzemeKaydi MalzemeRefIle(int kayit);
        HizmetKaydi HizmetRefIle(int kayit, int kartTuru);
        // Logo'daki bütün malzeme kartı kodları; TMI yeni kod verirken bunları atlar (2089-2 a).
        List<string> MalzemeKodlari();
        // Malzeme kartları kayıt sırasıyla, sonGorulen'den sonrası, en çok enCok kart (2116: Logo'dan kart okuması).
        List<MalzemeKaydi> MalzemeKartlari(int sonGorulen, int enCok);
        // Kayıt sırasıyla sonGorulen'den sonraki en çok enCok kartın ambar başına stok toplamı; satırı olmayan kart dönmez.
        List<StokToplami> StokToplamlari(int sonGorulen, int enCok);
        // Kullanımdaki cariler kodda, ünvanda (içinde) ya da vergi / T.C. kimlik numarasında (tam) aranır (2118).
        List<CariKaydi> CariAra(string metin, int enCok);
        CariKaydi Cari(string kod);
        List<KodAd> BirimSetleri();
        List<KodAd> Ambarlar();
        List<KodAd> Cariler();
        int CariRef(string kod);
        HizmetKaydi Hizmet(string kod, int kartTuru);
        FisBasligi Siparis(string no, int trcode);
        FisBasligi SiparisRefIle(int kayit, int trcode);
        List<FisSatiri> SiparisSatirlari(int fisRef);
        List<MalKabulSatiri> MalKabul(int sonGorulen, int enCok);
        List<FaturaOzeti> Faturalar(int siparisRef);
        FisBasligi Talep(string no);
        List<TalepSatiri> TalepSatirlari(List<int> satirRefleri);
        List<Karsilama> Karsilamalar(int siparisRef);
        Karsilama KarsilamaBul(int talepSatirRef, int siparisSatirRef);
        string SatisMusterisiKodu(string cariKod);
        FisBasligi Teklif(string no);
        FisBasligi TeklifRefIle(int kayit);
        List<TeklifSatiri> TeklifSatirlari(int teklifRef);
        FisBasligi MalzemeFisi(string no, int trcode);
        List<FisSatiri> MalzemeFisiSatirlari(int fisRef);
        // 2961-D4: malzemenin hareketleri kayıt sırasıyla (sonGorulen'den sonrası, en çok enCok) ve en yeni alış faturası satırları.
        List<MalzemeHareketi> MalzemeHareketleri(int malzemeRef, int sonGorulen, int enCok);
        List<AlisFiyati> SonAlisFiyatlari(int malzemeRef, int enCok);
    }
}
