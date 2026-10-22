package tmi.saat

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import tmi.saat.cekirdek.Cerceve
import tmi.saat.kadran.UyariSayisi
import tmi.saat.ekran.AyarlarEkrani
import tmi.saat.ekran.LocalEldiven
import tmi.saat.ekran.SaatAyarlari
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavHostController
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import tmi.saat.cekirdek.Titresim
import tmi.saat.cekirdek.UyariKurali
import tmi.saat.ekran.AdresEkrani
import tmi.saat.ekran.AnaEkrani
import tmi.saat.ekran.AyrintiEkrani
import tmi.saat.ekran.EslesmeEkrani
import tmi.saat.ekran.KapaliEkran
import tmi.saat.ekran.ListeEkrani
import tmi.saat.ekran.ModelEkrani
import tmi.saat.ekran.VitrinEkrani
import tmi.saat.ekran.NedenEkrani
import tmi.saat.ekran.NfcEkrani
import tmi.saat.ekran.OzetEkrani
import tmi.saat.ekran.nfcVarMi
import androidx.compose.ui.platform.LocalContext
import tmi.saat.ekran.SurelerEkrani
import tmi.saat.ekran.UyariEkrani
import tmi.saat.ekran.VardiyaEkrani
import tmi.saat.ekran.UyarilarEkrani
import tmi.saat.ekran.Yukleme
import tmi.saat.ekran.periyodikOku

class AnaEtkinlik : ComponentActivity() {
    companion object {
        // Kadrandaki her kutucuk kendi sayfasini acar (86, 6.4). Yalniz bu sayfalar kabul edilir; baska deger ana menudur.
        const val ACILIS = "acilis"
        const val VITRIN = "vitrin"
        const val LISTE = "liste"
        const val UYARILAR = "uyarilar"
        const val OZET = "ozet"
        const val VARDIYA = "vardiya"
        private val ACILIS_SAYFALARI = setOf(VITRIN, LISTE, UYARILAR, OZET, VARDIYA)
    }

    override fun onCreate(durum: Bundle?) {
        super.onCreate(durum)
        val depo = Depo(this)
        val api = Api({ depo.sunucu }) { depo.belirtec }
        val ilkSayfa = intent?.getStringExtra(ACILIS)?.takeIf { it in ACILIS_SAYFALARI && durum == null }
        setContent { MaterialTheme(colors = Renkler.tema) { Uygulama(depo, api, ::titret, ilkSayfa) } }
    }

    private fun titret(uyariTuru: String) {
        val desen = Titresim.desen(uyariTuru) ?: return
        val titresim = (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        titresim.vibrate(VibrationEffect.createWaveform(desen, -1))
    }
}

@Composable
private fun Uygulama(depo: Depo, api: Api, titret: (String) -> Unit, ilkSayfa: String?) {
    var sunucu by remember { mutableStateOf(depo.sunucu) }
    var eslesmis by remember { mutableStateOf(depo.belirtec != null) }
    // Ilk acilista adres sorulur; "Sonra" denince ozellikler kapali ekranla acilir.
    var adresSor by remember { mutableStateOf(depo.sunucu == null && !depo.adresSoruldu) }
    val gezgin = rememberSwipeDismissableNavController()
    val eslesmeBitti = {
        depo.temizle()
        eslesmis = false
    }

    if (adresSor) {
        AdresEkrani(
            mevcut = sunucu,
            kaydet = { adres ->
                if (adres != sunucu) {
                    depo.sunucu = adres
                    sunucu = adres
                    eslesmis = false
                }
                adresSor = false
            },
            sonra = {
                depo.adresSoruldu = true
                adresSor = false
            },
        )
        return
    }
    if (sunucu == null) {
        KapaliEkran(adresGir = { adresSor = true })
        return
    }

    if (!eslesmis) {
        EslesmeEkrani(api, adresDegistir = { adresSor = true }) { e ->
            depo.belirtec = e.belirtec
            depo.kisiAd = e.kisiAd
            eslesmis = true
        }
        return
    }

    var ayar by remember { mutableStateOf(SaatAyarlari(depo.eldiven, depo.flas, depo.sessiz)) }
    val ayarDegistir = { yeni: SaatAyarlari ->
        depo.eldiven = yeni.eldiven
        depo.flas = yeni.flas
        depo.sessiz = yeni.sessiz
        ayar = yeni
    }
    CompositionLocalProvider(LocalEldiven provides ayar.eldiven) {
        Eslesmis(api, gezgin, eslesmeBitti, adresDegistir = { adresSor = true }, titret, ayar, ayarDegistir, ilkSayfa)
    }
}

// Istasyon ve uyari panosu tek yerden okunur: ana menu, liste ve uyarilar ayni veriyi gosterir, yeni uyari her ekranda yakalanir.
@Composable
private fun Eslesmis(
    api: Api,
    gezgin: NavHostController,
    oturumBitti: () -> Unit,
    adresDegistir: () -> Unit,
    titret: (String) -> Unit,
    ayar: SaatAyarlari,
    ayarDegistir: (SaatAyarlari) -> Unit,
    ilkSayfa: String?,
) {
    LaunchedEffect(Unit) { ilkSayfa?.let { gezgin.navigate(it) } }
    val baglam = LocalContext.current
    val pano by periyodikOku(oturumBitti) { Pano(api.istasyonlar(), api.uyarilar()) }
    val veri = (pano as? Yukleme.Geldi)?.veri
    // "Gordum" denen uyarilar yalniz bu saatte ve bu acilista duser; sunucuya yazilmaz.
    var gorulen by remember { mutableStateOf(emptySet<String>()) }
    var onceki by remember { mutableStateOf<Set<String>?>(null) }
    var acikUyari by remember { mutableStateOf<Uyari?>(null) }
    val anahtar = { u: Uyari -> UyariKurali.anahtar(u.tur, u.istasyonId, u.alet?.id, u.emirNo, u.baslangic) }

    LaunchedEffect(veri) {
        val uyarilar = veri?.uyarilar ?: return@LaunchedEffect
        val simdi = uyarilar.map(anahtar)
        UyariKurali.yeni(onceki, simdi, gorulen)?.let { yeni ->
            val u = uyarilar.first { anahtar(it) == yeni }
            if (UyariKurali.ekranaGelir(u.tur, ayar.sessiz)) {
                titret(u.tur)
                acikUyari = u
                gezgin.navigate("uyari") { launchSingleTop = true }
            }
        }
        onceki = simdi.toSet()
    }
    // Uygulama acikken uyari sayisi degisince kadrandaki sayi hemen yenilenir; kapaliyken sistemin 5 dakikalik yenilemesi kalir.
    val uyariSayisi = veri?.uyarilar?.size
    LaunchedEffect(uyariSayisi) {
        if (uyariSayisi != null) {
            ComplicationDataSourceUpdateRequester.create(baglam, ComponentName(baglam, UyariSayisi::class.java)).requestUpdateAll()
        }
    }
    val okunmamis: Yukleme<List<Uyari>> = when (val p = pano) {
        is Yukleme.Geldi -> Yukleme.Geldi(p.veri.uyarilar.filter { anahtar(it) !in gorulen }, p.alindiMs)
        is Yukleme.Hata -> p
        Yukleme.Bekliyor -> Yukleme.Bekliyor
    }
    val istasyon = { id: Int? -> veri?.istasyonlar?.firstOrNull { it.id == id } }
    val geri: () -> Unit = { gezgin.popBackStack() }
    val nfcVar = remember { nfcVarMi(baglam) }

    SwipeDismissableNavHost(navController = gezgin, startDestination = "ana") {
        composable("ana") {
            AnaEkrani(
                durum = pano,
                okunmamis = (okunmamis as? Yukleme.Geldi)?.veri?.size ?: 0,
                sessiz = ayar.sessiz,
                istasyonlariAc = { gezgin.navigate("liste") },
                uyarilariAc = { gezgin.navigate("uyarilar") },
                ayarlariAc = { gezgin.navigate("ayarlar") },
                vardiyaAc = { gezgin.navigate("vardiya") },
                ozetAc = { gezgin.navigate("ozet") },
                vitrinAc = { gezgin.navigate("vitrin") },
                nfcAc = if (nfcVar) ({ gezgin.navigate("nfc") }) else null,
            )
        }
        composable("vitrin") { VitrinEkrani(api, pano, oturumBitti, geri) { id -> gezgin.navigate("istasyon/$id") } }
        composable("liste") { ListeEkrani(pano) { id -> gezgin.navigate("istasyon/$id") } }
        composable("istasyon/{id}") { giris ->
            val id = giris.arguments?.getString("id")?.toIntOrNull()
            AyrintiEkrani(
                api, istasyon(id), oturumBitti, geri,
                sureleriAc = { emirId -> gezgin.navigate("sureler/$id/$emirId") },
                modelAc = { emirId -> gezgin.navigate("model/$emirId") },
                durdur = { emirId -> gezgin.navigate("neden/$emirId") },
                komsuyaGec = { yon ->
                    val idler = veri?.istasyonlar?.map { it.id }.orEmpty()
                    if (id != null) Cerceve.komsu(idler, id, yon)?.let { yeni ->
                        gezgin.navigate("istasyon/$yeni") { popUpTo("istasyon/{id}") { inclusive = true } }
                    }
                },
            )
        }
        composable("sureler/{istasyon}/{emir}") { giris ->
            val emirId = giris.arguments?.getString("emir")?.toIntOrNull() ?: return@composable
            SurelerEkrani(api, istasyon(giris.arguments?.getString("istasyon")?.toIntOrNull()), emirId, oturumBitti, geri)
        }
        composable("model/{emir}") { giris ->
            val emirId = giris.arguments?.getString("emir")?.toIntOrNull() ?: return@composable
            ModelEkrani(api, emirId, oturumBitti, geri)
        }
        composable("neden/{emir}") { giris ->
            val emirId = giris.arguments?.getString("emir")?.toIntOrNull() ?: return@composable
            NedenEkrani(api, emirId, oturumBitti, geri, bitti = geri)
        }
        composable("uyarilar") { UyarilarEkrani(okunmamis, geri) { u -> acikUyari = u; gezgin.navigate("uyari") { launchSingleTop = true } } }
        composable("nfc") {
            NfcEkrani(veri?.istasyonlar, geri) { id -> gezgin.navigate("istasyon/$id") { popUpTo("nfc") { inclusive = true } } }
        }
        composable("vardiya") { VardiyaEkrani(pano, geri) }
        composable("ozet") {
            OzetEkrani(pano, geri, uyarilariAc = { gezgin.navigate("uyarilar") }, istasyonAc = { id -> gezgin.navigate("istasyon/$id") })
        }
        composable("ayarlar") { AyarlarEkrani(ayar, ayarDegistir, geri, adresDegistir) }
        composable("uyari") {
            val u = acikUyari
            if (u == null) {
                LaunchedEffect(Unit) { gezgin.popBackStack() }
                return@composable
            }
            UyariEkrani(
                uyari = u,
                flas = ayar.flas,
                bak = u.istasyonId?.let { id ->
                    {
                        gezgin.popBackStack()
                        gezgin.navigate("istasyon/$id")
                    }
                },
                gordum = {
                    gorulen = gorulen + anahtar(u)
                    gezgin.popBackStack("ana", inclusive = false)
                },
            )
        }
    }
}
