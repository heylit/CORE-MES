package tmi.saat.kadran

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.view.SurfaceHolder
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.wear.watchface.CanvasType
import androidx.wear.watchface.ComplicationSlotsManager
import androidx.wear.watchface.DrawMode
import androidx.wear.watchface.Renderer
import androidx.wear.watchface.TapEvent
import androidx.wear.watchface.TapType
import androidx.wear.watchface.WatchFace
import androidx.wear.watchface.WatchFaceService
import androidx.wear.watchface.WatchFaceType
import androidx.wear.watchface.WatchState
import androidx.wear.watchface.ComplicationSlot
import androidx.wear.watchface.style.CurrentUserStyleRepository
import java.io.File
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import tmi.saat.AnaEtkinlik
import tmi.saat.Api
import tmi.saat.ApiHatasi
import tmi.saat.Depo
import tmi.saat.Istasyon
import tmi.saat.Renkler
import tmi.saat.cekirdek.IstasyonDurumu
import tmi.saat.cekirdek.Kadran

// Kadran yalniz ekran acik ve tam parlakken sorgular, dakikada bir; kisik modda ve ekran kapaliyken hic sorgu yoktur (pil).
private const val SORGU_ARALIGI_MS = 60_000L
// Kurum logosu (Sistem Ayarlari) gunde bir yenilenir; arada saatin onbelleginden cizilir.
private const val LOGO_TAZELIK_MS = 24 * 60 * 60_000L

data class KadranSatiri(val renk: Int, val ad: String, val sag: String)
data class KadranVerisi(val satirlar: List<KadranSatiri>, val oran: Float?, val ileti: String?)

class TmiKadrani : WatchFaceService() {
    private val kapsam = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override suspend fun createWatchFace(
        surfaceHolder: SurfaceHolder,
        watchState: WatchState,
        complicationSlotsManager: ComplicationSlotsManager,
        currentUserStyleRepository: CurrentUserStyleRepository,
    ): WatchFace {
        val cizici = Cizici(surfaceHolder, watchState, currentUserStyleRepository)
        val depo = Depo(this)
        val api = Api({ depo.sunucu }) { depo.belirtec }
        val logoDosyasi = File(cacheDir, "kurum-logosu")
        cizici.logo = logoDosyasi.takeIf { it.isFile }?.let { BitmapFactory.decodeFile(it.path) }
        kapsam.launch {
            if (depo.sunucu == null) return@launch
            if (logoDosyasi.isFile && System.currentTimeMillis() - logoDosyasi.lastModified() < LOGO_TAZELIK_MS) return@launch
            try {
                val b = api.kurumLogosu()
                if (b == null) logoDosyasi.delete() else logoDosyasi.writeBytes(b)
                cizici.logo = b?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
            } catch (_: ApiHatasi) {
                // Logo alinamazsa onbellekteki kalir; kadran logosuz da calisir.
            }
        }
        kapsam.launch {
            combine(watchState.isVisible, watchState.isAmbient) { gorunur, kisik -> gorunur == true && kisik == false }
                .collectLatest { acik ->
                    while (acik) {
                        cizici.veri = oku(depo, api)
                        cizici.invalidate()
                        delay(SORGU_ARALIGI_MS)
                    }
                }
        }
        return WatchFace(WatchFaceType.DIGITAL, cizici).setTapListener(object : WatchFace.TapListener {
            override fun onTapEvent(tapType: Int, tapEvent: TapEvent, complicationSlot: ComplicationSlot?) {
                if (tapType != TapType.UP) return
                startActivity(
                    Intent(this@TmiKadrani, AnaEtkinlik::class.java)
                        .putExtra(AnaEtkinlik.ACILIS, AnaEtkinlik.VITRIN)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                )
            }
        })
    }

    private suspend fun oku(depo: Depo, api: Api): KadranVerisi {
        if (depo.sunucu == null || depo.belirtec == null) return KadranVerisi(emptyList(), null, "TMI'ı açıp eşleştirin")
        return try {
            kadranVerisi(api.istasyonlar())
        } catch (e: ApiHatasi) {
            KadranVerisi(emptyList(), null, e.message ?: "Sunucuya ulaşılamıyor")
        }
    }

    override fun onDestroy() {
        kapsam.cancel()
        super.onDestroy()
    }
}

fun kadranVerisi(istasyonlar: List<Istasyon>): KadranVerisi {
    val satirlar = Kadran.gosterilecek(istasyonlar.map { it.durum }).map { k ->
        val i = istasyonlar[k]
        val d = IstasyonDurumu.coz(i.durum)
        val dikkat = d == IstasyonDurumu.ARIZA || d == IstasyonDurumu.DURDU || d == IstasyonDurumu.BAKIM || d == IstasyonDurumu.DURAKLI
        val sag = if (dikkat) (d?.etiket ?: i.durum).lowercase(Locale("tr")) else i.emir?.let { "${it.saglam ?: "-"}/${it.hedef}" } ?: (d?.etiket ?: i.durum).lowercase(Locale("tr"))
        KadranSatiri(Renkler.durum(d).toArgb(), i.ad, sag)
    }
    val oran = Kadran.toplamOran(istasyonlar.mapNotNull { i -> i.emir?.let { it.saglam to it.hedef } })
    return KadranVerisi(satirlar, oran, if (istasyonlar.isEmpty()) "İstasyon yok" else null)
}

private class Cizici(
    yuzey: SurfaceHolder,
    private val durum: WatchState,
    stil: CurrentUserStyleRepository,
) : Renderer.CanvasRenderer2<Cizici.Ortak>(yuzey, stil, durum, CanvasType.HARDWARE, 1000L, false) {
    class Ortak : Renderer.SharedAssets {
        override fun onDestroy() {}
    }

    @Volatile var veri: KadranVerisi? = null
    @Volatile var logo: Bitmap? = null

    private val saatBicimi = DateTimeFormatter.ofPattern("HH:mm")
    private val tarihBicimi = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale("tr"))
    private fun renk(c: Color) = c.toArgb()
    private val boya = Paint(Paint.ANTI_ALIAS_FLAG)
    private val halka = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }

    override suspend fun createSharedAssets() = Ortak()

    override fun render(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: Ortak) {
        val kisik = renderParameters.drawMode == DrawMode.AMBIENT
        val g = bounds.width().toFloat()
        val cx = bounds.exactCenterX()
        canvas.drawColor(renk(Renkler.zemin))

        if (kisik) {
            yazi(canvas, zonedDateTime.format(saatBicimi), cx, bounds.top + g * 0.52f, g * 0.2f, renk(Renkler.sonuk), Typeface.MONOSPACE)
            val duran = veri?.satirlar?.count { it.renk == renk(Renkler.hata) } ?: 0
            if (duran > 0) yazi(canvas, "$duran istasyon durdu", cx, bounds.top + g * 0.64f, g * 0.05f, renk(Renkler.sonuk))
            return
        }

        val kalinlik = g * 0.03f
        val kutu = RectF(bounds).apply { inset(kalinlik, kalinlik) }
        halka.strokeWidth = kalinlik
        halka.color = renk(Renkler.halkaZemini)
        canvas.drawArc(kutu, 0f, 360f, false, halka)
        val v = veri
        v?.oran?.let { oran ->
            halka.color = renk(Renkler.tamam)
            canvas.drawArc(kutu, -90f, 360f * oran, false, halka)
        }

        val l = logo
        if (l != null) {
            val yuk = g * 0.08f
            val gen = yuk * l.width / l.height.coerceAtLeast(1)
            canvas.drawBitmap(l, null, RectF(cx - gen / 2, bounds.top + g * 0.12f, cx + gen / 2, bounds.top + g * 0.12f + yuk), boya)
        } else {
            yazi(canvas, "TMI", cx, bounds.top + g * 0.18f, g * 0.06f, renk(Renkler.vurgu), Typeface.DEFAULT_BOLD)
        }
        yazi(canvas, zonedDateTime.format(saatBicimi), cx, bounds.top + g * 0.40f, g * 0.19f, renk(Renkler.yazi), Typeface.create(Typeface.MONOSPACE, Typeface.BOLD))
        yazi(canvas, zonedDateTime.format(tarihBicimi), cx, bounds.top + g * 0.47f, g * 0.045f, renk(Renkler.soluk))

        if (v == null) return
        v.ileti?.let { yazi(canvas, it, cx, bounds.top + g * 0.62f, g * 0.045f, renk(Renkler.soluk)) }
        val sol = bounds.left + g * 0.22f
        val sag = bounds.right - g * 0.22f
        v.satirlar.forEachIndexed { k, s ->
            val y = bounds.top + g * (0.58f + k * 0.085f)
            boya.color = s.renk
            canvas.drawCircle(sol + g * 0.015f, y - g * 0.015f, g * 0.018f, boya)
            satir(canvas, s.ad, sol + g * 0.05f, y, g * 0.05f, renk(Renkler.yazi), Paint.Align.LEFT, sag - g * 0.2f)
            satir(canvas, s.sag, sag, y, g * 0.045f, s.renk, Paint.Align.RIGHT, null)
        }
        v.oran?.let { yazi(canvas, "emirler %${Math.round(it * 100)}", cx, bounds.top + g * 0.87f, g * 0.04f, renk(Renkler.soluk)) }
    }

    override fun renderHighlightLayer(canvas: Canvas, bounds: Rect, zonedDateTime: ZonedDateTime, sharedAssets: Ortak) {
        canvas.drawColor(renderParameters.highlightLayer?.backgroundTint ?: 0)
    }

    private fun yazi(canvas: Canvas, metin: String, x: Float, y: Float, boyut: Float, c: Int, yuz: Typeface = Typeface.DEFAULT) =
        satir(canvas, metin, x, y, boyut, c, Paint.Align.CENTER, null, yuz)

    private fun satir(canvas: Canvas, metin: String, x: Float, y: Float, boyut: Float, c: Int, hiza: Paint.Align, enCokX: Float?, yuz: Typeface = Typeface.DEFAULT) {
        boya.textSize = boyut
        boya.color = c
        boya.typeface = yuz
        boya.textAlign = hiza
        var m = metin
        if (enCokX != null) {
            val alan = enCokX - x
            while (m.length > 1 && boya.measureText(m) > alan) m = m.dropLast(1)
            if (m != metin) m = m.dropLast(1) + "…"
        }
        canvas.drawText(m, x, y, boya)
    }
}
