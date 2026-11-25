using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace LogoYardimcisi
{
    // Logo Objects COM oturumu (rehber §1). Geç bağlama (dynamic): Interop.UnityObjects.dll gerekmez, yeni paket yok.
    // Tek oturum uygulama ömrü boyunca açık kalır; yalnız yaratıldığı STA iş parçacığından çağrılır.
    // Oturum açılamazsa 5 dakika yeniden denenmez: Logo kapanan oturumun lisansını 2-5 dk tutar, hemen denemek "[code=-93]" verir (rehber §0 kural 3).
    public sealed class ComLogo : ILogoYazici, IDisposable
    {
        static readonly TimeSpan YenidenDenemeBeklemesi = TimeSpan.FromMinutes(5);

        readonly Ayar ayar;
        // Sınamada sahte Logo Objects nesnesi verilir (ProgID'siz); null ise gerçek COM nesnesi yaratılır.
        readonly Func<object> uretici;
        readonly Func<DateTime> saat;
        dynamic app;
        DateTime? sonHata;
        LogoBaglanamadi sonBaglanamadi;
        int? tabanKod;
        string tabanMetin;

        public ComLogo(Ayar ayar) : this(ayar, null, null) { }

        public ComLogo(Ayar ayar, Func<object> uretici, Func<DateTime> saat)
        {
            this.ayar = ayar;
            this.uretici = uretici;
            this.saat = saat ?? (() => DateTime.UtcNow);
        }

        // Bekleme süresindeki çağrı Logo'ya gitmez ve günlüğe yazmaz: aynı hata bekleme penceresinde bir kez, deneme anında yazılır.
        void Bagla()
        {
            if (app != null) return;
            if (sonHata != null && saat() - sonHata.Value < YenidenDenemeBeklemesi)
            {
                var kalan = (int)Math.Ceiling((YenidenDenemeBeklemesi - (saat() - sonHata.Value)).TotalSeconds);
                var onceki = sonBaglanamadi;
                var e = new LogoBaglanamadi(
                    "Logo oturumu açılamadı; Logo lisansının bırakılması bekleniyor, " + kalan.ToString(CultureInfo.InvariantCulture) + " sn içinde yeniden denenmez. Son hata: " + onceki.Message,
                    onceki.Adim, onceki.Kod, onceki.Ayrinti);
                e.BeklemeSn = kalan;
                throw e;
            }
            var adim = "Olustur";
            dynamic a = null;
            try
            {
                if (uretici != null) a = uretici();
                else
                {
                    var t = Type.GetTypeFromProgID("UnityObjects.UnityApplication");
                    if (t == null) throw new LogoBaglanamadi("Logo Objects bu bilgisayarda kayıtlı değil (UnityObjects.UnityApplication).", adim, null, "Logo Objects kayıtlı değil (UnityObjects.UnityApplication).");
                    a = Activator.CreateInstance(t);
                }
                adim = "Connect";
                if (!(bool)a.Connect()) throw Basarisiz((object)a, adim);
                adim = "UserLogin";
                if (!(bool)a.UserLogin(ayar.LogoKullanici, ayar.LogoParola)) throw Basarisiz((object)a, adim);
                adim = "CompanyLogin";
                if (!(bool)a.CompanyLogin(ayar.FirmaNo)) throw Basarisiz((object)a, adim);
                app = a;
                sonHata = null;
                sonBaglanamadi = null;
                Gunluk.Yaz("Logo oturumu açıldı (Logo Objects " + Convert.ToString(a.Version(), CultureInfo.InvariantCulture) + ").");
            }
            catch (LogoBaglanamadi e)
            {
                BaglantiHatasiniKaydet(e);
                Kapat(a);
                throw;
            }
            catch (Exception e)
            {
                // İstisna iletisi yazılmaz (yol, kullanıcı adı taşıyabilir); yalnız tür adı.
                var h = new LogoBaglanamadi("Logo oturumu açılamadı (" + e.GetType().Name + ").", adim, null, "Beklenmeyen hata: " + e.GetType().Name);
                BaglantiHatasiniKaydet(h);
                Kapat(a);
                throw h;
            }
        }

        void BaglantiHatasiniKaydet(LogoBaglanamadi e)
        {
            sonHata = saat();
            sonBaglanamadi = e;
            Gunluk.Yaz("Logo oturumu açılamadı: adım=" + e.Adim + " kod=" + (e.Kod == null ? "yok" : e.Kod.Value.ToString(CultureInfo.InvariantCulture))
                + " ileti=" + e.Ayrinti + " (5 dakika yeniden denenmez)");
        }

        // Logo hata kodu GetLastError'dan okunur; okunamazsa Logo'nun metnindeki "[code=-93]" kullanılır. Kullanıcı adı ve parola metinden çıkarılır.
        LogoBaglanamadi Basarisiz(object a, string adim)
        {
            string metin = Gizle(SonHata(a));
            int? kod = SonKod(a);
            if (kod == null || kod.Value == 0)
            {
                var m = Regex.Match(metin, @"\[code=(-?\d+)\]");
                int okunan;
                if (m.Success && int.TryParse(m.Groups[1].Value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out okunan)) kod = okunan;
            }
            var ayrinti = metin.Contains("[code=") || kod == null ? metin : "[code=" + kod.Value.ToString(CultureInfo.InvariantCulture) + "] " + metin;
            return new LogoBaglanamadi("Logo " + adim + " false: " + ayrinti, adim, kod, ayrinti);
        }

        string Gizle(string metin)
        {
            if (string.IsNullOrEmpty(metin)) return "";
            foreach (var gizli in new[] { ayar.LogoKullanici, ayar.LogoParola })
                if (!string.IsNullOrEmpty(gizli)) metin = Regex.Replace(metin, Regex.Escape(gizli), "***", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            return metin;
        }

        static string SonHata(object nesne)
        {
            try { dynamic a = nesne; return Convert.ToString(a.GetLastErrorString(), CultureInfo.InvariantCulture); }
            catch (Exception) { return ""; }
        }

        static int? SonKod(object nesne)
        {
            try { dynamic a = nesne; return Convert.ToInt32(a.GetLastError(), CultureInfo.InvariantCulture); }
            catch (Exception) { return null; }
        }

        static void Kapat(dynamic a)
        {
            if (a == null) return;
            try { a.Disconnect(); }
            catch (Exception) { }
            Birak(a);
        }

        static void Birak(object o)
        {
            if (o != null && Marshal.IsComObject(o)) Marshal.FinalReleaseComObject(o);
        }

        public string OturumDene()
        {
            return Cagir<string>(() => Convert.ToString(app.Version(), CultureInfo.InvariantCulture));
        }

        public void Dispose()
        {
            Kapat(app);
            app = null;
        }

        // COM hatası oturumun durumunu bilinmez kılar: oturum kapatılır, sonraki istek yeniden açar.
        T Cagir<T>(Func<T> is_)
        {
            Bagla();
            // Uygulama düzeyindeki son hata (GetLastError) önceki işlemden kalmış olabilir; işlemin başındaki değer saklanır, ret iletisine yalnız değiştiyse girer.
            tabanKod = SonKod((object)app);
            tabanMetin = SonHata((object)app);
            try { return is_(); }
            catch (COMException e)
            {
                Kapat(app);
                app = null;
                throw new LogoOturumKoptu("Logo çağrısı sırasında COM hatası; işlendiği bilinmiyor.", e);
            }
            catch (InvalidComObjectException e)
            {
                Kapat(app);
                app = null;
                throw new LogoOturumKoptu("Logo oturumu geçersiz; işlendiği bilinmiyor.", e);
            }
        }

        // ErrorDesc, ErrorDescDetail ve DBErrorDesc eskiden beri okunur; ErrorDetail (özellik adı gerçek Logo'da doğrulanmadı, yoksa atlanır) ve
        // uygulama düzeyindeki hata (GetLastError, GetLastErrorString) eklenir. Aynı metin iki kez yazılmaz; kullanıcı adı ve parola çıkarılır.
        LogoHatasi VeriHatasi(dynamic d, string adim)
        {
            int kod;
            try { kod = Convert.ToInt32(d.ErrorCode, CultureInfo.InvariantCulture); }
            catch (Exception) { kod = -1; }
            var parcalar = new List<string> { adim + " false" };
            Action<string> ekle = delegate(string m)
            {
                m = Gizle(m).Trim();
                if (m != "" && !parcalar.Contains(m)) parcalar.Add(m);
            };
            try { string m1 = Convert.ToString(d.ErrorDesc); ekle(m1); } catch (Exception) { }
            try { string m2 = Convert.ToString(d.ErrorDescDetail); ekle(m2); } catch (Exception) { }
            try { string m3 = Convert.ToString(d.ErrorDetail); ekle(m3); } catch (Exception) { }
            try { string m4 = Convert.ToString(d.DBErrorDesc); ekle(m4); } catch (Exception) { }
            int? uygulamaKodu = SonKod((object)app);
            string ham = SonHata((object)app);
            bool bu = uygulamaKodu != tabanKod || ham != tabanMetin;
            string uygulamaMetni = bu ? Gizle(ham).Trim() : "";
            if (bu && uygulamaKodu != null && uygulamaKodu.Value != 0) parcalar.Add("uygulama hata kodu " + uygulamaKodu.Value.ToString(CultureInfo.InvariantCulture));
            ekle(uygulamaMetni);
            var h = new LogoHatasi(kod, string.Join(" | ", parcalar.ToArray()));
            try
            {
                dynamic ve = d.ValidateErrors;
                int sayi = ve.Count;
                for (var i = 0; i < sayi; i++)
                {
                    dynamic e = ve[i];
                    h.Dogrulama.Add(Convert.ToString(e.ID, CultureInfo.InvariantCulture) + " " + Convert.ToString(e.Error, CultureInfo.InvariantCulture));
                }
            }
            catch (Exception) { }
            return h;
        }

        static object ComDegeri(object v)
        {
            if (v is decimal) return (double)(decimal)v;
            return v;
        }

        // Alan yoksa FieldByName null döner; bilinmeyen alan sessizce atlanmaz, Post edilmeden hata döner.
        static LogoHatasi Ata(object alanlarNesnesi, KeyValuePair<string, object> a)
        {
            dynamic alanlar = alanlarNesnesi;
            dynamic alan = alanlar.FieldByName(a.Key);
            if (alan == null) return new LogoHatasi(14, "Alan yok: " + a.Key + " (Post edilmedi)");
            alan.Value = ComDegeri(a.Value);
            return null;
        }

        static LogoHatasi AtaHepsi(object alanlar, AlanListesi liste)
        {
            foreach (var a in liste)
            {
                var h = Ata(alanlar, a);
                if (h != null) return h;
            }
            return null;
        }

        static int Tam(object v)
        {
            try { return Convert.ToInt32(v, CultureInfo.InvariantCulture); }
            catch (Exception) { return 0; }
        }

        public LogoHatasi XmlEkle(int nesne, string kok, string xml)
        {
            return Cagir<LogoHatasi>(() =>
            {
                dynamic d = app.NewDataObject(nesne);
                try
                {
                    if (!(bool)d.ImportFromXmlStr(kok, xml)) return VeriHatasi(d, "ImportFromXmlStr");
                    if (!(bool)d.Post()) return VeriHatasi(d, "Post");
                    return (LogoHatasi)null;
                }
                finally { Birak(d); }
            });
        }

        public LogoHatasi AlanlaEkle(int nesne, AlanListesi baslik, List<AlanListesi> satirlar, AlanListesi son, out int yeniRef)
        {
            var r = 0;
            var h = Cagir<LogoHatasi>(() =>
            {
                dynamic d = app.NewDataObject(nesne);
                try
                {
                    d.New();
                    dynamic f = d.DataFields;
                    LogoHatasi e = AtaHepsi(f, baslik);
                    if (e != null) return e;
                    if (satirlar.Count > 0)
                    {
                        dynamic satirAlani = f.FieldByName("TRANSACTIONS");
                        if (satirAlani == null) return new LogoHatasi(14, "Alan yok: TRANSACTIONS (Post edilmedi)");
                        dynamic lines = satirAlani.Lines;
                        foreach (var s in satirlar)
                        {
                            lines.AppendLine();
                            int sayi = lines.Count;
                            e = AtaHepsi(lines[sayi - 1], s);
                            if (e != null) return e;
                        }
                    }
                    e = AtaHepsi(f, son);
                    if (e != null) return e;
                    if (!(bool)d.Post()) return VeriHatasi(d, "Post");
                    dynamic ic = f.FieldByName("INTERNAL_REFERENCE");
                    r = ic == null ? 0 : Tam(ic.Value);
                    return (LogoHatasi)null;
                }
                finally { Birak(d); }
            });
            yeniRef = r;
            return h;
        }

        public LogoHatasi Guncelle(int nesne, int kayit, AlanListesi baslik, Dictionary<int, AlanListesi> satirlar, List<AlanListesi> yeniSatirlar)
        {
            return Cagir<LogoHatasi>(() =>
            {
                dynamic d = app.NewDataObject(nesne);
                try
                {
                    if (!(bool)d.Read(kayit)) return VeriHatasi(d, "Read");
                    dynamic f = d.DataFields;
                    LogoHatasi e = AtaHepsi(f, baslik);
                    if (e != null) return e;
                    if (satirlar.Count > 0 || yeniSatirlar.Count > 0)
                    {
                        dynamic satirAlani = f.FieldByName("TRANSACTIONS");
                        if (satirAlani == null) return new LogoHatasi(14, "Alan yok: TRANSACTIONS (Post edilmedi)");
                        dynamic lines = satirAlani.Lines;
                        int sayi = lines.Count;
                        var eslenen = 0;
                        for (var i = 0; i < sayi; i++)
                        {
                            dynamic satir = lines[i];
                            dynamic ic = satir.FieldByName("INTERNAL_REFERENCE");
                            int r = ic == null ? 0 : Tam(ic.Value);
                            AlanListesi degisen;
                            if (r == 0 || !satirlar.TryGetValue(r, out degisen)) continue;
                            e = AtaHepsi(satir, degisen);
                            if (e != null) return e;
                            eslenen++;
                        }
                        if (eslenen != satirlar.Count) return new LogoHatasi(-1, "Satırların " + (satirlar.Count - eslenen) + " tanesi Logo kaydında bulunamadı (Post edilmedi)");
                        foreach (var s in yeniSatirlar)
                        {
                            lines.AppendLine();
                            int n = lines.Count;
                            e = AtaHepsi(lines[n - 1], s);
                            if (e != null) return e;
                        }
                    }
                    if (!(bool)d.Post()) return VeriHatasi(d, "Post");
                    return (LogoHatasi)null;
                }
                finally { Birak(d); }
            });
        }

        public LogoHatasi Sil(int nesne, int kayit)
        {
            return Cagir<LogoHatasi>(() =>
            {
                dynamic d = app.NewDataObject(nesne);
                try { return (bool)d.Delete(kayit) ? (LogoHatasi)null : VeriHatasi(d, "Delete"); }
                finally { Birak(d); }
            });
        }

        public List<int> SatirRefleri(int nesne, int kayit)
        {
            return Cagir<List<int>>(() =>
            {
                dynamic d = app.NewDataObject(nesne);
                try
                {
                    if (!(bool)d.Read(kayit)) return (List<int>)null;
                    dynamic satirAlani = d.DataFields.FieldByName("TRANSACTIONS");
                    if (satirAlani == null) return (List<int>)null;
                    dynamic lines = satirAlani.Lines;
                    int sayi = lines.Count;
                    var l = new List<int>();
                    for (var i = 0; i < sayi; i++)
                    {
                        dynamic ic = lines[i].FieldByName("INTERNAL_REFERENCE");
                        int r = ic == null ? 0 : Tam(ic.Value);
                        if (r <= 0) return (List<int>)null;
                        l.Add(r);
                    }
                    return l;
                }
                finally { Birak(d); }
            });
        }

        public string DisaAktar(int nesne, int kayit, string kok)
        {
            return Cagir<string>(() =>
            {
                dynamic d = app.NewDataObject(nesne);
                try
                {
                    if (!(bool)d.Read(kayit)) return (string)null;
                    string cikti = null;
                    bool tamam = d.ExportToXmlStr(kok, out cikti);
                    return tamam ? cikti : null;
                }
                finally { Birak(d); }
            });
        }

        public List<string> AlanDokumu(int nesne, int kayit)
        {
            return Cagir<List<string>>(() =>
            {
                dynamic d = app.NewDataObject(nesne);
                try
                {
                    if (!(bool)d.Read(kayit)) return (List<string>)null;
                    var l = new List<string>();
                    Dok(d.DataFields, "", l);
                    return l;
                }
                finally { Birak(d); }
            });
        }

        static void Dok(dynamic alanlar, string onEk, List<string> l)
        {
            int sayi = alanlar.Count;
            for (var i = 0; i < sayi; i++)
            {
                dynamic a = alanlar[i];
                string ad = Convert.ToString(a.FieldName, CultureInfo.InvariantCulture);
                if (ad == "TRANSACTIONS")
                {
                    dynamic lines = a.Lines;
                    int n = lines.Count;
                    for (var k = 0; k < n; k++) Dok(lines[k], onEk + "TRANSACTIONS[" + k + "].", l);
                    continue;
                }
                object v;
                try { v = a.Value; }
                catch (Exception) { v = "?"; }
                l.Add(onEk + ad + " = " + Convert.ToString(v, CultureInfo.InvariantCulture));
            }
        }
    }
}
