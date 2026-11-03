import { useState } from 'react';
import { DurumKutusu, Dugme, Tablo } from '../../../../ortak/arayuz/index.ts';
import { sayi, tarih, YOK } from '../bicim.ts';
import { SahibindeDuzenle } from '../kaynaklar/parcalar.tsx';
import type { EkranOzellikleri } from '../sekmeler.ts';
import {
  acikRevizyon, kucuk, OP_GRUPLARI, REV_DURUMU, revizyonlari, yururlukteki, type Malzeme, type Operasyon,
} from './kurallar.ts';
import { renkSinifi } from './ortak.tsx';

// Eski sayfanın sık tablosu: başlık satırı geniş ekranda görünür; dar ekranda satır alanları kendi etiketini gösterir.
const ODBASLIK = (
  <div className="tc-rr1-od tc-rr1-od-bas" aria-hidden="true">
    <span>Kısaltma</span><span>Kod</span><span>Operasyon adı</span><span>Varsayılan istasyon</span>
    <span className="tc-rr1-od-sag">Hazırlık dk</span><span className="tc-rr1-od-sag">İşlem dk</span><span className="tc-rr1-od-sag">Değişim dk</span>
    <span className="tc-rr1-od-sag">Değişim %</span><span>Kullanım</span>
  </div>
);

// Operasyonlar: İstasyonlar'ın operasyon tipi kataloğu 13 grupla, yalnız okunur; ekleme ve düzenleme İstasyonlar'dadır (1927 a). Altında
// ürünlerin rota revizyonları.
export function Operasyonlar(o: EkranOzellikleri) {
  const d = o.veri.durum;
  const [q, setQ] = useState('');
  const [kapali, setKapali] = useState<Record<string, boolean>>({});

  if (d.opdefs === null) {
    return (
      <div className="tc-rr1 tc-rr1-ops" data-parca="R1">
        <DurumKutusu durum="bos" mesaj="Operasyon tipleri için okuma yetkiniz yok; bu bölüm boş görünür. Yetki yöneticiden istenir." />
      </div>
    );
  }
  const istasyonlar = d.stations ?? [];
  const kullanim = (id: string) => Object.values(d.routes ?? {}).reduce((t, r) => t + r.steps.filter((s) => s.opId === id).length, 0);

  const s = kucuk(q.trim());
  const gruplar = [...OP_GRUPLARI, ...[...new Set(d.opdefs.map((x) => x.group))].filter((g) => !OP_GRUPLARI.some(([k]) => k === g)).map((g) => [g, g] as const)];
  const istasyonAdi = (id: string | null) => {
    const i = id === null ? undefined : istasyonlar.find((x) => x.id === id);
    return i ? `${i.code} ${i.name}` : YOK;
  };
  const alan = (etiket: string, deger: string, sag = false) => (
    <div className={`tc-rr1-alan${sag ? ' tc-rr1-od-sag' : ''}`}><span>{etiket}</span><b>{deger}</b></div>
  );
  const sure = (dk: number | null) => (dk === null ? YOK : sayi(dk));
  const satir = (x: Operasyon) => (
    <div key={x.id} className="tc-rr1-od">
      <span className={`tc-rr1-od-kisa ${renkSinifi(x.stationId)}`}>{alan('Kısaltma', x.abbr ?? YOK)}</span>
      {alan('Kod', x.code)}
      <span className="tc-rr1-od-genis">{alan('Operasyon adı', x.name)}</span>
      <span className="tc-rr1-od-genis">{alan('Varsayılan istasyon', istasyonAdi(x.stationId))}</span>
      {alan('Hazırlık dk', sure(x.setup), true)}
      {/* Durum yalnız toplam birim süreyi (çevrim) taşır; işlem ve değişim ayrımı katalogda tutulmaz. */}
      {alan('İşlem dk / birim', sure(x.cycle), true)}
      {alan('Değişim dk / birim', YOK, true)}
      {alan('Değişim %', YOK, true)}
      <div className="tc-rr1-alan"><span>Kullanım</span><span className="tc-rr1-ipucu">{kullanim(x.id)} adım{!x.aktif && <span className="tc-rr1-tag">pasif</span>}</span></div>
    </div>
  );

  const urunler = (d.items ?? []).filter((m) => m.type !== 'ham' && revizyonlari(d.routeRevs, m.id).length > 0);
  return (
    <div className="tc-rr1 tc-rr1-ops" data-parca="R1">
      <div className="tc-rr1-top">
        <input className="tc-rr1-metin" type="search" value={q} placeholder="Kod, kısaltma ya da ad ara…" aria-label="Operasyon ara" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); }} />
        <span className="tc-rr1-grow" />
        <SahibindeDuzenle sahip="operasyon" />
        <Dugme tur="ikincil" simge="clock" onClick={() => { o.git('sureler'); }}>Süreler</Dugme>
      </div>
      {d.opdefs.length === 0 && !q && <DurumKutusu durum="bos" mesaj="Katalog boş. Kesim, büküm, kaynak, montaj gibi operasyonları İstasyonlar sayfasında ekle." />}
      {gruplar.map(([k, ad]) => {
        const tum = d.opdefs?.filter((x) => x.group === k) ?? [];
        if (tum.length === 0 && !OP_GRUPLARI.some(([g]) => g === k)) return null;
        const gor = tum.filter((x) => !s || kucuk(`${x.code} ${x.abbr ?? ''} ${x.name}`).includes(s));
        const baslik = tum[0]?.groupName ?? ad;
        const acik = !kapali[k] && gor.length > 0;
        return (
          <details key={k} className="tc-rr1-opgrp" open={acik}
            onToggle={(e) => { const ac = (e.currentTarget as HTMLDetailsElement).open; if (ac !== acik) setKapali({ ...kapali, [k]: !ac }); }}>
            <summary><b>{baslik}</b> <span className="tc-rr1-count">{k} · {s && gor.length !== tum.length ? `${String(gor.length)} / ` : ''}{tum.length}</span></summary>
            {gor.length > 0 ? <div className="tc-rr1-rows">{ODBASLIK}{gor.map(satir)}</div>
              : <p className="tc-rr1-ipucu">{tum.length ? 'Aramaya uyan operasyon yok.' : 'Bu grupta operasyon yok.'}</p>}
          </details>
        );
      })}
      <section className="tc-rr1-panel" aria-label="Rota revizyonları">
        <h3>Rota revizyonları</h3>
        <p className="tc-rr1-ipucu">Plan her ürün için yürürlükteki revizyonu kullanır. Akış şemasında yapılan rota değişiklikleri taslak revizyona yazılır; onaylanınca yürürlüğe girer.</p>
        <Tablo<Malzeme>
          etiket="Rota revizyonları" satirlar={urunler} satirAnahtari={(m) => m.id} bosMesaj="Henüz rota revizyonu yok."
          sutunlar={[
            { anahtar: 'urun', baslik: 'Ürün', hucre: (m) => <span><b>{m.code}</b> {m.name}</span>, csv: (m) => `${m.code} ${m.name}` },
            {
              anahtar: 'yururlukte', baslik: 'Yürürlükte',
              hucre: (m) => { const A = yururlukteki(revizyonlari(d.routeRevs, m.id)); return A ? <span className="tc-rr1-rvchip tc-rr1-rv-yururlukte">Rev {A.no}</span> : '–'; },
            },
            {
              anahtar: 'acik', baslik: 'Açık revizyon',
              hucre: (m) => {
                const O = acikRevizyon(revizyonlari(d.routeRevs, m.id));
                return O ? <span><span className={`tc-rr1-rvchip tc-rr1-rv-${O.status}`}>Rev {O.no} {REV_DURUMU[O.status]}</span> <small className="tc-rr1-ipucu">{O.note}</small></span> : '–';
              },
            },
            { anahtar: 'onay', baslik: 'Son onay', hucre: (m) => tarih(yururlukteki(revizyonlari(d.routeRevs, m.id))?.approvedAt ?? null) },
            { anahtar: 'ac', baslik: '', csv: false, hucre: (m) => <Dugme tur="ikincil" simge="route" onClick={() => { o.git('schema', m.id); }}>Akışta aç</Dugme> },
          ]}
        />
      </section>
    </div>
  );
}
