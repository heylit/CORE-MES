import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FarkCevabi, KomutCevabi, RevizyonAyrintisi, RevizyonOzeti, UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI, zamanMetni } from './gorunum.ts';
import { acikRevizyon, gosterilecekRevizyon, type SonDegisiklik } from './useRotaCalisma.ts';

type Panel = 'gonder' | 'onay' | 'fark' | 'diger' | 'gecmis' | null;

interface Ozellikler {
  agacUrunleri: readonly number[];
  urunAdi: (urunId: number) => string;
  revizyonlar: ReadonlyMap<number, UrunRevizyonlariCevabi>;
  ayrinti: (urunId: number) => RevizyonAyrintisi | undefined;
  secili: Record<number, number>;
  urunId: number;
  urunSec: (urunId: number) => void;
  goster: (urunId: number, revizyonId: number) => void;
  komut: (revizyonId: number, ad: string, govde: unknown) => Promise<KomutCevabi | null>;
  gonder: (urunId: number, revizyonId: number, aciklama: string | null) => Promise<void>;
  ilkRevizyonaCevir: (urunId: number, taslak: RevizyonAyrintisi['revizyon'], ilk: RevizyonOzeti) => Promise<void>;
  taslakAc: (urunId: number, kaynakId: number) => Promise<void>;
  kopyalaAc: (revizyonId: number) => void;
  geriAl: (urunId: number, revizyonId: number, yon: 'geri' | 'ileri') => void;
  geriAlinabilir: (revizyonId: number) => { geri: boolean; ileri: boolean };
  son: SonDegisiklik | null;
  bekliyor: boolean;
  yazabilir: boolean;
}

const ONAYDA = (r: RevizyonOzeti) => (r.durum === 'onay_bekliyor' ? 'onayda' : 'taslak');

export function RevizyonSeridi(p: Ozellikler) {
  const [panel, panelYaz] = useState<Panel>(null);
  const [silahli, silahliYaz] = useState<string | null>(null);
  const [not, notYaz] = useState<string | null>(null);
  const liste = p.revizyonlar.get(p.urunId)?.revizyonlar ?? [];
  const V = gosterilecekRevizyon(liste, p.secili[p.urunId]);
  const A = liste.find((r) => r.durum === 'yururlukte') ?? null;
  const ayrinti = p.ayrinti(p.urunId);
  const komutlar = ayrinti && V && ayrinti.revizyon.id === V.id ? ayrinti.komutlar : [];
  const surum = ayrinti?.revizyon.surum ?? 1;
  const fark = useQuery({
    queryKey: anahtarlar.fark(V?.id ?? 0),
    queryFn: () => api.get<FarkCevabi>(`/rota/revizyonlar/${V?.id ?? 0}/fark`),
    enabled: V !== null && V.durum !== 'yururlukte' && V.durum !== 'iptal',
  });
  const farkSayisi = fark.data?.farklar.length ?? 0;
  const taslaklar = p.agacUrunleri.flatMap((u) => {
    const o = acikRevizyon(p.revizyonlar.get(u)?.revizyonlar ?? []);
    return o ? [{ u, o }] : [];
  });
  const gecmis = V ? p.geriAlinabilir(V.id) : { geri: false, ileri: false };
  const ac = (x: Panel) => panelYaz(panel === x ? null : x);
  const calis = async (ad: string, govde: unknown) => { const c = await p.komut(V?.id ?? 0, ad, govde); if (c) { panelYaz(null); silahliYaz(null); } };
  const sonYeni = p.son !== null && Date.now() - p.son.zaman < 10 * 60_000;

  return (
    <div className={`tc-revbar${V && V.durum !== 'yururlukte' ? ' tc-revbar-acik' : ''}`}>
      {(taslaklar.length > 0 || sonYeni) && (
        <div className="tc-rv-row tc-rv-status">
          {sonYeni && p.son && (
            <span className="tc-rv-ok">✓ Son değişiklik {p.urunAdi(p.son.urunId)} Rev {p.son.harf} taslağına yazıldı. <small>Yürürlükteki rota değişmedi.</small></span>
          )}
          {taslaklar.length > 0 && <small className="tc-rota-ipucu">Bu şemadaki taslaklar:</small>}
          {taslaklar.map(({ u, o }) => (
            <button key={u} type="button" className={`tc-rvchip tc-rv-${o.durum} tc-as-btn${u === p.urunId ? ' tc-cur' : ''}`}
              onClick={() => { p.urunSec(u); p.goster(u, o.id); }}>{p.urunAdi(u)} Rev {o.harf} {ONAYDA(o)}</button>
          ))}
        </div>
      )}
      <div className="tc-rv-row">
        {p.agacUrunleri.length > 1 ? (
          <select className="tc-inp tc-rv-sel" aria-label="Revizyonu gösterilen rota" value={p.urunId} onChange={(o) => p.urunSec(Number(o.target.value))}>
            {p.agacUrunleri.map((u) => (
              <option key={u} value={u}>{p.urunAdi(u)} rotası{acikRevizyon(p.revizyonlar.get(u)?.revizyonlar ?? []) ? ' (taslak var)' : ''}</option>
            ))}
          </select>
        ) : <b className="tc-rv-t">{p.urunAdi(p.urunId)} rotası</b>}
        <span className="tc-rv-list" role="group" aria-label="Revizyonlar">
          {liste.length === 0 && <small className="tc-rota-ipucu">Henüz revizyon yok</small>}
          {liste.map((r) => (
            <button key={r.id} type="button" className={`tc-rvtab tc-rv-${r.durum}`} aria-pressed={V?.id === r.id}
              title={`${DURUM_ETIKETI[r.durum]}${r.aciklama ? `: ${r.aciklama}` : ''}`} onClick={() => p.goster(p.urunId, r.id)}>
              <b>Rev {r.harf}</b><small>{DURUM_ETIKETI[r.durum]}</small>
            </button>
          ))}
        </span>
        {V?.durum === 'taslak' && komutlar.includes('kaydet') && (
          <>
            <Dugme simge="rotate" disabled={!gecmis.geri || p.bekliyor} onClick={() => p.geriAl(p.urunId, V.id, 'geri')} title="Geri al (Ctrl+Z)">Geri al</Dugme>
            <Dugme simge="next" disabled={!gecmis.ileri || p.bekliyor} onClick={() => p.geriAl(p.urunId, V.id, 'ileri')} title="Yinele (Ctrl+Y)">Yinele</Dugme>
          </>
        )}
        <span className="tc-grow" />
        {V?.durum === 'taslak' && komutlar.includes('onaya-gonder') && (
          <Dugme tur="birincil" simge="upload" disabled={p.bekliyor} aria-pressed={panel === 'gonder'} onClick={() => { notYaz(ayrinti?.revizyon.aciklama ?? ''); ac('gonder'); }}>Onaya gönder…</Dugme>
        )}
        {V?.durum === 'onay_bekliyor' && komutlar.includes('geri-gonder') && (
          <Dugme tur="birincil" simge="check" aria-pressed={panel === 'onay'} onClick={() => ac('onay')}>Onayla…</Dugme>
        )}
        {V?.durum === 'onayli' && komutlar.includes('yururluge-al') && (
          <Dugme tur="birincil" simge="play" disabled={p.bekliyor}
            onClick={() => { if (silahli === `y${V.id}`) void calis('yururluge-al', { surum }); else silahliYaz(`y${V.id}`); }}>
            {silahli === `y${V.id}` ? 'Emin misin? Yürürlüğe al' : `Rev ${V.harf}'yı yürürlüğe al`}
          </Dugme>
        )}
        {p.yazabilir && V && (V.durum === 'onayli' || V.durum === 'yururlukte') && !acikRevizyon(liste) && (
          <Dugme simge="layers" disabled={p.bekliyor} onClick={() => void p.taslakAc(p.urunId, V.id)}>Rev {V.harf}'dan yeni taslak aç</Dugme>
        )}
        {V && A && V.id !== A.id && farkSayisi > 0 && (
          <Dugme aria-pressed={panel === 'fark'} onClick={() => ac('fark')}>{farkSayisi} fark</Dugme>
        )}
        <Dugme aria-pressed={panel === 'diger' || panel === 'gecmis'} onClick={() => ac('diger')}>Revizyon ⋯</Dugme>
      </div>
      {V && V.durum !== 'yururlukte' && (
        <div className="tc-rv-row tc-rv-note">
          <small className="tc-rota-ipucu">
            {V.durum === 'taslak' && `Rev ${V.harf} taslak: değişiklikler buraya yazılır${A ? `, yürürlükteki Rev ${A.harf} ve plan değişmez` : ''}. Bitince onaya gönder.`}
            {V.durum === 'onay_bekliyor' && `Rev ${V.harf} onay bekliyor: değiştirilemez; onaylanabilir ya da düzeltmeye geri gönderilebilir.`}
            {V.durum === 'onayli' && `Rev ${V.harf} onaylı ama yürürlükte değil. Burada değişiklik yaparsan bu revizyonu temel alan yeni taslak açılır.`}
            {V.durum === 'iptal' && `Rev ${V.harf} iptal edildi; içeriği kayıt için durur, değiştirilemez.`}
          </small>
        </div>
      )}

      {panel === 'gonder' && V && (
        <div className="tc-rv-panel">
          <label className="tc-f"><span>Değişiklik notu (onaylayan görür)</span>
            <textarea className="tc-inp" rows={2} maxLength={300} value={not ?? ''} onChange={(o) => notYaz(o.target.value)} />
          </label>
          <div className="tc-rota-dugmeler">
            <Dugme onClick={() => panelYaz(null)}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="upload" disabled={p.bekliyor}
              onClick={() => { void p.gonder(p.urunId, V.id, (not ?? '').trim() === '' ? null : (not ?? '').trim()).then(() => panelYaz(null)); }}>Onaya gönder</Dugme>
          </div>
        </div>
      )}
      {panel === 'onay' && V && (
        <div className="tc-rv-panel">
          {ayrinti?.revizyon.aciklama && <p>Not: {ayrinti.revizyon.aciklama}</p>}
          {!komutlar.includes('onayla') && <p className="tc-rota-hata">Bu revizyonu sen gönderdin ya da düzenledin; dört göz kuralı gereği başka biri onaylar.</p>}
          <div className="tc-rota-dugmeler">
            {komutlar.includes('onayla') && <Dugme tur="birincil" simge="check" onClick={() => void calis('onayla', { surum, yururlugeAl: true })}>Onayla ve yürürlüğe al</Dugme>}
            {komutlar.includes('onayla') && <Dugme simge="check" onClick={() => void calis('onayla', { surum, yururlugeAl: false })}>Yalnız onayla</Dugme>}
            <Dugme simge="rotate" onClick={() => void calis('geri-gonder', { surum })}>Düzeltmeye geri gönder</Dugme>
          </div>
        </div>
      )}
      {panel === 'fark' && fark.data && (
        <div className="tc-rv-panel">
          <p>Yürürlükteki Rev {fark.data.karsilastirilan?.harf} ile farklar:</p>
          <ul className="tc-rota-farklar">{fark.data.farklar.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      {panel === 'diger' && (
        <div className="tc-rv-panel">
          <div className="tc-rota-dugmeler">
            <Dugme simge="list" onClick={() => panelYaz('gecmis')}>Revizyon geçmişi</Dugme>
            {V && komutlar.includes('kopyala') && <Dugme simge="layers" onClick={() => { panelYaz(null); p.kopyalaAc(V.id); }}>Rotayı başka ürüne kopyala</Dugme>}
            {V?.durum === 'taslak' && komutlar.includes('kaydet') && liste[0] && liste[0].id !== V.id && ayrinti && (
              <Dugme simge="rotate" onClick={() => {
                if (silahli === 'ilk' && liste[0]) { void p.ilkRevizyonaCevir(p.urunId, ayrinti.revizyon, liste[0]).then(() => { panelYaz(null); silahliYaz(null); }); } else silahliYaz('ilk');
              }}>{silahli === 'ilk' ? `Emin misin? Rev ${V.harf} iptal olur, Rev ${liste[0].harf} temel alınır` : 'Taslağı ilk revizyona çevir'}</Dugme>
            )}
            {V?.durum === 'taslak' && komutlar.includes('iptal') && (
              <Dugme tur="tehlike" simge="x" onClick={() => { if (silahli === 'iptal') void calis('iptal', { surum }); else silahliYaz('iptal'); }}>
                {silahli === 'iptal' ? 'Emin misin? Taslağı iptal et' : 'Taslağı iptal et'}
              </Dugme>
            )}
          </div>
        </div>
      )}
      {panel === 'gecmis' && (
        <div className="tc-rv-panel">
          <table className="tc-rv-gecmis">
            <thead><tr><th>Rev</th><th>Durum</th><th>Açılış</th><th>Onay</th><th>Yürürlüğe giriş</th><th /></tr></thead>
            <tbody>
              {liste.map((r) => (
                <tr key={r.id}>
                  <td>Rev {r.harf}</td><td>{DURUM_ETIKETI[r.durum]}</td><td>{zamanMetni(r.acilma)}</td><td>{zamanMetni(r.onaylama)}</td><td>{zamanMetni(r.yururlugeAlma)}</td>
                  <td className="tc-rota-dugmeler">
                    <button type="button" className="tc-baglanti" onClick={() => { p.goster(p.urunId, r.id); panelYaz(null); }}>Göster</button>
                    {p.yazabilir && !acikRevizyon(liste) && (r.durum === 'onayli' || r.durum === 'yururlukte') && (
                      <button type="button" className="tc-baglanti" onClick={() => { void p.taslakAc(p.urunId, r.id).then(() => panelYaz(null)); }}>Bundan taslak aç</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
