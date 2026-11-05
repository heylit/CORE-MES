import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GeometriDurumu, GeometriMontajBileseni, GeometriMontajCevabi, GeometriMontajDugumu } from '#paylasilan/sozlesme/geometri.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Sekmeler, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../ortak/veri/api.ts';
import { Yetkili } from '../../ortak/veri/yetki.ts';
import { anahtarlar } from './anahtarlar.ts';
import { altParcalar, hacimMetni, kutuMetni, suruyorMu } from './gorunum.ts';
import type { ParcaKutusu } from './Goruntu3B.tsx';

type SekmeAdi = 'agac' | 'liste';
// Seçim: ağaçtaki bir düğüm (parça ya da alt montaj) ya da listedeki bir bileşen; vurgulanan parça düğümleri.
type Secim = { tur: 'dugum'; sira: number; parcalar: number[] } | { tur: 'bilesen'; sira: number; parcalar: number[] };

const hataMetni = (hata: unknown): string =>
  hata instanceof ApiHatasi && hata.durum === 403 ? '3D Atölyesi için yetkiniz yok.' : hataIletisi(hata, 'Montaj okunamadı.');

function Agac({ dugumler, secim, sec }: { dugumler: readonly GeometriMontajDugumu[]; secim: Secim | null; sec: (d: GeometriMontajDugumu) => void }) {
  const [kapali, kapaliYaz] = useState<ReadonlySet<number>>(new Set());
  const altlar = new Map<number, GeometriMontajDugumu[]>();
  for (const d of dugumler) if (d.ust !== null) altlar.set(d.ust, [...(altlar.get(d.ust) ?? []), d]);
  const secili = new Set(secim?.parcalar ?? []);
  const dugum = (d: GeometriMontajDugumu) => {
    const a = altlar.get(d.sira) ?? [];
    const acik = !kapali.has(d.sira);
    const parcalar = d.tur === 'parca' ? [d.sira] : altParcalar(dugumler, d.sira);
    const basili = secili.size > 0 && parcalar.length > 0 && parcalar.every((p) => secili.has(p));
    return (
      <li key={d.sira}>
        <div className="tc-g3b-mo-dugum">
          {d.tur === 'montaj' ? (
            <button type="button" className="tc-g3b-mo-ac" aria-expanded={acik} aria-label={`${d.ad ?? 'Adsız'} ${acik ? 'daralt' : 'genişlet'}`}
              onClick={() => kapaliYaz((k) => { const y = new Set(k); if (y.has(d.sira)) y.delete(d.sira); else y.add(d.sira); return y; })}>
              <Simge ad={acik ? 'down' : 'chev-right'} />
            </button>
          ) : <span className="tc-g3b-mo-ac" aria-hidden="true" />}
          <button type="button" className="tc-g3b-mo-satir" aria-pressed={basili} onClick={() => sec(d)}>
            <Simge ad={d.tur === 'montaj' ? 'layers' : 'box'} />
            <span className="tc-g3b-mo-ad">{d.ad ?? <span className="tc-g3b-soluk">Adsız</span>}</span>
            <span className="tc-g3b-mo-olcu">{d.obb === null ? `${String(parcalar.length)} parça` : kutuMetni(d.obb.a, d.obb.b, d.obb.c)}</span>
          </button>
        </div>
        {a.length > 0 && acik && <ul className="tc-g3b-mo-alt">{a.map(dugum)}</ul>}
      </li>
    );
  };
  const kok = dugumler.find((d) => d.ust === null);
  return kok === undefined ? null : <ul className="tc-g3b-mo-agac">{dugum(kok)}</ul>;
}

const SUTUNLAR: readonly Sutun<GeometriMontajBileseni>[] = [
  { anahtar: 'ad', baslik: 'Bileşen', hucre: (b) => b.ad ?? 'Adsız' },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (b) => <strong>{b.adet}</strong> },
  { anahtar: 'obb', baslik: 'Döndürülmüş kutu', kirilmaz: true, hucre: (b) => kutuMetni(b.obb.a, b.obb.b, b.obb.c) },
  { anahtar: 'hacim', baslik: 'Hacim', hizala: 'sag', hucre: (b) => hacimMetni(b.hacimMm3) },
];

function SecimBilgisi({ c, secim }: { c: GeometriMontajCevabi; secim: Secim }) {
  const dugumler = c.dugumler ?? [];
  const d = secim.tur === 'dugum' ? dugumler.find((x) => x.sira === secim.sira) : undefined;
  if (d?.tur === 'montaj') {
    const kutu = d.kutuEn !== null && d.kutuUst !== null ? d.kutuUst.map((u, i) => u - d.kutuEn![i]!) : null;
    return (
      <dl className="tc-g3b-degerler tc-g3b-mo-secim">
        <div><dt>Seçili</dt><dd>{d.ad ?? 'Adsız'} (alt montaj, {secim.parcalar.length} parça)</dd></div>
        {kutu !== null && <div><dt>Dış kutu</dt><dd>{kutuMetni(kutu[0]!, kutu[1]!, kutu[2]!)}</dd></div>}
      </dl>
    );
  }
  const p = dugumler.find((x) => x.sira === secim.parcalar[0]);
  if (p === undefined || p.obb === null) return null;
  return (
    <dl className="tc-g3b-degerler tc-g3b-mo-secim">
      <div><dt>Seçili</dt><dd>{p.ad ?? 'Adsız'}{secim.parcalar.length > 1 ? ` (${String(secim.parcalar.length)} adet)` : ''}</dd></div>
      <div><dt>Döndürülmüş kutu</dt><dd>{kutuMetni(p.obb.a, p.obb.b, p.obb.c)}</dd></div>
      <div><dt>Hacim</dt><dd>{hacimMetni(p.hacimMm3)}</dd></div>
    </dl>
  );
}

// Montaj kartı (2113 prototipi; veri 2109): ağaç ve adetli bileşen listesi, yalnız öneri. Seçilen parçalar modelde kutuyla vurgulanır.
// Analiz yenilenince (durum değişince) yeniden okunur.
export function MontajKarti({ revizyonId, durum, vurgula, yenidenHesapla }: {
  revizyonId: number; durum: GeometriDurumu; vurgula: (kutular: ParcaKutusu[] | null) => void; yenidenHesapla: { calistir: () => void; bekliyor: boolean };
}) {
  const surer = suruyorMu(durum);
  const sorgu = useQuery({
    queryKey: [...anahtarlar.montaj(revizyonId), durum],
    queryFn: () => api.get<GeometriMontajCevabi>(`/geometri/montaj/${String(revizyonId)}`),
    enabled: !surer,
  });
  const [sekme, sekmeYaz] = useState<SekmeAdi>('agac');
  const [secim, secimYaz] = useState<Secim | null>(null);
  const c = sorgu.data;
  const dugumler = c?.dugumler ?? [];

  const uygula = (yeni: Secim | null) => {
    const ayni = yeni !== null && secim !== null && yeni.tur === secim.tur && yeni.sira === secim.sira;
    const son = ayni ? null : yeni;
    secimYaz(son);
    if (son === null) { vurgula(null); return; }
    const kutular = son.parcalar.flatMap((s) => {
      const d = dugumler.find((x) => x.sira === s);
      return d?.kutuEn && d.kutuUst ? [{ en: d.kutuEn, ust: d.kutuUst }] : [];
    });
    vurgula(kutular.length === 0 ? null : kutular);
  };

  const govde = (() => {
    if (surer) return <p className="tc-g3b-soluk">Hesap sürüyor; sonuç gelince burada görünür.</p>;
    if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
    if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(sorgu.error)} />;
    if (c === undefined || c.neden === 'analiz-yok') return <p className="tc-g3b-soluk">Analiz bitince montaj yapısı burada görünür.</p>;
    if (c.neden === 'montaj-yok' || c.dugumler === null) {
      return (
        <div className="tc-g3b-mo-bos">
          <p className="tc-g3b-soluk">Bu model montaj okuması gelmeden hesaplandı.</p>
          <Yetkili islem="geometri.hesapla">
            <Dugme simge="rotate" yukleniyor={yenidenHesapla.bekliyor} onClick={yenidenHesapla.calistir}>Yeniden hesapla</Dugme>
          </Yetkili>
        </div>
      );
    }
    if (c.montaj === false) return <p className="tc-g3b-soluk">Bu model tek parçadır; montaj yapısı yok.</p>;
    const parca = dugumler.filter((d) => d.tur === 'parca').length;
    const altMontaj = dugumler.filter((d) => d.tur === 'montaj' && d.ust !== null).length;
    const bilesenler = c.bilesenler ?? [];
    return (
      <>
        <div className="tc-g3b-oz-ozet">
          <Rozet gorunum="cizgi">{parca} parça</Rozet>
          <Rozet gorunum="cizgi">{bilesenler.length} farklı bileşen</Rozet>
          <Rozet gorunum="cizgi">{altMontaj} alt montaj</Rozet>
        </div>
        <Sekmeler<SekmeAdi> etiket="Montaj görünümü" secili={sekme} sec={sekmeYaz}
          sekmeler={[{ anahtar: 'agac', baslik: 'Ağaç', simge: 'layers' }, { anahtar: 'liste', baslik: 'Bileşen listesi', simge: 'list' }]} />
        {sekme === 'agac'
          ? <Agac dugumler={dugumler} secim={secim} sec={(d) => uygula({ tur: 'dugum', sira: d.sira, parcalar: d.tur === 'parca' ? [d.sira] : altParcalar(dugumler, d.sira) })} />
          : <Tablo etiket="Bileşen listesi" sutunlar={SUTUNLAR} satirlar={bilesenler} satirAnahtari={(b) => b.sira}
            satirSec={(b) => uygula({ tur: 'bilesen', sira: b.sira, parcalar: b.dugumler })} />}
        {secim !== null && <SecimBilgisi c={c} secim={secim} />}
        <p className="tc-g3b-soluk tc-g3b-oz-not">
          Adlar dosyadan gelir; bazı CAD programları parçaya &quot;SOLID&quot; gibi genel ad verir. Ölçüler üçgen ağından, yaklaşıktır ve gerçek montaj
          dosyasıyla denenmedi. Bu liste reçeteye kendiliğinden yazılmaz.
        </p>
      </>
    );
  })();

  return (
    <div className="tc-g3b-mo">
      <Kart baslik="Montaj" simge="layers" baslikEki={<Rozet ton="uyari">Öneri</Rozet>}>{govde}</Kart>
    </div>
  );
}
