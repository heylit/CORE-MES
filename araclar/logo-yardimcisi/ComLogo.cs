using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;

namespace LogoYardimcisi
{
    // Logo Objects COM oturumu (rehber §1). Geç bağlama (dynamic): Interop.UnityObjects.dll gerekmez, yeni paket yok.
    // Tek oturum uygulama ömrü boyunca açık kalır; yalnız yaratıldığı STA iş parçacığından çağrılır.
    // Oturum açılamazsa 5 dakika yeniden denenmez: Logo kapanan oturumun lisansını 2-5 dk tutar, hemen denemek "[code=-93]" verir (rehber §0 kural 3).
    public sealed class ComLogo : ILogoYazici, IDisposable
    {
        static readonly TimeSpan YenidenDenemeBeklemesi = TimeSpan.FromMinutes(5);

        readonly Ayar ayar;
        dynamic app;
        DateTime? sonHata;

        public ComLogo(Ayar ayar)
        {
            this.ayar = ayar;
        }

        void Bagla()
        {
            if (app != null) return;
            if (sonHata != null && DateTime.UtcNow - sonHata.Value < YenidenDenemeBeklemesi)
                throw new LogoBaglanamadi("Logo oturumu açılamadı; Logo lisansının bırakılması bekleniyor, 5 dakika içinde yeniden denenmez.");
            var t = Type.GetTypeFromProgID("UnityObjects.UnityApplication");
            if (t == null) throw new LogoBaglanamadi("Logo Objects bu bilgisayarda kayıtlı değil (UnityObjects.UnityApplication).");
            dynamic a = null;
            try
            {
                a = Activator.CreateInstance(t);
                if (!(bool)a.Connect()) throw new LogoBaglanamadi("Logo Connect false: " + SonHata(a));
                if (!(bool)a.UserLogin(ayar.LogoKullanici, ayar.LogoParola)) throw new LogoBaglanamadi("Logo UserLogin false: " + SonHata(a));
                if (!(bool)a.CompanyLogin(ayar.FirmaNo)) throw new LogoBaglanamadi("Logo CompanyLogin false: " + SonHata(a));
                app = a;
                sonHata = null;
                Gunluk.Yaz("Logo oturumu açıldı (Logo Objects " + Convert.ToString(a.Version(), CultureInfo.InvariantCulture) + ").");
            }
            catch (LogoBaglanamadi)
            {
                sonHata = DateTime.UtcNow;
                Kapat(a);
                throw;
            }
            catch (Exception e)
            {
                sonHata = DateTime.UtcNow;
                Kapat(a);
                throw new LogoBaglanamadi("Logo oturumu açılamadı (" + e.GetType().Name + ").");
            }
        }

        static string SonHata(dynamic a)
        {
            try { return Convert.ToString(a.GetLastErrorString(), CultureInfo.InvariantCulture); }
            catch (Exception) { return ""; }
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

        public void Dispose()
        {
            Kapat(app);
            app = null;
        }

        // COM hatası oturumun durumunu bilinmez kılar: oturum kapatılır, sonraki istek yeniden açar.
        T Cagir<T>(Func<T> is_)
        {
            Bagla();
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

        static LogoHatasi VeriHatasi(dynamic d, string adim)
        {
            int kod;
            try { kod = Convert.ToInt32(d.ErrorCode, CultureInfo.InvariantCulture); }
            catch (Exception) { kod = -1; }
            var parcalar = new List<string> { adim + " false" };
            foreach (var ad in new[] { "ErrorDesc", "ErrorDescDetail", "DBErrorDesc" })
            {
                try
                {
                    string m = ad == "ErrorDesc" ? Convert.ToString(d.ErrorDesc) : ad == "ErrorDescDetail" ? Convert.ToString(d.ErrorDescDetail) : Convert.ToString(d.DBErrorDesc);
                    if (!string.IsNullOrEmpty(m)) parcalar.Add(m.Trim());
                }
                catch (Exception) { }
            }
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
