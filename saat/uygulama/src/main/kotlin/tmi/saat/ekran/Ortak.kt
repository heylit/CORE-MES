package tmi.saat.ekran

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import java.util.Locale
import kotlinx.coroutines.delay
import tmi.saat.ApiHatasi
import tmi.saat.Renkler

// Ekran acikken 30 sn'de bir sorgu (ornekteki pil tahmininin "Sorgu 30" varsayimi). Ekran kapaninca dongu durur.
const val SORGU_ARALIGI_MS = 30_000L

sealed interface Yukleme<out T> {
    data object Bekliyor : Yukleme<Nothing>
    data class Geldi<T>(val veri: T, val alindiMs: Long) : Yukleme<T>
    data class Hata(val ileti: String) : Yukleme<Nothing>
}

@Composable
// anahtar degisince (ornegin istasyonun emri) eski sonuc atilir ve okuma yeniden baslar.
fun <T> periyodikOku(oturumBitti: () -> Unit, anahtar: Any = Unit, oku: suspend () -> T): MutableState<Yukleme<T>> {
    val durum = remember(anahtar) { mutableStateOf<Yukleme<T>>(Yukleme.Bekliyor) }
    LaunchedEffect(anahtar) {
        while (true) {
            try {
                durum.value = Yukleme.Geldi(oku(), System.currentTimeMillis())
            } catch (e: ApiHatasi.OturumYok) {
                oturumBitti()
                return@LaunchedEffect
            } catch (e: ApiHatasi) {
                // Son gelen veri ekranda kalir; yalniz hic veri yoksa hata gosterilir.
                if (durum.value !is Yukleme.Geldi) durum.value = Yukleme.Hata(e.message ?: "Hata")
            }
            delay(SORGU_ARALIGI_MS)
        }
    }
    return durum
}

// Sabit (listesiz) ekranlar parmakla kaydirilir; alt bosluk son satiri yuvarlak camin kesilen kenarindan yukari tasir.
// Doner cerceve bu ekranlarda baska ise (komsu istasyon, aci) bagli kalir.
@Composable
fun Modifier.kaydirilir(): Modifier = verticalScroll(rememberScrollState()).padding(bottom = 36.dp)

@Composable
fun Ileti(metin: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(metin, color = Renkler.soluk, textAlign = TextAlign.Center)
    }
}

// Eldiven modu: buyuk dokunma alani ve yazi (ornekteki "Eldiven modu"). Ayar ekrani degistirir, satir ve dugmeler okur.
val LocalEldiven = staticCompositionLocalOf { false }

// Ust satir: kok ekranda saat ve sari buyuk harfli baslik; alt ekranda "‹ baslik" geri dugmesi (kaydirarak geri de olur).
@Composable
fun UstSatir(baslik: String, geri: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (geri == null) {
            Text(saatMetni(), fontFamily = FontFamily.Monospace, fontSize = 15.sp, color = Renkler.yazi)
            Text(baslik.uppercase(Locale("tr")), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Renkler.vurgu, letterSpacing = 0.8.sp)
        } else {
            Text(
                "‹ $baslik",
                fontSize = 13.sp,
                color = Renkler.soluk,
                maxLines = 1,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable(onClick = geri).padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
    }
}

// Dakika degisince yenilenen SS:DD.
@Composable
fun saatMetni(): String {
    var simdi by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000 - simdi % 60_000)
            simdi = System.currentTimeMillis()
        }
    }
    val z = java.time.Instant.ofEpochMilli(simdi).atZone(java.time.ZoneId.systemDefault())
    return "%02d:%02d".format(z.hour, z.minute)
}

// Ornekteki liste satiri: solda isikli durum noktasi, adin altinda soluk aciklama, sagda sure ya da sayi rozeti.
@Composable
fun Satir(
    renk: Color,
    baslik: String,
    alt: String? = null,
    sag: String? = null,
    rozet: String? = null,
    onClick: () -> Unit,
) {
    val eldiven = LocalEldiven.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(50))
            .background(Renkler.panel)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = if (eldiven) 13.dp else 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(10.dp).shadow(6.dp, CircleShape, ambientColor = renk, spotColor = renk).background(renk, CircleShape))
        Column(Modifier.weight(1f)) {
            Text(baslik, fontWeight = FontWeight.SemiBold, fontSize = if (eldiven) 16.sp else 14.sp, color = Renkler.yazi, maxLines = 1)
            alt?.let { Text(it, fontSize = if (eldiven) 13.sp else 11.sp, color = Renkler.soluk, maxLines = 2) }
        }
        sag?.let { Text(it, fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = renk) }
        rozet?.let {
            Text(
                it,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Renkler.zemin,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(min = 22.dp).background(renk, RoundedCornerShape(50)).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

// Ilerleme halkasi: koyu zemin halkasi uzerinde durum renginde dolu yay, icinde buyuk sayi ve alt yazi.
// oran null ise yay cizilmez: bos halka "hic yapilmadi" gibi okunur.
@Composable
fun Halka(oran: Float?, renk: Color, buyuk: String, kucuk: String, modifier: Modifier = Modifier) {
    Box(modifier.aspectRatio(1f), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val kalinlik = size.minDimension * 0.08f
            val ic = Size(size.width - kalinlik, size.height - kalinlik)
            val yer = Offset(kalinlik / 2, kalinlik / 2)
            drawArc(Renkler.halkaZemini, 0f, 360f, false, yer, ic, style = Stroke(kalinlik))
            oran?.let { drawArc(renk, -90f, 360f * it.coerceIn(0f, 1f), false, yer, ic, style = Stroke(kalinlik, cap = StrokeCap.Round)) }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(buyuk, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 26.sp, color = Renkler.yazi, maxLines = 1)
            Text(kucuk, fontSize = 11.sp, color = Renkler.soluk, maxLines = 1)
        }
    }
}

// Titresim deseni gorunur cizgi olarak: titresim dolu, bekleme bos.
@Composable
fun Desen(desen: LongArray, renk: Color = Renkler.yazi) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        desen.drop(1).forEachIndexed { k, ms ->
            val genislik = maxOf(3f, ms / 25f).dp
            Box(Modifier.width(genislik).height(6.dp).background(if (k % 2 == 0) renk.copy(alpha = 0.75f) else Color.Transparent, RoundedCornerShape(3.dp)))
        }
    }
}

// Sari ana dugme ve koyu ikincil dugme (ornekteki .d ve .d.ana).
@Composable
fun Dugme(metin: String, ana: Boolean = false, onClick: () -> Unit) {
    val eldiven = LocalEldiven.current
    Text(
        metin,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (ana) Renkler.vurguUstu else Renkler.yazi,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (ana) Renkler.vurgu else Renkler.panel)
            .clickable(onClick = onClick)
            .padding(horizontal = if (eldiven) 16.dp else 11.dp, vertical = if (eldiven) 10.dp else 7.dp),
    )
}
