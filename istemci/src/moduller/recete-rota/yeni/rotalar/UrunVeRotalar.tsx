import { useMemo, useState, type KeyboardEvent } from 'react';
import { Dugme, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import {
  adimEkle, adimSil, ortalamaGunSaati, adimSurukle, agacKur, agacUrunleri, acikRevizyon, islemSuresiEksik, malzemeMaliyeti, rotaEksikleri, rotaSahibiOlur,
  sirali, statuNo, yeniAdim, type Operasyon,
} from './kurallar.ts';
import { sayi, YOK } from '../bicim.ts';
import { tercihOku, tercihYaz, type RotaEkrani, type Secim } from './ortak.tsx';
import { useRotaDuzeni, yeniKimlik } from './useRotaDuzeni.ts';
import { AkisSemasi, SURUKLE_TURU, surukleCoz } from './AkisSemasi.tsx';
import { AkisTablosu } from './AkisTablosu.tsx';
import { AdimPaneli } from './AdimPaneli.tsx';
import { DuzenlemePaneli } from './DuzenlemePaneli.tsx';
import { RevizyonCubugu } from './RevizyonCubugu.tsx';
import { UrunListesi } from './UrunListesi.tsx';

// Ürün ve rotalar: ürün listesi, akış şeması ya da akış tablosu, revizyon çubuğu ve düzenleme paneli. Açılışta yazma yoktur; rota
// değişikliği ilk düzenlemede taslağa yazılır.
export function UrunVeRotalar(o: EkranOzellikleri) {
  const { bildir } = useBildirim();
  const [secim, setSecim] = useState<Secim | null>(null);
  const duzen = useRotaDuzeni(o.veri, o.yetki, (urunId, adimId) => { setSecim({ tur: 'adim', urunId, adimId, seq: 0, miktar: 1 }); });
  const { h } = duzen;
  const urunler = useMemo(() => [...h.malzeme.values()]
    .filter((m) => rotaSahibiOlur(m, o.veri.durum.routes?.[m.id]?.steps.length ?? 0, (o.veri.durum.routeRevs ?? []).filter((r) => r.itemId === m.id).length))
    .sort((a, b) => a.code.localeCompare(b.code, 'tr')), [h, o.veri.durum]);
  const [kok, setKok] = useState<string | null>(() => (o.kimlik !== null && h.malzeme.has(o.kimlik) ? o.kimlik : tercihOku('kok', '') || null));
  const kokId = kok !== null && h.malzeme.has(kok) ? kok : urunler[0]?.id ?? null;
  const [revUrun, setRevUrun] = useState<string | null>(null);
  const [liste, setListe] = useState(false);
  const [gorunum, setGorunum] = useState(() => tercihOku('gorunum', 'sema'));
  const [kip, setKip] = useState(() => tercihOku('miktar-kipi', 'siparis'));
  const [siparis, setSiparis] = useState(() => { const n = Number(tercihOku('siparis', '1')); return Number.isFinite(n) && n > 0 ? n : 1; });
  const [adimPaneli, setAdimPaneli] = useState(() => tercihOku('adim-paneli', '') === '1');
  const [kapali, setKapali] = useState<ReadonlySet<string>>(new Set());
  const [tamEkran, setTamEkran] = useState(false);
  const [copUstunde, setCopUstunde] = useState(false);

  const miktar = kip === 'baz' ? 1 : siparis;
  const gunSaati = useMemo(() => {
    const dk = new Map((o.veri.durum.cal?.shifts ?? []).map((v) => [v.id, v.netDakika]));
    const hafta = o.veri.ek.takvim?.hafta;
    return (wcId: string | null) => ortalamaGunSaati(wcId === null ? undefined : hafta?.[wcId], (id) => dk.get(id) ?? 0);
  }, [o.veri.durum.cal, o.veri.ek.takvim]);
  const kokSec = (id: string) => { setKok(id); tercihYaz('kok', id); setRevUrun(null); setListe(false); setKapali(new Set()); };
  const r: RotaEkrani = {
    duzen, yetki: o.yetki, secim, sec: setSecim, git: o.git, kokSec, kapali, gunSaati,
    kapaliDegistir: (nid) => { const y = new Set(kapali); if (y.has(nid)) y.delete(nid); else y.add(nid); setKapali(y); },
  };
  const malzeme = (id: string) => h.malzeme.get(id);
  const agac = kokId ? agacUrunleri(kokId, duzen.adimlar, malzeme, (id) => duzen.adimlar(id).length > 0 || acikRevizyon(duzen.revler(id)) !== null) : [];
  const revId = revUrun !== null && agac.includes(revUrun) ? revUrun : kokId;
  const dugum = kokId ? agacKur(kokId, miktar, duzen.adimlar, malzeme) : null;
  // Özet çubuğu motorsuzdur: birim malzeme maliyeti (prototipte matCost) ve şemadaki rotaların eksikleri. Bitiş ve darboğaz plan işidir.
  const birim = (id: string): number | null => {
    const g = duzen.durum.maliyet?.malzeme[id];
    const n = g ? Number(g.birimMaliyet) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const birimMaliyet = kokId && duzen.durum.maliyet ? malzemeMaliyeti(kokId, duzen.adimlar, malzeme, birim) : null;
  const uyarilar = agac.flatMap((id) => {
    const l = duzen.adimlar(id);
    const kod = h.malzeme.get(id)?.code ?? id;
    const sure = islemSuresiEksik(l);
    return [
      ...rotaEksikleri(l, duzen.malzemeVar, duzen.opAdi).map((x) => `${kod}: ${x.metin}`),
      ...(sure ? [`${kod}: OP ${String(statuNo(sure))} işlem süresi yok`] : []),
    ];
  });

  const tercih = (k: string, v: string, yaz: (v: string) => void) => { yaz(v); tercihYaz(k, v); };

  // Adım panelinden ekleme: seçili adımın ürününe, ardına; yoksa gösterilen rotanın sonuna.
  const panelEkle = (op: Operasyon) => {
    const hedef = secim && 'urunId' in secim && duzen.duzenlenebilir(secim.urunId) ? secim.urunId : revId;
    if (!hedef) return;
    const l = sirali(duzen.adimlar(hedef));
    const sonra = secim?.tur === 'adim' && secim.urunId === hedef ? secim.adimId : l.at(-1)?.id ?? null;
    const yeni = yeniAdim(op, yeniKimlik());
    const l2 = adimEkle(l, sonra, yeni);
    if (duzen.degistir(hedef, () => l2, `${op.abbr ?? op.code} adımı eklendi`)) {
      setSecim({ tur: 'adim', urunId: hedef, adimId: yeni.id, seq: l2.find((x) => x.id === yeni.id)?.seq ?? 0, miktar });
    }
  };

  const tus = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    const k = e.key.toLocaleLowerCase('tr-TR');
    const hedef = secim && 'urunId' in secim ? secim.urunId : revId;
    if ((e.ctrlKey || e.metaKey) && hedef && (k === 'z' || k === 'y')) {
      e.preventDefault();
      duzen.geriAl(hedef, k === 'z' && !e.shiftKey ? 'geri' : 'ileri');
      return;
    }
    if (!e.altKey || secim?.tur !== 'adim' || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const l = sirali(duzen.adimlar(secim.urunId));
    const i = l.findIndex((x) => x.id === secim.adimId);
    const komsu = l[i + (e.key === 'ArrowUp' ? -1 : 1)];
    if (!komsu) return;
    if (e.shiftKey) duzen.degistir(secim.urunId, (x) => adimSurukle(x, secim.adimId, komsu.id), 'Adım taşındı');
    else setSecim({ ...secim, adimId: komsu.id, seq: komsu.seq });
  };

  const copeBirak = (v: string) => {
    const s = surukleCoz(v);
    if (s?.tur !== 'adim') return;
    const a = duzen.adimlar(s.urunId).find((x) => x.id === s.adimId);
    if (!a || !duzen.degistir(s.urunId, (l) => adimSil(l, s.adimId), `OP ${String(statuNo(a))} silindi`)) return;
    if (secim?.tur === 'adim' && secim.adimId === s.adimId) setSecim(null);
    bildir('bilgi', `OP ${String(statuNo(a))} ${duzen.opAdi(a.opId) ?? ''} silindi.`, { eylem: { etiket: 'Geri al', yap: () => { duzen.geriAl(s.urunId, 'geri'); } } });
  };
  const cop = kokId && duzen.duzenlenebilir(kokId) ? (
    <div className={`tc-rr1-copkutu${copUstunde ? ' tc-rr1-cop-ustunde' : ''}`} role="region" aria-label="Adımı silmek için buraya sürükle"
      onDragOver={(e) => { e.preventDefault(); setCopUstunde(true); }} onDragLeave={() => { setCopUstunde(false); }}
      onDrop={(e) => { e.preventDefault(); setCopUstunde(false); copeBirak(e.dataTransfer.getData(SURUKLE_TURU)); }}>
      <Simge ad="trash" boyut="k" /> Silmek için adımı buraya sürükle
    </div>
  ) : null;

  return (
    <div className={`tc-rr1${tamEkran ? ' tc-rr1-tam' : ''}`} data-parca="R1" onKeyDown={tus}>
      <div className="tc-rr1-top">
        {urunler.length > 0 && !liste && (
          <select className="tc-rr1-secim tc-rr1-kok" value={kokId ?? ''} aria-label="Şemadaki ürün" onChange={(e) => { kokSec(e.target.value); setSecim(null); }}>
            {urunler.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
          </select>
        )}
        <Dugme className="tc-rr1-kd" tur={liste ? 'birincil' : 'ikincil'} simge="list" aria-pressed={liste} title="Bütün ürünleri ve rotalarını tabloda gör" onClick={() => { setListe(!liste); }}>Ürün listesi</Dugme>
        {o.yetki.rotaYaz && <Dugme className="tc-rr1-kd" tur="ikincil" simge="plus" onClick={() => { setListe(false); setSecim({ tur: 'yeniRota' }); }}>Yeni rota</Dugme>}
        {!liste && kokId && o.yetki.rotaYaz && (
          <Dugme className="tc-rr1-kd" tur={adimPaneli ? 'birincil' : 'ikincil'} simge="layers" aria-pressed={adimPaneli}
            onClick={() => { tercih('adim-paneli', adimPaneli ? '' : '1', (v) => { setAdimPaneli(v === '1'); }); }}>Adım ekle</Dugme>
        )}
        {!liste && (
          <>
            <span className="tc-rr1-seg" role="group" aria-label="Görünüm">
              <button type="button" aria-pressed={gorunum !== 'tablo'} onClick={() => { tercih('gorunum', 'sema', setGorunum); }}><Simge ad="route" boyut="k" /> Akış şeması</button>
              <button type="button" aria-pressed={gorunum === 'tablo'} onClick={() => { tercih('gorunum', 'tablo', setGorunum); }}><Simge ad="grid" boyut="k" /> Akış tablosu</button>
            </span>
            <span className="tc-rr1-seg" role="group" aria-label="Gösterilen miktar">
              <button type="button" aria-pressed={kip === 'baz'} onClick={() => { tercih('miktar-kipi', 'baz', setKip); }}>Baz miktar</button>
              <button type="button" aria-pressed={kip !== 'baz'} onClick={() => { tercih('miktar-kipi', 'siparis', setKip); }}>Sipariş</button>
            </span>
            {kip !== 'baz' && (
              <input className="tc-rr1-sayi" inputMode="decimal" aria-label="Sipariş miktarı" value={String(siparis)}
                onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n) && n > 0) { setSiparis(n); tercihYaz('siparis', String(n)); } }} />
            )}
          </>
        )}
        <span className="tc-rr1-grow" />
        {!liste && kokId && (o.yetki.maliyetOku || uyarilar.length > 0 || o.yetki.emirYaz) && (
          <span className="tc-rr1-run" role="group" aria-label="Rota özeti">
            {o.yetki.maliyetOku && (
              <span title="Girenlerin birim maliyet toplamı; işçilik ve makine hariç">
                Birim malzeme <b>{birimMaliyet === null ? YOK : `${sayi(Math.round(birimMaliyet * 100) / 100)} ₺`}</b>
              </span>
            )}
            {uyarilar.length > 0 && <span className="tc-rr1-uyari" title={uyarilar.join('\n')}>{uyarilar.length} uyarı</span>}
            {o.yetki.emirYaz && <Dugme className="tc-rr1-kd" tur="birincil" simge="clipboard-check" onClick={() => { o.git('orders', kokId); }}>Üretim emri oluştur</Dugme>}
          </span>
        )}
      </div>
      {liste ? <UrunListesi duzen={duzen} ac={(id) => { kokSec(id); setSecim(null); }} /> : (
        <>
          {kokId && revId && <RevizyonCubugu r={r} agac={agac} urunId={revId} urunSec={setRevUrun} />}
          <div className={`tc-rr1-body${adimPaneli && kokId && o.yetki.rotaYaz ? ' tc-rr1-adimli' : ''}${gorunum === 'tablo' ? ' tc-rr1-tbl' : ''}`}>
            {adimPaneli && kokId && o.yetki.rotaYaz && <AdimPaneli r={r} ekle={panelEkle} />}
            {dugum ? (
              gorunum === 'tablo'
                ? <AkisTablosu r={r} urunler={agac} miktar={miktar} cop={cop} />
                : <AkisSemasi r={r} kok={dugum} tamEkran={tamEkran} tamEkranDegistir={() => { setTamEkran(!tamEkran); }} cop={cop} />
            ) : (
              <div className="tc-rr1-emptycv">
                <h3>İlk rotanı kur</h3>
                <p className="tc-rr1-ipucu">Bir mamul seç, sonra rotasına adım ekleyip her adıma giren ve çıkan malzemeleri bağla. Ürün kartı Malzemeler ve Hizmetler&apos;de açılır.</p>
                {o.yetki.rotaYaz && <Dugme tur="birincil" simge="plus" onClick={() => { setSecim({ tur: 'yeniRota' }); }}>Yeni rota</Dugme>}
              </div>
            )}
            <DuzenlemePaneli r={r} />
          </div>
        </>
      )}
    </div>
  );
}
