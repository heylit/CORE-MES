import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KodCozCevabi, SeriListeCevabi, SeriListelerCevabi, SeriSatiri } from '#paylasilan/sozlesme/stok.ts';
import { CokSatir, DurumKutusu, Dugme, Kart, Pencere, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { VARSAYILAN_TAZELIK_MS } from '../../ortak/veri/sorgu-istemcisi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni, zamanMetni } from './gorunum.ts';
import { aktarimKodlari } from './okutarak-sayim.ts';
import { stokKodCozAnahtari } from './OkutmaSonucu.tsx';
import { hataMetni, korumaliPost, SayfaBasi, useIslem } from './ortak.tsx';
import { blokOnerisi, csvMetni, SERI_TURU_ADI, secilebilir, seriBloklari, seriTuru, sayimPlani, tasimaPlani, type Atlanan } from './seri-liste.ts';
import { SERI_ANAHTARI, SERI_SIMGESI } from './SeriOkut.tsx';
import './stok.css';

// Seri listeler (1915): telefonda Seri modunda ya da okuyucu hafızasından toplanan okutmalar. Satır düzeltilir, silinir; seçilen
// satırlar bir işe verilir. Kayıt yalnız işin kendi ucuyla, o işin yetkisi ve kuralıyla yazılır; liste yalnız "işlendi" tutar.
const listeAnahtari = (id: number) => [...SERI_ANAHTARI, id] as const;
type Coz = (kod: string) => KodCozCevabi | undefined;

function satirAdi(s: SeriSatiri, c: KodCozCevabi | undefined): { ad: string; alt: string } {
  const t = seriTuru(s.kod);
  if (!c || c.tur === 'bilinmiyor') return { ad: t === 'bilinmiyor' ? 'Tanınmayan kod' : SERI_TURU_ADI[t], alt: s.kod };
  if (c.tur === 'konum') return { ad: `Göz ${c.konum.kod}`, alt: c.bakiyeler.length ? `${c.bakiyeler.length} satır kayıtlı` : 'Boş' };
  const ad = c.tur === 'lot' ? `${c.ozet.ad ?? c.ozet.kod} · ${c.parti.etiket}` : c.ozet.ad ?? c.ozet.kod;
  const yerler = c.bakiyeler.slice(0, 3).map((b) => `${b.konumKod} ${miktarMetni(b.miktar)}`).join(', ');
  return { ad, alt: yerler ? `Kayıtta: ${yerler}${c.bakiyeler.length > 3 ? '…' : ''}` : 'Stokta yok' };
}

export function SeriListeler() {
  const istemci = useQueryClient();
  const listeler = useQuery({ queryKey: SERI_ANAHTARI, queryFn: () => api.get<SeriListelerCevabi>('/stok/seri-listeler') });
  const [secili, setSecili] = useState<number | null>(null);
  const [aktarim, setAktarim] = useState<string | null>(null);
  const aktar = useMutation({
    mutationFn: (metin: string) => korumaliPost<SeriListeCevabi>('/stok/seri-listeler/okutma-ekle', { kaynak: 'hafiza', kodlar: aktarimKodlari(metin) }),
    onSuccess: async (l) => { setAktarim(null); setSecili(l.liste.id); await istemci.invalidateQueries({ queryKey: SERI_ANAHTARI }); },
  });
  const acik = listeler.data?.listeler ?? [];
  const id = secili !== null && acik.some((l) => l.id === secili) ? secili : acik[0]?.id ?? null;
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Seri listeler" alt="Telefonda Seri modunda ya da okuyucu hafızasından toplananlar. Düzelt, seç, bir işe ver; kayıt yalnız işi onaylayınca yazılır."
        sag={<Dugme simge="list" onClick={() => setAktarim('')}>Hafızadan aktar</Dugme>} />
      {listeler.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(listeler.error)} yenile={() => void listeler.refetch()} /> : (
        <div className="tc-stok-seri-duzen">
          <Kart baslik="Açık listeler" simge="list">
            {listeler.isPending ? <DurumKutusu durum="yukleniyor" />
              : acik.length === 0 ? <p className="tc-stok-not">Açık liste yok. Okut panelinde Seri modunu seç ya da hafızadan aktar.</p>
              : (
                <Tablo etiket="Açık listeler" kip="kaydir" sutunlar={listeSutunlari(id, setSecili)} satirlar={acik} satirAnahtari={(l) => l.id} satirSec={(l) => setSecili(l.id)} />
              )}
          </Kart>
          {id !== null && <ListeAyrintisi key={id} id={id} />}
        </div>
      )}
      <Pencere acik={aktarim !== null} kapat={() => setAktarim(null)} baslik="Hafızadan aktar" alt={<>
        <Dugme onClick={() => setAktarim(null)}>Vazgeç</Dugme>
        <Dugme tur="birincil" yukleniyor={aktar.isPending} disabled={aktarimKodlari(aktarim ?? '').length === 0} onClick={() => aktar.mutate(aktarim ?? '')}>
          Yeni listeye aktar ({aktarimKodlari(aktarim ?? '').length})
        </Dugme>
      </>}>
        <ol className="tc-stok-liste">
          <li>Okuyucuyu bu bilgisayara bağla ve aşağıdaki alana tıkla.</li>
          <li>Okuyucuyla hafızayı aktaran barkodu ("Transmit Stored Data") okut; kodlar alana satır satır yazılır.</li>
          <li>Aktar: kodlar okutuldukları sırayla yeni bir seri listeye düşer; stok değişmez.</li>
        </ol>
        {aktar.isError && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hataMetni(aktar.error)}</p>}
        <CokSatir etiket="Aktarılan kodlar" rows={8} spellCheck={false} value={aktarim ?? ''} onChange={(o) => setAktarim(o.target.value)} data-ilk-odak />
      </Pencere>
    </section>
  );
}

function ListeAyrintisi({ id }: { id: number }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const tasiyabilir = useIslem('stok.transfer');
  const sayabilir = useIslem('stok.sayim');
  const q = useQuery({ queryKey: listeAnahtari(id), queryFn: () => api.get<SeriListeCevabi>(`/stok/seri-listeler/${id}`) });
  const kodlar = [...new Set(q.data?.satirlar.map((s) => s.kod) ?? [])];
  const cozumler = useQueries({
    queries: kodlar.map((kod) => ({
      queryKey: stokKodCozAnahtari(kod), staleTime: VARSAYILAN_TAZELIK_MS,
      queryFn: () => api.get<KodCozCevabi>(`/stok/kod-coz?kod=${encodeURIComponent(kod)}`),
    })),
  });
  const cozMap = new Map(kodlar.map((k, i) => [k, cozumler[i]?.data] as const));
  const coz: Coz = (kod) => cozMap.get(kod);
  const [secim, setSecim] = useState<ReadonlySet<number>>(new Set());
  const [karar, setKarar] = useState<'tasi' | 'say' | null>(null);
  const [hedef, setHedef] = useState('');
  const [calisiyor, setCalisiyor] = useState(false);
  const [atlanan, setAtlanan] = useState<{ satir: string; neden: string }[]>([]);
  const yaz = (l: SeriListeCevabi) => istemci.setQueryData(listeAnahtari(id), l);
  const satirIstegi = useMutation({
    mutationFn: (x: { yol: string; govde: object }) => korumaliPost<SeriListeCevabi>(x.yol, x.govde),
    onSuccess: yaz,
    onError: (e) => bildir('hata', hataMetni(e)),
  });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(q.error)} yenile={() => void q.refetch()} />;
  const { liste, satirlar } = q.data;
  const bloklar = seriBloklari(satirlar);
  const seciliSatirlar = satirlar.filter((s) => secim.has(s.id) && secilebilir(s));
  const sec = (ids: number[], acik: boolean) => { setKarar(null); setSecim((x) => { const y = new Set(x); for (const i of ids) { if (acik) y.add(i); else y.delete(i); } return y; }); };
  const gozler = [...new Map(satirlar.flatMap((s) => { const c = coz(s.kod); return c?.tur === 'konum' ? [[c.konum.id, c.konum.kod] as const] : []; })).entries()];
  const adBul = (s: SeriSatiri) => satirAdi(s, coz(s.kod)).ad;
  const kodAdi = (satirId: number) => satirlar.find((s) => s.id === satirId)?.kod ?? String(satirId);

  // İşin ucu satır satır çağrılır; yazılanlar "işlendi" olur, atlanan ve hata verenler listede kalır.
  const isle = async (isler: { satirIdler: number[]; gonder: () => Promise<unknown> }[], onceden: Atlanan[], basarili: string) => {
    setCalisiyor(true);
    const biten: number[] = [], kalan = onceden.map((a) => ({ satir: kodAdi(a.satirId), neden: a.neden }));
    for (const i of isler) {
      try { await i.gonder(); biten.push(...i.satirIdler); } catch (e) { kalan.push({ satir: kodAdi(i.satirIdler.at(-1)!), neden: hataMetni(e) }); }
    }
    if (biten.length > 0) yaz(await korumaliPost<SeriListeCevabi>(`/stok/seri-listeler/${id}/islendi`, { satirIdler: biten }));
    setAtlanan(kalan);
    setSecim(new Set());
    setKarar(null);
    setCalisiyor(false);
    bildir(biten.length > 0 ? 'tamam' : 'hata', `${basarili}: ${biten.length} satır${kalan.length ? `; ${kalan.length} satır işlenmedi` : ''}.`);
    await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
  };
  const tasi = () => {
    const p = tasimaPlani(seciliSatirlar, coz, Number(hedef));
    void isle(p.isler.map((x) => ({ satirIdler: [x.satirId], gonder: () => korumaliPost('/stok/tasima', x.govde) })), p.atlanan, 'Taşındı');
  };
  const say = () => {
    const isler: { satirIdler: number[]; gonder: () => Promise<unknown> }[] = [], once: Atlanan[] = [];
    for (const b of bloklar) {
      if (!b.goz || !b.satirlar.some((s) => secim.has(s.id))) continue;
      const p = sayimPlani(b, secim, coz);
      if ('hata' in p) { once.push({ satirId: b.goz.id, neden: p.hata }); continue; }
      once.push(...p.atlanan);
      isler.push({ satirIdler: p.satirIdler, gonder: () => korumaliPost('/stok/sayim', p.govde) });
    }
    void isle(isler, once, 'Sayım kaydedildi');
  };
  const sepete = () => {
    const isler = seciliSatirlar.flatMap((s) => {
      const c = coz(s.kod);
      if (!c || (c.tur !== 'lot' && c.tur !== 'malzeme') || !(Number(s.adet) > 0)) return [];
      const tekYer = c.bakiyeler.length === 1 && c.bakiyeler[0]!.statuId === null ? c.bakiyeler[0]! : null;
      const govde = { malzemeId: c.ozet.id, miktar: s.adet!, ...(tekYer ? { kaynakKonumId: tekYer.konumId, partiId: tekYer.partiId } : {}) };
      return [{ satirIdler: [s.id], gonder: () => korumaliPost('/stok/sepet/satir-ekle', govde) }];
    });
    void isle(isler, [], 'Depo sepetine eklendi');
  };
  const disaAktar = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csvMetni(satirlar, adBul)}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `seri-liste-${liste.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const seciliBlok = bloklar.filter((b) => b.goz && b.satirlar.some((s) => secim.has(s.id))).length;
  return (
    <Kart baslik={`Seri liste · ${zamanMetni(liste.acilis)}`} simge="scan" sag={<span className="tc-stok-not">{liste.acikSatir} açık satır · göz bloklarına bölündü</span>}>
      {bloklar.length === 0 && <p className="tc-stok-not">Liste boş.</p>}
      {bloklar.map((b, bi) => {
        const oneri = blokOnerisi(b, coz);
        const acikIdler = b.satirlar.filter(secilebilir).map((s) => s.id);
        return (
          <section key={b.goz?.id ?? `bas-${bi}`} className="tc-stok-seri-blok" aria-label={b.goz ? satirAdi(b.goz, coz(b.goz.kod)).ad : 'Göz okutulmadan'}>
            <div className="tc-stok-seri-blok-bas">
              <strong><Simge ad={b.goz ? 'target' : 'alert'} /> {b.goz ? satirAdi(b.goz, coz(b.goz.kod)).ad : 'Göz okutulmadan'}{b.goz?.islendi ? ' · işlendi' : ''}</strong>
              {oneri && <span className="tc-stok-seri-oneri"><Simge ad="bolt" />{oneri}</span>}
              {acikIdler.length > 0 && <Dugme onClick={() => sec(acikIdler, true)}>Bloğu seç</Dugme>}
            </div>
            {b.satirlar.length > 0 && (
              <Tablo etiket={b.goz ? satirAdi(b.goz, coz(b.goz.kod)).ad : 'Göz okutulmadan'} kip="kaydir" satirlar={b.satirlar} satirAnahtari={(s) => s.id}
                sutunlar={satirSutunlari({ coz, secim, sec,
                  adet: (s, adet) => satirIstegi.mutate({ yol: `/stok/seri-listeler/${id}/satirlar/${s.id}/degistir`, govde: { adet } }),
                  sil: (s) => satirIstegi.mutate({ yol: `/stok/seri-listeler/${id}/satirlar/${s.id}/sil`, govde: {} }) })} />
            )}
          </section>
        );
      })}
      {atlanan.length > 0 && (
        <div className="tc-stok-bilgi tc-stok-bilgi-uyari" role="status">
          <span>İşlenmeyen satırlar listede kaldı:</span>
          <ul>{atlanan.map((a, i) => <li key={i}><span className="tc-stok-mono">{a.satir}</span> · {a.neden}</li>)}</ul>
        </div>
      )}
      <div className="tc-stok-seri-eylem">
        <strong>{seciliSatirlar.length} satır seçili</strong>
        {tasiyabilir && <Dugme simge="cart" disabled={seciliSatirlar.length === 0 || calisiyor} onClick={() => { setKarar('tasi'); setHedef(String(gozler.at(-1)?.[0] ?? '')); }}>Taşı…</Dugme>}
        {sayabilir && <Dugme simge="clipboard-check" disabled={seciliBlok === 0 || calisiyor} onClick={() => setKarar('say')}>Say…</Dugme>}
        <Dugme simge="box" disabled={seciliSatirlar.length === 0 || calisiyor} yukleniyor={calisiyor && karar === null} onClick={sepete}>Depo sepetine</Dugme>
        <Dugme simge="download" disabled={satirlar.length === 0} onClick={disaAktar}>Dışa aktar</Dugme>
        <Dugme simge="check" disabled={calisiyor} onClick={() => satirIstegi.mutate({ yol: `/stok/seri-listeler/${id}/kapat`, govde: {} }, { onSuccess: () => void istemci.invalidateQueries({ queryKey: SERI_ANAHTARI }) })}>Listeyi kapat</Dugme>
      </div>
      {karar === 'tasi' && (
        <div className="tc-stok-seri-karar" role="group" aria-label="Taşı">
          <strong>{seciliSatirlar.length} satırı taşı</strong>
          {gozler.length === 0
            ? <p className="tc-stok-not">Listede göz yok: hedef gözü telefonda okut, sonra yeniden dene.</p>
            : <Secim etiket="Nereye" secenekler={gozler.map(([k, kod]) => ({ deger: String(k), baslik: `Göz ${kod}` }))} value={hedef} onChange={(o) => setHedef(o.target.value)} />}
          <p className="tc-stok-not">Nereden: her satırın kayıtlı tek yeri. Birden çok yerde kayıtlı satır atlanır, listede kalır. Miktar listedeki adettir.</p>
          <div className="tc-stok-eylem">
            <Dugme onClick={() => setKarar(null)}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="cart" yukleniyor={calisiyor} disabled={hedef === ''} onClick={tasi}>Taşımayı kaydet</Dugme>
          </div>
        </div>
      )}
      {karar === 'say' && (
        <div className="tc-stok-seri-karar" role="group" aria-label="Say">
          <strong>{seciliBlok} gözün kör sayımı</strong>
          <p className="tc-stok-not">Her göz bloğu kendi gözünün sayımıdır; seçili satırlar sayılan miktardır. Gözde kayıtlı olup seçilmeyen satır 0 sayılır. Eşiği aşan fark onaya gider.</p>
          <div className="tc-stok-eylem">
            <Dugme onClick={() => setKarar(null)}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="clipboard-check" yukleniyor={calisiyor} onClick={say}>Sayımı kaydet</Dugme>
          </div>
        </div>
      )}
    </Kart>
  );
}

type Liste = SeriListelerCevabi['listeler'][number];
// Açık listeler dar sol sütunda durur: yapışık sütun yok, liste kendi içinde yana kayar.
const listeSutunlari = (id: number | null, sec: (id: number) => void): Sutun<Liste>[] => [
  { anahtar: 'liste', baslik: 'Açıldı', csv: (l) => zamanMetni(l.acilis),
    hucre: (l) => <Dugme aria-current={l.id === id} aria-label={`Seri liste · ${zamanMetni(l.acilis)}`} onClick={() => sec(l.id)}>{zamanMetni(l.acilis)}</Dugme> },
  { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (l) => (l.kaynak === 'hafiza' ? 'Okuyucu hafızası' : 'Okutma') },
  { anahtar: 'acik', baslik: 'Açık', hizala: 'sag', hucre: (l) => l.acikSatir },
  { anahtar: 'satir', baslik: 'Satır', hizala: 'sag', hucre: (l) => l.satirSayisi },
];

// Satır: seçim ve tür simgesi kimlik hücresinde (yana kayarken yapışık kalır); kayıtlı yer kesilir, tamamı ipucunda.
function satirSutunlari(x: { coz: Coz; secim: ReadonlySet<number>; sec: (ids: number[], acik: boolean) => void; adet: (s: SeriSatiri, adet: string) => void; sil: (s: SeriSatiri) => void }): Sutun<SeriSatiri>[] {
  const ad = (s: SeriSatiri) => satirAdi(s, x.coz(s.kod));
  return [
    { anahtar: 'ad', baslik: 'Okunan', sabit: 'sol', kes: true, csv: (s) => ad(s).ad, hucre: (s) => (
      <span className="tc-stok-ambalaj-hucre" data-tur={seriTuru(s.kod)}>
        {secilebilir(s) && <input type="checkbox" aria-label={`Seç ${ad(s).ad}`} checked={x.secim.has(s.id)} onChange={(o) => x.sec([s.id], o.target.checked)} />}
        <span className="tc-stok-seri-tur"><Simge ad={SERI_SIMGESI[seriTuru(s.kod)]} /></span>{s.islendi === null ? <strong>{ad(s).ad}</strong> : <s>{ad(s).ad}</s>}
      </span>
    ) },
    { anahtar: 'kayit', baslik: 'Kayıt', kes: true, hucre: (s) => (s.islendi === null ? ad(s).alt : `İşlendi · ${zamanMetni(s.islendi)}`) },
    { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', csv: (s) => s.adet, hucre: (s) => (s.adet !== null && s.islendi === null
      ? <AdetGirdisi key={`${s.id}-${s.adet}`} s={s} ad={ad(s).ad} adet={(a) => x.adet(s, a)} />
      : <span className="tc-stok-mono">{s.adet ?? ''}</span>) },
    { anahtar: 'sil', baslik: '', sabit: 'sag', csv: false, hucre: (s) => (s.islendi === null ? <Dugme simge="trash" aria-label={`Sil ${ad(s).ad}`} onClick={() => x.sil(s)} /> : <span />) },
  ];
}

function AdetGirdisi({ s, ad, adet }: { s: SeriSatiri; ad: string; adet: (a: string) => void }) {
  const [deger, setDeger] = useState(s.adet ?? '');
  return (
    <input className="tc-alan-kutu tc-stok-seri-adet" inputMode="decimal" aria-label={`Adet ${ad}`} value={deger} onChange={(o) => setDeger(o.target.value)}
      onBlur={() => { const v = deger.trim().replace(',', '.'); if (v !== s.adet && /^\d{1,11}(\.\d{1,3})?$/.test(v)) adet(v); }} />
  );
}
