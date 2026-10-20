package tmi.saat.ekran

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import tmi.saat.Api
import tmi.saat.ApiHatasi
import tmi.saat.Onizleme
import tmi.saat.Renkler
import tmi.saat.cekirdek.Cerceve
import tmi.saat.cekirdek.OnizlemeKaresi

// Tezgahta islenen parcanin 3B onizlemesi: Cizim Merkezi'nin yayindaki modelden urettigi aci kareleri (PNG). Saat 3B
// cozmez; tac (ya da dokunma) bir sonraki aciya gecer. Kareler yalniz bu ekran acilinca iner; bellekte en cok uc kare kalir.
@Composable
fun ModelEkrani(api: Api, emirId: Int, oturumBitti: () -> Unit, geri: () -> Unit) {
    var durum by remember(emirId) { mutableStateOf<Yukleme<Onizleme?>>(Yukleme.Bekliyor) }
    LaunchedEffect(emirId) {
        durum = try {
            Yukleme.Geldi(api.onizleme(emirId), System.currentTimeMillis())
        } catch (e: ApiHatasi.OturumYok) {
            oturumBitti()
            return@LaunchedEffect
        } catch (e: ApiHatasi) {
            Yukleme.Hata(e.message ?: "Hata")
        }
    }
    when (val d = durum) {
        is Yukleme.Bekliyor -> Ileti("Yükleniyor")
        is Yukleme.Hata -> Ileti(d.ileti)
        is Yukleme.Geldi -> {
            val o = d.veri
            if (o == null || o.kareler.isEmpty()) Ileti("Bu parça için 3B önizleme yok. Çizim Merkezi'nde modele önizleme üretilmeli.")
            else Kareler(api, emirId, o, oturumBitti, geri)
        }
    }
}

@Composable
private fun Kareler(api: Api, emirId: Int, o: Onizleme, oturumBitti: () -> Unit, geri: () -> Unit) {
    val onbellek = remember(o.revizyonId) { LruCache<Int, ImageBitmap>(3) }
    var kare by remember(o.revizyonId) { mutableStateOf(o.kareler.first()) }
    var resim by remember { mutableStateOf<ImageBitmap?>(null) }
    var hata by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(o.revizyonId, kare) {
        hata = null
        resim = onbellek.get(kare) ?: try {
            val b = api.onizlemeKaresi(emirId, kare)
            BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap()?.also { onbellek.put(kare, it) }
                ?: run { hata = "Kare okunamadı"; null }
        } catch (e: ApiHatasi.OturumYok) {
            oturumBitti()
            return@LaunchedEffect
        } catch (e: ApiHatasi) {
            hata = e.message
            null
        }
    }
    val cevir = { yon: Int -> OnizlemeKaresi.sonraki(o.kareler, kare, yon)?.let { kare = it } }
    val odak = remember { FocusRequester() }
    var birikim by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) { odak.requestFocus() }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .onRotaryScrollEvent { olay ->
                birikim += olay.verticalScrollPixels
                val yon = Cerceve.adim(birikim)
                if (yon != 0) {
                    birikim = 0f
                    cevir(yon)
                }
                true
            }
            .focusRequester(odak)
            .focusable()
            .kaydirilir()
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        UstSatir("Parça 3B", geri)
        Box(
            modifier = Modifier.fillMaxWidth(0.7f).aspectRatio(1f).clickable { cevir(1) },
            contentAlignment = Alignment.Center,
        ) {
            val r = resim
            when {
                r != null -> Image(r, contentDescription = "Parça görünümü, açı ${o.kareler.indexOf(kare) + 1}", modifier = Modifier.fillMaxSize())
                hata != null -> Text(hata.orEmpty(), color = Renkler.soluk, fontSize = 11.sp)
                else -> Text("Yükleniyor", color = Renkler.soluk, fontSize = 11.sp)
            }
        }
        Text("açı ${o.kareler.indexOf(kare) + 1} / ${o.kareler.size} · taçı çevir", color = Renkler.soluk, fontSize = 10.sp)
    }
}
