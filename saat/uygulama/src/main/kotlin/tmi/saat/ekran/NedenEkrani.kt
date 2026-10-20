package tmi.saat.ekran

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import tmi.saat.Api
import tmi.saat.ApiHatasi
import tmi.saat.DurusNedeni
import tmi.saat.Renkler

private sealed interface Gonderim {
    data object Yok : Gonderim
    data object Gidiyor : Gonderim
    data class Kaydedildi(val neden: String) : Gonderim
    data class Hata(val ileti: String) : Gonderim
}

// Ornekteki "Duruş nedeni": nedenler cerceveyle gezilen hap dugmeler; secilen neden emri durdurur.
// Yetkisi olmayan kisi icin sunucu 403 doner; saat yetkiyi bilmez, sunucunun cevabini yazar.
@Composable
fun NedenEkrani(api: Api, emirId: Int, oturumBitti: () -> Unit, geri: () -> Unit, bitti: () -> Unit) {
    var nedenler by remember { mutableStateOf<Yukleme<List<DurusNedeni>>>(Yukleme.Bekliyor) }
    var gonderim by remember { mutableStateOf<Gonderim>(Gonderim.Yok) }
    val kapsam = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        nedenler = try {
            Yukleme.Geldi(api.durusNedenleri(), System.currentTimeMillis())
        } catch (e: ApiHatasi.OturumYok) {
            oturumBitti()
            return@LaunchedEffect
        } catch (e: ApiHatasi) {
            Yukleme.Hata(e.message ?: "Hata")
        }
    }
    LaunchedEffect(gonderim) {
        if (gonderim is Gonderim.Kaydedildi) {
            delay(1_500)
            bitti()
        }
    }

    val sec = { n: DurusNedeni ->
        if (gonderim !is Gonderim.Gidiyor) {
            gonderim = Gonderim.Gidiyor
            val kimlik = UUID.randomUUID().toString()
            kapsam.launch {
                gonderim = try {
                    api.emirDurdur(emirId, n.id, kimlik)
                    Gonderim.Kaydedildi(n.ad)
                } catch (e: ApiHatasi.OturumYok) {
                    oturumBitti()
                    Gonderim.Yok
                } catch (e: ApiHatasi) {
                    Gonderim.Hata(e.message ?: "Kaydedilemedi")
                }
            }
        }
    }

    when (val g = gonderim) {
        is Gonderim.Kaydedildi -> {
            Ileti("Neden kaydedildi · ${g.neden}")
            return
        }
        Gonderim.Gidiyor -> {
            Ileti("Kaydediliyor")
            return
        }
        else -> Unit
    }
    when (val d = nedenler) {
        is Yukleme.Bekliyor -> Ileti("Yükleniyor")
        is Yukleme.Hata -> Ileti(d.ileti)
        is Yukleme.Geldi -> ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            item { UstSatir("Duruş nedeni", geri) }
            (gonderim as? Gonderim.Hata)?.let { h -> item { Ileti(h.ileti) } }
            if (d.veri.isEmpty()) item { Ileti("Tanımlı duruş nedeni yok") }
            items(d.veri, key = { it.id }) { n -> Satir(renk = Renkler.hata, baslik = n.ad, onClick = { sec(n) }) }
        }
    }
}
