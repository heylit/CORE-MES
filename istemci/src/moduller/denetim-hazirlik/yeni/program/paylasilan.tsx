import { useCallback } from 'react';
import { useDenetim } from '../baglam.tsx';
import { aktifSorular } from '../kurallar/puan.ts';
import type { HaftaMaddesi } from '../kurallar/hafta.ts';
import { hizliTurSec } from './hesaplar.ts';
import { PSimge } from './ortak.tsx';

// Birden çok program ekranının kullandığı eylemler (hızlı tur, soruya git, işaretler) ve haftalık görev satırı.

// Hızlı tur: yeni 10 soru seçilir, simülasyon hızlı kipte ilk sorudan açılır. Önceki tur varsa geri alınabilir.
export function useHizliTur(): () => void {
  const d = useDenetim();
  const { degistir, ekranDegistir, git, kb, program } = d;
  return useCallback(() => {
    const ids = hizliTurSec(kb);
    degistir(kb.calisma.quick.length ? 'Hızlı tur' : null, (t) => { t.pw[program].quick = ids; });
    ekranDegistir((e) => { const p = e.pw[program]; p.mode = 'quick'; p.cur = 0; p.curQ = 0; });
    git('sim');
  }, [degistir, ekranDegistir, git, kb, program]);
}

// Soruya git (ısı haritası, aksiyon planı, haftalık görev): tam kipte o soru açılır.
export function useSoruyaGit(): (qid: string) => void {
  const d = useDenetim();
  const { ekranDegistir, git, kb, program } = d;
  return useCallback((qid: string) => {
    const i = aktifSorular(kb.pg, kb.calisma.def).findIndex((x) => x.id === qid);
    ekranDegistir((e) => { const p = e.pw[program]; p.mode = 'full'; if (i >= 0) p.cur = i; });
    git('sim');
  }, [ekranDegistir, git, kb, program]);
}

// Kayıttaki işaret alanları: hazırlık görevi, aksiyon kapanışı, doküman.
export function useIsaret(): (alan: 'checks' | 'done' | 'docs', id: string, deger: boolean, bildirim?: string) => void {
  const d = useDenetim();
  const { degistir, bildir, program } = d;
  return useCallback((alan, id, deger, bildirim) => {
    degistir(null, (t) => {
      const w = t.pw[program];
      // Örnek kipinde aksiyon kapanışı örneğe yazılır; kişinin kapanışları değişmez (prototip doneMap).
      const hedef = alan === 'done' && w.example ? w.exDone : w[alan];
      if (deger) hedef[id] = true; else if (alan === 'checks') hedef[id] = false; else delete hedef[id];
    });
    if (deger && bildirim) bildir(bildirim);
  }, [degistir, bildir, program]);
}

const TUR_SIMGESI: Record<HaftaMaddesi['k'], string> = { prep: 'calcheck', risk: 'alert', oz: 'repeat', cards: 'msg', dl: 'flag', audit: 'award', custom: 'user' };

// Haftalık görev satırı (prototip wkItem): işaretlenebilenler kayda yazar; öz değerlendirme ve kart görevleri kendiliğinden kapanır.
export function HaftaMaddesiSatiri({ it }: { it: HaftaMaddesi }) {
  const d = useDenetim();
  const isaret = useIsaret();
  const soruyaGit = useSoruyaGit();
  const yaz = d.yetki.yazabilir;
  const sabit = it.k === 'dl' || it.k === 'audit';
  const otomatik = it.k === 'oz' || it.k === 'cards';
  const isaretlenir = it.k === 'prep' || it.k === 'risk' || it.k === 'custom';
  const degistir = (deger: boolean) => {
    if (it.k === 'prep') isaret('checks', it.id, deger, 'Görev tamamlandı');
    else if (it.k === 'risk') isaret('done', it.id, deger, 'Aksiyon kapatıldı');
    else if (it.k === 'custom') {
      d.degistir(null, (t) => { const c = t.pw[d.program].wkx.find((x) => x.id === it.id); if (c) c.done = deger; });
      if (deger) d.bildir('Görev tamamlandı');
    }
  };
  const alt = it.sub ?? (otomatik ? (it.done ? 'Tamamlandı (otomatik)' : 'Yapınca otomatik işaretlenir') : undefined);
  const etiketTonu = it.k === 'risk' ? (it.lvl === 'major' ? ' tc-dhy-ton-kotu' : ' tc-dhy-ton-uyari') : '';
  return (
    <li className={`tc-dhp-gorev${it.done && !sabit ? ' tc-dhp-gorev-tamam' : ''}${sabit ? ' tc-dhp-gorev-sabit' : ''}`}>
      {isaretlenir
        ? <input type="checkbox" checked={it.done} disabled={!yaz} aria-label={it.t} onChange={(e) => { degistir(e.target.checked); }} />
        : <span className="tc-dhp-gorev-bos" aria-hidden="true" />}
      <span className={`tc-dhp-gorev-simge tc-dhp-gorev-${it.k}`}><PSimge ad={TUR_SIMGESI[it.k]} /></span>
      <span className="tc-dhp-gorev-metin">
        <span>{it.t}</span>
        {alt && <small>{alt}</small>}
      </span>
      {it.tag && <span className={`tc-dhp-madde${etiketTonu}`}>{it.tag}</span>}
      {it.k === 'oz' && <button type="button" className="tc-dhp-baglanti" onClick={() => { d.git('kontrol'); }}>Başlat</button>}
      {it.k === 'cards' && it.dept && (
        <button type="button" className="tc-dhp-baglanti" onClick={() => { const k = it.dept ?? ''; d.ekranDegistir((e) => { const p = e.pw[d.program]; p.dept = k; p.card = 0; p.flipped = false; }); d.git('sorular'); }}>Aç</button>
      )}
      {it.k === 'risk' && <button type="button" className="tc-dhp-baglanti" onClick={() => { soruyaGit(it.id); }}>Soru</button>}
      {it.k === 'custom' && yaz && (
        <button type="button" className="tc-dhp-baglanti" aria-label="Görevi sil" title="Görevi sil" onClick={() => {
          d.degistir('Görev silme', (t) => { t.pw[d.program].wkx = t.pw[d.program].wkx.filter((x) => x.id !== it.id); });
        }}><PSimge ad="x" /></button>
      )}
    </li>
  );
}
