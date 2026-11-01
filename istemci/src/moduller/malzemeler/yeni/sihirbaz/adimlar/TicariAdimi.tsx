import { useEffect, useState } from 'react';
import { Dugme } from '../../../../../ortak/arayuz/index.ts';
import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import type { Firma } from '../../tipler.ts';
import { firmaAra } from '../../veri.ts';
import { useSihirbaz } from '../baglam.ts';
import { Alanlar, Cip, CipGrubu, CokSatirAlani, MetinAlani, SecenekGrubu, SecimAlani } from '../parcalar.tsx';
import { GenelSecim } from './GenelAlanlar.tsx';

// Kodu sunucu verir (önek + sıra, #234 madde 10): alan salt okunurdur, "Otomatik" düğmesi yoktur.
function KodAlani() {
  const { taslak: d, b } = useSihirbaz();
  const etiket = K.isGen(d, b) ? 'Kod' : 'Malzeme kodu';
  return <MetinAlani etiket={etiket} deger={K.finalKod(d, b)} yaz={() => undefined} saltOkunur genis ipucu="Kodu sistem verir" kimlik="tc-my-kod" />;
}

function AdAlani() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const etiket = K.isGen(d, b) ? 'Ad' : 'Malzeme adı';
  return (
    <MetinAlani
      etiket={etiket} deger={K.finalAd(d, b)} genis
      yaz={(v) => { degistir((t) => { t.com.ad = String(v); t.adManual = true; }); }}
      sonEk={(
        <Dugme className="tc-my-otomatik" onClick={() => { degistir((t) => { t.adManual = false; t.com.ad = ''; }); }}>
          {d.adManual ? 'Otomatiğe dön' : 'Otomatik'}
        </Dugme>
      )}
    />
  );
}

// Prototipte `kodGrubuHTML`.
function KodGrubu() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const standart = b.genel.kodYapisi !== 'teknik';
  const grupKapali = !standart || K.firmaKodluTur(d, b);
  return (
    <>
      <MetinAlani
        etiket="Eski / ERP kodu" deger={d.com.eskiKod ?? ''} ipucu="varsa mevcut stok kodu"
        yaz={(v) => { degistir((t) => { t.com.eskiKod = String(v); }); }}
      />
      <MetinAlani
        etiket="Kod grubu" deger={d.com.grup ?? ''} enCok={3} saltOkunur={grupKapali} girdiSinifi="tc-my-buyuk"
        ipucu={K.kodGrubu({ ...d, com: { ...d.com, grup: '' } }, b)}
        yaz={(v) => { degistir((t) => { t.com.grup = K.asc(String(v), b).replace(/[^A-Z0-9]/g, '').slice(0, 3); }); }}
      />
      <p className="tc-my-kod-bilgi">
        {standart ? `Kod yapısı: tür-grup-sıra (${K.kodOnek(d, b)}${'0'.repeat(S.KOD_HANE)}). Sıra numarası kayıtta kesinleşir.` : 'Kod yapısı: teknik (anlamlı) kod.'}
        {' '}Teknik kod: <b>{K.teknikKod(d, b) || '—'}</b>
      </p>
    </>
  );
}

// TMI (kart #466): tedarikçi finanstaki firmadan seçilir; kart firmanın kimliğini (com.tedId) ve adını taşır.
// Seçilmemiş eski metin kartta kalır ve gösterilir.
export function TedarikciAlani() {
  const { taslak: d, degistir } = useSihirbaz();
  const [ara, araYaz] = useState('');
  const [sonuc, sonucYaz] = useState<{ durum: 'bos' | 'yukleniyor' | 'tamam' | 'hata'; liste: readonly Firma[] }>({ durum: 'bos', liste: [] });
  useEffect(() => {
    const m = ara.trim();
    if (m.length < 2) { sonucYaz({ durum: 'bos', liste: [] }); return undefined; }
    let gecerli = true;
    const z = setTimeout(() => {
      sonucYaz({ durum: 'yukleniyor', liste: [] });
      firmaAra(m).then((l) => { if (gecerli) sonucYaz({ durum: 'tamam', liste: l }); }, () => { if (gecerli) sonucYaz({ durum: 'hata', liste: [] }); });
    }, 250);
    return () => { gecerli = false; clearTimeout(z); };
  }, [ara]);

  if (d.com.tedId) {
    return (
      <MetinAlani
        etiket={<>Tedarikçi <small>— finanstaki firma</small></>} deger={d.com.ted ?? ''} saltOkunur yaz={() => undefined}
        sonEk={<Dugme className="tc-my-otomatik" onClick={() => { degistir((t) => { delete t.com.tedId; t.com.ted = ''; }); }}>Değiştir</Dugme>}
      />
    );
  }
  return (
    <div className="tc-my-alan">
      <MetinAlani
        etiket={<>Tedarikçi <small>— finanstaki firmayı adıyla arayın</small></>} tip="search" deger={ara} ipucu="En az 2 harf"
        yaz={(v) => { araYaz(String(v)); }}
        alt={d.com.ted ? <p className="tc-my-kucuk">Kayıtlı metin: {d.com.ted} (finanstan seçilmedi)</p> : undefined}
      />
      <div role="listbox" aria-label="Bulunan firmalar" className="tc-my-bulunan">
        {sonuc.durum === 'hata' && <p className="tc-my-kucuk">Firmalar okunamadı.</p>}
        {sonuc.durum === 'tamam' && !sonuc.liste.length && <p className="tc-my-kucuk">Bu adla finansta tedarikçi firma yok. Firma önce finansta açılır.</p>}
        {sonuc.liste.map((f) => (
          <button
            key={f.id} type="button" role="option" aria-selected={false} className="tc-my-bulunan-oge"
            onClick={() => { degistir((t) => { t.com.tedId = f.id; t.com.ted = f.ad; }); araYaz(''); }}
          >
            <b>{f.ad}</b>{f.kod && <small>{f.kod}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

// Stok birimi; birimi boş kayıtlı kart açılınca varsayılanla doldurulmaz, kullanıcıdan istenir (malzeme denetimi 3/5).
function StokBirimi({ liste }: { liste: readonly string[] }) {
  const { taslak: d, b, degistir } = useSihirbaz();
  return (
    <SecimAlani
      etiket="Stok birimi" deger={K.finalBirim(d, b)} secenekler={liste} istenir={K.birimIstenir(d, b)} kimlik="tc-my-stok-birimi"
      yaz={(v) => { degistir((t) => { t.com.birim = v; }); }}
    />
  );
}

// 323 b: alış birimi ve katsayısı (1 alış birimi = katsayı kadar stok birimi); katsayı metin kalır, denetimi sunucu yapar.
function AlisBirimi() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const stok = K.finalBirim(d, b);
  const secili = String(d.com.alisBirimi ?? '').trim();
  const liste = [...new Set([...b.t.BIRIMLER, ...Object.values(S.BIRIM_T).flat()])].filter((x) => x !== stok);
  if (secili && !liste.includes(secili)) liste.push(secili);
  const katsayi = d.com.alisKatsayisi === undefined || d.com.alisKatsayisi === null ? '' : String(d.com.alisKatsayisi);
  return (
    <>
      <SecimAlani etiket="Alış birimi" deger={secili} secenekler={liste} bos="Yok" yaz={(v) => { degistir((t) => { t.com.alisBirimi = v; }); }} />
      <MetinAlani
        etiket={`1 alış birimi = kaç ${stok}`} deger={katsayi} ipucu="ör. 50"
        yaz={(v) => { degistir((t) => { t.com.alisKatsayisi = String(v); }); }}
      />
    </>
  );
}

function Sertifikalar() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const sec = d.com.sertifika ?? [];
  return (
    <SecenekGrubu baslik="Sertifika ve uygunluk">
      <CipGrubu etiket="Sertifika ve uygunluk">
        {(b.t.SERTIFIKA as string[]).map((x) => (
          <Cip
            key={x} basili={sec.includes(x)}
            tikla={() => { degistir((t) => { const a = new Set(t.com.sertifika ?? []); if (a.has(x)) a.delete(x); else a.add(x); t.com.sertifika = [...a]; }); }}
          >{x}
          </Cip>
        ))}
      </CipGrubu>
    </SecenekGrubu>
  );
}

// 1247 d: satın alma kabulünde lot karantinaya girer, kararı giriş kalite kontrolü verir. Kartta yazılı değilse türün varsayılanı geçer
// (sunucudaki GKK_VARSAYILAN_TURLER ile aynı); demirbaş ve hizmette alan yoktur.
const GKK_VARSAYILAN: readonly string[] = ['hammadde', 'yarimamul', 'ticari_mal'];
function GirisKontrolu() {
  const { taslak: d, degistir } = useSihirbaz();
  const acik = d.com.gkk ?? GKK_VARSAYILAN.includes(d.tur);
  return (
    <SecenekGrubu baslik="Giriş kalite kontrolü">
      <CipGrubu etiket="Giriş kalite kontrolü">
        <Cip basili={acik} tikla={() => { degistir((t) => { t.com.gkk = !acik; }); }}>GKK gerekli</Cip>
      </CipGrubu>
      <p className="tc-my-kucuk">Açıksa satın alınan lot karantinaya girer; kalite kararından sonra kullanılır.</p>
    </SecenekGrubu>
  );
}

function Notlar({ ipucu }: { ipucu: string }) {
  const { taslak: d, degistir } = useSihirbaz();
  return <CokSatirAlani etiket="Notlar" deger={d.com.not} ipucu={ipucu} yaz={(v) => { degistir((t) => { t.com.not = v; }); }} />;
}

// Kayıtlı belgeler yalnız listelenir: belge yükleme TMI'de çalışmıyor, taşınmaz (envanter 9).
export function Belgeler() {
  const { taslak: d, b } = useSihirbaz();
  const l = d.docs ?? [];
  if (!l.length) return null;
  return (
    <SecenekGrubu baslik="Belgeler" sayac={undefined}>
      <ul className="tc-my-belgeler">
        {l.map((x) => <li key={x.id}><span>{x.ad}</span><span className="tc-my-soluk">{x.tip}</span><span className="tc-my-soluk">{K.fmtSize(x.size, b)}</span></li>)}
      </ul>
    </SecenekGrubu>
  );
}

// Hammadde 6. adım (prototipte `s5` + alış birimi eki).
export function TicariAdimi() {
  const { taslak: d, b, degistir } = useSihirbaz();
  return (
    <>
      <Alanlar>
        <KodAlani />
        <AdAlani />
        <KodGrubu />
        <MetinAlani
          etiket="Standart / norm" deger={d.com.std} ipucu={K.autoStd(d, b) || 'ör. EN 10088-2'}
          yaz={(v) => { degistir((t) => { t.com.std = String(v); }); }}
        />
        <TedarikciAlani />
        <StokBirimi liste={b.t.BIRIMLER} />
        <AlisBirimi />
      </Alanlar>
      <Sertifikalar />
      <GirisKontrolu />
      <Notlar ipucu="Depo yeri, kullanım alanı, özel uyarılar" />
      <Belgeler />
    </>
  );
}

// Öteki türlerin ticari adımı (prototipte `gTicariHTML` + alış birimi eki).
export function GenelTicari() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const t = d.tur;
  const gYaz = (k: string) => (v: string | number) => { degistir((x) => { x.g = { ...x.g, [k]: v }; }); };
  return (
    <>
      <Alanlar>
        <KodAlani />
        <AdAlani />
        <KodGrubu />
        <StokBirimi liste={S.BIRIM_T[t] ?? ['adet']} />
        <AlisBirimi />
        {t === 'sarf' && (
          <>
            <MetinAlani etiket="Marka" deger={d.g.marka} yaz={gYaz('marka')} />
            <MetinAlani etiket="Üretici ürün kodu" deger={d.g.urunKodu} yaz={gYaz('urunKodu')} />
          </>
        )}
        {t === 'ticari_mal' && <MetinAlani etiket="Üretici ürün kodu" deger={d.g.urunKodu} yaz={gYaz('urunKodu')} />}
        {t !== 'mamul' && (t !== 'hizmet' || d.g.yon === 'Alınan') && <TedarikciAlani />}
        {t !== 'hizmet' && (
          // Depo yeri stok modülünün malzeme ayarındadır (köprü `depoYeriStoktan`); burada yalnız görünür.
          <MetinAlani etiket={<>Depo yeri <small>(Stok &gt; malzeme ayarından)</small></>} deger={d.g.depoYeri} saltOkunur yaz={() => undefined} />
        )}
        {(t === 'mamul' || t === 'ticari_mal') && (
          <>
            <MetinAlani
              etiket="Barkod (GTIN / EAN)" deger={d.g.gtin ?? ''} ipucu="13 hane" yaz={gYaz('gtin')}
              sonEk={d.g.gtin ? <span className="tc-my-birim">{K.gtinGecerli(String(d.g.gtin), b) ? '✓ geçerli' : 'geçersiz'}</span> : undefined}
            />
            <MetinAlani etiket="GTİP (HS kodu)" deger={d.g.gtip} ipucu="ör. 8412.21" yaz={gYaz('gtip')} />
            <MetinAlani etiket="Menşei" deger={d.g.mensei ?? 'Türkiye'} yaz={gYaz('mensei')} />
          </>
        )}
      </Alanlar>
      {(t === 'yarimamul' || t === 'mamul') && <GenelSecim a={{ k: 'tedarik', ad: 'Tedarik tipi', tip: 'sec', opts: ['Üretim', 'Fason üretim', 'Satın alma'] }} />}
      {t !== 'demirbas' && t !== 'hizmet' && <Sertifikalar />}
      {t !== 'demirbas' && t !== 'hizmet' && <GirisKontrolu />}
      {(t === 'yarimamul' || t === 'mamul') && <RotaOzeti />}
      <Notlar ipucu="Kullanım yeri, uyarılar" />
      <Belgeler />
    </>
  );
}

export function RotaOzeti() {
  const { taslak: d, b } = useSihirbaz();
  const ops = d.ops ?? [];
  return (
    <div className="tc-my-canli">
      <div><small>Rota</small><b>{ops.length} operasyon</b></div>
      {ops.length > 0 && <div><small>Akış</small><b>{K.rota(d, b).map((r) => r.kod || r.ad).join(' › ')}</b></div>}
    </div>
  );
}
