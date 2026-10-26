import { Rozet, SayiKarti, Simge } from '../../../../../ortak/arayuz/index.ts';
import { MOTOR_NOTU, YOK_NOTU, degisken } from '../../motor/ortak.tsx';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  AMAC_SIRASI, DURUM_ROZETI, KATALOG, bedelEsigi, bedelOku, bolumAdi, durumSayilari, kisitBul, kisitDegistir, parametreDegeri, parametreOku, parametreYaz,
  type Kisit, type KisitBedeli, type Parametre, type VeriBolumu,
} from './kurallar.ts';
import { KucukDugme, Serit, VeriKarti, sayiYazi, type Sutun, VeriTablosu } from './ortak.tsx';

// Kısıtlar (d-kisitlar.betik sKisitlar): sayım kartları, kısıt bedeli, grup başına tablo (Kısıt, Model, Hesapta, Parametre, Bedel, Veri),
// amaç sırası ve çözücüler. Anahtar ve parametre plan yazma ister; eskiden veri.yaz isteyen plan ayarları (D.ayarlar) da plan yazmadır
// (223 a: veri.yaz kalkar). Bedel hesabı motor ister (357 b); kayıttaki bedel aynı veri sürümündeyse gösterilir.

const saat = (h: number) => `${sayiYazi(h, 1)} sa`;
const zamanYaz = (ms: number | null) => (ms === null ? '' : new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));

export function ParametreGirdisi({ p, c, yaz }: { p: Parametre; c: PlanlamaCalismasi; yaz: ((p: Parametre, girdi: string) => void) | null }) {
  const v = parametreDegeri(c, p.yer, p.k);
  const ortak = { disabled: !yaz, 'aria-label': p.etiket, className: 'tc-alan-kutu' };
  const girdi = p.tur === 'sec'
    ? (
      <select {...ortak} value={String(v ?? '')} onChange={(e) => { yaz?.(p, e.target.value); }}>
        {p.secenekler.map(([d, ad]) => <option key={d} value={d}>{ad}</option>)}
      </select>
    )
    : p.tur === 'fason'
      ? (
        <select {...ortak} value={typeof v === 'string' ? v : ''} onChange={(e) => { yaz?.(p, e.target.value); }}>
          <option value="">Yok</option>
          {(c.D.fasoncular ?? []).map((f) => <option key={f.id} value={f.id}>{f.ad ?? f.id}</option>)}
        </select>
      )
      // Değer kutudan çıkınca yazılır (eski sayfanın change olayı); geçersiz değer bildirilir, kutu kayıttaki değere döner.
      : (
        <input
          {...ortak} key={String(v ?? '')} type="number" min={p.min} max={p.max} step={p.adim} defaultValue={typeof v === 'number' ? v : ''}
          onBlur={(e) => { if (e.target.value !== String(v ?? '')) yaz?.(p, e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
      );
  const birim = p.tur === 'sayi' && p.birim ? <small> ({p.birim})</small> : null;
  return <label className="tc-pyi-param"><span>{p.etiket}{birim}</span>{girdi}</label>;
}

function BedelHucresi({ k, bedel, kapali }: { k: Kisit; bedel: KisitBedeli | null; kapali: boolean }) {
  if (!k.g) return null;
  const b = bedel?.liste.find((x) => x.id === k.id);
  if (bedel && b) {
    if (b.dW <= bedelEsigi(bedel)) return <span className="tc-pyi-k" title="Fark kısa çözümün gürültü sınırı içinde">etkisi yok</span>;
    const enCok = Math.max(0.1, ...bedel.liste.map((x) => x.dW));
    return (
      <span className="tc-pyi-bedel" title={`Kapatılsaydı ağırlıklı gecikme ${sayiYazi(b.dW, 1)} sa azalırdı`}>
        <span className="tc-pyi-bedel-yol"><i ref={degisken({ '--o': `${(b.dW / enCok) * 100}%` })} /></span><b className="mono">−{sayiYazi(b.dW, 1)} sa</b>
      </span>
    );
  }
  return <span className="tc-pyi-k">{kapali ? 'kapalı' : '—'}</span>;
}

export function Kisitlar({ c, komut, planYaz, git, uyar }: {
  c: PlanlamaCalismasi; komut: CalismaKomutu | null; planYaz: boolean; git: (b: VeriBolumu) => void; uyar: (ileti: string) => void;
}) {
  const yaz = komut && planYaz ? komut : null;
  const bedel = bedelOku(c);
  const say = durumSayilari();

  const anahtar = (k: Kisit, ac: boolean) => {
    yaz?.degistir(ac ? 'Kısıt açıldı' : 'Kısıt kapatıldı', (t) => { kisitDegistir(t, k.id, ac); }, { ayrinti: k.ad });
  };
  const parametre = (p: Parametre, girdi: string) => {
    if (!yaz) return;
    const o = parametreOku(p, girdi);
    if ('hata' in o) { uyar(o.hata); return; }
    const once = parametreDegeri(c, p.yer, p.k);
    if (once === o.deger) return;
    // Değişiklik bütçesi bugünkü sayfada doğrudan kaydedilir (iz ve plan bayatlaması yok).
    if (p.k === 'maxChg') { yaz.degistir('Parametre değişti', (t) => parametreYaz(t, p.yer, p.k, o.deger), { sessiz: true }); return; }
    yaz.degistir('Parametre değişti', (t) => parametreYaz(t, p.yer, p.k, o.deger), { ayrinti: `${p.etiket}: ${String(once ?? '—')} → ${String(o.deger ?? '—')}` });
  };
  const hepsiniAc = () => { yaz?.degistir('Kısıtların hepsi açıldı', (t) => { if (!t.kapali.length) return false; t.kapali = []; }); };

  const sutunlar: Sutun<Kisit>[] = [
    { anahtar: 'kisit', baslik: 'Kısıt', hucre: (k) => <><b>{k.ad}</b>{k.not && <><br /><span className="tc-pyi-k">{k.not}</span></>}</> },
    { anahtar: 'model', baslik: 'Model', hucre: (k) => <Rozet ton={DURUM_ROZETI[k.durum][1]}>{DURUM_ROZETI[k.durum][0]}</Rozet> },
    { anahtar: 'hesapta', baslik: 'Hesapta', hucre: (k) => {
      if (!k.g) return <span className="tc-pyi-k">{k.durum === 'yok' ? '—' : 'sabit'}</span>;
      const kapali = c.kapali.includes(k.id);
      return (
        <label className="tc-pyi-anahtar" title={kapali ? 'Motor bu kısıtı saymıyor' : 'Motor bu kısıtı uyguluyor'}>
          <input type="checkbox" role="switch" aria-label={k.ad} checked={!kapali} disabled={!yaz} onChange={(e) => { anahtar(k, e.target.checked); }} />
          <i aria-hidden="true" /><span>{kapali ? 'Kapalı' : 'Açık'}</span>
        </label>
      );
    } },
    { anahtar: 'parametre', baslik: 'Parametre', hucre: (k) => (k.p?.length
      ? <div className="tc-pyi-paramlar">{k.p.map((p) => <ParametreGirdisi key={p.k} p={p} c={c} yaz={yaz ? parametre : null} />)}</div>
      : <span className="tc-pyi-k">—</span>) },
    { anahtar: 'bedel', baslik: 'Bedel', hucre: (k) => <div className="tc-pyi-bedel-hucre"><BedelHucresi k={k} bedel={bedel} kapali={c.kapali.includes(k.id)} /></div> },
    { anahtar: 'veri', baslik: 'Veri', gizliBaslik: true, hucre: (k) => (k.sayfa
      ? <KucukDugme ad={`Verisi: ${bolumAdi(k.sayfa)}`} simge="edit" yap={() => { if (k.sayfa) git(k.sayfa); }} /> : null) },
  ];

  const kapaliAdlar = c.kapali.map((id) => kisitBul(id)?.ad ?? id);
  return (
    <div className="tc-pyi-dik">
      {c.kapali.length > 0 && (
        <Serit ton="hata" simge="alert" eylem={yaz ? <KucukDugme ad="Hepsini aç" simge="check" metin="Hepsini aç" yap={hepsiniAc} /> : undefined}>
          <b>Kapalı kısıt:</b> {kapaliAdlar.join(', ')}. Motor bunları saymadan çözer; plan gerçekte uygulanamayabilir. Kaynak yükünde aşımlar kırmızı görünür.
        </Serit>
      )}
      <div className="tc-pyi-sayilar">
        <SayiKarti baslik="Modelde" sayi={say.tam} simge="check" altMetin="motor aynen uygular" />
        <SayiKarti baslik="Yaklaşık" sayi={say.yaklasik} simge="alert" altMetin="basitleştirilmiş hâliyle" />
        <SayiKarti baslik="Karara bağlı" sayi={say.karar} simge="flag" altMetin="kural seçimine göre" />
        <SayiKarti baslik="Modelde yok" sayi={say.yok} simge="x" ton="uyari" altMetin="araştırmada var, motorda yok" />
      </div>
      <VeriKarti
        baslik="Kısıt bedeli"
        sag={<KucukDugme ad={bedel ? 'Yeniden hesapla' : 'Bedeli hesapla'} metin={bedel ? 'Yeniden hesapla' : 'Bedeli hesapla'} simge="target" birincil={!bedel} kapali not={MOTOR_NOTU} yap={() => undefined} />}
      >
        <p className="tc-pyi-alt">
          Her açık kısıt tek tek kapatılır, aynı motorla kısa bir çözüm yapılır, ağırlıklı gecikme temel çözümle karşılaştırılır. Sonuç bir kısıtın plana kaç saat
          gecikmeye mal olduğunu gösterir; ek tezgâh, ek ayarcı ya da aparat kararı için başlangıçtır. Yaklaşıktır: kısa çözüm gürültülüdür; temelin %3&apos;ünden
          (en az 1 saat) küçük fark etki sayılmaz.
        </p>
        {bedel && <p className="tc-pyi-k">Temel: ağırlıklı gecikme {saat(bedel.temel.wT)} · geciken {bedel.temel.late} · {zamanYaz(bedel.zaman)}</p>}
      </VeriKarti>
      {KATALOG.map((g) => (
        <VeriKarti key={g.grup} baslik={g.grup} simge={g.simge} sag={<span className="tc-pyi-k">{g.l.length} kısıt · {g.l.filter((k) => c.kapali.includes(k.id)).length} kapalı</span>}>
          <VeriTablosu etiket={g.grup} sutunlar={sutunlar} satirlar={g.l} anahtar={(k) => k.id} satirTonu={(k) => (c.kapali.includes(k.id) ? 'kapali' : undefined)} />
        </VeriKarti>
      ))}
      <div className="tc-pyi-iki tc-pyi-iki-esit">
        <VeriKarti baslik="Amaç sırası">
          <ol className="tc-pyi-olaylar">
            {AMAC_SIRASI.map((x, i) => <li key={x} className="tc-pyi-olay" data-ton="bilgi"><b className="mono">{i + 1}</b><span>{x}</span></li>)}
          </ol>
          <p className="tc-pyi-k">Sıralı amaç: bir üst ölçüt eşitse alttakine bakılır; bir saat gecikme hiçbir ayar kazancıyla takas edilmez.</p>
        </VeriKarti>
        <VeriKarti baslik="Çözücüler">
          <ul className="tc-pyi-olaylar">
            <li className="tc-pyi-olay" data-ton="bilgi">
              <Simge ad="cpu" boyut="k" />
              <span><b>Motor</b> bu sayfada, tarayıcıda ayrı iş parçacığında koşar; yukarıdaki açık kısıtların hepsini uygular. Elle hamlelerin de hakemidir.</span>
              <Rozet ton="tamam">Etkin</Rozet>
            </li>
            <li className="tc-pyi-olay">
              <Simge ad="chart" boyut="k" /><span><b>HiGHS</b> sayfaya gömülü: alt sınır ve ek mesai önerisi.</span><Rozet ton="tamam">Etkin</Rozet>
            </li>
          </ul>
          <KucukDugme ad="Çözücüler" metin="Çözücüler" simge="cpu" kapali not={YOK_NOTU} yap={() => undefined} />
        </VeriKarti>
      </div>
      <p className="tc-pyi-k">Kaynak: araştırma notu cnc/1-kisitlar.md, bölüm 2. &quot;Modelde yok&quot; satırları motora girmedikçe planda sayılmaz; girmeleri ayrı karardır.</p>
    </div>
  );
}
