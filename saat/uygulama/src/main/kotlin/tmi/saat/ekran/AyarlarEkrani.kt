package tmi.saat.ekran

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Switch
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.ToggleChip
import androidx.wear.compose.material.ToggleChipDefaults
import tmi.saat.Renkler
import tmi.saat.cekirdek.Titresim

// Saat ayarlari yalniz bu saatte durur (ornekteki "Saat ayarlari"); sunucuya gitmez.
data class SaatAyarlari(val eldiven: Boolean, val flas: Boolean, val sessiz: Boolean)

@Composable
fun AyarlarEkrani(ayar: SaatAyarlari, degistir: (SaatAyarlari) -> Unit, geri: () -> Unit) {
    ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        item { UstSatir("Saat ayarları", geri) }
        item { Anahtar("Eldiven modu", "büyük dokunma alanı", ayar.eldiven) { degistir(ayar.copy(eldiven = it)) } }
        item { Anahtar("Yanıp sönerek uyar", "gürültülü yerde", ayar.flas) { degistir(ayar.copy(flas = it)) } }
        item { Anahtar("Sessiz saat (mola)", "yalnız makine durdu", ayar.sessiz) { degistir(ayar.copy(sessiz = it)) } }
        item { Text("Titreşim dili", fontSize = 12.sp, color = Renkler.vurgu, modifier = Modifier.padding(top = 6.dp)) }
        items(Titresim.dil) { (ad, desen) ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(ad, fontSize = 11.sp, color = Renkler.soluk)
                Desen(desen, Renkler.vurgu)
            }
        }
    }
}

@Composable
private fun Anahtar(ad: String, alt: String, acik: Boolean, degisti: (Boolean) -> Unit) {
    ToggleChip(
        checked = acik,
        onCheckedChange = degisti,
        label = { Text(ad, fontSize = if (LocalEldiven.current) 15.sp else 13.sp) },
        secondaryLabel = { Text(alt, fontSize = 11.sp, color = Renkler.soluk) },
        toggleControl = { Switch(checked = acik) },
        colors = ToggleChipDefaults.toggleChipColors(checkedStartBackgroundColor = Renkler.panel, uncheckedStartBackgroundColor = Renkler.panel),
        modifier = Modifier.fillMaxWidth(),
    )
}
