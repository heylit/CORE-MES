import type { Db } from '#cekirdek/db.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { KayitAramaIstegi } from '#paylasilan/kayit-aramasi.ts';
import { malzemeAra } from '../malzemeler/disari.ts';
import { revizyonKunyeleri, yururluktekiRevizyonIdleri } from '../rota/disari.ts';
import { rotaAramaSonuclari, type RotaAramaSonucu } from './kurallar.ts';
import { KAYNAK_OKUMA } from './servis.ts';

// Malzemeler aramasından gelen aday sayısı: rotası olmayan kalemler düştükten sonra sınır kadar sonuç kalsın diye geniş tutulur.
const ADAY_SAYISI = 50;

const yetkili = (k: KayitAramaIstegi['kullanici'], islemler: readonly Islem[]): boolean => islemler.some((i) => k.islemler.includes(i));

// Genel aramanın rota kaynağı (kart #1241, sözleşme #1233 paylasilan/kayit-aramasi.ts). Bu modülün aranacak metni yoktur: kalem kodu ve adı malzemelerin, rota revizyonu rota
// modülünündür; ikisi de kendi disari.ts'inden okunur, burada SQL yoktur. Sonuç kalemin varlığını ve rotasını gösterdiği için kişi
// Reçete ve Rota'da o iki dilimi okuyabilmelidir (KAYNAK_OKUMA); okuyamayana sonuç boştur. Taslak ve onaydaki rota aranmaz
// (rota modülünde toplu okuma yok; BASKA-MODUL-ISTEKLERI.md). Desenler kullanılmaz: eşleşme malzemelerin aramasındadır.
export async function rotaAra(db: Db, { q: metin, sinir, kullanici }: KayitAramaIstegi): Promise<RotaAramaSonucu[]> {
  if (!yetkili(kullanici, KAYNAK_OKUMA.malzeme) || !yetkili(kullanici, KAYNAK_OKUMA.rota)) return [];
  const { satirlar } = await malzemeAra(db, { metin, sayfa: 1, sayfaBoyu: ADAY_SAYISI });
  const yururlukte = await yururluktekiRevizyonIdleri(db, satirlar.map((s) => s.id));
  if (yururlukte.size === 0) return [];
  const { revizyonlar } = await revizyonKunyeleri(db, [...yururlukte.values()]);
  const harf = new Map(revizyonlar.map((r) => [r.malzemeId, r.harf]));
  return rotaAramaSonuclari(satirlar, harf, metin, sinir);
}
