package tmi.saat.ekran

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import tmi.saat.Pano
import tmi.saat.Renkler
import tmi.saat.cekirdek.Adet
import tmi.saat.cekirdek.DurumSuresi
import tmi.saat.cekirdek.IstasyonDurumu
import tmi.saat.cekirdek.VardiyaOzeti
import tmi.saat.cekirdek.YoneticiOzeti

// Yonetici ozeti: kapsamdaki istasyonlarin bugunku durumu tek ekranda. Yalniz okur; istasyon iş merkezi atanmis kiside
// yalniz o merkezlerden gelir (sunucu suzer). OEE sunucuda yok, gosterilmez.
@Composable
fun OzetEkrani(durum: Yukleme<Pano>, geri: () -> Unit, uyarilariAc: () -> Unit, istasyonAc: (Int) -> Unit) {
    val simdi = simdiDurumu()
    when (durum) {
        is Yukleme.Bekliyor -> ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            item { UstSatir("Yönetici özeti", geri) }
            items(3) { IskeletSatiri() }
        }
        is Yukleme.Hata -> Ileti(durum.ileti)
        is Yukleme.Geldi -> {
            val istasyonlar = durum.veri.istasyonlar
            val sayilar = YoneticiOzeti.durumSayilari(istasyonlar.map { it.durum })
            val calisan = sayilar[IstasyonDurumu.CALISIYOR] ?: 0
            val durusTurleri = setOf(IstasyonDurumu.ARIZA, IstasyonDurumu.DURDU, IstasyonDurumu.BAKIM)
            val duranlar = istasyonlar.filter { IstasyonDurumu.coz(it.durum) in durusTurleri }
            val sira = YoneticiOzeti.duranSirasi(duranlar.map { it.id to it.durumBaslangic })
            val siraliDuranlar = sira.mapNotNull { id -> duranlar.firstOrNull { it.id == id } }
            val toplamDurus = VardiyaOzeti.toplamDurus(istasyonlar.map { it.durusSaniye })
            val bekleyen = durum.veri.uyarilar.count { it.tur == "kalite" || it.tur == "malzeme" || it.tur == "kalibrasyon" }
            ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                item { UstSatir("Yönetici özeti", geri) }
                item { BayatSatiri(durum) }
                item {
                    Satir(
                        renk = if (calisan > 0) Renkler.tamam else Renkler.bos,
                        baslik = "$calisan / ${istasyonlar.size} çalışıyor",
                        alt = listOfNotNull(
                            sayilar[IstasyonDurumu.ARIZA]?.let { "arıza $it" },
                            sayilar[IstasyonDurumu.DURDU]?.let { "duruş $it" },
                            sayilar[IstasyonDurumu.BAKIM]?.let { "bakım $it" },
                        ).joinToString(" · ").ifEmpty { "duran istasyon yok" },
                        onClick = {},
                    )
                }
                item { UretilenSatiri(VardiyaOzeti.toplamUretim(istasyonlar.map { it.bugun })) }
                item {
                    Satir(
                        renk = Renkler.uyari,
                        baslik = "Toplam duruş",
                        alt = "bugün, gün başından beri",
                        sag = DurumSuresi.metin(toplamDurus?.toLong()) ?: "veri yok",
                        onClick = {},
                    )
                }
                item {
                    Satir(
                        renk = if (bekleyen > 0) Renkler.uyari else Renkler.bos,
                        baslik = "Bekleyen uyarı",
                        alt = "kalite, malzeme, kalibrasyon",
                        rozet = bekleyen.takeIf { it > 0 }?.toString(),
                        onClick = uyarilariAc,
                    )
                }
                items(siraliDuranlar, key = { it.id }) { i ->
                    val d = IstasyonDurumu.coz(i.durum)
                    val renk = if (d == IstasyonDurumu.BAKIM) Renkler.uyari else Renkler.hata
                    Satir(
                        renk = renk,
                        baslik = i.ad,
                        alt = d?.etiket,
                        sagIcerik = { Akan(simdi) { an -> GecenSure(i.durumBaslangic, an, renk) } },
                        onClick = { istasyonAc(i.id) },
                    )
                }
            }
        }
    }
}

@Composable
fun UretilenSatiri(uretilen: Adet?) {
    Satir(
        renk = if (uretilen == null) Renkler.bos else Renkler.tamam,
        baslik = "Üretilen",
        alt = uretilen?.let { "bugün · fire ${it.hurda}" } ?: "bugün sayım girilmedi",
        sag = uretilen?.saglam?.toString() ?: "veri yok",
        onClick = {},
    )
}
