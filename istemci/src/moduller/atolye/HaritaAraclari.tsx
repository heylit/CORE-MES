import { useState } from 'react';
import { Dugme } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Sahnenin üstündeki araç sütunu: görünüm, liste, düzen ve ekran; seyrek araçlar "Diğer" menüsünde adıyla. Sütundaki
// düğmeler yalnız simgedir; ad ipucunda ve ekran okuyucuda. Seçili durum vurgulanır. Sütun sahnenin sağ kenarında; sığmazsa ikinci sütuna kayar.

export type HaritaAraci = 'genel' | 'kus' | 'yuru' | 'izgara' | 'etiket' | 'parca' | 'depo' | 'rota' | 'duzenle' | 'tur' | 'liste' | 'hafif' | 'tam';

interface Ozellikler {
  gorunum: 'genel' | 'kus' | null;
  yuruyus: boolean;
  // Yürüyüş yalnız tek bölüm görünümünde (fabrikada bölümler arası yol yok).
  // Fabrika görünümünde düzenleyici bütün bölümleri açar.
  fabrika: boolean;
  izgara: boolean;
  etiketler: boolean;
  parcaVar: boolean;
  parcaGoster: boolean;
  rotaVar: boolean;
  yazabilir: boolean;
  tamEkran: boolean;
  tur: boolean;
  listeAcik: boolean;
  hafif: boolean;
  sec: (a: HaritaAraci) => void;
}

interface Arac {
  a: HaritaAraci;
  ad: string;
  // Aç/kapa düğmesinin ekran okuyucu adı durumla değişmez; durum aria-pressed'dedir. İpucu (ad) yapılacak işi söyler.
  durumAdi?: string;
  simge: SimgeAdi;
  basili?: boolean;
}

export function HaritaAraclari(o: Ozellikler) {
  // Sık kullanılanlar sütunda; seyrek olanlar "Diğer" altında adıyla (dokunmatik ekranda ipucu yoktur).
  const [digerAcik, digerAcikYaz] = useState(false);
  const gruplar: Arac[][] = [
    [
      { a: 'genel', ad: o.fabrika ? 'Tüm fabrika' : 'Tüm bölüm', simge: 'cube', basili: o.gorunum === 'genel' },
      { a: 'kus', ad: 'Kuşbakışı', simge: 'eye', basili: o.gorunum === 'kus' },
      { a: 'yuru' as const, ad: 'Yürüyerek gez', simge: 'user' as const, basili: o.yuruyus },
    ],
    [
      // Liste haritanın üstünde açılır (2142-1 a); tam ekranda da aynı düğme.
      { a: 'liste' as const, ad: o.listeAcik ? 'Makine listesini gizle' : 'Makine listesini göster', durumAdi: 'Makine listesi', simge: 'list' as const, basili: o.listeAcik },
      ...(o.rotaVar ? [{ a: 'rota' as const, ad: 'Yolu kaldır', simge: 'x' as const }] : []),
    ],
    [
      ...(o.yazabilir ? [{ a: 'duzenle' as const, ad: o.fabrika ? 'Fabrika planını düzenle (bütün bölümler)' : 'Bölümün yerleşimini düzenle', simge: 'edit' as const }] : []),
      ...(o.tamEkran ? [
        { a: 'tur' as const, ad: o.tur ? 'Otomatik turu durdur' : 'Otomatik tur (sorunlu istasyon önce)', durumAdi: 'Otomatik tur', simge: (o.tur ? 'pause' : 'play') as SimgeAdi, basili: o.tur },
      ] : []),
      { a: 'tam', ad: o.tamEkran ? 'Tam ekrandan çık' : 'Tam ekran (atölye ekranı)', durumAdi: 'Tam ekran', simge: o.tamEkran ? 'x' : 'expand', basili: o.tamEkran },
    ],
  ];
  const diger: (Arac & { kisa: string })[] = [
    { a: 'izgara', ad: 'Hücre ızgarası', kisa: 'Hücre ızgarası', simge: 'grid', basili: o.izgara },
    { a: 'etiket', ad: o.etiketler ? 'Yazıları gizle (seçili ve bölüm adı kalır)' : 'Yazıları göster', durumAdi: 'Yazılar', kisa: 'Yazılar', simge: 'scan', basili: o.etiketler },
    // Düğme hep görünür: makinelerde 3B modeli olan iş yokken basılınca neden boş olduğu söylenir.
    { a: 'parca', ad: o.parcaVar ? 'İşlenen parçalar' : 'İşlenen parçalar (şu an 3B modeli olan iş yok)', kisa: 'İşlenen parçalar', simge: 'layers', basili: o.parcaGoster },
    { a: 'depo', ad: 'Depoya git', kisa: 'Depoya git', simge: 'box' },
    { a: 'hafif', ad: o.hafif ? 'Tam görünüm (gölge, yansıma ve makine hareketi)' : 'Hafif görünüm (zayıf cihaz ve atölye ekranı için: gölgesiz, hareketsiz)', durumAdi: 'Hafif görünüm', kisa: 'Hafif görünüm', simge: 'gauge', basili: o.hafif },
  ];
  const digerBasili = diger.some((d) => d.a !== 'etiket' && d.basili === true);
  return (
    <div className="tc-atolye-arac" role="toolbar" aria-label="Görünüm" aria-orientation="vertical" onKeyDown={(e) => { if (e.key === 'Escape' && digerAcik) { e.stopPropagation(); digerAcikYaz(false); } }}>
      {gruplar.filter((g) => g.length > 0).map((g) => (
        <div key={g[0]?.a} className="tc-atolye-arac-grup">
          {g.map((d) => (
            <Dugme
              key={d.a}
              simge={d.simge}
              aria-label={d.durumAdi ?? d.ad}
              title={d.ad}
              aria-pressed={d.basili === undefined ? undefined : d.basili}
              data-arac={d.a}
              onClick={() => o.sec(d.a)}
            />
          ))}
        </div>
      ))}
      <div className="tc-atolye-arac-grup tc-atolye-arac-diger">
        <Dugme
          simge="more"
          aria-label="Diğer araçlar"
          title="Diğer araçlar: ızgara, yazılar, parçalar, depo, hafif görünüm"
          aria-expanded={digerAcik}
          data-isaret={digerBasili || undefined}
          onClick={() => digerAcikYaz((v) => !v)}
        />
        {digerAcik && (
          <div className="tc-atolye-arac-menu" role="group" aria-label="Diğer araçlar">
            {diger.map((d) => (
              <Dugme
                key={d.a}
                simge={d.simge}
                aria-label={d.durumAdi ?? d.ad}
                title={d.ad}
                aria-pressed={d.basili === undefined ? undefined : d.basili}
                data-arac={d.a}
                onClick={() => { o.sec(d.a); if (d.basili === undefined) digerAcikYaz(false); }}
              >{d.kisa}</Dugme>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
