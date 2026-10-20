import { useState } from 'react';
import type { Adim, Bagimlilik, MalzemeAraCevabi, RevizyonAyrintisi, SeceneklerCevabi, UrunOzeti as MalzemeOzeti } from '#paylasilan/sozlesme/rota.ts';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { MetinAlani, SayiAlani } from './Alanlar.tsx';
import {
  BIRIM_ELLE, adayEkle, adaySil, adayYaz, alanYaz, bagimlilikDegistir, bilesenEkle, bilesenSil, bilesenYaz, cogalt, kataloguUygula, sil, tipDegistir, tipUygula, yanUrunEkle, yanUrunSil, yanUrunYaz,
  type KatalogTipi,
} from './duzenleme.ts';
import {
  adimKaynagiCoz, adimSuresiMetni, birimMetni, kaynakAdi, kaynakAnahtari, kaynakAyrinti, kaynakCoz, BAGIMLILIK_ACIKLAMA, BAGIMLILIK_ETIKETI, DURUM_ETIKETI, araHalAdi, kartAdi, sayiMetni, sureMetni,
} from './gorunum.ts';
import type { Secim } from './secim.ts';
import type { Degisiklik } from './useRotaCalisma.ts';

interface Ozellikler {
  secim: Secim;
  ayrinti: RevizyonAyrintisi;
  secenekler: SeceneklerCevabi;
  duzen: boolean;
  salt: string | null;
  degistir: (d: Degisiklik) => void;
  kapat: () => void;
  listedenSec: (opNo: number, tur: 'bilesen' | 'yan') => void;
  listedenDegistir: (opNo: number, malzemeId: number) => void;
  // Katalogda olmayan operasyonu tanımlar (istasyonlar kataloğu); yetkisi olmayana null.
  tipTanimla: ((g: YeniTip) => Promise<KatalogTipi | null>) | null;
  talimatAc: (adim: Adim) => void;
  // Yüzen kartta bölümler sekmelidir; aynı anda biri görünür.
  kompakt?: boolean;
}

// Koddan hızlı ekleme: tek kart eşleşirse doğrudan eklenir, birden çoksa liste çıkar.
function HizliEkle({ etiket, ekle, listedenSec, disabled }: {
  etiket: string; ekle: (m: MalzemeOzeti, miktar: number) => void; listedenSec: () => void; disabled: boolean;
}) {
  const [metin, metinYaz] = useState('');
  const [miktar, miktarYaz] = useState('1');
  const [adaylar, adaylarYaz] = useState<MalzemeOzeti[] | null>(null);
  const [ileti, iletiYaz] = useState<string | null>(null);
  const sayi = Number(miktar.replace(',', '.'));
  const ara = async () => {
    if (metin.trim() === '') return;
    const c = await api.get<MalzemeAraCevabi>(`/rota/malzeme-ara?${new URLSearchParams({ metin: metin.trim() }).toString()}`);
    const tam = c.satirlar.filter((m) => m.stokKodu?.toLocaleUpperCase('tr-TR') === metin.trim().toLocaleUpperCase('tr-TR'));
    const secilen = tam.length === 1 ? tam : c.satirlar;
    if (secilen.length === 1 && secilen[0]) { ekle(secilen[0], sayi > 0 ? sayi : 1); metinYaz(''); adaylarYaz(null); iletiYaz(null); }
    else if (secilen.length === 0) { iletiYaz('Kullanımda bu kodla kart yok.'); adaylarYaz(null); }
    else { adaylarYaz(secilen.slice(0, 8)); iletiYaz(null); }
  };
  return (
    <div className="tc-hizli">
      <div className="tc-hizli-satir">
        <input className="tc-inp" aria-label={`${etiket}: kod ya da ad`} placeholder="Kod ya da ad" value={metin} disabled={disabled}
          onChange={(o) => metinYaz(o.target.value)} onKeyDown={(o) => { if (o.key === 'Enter') void ara(); }} />
        <input className="tc-inp tc-inp-kisa" aria-label={`${etiket}: miktar`} inputMode="decimal" value={miktar} disabled={disabled} onChange={(o) => miktarYaz(o.target.value)} />
        <Dugme simge="plus" disabled={disabled} onClick={() => void ara()}>Ekle</Dugme>
      </div>
      <button type="button" className="tc-baglanti" disabled={disabled} onClick={listedenSec}>Listeden seç…</button>
      {ileti && <p className="tc-rota-hata">{ileti}</p>}
      {adaylar && (
        <ul className="tc-hizli-liste" aria-label="Eşleşen kartlar">
          {adaylar.map((m) => (
            <li key={m.id}><button type="button" className="tc-baglanti" onClick={() => { ekle(m, sayi > 0 ? sayi : 1); adaylarYaz(null); metinYaz(''); }}>{kartAdi(m)}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Kısaltma ve varsayılan süreler sorulmaz: kod kısaltmadır, süreler adımda girilir (kart #544).
export interface YeniTip { kod: string; ad: string; grup: KatalogTipi['grup'] }

// Prototipin "Yeni operasyon tanımla" kutusu: kataloğa eklenir ve seçili adımın tipi olur.
function TipTanimla({ tipler, tanimla, uygula }: { tipler: readonly KatalogTipi[]; tanimla: (g: YeniTip) => Promise<KatalogTipi | null>; uygula: (t: KatalogTipi) => void }) {
  const sonraki = () => { let n = tipler.length + 1; while (tipler.some((t) => t.kod === `OP${n}`)) n += 1; return `OP${n}`; };
  const [g, gYaz] = useState<YeniTip>(() => ({ kod: sonraki(), ad: '', grup: tipler[0]?.grup ?? 'TAL' }));
  const gruplar = [...new Map(tipler.map((t) => [t.grup, t.grupAdi])).entries()];
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);
  const kaydet = async () => {
    if (g.ad.trim() === '') { hataYaz('Operasyona bir ad ver.'); return; }
    bekliyorYaz(true);
    const t = await tanimla({ ...g, ad: g.ad.trim(), kod: g.kod.trim() || sonraki() });
    bekliyorYaz(false);
    if (t) uygula(t); else hataYaz('Operasyon tanımlanamadı.');
  };
  return (
    <div className="tc-insp-form" aria-label="Yeni operasyon tanımla">
      <div className="tc-insp-iki">
        <label className="tc-f"><span>Kod</span><input className="tc-inp" value={g.kod} onChange={(o) => gYaz({ ...g, kod: o.target.value })} /></label>
        {gruplar.length > 0 && (
          <label className="tc-f"><span>Grup</span>
            <select className="tc-inp" value={g.grup} onChange={(o) => gYaz({ ...g, grup: o.target.value as YeniTip['grup'] })}>
              {gruplar.map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}
            </select>
          </label>
        )}
      </div>
      <label className="tc-f"><span>Ad</span><input className="tc-inp" placeholder="Lazer kesim" value={g.ad} onChange={(o) => gYaz({ ...g, ad: o.target.value })} /></label>
      {hata && <p className="tc-rota-hata">{hata}</p>}
      <Dugme tur="birincil" simge="plus" disabled={bekliyor} onClick={() => void kaydet()}>Tanımla ve adıma ekle</Dugme>
    </div>
  );
}

const BAGLAR = Object.keys(BAGIMLILIK_ETIKETI) as Bagimlilik[];

type Sekme = 'operasyon' | 'iliski' | 'girenler' | 'yan' | 'istasyonlar' | 'talimat';
const SEKMELER: [Sekme, string][] = [['operasyon', 'Operasyon'], ['iliski', 'İlişki'], ['girenler', 'Girenler'], ['yan', 'Yan ürün'], ['istasyonlar', 'Adaylar'], ['talimat', 'Talimat']];

export function AdimPaneli({ secim, ayrinti, secenekler, duzen, salt, degistir, kapat, listedenSec, listedenDegistir, tipTanimla, talimatAc, kompakt = false }: Ozellikler) {
  const [sekme, sekmeYaz] = useState<Sekme>('operasyon');
  const [tanim, tanimYaz] = useState(false);
  const goster = (k: Sekme) => !kompakt || sekme === k;
  const urun = ayrinti.urun;
  if (secim.tur === 'urun') {
    const r = ayrinti.revizyon;
    return (
      <div className="tc-insp-ic">
        <div className="tc-insp-hd"><b>{kartAdi(urun)}</b><button type="button" className="tc-ib" onClick={kapat} aria-label="Paneli kapat">✕</button></div>
        <dl className="tc-rota-ozellik">
          <dt>Tür</dt><dd>Mamul</dd>
          <dt>Stok birimi</dt><dd>{urun.stokBirimi ?? 'malzeme kartında'}</dd>
          <dt>Gösterilen</dt><dd>Rev {r.harf} · {DURUM_ETIKETI[r.durum]}</dd>
          <dt>Miktar</dt><dd>{sayiMetni(ayrinti.miktar)} {birimMetni(urun.stokBirimi)}</dd>
          <dt>Toplam süre</dt><dd>{sureMetni(ayrinti.ozet.toplamTeorikSureDk)} ({ayrinti.ozet.adimSayisi} adım)</dd>
        </dl>
        <p className="tc-rota-ipucu">Kart bilgileri Malzeme Kartları sayfasındadır; rota ekranı kartı yalnız gösterir.</p>
      </div>
    );
  }
  const adimlar = ayrinti.adimlar;
  const i = adimlar.findIndex((a) => a.opNo === secim.opNo);
  const a = adimlar[i];
  if (!a) {
    return (
      <div className="tc-insp-ic">
        <div className="tc-insp-hd"><b>Adım bulunamadı</b><button type="button" className="tc-ib" onClick={kapat} aria-label="Paneli kapat">✕</button></div>
        <p className="tc-rota-ipucu">Seçilen adım bu revizyonda yok.</p>
      </div>
    );
  }
  const op = a.opNo;
  const kapali = !duzen;
  const fason = a.kaynak?.tur === 'fason';

  if (secim.tur === 'bilesen' || secim.tur === 'yan') {
    const bil = secim.tur === 'bilesen' ? a.bilesenler.find((x) => x.malzeme.id === secim.malzemeId) : undefined;
    const yan = secim.tur === 'yan' ? a.yanUrunler.find((x) => x.malzeme.id === secim.malzemeId) : undefined;
    const kart = bil?.malzeme ?? yan?.malzeme;
    if (!kart) return null;
    return (
      <div className="tc-insp-ic">
        <div className="tc-insp-hd"><b>{kartAdi(kart)}</b><button type="button" className="tc-ib" onClick={kapat} aria-label="Paneli kapat">✕</button></div>
        {salt && <p className="tc-rota-ipucu">{salt}</p>}
        <p className="tc-rota-ipucu">{bil ? 'Giren' : 'Yan ürün'} · OP {op} {a.ad}</p>
        <h3>{bil ? 'Bu adımdaki kullanım' : 'Bu adımdan çıkış'}</h3>
        <div className="tc-insp-form">
          <label className="tc-f"><span>Miktar (bir adet için, {birimMetni(kart.stokBirimi)})</span>
            <SayiAlani etiket="Miktar" deger={Number(bil?.miktar ?? yan?.miktar)} bosOlabilir={false} disabled={kapali}
              kaydet={(m) => { if (m !== null) degistir(bil ? bilesenYaz(op, kart.id, { miktar: m }) : yanUrunYaz(op, kart.id, m)); }} />
          </label>
          {bil && (
            <>
              <label className="tc-f"><span>Fire (%)</span>
                <SayiAlani etiket="Fire yüzdesi" deger={Number(bil.fireYuzde)} bosOlabilir={false} disabled={kapali}
                  kaydet={(f) => { if (f !== null) degistir(bilesenYaz(op, kart.id, { fireYuzde: f })); }} />
              </label>
              <p className="tc-rota-ipucu">Gösterilen miktar için toplam: {sayiMetni(bil.toplamMiktar)} {birimMetni(kart.stokBirimi)}</p>
            </>
          )}
          {bil && <Dugme simge="list" disabled={kapali} onClick={() => listedenDegistir(op, kart.id)}>Listeden değiştir</Dugme>}
          <Dugme tur="tehlike" simge="trash" disabled={kapali}
            onClick={() => { degistir(bil ? bilesenSil(op, kart.id) : yanUrunSil(op, kart.id)); kapat(); }}>Adımdan çıkar</Dugme>
        </div>
      </div>
    );
  }

  const tipler = secenekler.operasyonTipleri.filter((t) => t.aktif || t.id === a.operasyonTipi.id);
  const katalog = secenekler.operasyonTipleri.find((t) => t.id === a.operasyonTipi.id);
  const sayi = (m: string | null) => (m === null ? null : Number(m));
  const katalogdanFarkli = katalog !== undefined && (katalog.varsayilanAyarDk !== null || katalog.varsayilanBirimDk !== null)
    && (sayi(katalog.varsayilanAyarDk) !== sayi(a.ayarSuresiDk) || sayi(katalog.varsayilanBirimDk) !== sayi(a.birimSureDk));
  // Kaynak seçimi istasyonlara göre gruplu: altında makineler ve kişiler; istasyonu bilinmeyen kişiler ayrı grupta.
  const kullanilan = new Set([kaynakAnahtari(a.kaynak), ...a.adaylar.map((x) => kaynakAnahtari(x.kaynak))]);
  const kaynakSecenekleri = (haric: ReadonlySet<string>) => (
    <>
      {secenekler.istasyonlar.filter((i) => i.aktif && (i.makineler.length > 0 || i.kisiler.length > 0)).map((i) => (
        <optgroup key={i.id} label={`${i.kod} ${i.ad}`}>
          {[...i.makineler, ...i.kisiler].filter((k) => !haric.has(kaynakAnahtari(k))).map((k) => (
            <option key={kaynakAnahtari(k)} value={kaynakAnahtari(k)}>{k.tur === 'makine' ? 'Makine' : 'Kişi'}: {kaynakAdi(k)}</option>
          ))}
        </optgroup>
      ))}
      {secenekler.istasyonsuzKisiler.length > 0 && (
        <optgroup label="Kişiler (istasyonu belirtilmemiş)">
          {secenekler.istasyonsuzKisiler.filter((k) => !haric.has(kaynakAnahtari(k))).map((k) => (
            <option key={kaynakAnahtari(k)} value={kaynakAnahtari(k)}>Kişi: {kaynakAdi(k)}</option>
          ))}
        </optgroup>
      )}
    </>
  );
  return (
    <div className="tc-insp-ic">
      <div className="tc-insp-hd">
        <b>OP {op} · {a.ad}</b>
        <button type="button" className="tc-ib" onClick={kapat} aria-label="Paneli kapat">✕</button>
      </div>
      {salt && <p className="tc-rota-ipucu">{salt}</p>}
      <p className="tc-rota-ipucu">{sayiMetni(a.adimMiktari)} {birimMetni(urun.stokBirimi)} işler · {adimSuresiMetni(a)} · çıktı: {a.akis.cikti.tur === 'urun' ? kartAdi(urun) : araHalAdi(urun, a)}</p>
      {kompakt && (
        <div className="tc-kart-sekmeler" role="tablist" aria-label="Adım bölümleri">
          {SEKMELER.map(([k, ad]) => (
            <button key={k} type="button" role="tab" aria-selected={sekme === k} onClick={() => sekmeYaz(k)}>{ad}</button>
          ))}
        </div>
      )}

      {goster('iliski') && (
      <section className="tc-insp-bolum" aria-label="Önceki adımla ilişki">
        <h3>Önceki adımla</h3>
        {i === 0 ? <p className="tc-rota-ipucu">İlk adım: önceki adımı yoktur.</p> : (
          <>
            <div className="tc-bigdep" role="group" aria-label="Önceki adımla ilişki">
              {BAGLAR.map((b) => (
                <button key={b} type="button" className={`tc-dep-${b}`} aria-pressed={a.bagimlilik === b} disabled={kapali}
                  onClick={() => degistir(bagimlilikDegistir(op, b))}>
                  <b>{BAGIMLILIK_ETIKETI[b]}</b><small>{BAGIMLILIK_ACIKLAMA[b]}</small>
                </button>
              ))}
            </div>
            {a.bagimlilik === 'akisli' && (
              <label className="tc-f"><span>Devir adedi (kaç parça birikince)</span>
                <SayiAlani etiket="Devir adedi" deger={a.devirAdedi} bosOlabilir={false} disabled={kapali}
                  kaydet={(d) => { if (d !== null) degistir(alanYaz(op, { devirAdedi: Math.round(d) })); }} />
              </label>
            )}
          </>
        )}
      </section>
      )}

      {goster('girenler') && (
      <section className="tc-insp-bolum" aria-label="Girenler">
        <h3>Girenler</h3>
        <ul className="tc-insp-liste">
          {a.akis.tuketir.map((t) => {
            const k = adimlar.find((x) => x.opNo === t);
            return <li key={`f${t}`} className="tc-insp-arahal">{k ? araHalAdi(urun, k) : `OP ${t}`} <small>önceki adımdan</small></li>;
          })}
          {a.bilesenler.map((b) => (
            <li key={b.malzeme.id} className="tc-insp-satir">
              <span className="tc-insp-ad">{kartAdi(b.malzeme)}</span>
              <SayiAlani etiket={`${b.malzeme.ad} miktarı`} sinif="tc-inp-kisa" deger={Number(b.miktar)} bosOlabilir={false} disabled={kapali}
                kaydet={(m) => { if (m !== null) degistir(bilesenYaz(op, b.malzeme.id, { miktar: m })); }} />
              <SayiAlani etiket={`${b.malzeme.ad} fire yüzdesi`} sinif="tc-inp-kisa" deger={Number(b.fireYuzde)} bosOlabilir={false} disabled={kapali}
                kaydet={(f) => { if (f !== null) degistir(bilesenYaz(op, b.malzeme.id, { fireYuzde: f })); }} />
              <button type="button" className="tc-ib tc-ib-sil" disabled={kapali} onClick={() => degistir(bilesenSil(op, b.malzeme.id))} aria-label={`${b.malzeme.ad} çıkar`}>✕</button>
            </li>
          ))}
        </ul>
        <HizliEkle etiket="Giren" disabled={kapali} ekle={(m, miktar) => degistir(bilesenEkle(op, m.id, miktar))} listedenSec={() => listedenSec(op, 'bilesen')} />
      </section>
      )}

      {goster('yan') && (
      <section className="tc-insp-bolum" aria-label="Yan ürünler">
        <h3>Yan ürünler</h3>
        <ul className="tc-insp-liste">
          {a.yanUrunler.map((y) => (
            <li key={y.malzeme.id} className="tc-insp-satir">
              <span className="tc-insp-ad">{kartAdi(y.malzeme)}</span>
              <SayiAlani etiket={`${y.malzeme.ad} miktarı`} sinif="tc-inp-kisa" deger={Number(y.miktar)} bosOlabilir={false} disabled={kapali}
                kaydet={(m) => { if (m !== null) degistir(yanUrunYaz(op, y.malzeme.id, m)); }} />
              <button type="button" className="tc-ib tc-ib-sil" disabled={kapali} onClick={() => degistir(yanUrunSil(op, y.malzeme.id))} aria-label={`${y.malzeme.ad} çıkar`}>✕</button>
            </li>
          ))}
        </ul>
        <HizliEkle etiket="Yan ürün" disabled={kapali} ekle={(m, miktar) => degistir(yanUrunEkle(op, m.id, miktar))} listedenSec={() => listedenSec(op, 'yan')} />
      </section>
      )}

      {goster('operasyon') && (
      <section className="tc-insp-bolum" aria-label="Operasyon ve kaynak">
        <h3>Operasyon ve kaynak</h3>
        <div className="tc-insp-form">
          <label className="tc-f"><span>Operasyon tipi</span>
            <select className="tc-inp" value={a.operasyonTipi.id} disabled={kapali} onChange={(o) => {
              const yeni = tipler.find((t) => t.id === Number(o.target.value));
              if (yeni) degistir(tipDegistir(op, yeni, a.operasyonTipi.ad));
            }}>
              {[...new Set(tipler.map((t) => t.grupAdi))].map((grup) => (
                <optgroup key={grup} label={grup}>
                  {tipler.filter((t) => t.grupAdi === grup).map((t) => <option key={t.id} value={t.id}>{t.kod} · {t.ad}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {duzen && tipTanimla && (
            <button type="button" className="tc-baglanti" aria-expanded={tanim} onClick={() => tanimYaz((x) => !x)}>
              {tanim ? 'Yeni operasyon tanımlamaktan vazgeç' : '+ Katalogda yok: yeni operasyon tanımla'}
            </button>
          )}
          {duzen && tipTanimla && tanim && (
            <TipTanimla tipler={secenekler.operasyonTipleri} tanimla={tipTanimla} uygula={(t) => { degistir(tipUygula(op, t)); tanimYaz(false); }} />
          )}
          <label className="tc-f"><span>Adım adı</span><MetinAlani etiket="Adım adı" deger={a.ad} disabled={kapali} kaydet={(ad) => degistir(alanYaz(op, { ad }))} /></label>
          <label className="tc-f"><span>Makine, kişi ya da fason firma</span>
            <select className="tc-inp" value={kaynakAnahtari(a.kaynak)} disabled={kapali}
              onChange={(o) => {
                const k = adimKaynagiCoz(o.target.value);
                // Fason adım süresiz, termin günüyle, adaysız ve tek parça (RT-69); fasondan çıkan adımın termini düşer.
                degistir(alanYaz(op, k?.tur === 'fason'
                  ? { kaynak: k, ayarSuresiDk: null, birimSureDk: null, adaylar: [], makineKullanimi: 'tek', enKucukParca: null }
                  : { kaynak: k, terminGun: null }));
              }}>
              <option value="">Atanmadı (planlama atar)</option>
              {a.kaynak && !a.kaynak.aktif && <option value={kaynakAnahtari(a.kaynak)}>{kaynakAyrinti(a.kaynak)} (kullanımda değil)</option>}
              {kaynakSecenekleri(new Set(a.adaylar.map((x) => kaynakAnahtari(x.kaynak))))}
              {secenekler.fasonFirmalar.length > 0 && (
                <optgroup label="Fason firmalar">
                  {secenekler.fasonFirmalar.map((f) => <option key={kaynakAnahtari(f)} value={kaynakAnahtari(f)}>Fason: {kaynakAdi(f)}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          {a.kaynak && <p className="tc-rota-ipucu">{kaynakAyrinti(a.kaynak)}</p>}
          {fason ? (
            <>
              <label className="tc-f"><span>Termin (takvim günü)</span>
                <SayiAlani etiket="Termin günü" deger={a.terminGun} disabled={kapali} kaydet={(v) => degistir(alanYaz(op, { terminGun: v === null ? null : Math.round(v) }))} />
              </label>
              <label className="tc-f"><span>Alınan hizmet kartı</span>
                <select className="tc-inp" disabled value=""><option value="">Malzemelerde hizmet türü bekleniyor</option></select>
              </label>
            </>
          ) : (
          <div className="tc-insp-iki">
            <label className="tc-f"><span>Hazırlık süresi (dk)</span>
              <SayiAlani etiket="Hazırlık süresi" deger={a.ayarSuresiDk === null ? null : Number(a.ayarSuresiDk)} disabled={kapali} kaydet={(v) => degistir(alanYaz(op, { ayarSuresiDk: v }))} />
            </label>
            <label className="tc-f"><span>Birim süre (dk/adet)</span>
              <SayiAlani etiket="Birim süre" deger={a.birimSureDk === null ? null : Number(a.birimSureDk)} disabled={kapali} kaydet={(v) => degistir(alanYaz(op, BIRIM_ELLE(v)))} />
            </label>
          </div>
          )}
          {!fason && katalogdanFarkli && katalog && (
            <Dugme simge="rotate" disabled={kapali} onClick={() => degistir(kataloguUygula(op, katalog))}>Katalog değerlerine dön ({katalog.kod})</Dugme>
          )}
          <label className="tc-f"><span>Fire / ret payı (%)</span>
            <SayiAlani etiket="Fire payı" deger={Number(a.firePayiYuzde)} bosOlabilir={false} disabled={kapali} kaydet={(v) => { if (v !== null) degistir(alanYaz(op, { firePayiYuzde: v })); }} />
          </label>
        </div>
      </section>
      )}

      {goster('istasyonlar') && !fason && (
      <section className="tc-insp-bolum" aria-label="Aday kaynaklar">
        <h3>Aday makine ve kişiler</h3>
        <ul className="tc-insp-liste">
          {a.adaylar.map((x) => {
            const ad = kaynakAdi(x.kaynak);
            const k = { tur: x.kaynak.tur, id: x.kaynak.id };
            return (
              <li key={kaynakAnahtari(x.kaynak)} className="tc-insp-satir">
                <span className="tc-insp-ad">{kaynakAyrinti(x.kaynak)}</span>
                <SayiAlani etiket={`${ad} hazırlık süresi`} sinif="tc-inp-kisa" deger={x.ayarSuresiDk === null ? null : Number(x.ayarSuresiDk)} disabled={kapali}
                  kaydet={(v) => degistir(adayYaz(op, k, { ayarSuresiDk: v }))} />
                <SayiAlani etiket={`${ad} birim süre`} sinif="tc-inp-kisa" deger={x.birimSureDk === null ? null : Number(x.birimSureDk)} disabled={kapali}
                  kaydet={(v) => degistir(adayYaz(op, k, BIRIM_ELLE(v)))} />
                <button type="button" className="tc-ib tc-ib-sil" disabled={kapali} onClick={() => degistir(adaySil(op, k))} aria-label={`${ad} çıkar`}>✕</button>
              </li>
            );
          })}
        </ul>
        {a.adaylar.length > 0 && <p className="tc-rota-ipucu">Boş süre adımın süresini alır.</p>}
        <select className="tc-inp" aria-label="Aday makine ya da kişi ekle" value="" disabled={kapali}
          onChange={(o) => { const k = kaynakCoz(o.target.value); if (k) degistir(adayEkle(op, k)); }}>
          <option value="">+ Aday makine ya da kişi ekle</option>
          {kaynakSecenekleri(kullanilan)}
        </select>
      </section>
      )}

      {goster('istasyonlar') && !fason && (
      <section className="tc-insp-bolum" aria-label="Makine kullanımı">
        <h3>Makine kullanımı</h3>
        <label className="tc-isaret-satir">
          <input type="checkbox" checked={a.yenidenAyar} disabled={kapali} onChange={(o) => degistir(alanYaz(op, { yenidenAyar: o.target.checked }))} />
          <span>Yarıda dönülürse ayar yeniden sayılır</span>
        </label>
      </section>
      )}

      {goster('talimat') && (
      <section className="tc-insp-bolum" aria-label="Talimat">
        <h3>Talimat</h3>
        <p className="tc-rota-metin">{a.talimat ? a.talimat.metin : 'Talimat yok.'}</p>
        <Dugme simge="list" onClick={() => talimatAc(a)}>{a.talimat ? `Talimat (sürüm ${a.talimat.surum})` : 'Talimat'}</Dugme>
      </section>
      )}

      {duzen && (
        <div className="tc-rota-dugmeler">
          <Dugme simge="layers" onClick={() => degistir(cogalt(op))}>Adımı çoğalt</Dugme>
          <Dugme tur="tehlike" simge="trash" onClick={() => { degistir(sil(op)); kapat(); }}>Adımı sil</Dugme>
        </div>
      )}
    </div>
  );
}
