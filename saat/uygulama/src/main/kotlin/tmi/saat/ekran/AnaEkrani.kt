package tmi.saat.ekran

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Text
import tmi.saat.Pano
import tmi.saat.Renkler
import tmi.saat.cekirdek.IstasyonDurumu

// Ana menu (82 a): kullanim sirasiyla Yonetici ozeti, Uyarilar (okunmamis sayisi), Istasyonlarim (duran sayisi), Tezgahlar 3B,
// NFC (yalniz okuyuculu saatte), Vardiya devri, Saat ayarlari. Sunucu adresi ayarlarin icindedir.
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
) {
    val acilis = rememberAcilisAni()
    ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        item { UstSatir("TMI Core") }
        if (sessiz) item { Text("Sessiz", fontSize = 11.sp, color = Renkler.uyari) }
        if (durum is Yukleme.Hata) item { Text(durum.ileti, color = Renkler.soluk, fontSize = 12.sp) }
        item { BayatSatiri(durum) }
        item { Satir(renk = Renkler.vurgu, baslik = "Yönetici özeti", alt = "bugün, bütün istasyonlar", modifier = Modifier.belirerek(acilis, 0), onClick = ozetAc) }
        when (durum) {
            is Yukleme.Bekliyor -> items(2) { IskeletSatiri() }
            is Yukleme.Hata -> {}
            is Yukleme.Geldi -> {
                val istasyonlar = durum.veri.istasyonlar
                val duran = istasyonlar.count { IstasyonDurumu.coz(it.durum).let { d -> d == IstasyonDurumu.ARIZA || d == IstasyonDurumu.DURDU } }
                item {
                    Satir(
                        renk = if (okunmamis > 0) Renkler.uyari else Renkler.bos,
                        baslik = "Uyarılar",
                        alt = if (okunmamis > 0) "okunmamış" else "yeni uyarı yok",
                        rozet = okunmamis.takeIf { it > 0 }?.toString(),
                        modifier = Modifier.belirerek(acilis, 1),
                        onClick = uyarilariAc,
                    )
                }
                item {
                    Satir(
                        renk = if (duran > 0) Renkler.hata else Renkler.vurgu,
                        baslik = "İstasyonlarım",
                        alt = if (duran > 0) "$duran istasyon durdu" else "hepsi çalışıyor ya da sırada",
                        rozet = istasyonlar.size.toString(),
                        modifier = Modifier.belirerek(acilis, 2),
                        onClick = istasyonlariAc,
                    )
                }
                item { Satir(renk = Renkler.vurgu, baslik = "Tezgâhlar 3B", alt = "parça görünümü, taçla geç", modifier = Modifier.belirerek(acilis, 3), onClick = vitrinAc) }
            }
        }
        nfcAc?.let { ac -> item { Satir(renk = Renkler.vurgu, baslik = "İstasyona giriş", alt = "NFC etiketiyle", onClick = ac) } }
        item { Satir(renk = Renkler.vurgu, baslik = "Vardiya devri", alt = "duruş ve açık işler", modifier = Modifier.belirerek(acilis, 4), onClick = vardiyaAc) }
        item { Satir(renk = Renkler.vurgu, baslik = "Saat ayarları", alt = "eldiven, uyarı, sunucu adresi", modifier = Modifier.belirerek(acilis, 5), onClick = ayarlariAc) }
    }
}
