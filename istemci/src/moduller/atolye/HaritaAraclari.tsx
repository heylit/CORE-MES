import { Dugme } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Sahnenin üstündeki araç sütunu: görünüm, katmanlar, git, düzen ve ekran. Düğmeler yalnız simgedir; ad ipucunda ve
// ekran okuyucuda. Seçili durum vurgulanır. Sütun sahnenin sağ kenarında; sığmazsa ikinci sütuna kayar.

export type HaritaAraci = 'genel' | 'kus' | 'yuru' | 'izgara' | 'etiket' | 'parca' | 'depo' | 'rota' | 'duzenle' | 'tur' | 'liste' | 'tam';

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
  sec: (a: HaritaAraci) => void;
}

interface Arac {
  a: HaritaAraci;
  ad: string;
  simge: SimgeAdi;
  basili?: boolean;
}

export function HaritaAraclari(o: Ozellikler) {
  const gruplar: Arac[][] = [
    [
      { a: 'genel', ad: o.fabrika ? 'Tüm fabrika' : 'Tüm bölüm', simge: 'cube', basili: o.gorunum === 'genel' },
      { a: 'kus', ad: 'Kuşbakışı', simge: 'eye', basili: o.gorunum === 'kus' },
      { a: 'yuru' as const, ad: 'Yürüyerek gez', simge: 'user' as const, basili: o.yuruyus },
    ],
    [
      { a: 'izgara', ad: 'Hücre ızgarası', simge: 'grid', basili: o.izgara },
      { a: 'etiket', ad: o.etiketler ? 'Yazıları gizle (seçili ve bölüm adı kalır)' : 'Yazıları göster', simge: 'scan', basili: o.etiketler },
      // Düğme hep görünür: makinelerde 3B modeli olan iş yokken basılınca neden boş olduğu söylenir.
      { a: 'parca', ad: o.parcaVar ? 'İşlenen parçalar' : 'İşlenen parçalar (şu an 3B modeli olan iş yok)', simge: 'layers', basili: o.parcaGoster },
    ],
    [
      { a: 'depo', ad: 'Depoya git', simge: 'box' },
      ...(o.rotaVar ? [{ a: 'rota' as const, ad: 'Yolu kaldır', simge: 'x' as const }] : []),
    ],
    [
      ...(o.yazabilir ? [{ a: 'duzenle' as const, ad: o.fabrika ? 'Fabrika planını düzenle (bütün bölümler)' : 'Bölümün yerleşimini düzenle', simge: 'edit' as const }] : []),
      ...(o.tamEkran ? [
        { a: 'tur' as const, ad: o.tur ? 'Otomatik turu durdur' : 'Otomatik tur (sorunlu istasyon önce)', simge: (o.tur ? 'pause' : 'play') as SimgeAdi, basili: o.tur },
        { a: 'liste' as const, ad: o.listeAcik ? 'Makine listesini gizle' : 'Makine listesini göster', simge: 'list' as const, basili: o.listeAcik },
      ] : []),
      { a: 'tam', ad: o.tamEkran ? 'Tam ekrandan çık' : 'Tam ekran (atölye ekranı)', simge: o.tamEkran ? 'x' : 'expand', basili: o.tamEkran },
    ],
  ];
  return (
    <div className="tc-atolye-arac" role="toolbar" aria-label="Görünüm" aria-orientation="vertical">
      {gruplar.filter((g) => g.length > 0).map((g) => (
        <div key={g[0]?.a} className="tc-atolye-arac-grup">
          {g.map((d) => (
            <Dugme
              key={d.a}
              simge={d.simge}
              aria-label={d.ad}
              title={d.ad}
              aria-pressed={d.basili === undefined ? undefined : d.basili}
              data-arac={d.a}
              onClick={() => o.sec(d.a)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
