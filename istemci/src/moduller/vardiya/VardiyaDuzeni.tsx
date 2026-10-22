import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TakvimCevabi, Vardiya } from '#paylasilan/sozlesme/vardiya.ts';
import { AcKapa, Dugme, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BosVardiya } from './BosVardiya.tsx';
import { SaatGirdisi, TarihGirdisi } from './ZamanAlani.tsx';
import { GUNLER, kisaAdlar, saat, tarihMetni } from './gosterim.ts';
import { IkiAdimli } from './IkiAdimli.tsx';
import type { useVardiyaYaz } from './komut.ts';
import { aramaUyar, degistir, hepsiniDegistir } from './secim.ts';
import { TopluMatris } from './TopluMatris.tsx';

type Yaz = ReturnType<typeof useVardiyaYaz>;
type Mola = { baslangic: string; bitis: string };

function Matris({ t, yaz, y }: { t: TakvimCevabi; yaz: boolean; y: Yaz }) {
  const [secili, seciliYaz] = useState<ReadonlySet<number>>(new Set());
  const [reddedilen, reddedilenYaz] = useState<ReadonlySet<number>>(new Set());
  const [arama, aramaYaz] = useState('');
  const acik = (m: number, g: number, vid: number) => t.matris.some((x) => x.isMerkeziId === m && x.gun === g && x.vardiyaId === vid);
  const merkezler = t.isMerkezleri.filter((m) => m.aktif);
  const gorunen = merkezler.filter((m) => aramaUyar(arama, m.kod, m.ad));
  const vardiyalar = t.vardiyalar.filter((v) => v.aktif);
  const kisa = kisaAdlar(vardiyalar.map((v) => v.ad));
  const hepsiSecili = gorunen.length > 0 && gorunen.every((m) => secili.has(m.id));
  // Seçim yalnız aktif merkezlerde tutulur: bu arada pasife alınan merkez komuta gitmez.
  const seciliIdler = merkezler.filter((m) => secili.has(m.id)).map((m) => m.id);
  return (
    <section className="tc-vr-panel" aria-label="Haftalık vardiya matrisi">
      <div className="tc-vr-baslik-satiri">
        <h3>Haftalık vardiya matrisi</h3>
        {merkezler.length > 1 && (
          <div className="tc-vr-satir">
            {yaz && (
              <label className="tc-vr-sec">
                <input type="checkbox" className="tc-vr-kutu" checked={hepsiSecili} disabled={gorunen.length === 0} aria-label="Görünen iş merkezlerinin hepsini seç"
                  onChange={() => seciliYaz(hepsiniDegistir(secili, gorunen.map((m) => m.id)))} />
                Hepsini seç
              </label>
            )}
            <input className="tc-alan-kutu tc-vr-arama" type="search" aria-label="İş merkezi ara" placeholder="İş merkezi ara" value={arama}
              onChange={(e) => aramaYaz(e.target.value)} />
          </div>
        )}
      </div>
      {merkezler.length === 0 ? <p className="tc-vr-ipucu">Aktif iş merkezi yok.</p> : (
        <div className="tc-vr-matris-kap">
          <table className="tc-vr-matris tc-vr-haftalik">
            <thead>
              <tr>
                <th>İş merkezi</th>
                {GUNLER.map((g) => <th key={g}>{g}</th>)}<th>Hafta</th>{yaz && <th><span className="tc-vr-gizli">Kopyala</span></th>}
              </tr>
            </thead>
            <tbody>
              {gorunen.length === 0 && <tr><td colSpan={GUNLER.length + 3} className="tc-vr-ipucu">Aramaya uyan iş merkezi yok.</td></tr>}
              {gorunen.map((m) => (
                <tr key={m.id} data-secili={secili.has(m.id) || undefined}>
                  <th>
                    {yaz ? (
                      <label className="tc-vr-sec">
                        <input type="checkbox" checked={secili.has(m.id)} aria-label={`${m.kod} seç`} onChange={() => seciliYaz(degistir(secili, m.id))} />
                        <span>{m.kod} <small>{m.ad}</small></span>
                      </label>
                    ) : <>{m.kod} <small>{m.ad}</small></>}
                    {reddedilen.has(m.id) && <Rozet ton="hata">Yetkin yok, değişmedi</Rozet>}
                  </th>
                  {GUNLER.map((g, i) => (
                    <td key={g} data-gun={g}>
                      <div className="tc-vr-hucre">
                        {vardiyalar.map((v, j) => (
                          <button key={v.id} type="button" className="tc-vr-vd" aria-pressed={acik(m.id, i + 1, v.id)} disabled={!yaz}
                            aria-label={`${m.kod} ${g} ${v.ad}`} title={`${v.ad} ${v.baslangic}-${v.bitis}`}
                            onClick={() => y.mutate({ yol: '/vardiya-matrisi/degistir', govde: { isMerkeziId: m.id, gun: i + 1, vardiyaId: v.id, acik: !acik(m.id, i + 1, v.id) } })}>
                            {kisa[j]}
                          </button>
                        ))}
                      </div>
                    </td>
                  ))}
                  <td className="tc-vr-sayi tc-vr-hafta">{saat(m.haftalikDakika)} sa</td>
                  {yaz && (
                    <td className="tc-vr-kopya">
                      {merkezler.length > 1 && (
                        <IkiAdimli simge="layers" etiket="Bu düzeni diğerlerine kopyala" onayEtiketi="Emin misin? Tüm iş merkezlerine uygula"
                          gonder={() => y.mutate({ yol: '/vardiya-matrisi/hafta-uygula', govde: { kaynakIsMerkeziId: m.id } })} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {yaz && seciliIdler.length > 0 && (
        <TopluMatris t={t} secili={seciliIdler} y={y} bitti={() => { seciliYaz(new Set()); reddedilenYaz(new Set()); }}
          reddedildi={(idler) => reddedilenYaz(new Set(idler))} />
      )}
      <p className="tc-vr-ipucu">
        Hücredeki vardiyaya dokunarak o gün açıp kapatırsın. Birden çok iş merkezini birlikte değiştirmek için satırlarını işaretle; altta toplu düzenleme açılır.
        Hafta sütunu molalar düşülmüş net saattir. Resmî tatil ve kapalı günler tüm iş merkezlerinde vardiyayı sıfırlar.
      </p>
    </section>
  );
}

function SaatAlani({ etiket, deger, disabled, kaydet }: { etiket: string; deger: string; disabled: boolean; kaydet: (s: string) => void }) {
  return <SaatGirdisi aria-label={etiket} deger={deger} disabled={disabled} degistir={kaydet} />;
}

function AdAlani({ v, disabled, kaydet }: { v: Vardiya; disabled: boolean; kaydet: (ad: string) => void }) {
  const [metin, metinYaz] = useState(v.ad);
  useEffect(() => { metinYaz(v.ad); }, [v.ad]);
  return (
    <input className="tc-alan-kutu" aria-label={`${v.ad} adı`} value={metin} maxLength={40} disabled={disabled}
      onChange={(e) => metinYaz(e.target.value)}
      onBlur={() => { const t = metin.trim(); if (t && t !== v.ad) kaydet(t); else metinYaz(v.ad); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

// Mola yokken boş satır gösterilmez: düğmeye basılınca saat alanları açılır, eklenince ya da vazgeçilince kapanır.
function MolaEkle({ ekle }: { ekle: (m: Mola) => void }) {
  const [acik, acikYaz] = useState(false);
  const [b, bYaz] = useState('');
  const [s, sYaz] = useState('');
  const kapat = () => { acikYaz(false); bYaz(''); sYaz(''); };
  if (!acik) return <div className="tc-vr-satir"><Dugme simge="plus" onClick={() => acikYaz(true)}>Mola ekle</Dugme></div>;
  return (
    <div className="tc-vr-satir">
      <SaatGirdisi aria-label="Mola başlangıç" deger={b} degistir={bYaz} bosOlabilir />
      <SaatGirdisi aria-label="Mola bitiş" deger={s} degistir={sYaz} bosOlabilir />
      <Dugme tur="birincil" simge="plus" onClick={() => { if (!b || !s) return; ekle({ baslangic: b, bitis: s }); kapat(); }}>Ekle</Dugme>
      <Dugme onClick={kapat}>Vazgeç</Dugme>
    </div>
  );
}

function Saatler({ t, yaz, y }: { t: TakvimCevabi; yaz: boolean; y: Yaz }) {
  const istemci = useQueryClient();
  const sira = useRef<Promise<unknown>>(Promise.resolve());
  // Güncelleme okunan sürümü taşır; gönderilmeyen alan boşalacağı için kaydın bütün alanları gider. Kayıtlar sırayla gider ve gövde
  // gönderim anındaki son hâlden kurulur: art arda iki alan değişince ikincisi eski sürümle 409 almaz, ilkini eski değerle ezmez.
  const guncelle = (v: Vardiya, p: Partial<{ ad: string; baslangic: string; bitis: string; molalar: Mola[]; aktif: boolean }>) => {
    sira.current = sira.current.then(() => {
      const son = istemci.getQueryData<TakvimCevabi>(anahtarlar.takvim)?.vardiyalar.find((x) => x.id === v.id) ?? v;
      return y.mutateAsync({ yol: `/vardiyalar/${v.id}/guncelle`, govde: { ad: son.ad, baslangic: son.baslangic, bitis: son.bitis, molalar: son.molalar, aktif: son.aktif, surum: son.surum, ...p } })
        .catch(() => undefined);
    });
  };
  return (
    <section className="tc-vr-panel" aria-label="Vardiya saatleri ve molalar">
      <h3>Vardiya saatleri ve molalar</h3>
      <p className="tc-vr-ipucu">Başlangıç ve bitiş saatini değiştir, molaları ekle. Kapasite molalar düşülmüş net süreyle hesaplanır. Bitiş başlangıçtan önceyse vardiya gece yarısını geçer ve başladığı güne sayılır.</p>
      {t.vardiyalar.length === 0 && <p className="tc-vr-ipucu">Vardiya tanımlanmadı.</p>}
      <div className="tc-vr-kartlar">
        {t.vardiyalar.map((v) => (
          <div key={v.id} className="tc-vr-kart" aria-label={`${v.ad} vardiyası`}>
            <AdAlani v={v} disabled={!yaz} kaydet={(ad) => guncelle(v, { ad })} />
            <div className="tc-vr-satir">
              <SaatAlani etiket={`${v.ad} başlangıç`} deger={v.baslangic} disabled={!yaz} kaydet={(baslangic) => guncelle(v, { baslangic })} />
              <SaatAlani etiket={`${v.ad} bitiş`} deger={v.bitis} disabled={!yaz} kaydet={(bitis) => guncelle(v, { bitis })} />
              <span className="tc-vr-sayi">{saat(v.netDakika)} sa net</span>
            </div>
            {v.molalar.map((m, i) => (
              <div key={`${m.baslangic}-${String(i)}`} className="tc-vr-satir">
                <Simge ad="coffee" boyut="k" /><span>Mola {m.baslangic} – {m.bitis}</span>
                {yaz && (
                  <button type="button" className="tc-vr-sil" aria-label={`${v.ad} ${m.baslangic} molasını kaldır`}
                    onClick={() => guncelle(v, { molalar: v.molalar.filter((_, j) => j !== i) })}><Simge ad="x" boyut="k" /></button>
                )}
              </div>
            ))}
            {yaz && <MolaEkle ekle={(m) => guncelle(v, { molalar: [...v.molalar, m] })} />}
            <div className="tc-vr-satir tc-vr-kullanim">
              <span>Kullanımda</span>
              <AcKapa etiket={`${v.ad} kullanımda`} acik={v.aktif} disabled={!yaz} degistir={(aktif) => guncelle(v, { aktif })} />
            </div>
          </div>
        ))}
      </div>
      {yaz && (
        <div>
          <Dugme simge="plus" onClick={() => y.mutate({ yol: '/vardiyalar', tekrar: true, govde: { ad: `Vardiya ${String(t.vardiyalar.length + 1)}`, baslangic: '08:00', bitis: '16:00', molalar: [] } })}>
            Vardiya
          </Dugme>
        </div>
      )}
    </section>
  );
}

function Tatiller({ t, yaz, y }: { t: TakvimCevabi; yaz: boolean; y: Yaz }) {
  const [tarih, tarihYaz] = useState('');
  const [ad, adYaz] = useState('');
  return (
    <section className="tc-vr-panel" aria-label="Tatiller ve kapalı günler">
      <h3>Tatiller ve kapalı günler ({t.gunler.length})</h3>
      {yaz && (
        <div className="tc-vr-satir">
          <TarihGirdisi aria-label="Tatil tarihi" deger={tarih} degistir={tarihYaz} bosOlabilir />
          <input className="tc-alan-kutu" aria-label="Tatil adı" placeholder="Ad (isteğe bağlı)" maxLength={80} value={ad} onChange={(e) => adYaz(e.target.value)} />
          <Dugme simge="plus" onClick={() => { if (!tarih) return; y.mutate({ yol: '/takvim-gunleri', govde: { tarih, tur: 'tatil', ad: ad.trim() || null } }); tarihYaz(''); adYaz(''); }}>Tarih ekle</Dugme>
          <Dugme simge="flag" onClick={() => y.mutate({ yol: '/takvim-gunleri/resmi-tatiller', govde: { yil: Number(t.bugun.slice(0, 4)) } })}>Resmî tatilleri ekle</Dugme>
        </div>
      )}
      {t.gunler.length === 0 ? <p className="tc-vr-ipucu">Tatil eklenmedi.</p> : (
        <ul className="tc-vr-gunler">
          {t.gunler.map((g) => (
            <li key={g.tarih} className={`tc-vr-gun${g.tarih < t.bugun ? ' tc-vr-gecmis' : ''}`}>
              <span>{tarihMetni(g.tarih)}{g.tur === 'kapali' ? ' · Kapalı' : ''}{g.ad ? ` · ${g.ad}` : ''}</span>
              {yaz && (
                <button type="button" className="tc-vr-sil" aria-label={`${g.tarih} tatilini kaldır`}
                  onClick={() => y.mutate({ yol: `/takvim-gunleri/${g.tarih}/kaldir` })}><Simge ad="x" boyut="k" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Toplu silme ekleme düğmelerinden ayrı, listenin altında durur: yanlışlıkla dokunulmasın. */}
      {yaz && t.gunler.length > 0 && (
        <div className="tc-vr-satir">
          <IkiAdimli tehlike etiket="Tümünü temizle" onayEtiketi="Emin misin? Hepsini sil" gonder={() => y.mutate({ yol: '/takvim-gunleri/temizle' })} />
        </div>
      )}
      <p className="tc-vr-ipucu">Ramazan ve Kurban Bayramı tarihleri her yıl değiştiği için onları tarih seçerek ekle. Geçmiş tarihli günler ayrı yetkiyle değişir.</p>
    </section>
  );
}

// Rota sayfasının Kaynaklar > Vardiyalar sekmesi de bu düzeni gösterir (bağlamada rota buradan alır).
export function VardiyaDuzeni({ t, yaz, y }: { t: TakvimCevabi; yaz: boolean; y: Yaz }) {
  if (t.vardiyalar.length === 0) {
    return (
      <div className="tc-vr-sayfa">
        <BosVardiya />
        <Tatiller t={t} yaz={yaz} y={y} />
      </div>
    );
  }
  return (
    <div className="tc-vr-sayfa">
      <Matris t={t} yaz={yaz} y={y} />
      <Saatler t={t} yaz={yaz} y={y} />
      <Tatiller t={t} yaz={yaz} y={y} />
    </div>
  );
}
