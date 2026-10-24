import { useState } from 'react';
import { DurumKutusu, Dugme, Tablo, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { sayi, tarih, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useRrKomutu } from '../veri.ts';
import {
  acikRevizyon, cevrimToplami, degisimOrani, kucuk, OP_GRUPLARI, REV_DURUMU, revizyonlari, sureGirisi, sureMetni, yururlukteki,
  type Malzeme, type Operasyon, type SureAlani,
} from './kurallar.ts';
import { MetinAlani, SecimAlani } from './ortak.tsx';

type Sure = { proc: number | null; chg: number | null };
const SURE_ALANI: Readonly<Record<'setup' | 'proc' | 'chg', SureAlani>> = { setup: 'hazirlik', proc: 'islem', chg: 'degisim' };

function SureGirdisi({ etiket, deger, kapali, yaz }: { etiket: string; deger: number | null; kapali: boolean; yaz: (ham: string) => void }) {
  const metin = deger === null ? '' : String(deger).replace('.', ',');
  const [yerel, setYerel] = useState<string | null>(null);
  return (
    <label className="tc-rr1-alan">
      <span>{etiket}</span>
      <input className="tc-rr1-sayi" inputMode="decimal" value={yerel ?? metin} disabled={kapali} placeholder="boş" aria-label={etiket}
        onChange={(e) => { setYerel(e.target.value); }}
        onBlur={() => { if (yerel !== null && yerel !== metin) yaz(yerel); setYerel(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </label>
  );
}

// Operasyonlar: İstasyonlar'ın operasyon tipi kataloğu 13 grupla; ekle ve değiştir İstasyonlar kaydına yazılır (istasyonlar.yaz). Altında
// ürünlerin rota revizyonları.
export function Operasyonlar(o: EkranOzellikleri) {
  const d = o.veri.durum;
  const komut = useRrKomutu();
  const { bildir } = useBildirim();
  const [q, setQ] = useState('');
  const [kapali, setKapali] = useState<Record<string, boolean>>({});
  const [yeni, setYeni] = useState<{ grup: string; kod: string; kisa: string; ad: string; ist: string; setup: string; proc: string; chg: string } | null>(null);
  const [hata, setHata] = useState('');
  // Durum yalnız toplam birim süreyi (çevrim) taşır; işlem ve değişim ayrı girilince ekranda ayrı tutulur.
  const [sureler, setSureler] = useState<Record<string, Sure>>({});
  const yaz = o.yetki.istasyonYaz;

  if (d.opdefs === null) {
    return (
      <div className="tc-rr1 tc-rr1-ops" data-parca="R1">
        <DurumKutusu durum="bos" mesaj="Operasyon tipleri için okuma yetkiniz yok; bu bölüm boş görünür. Yetki yöneticiden istenir." />
      </div>
    );
  }
  const istasyonlar = d.stations ?? [];
  const kullanim = (id: string) => Object.values(d.routes ?? {}).reduce((t, r) => t + r.steps.filter((s) => s.opId === id).length, 0);
  const sureOf = (x: Operasyon): Sure => sureler[x.id] ?? { proc: x.cycle, chg: null };
  const gonder = async (govde: Record<string, unknown>, basari?: string): Promise<boolean> => {
    try {
      await komut.mutateAsync({ ad: 'operasyon-tipi-duzenle', govde });
      if (basari) bildir('tamam', basari);
      return true;
    } catch (e) {
      bildir('hata', (e as Error).message);
      return false;
    }
  };
  const sureDegisti = (x: Operasyon, f: 'setup' | 'proc' | 'chg', ham: string) => {
    const g = sureGirisi(ham, SURE_ALANI[f]);
    if (!g.ok) { bildir('hata', g.ileti); return; }
    if (f === 'setup') { void gonder({ id: Number(x.id), varsayilanAyarDk: sureMetni(g.deger, 2) }); return; }
    const eski = sureOf(x);
    const s = { ...eski, [f]: g.deger };
    setSureler({ ...sureler, [x.id]: s });
    void gonder({ id: Number(x.id), varsayilanBirimDk: s.proc === null && s.chg === null ? null : sureMetni(cevrimToplami(s.proc, s.chg), 4) })
      .then((ok) => { if (!ok) setSureler((m) => ({ ...m, [x.id]: eski })); });
  };

  const s = kucuk(q.trim());
  const gruplar = [...OP_GRUPLARI, ...[...new Set(d.opdefs.map((x) => x.group))].filter((g) => !OP_GRUPLARI.some(([k]) => k === g)).map((g) => [g, g] as const)];
  const satir = (x: Operasyon) => {
    const sure = sureOf(x);
    const oran = degisimOrani(sure.proc, sure.chg);
    const n = kullanim(x.id);
    return (
      <div key={x.id} className="tc-rr1-od">
        <MetinAlani etiket="Kısaltma" deger={x.abbr ?? ''} enCok={6} kapali={!yaz}
          yaz={(v) => { void gonder({ id: Number(x.id), kisaltma: v.toLocaleUpperCase('tr-TR').trim().slice(0, 6) || null }); }} />
        <MetinAlani etiket="Kod" deger={x.code} kapali={!yaz} yaz={(v) => { if (v.trim()) void gonder({ id: Number(x.id), kod: v.trim() }); }} />
        <span className="tc-rr1-od-genis">
          <MetinAlani etiket="Operasyon adı" deger={x.name} kapali={!yaz} yaz={(v) => { if (v.trim()) void gonder({ id: Number(x.id), ad: v.trim() }); }} />
        </span>
        <span className="tc-rr1-od-genis">
          <SecimAlani etiket="Varsayılan istasyon" deger={x.stationId ?? ''} kapali={!yaz} bos="Seç…"
            secenekler={istasyonlar.map((i) => ({ deger: i.id, baslik: `${i.code} ${i.name}` }))}
            yaz={(v) => { void gonder({ id: Number(x.id), varsayilanIstasyonId: v === '' ? null : Number(v) }); }} />
        </span>
        <SureGirdisi etiket="Hazırlık dk" deger={x.setup} kapali={!yaz} yaz={(v) => { sureDegisti(x, 'setup', v); }} />
        <SureGirdisi etiket="İşlem dk / birim" deger={sure.proc} kapali={!yaz} yaz={(v) => { sureDegisti(x, 'proc', v); }} />
        <SureGirdisi etiket="Değişim dk / birim" deger={sure.chg} kapali={!yaz} yaz={(v) => { sureDegisti(x, 'chg', v); }} />
        <div className="tc-rr1-alan"><span>Değişim %</span><b>{oran === null ? YOK : `%${sayi(Math.round(oran * 10) / 10)}`}</b></div>
        <div className="tc-rr1-alan"><span>Kullanım</span><span>{n} adım{!x.aktif && <span className="tc-rr1-tag">pasif</span>}</span></div>
      </div>
    );
  };

  const ekle = async () => {
    if (!yeni) return;
    if (!yeni.kod.trim()) { setHata('Operasyonun kodunu yaz.'); return; }
    const s1 = sureGirisi(yeni.setup, 'hazirlik'); const s2 = sureGirisi(yeni.proc, 'islem'); const s3 = sureGirisi(yeni.chg, 'degisim');
    const kotu = [s1, s2, s3].find((x) => !x.ok);
    if (kotu && !kotu.ok) { setHata(kotu.ileti); return; }
    setHata('');
    try {
      await komut.mutateAsync({
        ad: 'operasyon-tipi-ekle',
        govde: {
          kod: yeni.kod.trim(), ad: yeni.ad.trim(), grup: yeni.grup, kisaltma: yeni.kisa.trim() || null, varsayilanAyarDk: sureMetni(s1.deger, 2),
          varsayilanBirimDk: s2.deger === null && s3.deger === null ? null : sureMetni(cevrimToplami(s2.deger, s3.deger), 4),
          varsayilanIstasyonId: yeni.ist === '' ? null : Number(yeni.ist),
        },
      });
      bildir('tamam', `${yeni.kod.trim()} operasyon kataloğuna eklendi.`);
      setYeni(null);
    } catch (e) {
      setHata((e as Error).message);
    }
  };
  const alan = (k: keyof NonNullable<typeof yeni>, v: string) => { if (yeni) setYeni({ ...yeni, [k]: v }); };

  const urunler = (d.items ?? []).filter((m) => m.type !== 'ham' && revizyonlari(d.routeRevs, m.id).length > 0);
  return (
    <div className="tc-rr1 tc-rr1-ops" data-parca="R1">
      <p className="tc-rr1-ipucu">
        Operasyon kataloğu İstasyonlar&apos;ın operasyon tiplerinden okunur ve 13 grupla gruplanır; ekle ve değiştir İstasyonlar kaydına yazılır.
        Akış şemasında adım eklerken bu listeden seçersin; değerler adıma kopyalanır ve adımda ayrıca değiştirilebilir.
      </p>
      <div className="tc-rr1-top">
        <input className="tc-rr1-metin" type="search" value={q} placeholder="Kod, kısaltma ya da ad ara…" aria-label="Operasyon ara" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); }} />
        <span className="tc-rr1-grow" />
        {yaz && (
          <Dugme tur="birincil" simge="plus" onClick={() => {
            setHata('');
            setYeni(yeni ? null : { grup: OP_GRUPLARI[0]?.[0] ?? '', kod: '', kisa: '', ad: '', ist: '', setup: '', proc: '', chg: '' });
          }}>Operasyon</Dugme>
        )}
        <Dugme tur="ikincil" simge="clock" onClick={() => { o.git('sureler'); }}>Süreler</Dugme>
      </div>
      {yeni && (
        <section className="tc-rr1-panel" aria-label="Yeni operasyon">
          <h3>Yeni operasyon</h3>
          <p className="tc-rr1-ipucu">Operasyon İstasyonlar&apos;ın operasyon tipi kataloğuna yazılır; Malzemeler ve Hizmetler de aynı listeyi okur. Kod senin verdiğin koddur ve rotada ya da iş emrinde kullanılınca değişmez.</p>
          <div className="tc-rr1-ig">
            <SecimAlani etiket="Grup" deger={yeni.grup} secenekler={OP_GRUPLARI.map(([k, ad]) => ({ deger: k, baslik: ad }))} yaz={(v) => { alan('grup', v); }} />
            <label className="tc-rr1-alan"><span>Kod</span><input className="tc-rr1-metin" value={yeni.kod} placeholder="Örneğin KES-LZR" aria-label="Operasyon kodu" onChange={(e) => { alan('kod', e.target.value); }} /></label>
            <label className="tc-rr1-alan"><span>Kısaltma</span><input className="tc-rr1-metin" value={yeni.kisa} maxLength={6} placeholder="LZR" aria-label="Kısaltma" onChange={(e) => { alan('kisa', e.target.value); }} /></label>
            <label className="tc-rr1-alan tc-rr1-genis"><span>Ad</span><input className="tc-rr1-metin" value={yeni.ad} placeholder="Lazer kesim" aria-label="Operasyon adı" onChange={(e) => { alan('ad', e.target.value); }} /></label>
            <span className="tc-rr1-genis">
              <SecimAlani etiket="Varsayılan istasyon" deger={yeni.ist} bos="Seç…" secenekler={istasyonlar.map((i) => ({ deger: i.id, baslik: `${i.code} ${i.name}` }))} yaz={(v) => { alan('ist', v); }} />
            </span>
            <label className="tc-rr1-alan"><span>Hazırlık (dk)</span><input className="tc-rr1-sayi" inputMode="decimal" value={yeni.setup} placeholder="boş" aria-label="Hazırlık" onChange={(e) => { alan('setup', e.target.value); }} /></label>
            <label className="tc-rr1-alan"><span>İşlem (dk / birim)</span><input className="tc-rr1-sayi" inputMode="decimal" value={yeni.proc} placeholder="boş" aria-label="İşlem" onChange={(e) => { alan('proc', e.target.value); }} /></label>
            <label className="tc-rr1-alan"><span>Değişim (dk / birim)</span><input className="tc-rr1-sayi" inputMode="decimal" value={yeni.chg} placeholder="boş" aria-label="Değişim" onChange={(e) => { alan('chg', e.target.value); }} /></label>
          </div>
          {hata && <p className="tc-rr1-hata" role="alert">{hata}</p>}
          <div className="tc-rr1-btnrow">
            <Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => { void ekle(); }}>Operasyonu ekle</Dugme>
            <Dugme tur="ikincil" onClick={() => { setYeni(null); }}>Vazgeç</Dugme>
          </div>
        </section>
      )}
      {d.opdefs.length === 0 && !q && <DurumKutusu durum="bos" mesaj="Katalog boş. Kesim, büküm, kaynak, montaj gibi operasyonlarını ekle." />}
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
            {gor.length > 0 ? <div className="tc-rr1-rows">{gor.map(satir)}</div>
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
