import { useState } from 'react';
import { Dugme, Qr, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { tmiPaketiMi } from '../../../../../../arkon/web/src/data/yeni-paket.ts';
import { Anahtar, Bolmeli, KartBasligi, Sayi } from './denetimler.tsx';
import {
  IS_TURLERI, RAL, isTuru, istasyonAyari, seriNo, yapistirilanKalemler, yeniKimlik,
  type DepoKalemi, type IstasyonAyari, type MontajKalemi, type TorkAdimi,
} from './kurallar.ts';
import type { OpType, Pkg } from './tipler.ts';

// İş türü seçici (istasyonlar.ts TypePicker).
export function TurSecici({ deger, degistir, kilitli }: { deger: OpType; degistir: (t: OpType) => void; kilitli?: boolean }) {
  return (
    <div className="tc-ay2-tur-secici" role="group" aria-label="İş türü">
      {(Object.keys(IS_TURLERI) as OpType[]).map((k) => {
        const t = IS_TURLERI[k];
        return (
          <button key={k} type="button" aria-pressed={deger === k} disabled={kilitli} onClick={(e) => { e.preventDefault(); degistir(k); }}>
            <Simge ad={t.simge} /><b>{t.l}</b><small>{t.d}</small>
          </button>
        );
      })}
    </div>
  );
}

type Yama = (ch: Partial<Pkg>) => void;
const SERI_PARCALARI = ['{PARCA}', '{IE}', '{REV}', '{YY}', '{YYYY}', '{MM}', '{WW}', '{DD}', '{SEQ:4}', '{SEQ:5}'];

// İstasyona özel düzenleyici (StEditor): depo, markalama, boya, montaj ve kalite; talaşlıda düzenleyici yoktur.
export function IstasyonDuzenleyici({ paket, yama }: { paket: Pkg; yama: Yama }) {
  const { bildir } = useBildirim();
  const t = isTuru(paket);
  const c = istasyonAyari(paket);
  const [yapistir, yapistirYaz] = useState('');
  const yaz = (ch: Partial<IstasyonAyari>) => yama({ st: { ...c, ...ch }, ...(ch.items ? { target: Math.max(1, ch.items.length) } : {}) });
  function satir<T extends { id: string }>(dizi: T[], anahtar: 'items' | 'bom' | 'torque', id: string, ch: Partial<T>) {
    yaz({ [anahtar]: dizi.map((x) => (x.id === id ? { ...x, ...ch } : x)) });
  }

  if (t === 'depo') {
    const kalemler: DepoKalemi[] = c.items || [];
    const ekle = () => {
      const yeni = yapistirilanKalemler(yapistir);
      if (!yeni.length) return;
      yaz({ items: [...kalemler, ...yeni] }); yapistirYaz('');
      bildir('tamam', yeni.length + ' kalem eklendi');
    };
    return (
      <div className="tc-ay2-kurallar">
        <section className="tc-ay2-kart tc-ay2-genis" aria-label="Toplama listesi">
          <KartBasligi simge={<Simge ad="truck" />} ton="done" baslik="Toplama listesi" aciklama="Operatör kodu okutur ya da yazar · raf sırasına göre yönlendirilir" sag={kalemler.length + ' kalem'} />
          <Bolmeli etiket="Mod" deger={c.mode} secenekler={[['pick', 'Toplama (çıkış)'], ['receive', 'Mal kabul (giriş)']]} degistir={(mode) => yaz({ mode })} />
          <div className="tc-ay2-tablo" data-tur="depo" role="table" aria-label="Kalemler">
            <div className="tc-ay2-tablo-bas" role="row"><span>Kod</span><span>Ad</span><span>Miktar</span><span>Birim</span><span>Raf</span><span /></div>
            {kalemler.map((it) => (
              <div key={it.id} className="tc-ay2-tablo-satir" role="row">
                <input className="tc-ay2-mono" aria-label="Kod" value={it.code} onChange={(e) => satir(kalemler, 'items', it.id, { code: e.target.value })} />
                <input aria-label="Ad" value={it.name} onChange={(e) => satir(kalemler, 'items', it.id, { name: e.target.value })} />
                <Sayi deger={it.qty} etiket="Miktar" degistir={(qty) => satir(kalemler, 'items', it.id, { qty })} />
                <input aria-label="Birim" value={it.unit} onChange={(e) => satir(kalemler, 'items', it.id, { unit: e.target.value })} />
                <input className="tc-ay2-mono" aria-label="Raf" value={it.loc} placeholder="A-01-02" onChange={(e) => satir(kalemler, 'items', it.id, { loc: e.target.value })} />
                <button type="button" className="tc-ay2-arac" aria-label="Sil" onClick={() => yaz({ items: kalemler.filter((x) => x.id !== it.id) })}><Simge ad="trash" /></button>
              </div>
            ))}
          </div>
          <Dugme tur="ikincil" simge="plus" onClick={() => yaz({ items: [...kalemler, { id: yeniKimlik(), code: '', name: '', qty: 1, unit: 'adet', loc: '' }] })}>Kalem ekle</Dugme>
          <label className="tc-ay2-alan">
            <span className="tc-ay2-ust-yazi">Excel'den yapıştır · sütunlar: kod, ad, miktar, birim, raf</span>
            <textarea rows={3} className="tc-ay2-mono" value={yapistir} onChange={(e) => yapistirYaz(e.target.value)} placeholder={'CIV-M8x25\tCıvata M8x25\t12\tadet\tB-02-04'} />
          </label>
          <Dugme tur="ikincil" simge="download" onClick={ekle} disabled={!yapistir.trim()}>Listeye ekle</Dugme>
        </section>
      </div>
    );
  }
  if (t === 'mark') {
    return (
      <div className="tc-ay2-kurallar">
        <section className="tc-ay2-kart" aria-label="Seri numarası">
          <KartBasligi simge={<Simge ad="tag" />} ton="hazard" baslik="Seri numarası" aciklama="Her markalamada sıradaki numara verilir · operatör ekranında QR ile gösterilir" />
          <label className="tc-ay2-alan">
            <span className="tc-ay2-ust-yazi">Şablon</span>
            <input className="tc-ay2-mono" value={c.fmt} onChange={(e) => yaz({ fmt: e.target.value })} />
          </label>
          <div className="tc-ay2-hazirlar">
            {SERI_PARCALARI.map((k) => <button key={k} type="button" className="tc-ay2-hazir" data-ton="done" onClick={() => yaz({ fmt: c.fmt + k })}><i aria-hidden="true" />{k}</button>)}
          </div>
          <div className="tc-ay2-satir"><span>Başlangıç sırası</span><Sayi deger={c.start} etiket="Başlangıç sırası" degistir={(start) => yaz({ start })} /></div>
          <div className="tc-ay2-alan">
            <span className="tc-ay2-ust-yazi">Yöntem</span>
            <Bolmeli etiket="Yöntem" deger={c.method} secenekler={[['lazer', 'Lazer'], ['damga', 'Damga / nokta vuruş'], ['etiket', 'Etiket']]} degistir={(method) => yaz({ method })} />
          </div>
          <label className="tc-ay2-alan">
            <span className="tc-ay2-ust-yazi">Markalama yeri</span>
            <input value={c.pos} placeholder="örn. Flanş dış yüzü, saat 12 yönü, 3 mm yazı" onChange={(e) => yaz({ pos: e.target.value })} />
          </label>
          <Anahtar acik={c.verify} degistir={(verify) => yaz({ verify })} baslik="QR ile doğrulama" aciklama="Operatör markalanan parçayı okutup seri numarasını doğrular" />
        </section>
        <section className="tc-ay2-kart" aria-label="Önizleme">
          <KartBasligi simge={<Simge ad="scan" />} ton="run" baslik="Önizleme" aciklama="İlk üç numara" />
          <div className="tc-ay2-seri-onizleme">
            <Qr metin={seriNo(c.fmt, c.start, paket)} boyut={120} />
            <div>{[0, 1, 2].map((i) => <b key={i} className="tc-ay2-mono">{seriNo(c.fmt, (+c.start || 1) + i, paket)}</b>)}</div>
          </div>
        </section>
      </div>
    );
  }
  if (t === 'boya') {
    return (
      <div className="tc-ay2-kurallar">
        <section className="tc-ay2-kart" aria-label="Renk ve boya">
          <div className="tc-ay2-kb">
            <svg className="tc-ay2-renk-ornegi" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill={c.hex} /></svg>
            <div><b>Renk ve boya</b><small>Operatör ekranında renk örneğiyle gösterilir</small></div>
          </div>
          <div className="tc-ay2-satir">
            <span>RAL kodu</span>
            <input
              className="tc-ay2-mono tc-ay2-kisa" aria-label="RAL kodu" value={c.ral}
              onChange={(e) => { const k = e.target.value.replace(/\D/g, '').slice(0, 4); const r = RAL[k]; yaz({ ral: k, ...(r ? { name: r[0], hex: r[1] } : {}) }); }}
            />
            <input type="color" className="tc-ay2-renk" aria-label="Renk" value={c.hex} onChange={(e) => yaz({ hex: e.target.value })} />
            <input aria-label="Renk adı" value={c.name} onChange={(e) => yaz({ name: e.target.value })} />
          </div>
          <div className="tc-ay2-hazirlar">
            {Object.entries(RAL).map(([k, [n, h]]) => (
              <button key={k} type="button" className="tc-ay2-ral" aria-pressed={c.ral === k} title={n} onClick={() => yaz({ ral: k, name: n, hex: h })}>
                <svg viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill={h} /></svg>{k}
              </button>
            ))}
          </div>
          <div className="tc-ay2-alan">
            <span className="tc-ay2-ust-yazi">Boya türü</span>
            <Bolmeli etiket="Boya türü" deger={c.type} secenekler={[['Toz', 'Toz'], ['Yaş', 'Yaş (sıvı)'], ['KTL', 'KTL / daldırma']]} degistir={(type) => yaz({ type })} />
          </div>
          <div className="tc-ay2-satir">
            <span>Kat sayısı</span><Sayi deger={c.layers} etiket="Kat sayısı" degistir={(layers) => yaz({ layers })} />
            <span>Askı başına</span><Sayi deger={c.rack} ek="parça" etiket="Askı başına" degistir={(rack) => yaz({ rack })} />
          </div>
        </section>
        <section className="tc-ay2-kart" aria-label="Proses limitleri">
          <KartBasligi simge={<Simge ad="thermometer" />} ton="hazard" baslik="Proses limitleri" aciklama="Dışına çıkınca operatör uyarılır" />
          <div className="tc-ay2-satir">
            <span>Kaplama kalınlığı</span><Sayi deger={c.dftMin} etiket="En az kalınlık" degistir={(dftMin) => yaz({ dftMin })} /><span>–</span>
            <Sayi deger={c.dftMax} ek="µm" etiket="En çok kalınlık" degistir={(dftMax) => yaz({ dftMax })} />
          </div>
          <div className="tc-ay2-satir">
            <span>Fırın</span><Sayi deger={c.cureT} ek="°C" etiket="Fırın sıcaklığı" degistir={(cureT) => yaz({ cureT })} />
            <Sayi deger={c.cureMin} ek="dk" etiket="Fırın süresi" degistir={(cureMin) => yaz({ cureMin })} />
          </div>
          <div className="tc-ay2-satir">
            <span>Ortam sıcaklığı</span><Sayi deger={c.envTmin} etiket="En az ortam sıcaklığı" degistir={(envTmin) => yaz({ envTmin })} /><span>–</span>
            <Sayi deger={c.envTmax} ek="°C" etiket="En çok ortam sıcaklığı" degistir={(envTmax) => yaz({ envTmax })} />
          </div>
          <div className="tc-ay2-satir"><span>Bağıl nem en çok</span><Sayi deger={c.rhMax} ek="%" etiket="Bağıl nem en çok" degistir={(rhMax) => yaz({ rhMax })} /></div>
        </section>
      </div>
    );
  }
  if (t === 'montaj') {
    const bom: MontajKalemi[] = c.bom || [];
    const tork: TorkAdimi[] = c.torque || [];
    return (
      <div className="tc-ay2-kurallar">
        <section className="tc-ay2-kart tc-ay2-genis" aria-label="Parça listesi">
          <KartBasligi simge={<Simge ad="box" />} ton="done" baslik="Parça listesi (kit)" aciklama="İzlenebilir parçalarda operatör seri/lot okutur · ünite kaydına yazılır" sag={bom.length + ' kalem'} />
          <div className="tc-ay2-tablo" data-tur="montaj" role="table" aria-label="Parçalar">
            <div className="tc-ay2-tablo-bas" role="row"><span>Kod</span><span>Ad</span><span>Adet</span><span>İzlenebilir</span><span /></div>
            {bom.map((b) => (
              <div key={b.id} className="tc-ay2-tablo-satir" role="row">
                <input className="tc-ay2-mono" aria-label="Kod" value={b.code} onChange={(e) => satir(bom, 'bom', b.id, { code: e.target.value })} />
                <input aria-label="Ad" value={b.name} onChange={(e) => satir(bom, 'bom', b.id, { name: e.target.value })} />
                <Sayi deger={b.qty} etiket="Adet" degistir={(qty) => satir(bom, 'bom', b.id, { qty })} />
                <button type="button" className="tc-ay2-onay" aria-pressed={!!b.trace} onClick={() => satir(bom, 'bom', b.id, { trace: !b.trace })}>Seri/lot</button>
                <button type="button" className="tc-ay2-arac" aria-label="Sil" onClick={() => yaz({ bom: bom.filter((x) => x.id !== b.id) })}><Simge ad="trash" /></button>
              </div>
            ))}
          </div>
          <Dugme tur="ikincil" simge="plus" onClick={() => yaz({ bom: [...bom, { id: yeniKimlik(), code: '', name: '', qty: 1, trace: false }] })}>Parça ekle</Dugme>
        </section>
        <section className="tc-ay2-kart" aria-label="Tork değerleri">
          <KartBasligi simge={<Simge ad="wrench" />} ton="hazard" baslik="Tork değerleri" aciklama="Operatör tork anahtarı okumasını girer" />
          <div className="tc-ay2-takimlar">
            {tork.map((x) => (
              <div key={x.id} className="tc-ay2-takim">
                <input aria-label="Tork adı" value={x.name} placeholder="Kapak cıvataları" onChange={(e) => satir(tork, 'torque', x.id, { name: e.target.value })} />
                <Sayi deger={x.nm} ek="Nm" etiket="Tork" degistir={(nm) => satir(tork, 'torque', x.id, { nm })} />
                <Sayi deger={x.tol} ek="±" etiket="Tolerans" degistir={(tol) => satir(tork, 'torque', x.id, { tol })} />
                <button type="button" className="tc-ay2-arac" aria-label="Sil" onClick={() => yaz({ torque: tork.filter((z) => z.id !== x.id) })}><Simge ad="trash" /></button>
              </div>
            ))}
          </div>
          <Dugme tur="ikincil" simge="plus" onClick={() => yaz({ torque: [...tork, { id: yeniKimlik(), name: '', nm: 25, tol: 2 }] })}>Tork ekle</Dugme>
        </section>
        <section className="tc-ay2-kart" aria-label="Ünite seri numarası">
          <KartBasligi simge={<Simge ad="tag" />} ton="run" baslik="Ünite seri numarası" aciklama={seriNo(c.fmt, c.start, paket)} />
          <label className="tc-ay2-alan"><span className="tc-ay2-ust-yazi">Şablon</span><input className="tc-ay2-mono" value={c.fmt} onChange={(e) => yaz({ fmt: e.target.value })} /></label>
          <div className="tc-ay2-satir"><span>Başlangıç sırası</span><Sayi deger={c.start} etiket="Başlangıç sırası" degistir={(start) => yaz({ start })} /></div>
        </section>
      </div>
    );
  }
  if (t === 'kalite') {
    const kusurEkle = () => { if (!yapistir.trim()) return; yaz({ defects: [...(c.defects || []), yapistir.trim()] }); yapistirYaz(''); };
    return (
      <div className="tc-ay2-kurallar">
        <section className="tc-ay2-kart" aria-label="Numune planı">
          <KartBasligi simge={<Simge ad="search" />} ton="done" baslik="Numune planı" aciklama="Ölçülecek karakteristikler “Kontrol planı” sekmesinden gelir" />
          <div className="tc-ay2-satir"><span>Lot büyüklüğü</span><Sayi deger={c.lot} ek="parça" etiket="Lot büyüklüğü" degistir={(lot) => yaz({ lot })} /></div>
          <div className="tc-ay2-satir">
            <span>Numune</span>
            <Sayi deger={c.n} ek="parça" etiket="Numune" degistir={(n) => yama({ st: { ...c, n }, ...(tmiPaketiMi(paket) ? {} : { target: n }) })} />
            <span>Kabul sayısı (Ac)</span><Sayi deger={c.ac} etiket="Kabul sayısı" degistir={(ac) => yaz({ ac })} />
          </div>
          <small className="tc-ay2-soluk">Red sayısı Ac'yi geçerse lot reddedilir. Ac = 0: tek red lotu reddeder.</small>
        </section>
        <section className="tc-ay2-kart" aria-label="Görsel kusurlar">
          <KartBasligi simge={<Simge ad="alert" />} ton="stop" baslik="Görsel kusurlar" aciklama="Operatör işaretler · parça reddedilir" />
          <div className="tc-ay2-hazirlar">
            {(c.defects || []).map((d) => (
              <button key={d} type="button" className="tc-ay2-hazir" data-ton="stop" aria-pressed title="Kaldır" onClick={() => yaz({ defects: c.defects.filter((x) => x !== d) })}><i aria-hidden="true" />{d} ×</button>
            ))}
          </div>
          <div className="tc-ay2-sablon-kaydet">
            <input value={yapistir} aria-label="Yeni kusur" placeholder="Yeni kusur · örn. Boya akıntısı" onChange={(e) => yapistirYaz(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') kusurEkle(); }} />
            <Dugme tur="ikincil" simge="plus" disabled={!yapistir.trim()} onClick={kusurEkle}>Ekle</Dugme>
          </div>
        </section>
      </div>
    );
  }
  return null;
}
