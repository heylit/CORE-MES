package tmi.saat.ekran

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Text
import tmi.saat.Renkler
import tmi.saat.Uyari
import tmi.saat.cekirdek.Titresim
import tmi.saat.cekirdek.Zaman

internal val UYARI_TURU_ADI = mapOf(
    "ariza" to "Arıza",
    "bakim" to "Bakım",
    "durus" to "Makine durdu",
    "kalibrasyon" to "Kalibrasyon",
    "kalite" to "Kalite onayı",
    "malzeme" to "Malzeme eksik",
    "bitti" to "Emir tamamlandı",
)

// Uyarinin yeri: istasyon ya da (kalibrasyonda) aletin numarasi ve adi.
fun uyariYeri(u: Uyari): String = u.istasyonAd ?: u.alet?.let { "${it.no} · ${it.ad}" } ?: "-"

// Ornekteki uyari listesi: tur rengi nokta, baslik, istasyon ve aciklama, sagda baslangic saati. Dokununca tam ekran uyari.
@Composable
fun UyarilarEkrani(durum: Yukleme<List<Uyari>>, geri: () -> Unit, ac: (Uyari) -> Unit) {
    when (durum) {
        is Yukleme.Bekliyor -> Ileti("Yükleniyor")
        is Yukleme.Hata -> Ileti(durum.ileti)
        is Yukleme.Geldi -> ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            item { UstSatir("Uyarılar", geri) }
            if (durum.veri.isEmpty()) {
                item { Satir(renk = Renkler.bos, baslik = "Yeni uyarı yok", onClick = {}) }
            }
            items(durum.veri.reversed()) { u ->
                Satir(
                    renk = Renkler.uyariTuru(u.tur),
                    baslik = UYARI_TURU_ADI[u.tur] ?: u.tur,
                    alt = uyariMetni(u),
                    sag = Zaman.saatDakika(u.baslangic),
                    onClick = { ac(u) },
                )
            }
        }
    }
}

fun uyariMetni(u: Uyari): String =
    listOfNotNull(uyariYeri(u), u.emirNo, u.aciklama ?: if (u.tur == "durus") "Duruş nedeni girilmedi." else null).joinToString(" · ")

// Ornekteki tam ekran uyari: tur renginde merkezden kararan zemin, uclu isaret, istasyon, aciklama, titresim deseni,
// "Bak" (istasyona gider) ve "Gordum" (listeden duser). Ornekteki "Neden sec" saatten yazmadir, ikinci surumde.
@Composable
fun UyariEkrani(uyari: Uyari, flas: Boolean, bak: (() -> Unit)?, gordum: () -> Unit) {
    val renk = Renkler.uyariTuru(uyari.tur)
    // Yanip sonerek uyar: gurultude titresim kacirilir; zemin uc kez tur rengiyle parlar.
    val parlama = remember { Animatable(0f) }
    LaunchedEffect(flas) {
        if (!flas) return@LaunchedEffect
        repeat(3) {
            parlama.animateTo(0.55f, tween(250))
            parlama.animateTo(0f, tween(250))
        }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.radialGradient(0f to lerp(Color.Black, renk, 0.45f), 0.72f to Color.Black))
            .background(renk.copy(alpha = parlama.value))
            .padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        UcgenIsaret(Modifier.size(44.dp))
        Text(uyariYeri(uyari), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Renkler.yazi, textAlign = TextAlign.Center, maxLines = 1)
        Text(
            listOfNotNull(UYARI_TURU_ADI[uyari.tur] ?: uyari.tur, uyari.emirNo).joinToString(" · ") + ". " +
                (uyari.aciklama ?: if (uyari.tur == "durus") "Duruş nedeni girilmedi." else "Açıklama yok."),
            fontSize = 12.sp,
            color = Renkler.yazi.copy(alpha = 0.85f),
            textAlign = TextAlign.Center,
            maxLines = 3,
        )
        Titresim.desen(uyari.tur)?.let { Desen(it) }
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.padding(top = 4.dp)) {
            if (bak != null) Dugme("Bak", onClick = bak)
            Dugme("Gördüm", ana = true, onClick = gordum)
        }
    }
}

@Composable
private fun UcgenIsaret(modifier: Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val cizgi = Stroke(width = w * 0.08f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        val ucgen = Path().apply {
            moveTo(w * 0.5f, h * 0.08f)
            lineTo(w * 0.96f, h * 0.88f)
            lineTo(w * 0.04f, h * 0.88f)
            close()
        }
        drawPath(ucgen, Renkler.yazi, style = cizgi)
        drawLine(Renkler.yazi, Offset(w * 0.5f, h * 0.38f), Offset(w * 0.5f, h * 0.6f), w * 0.08f, StrokeCap.Round)
        drawLine(Renkler.yazi, Offset(w * 0.5f, h * 0.73f), Offset(w * 0.5f, h * 0.735f), w * 0.08f, StrokeCap.Round)
    }
}
