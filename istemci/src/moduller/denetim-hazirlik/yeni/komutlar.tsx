import { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaletSorgusuBaglami, useSayfaKomutlari, type SayfaKomutu } from '../../../ortak/rota/sayfa-komutlari.ts';
import { useDenetim } from './baglam.tsx';
import { indir } from './disa-aktar.ts';
import { prototipSimgesi } from './gorunumler.ts';
import { PROGRAMLAR, PROGRAM_SIRASI } from './icerik/programlar.ts';
import { cihazDurumu } from './kurallar/kalibrasyon.ts';
import { SAHA_SABLONLARI, sahaBaslat } from './kurallar/ic-denetim.ts';
import { ozTurBaslat } from './kurallar/oz.ts';
import { yedekDosyaAdi, yedekVerisi } from './kurallar/profil.ts';
import { aktifSorular, kuralBaglami } from './kurallar/puan.ts';
import { turAdi } from './kys/dokuman-metni.ts';
import { DOCT } from './kys/dokuman-sablonlari.ts';
import { useOrnegeGec } from './ornek-firma.tsx';
import { useHizliTur, useSoruyaGit } from './program/paylasilan.tsx';
import type { GorunumKodu, KysSekmesi } from './tipler.ts';
import { OLCU_ALETI_YOLU } from './veri.ts';
import { TERIMLER } from './yardim/icerik.ts';
import { useYardim } from './yardim/index.tsx';

// Ctrl K katkısı (prototip palItems; eski çerçevede köprü taşıyordu). Komutlar paletin "Bu sayfa" grubunda durur; yazılan metne
// sayfalar, sorular, cihazlar, dokümanlar ve terimler öneri olarak gelir (en çok 8, veri aramaları en az 2 harfle). Kişi yalnız
// yapabileceğini görür: kayda yazan komut yazma yetkisi, örnek firma yönetici ister; yazma yine sunucuda denetlenir.

export const KAYNAK = 'denetim-hazirlik';
export const ONERI_SINIRI = 8;

// grup: prototip palet grubu; veri: en az 2 harfle aranır (prototip Q.length>=2).
export interface PaletOgesi { anahtar: string; grup: string; baslik: string; alt: string; simge: string; sozcuk?: string; veri?: true; calistir: () => void }

const kucuk = (s: string): string => s.toLocaleLowerCase('tr');

// Prototip add(): sorgu başlık, alt metin ve ek sözcükte geçmeli.
export function paletOnerileri(ogeler: readonly PaletOgesi[], sorgu: string): PaletOgesi[] {
  const q = kucuk(sorgu).trim();
  if (q === '') return [];
  return ogeler
    .filter((o) => (!o.veri || q.length >= 2) && kucuk(`${o.baslik} ${o.alt} ${o.sozcuk ?? ''}`).includes(q))
    .slice(0, ONERI_SINIRI);
}

const PROGRAM_GORUNUMLERI: readonly [GorunumKodu, string, string][] = [
  ['sim', 'Simülasyon', 'Soruları puanla'], ['kontrol', 'Öz değerlendirme', 'Periyodik kısa tur'], ['hazirlik', 'Haftalık program', 'Hazırlık görevleri'],
  ['sorular', 'Mülakat kartları', 'Çalışan provası'], ['rapor', 'Aksiyonlar ve rapor', 'Açıklar ve aksiyon planı'],
  ['rehber', 'Denetim rehberi', 'Maddeler, bulgu türleri, örnekler'],
];
const FIRMA_GORUNUMLERI: readonly [GorunumKodu, string, string, string][] = [
  ['kys', 'Kalite yönetim sistemi', 'Yapı taşları, dokümanlar, süreçler, şemalar', 'layers'], ['icd', 'İç denetim', 'Yıllık plan, kontrol listeleri, saha turları', 'clip'],
  ['kalib', 'Kalibrasyon', 'Cihazlar ve kalibrasyon geri sayımı', 'ruler'], ['takvim', 'Takvim', 'Tüm denetimler ve son günler', 'cal'],
  ['perf', 'Performans', 'Tüm değerlendirmeler tek grafikte', 'chart'], ['profil', 'Ayarlar ve veriler', 'Firma, yedek, sıfırlama', 'user'],
];
const KYS_SAYFALARI: readonly [KysSekmesi, string][] = [
  ['blok', 'KYS · Yapı taşları'], ['yol', 'KYS · Kurulum yol haritası'], ['uret', 'KYS · Doküman üretici'], ['dosya', 'KYS · Dosyalama'],
  ['sema', 'KYS · Şemalar ve grafikler'], ['gorev', 'KYS · Görev tanımları'], ['rutin', 'KYS · Rutin görevler'], ['surec', 'KYS · Süreçler'],
];

// Paletin o anki metni; palet kapalıyken boş.
function usePaletMetni(): string {
  const kaynak = useContext(PaletSorgusuBaglami);
  const [metin, metinYaz] = useState(() => kaynak?.deger() ?? '');
  useEffect(() => {
    if (kaynak === null) return undefined;
    metinYaz(kaynak.deger() ?? '');
    return kaynak.dinle((s) => { metinYaz(s ?? ''); });
  }, [kaynak]);
  return metin;
}

const komut = (o: PaletOgesi, oneri: boolean): SayfaKomutu => ({
  ...(oneri ? { oneri: true as const } : {}),
  anahtar: o.anahtar, baslik: o.baslik, simge: prototipSimgesi(o.simge), aciklama: o.alt || null, sozcukler: o.sozcuk ? [o.sozcuk] : [], calistir: o.calistir,
});

export function DenetimKomutlari() {
  const d = useDenetim();
  const gezin = useNavigate();
  const yardim = useYardim();
  const hizliTur = useHizliTur();
  const soruyaGit = useSoruyaGit();
  const ornegeGec = useOrnegeGec();
  const metin = usePaletMetni();
  const yaz = d.yetki.yazabilir;
  const { pg, program } = d;

  const komutlar = useMemo<PaletOgesi[]>(() => {
    const k: PaletOgesi[] = [];
    const ekle = (o: Omit<PaletOgesi, 'grup'>) => { k.push({ ...o, grup: 'Komutlar' }); };
    if (yaz) {
      ekle({ anahtar: 'hizli-tur', baslik: 'Hızlı tur başlat', alt: `10 soruluk ölçüm · ${pg.s}`, simge: 'zap', calistir: hizliTur });
      ekle({ anahtar: 'yeni-denetim', baslik: 'Yeni denetim ekle', alt: 'Takvime denetim tarihi', simge: 'cal', calistir: () => { d.git('takvim', { yeniDenetim: true }); } });
    }
    ekle({ anahtar: 'yeni-cihaz', baslik: 'Yeni cihaz ekle', alt: 'Kalibrasyon listesine', simge: 'ruler', calistir: () => { void gezin(OLCU_ALETI_YOLU); } });
    if (yaz) {
      ekle({
        anahtar: 'oz-turu', baslik: 'Öz değerlendirme turu başlat', alt: pg.s, simge: 'repeat', calistir: () => {
          if (!d.calisma.oz.cur) d.degistir(null, (t) => { ozTurBaslat(kuralBaglami(t, program), 'rot'); });
          d.git('kontrol');
        },
      });
      ekle({
        anahtar: 'ic-denetim', baslik: 'İç denetim başlat', alt: 'Plandaki ya da seçtiğiniz süreç için', simge: 'clip', calistir: () => {
          if (d.profil.ic.cur) d.degistir(null, (t) => { t.ic.cur = ''; });
          d.ekranDegistir((e) => { e.ic.tab = 'yurut'; });
          d.git('icd');
        },
      });
      for (const t0 of SAHA_SABLONLARI) {
        ekle({
          anahtar: `saha-${t0.id}`, baslik: `Saha turu: ${t0.n}`, alt: `${t0.c} · ${String(t0.items.length)} madde`, simge: 'calcheck', calistir: () => {
            d.degistir(null, (t) => { sahaBaslat(t, t0.id); });
            d.ekranDegistir((e) => { e.ic.tab = 'saha'; });
            d.git('icd');
          },
        });
      }
    }
    ekle({
      anahtar: 'yedek', baslik: 'Tüm verileri yedekle', alt: 'JSON dosyası indir', simge: 'download', calistir: () => {
        const ids = d.depo.order.slice();
        try {
          const ad = yedekDosyaAdi(d.depo, ids);
          indir(ad, JSON.stringify(yedekVerisi(d.depo, ids), null, 1), 'application/json');
          if (yaz) d.depoDegistir(null, (t) => { t.lastBackup = Date.now(); });
          d.bildir(`Yedek indirildi: ${ad}`, { ton: 'bilgi' });
        } catch {
          d.bildir('Yedek dosyası oluşturulamadı', { ton: 'hata' });
        }
      },
    });
    if (ornegeGec) ekle({ anahtar: 'ornek-firma', baslik: 'Örnek firmayı aç', alt: 'Dolu verilerle gez', simge: 'layers', calistir: ornegeGec });
    ekle({ anahtar: 'yardim', baslik: 'Yardım', alt: 'Bu sayfa nasıl kullanılır', simge: 'info', calistir: () => { yardim.ac('sayfa'); } });
    return k;
  }, [d, yaz, pg, program, gezin, hizliTur, ornegeGec, yardim]);

  // Öneriler yalnız palete yazılırken kurulur; komutlar sabit listede olduğundan önerilerde tekrar edilmez.
  const oneriler = useMemo<PaletOgesi[]>(() => {
    if (metin.trim() === '') return [];
    const o: PaletOgesi[] = [];
    o.push({ anahtar: 'sayfa-home', grup: 'Sayfalar', baslik: 'Bugün', alt: 'Tüm işler tek listede', simge: 'home', calistir: () => { d.git('home'); } });
    for (const k of PROGRAM_SIRASI) {
      o.push({ anahtar: `program-${k}`, grup: 'Sayfalar', baslik: PROGRAMLAR[k].n, alt: 'Denetim programı', simge: 'award', sozcuk: PROGRAMLAR[k].s, calistir: () => { d.git('dash', { program: k }); } });
    }
    for (const [kod, ad, alt] of PROGRAM_GORUNUMLERI) {
      o.push({ anahtar: `sayfa-${kod}`, grup: 'Sayfalar', baslik: ad, alt: `${pg.s} · ${alt}`, simge: 'clip', calistir: () => { d.git(kod); } });
    }
    for (const [kod, ad, alt, simge] of FIRMA_GORUNUMLERI) {
      o.push({ anahtar: `sayfa-${kod}`, grup: 'Sayfalar', baslik: ad, alt, simge, calistir: () => { d.git(kod); } });
    }
    for (const [sekme, ad] of KYS_SAYFALARI) {
      o.push({ anahtar: `kys-${sekme}`, grup: 'Sayfalar', baslik: ad, alt: '', simge: 'layers', calistir: () => { d.git('kys', { kys: sekme }); } });
    }
    aktifSorular(pg, d.calisma.def).forEach((x) => {
      o.push({ anahtar: `soru-${x.id}`, grup: `Sorular · ${pg.s}`, baslik: x.q, alt: x.c, simge: 'clip', veri: true, calistir: () => { soruyaGit(x.id); } });
    });
    for (const c of d.cihazlar) {
      o.push({
        anahtar: `cihaz-${c.id}`, grup: 'Cihazlar', baslik: `${c.no} · ${c.ad}`, alt: [c.yer, c.sorumlu, cihazDurumu(c).t].filter(Boolean).join(' · '),
        simge: 'ruler', sozcuk: `${c.marka} ${c.seri}`, veri: true,
        calistir: () => { d.ekranDegistir((e) => { e.kal.q = c.no.slice(0, 80); }); d.git('kalib'); },
      });
    }
    for (const dt of DOCT) {
      o.push({ anahtar: `dokuman-${dt.id}`, grup: 'Dokümanlar', baslik: dt.name, alt: turAdi(dt.type), simge: 'file', veri: true, calistir: () => { d.git('kys', { kys: 'uret', dokuman: dt.id }); } });
    }
    for (const [ad, tanim] of TERIMLER) {
      o.push({ anahtar: `terim-${ad}`, grup: 'Terimler', baslik: ad, alt: tanim, simge: 'info', veri: true, calistir: () => { yardim.ac('terim', ad); } });
    }
    return paletOnerileri(o, metin);
  }, [metin, d, pg, soruyaGit, yardim]);

  useSayfaKomutlari(KAYNAK, useMemo(() => komutlar.map((o) => komut(o, false)), [komutlar]));
  useSayfaKomutlari(`${KAYNAK}#oneri`, useMemo(() => oneriler.map((o) => komut({ ...o, alt: o.grup === 'Sayfalar' ? o.alt : [o.grup, o.alt].filter(Boolean).join(' · ') }, true)), [oneriler]));
  return null;
}
