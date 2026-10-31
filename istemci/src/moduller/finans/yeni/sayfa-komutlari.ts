import type { SayfaKomutu } from '../../../ortak/rota/sayfa-komutlari.ts';
import type { AkisDegerleri, OlayTuru } from './akislar.ts';
import { OLAY_GRUPLARI } from './akislar.ts';
import { AYAR_SEKMELERI } from './ayarlar/index.tsx';
import type { HazirVeri } from './donustur.ts';
import { yeniYol, type SekmeAnahtari, type YeniSekme } from './sekmeler.ts';
import type { FinansYetkisi } from './veri.ts';

// Ctrl K'nın "Bu sayfa" grubu (prototipte paletteItems; eski çerçeve ortak palete "Kayıt" ve "Komut" gruplarını veriyordu, 102 a).
// Komut yetki vermez: her komut ekrandaki düğmesinin koşuluyla listelenir, yazma yine uçtadır. Sıra: boş sorguda ilk 12 görünür,
// önce kayıt olayları gelir (prototipteki gibi).

export interface KomutOrtami {
  yetki: FinansYetkisi;
  // Kişinin görebildiği sekmeler (menü işlemine göre süzülmüş).
  gorunen: readonly YeniSekme[];
  secili: SekmeAnahtari;
  // Rakam yetkisi yoksa ya da veri gelmediyse null: kayıt ve cari komutları çıkmaz.
  V: HazirVeri | null;
  kayitSayisi: number;
  git: (adres: string) => void;
  kayitGir: (tur?: OlayTuru, ilk?: Partial<AkisDegerleri>) => void;
  excel: () => void;
  yazdir: () => void;
}

// Rapor bölümlerinin hepsinde "Yazdır / PDF" düğmesi vardır (RaporAraclari); öteki bölümlerde yoktur.
const YAZDIRILAN: ReadonlySet<SekmeAnahtari> = new Set<SekmeAnahtari>(['durum', 'gelir-tablosu', 'karar-araclari', 'ay-sonu', 'tahminler']);

const TUR_ADI = { musteri: 'Müşteri hesabı', tedarikci: 'Tedarikçi hesabı', ikisi: 'Müşteri ve tedarikçi hesabı' } as const;

export function finansKomutlari(o: KomutOrtami): SayfaKomutu[] {
  const { yetki, gorunen, V } = o;
  const gorur = (a: SekmeAnahtari) => gorunen.some((s) => s.anahtar === a);
  const komutlar: SayfaKomutu[] = [];

  if (V && yetki.yaz) {
    for (const g of OLAY_GRUPLARI) {
      for (const olay of g.olaylar) {
        komutlar.push({
          anahtar: `kayit-${olay.tur}`, baslik: `Kayıt gir: ${olay.baslik}`, simge: olay.simge, aciklama: olay.aciklama,
          sozcukler: ['kayıt', 'yeni', g.baslik], calistir: () => { o.kayitGir(olay.tur); },
        });
      }
    }
  }

  for (const s of gorunen) {
    if (s.anahtar === o.secili) continue;
    komutlar.push({
      anahtar: `git-${s.anahtar}`, baslik: s.baslik, simge: s.simge, aciklama: s.grup ? `Finans · ${s.grup}` : 'Finans',
      sozcukler: ['git', 'aç', 'bölüm', s.grup ?? ''].filter(Boolean), calistir: () => { o.git(s.yol); },
    });
  }
  if (gorur('ayarlar')) {
    for (const a of AYAR_SEKMELERI) {
      komutlar.push({
        anahtar: `ayar-${a.anahtar}`, baslik: `Ayarlar: ${a.baslik}`, simge: a.simge ?? 'gear', aciklama: 'Finans ayarları',
        sozcukler: ['ayar', 'git'], calistir: () => { o.git(`${yeniYol('ayarlar')}?sekme=${a.anahtar}`); },
      });
    }
  }

  if (V && o.kayitSayisi > 0) {
    komutlar.push({
      anahtar: 'excel', baslik: "Kayıtları Excel'e aktar", simge: 'download', aciklama: 'Bütün kayıtlar, CSV',
      sozcukler: ['excel', 'csv', 'indir', 'dışa aktar'], calistir: o.excel,
    });
  }
  if (YAZDIRILAN.has(o.secili)) {
    komutlar.push({
      anahtar: 'yazdir', baslik: 'Raporu yazdır / PDF', simge: 'printer', aciklama: 'Açık rapor',
      sozcukler: ['yazdır', 'pdf', 'çıktı'], calistir: o.yazdir,
    });
  }

  // Cari: firma kartı (firma yetkisiyle) ve firmanın tarafına göre hızlı tahsilat ya da ödeme (yazma yetkisiyle). Pasif firmaya
  // yeni kayıt açılmaz (uç da reddeder); kartı yine açılır.
  if (V) {
    const firmalar = [...V.firmalar].sort((a, b) => (V.etiket.get(a.id) ?? '').localeCompare(V.etiket.get(b.id) ?? '', 'tr'));
    for (const f of firmalar) {
      const ad = V.etiket.get(f.id) ?? f.ad;
      const sozcukler = ['cari', 'firma', f.kod ?? ''].filter(Boolean);
      if (gorur('firmalar')) {
        komutlar.push({
          anahtar: `cari-${f.id}`, baslik: ad, simge: 'user', aciklama: TUR_ADI[f.tur], sozcukler,
          calistir: () => { o.git(`${yeniYol('firmalar')}?firma=${f.id}`); },
        });
      }
      if (!yetki.yaz || !f.aktif) continue;
      if (f.tur !== 'tedarikci') {
        komutlar.push({
          anahtar: `cari-${f.id}-tahsilat`, baslik: `${ad}: tahsilat gir`, simge: 'download', aciklama: 'Hızlı işlem', sozcukler,
          calistir: () => { o.kayitGir('tahsilat', { party: ad }); },
        });
      }
      if (f.tur !== 'musteri') {
        komutlar.push({
          anahtar: `cari-${f.id}-odeme`, baslik: `${ad}: ödeme gir`, simge: 'upload', aciklama: 'Hızlı işlem', sozcukler,
          calistir: () => { o.kayitGir('odeme', { party: ad }); },
        });
      }
    }
  }
  return komutlar;
}
