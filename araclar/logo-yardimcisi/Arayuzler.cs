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
    }

    public sealed class HizmetKaydi
    {
        public int Ref;
        public string Kod;
        public string Ad;
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
    }
}
