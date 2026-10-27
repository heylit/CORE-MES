import type { ReceteRotaDurumCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { VERI_SAGLIGI_ORNEK, type VeriSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';

// Plana giden verinin kaynağında boş olan yerleri sayar (782). Etki metni motorun o boşlukta bugün ne yaptığıdır; kaynak satırı
// motor dosyasındadır, metin değişirse motorun davranışı da değişmiş demektir.

type Kategori = VeriSagligiCevabi['kategoriler'][number];
type Ornek = Kategori['ornekler'][number];

export interface VeriSagligiGirdisi {
  durum: ReceteRotaDurumCevabi;
  // İstasyonun plan ayarı satırı (verim, operatör ihtiyacı) olanlar; durum bunu ayırt etmez, satırı yoksa %100 ve 1 yazar.
  planAyarliIstasyonlar: ReadonlySet<string>;
  // Haftalık vardiya matrisinde en az bir satırı olan iş merkezleri.
  vardiyaliMerkezler: ReadonlySet<string>;
  // Planlama çalışmasındaki tezgâhlar; çalışma yoksa null.
  tezgahlar: readonly { id: string; ad: string; ucret: number | null; ucretIst: number | null | undefined }[] | null;
}

const PLANA_GIREN_EMIR: ReadonlySet<string> = new Set(['serbest', 'uretimde']);

function kategori(anahtar: Kategori['anahtar'], baslik: string, etki: string, eksikler: Ornek[] | null, toplam: number | null): Kategori {
  return { anahtar, baslik, etki, sayi: eksikler === null ? null : eksikler.length, toplam, ornekler: (eksikler ?? []).slice(0, VERI_SAGLIGI_ORNEK) };
}

export function veriSagligi(g: VeriSagligiGirdisi): VeriSagligiCevabi {
  const d = g.durum;
  const items = d.items ?? [];
  const kart = new Map(items.map((x) => [x.id, x]));
  const kod = (id: string) => kart.get(id)?.code ?? id;
  const rotalar = d.routes === null ? null : Object.entries(d.routes);

  // Yürürlükteki rotalarda girdi olarak geçen ham malzeme.
  let stok: Ornek[] | null = null;
  let stokToplam: number | null = null;
  if (d.items !== null && rotalar !== null) {
    const kullanilan = new Set(rotalar.flatMap(([, r]) => r.steps.flatMap((s) => s.ins.map((x) => x.itemId))));
    const ham = items.filter((x) => x.type === 'ham' && x.aktif && kullanilan.has(x.id));
    stokToplam = ham.length;
    stok = ham.filter((x) => x.stock === null).map((x) => ({ kod: x.code, ad: x.name }));
  }

  let sure: Ornek[] | null = null;
  let sureToplam: number | null = null;
  if (rotalar !== null) {
    sure = [];
    sureToplam = 0;
    for (const [urun, r] of rotalar) {
      for (const s of r.steps) {
        if (s.fasonId !== null) continue;
        sureToplam += 1;
        const islemYok = s.cycle === null && s.proc === null;
        const alternatifYok = Object.entries(s.altTimes).filter(([, t]) => t.cycle === null).map(([id]) => id);
        if (islemYok || s.setup === null || alternatifYok.length > 0) {
          const neden = [islemYok ? 'işlem süresi' : null, s.setup === null ? 'hazırlık süresi' : null,
            alternatifYok.length > 0 ? `alternatif istasyon süresi (${String(alternatifYok.length)})` : null].filter((x) => x !== null).join(', ');
          sure.push({ kod: `${kod(urun)} OP ${String(s.opNo)}`, ad: `${s.name}: ${neden} boş` });
        }
      }
    }
  }

  const istasyonlar = d.stations === null ? null : d.stations.filter((x) => x.aktif);
  const ayarsiz = istasyonlar === null ? null
    : istasyonlar.filter((x) => !g.planAyarliIstasyonlar.has(x.id)).map((x) => ({ kod: x.code, ad: x.name }));
  const vardiyasiz = istasyonlar === null ? null
    : istasyonlar.filter((x) => !g.vardiyaliMerkezler.has(x.wcId)).map((x) => ({ kod: x.code, ad: x.name }));

  const m = d.maliyet;
  const maliyetsiz = istasyonlar === null || m === null ? null
    : istasyonlar.filter((x) => m.istasyon[x.id] === undefined).map((x) => ({ kod: x.code, ad: x.name }));
  let doviz: Ornek[] | null = null;
  if (m !== null) {
    const ad = (tur: string, id: string) => (tur === 'malzeme' ? kart.get(id)?.name : tur === 'istasyon' ? d.stations?.find((x) => x.id === id)?.name
      : d.people?.find((x) => x.id === id)?.name) ?? id;
    doviz = (['malzeme', 'istasyon', 'kisi'] as const).flatMap((tur) => Object.entries(m[tur])
      .filter(([, v]) => v.paraBirimi !== 'TRY').map(([id, v]) => ({ kod: `${tur} ${tur === 'malzeme' ? kod(id) : id}`, ad: `${ad(tur, id)} (${v.paraBirimi})` })));
  }

  const emirler = d.emirler === null || d.emirler === undefined ? null : d.emirler.orders.filter((x) => PLANA_GIREN_EMIR.has(x.status));
  const terminsiz = emirler === null ? null : emirler.filter((x) => x.due === null).map((x) => ({ kod: x.no, ad: kod(x.itemId) }));

  const makineler = d.machines === null ? null : d.machines.filter((x) => x.aktif);
  const arizali = makineler === null ? null
    : makineler.filter((x) => x.status !== 'aktif').map((x) => ({ kod: x.code, ad: `${x.name} (${x.status === 'ariza' ? 'arıza' : 'bakım'})` }));

  const elle = g.tezgahlar === null ? null
    : g.tezgahlar.filter((t) => t.ucretIst !== undefined && t.ucret !== t.ucretIst).map((t) => ({ kod: t.id, ad: t.ad }));

  return {
    calismaVar: g.tezgahlar !== null,
    malzemeKesildi: d.malzemeKesildi,
    kategoriler: [
      kategori('stok-bos', 'Stoku bilinmeyen malzeme',
        'Planda 0 sayılır; eksik miktar için siparişi verilmemiş satın alma satırı açılır, satın almada termini yoksa malzeme elde sayılır.', stok, stokToplam),
      kategori('sure-bos', 'Süresi boş rota adımı', 'Boş süre planda 0 sayılır; adım hiç zaman almadan biter.', sure, sureToplam),
      kategori('istasyon-plan-ayari-yok', 'Plan ayarı olmayan istasyon', 'Verim %100 ve operatör ihtiyacı 1 varsayılır.', ayarsiz, istasyonlar?.length ?? null),
      kategori('vardiyasiz-istasyon', 'Haftalık vardiyası olmayan istasyon',
        'İş merkezinin haftalık vardiyası yoksa tezgâh atölyenin bütün vardiyalarında çalışır sayılır.', vardiyasiz, istasyonlar?.length ?? null),
      kategori('istasyon-maliyet-yok', 'Saat maliyeti olmayan istasyon',
        'Tezgâh ücreti boş kalır; makine seçiminde maliyet 0 sayılır ve tezgâh en ucuz görünür.', maliyetsiz, istasyonlar?.length ?? null),
      kategori('maliyet-doviz', 'TL dışı birim maliyet', 'Yalnız TL maliyet okunur; döviz maliyet bilinmiyor sayılır.', doviz, null),
      kategori('terminsiz-emir', 'Teslimi olmayan emir', 'Gecikmesi hesaplanmaz; sıralamada en sona itilir.', terminsiz, emirler?.length ?? null),
      kategori('arizali-makine', 'Arızada ya da bakımda makine',
        'Bitişi girilmemiş duruş 8 saat sürer sayılır; makine sonra çalışır kabul edilir.', arizali, makineler?.length ?? null),
      kategori('elle-tezgah-ucreti', 'Planda elle değiştirilmiş tezgâh ücreti',
        'Ana veri değişmedikçe planlama çalışmasındaki elle ücret kullanılır; istasyon maliyetinden farklıdır.', elle, g.tezgahlar?.length ?? null),
    ],
  };
}
