package tmi.saat.kadran

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.SmallImage
import androidx.wear.watchface.complications.data.SmallImageComplicationData
import androidx.wear.watchface.complications.data.SmallImageType
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import tmi.saat.AnaEtkinlik
import tmi.saat.Api
import tmi.saat.ApiHatasi
import tmi.saat.Depo
import tmi.saat.Istasyon
import tmi.saat.cekirdek.Kadran

// Watch Face Format kadrani (ayri, kodsuz APK: saat/kadran) veri cekemez; veriyi bu kutucuklardan alir (375 a).
// Sistem kutucugu manifestteki surede bir ister (pil); ag hatasinda null doner ve kadran son degeri gostermeye devam eder.
// Kurum logosu gunde bir yenilenir; arada saatin onbelleginden verilir.
private const val LOGO_TAZELIK_MS = 24 * 60 * 60_000L
private const val ESLESMEDI = "TMI'ı açıp eşleştirin"

private fun metin(m: String) = PlainComplicationText.Builder(m).build()

// Askida kalan (suspend) taban sinif ayri -ktx paketindedir; onayli paket (375 a) yalniz dinleyicili olandir.
abstract class TmiKutucugu : ComplicationDataSourceService() {
    private val kapsam = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    protected val depo by lazy { Depo(this) }
    protected val api by lazy { Api({ depo.sunucu }) { depo.belirtec } }
    protected val eslesti get() = depo.sunucu != null && depo.belirtec != null

    // Kutucuga dokununca uygulama Tezgahlar 3B sayfasiyla acilir.
    protected fun dokunus(): PendingIntent = PendingIntent.getActivity(
        this,
        0,
        Intent(this, AnaEtkinlik::class.java)
            .putExtra(AnaEtkinlik.ACILIS, AnaEtkinlik.VITRIN)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    abstract suspend fun veri(request: ComplicationRequest): ComplicationData?

    override fun onComplicationRequest(request: ComplicationRequest, listener: ComplicationRequestListener) {
        kapsam.launch {
            val d = try {
                veri(request)
            } catch (_: RuntimeException) {
                // Beklenmeyen hata kutucugu bozmasin: null'da kadran son degeri gosterir.
                null
            }
            listener.onComplicationData(d)
        }
    }

    override fun onDestroy() {
        kapsam.cancel()
        super.onDestroy()
    }

    protected suspend fun istasyonlar(): List<Istasyon>? = try {
        api.istasyonlar()
    } catch (_: ApiHatasi) {
        null
    }
}

// Acik emirlerin toplam ilerlemesi; adeti bilinen emir yoksa halka bos kalir (sifir uydurulmaz).
class EmirHalkasi : TmiKutucugu() {
    override suspend fun veri(request: ComplicationRequest): ComplicationData? {
        if (!eslesti) return NoDataComplicationData()
        val liste = istasyonlar() ?: return null
        val oran = Kadran.toplamOran(liste.mapNotNull { i -> i.emir?.let { it.saglam to it.hedef } }) ?: return NoDataComplicationData()
        return halka(oran)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.RANGED_VALUE) halka(0.62f) else null

    private fun halka(oran: Float): ComplicationData {
        val yuzde = Math.round(oran * 100)
        return RangedValueComplicationData.Builder(yuzde.toFloat(), 0f, 100f, metin("Açık emirler yüzde $yuzde"))
            .setText(metin("emirler %$yuzde"))
            .setTapAction(dokunus())
            .build()
    }
}

// Dikkat isteyen istasyonlar (ariza, durus, bakim, duraklama); yoksa calisan sayisi.
class IstasyonOzeti : TmiKutucugu() {
    override suspend fun veri(request: ComplicationRequest): ComplicationData? {
        if (!eslesti) return uzun("TMI", ESLESMEDI)
        val liste = istasyonlar() ?: return null
        val (baslik, metin) = Kadran.ozet(liste.map { it.ad to it.durum })
        return uzun(baslik, metin)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.LONG_TEXT) uzun("2 istasyon dikkat", "İstasyon 1 arıza, İstasyon 2 durdu") else null

    private fun uzun(baslik: String, m: String): ComplicationData =
        LongTextComplicationData.Builder(metin(m), metin("$baslik: $m"))
            .setTitle(metin(baslik))
            .setTapAction(dokunus())
            .build()
}

// Sistem Ayarlari'ndaki giris logosu; logo yoksa ya da eslesme yoksa "TMI" yazisi.
class KurumLogosu : TmiKutucugu() {
    override suspend fun veri(request: ComplicationRequest): ComplicationData? {
        if (!eslesti) return yazi()
        val dosya = File(cacheDir, "kurum-logosu")
        if (!dosya.isFile || System.currentTimeMillis() - dosya.lastModified() >= LOGO_TAZELIK_MS) {
            try {
                val b = api.kurumLogosu()
                if (b == null) dosya.delete() else dosya.writeBytes(b)
            } catch (_: ApiHatasi) {
                // Logo alinamazsa onbellekteki kalir.
            }
        }
        if (!dosya.isFile) return yazi()
        val logo: Bitmap = BitmapFactory.decodeFile(dosya.path) ?: return yazi()
        return SmallImageComplicationData.Builder(
            SmallImage.Builder(Icon.createWithBitmap(kutuya(logo)), SmallImageType.PHOTO).build(),
            metin("Kurum logosu"),
        ).setTapAction(dokunus()).build()
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.SHORT_TEXT) yazi() else null

    private fun yazi(): ComplicationData =
        ShortTextComplicationData.Builder(metin("TMI"), metin("TMI")).setTapAction(dokunus()).build()

    // Kadrandaki logo yeri 8:5'tir; logo oranini koruyarak bu kutuya ortalanir, boylece kadran logoyu germez.
    private fun kutuya(logo: Bitmap): Bitmap {
        val kutu = Bitmap.createBitmap(160, 100, Bitmap.Config.ARGB_8888)
        val olcek = minOf(160f / logo.width, 100f / logo.height)
        val g = logo.width * olcek
        val y = logo.height * olcek
        Canvas(kutu).drawBitmap(logo, null, RectF((160 - g) / 2, (100 - y) / 2, (160 + g) / 2, (100 + y) / 2), Paint(Paint.FILTER_BITMAP_FLAG))
        return kutu
    }
}
