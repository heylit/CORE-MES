package tmi.saat.ekran

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import tmi.saat.Api
import tmi.saat.ApiHatasi
import tmi.saat.Eslesme
import tmi.saat.EslesmeIstegi
import tmi.saat.IstekDurumu
import tmi.saat.Renkler
import tmi.saat.cekirdek.Eslesme as EslesmeKurali

// Saat kodu gosterir; kisi TMI'da Profil > Akilli saatimi eslestir'de kodu girip onaylar. Saat onayi kendisi sorar
// (15 sn arayla) ya da "Devam" ile hemen sorar. Istegin suresi dolunca yeni kod gelir.
@Composable
fun EslesmeEkrani(api: Api, adresDegistir: () -> Unit, eslesti: (Eslesme) -> Unit) {
    var istek by remember { mutableStateOf<EslesmeIstegi?>(null) }
    var ileti by remember { mutableStateOf<String?>(null) }
    var yenile by remember { mutableIntStateOf(0) }
    val kapsam = rememberCoroutineScope()

    suspend fun sor(i: EslesmeIstegi) {
        try {
            when (val d = api.istekSor(i.istek)) {
                is IstekDurumu.Onaylandi -> eslesti(d.eslesme)
                IstekDurumu.Bekliyor -> ileti = "Henüz onaylanmadı."
            }
        } catch (e: ApiHatasi.OturumYok) {
            // Istegin suresi doldu ya da belirtec alindi: yeni kod.
            istek = null
            yenile += 1
        } catch (e: ApiHatasi) {
            ileti = e.message
        }
    }

    LaunchedEffect(yenile) {
        try {
            istek = api.istekAc()
            ileti = null
        } catch (e: ApiHatasi) {
            ileti = e.message
        }
    }
    LaunchedEffect(istek) {
        val i = istek ?: return@LaunchedEffect
        while (true) {
            delay(EslesmeKurali.SORU_ARALIGI_MS)
            sor(i)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("TMI'da Profil > Akıllı saatimi eşleştir", color = Renkler.soluk, fontSize = 12.sp, textAlign = TextAlign.Center)
        val i = istek
        if (i == null) {
            Text(ileti ?: "Kod alınıyor", color = Renkler.soluk, textAlign = TextAlign.Center)
            if (ileti != null) Button(onClick = { yenile += 1 }) { Text("Yeniden") }
            CompactChip(onClick = adresDegistir, label = { Text("Sunucu adresi", fontSize = 11.sp) }, colors = ChipDefaults.secondaryChipColors())
        } else {
            Text(EslesmeKurali.kodMetni(i.kod), fontSize = 30.sp, fontWeight = FontWeight.Bold, color = Renkler.vurgu)
            ileti?.let { Text(it, color = Renkler.soluk, fontSize = 12.sp, textAlign = TextAlign.Center) }
            Button(onClick = { kapsam.launch { sor(i) } }) { Text("Devam") }
        }
    }
}
