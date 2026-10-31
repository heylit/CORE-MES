import { useState } from 'react';
import { Dugme, OnayPenceresi, Tablo } from '../../../../ortak/arayuz/index.ts';
import { GecmisDugmesi } from '../../../denetim/disari.ts';
import { tarih } from '../bicim.ts';
import {
  acikRevizyon, gkkUyarilari, REV_DURUMU, rotaEksikleri, rotaFarki, rotaSahibiOlur, yururlukteki, type Revizyon,
} from './kurallar.ts';
import type { RotaEkrani } from './ortak.tsx';
import type { RevEylemi } from './useRotaDuzeni.ts';

type Panel = 'gonder' | 'onay' | 'fark' | 'daha' | 'gecmis' | 'kopya' | null;
interface Onay { baslik: string; metin: string; onayMetni: string; tehlikeli?: boolean; yap: () => Promise<unknown> }

function SonDegisiklik({ r }: { r: RotaEkrani }) {
  const s = r.duzen.sonDegisiklik;
  if (!s) return null;
  const m = r.duzen.h.malzeme.get(s.urunId);
  const durum = r.duzen.kayitHatasi(s.urunId) ? 'kaydedilemedi' : r.duzen.taslakVar(s.urunId) ? 'kaydediliyor' : 'taslağa kaydedildi';
  return <span className="tc-rr1-son" role="status">Son değişiklik: {m?.code ?? ''} {s.metin}, {durum}.</span>;
}

// Revizyon çubuğu (bugünkü ekranın revBar'ı): gösterilen revizyon, onay akışı, fark, geçmiş ve kopyalama.
export function RevizyonCubugu({ r, agac, urunId, urunSec }: {
  r: RotaEkrani; agac: readonly string[]; urunId: string; urunSec: (id: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [not, setNot] = useState('');
  const [hedef, setHedef] = useState('');
  const [onay, setOnay] = useState<Onay | null>(null);
  const { duzen, yetki } = r;
  const { h } = duzen;
  const m = h.malzeme.get(urunId);
  if (!m || m.type === 'ham') return null;
  const revs = duzen.revler(urunId);
  const A = yururlukteki(revs);
  const O = acikRevizyon(revs);
  const V = duzen.gorulen(urunId);
  const taslak = duzen.taslakVar(urunId);
  const adimlar = duzen.adimlar(urunId);
  const adlar = {
    op: (id: string) => h.op.get(id)?.name ?? '?',
    istasyon: (id: string | null) => (id ? h.istasyon.get(id)?.code ?? '?' : 'yok'),
    malzeme: (id: string) => h.malzeme.get(id)?.code ?? '?',
  };
  const gosterilenAcik = V === null ? taslak : V.status === 'taslak' || V.status === 'onay';
  const fark = gosterilenAcik || (V && A && V.id !== A.id) ? rotaFarki(A?.data.steps ?? [], adimlar, adlar) : [];
  const taslaklar = agac.filter((x) => acikRevizyon(duzen.revler(x)) !== null || duzen.taslakVar(x));
  const eksikler = rotaEksikleri(adimlar, duzen.malzemeVar, duzen.opAdi);
  const gkksizler = gkkUyarilari(adimlar, (id) => h.op.get(id)?.code ?? null, duzen.opAdi);
  const ac = (p: Panel) => { setPanel(panel === p ? null : p); if (p === 'gonder') setNot(duzen.taslakNotu(urunId) ?? V?.note ?? ''); };
  const eylem = async (e: RevEylemi, rev: Revizyon | null, n?: string) => {
    if (await duzen.revEylemi(e, urunId, rev?.id ?? null, n)) setPanel(null);
  };
  const durumu = V ? V.status : taslak ? 'taslak' : null;
  const onaylayabilir = yetki.rotaOnayla;

  return (
    <div className={`tc-rr1-revbar${durumu && durumu !== 'yururlukte' ? ' tc-rr1-has-open' : ''}`}>
      {(taslaklar.length > 0 || duzen.sonDegisiklik) && (
        <div className="tc-rr1-rv-row tc-rr1-rv-status">
          <SonDegisiklik r={r} />
          {taslaklar.length > 0 && <span className="tc-rr1-ipucu">Bu şemadaki taslaklar:</span>}
          {taslaklar.map((x) => {
            const xo = acikRevizyon(duzen.revler(x));
            const xa = yururlukteki(duzen.revler(x));
            const n = rotaFarki(xa?.data.steps ?? [], duzen.adimlar(x), adlar).length;
            return (
              <button key={x} type="button" className={`tc-rr1-rvchip tc-rr1-rv-${xo?.status ?? 'taslak'} tc-rr1-as-btn${x === urunId ? ' tc-rr1-cur' : ''}`}
                onClick={() => { urunSec(x); setPanel('fark'); }}>
                {h.malzeme.get(x)?.code} {xo ? `Rev ${xo.no} ${xo.status === 'onay' ? 'onayda' : 'taslak'}` : 'yeni taslak'}, {n} değişiklik
              </button>
            );
          })}
        </div>
      )}
      <div className="tc-rr1-rv-row">
        {agac.length > 1 ? (
          <select className="tc-rr1-secim" value={urunId} aria-label="Revizyonu gösterilen rota" onChange={(e) => { urunSec(e.target.value); setPanel(null); }}>
            {agac.map((x) => (
              <option key={x} value={x}>{h.malzeme.get(x)?.code} rotası{acikRevizyon(duzen.revler(x)) || duzen.taslakVar(x) ? ' (taslak var)' : ''}</option>
            ))}
          </select>
        ) : <b className="tc-rr1-rv-t">{m.code} rotası</b>}
        <span className="tc-rr1-rv-list" role="group" aria-label="Revizyonlar">
          {revs.length === 0 && !taslak && <span className="tc-rr1-ipucu">Henüz revizyon yok</span>}
          {revs.map((x) => (
            <button key={x.id} type="button" className={`tc-rr1-rvtab tc-rr1-rv-${x.status}${V?.id === x.id ? ' tc-rr1-on' : ''}`}
              aria-pressed={V?.id === x.id} title={`${REV_DURUMU[x.status]}${x.note ? `: ${x.note}` : ''}`}
              onClick={() => { duzen.revSec(urunId, x.id); if (panel === 'gecmis') setPanel(null); }}>
              <b>Rev {x.no}</b><small>{REV_DURUMU[x.status]}</small>
            </button>
          ))}
          {taslak && !O && <span className="tc-rr1-rvtab tc-rr1-rv-taslak tc-rr1-on"><b>Yeni taslak</b><small>kaydediliyor</small></span>}
        </span>
        {duzen.duzenlenebilir(urunId) && gosterilenAcik && (
          <>
            <Dugme tur="ikincil" disabled={!duzen.geriAlinabilir(urunId)} title="Geri al (Ctrl+Z)" onClick={() => { duzen.geriAl(urunId, 'geri'); }}>Geri al</Dugme>
            <Dugme tur="ikincil" disabled={!duzen.yinelenebilir(urunId)} title="Yinele (Ctrl+Y)" onClick={() => { duzen.geriAl(urunId, 'ileri'); }}>Yinele</Dugme>
          </>
        )}
        <span className="tc-rr1-grow" />
        {yetki.rotaYaz && durumu === 'taslak' && <Dugme tur="birincil" simge="next" onClick={() => { ac('gonder'); }}>Onaya gönder…</Dugme>}
        {onaylayabilir && durumu === 'onay' && <Dugme tur="birincil" simge="check" onClick={() => { ac('onay'); }}>Onayla…</Dugme>}
        {onaylayabilir && V?.status === 'onayli' && (
          <Dugme tur="birincil" onClick={() => {
            setOnay({ baslik: `Rev ${V.no} yürürlüğe alınsın mı?`, metin: 'Plan ve Kanban bu revizyonla hesaplanır; önceki revizyon "Onaylı" olarak durur.',
              onayMetni: 'Yürürlüğe al', yap: () => eylem('yururlugeAl', V) });
          }}>Rev {V.no}&apos;yı yürürlüğe al</Dugme>
        )}
        {fark.length > 0 && (
          <Dugme tur="ikincil" aria-pressed={panel === 'fark'} onClick={() => { ac('fark'); }}>{fark.length} fark</Dugme>
        )}
        <GecmisDugmesi kayitlar={revs.flatMap((x) => (Number.isSafeInteger(Number(x.id)) ? [{ tablo: 'rota_revizyonu', anahtar: { id: Number(x.id) } }] : []))} />
        <Dugme tur="ikincil" simge="more" aria-pressed={panel === 'daha' || panel === 'gecmis' || panel === 'kopya'} onClick={() => { ac('daha'); }}>Revizyon</Dugme>
      </div>
      {eksikler.length > 0 && (
        <div className="tc-rr1-warnbox" role="alert">
          Rota eksik: {eksikler.map((x) => x.metin).join('; ')}.{' '}
          {V && (V.status === 'yururlukte' || V.status === 'onayli') ? 'Bu rotanın emirleri plana alınmaz; düzeltmek için yeni taslak aç.'
            : 'Taslak kaydedilir ama onaya gönderilemez ve emri plana alınmaz.'}
        </div>
      )}
      {gkksizler.length > 0 && (
        <div className="tc-rr1-warnbox" role="status">
          Fason dönüşünde GKK yok: {gkksizler.map((x) => x.metin).join('; ')}. Onayı durdurmaz; emir açılınca fasonun arkasına otomatik GKK eklenir.
        </div>
      )}
      {duzen.kayitHatasi(urunId) && (
        <div className="tc-rr1-warnbox" role="alert">Taslak rota modülüne kaydedilemedi: {duzen.kayitHatasi(urunId)}</div>
      )}
      {V && V.status !== 'yururlukte' && (
        <div className="tc-rr1-rv-row tc-rr1-rv-note">
          <span className="tc-rr1-ipucu">
            {V.status === 'onayli'
              ? `Rev ${V.no} gösteriliyor (onaylı, yürürlükte değil).${O || taslak ? ` Açık taslak Rev ${O?.no ?? ''} var; değiştirmek için onu göster.` : ' Değiştirirsen bundan yeni bir taslak açılır.'}`
              : `Rev ${V.no} ${V.status === 'onay' ? 'onay bekliyor' : 'taslak'}: plan yürürlükteki Rev ${A?.no ?? '–'} ile devam ediyor.`}
            {V.note ? ` Not: ${V.note}` : ''}
          </span>
        </div>
      )}
      {V?.status === 'yururlukte' && (O || taslak) && (
        <div className="tc-rr1-rv-row tc-rr1-rv-note"><span className="tc-rr1-ipucu">Yürürlükteki Rev {V.no} gösteriliyor; açık taslağı düzenlemek için onu seç.</span></div>
      )}
      {panel === 'gonder' && durumu === 'taslak' && (
        <div className="tc-rr1-rv-panel tc-rr1-rv-row">
          <input className="tc-rr1-metin tc-rr1-grow" value={not} placeholder="Bu revizyonda ne değişti?" aria-label="Revizyon notu" maxLength={300}
            onChange={(e) => { setNot(e.target.value); }} />
          <Dugme tur="birincil" disabled={duzen.mesgul} onClick={() => { void eylem('gonder', O, not); }}>Onaya gönder</Dugme>
        </div>
      )}
      {panel === 'onay' && V?.status === 'onay' && onaylayabilir && (
        <div className="tc-rr1-rv-panel tc-rr1-rv-row">
          <Dugme tur="birincil" disabled={duzen.mesgul} onClick={() => {
            setOnay({ baslik: `Rev ${V.no} onaylanıp yürürlüğe alınsın mı?`, metin: 'Açık emirler yeni revizyonla planlanır; revizyon sabitlenmiş emirler etkilenmez.',
              onayMetni: 'Onayla ve yürürlüğe al', yap: () => eylem('onayla', V) });
          }}>Onayla ve yürürlüğe al</Dugme>
          <Dugme tur="ikincil" disabled={duzen.mesgul} onClick={() => { void eylem('yalnizOnayla', V); }}>Yalnızca onayla</Dugme>
          <Dugme tur="ikincil" disabled={duzen.mesgul} onClick={() => { void eylem('geriGonder', V); }}>Düzeltmeye geri gönder</Dugme>
        </div>
      )}
      {panel === 'fark' && (
        <div className="tc-rr1-rv-panel">
          <p className="tc-rr1-ipucu">{V ? `Rev ${V.no}` : 'Yeni taslak'}, yürürlükteki Rev {A?.no ?? '–'} ile karşılaştırılıyor:</p>
          {fark.length > 0 ? <ul className="tc-rr1-liste">{fark.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="tc-rr1-ipucu">Fark yok.</p>}
        </div>
      )}
      {panel === 'daha' && (
        <div className="tc-rr1-rv-panel tc-rr1-rv-row">
          {yetki.rotaYaz && (O || taslak) && revs.length > 0 && (
            <Dugme tur="ikincil" onClick={() => { duzen.ilkRevizyonaCevir(urunId); setPanel(null); }}>Taslağı ilk revizyona çevir</Dugme>
          )}
          {yetki.rotaYaz && (O || taslak) && (
            <Dugme tur="tehlike" simge="trash" onClick={() => {
              setOnay({ baslik: 'Taslak silinsin mi?', metin: `${m.code} ${O ? `Rev ${O.no}` : 'yeni'} taslağı silinir; yürürlükteki rota kalır.`, onayMetni: 'Taslağı sil',
                tehlikeli: true, yap: () => eylem('sil', O) });
            }}>Taslağı sil</Dugme>
          )}
          {yetki.rotaYaz && !O && !taslak && V && (V.status === 'onayli' || V.status === 'yururlukte') && (
            <Dugme tur="ikincil" disabled={duzen.mesgul} onClick={() => { void duzen.yeniTaslak(urunId, V).then(() => { setPanel(null); }); }}>
              Rev {V.no}&apos;dan yeni taslak aç
            </Dugme>
          )}
          <Dugme tur="ikincil" onClick={() => { setPanel('gecmis'); }}>Geçmiş ({revs.length})</Dugme>
          {yetki.rotaYaz && <Dugme tur="ikincil" onClick={() => { setPanel('kopya'); }}>Rotayı başka ürüne kopyala</Dugme>}
        </div>
      )}
      {panel === 'gecmis' && (
        <div className="tc-rr1-rv-panel">
          <Tablo
            etiket={`${m.code} revizyon geçmişi`} satirlar={[...revs].reverse()} satirAnahtari={(x) => x.id} bosMesaj="Henüz revizyon yok."
            sutunlar={[
              { anahtar: 'no', baslik: 'Rev', hucre: (x) => <b>{x.no}</b> },
              { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <span className={`tc-rr1-rvchip tc-rr1-rv-${x.status}`}>{REV_DURUMU[x.status]}</span> },
              { anahtar: 'acildi', baslik: 'Açıldı', hucre: (x) => tarih(x.created) },
              { anahtar: 'onay', baslik: 'Onay', hucre: (x) => tarih(x.approvedAt) },
              { anahtar: 'not', baslik: 'Not', hucre: (x) => x.note },
              {
                anahtar: 'eylem', baslik: '', csv: false,
                hucre: (x) => (
                  <span className="tc-rr1-teylem">
                    <Dugme tur="ikincil" onClick={() => { duzen.revSec(urunId, x.id); setPanel(null); }}>Göster</Dugme>
                    {x.status === 'onayli' && onaylayabilir && (
                      <Dugme tur="ikincil" onClick={() => {
                        setOnay({ baslik: `Rev ${x.no} yürürlüğe alınsın mı?`, metin: 'Önceki revizyon "Onaylı" olarak durur.', onayMetni: 'Yürürlüğe al',
                          yap: () => eylem('yururlugeAl', x) });
                      }}>Yürürlüğe al</Dugme>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}
      {panel === 'kopya' && yetki.rotaYaz && (
        <div className="tc-rr1-rv-panel">
          <p className="tc-rr1-ipucu">Gösterilen revizyon ({V ? `Rev ${V.no}` : 'taslak'}) başka bir ürüne taslak revizyon olarak kopyalanır; orada değiştirip onaylarsın.</p>
          <div className="tc-rr1-rv-row">
            <select className="tc-rr1-secim" value={hedef} aria-label="Hedef ürün" onChange={(e) => { setHedef(e.target.value); }}>
              <option value="">Seç…</option>
              {[...h.malzeme.values()].filter((x) => x.id !== urunId && rotaSahibiOlur(x, duzen.adimlar(x.id).length, duzen.revler(x.id).length)).map((x) => (
                <option key={x.id} value={x.id}>{x.code} {x.name}{duzen.adimlar(x.id).length ? ' (rotası var, yeni revizyon olur)' : ''}</option>
              ))}
            </select>
            <Dugme tur="birincil" onClick={() => { if (duzen.kopyala(urunId, hedef)) { setPanel(null); urunSec(hedef); r.kokSec(hedef); } }}>Kopyala ve aç</Dugme>
          </div>
          <p className="tc-rr1-ipucu">Listede olmayan malzeme Malzemeler ve Hizmetler&apos;de açılır; kart onaylanınca burada seçilebilir.</p>
        </div>
      )}
      <OnayPenceresi
        acik={onay !== null} baslik={onay?.baslik ?? ''} onayMetni={onay?.onayMetni ?? 'Tamam'} tehlikeli={onay?.tehlikeli ?? false} yukleniyor={duzen.mesgul}
        onayla={() => { const o = onay; setOnay(null); if (o) void o.yap(); }} vazgec={() => { setOnay(null); }}
      >
        {onay?.metin}
      </OnayPenceresi>
    </div>
  );
}
