import { useState } from 'react';
import { DurumKutusu, Dugme } from '../../../../ortak/arayuz/index.ts';
import { sayi, YOK } from '../bicim.ts';
import { SahibindeDuzenle } from '../kaynaklar/parcalar.tsx';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { kucuk, OP_GRUPLARI, type Operasyon } from './kurallar.ts';
import { renkSinifi, tercihOku, tercihYaz } from './ortak.tsx';

// Eski sayfanın sık tablosu: başlık satırı geniş ekranda görünür; dar ekranda satır alanları kendi etiketini gösterir.
const ODBASLIK = (
  <div className="tc-rr1-od tc-rr1-od-bas" aria-hidden="true">
    <span>Kısaltma</span><span>Kod</span><span>Operasyon adı</span><span>Varsayılan istasyon</span>
    <span className="tc-rr1-od-sag">Hazırlık dk</span><span className="tc-rr1-od-sag">Birim süre dk</span><span>Kullanım</span>
  </div>
);

// Operasyonlar: İstasyonlar'ın operasyon tipi kataloğu 13 grupla, yalnız okunur; ekleme ve düzenleme İstasyonlar'dadır (1927 a).
// 2559 a: katalog değişim tutmaz (değişim rota adımındadır), bu yüzden değişim sütunu yok; rota revizyonları Ürün ve rotalar'dadır.
export function Operasyonlar(o: EkranOzellikleri) {
  const d = o.veri.durum;
  const [q, setQ] = useState('');
  const [kapali, setKapali] = useState<Record<string, boolean>>({});
  const [pasifGizli, setPasifGizli] = useState(() => tercihOku('pasif-gizle', '1') === '1');

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
      {/* Katalog yalnız toplam birim süreyi (çevrim) taşır. */}
      {alan('Birim süre dk', sure(x.cycle), true)}
      <div className="tc-rr1-alan">
        <span>Kullanım</span>
        <span className="tc-rr1-ipucu">
          {kullanim(x.id) > 0
            ? <button type="button" className="tc-rr1-linkbtn" title="Süreler'de bu operasyonun adımlarını aç" onClick={() => { o.git('sureler', x.id); }}>{kullanim(x.id)} adım</button>
            : '0 adım'}
          {!x.aktif && <span className="tc-rr1-tag">pasif</span>}
        </span>
      </div>
    </div>
  );

  return (
    <div className="tc-rr1 tc-rr1-ops" data-parca="R1">
      <div className="tc-rr1-top">
        <input className="tc-rr1-metin" type="search" value={q} placeholder="Kod, kısaltma ya da ad ara…" aria-label="Operasyon ara" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); }} />
        <label className="tc-rr1-onay"><input type="checkbox" checked={pasifGizli} onChange={(e) => { setPasifGizli(e.target.checked); tercihYaz('pasif-gizle', e.target.checked ? '1' : '0'); }} /> Pasifleri gizle</label>
        <span className="tc-rr1-grow" />
        <SahibindeDuzenle sahip="operasyon" />
        <Dugme tur="ikincil" simge="clock" onClick={() => { o.git('sureler'); }}>Süreler</Dugme>
      </div>
      {d.opdefs.length === 0 && !q && <DurumKutusu durum="bos" mesaj="Katalog boş. Kesim, büküm, kaynak, montaj gibi operasyonları İstasyonlar sayfasında ekle." />}
      {gruplar.map(([k, ad]) => {
        const tum = d.opdefs?.filter((x) => x.group === k) ?? [];
        if (tum.length === 0 && !OP_GRUPLARI.some(([g]) => g === k)) return null;
        const gor = tum.filter((x) => (!pasifGizli || x.aktif) && (!s || kucuk(`${x.code} ${x.abbr ?? ''} ${x.name}`).includes(s)));
        const baslik = tum[0]?.groupName ?? ad;
        const acik = !kapali[k] && gor.length > 0;
        return (
          <details key={k} className="tc-rr1-opgrp" open={acik}
            onToggle={(e) => { const ac = (e.currentTarget as HTMLDetailsElement).open; if (ac !== acik) setKapali({ ...kapali, [k]: !ac }); }}>
            <summary><b>{baslik}</b> <span className="tc-rr1-count">{k} · {s && gor.length !== tum.length ? `${String(gor.length)} / ` : ''}{tum.length}</span></summary>
            {gor.length > 0 ? <div className="tc-rr1-rows">{ODBASLIK}{gor.map(satir)}</div>
              : <p className="tc-rr1-ipucu">{tum.length === 0 ? 'Bu grupta operasyon yok.' : s ? 'Aramaya uyan operasyon yok.' : 'Bu grupta yalnız pasif operasyon var.'}</p>}
          </details>
        );
      })}
    </div>
  );
}
