import { useState } from 'react';
import { Dugme, Girdi, Pencere, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { duzenlemeAcar } from '../yetki.ts';
import { acikRevizyon, sirali } from './kurallar.ts';
import type { RotaEkrani } from './ortak.tsx';
import { benzerUrun, KONUM_ADI, katalogSuresi, onerilenler, sade, type EklemeKonumu, type RotaSablonu } from './sablonSecimi.ts';
import { useRotaSablonKomutu, useRotaSablonlari } from './sablonVerisi.ts';

// 3273 a (D): boş rotada iki önerilen şablon ve bir benzer ürün; "Başla" tek dokunuştur, ardından "Geri al" bildirimi gelir.
// Şablonlar okunamazsa ya da hiç yoksa benzer ürün ve boş başlama yine durur.

const adimOzeti = (s: RotaSablonu): string => {
  const l = [...s.adimlar].sort((a, b) => a.sira - b.sira).map((x) => x.operasyonTipi.kod);
  return l.length > 4 ? `${l.slice(0, 4).join(' › ')} +${String(l.length - 4)}` : l.join(' › ');
};

function IcineBak({ r, s }: { r: RotaEkrani; s: RotaSablonu }) {
  return (
    <ol className="tc-rr1-sb-adimlar" aria-label={`${s.ad} adımları`}>
      {[...s.adimlar].sort((a, b) => a.sira - b.sira).map((x) => {
        const op = r.duzen.h.op.get(String(x.operasyonTipi.id));
        const ist = op?.stationId ? r.duzen.h.istasyon.get(op.stationId)?.code ?? null : null;
        return (
          <li key={x.sira}>
            <b>{x.ad}</b> <span className="tc-rr1-ipucu">{op ? `${ist ?? 'istasyon yok'} · ${katalogSuresi(op)}` : 'katalogda yok, eklenmez'}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SablonKarti({ r, s, neden, basla, mesgul }: { r: RotaEkrani; s: RotaSablonu; neden: string; basla: () => void; mesgul: boolean }) {
  const [acik, setAcik] = useState(false);
  return (
    <div className="tc-rr1-sb-kart" role="group" aria-label={`${s.ad} şablonu`}>
      <span className="tc-rr1-sb-ad"><Simge ad="route" boyut="k" /> <b>{s.ad}</b>{s.varsayilan && <small> · varsayılan</small>}</span>
      <small className="tc-rr1-ipucu">{neden} · {String(s.adimlar.length)} adım</small>
      <span className="tc-rr1-sb-ozet">{adimOzeti(s)}</span>
      {acik && <IcineBak r={r} s={s} />}
      <span className="tc-rr1-sb-dugmeler">
        <Dugme tur="birincil" simge="play" yukleniyor={mesgul} onClick={basla}>Başla</Dugme>
        <Dugme tur="ikincil" simge="eye" aria-expanded={acik} onClick={() => { setAcik(!acik); }}>{acik ? 'Kapat' : `İçine bak: ${s.ad}`}</Dugme>
      </span>
    </div>
  );
}

export function SablonSecici({ r, urunId }: { r: RotaEkrani; urunId: string }) {
  const { duzen, yetki } = r;
  const yazabilir = duzenlemeAcar(yetki, acikRevizyon(duzen.revler(urunId)) !== null);
  const sorgu = useRotaSablonlari(yazabilir);
  const [galeri, setGaleri] = useState(false);
  const urun = duzen.h.malzeme.get(urunId);
  if (!yazabilir || !urun) return <div className="tc-rr1-noroute">Rota yok.</div>;
  const sablonlar = sorgu.data ?? [];
  const oneri = onerilenler(sablonlar, urun.name);
  const benzer = benzerUrun(urun, [...duzen.h.malzeme.values()], (id) => duzen.adimlar(id).length);
  const basla = (s: RotaSablonu) => { void duzen.sablondanBasla(urunId, s).then((ok) => { if (ok) setGaleri(false); }); };
  const aktifSayisi = sablonlar.filter((s) => s.aktif).length;
  return (
    <div className="tc-rr1-noroute tc-rr1-sb" role="region" aria-label="Rotaya başla">
      <p><b>Rota yok.</b> Hazır şablonla başla, benzer üründen kopyala ya da ilk adımı kendin ekle.</p>
      <div className="tc-rr1-sb-kartlar">
        {sorgu.isPending && <span className="tc-rr1-ipucu">Şablonlar okunuyor…</span>}
        {sorgu.isError && <span className="tc-rr1-ipucu" role="status"><Simge ad="alert" boyut="k" /> Şablonlar okunamadı.</span>}
        {sorgu.isSuccess && aktifSayisi === 0 && <span className="tc-rr1-ipucu">Şablon yok.{yetki.sablonYaz ? ' Rota şablonları sayfasından ekleyebilirsin.' : ''}</span>}
        {oneri.map((x) => <SablonKarti key={x.sablon.id} r={r} s={x.sablon} neden={x.neden} mesgul={duzen.mesgul} basla={() => { basla(x.sablon); }} />)}
        {benzer && (
          <div className="tc-rr1-sb-kart" role="group" aria-label="Benzer ürün">
            <span className="tc-rr1-sb-ad"><Simge ad="layers" boyut="k" /> <b>Benzer ürün: {benzer.urun.code}</b></span>
            <small className="tc-rr1-ipucu">{benzer.urun.name} · {String(duzen.adimlar(benzer.urun.id).length)} adım</small>
            <span className="tc-rr1-sb-dugmeler">
              <Dugme tur="ikincil" simge="layers" onClick={() => { duzen.kopyala(benzer.urun.id, urunId); }}>Rotasını kopyala</Dugme>
            </span>
          </div>
        )}
      </div>
      <span className="tc-rr1-sb-dugmeler">
        {aktifSayisi > 0 && <Dugme tur="ikincil" simge="grid" onClick={() => { setGaleri(true); }}>{`Bütün şablonlar (${String(aktifSayisi)})`}</Dugme>}
        <Dugme tur="ikincil" simge="plus" onClick={() => { r.sec({ tur: 'adimEkle', urunId, sonraId: null }); r.paletAc(); }}>Boş başla</Dugme>
      </span>
      <SablonPenceresi r={r} urunId={urunId} acik={galeri} kapat={() => { setGaleri(false); }} bos basla={basla} />
    </div>
  );
}

// Galeri ve dolu taslağa ekleme aynı penceredir: boş rotada konum sorulmaz.
export function SablonPenceresi({ r, urunId, acik, kapat, bos = false, basla, seciliId = null }: {
  r: RotaEkrani; urunId: string; acik: boolean; kapat: () => void; bos?: boolean; basla?: (s: RotaSablonu) => void; seciliId?: string | null;
}) {
  const sorgu = useRotaSablonlari(acik);
  const [ara, setAra] = useState('');
  const [secili, setSecili] = useState<number | null>(null);
  const [konum, setKonum] = useState<EklemeKonumu>(seciliId === null ? 'sona' : 'sonra');
  const urun = r.duzen.h.malzeme.get(urunId);
  const q = sade(ara);
  const liste = onerilenler(sorgu.data ?? [], urun?.name ?? '', Number.MAX_SAFE_INTEGER)
    .filter((x) => q === '' || sade(x.sablon.ad).includes(q) || x.sablon.oneriSozcukleri.some((z) => sade(z).includes(q)));
  const s = liste.find((x) => x.sablon.id === secili)?.sablon ?? liste[0]?.sablon ?? null;
  const uygula = () => {
    if (!s) return;
    if (bos && basla) { basla(s); return; }
    if (r.duzen.sablonEkle(urunId, s, konum, seciliId)) kapat();
  };
  return (
    <Pencere acik={acik} kapat={kapat} tur="yan" baslik={bos ? 'Bütün şablonlar' : 'Şablondan ekle'} alt={(
      <>
        <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge={bos ? 'play' : 'plus'} disabled={!s} yukleniyor={r.duzen.mesgul} onClick={uygula}>{bos ? 'Başla' : 'Ekle'}</Dugme>
      </>
    )}>
      <div className="tc-rr1-sb-pencere">
        <Girdi etiket="Şablon ara" value={ara} onChange={(e) => { setAra(e.target.value); }} placeholder="ad ya da öneri sözcüğü" />
        {sorgu.isError && <p role="status"><Simge ad="alert" boyut="k" /> Şablonlar okunamadı.</p>}
        {sorgu.isSuccess && liste.length === 0 && <p className="tc-rr1-ipucu">{ara ? 'Aramaya uyan şablon yok.' : 'Şablon yok.'}</p>}
        <div className="tc-rr1-sb-liste" role="radiogroup" aria-label="Şablonlar">
          {liste.map((x) => (
            <button key={x.sablon.id} type="button" role="radio" aria-checked={s?.id === x.sablon.id} className="tc-rr1-sb-satir"
              onClick={() => { setSecili(x.sablon.id); }}>
              <b>{x.sablon.ad}</b> <small className="tc-rr1-ipucu">{x.neden} · {String(x.sablon.adimlar.length)} adım · {adimOzeti(x.sablon)}</small>
            </button>
          ))}
        </div>
        {!bos && (
          <fieldset className="tc-rr1-sb-konum">
            <legend>Nereye eklensin?</legend>
            {(Object.keys(KONUM_ADI) as EklemeKonumu[]).map((k) => (
              <label key={k}>
                <input type="radio" name="sablon-konumu" value={k} checked={konum === k} disabled={k === 'sonra' && seciliId === null}
                  onChange={() => { setKonum(k); }} /> {KONUM_ADI[k]}
              </label>
            ))}
          </fieldset>
        )}
        {s && <><h4>{s.ad}</h4>{s.aciklama && <p>{s.aciklama}</p>}<IcineBak r={r} s={s} /></>}
      </div>
    </Pencere>
  );
}

// "Şablon olarak sakla": gösterilen rotanın operasyon sırası yeni şablon olur (giren, süre ve kaynak şablona girmez; sözleşme yalnız sıra ister).
export function SablonSaklaPenceresi({ r, urunId, acik, kapat }: { r: RotaEkrani; urunId: string; acik: boolean; kapat: () => void }) {
  const komut = useRotaSablonKomutu();
  const { bildir } = useBildirim();
  const urun = r.duzen.h.malzeme.get(urunId);
  const [ad, setAd] = useState('');
  const [sozcuk, setSozcuk] = useState('');
  const [aciklama, setAciklama] = useState('');
  const adimlar = sirali(r.duzen.adimlar(urunId)).filter((a) => a.opId !== '').map((a) => ({ operasyonTipiId: Number(a.opId), ad: a.name.trim() || (r.duzen.opAdi(a.opId) ?? '') }));
  const kaydet = () => {
    komut.mutate({ ad: 'ekle', govde: {
      ad: ad.trim(), aciklama: aciklama.trim() || null, adimlar,
      oneriSozcukleri: [...new Set(sozcuk.split(',').map((x) => x.trim()).filter((x) => x !== ''))],
    } }, {
      onSuccess: () => { bildir('tamam', `${ad.trim()} şablonu saklandı; boş rotalarda önerilir.`); setAd(''); setSozcuk(''); setAciklama(''); kapat(); },
      onError: (h) => { bildir('hata', `Şablon saklanamadı: ${h.message}`); },
    });
  };
  return (
    <Pencere acik={acik} kapat={kapat} baslik="Şablon olarak sakla" alt={(
      <>
        <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" disabled={ad.trim() === '' || adimlar.length === 0} yukleniyor={komut.isPending} onClick={kaydet}>Sakla</Dugme>
      </>
    )}>
      <p className="tc-rr1-ipucu">{`${urun?.code ?? ''} rotasının ${String(adimlar.length)} adımı operasyon sırasıyla saklanır; süre ve istasyon her kullanımda katalogdan gelir.`}</p>
      <Girdi etiket="Şablon adı" value={ad} maxLength={120} onChange={(e) => { setAd(e.target.value); }} />
      <Girdi etiket="Öneri sözcükleri" ipucu="Virgülle ayır; ürün adında geçerse şablon önerilir (ör. MİL, FLANŞ)." value={sozcuk}
        onChange={(e) => { setSozcuk(e.target.value); }} />
      <Girdi etiket="Açıklama" value={aciklama} maxLength={500} onChange={(e) => { setAciklama(e.target.value); }} />
    </Pencere>
  );
}
