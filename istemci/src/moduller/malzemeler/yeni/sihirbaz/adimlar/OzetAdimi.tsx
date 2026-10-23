import { useState } from 'react';
import { Dugme } from '../../../../../ortak/arayuz/index.ts';
import * as K from '../../kurallar/index.ts';
import type { Sablon } from '../../tipler.ts';
import { kayitHatasi, useSablonKaydet } from '../../veri.ts';
import { useSihirbaz } from '../baglam.ts';
import { kopyala, type Taslak } from '../durum.ts';
import type { BenzerKart, UyumSorunu } from '../../kurallar/index.ts';
import { FoyGorunumu } from '../FoyGorunumu.tsx';
import { yeniKimlik } from '../kaydet.ts';
import { OnayRozeti } from '../OnayRozeti.tsx';
import { BagDugmesi, Kutu, MetinAlani, Tamam, Uyari, Yardim } from '../parcalar.tsx';
import { VaryantTablosu } from './FormAdimi.tsx';

function KayitBandi({ metin }: { metin: string }) {
  const { git, sifirla } = useSihirbaz();
  return (
    <Tamam>
      <span className="tc-my-tamam-metin">{metin}</span>
      <Dugme simge="list" onClick={() => { git.katalog(); }}>Kataloğu aç</Dugme>
      <Dugme simge="plus" onClick={sifirla}>Yeni malzeme</Dugme>
    </Tamam>
  );
}

// Prototipte `dupBoxHTML`: aynı kart varsa yeni kart ancak gerekçeyle kaydedilir (sunucu gerekçe >= 10 ister).
export function MukerrerKutusu() {
  const { taslak: d, b, degistir, kartiAc } = useSihirbaz();
  const l = K.benzerKartlar(d, undefined, b);
  if (!l.length) return null;
  const ayni = l.some((r) => r.seviye === 'ayni');
  return (
    <Uyari ton={ayni ? 'uyumsuz' : 'dikkat'} kimlik="tc-my-mukerrer">
      <b>{ayni ? 'Bu kart katalogda zaten var gibi görünüyor' : 'Benzer kartlar var'}</b>
      <ul>
        {l.slice(0, 6).map((r) => (
          <li key={r.x.id}>
            <BagDugmesi tikla={() => { kartiAc(String(r.x.id)); }}>{r.x.com.kod}</BagDugmesi> {r.x.com.ad} <OnayRozeti x={r.x} />
            <br /><small>{r.neden}</small>
          </li>
        ))}
      </ul>
      {ayni && !d.id && (
        <>
          <label className="tc-my-isaret">
            <input type="checkbox" checked={!!d._dupOk} onChange={(e) => { const v = e.target.checked; degistir((t) => { t._dupOk = v; }); }} />
            <span>Bu farklı bir malzeme; yine de yeni kart olarak kaydet</span>
          </label>
          {d._dupOk && (
            <MetinAlani
              etiket="Gerekçe (zorunlu)" deger={d._dupNeden ?? ''} genis kimlik="tc-my-mukerrer-neden"
              ipucu="ör. Farklı tedarikçi spesifikasyonu, müşteriye özel kart" yaz={(v) => { degistir((t) => { t._dupNeden = String(v); }); }}
            />
          )}
        </>
      )}
    </Uyari>
  );
}

// Prototipte `acBoxHTML`: açıklamalar seçimlerden türetilir; elle yazılan "Otomatiğe dön" ile geri alınır.
function AciklamaKutusu() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const L = b.genel.acUzunluk || 50;
  return (
    <Kutu baslik="Açıklama 1, 2, 3" sinif="tc-my-aciklama">
      <Yardim>
        Seçimlerinden türetildi; stok kartının açıklama alanlarına aktarılır. En fazla {L} karakter{b.genel.acBuyuk ? ', büyük harf' : ''}; sığmayan ifadeler kısaltılır. Uzunluk ve harf ayarı Ayarlar'da.
      </Yardim>
      {[0, 1, 2].map((i) => {
        const v = K.finalAc(d, i, b);
        const elle = !!d.acManual?.[i];
        return (
          <MetinAlani
            key={i} etiket={`Açıklama ${String(i + 1)}`} deger={v} enCok={L} genis
            yaz={(x) => {
              degistir((t) => {
                t.com[`ac${String(i + 1)}` as 'ac1'] = String(x);
                const m = [...(t.acManual ?? [false, false, false])];
                m[i] = true;
                t.acManual = m;
              });
            }}
            sonEk={(
              <>
                <span className="tc-my-birim">{v.length}/{L}</span>
                <Dugme
                  className="tc-my-otomatik"
                  onClick={() => { degistir((t) => { const m = [...(t.acManual ?? [false, false, false])]; m[i] = false; t.acManual = m; }); }}
                >{elle ? 'Otomatiğe dön' : 'Otomatik'}
                </Dugme>
              </>
            )}
          />
        );
      })}
    </Kutu>
  );
}

// Prototipte `tplFormHTML` + `saveTpl`: kalite, seçimler, sertifikalar, tedarikçi ve birimler şablona girer.
function SablonFormu() {
  const { taslak: d, b, secimYaz, bildir } = useSihirbaz();
  const kaydet = useSablonKaydet();
  const g = K.grade(d, b);
  const varsayilan = K.isGen(d, b) ? K.finalAd(d, b) : [g ? g.ad : '', ...K.mainOpts(d, b)].filter(Boolean).join(', ');
  const [ad, adYaz] = useState(varsayilan);
  const [formDa, formDaYaz] = useState(!!d.form);
  const ovSayisi = Object.keys(d.ov ?? {}).length;
  const [ovDa, ovDaYaz] = useState(true);
  const gonder = async () => {
    const a = ad.trim();
    if (!a) { bildir('Şablona bir ad ver.'); return; }
    let t: Sablon;
    if (K.isGen(d, b)) {
      t = {
        id: yeniKimlik('t'), ad: a.slice(0, 60), tur: d.tur, g: kopyala(d.g ?? {}), bom: kopyala(d.bom ?? []), ops: kopyala(d.ops ?? []),
        com: { sertifika: kopyala(d.com.sertifika ?? []), birim: d.com.birim, pb: d.com.pb, ted: d.com.ted, tedId: d.com.tedId }, t: Date.now(),
      };
    } else {
      t = {
        id: yeniKimlik('t'), ad: a.slice(0, 60), fam: d.fam, cls: K.clsKeyFor(d, b), grade: d.grade, opts: kopyala(d.opts ?? {}),
        com: { sertifika: kopyala(d.com.sertifika ?? []), birim: d.com.birim, pb: d.com.pb, ted: d.com.ted, tedId: d.com.tedId, fe: d.com.fe || '', std: d.com.std },
        t: Date.now(),
      };
      if (d.grade === '__ozel') t.custom = kopyala(d.custom);
      t.stds = kopyala(d.stds ?? []);
      if (formDa && d.form) {
        t.form = d.form;
        t.dims = kopyala(d.dims);
        if (d.tol) t.tol = d.tol;
      }
      if (ovSayisi && ovDa) t.ov = kopyala(d.ov);
    }
    try {
      await kaydet.mutateAsync(t);
      secimYaz({ sablonAcik: false });
      bildir(`"${t.ad}" şablonu kaydedildi; Şablonlar sayfasında duruyor.`, 'tamam');
    } catch (e) {
      bildir(kayitHatasi(e).ileti, 'hata');
    }
  };
  return (
    <Kutu baslik="Şablon olarak kaydet" sinif="tc-my-sablon">
      <Yardim>Kalite, durum ve işlem seçimleri, sertifikalar, tedarikçi ve birimler şablona girer. Şablonlar Şablonlar sayfasından tek tıkla uygulanır ve katalogu açan herkesle paylaşılır.</Yardim>
      <MetinAlani etiket="Şablon adı" deger={ad} enCok={60} genis kimlik="tc-my-sablon-ad" yaz={(v) => { adYaz(String(v)); }} />
      {!K.isGen(d, b) && (
        <label className="tc-my-isaret"><input type="checkbox" checked={formDa} onChange={(e) => { formDaYaz(e.target.checked); }} /><span>Form ve ölçüleri de kaydet</span></label>
      )}
      {ovSayisi > 0 && (
        <label className="tc-my-isaret">
          <input type="checkbox" checked={ovDa} onChange={(e) => { ovDaYaz(e.target.checked); }} />
          <span>Değiştirdiğim teknik değerleri de kaydet ({ovSayisi})</span>
        </label>
      )}
      <div className="tc-my-eylemler">
        <Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} onClick={() => { void gonder(); }}>Şablonu kaydet</Dugme>
        <Dugme onClick={() => { secimYaz({ sablonAcik: false }); }}>Vazgeç</Dugme>
      </div>
    </Kutu>
  );
}

// Son adım (prototipte `s6` ve `gOzetHTML`).
export function OzetAdimi() {
  const { taslak: d, b, yetki, secim, secimYaz, adimaGec } = useSihirbaz();
  const genel = K.isGen(d, b);
  const kaydedildi = !!secim.sonKayit && secim.sonKayit === d.id;
  const varyantlar = genel ? [] : K.variantList(d, b);
  const sorunlar = K.compatIssues(d, b);
  const g = K.grade(d, b);
  return (
    <>
      {kaydedildi && <KayitBandi metin="Kataloğa kaydedildi." />}
      {!yetki.yaz && <p className="tc-my-hata">Bu katalogda değişiklik yapma iznin yok.</p>}
      {(genel ? !kaydedildi : !varyantlar.length && !kaydedildi) && <MukerrerKutusu />}
      {!genel && secim.cokluKayit && !d.id && (
        <KayitBandi metin={`${String(secim.cokluKayit.ok)} varyant kaydedildi${secim.cokluKayit.skip ? `, ${String(secim.cokluKayit.skip)} atlandı` : ''}.`} />
      )}
      {varyantlar.length > 0 && !d.id && (
        <Kutu baslik="Kaydedilecek varyantlar">
          <Yardim>Aşağıdaki föy ortak özellikleri gösterir; kod, ad ve ağırlık her varyantta ölçüye göre oluşur.</Yardim>
          <VaryantTablosu />
        </Kutu>
      )}
      {sorunlar.length ? (
        <Uyari ton={sorunlar.some((i) => i.s === 'no') ? 'uyumsuz' : 'dikkat'}>
          <b>{genel ? 'Kontrol' : 'Uyumluluk kontrolü'}: {sorunlar.length} not</b>
          <ul>
            {sorunlar.map((i) => (
              <li key={`${i.t}|${i.m}`}><b>{i.t}</b>: {i.m} <BagDugmesi tikla={() => { adimaGec(i.step); }}>Düzelt</BagDugmesi></li>
            ))}
          </ul>
        </Uyari>
      ) : (
        <Tamam>{genel ? 'Kart eksiksiz görünüyor.' : `Form, ölçü ve işlem seçimleri ${g?.ad ?? ''} ile uyumlu.`}</Tamam>
      )}
      <AciklamaKutusu />
      <FoyGorunumu d={d} />
      {yetki.yaz && !secim.sablonAcik && (
        <div className="tc-my-eylemler"><Dugme simge="plus" onClick={() => { secimYaz({ sablonAcik: true }); }}>Şablon olarak kaydet</Dugme></div>
      )}
      {yetki.yaz && secim.sablonAcik && <SablonFormu />}
    </>
  );
}
