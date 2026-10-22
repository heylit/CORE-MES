package tmi.saat.ekran

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import tmi.saat.Istasyon
import tmi.saat.Renkler
import tmi.saat.cekirdek.NfcEtiketi

// Yalniz kart taklidi (HCE) bildiren saatte de adaptor doner, ama okuyucu yoktur ve enableReaderMode hata atar: okuyucu ozelligi sorulur.
fun nfcVarMi(baglam: Context): Boolean =
    baglam.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC) && NfcAdapter.getDefaultAdapter(baglam) != null

internal tailrec fun Context.etkinlik(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.etkinlik()
    else -> null
}

// Etiketteki ilk okunabilir kayit; NDEF olmayan ya da bos etiket null.
private fun etiketKodu(etiket: Tag): String? =
    Ndef.get(etiket)?.cachedNdefMessage?.records?.firstNotNullOfOrNull { NfcEtiketi.kod(it.tnf, it.type, it.payload) }

private sealed interface Okuma {
    data object Bekliyor : Okuma
    data class Bulundu(val kod: String) : Okuma
    data object Okunamadi : Okuma
    data object Desteklenmiyor : Okuma
}

// Ornekteki "Istasyona giris": saat istasyon etiketine yaklastirilir, etiketteki kodla o istasyonun ayrintisi acilir.
// Yalniz okur; ekran aciksa okuyucu acik, cikinca kapanir.
@Composable
fun NfcEkrani(istasyonlar: List<Istasyon>?, geri: () -> Unit, istasyonAc: (istasyonId: Int) -> Unit) {
    val baglam = LocalContext.current
    var okuma by remember { mutableStateOf<Okuma>(Okuma.Bekliyor) }

    DisposableEffect(Unit) {
        val etkinlik = baglam.etkinlik()
        val okuyucu = NfcAdapter.getDefaultAdapter(baglam)
        var acik = false
        if (etkinlik != null && okuyucu != null) {
            val turler = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V
            // Menu satiri okuyucusuz saatte gizlidir; yine de sistem okuyucuyu reddederse ekran cokmez, durum yazilir.
            acik = try {
                okuyucu.enableReaderMode(etkinlik, { etiket -> okuma = etiketKodu(etiket)?.let { Okuma.Bulundu(it) } ?: Okuma.Okunamadi }, turler, null)
                true
            } catch (e: UnsupportedOperationException) {
                false
            } catch (e: IllegalStateException) {
                false
            }
        }
        if (!acik) okuma = Okuma.Desteklenmiyor
        onDispose { if (acik && etkinlik != null) runCatching { okuyucu?.disableReaderMode(etkinlik) } }
    }

    val bulunan = (okuma as? Okuma.Bulundu)?.let { o -> istasyonlar?.let { NfcEtiketi.bul(it, o.kod) { i -> i.kod } } }
    LaunchedEffect(bulunan) { bulunan?.let { istasyonAc(it.id) } }

    val (baslik, metin, renk) = when (val o = okuma) {
        Okuma.Bekliyor -> Triple("İstasyona giriş", "Saati istasyondaki etikete yaklaştırın.", Renkler.vurgu)
        Okuma.Okunamadi -> Triple("Etiket okunamadı", "Etikette istasyon kodu yok. Yeniden yaklaştırın.", Renkler.uyari)
        Okuma.Desteklenmiyor -> Triple("NFC okunamıyor", "Bu saat etiket okuyamaz. İstasyonu İstasyonlarım listesinden seçin.", Renkler.uyari)
        is Okuma.Bulundu ->
            if (istasyonlar == null) Triple("İstasyon kodu: ${o.kod}", "İstasyonlar yükleniyor.", Renkler.vurgu)
            else if (bulunan == null) Triple("İstasyon kodu: ${o.kod}", "Bu istasyon sizin istasyonlarınız arasında değil.", Renkler.uyari)
            else Triple(bulunan.ad, "Açılıyor", Renkler.tamam)
    }
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
    ) {
        Box(Modifier.size(52.dp).border(2.dp, renk, CircleShape), contentAlignment = Alignment.Center) {
            NfcSimgesi(renk, Modifier.size(28.dp))
        }
        Text(baslik, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Renkler.yazi, textAlign = TextAlign.Center, maxLines = 1)
        Text(metin, fontSize = 11.sp, color = Renkler.soluk, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Dugme("Vazgeç", onClick = geri)
    }
}

// Ornekteki simge: sola bakan uc yay, iceriden disa buyuyen.
@Composable
private fun NfcSimgesi(renk: Color, modifier: Modifier) {
    Canvas(modifier) {
        val kalem = Stroke(width = size.minDimension * 0.09f, cap = StrokeCap.Round)
        listOf(0.3f, 0.6f, 0.9f).forEach { oran ->
            val r = size.minDimension * oran / 2
            val merkez = Offset(size.width * 0.2f, size.height / 2)
            drawArc(renk, -55f, 110f, false, Offset(merkez.x - r, merkez.y - r), Size(r * 2, r * 2), style = kalem)
        }
    }
}
