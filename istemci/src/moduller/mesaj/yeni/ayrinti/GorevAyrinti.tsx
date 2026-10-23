import { useState } from 'react';
import { Dugme, Girdi, OnayPenceresi, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { gundenZaman, isoGun, kisaTarih } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { teslimEtiketi } from '../kurallar.ts';
import { durumDegistirebilir, iz, useIsEylemleri } from '../kartlar/eylemler.ts';
import { TeslimEtiketi } from '../kartlar/parcalar.tsx';
import { yerelZaman, yereldenZaman } from '../isler/form-parcalari.tsx';
import { GOREV_DURUMLARI, KisiRozeti, KisiSecici } from '../ortak/index.ts';
import type { GorevDurumu } from '../tipler.ts';
import { duzenleyebilir } from '../yetki.ts';
import { NotListesi } from './Notlar.tsx';
import { Baslik, Bolum, KaynakBaglantisi, Ozellik, YerindeMetin } from './parcalar.tsx';

const DURUMLAR = Object.keys(GOREV_DURUMLARI) as GorevDurumu[];
const sessiz = (p: Promise<unknown>) => { p.catch(() => undefined); };

// Prototipin taskDetail'i. 225 a: durumu alan da değiştirir; diğer alanlar ve silme veren ile yöneticide.
export function GorevAyrinti({ id, kapat }: { id: string; kapat: () => void }) {
  const { ben, ad, veri, yetki, yaz, siparisler } = useMesaj();
  const { gorevDurumu, gorevIcs } = useIsEylemleri();
  const { bildir } = useBildirim();
  const [silinsin, silinsinYaz] = useState(false);
  // "Değiştir" seçiciyi aramaya açar; kişi seçilince yazılır ve kayıttaki değer yeniden gösterilir.
  const [kimeAraniyor, kimeAraniyorYaz] = useState(false);
  const t = veri.gorevler.find((g) => g.id === id);
  if (!t) return <p className="tc-mi-bos-kucuk">Bu görev silinmiş.</p>;
  const W = !duzenleyebilir(t, yetki, ben.id);
  const durumKapali = !durumDegistirebilir(t, yetki, ben.id);
  const guncelle = (yama: Record<string, unknown>) => sessiz(yaz.guncelle(`tasks/${t.id}`, yama));
  const secenekler = (siparisler ?? []).filter((o) => o.durum !== 'sevk' || o.id === t.orderId).map((o) => ({ deger: o.id, baslik: `#${o.no} ${o.musteri}` }));
  return (
    <div className="tc-mi-sayfa">
      <Baslik
        simge={t.status === 'done' ? 'check' : 'clipboard-check'}
        baslik={(
          <YerindeMetin
            className="tc-mi-sayfa-baslik-girdi" rows={1} tekSatir disabled={W} aria-label="Görev başlığı" deger={t.title}
            kaydet={(v) => { if (v.trim()) guncelle({ title: v.trim() }); }}
          />
        )}
      />
      <dl className="tc-mi-ozellikler">
        <Ozellik simge="check" ad="Durum">
          <div className="tc-mi-secim" role="group" aria-label="Durum">
            {DURUMLAR.map((s) => (
              <button key={s} type="button" aria-pressed={t.status === s} disabled={durumKapali} onClick={() => gorevDurumu(t.id, s)}>{GOREV_DURUMLARI[s].t}</button>
            ))}
          </div>
        </Ozellik>
        <Ozellik simge="user" ad="Kime">
          {!W
            ? (
              <KisiSecici
                etiket="Kime" deger={kimeAraniyor ? null : t.to} kendim
                degisti={(kisi) => {
                  kimeAraniyorYaz(kisi === null);
                  if (kisi !== null && kisi !== t.to) guncelle({ to: kisi, last: iz(ben.id, 'görevi başkasına verdi') });
                }}
              />
            )
            : <span className="tc-mi-ust">{t.to && <KisiRozeti id={t.to} boyut="s" />}{t.to ? ad(t.to) : 'Atanmamış'}</span>}
        </Ozellik>
        <Ozellik simge="users" ad="Veren">
          <span className="tc-mi-ust"><KisiRozeti id={t.by} boyut="s" />{ad(t.by)}, {kisaTarih(t.createdAt || Date.now())}</span>
        </Ozellik>
        <Ozellik simge="clock" ad="Ne zamana">
          <span className="tc-mi-ust">
            <Girdi etiket="Son tarih" type="date" disabled={W} value={t.due ? isoGun(t.due) : ''} onChange={(o) => guncelle({ due: gundenZaman(o.target.value) })} />
            {t.status !== 'done' && <TeslimEtiketi etiket={teslimEtiketi(t.due)} />}
          </span>
        </Ozellik>
        <Ozellik simge="bell" ad="Hatırlat">
          <Girdi etiket="Hatırlatma" type="datetime-local" disabled={W} value={yerelZaman(t.remind)} onChange={(o) => guncelle({ remind: yereldenZaman(o.target.value) })} />
        </Ozellik>
        {secenekler.length > 0 && (
          <Ozellik simge="box" ad="Sipariş">
            <Secim etiket="Bağlı sipariş" bosSecenek="Yok" disabled={W} secenekler={secenekler} value={t.orderId ?? ''} onChange={(o) => guncelle({ orderId: o.target.value || null })} />
          </Ozellik>
        )}
      </dl>
      <Bolum baslik="Açıklama">
        <YerindeMetin
          className="tc-alan-kutu tc-alan-cok" rows={3} disabled={W} placeholder="Ayrıntı ekle…" aria-label="Açıklama" deger={t.note ?? ''}
          kaydet={(v) => guncelle({ note: v })}
        />
      </Bolum>
      <div className="tc-mi-eylemler">
        {(t.due || t.remind) && <Dugme simge="download" onClick={() => gorevIcs(t.id)}>Telefona / takvime ekle</Dugme>}
        {!W && <Dugme tur="tehlike" simge="trash" onClick={() => silinsinYaz(true)}>Sil</Dugme>}
      </div>
      <KaynakBaglantisi cid={t.cid} mid={t.mid} />
      <NotListesi koleksiyon="tasks" id={t.id} />
      <OnayPenceresi
        acik={silinsin} baslik="Görev silinsin mi?" onayMetni="Sil" tehlikeli vazgec={() => silinsinYaz(false)}
        onayla={() => {
          silinsinYaz(false);
          void yaz.sil(`tasks/${t.id}`).then(() => { bildir('tamam', 'Görev silindi.'); kapat(); }).catch(() => undefined);
        }}
      >
        <p>Görev herkes için kaldırılır.</p>
      </OnayPenceresi>
    </div>
  );
}
