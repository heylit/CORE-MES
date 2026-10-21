using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;

namespace LogoYardimcisi
{
    // TMI Logo yardımcısı (ADR 0017): TMI sunucusuyla aynı bilgisayarda, yalnız 127.0.0.1'de dinler; Logo'ya Logo Objects (COM) ile yazar,
    // SQL ile yalnız okur. x86 derlenir (Logo Objects 32-bit COM). Kullanım kurulum/logo-yardimcisi.md'de.
    public static class Program
    {
        const string AyarDegiskeni = "TMIV2_LOGO_YARDIMCI_AYARI";

        static readonly Dictionary<string, KeyValuePair<int, string>> OlcumTurleri = new Dictionary<string, KeyValuePair<int, string>>
        {
            { "malzeme", new KeyValuePair<int, string>(Nesne.Malzeme, "ITEMS") },
            { "malzeme-fisi", new KeyValuePair<int, string>(Nesne.MalzemeFisi, "MATERIAL_SLIPS") },
            { "alinan-hizmet", new KeyValuePair<int, string>(Nesne.AlinanHizmet, "PURCHASE_SERVICES") },
            { "verilen-hizmet", new KeyValuePair<int, string>(Nesne.VerilenHizmet, "SALES_SERVICES") },
            { "satin-alma-siparisi", new KeyValuePair<int, string>(Nesne.SatinAlmaSiparisi, "PURCHASE_ORDERS") },
            { "talep-fisi", new KeyValuePair<int, string>(Nesne.TalepFisi, "DEMAND_FICHES") },
            { "karsilama", new KeyValuePair<int, string>(Nesne.TalepKarsilama, "DEMAND_PEGGINGS") },
            { "satis-siparisi", new KeyValuePair<int, string>(Nesne.SatisSiparisi, null) },
            { "satis-teklifi", new KeyValuePair<int, string>(Nesne.SatisTeklifi, null) },
        };

        public static int Main(string[] argumanlar)
        {
            string ayarYolu = Environment.GetEnvironmentVariable(AyarDegiskeni);
            var kip = "sunucu";
            string olcumTuru = null, olcumKaydi = null;
            for (var i = 0; i < argumanlar.Length; i++)
            {
                var a = argumanlar[i];
                if (a == "--ayar" && i + 1 < argumanlar.Length) ayarYolu = argumanlar[++i];
                else if (a == "--deneme") kip = "deneme";
                else if (a == "--olc" && i + 2 < argumanlar.Length)
                {
                    kip = "olc";
                    olcumTuru = argumanlar[++i];
                    olcumKaydi = argumanlar[++i];
                }
                else return Kullanim("Bilinmeyen argüman: " + a);
            }
            if (string.IsNullOrEmpty(ayarYolu)) return Kullanim("Ayar dosyası verilmedi (--ayar <yol> ya da " + AyarDegiskeni + ").");
            if (IntPtr.Size != 4) Gunluk.Yaz("UYARI: süreç 32-bit değil; Logo Objects 32-bit COM'dur, x86 derleyin.");

            Ayar ayar;
            try { ayar = Ayar.DosyadanOku(ayarYolu); }
            catch (GecersizIstek e) { return Kullanim(e.Message); }

            var kod = 0;
            HttpSunucu sunucu = null;
            var is_ = new Thread(() =>
            {
                using (var logo = new ComLogo(ayar))
                {
                    var oku = new SqlOkuma(ayar);
                    if (kip == "deneme") { kod = new Deneme(logo, oku, ayar).Calistir(); return; }
                    if (kip == "olc") { kod = Olc(logo, oku, olcumTuru, olcumKaydi); return; }
                    var islemler = new Islemler(logo, oku, ayar, () => DateTime.Now);
                    sunucu = new HttpSunucu(ayar.Port, ayar.Anahtar, islemler.Isle);
                    try { sunucu.Baslat(); }
                    catch (Exception e)
                    {
                        Gunluk.Yaz("127.0.0.1:" + ayar.Port + " dinlenemedi: " + e.Message);
                        kod = 2;
                        return;
                    }
                    Gunluk.Yaz("Logo yardımcısı 127.0.0.1:" + sunucu.Port + " adresinde dinliyor. Durdurmak için Ctrl+C.");
                    sunucu.Calis(0);
                    Gunluk.Yaz("Logo yardımcısı durdu; Logo oturumu kapatılıyor.");
                }
            });
            is_.SetApartmentState(ApartmentState.STA);
            Console.CancelKeyPress += (s, e) =>
            {
                e.Cancel = true;
                var h = sunucu;
                if (h != null) h.Durdur();
            };
            is_.Start();
            is_.Join();
            return kod;
        }

        static int Kullanim(string hata)
        {
            Console.Error.WriteLine(hata);
            Console.Error.WriteLine("Kullanım: logo-yardimcisi.exe --ayar <ayar dosyası> [--deneme | --olc <tür> <logicalRef|malzeme kodu>]");
            Console.Error.WriteLine("Ölçüm türleri: " + string.Join(", ", new List<string>(OlcumTurleri.Keys).ToArray()));
            return 1;
        }

        // Ölçme (rehber §0 kural 4, §12): gerçek kaydı Read + ExportToXmlStr ve alan dökümü. Yalnız okur; çıktı ekrana yazılır, dosyaya ve depoya girmez.
        static int Olc(ComLogo logo, SqlOkuma oku, string tur, string kayit)
        {
            KeyValuePair<int, string> t;
            if (!OlcumTurleri.TryGetValue(tur, out t)) return Kullanim("Bilinmeyen ölçüm türü: " + tur);
            int r;
            if (!int.TryParse(kayit, NumberStyles.None, CultureInfo.InvariantCulture, out r))
            {
                if (t.Key != Nesne.Malzeme) return Kullanim("Kayıt numarası (logicalRef) tam sayı olmalı.");
                r = oku.MalzemeRef(kayit);
                if (r == 0) return Kullanim("Malzeme bulunamadı: " + kayit);
            }
            try
            {
                if (t.Value != null)
                {
                    var xml = logo.DisaAktar(t.Key, r, t.Value);
                    Console.WriteLine(xml ?? "(ExportToXmlStr sonuç vermedi)");
                }
                var dokum = logo.AlanDokumu(t.Key, r);
                if (dokum == null) { Console.WriteLine("(Read false: kayıt okunamadı)"); return 1; }
                foreach (var s in dokum) Console.WriteLine(s);
                return 0;
            }
            catch (LogoBaglanamadi e) { Console.Error.WriteLine(e.Message); return 1; }
        }
    }
}
