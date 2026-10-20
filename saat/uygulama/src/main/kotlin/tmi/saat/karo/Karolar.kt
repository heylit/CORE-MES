package tmi.saat.karo

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.DimensionBuilders.wrap
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import tmi.saat.AnaEtkinlik
import tmi.saat.Api
import tmi.saat.ApiHatasi
import tmi.saat.Depo
import tmi.saat.Renkler
import tmi.saat.cekirdek.IstasyonDurumu
import tmi.saat.cekirdek.Zaman
import tmi.saat.ekran.UYARI_TURU_ADI
import tmi.saat.ekran.uyariYeri

// Karo sistemin istegiyle yenilenir; en sik 5 dakikada bir (pil). Uygulama acikken yeni uyari zaten uygulamada gorulur.
private const val TAZELIK_MS = 5 * 60_000L
private const val KAYNAK_SURUMU = "1"

// Ornekteki karo: sari baslik, en cok uc kucuk satir (durum noktasi, ad, sagda sayi ya da saat), "Ac" dugmesi.
data class MiniSatir(val renk: Color, val sol: String, val sag: String)

abstract class TmiKarosu : TileService() {
    private val kapsam = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    abstract val baslik: String

    abstract suspend fun satirlar(api: Api): List<MiniSatir>

    override fun onTileRequest(istek: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val sonuc = Sonuc<TileBuilders.Tile>()
        kapsam.launch {
            val depo = Depo(this@TmiKarosu)
            val icerik = try {
                if (depo.sunucu == null || depo.belirtec == null) listOf(MiniSatir(Renkler.bos, "TMI'ı açıp eşleştirin", ""))
                else satirlar(Api({ depo.sunucu }) { depo.belirtec })
            } catch (e: ApiHatasi) {
                listOf(MiniSatir(Renkler.bos, e.message ?: "Sunucuya ulaşılamıyor", ""))
            } catch (e: RuntimeException) {
                // Beklenmeyen hata karoyu bekletmesin: sistem cevapsiz karoyu bos gosterir.
                listOf(MiniSatir(Renkler.bos, "Karo okunamadı", ""))
            }
            sonuc.tamamla(karo(this@TmiKarosu, baslik, icerik))
        }
        return sonuc
    }

    override fun onTileResourcesRequest(istek: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Sonuc.hazir(ResourceBuilders.Resources.Builder().setVersion(KAYNAK_SURUMU).build())

    override fun onDestroy() {
        kapsam.cancel()
        super.onDestroy()
    }
}

class IstasyonKarosu : TmiKarosu() {
    override val baslik = "İstasyonlarım"

    override suspend fun satirlar(api: Api): List<MiniSatir> =
        api.istasyonlar().take(3).map { i ->
            MiniSatir(Renkler.durum(IstasyonDurumu.coz(i.durum)), i.ad, i.emir?.let { e -> "${e.saglam ?: "-"}/${e.hedef}" } ?: "")
        }.ifEmpty { listOf(MiniSatir(Renkler.bos, "İstasyon yok", "")) }
}


class UyariKarosu : TmiKarosu() {
    override val baslik = "Uyarılar"

    override suspend fun satirlar(api: Api): List<MiniSatir> =
        api.uyarilar().takeLast(3).reversed().map { u ->
            MiniSatir(Renkler.uyariTuru(u.tur), "${UYARI_TURU_ADI[u.tur] ?: u.tur} · ${uyariYeri(u)}", Zaman.saatDakika(u.baslangic) ?: "")
        }.ifEmpty { listOf(MiniSatir(Renkler.bos, "Yeni uyarı yok", "")) }
}

private fun renk(c: Color) = argb(c.toArgb())

private fun yazi(metin: String, boyut: Float, c: Color, kalin: Boolean = false): LayoutElement =
    Text.Builder()
        .setText(metin)
        .setMaxLines(1)
        .setFontStyle(
            FontStyle.Builder().setSize(sp(boyut)).setColor(renk(c))
                .setWeight(if (kalin) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL).build(),
        )
        .build()

private fun mini(s: MiniSatir): LayoutElement {
    val nokta = Box.Builder().setWidth(dp(8f)).setHeight(dp(8f))
        .setModifiers(ModifiersBuilders.Modifiers.Builder().setBackground(
            ModifiersBuilders.Background.Builder().setColor(renk(s.renk)).setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(4f)).build()).build(),
        ).build())
        .build()
    return Row.Builder()
        .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
        .setModifiers(ModifiersBuilders.Modifiers.Builder().setPadding(ModifiersBuilders.Padding.Builder().setTop(dp(2f)).setBottom(dp(2f)).build()).build())
        .addContent(nokta)
        .addContent(Spacer.Builder().setWidth(dp(6f)).build())
        .addContent(yazi(s.sol, 13f, Renkler.yazi))
        .addContent(Spacer.Builder().setWidth(dp(6f)).build())
        .addContent(yazi(s.sag, 12f, s.renk, kalin = true))
        .build()
}

private fun karo(baglam: Context, baslik: String, satirlar: List<MiniSatir>): TileBuilders.Tile {
    val ac = ModifiersBuilders.Clickable.Builder()
        .setId("ac")
        .setOnClick(
            ActionBuilders.LaunchAction.Builder().setAndroidActivity(
                ActionBuilders.AndroidActivity.Builder().setPackageName(baglam.packageName).setClassName(AnaEtkinlik::class.java.name).build(),
            ).build(),
        )
        .build()
    val dugme = Box.Builder()
        .setWidth(wrap()).setHeight(wrap())
        .setModifiers(
            ModifiersBuilders.Modifiers.Builder()
                .setClickable(ac)
                .setBackground(ModifiersBuilders.Background.Builder().setColor(renk(Renkler.vurgu)).setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(16f)).build()).build())
                .setPadding(ModifiersBuilders.Padding.Builder().setStart(dp(16f)).setEnd(dp(16f)).setTop(dp(6f)).setBottom(dp(6f)).build())
                .build(),
        )
        .addContent(yazi("Aç", 13f, Renkler.vurguUstu, kalin = true))
        .build()
    val sutun = Column.Builder()
        .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        .addContent(yazi(baslik.uppercase(java.util.Locale("tr")), 12f, Renkler.vurgu, kalin = true))
        .addContent(Spacer.Builder().setHeight(dp(6f)).build())
    satirlar.forEach { sutun.addContent(mini(it)) }
    sutun.addContent(Spacer.Builder().setHeight(dp(8f)).build()).addContent(dugme)
    val kok = Box.Builder().setWidth(expand()).setHeight(expand())
        .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(ac).build())
        .addContent(sutun.build())
        .build()
    return TileBuilders.Tile.Builder()
        .setResourcesVersion(KAYNAK_SURUMU)
        .setFreshnessIntervalMillis(TAZELIK_MS)
        .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(kok))
        .build()
}
