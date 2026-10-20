package tmi.saat.ekran

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Text
import tmi.saat.Renkler
import tmi.saat.cekirdek.SunucuAdresi

// Sunucu adresi saatte girilir; uygulamaya ve depoya yazilmaz. "Sonra" ile adres girilmeden de uygulamaya girilir.
@Composable
fun AdresEkrani(mevcut: String?, kaydet: (String) -> Unit, sonra: () -> Unit) {
    var metin by remember { mutableStateOf(mevcut?.removePrefix("https://").orEmpty()) }
    var hata by remember { mutableStateOf<String?>(null) }
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("TMI sunucu adresi", color = Renkler.soluk, fontSize = 12.sp)
        BasicTextField(
            value = metin,
            onValueChange = { metin = it.trim(); hata = null },
            singleLine = true,
            textStyle = TextStyle(color = Renkler.yazi, fontSize = 14.sp, textAlign = TextAlign.Center),
            cursorBrush = SolidColor(Renkler.vurgu),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done, autoCorrectEnabled = false),
            decorationBox = { alan ->
                if (metin.isEmpty()) Text("tmi.kurum.ic:4100", color = Renkler.soluk, fontSize = 14.sp)
                alan()
            },
            modifier = Modifier.fillMaxWidth(),
        )
        hata?.let { Text(it, color = Renkler.hata, fontSize = 11.sp, textAlign = TextAlign.Center) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = sonra, colors = ButtonDefaults.secondaryButtonColors()) { Text(if (mevcut == null) "Sonra" else "Vazgeç", fontSize = 12.sp) }
            Button(onClick = {
                val adres = SunucuAdresi.duzelt(metin)
                if (adres == null) hata = "Adres https olmalı: ad ya da IP, isteğe bağlı :port." else kaydet(adres)
            }) { Text("Kaydet", fontSize = 12.sp) }
        }
    }
}

// Adres girilmemis: uygulama acilir, ozellikler kapalidir.
@Composable
fun KapaliEkran(adresGir: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("TMI", fontSize = 18.sp, color = Renkler.vurgu)
        Text("Sunucu adresi girilmedi. Özellikler kapalı.", color = Renkler.soluk, fontSize = 12.sp, textAlign = TextAlign.Center)
        Button(onClick = adresGir, modifier = Modifier.fillMaxWidth()) { Text("Sunucu adresi gir", fontSize = 12.sp) }
    }
}
