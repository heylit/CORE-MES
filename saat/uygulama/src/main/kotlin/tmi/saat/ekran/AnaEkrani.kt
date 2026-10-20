package tmi.saat.ekran

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Text
import tmi.saat.Pano
import tmi.saat.Renkler
import tmi.saat.cekirdek.IstasyonDurumu

// Ornekteki ana menu: Istasyonlarim (duran sayisi) ve Uyarilar (okunmamis sayisi). Harita, vardiya ve cagri ikinci surumde.
@Composable
fun AnaEkrani(
    durum: Yukleme<Pano>,
    okunmamis: Int,
    sessiz: Boolean,
    istasyonlariAc: () -> Unit,
    uyarilariAc: () -> Unit,
    ayarlariAc: () -> Unit,
    vardiyaAc: () -> Unit,
    ozetAc: () -> Unit,
    vitrinAc: () -> Unit,
    nfcAc: (() -> Unit)?,
    adresDegistir: () -> Unit,
) {
    ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        item { UstSatir("TMI Core") }
        if (sessiz) item { Text("Sessiz", fontSize = 11.sp, color = Renkler.uyari) }
        when (durum) {
            is Yukleme.Bekliyor -> item { Text("Yükleniyor", color = Renkler.soluk) }
            is Yukleme.Hata -> item { Text(durum.ileti, color = Renkler.soluk, fontSize = 12.sp) }
            is Yukleme.Geldi -> {
                val istasyonlar = durum.veri.istasyonlar
                val duran = istasyonlar.count { IstasyonDurumu.coz(it.durum).let { d -> d == IstasyonDurumu.ARIZA || d == IstasyonDurumu.DURDU } }
                item {
                    Satir(
                        renk = if (duran > 0) Renkler.hata else Renkler.vurgu,
                        baslik = "İstasyonlarım",
                        alt = if (duran > 0) "$duran istasyon durdu" else "hepsi çalışıyor ya da sırada",
                        rozet = istasyonlar.size.toString(),
                        onClick = istasyonlariAc,
                    )
                }
                item { Satir(renk = Renkler.vurgu, baslik = "Tezgâhlar 3B", alt = "parça görünümü, taçla geç", onClick = vitrinAc) }
                item {
                    Satir(
                        renk = if (okunmamis > 0) Renkler.uyari else Renkler.bos,
                        baslik = "Uyarılar",
                        alt = if (okunmamis > 0) "okunmamış" else "yeni uyarı yok",
                        rozet = okunmamis.takeIf { it > 0 }?.toString(),
                        onClick = uyarilariAc,
                    )
                }
            }
        }
        item { Satir(renk = Renkler.vurgu, baslik = "Yönetici özeti", alt = "bugün, bütün istasyonlar", onClick = ozetAc) }
        item { Satir(renk = Renkler.vurgu, baslik = "Vardiya devri", alt = "duruş ve açık işler", onClick = vardiyaAc) }
        nfcAc?.let { ac -> item { Satir(renk = Renkler.vurgu, baslik = "İstasyona giriş", alt = "NFC etiketiyle", onClick = ac) } }
        item { Satir(renk = Renkler.vurgu, baslik = "Saat ayarları", alt = "eldiven, uyarı, sessiz", onClick = ayarlariAc) }
        item {
            CompactChip(onClick = adresDegistir, label = { Text("Sunucu adresi", fontSize = 11.sp) }, colors = ChipDefaults.secondaryChipColors())
        }
    }
}
