import { useEffect, useState } from 'react';
import type { KapanmaAyrintisi, KapanmaSatiri } from '#paylasilan/sozlesme/saglik.ts';
import { Dugme, DurumKutusu, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { GUNLUK_DUZEY_BILGISI, NEDEN_BILGISI, cikisKoduAciklamasi, gunlukDosyasiVarMi, kapanmaGunlukAdresi, kapanmaOzeti, yerelGun, yerelSaat, type IzlemeAdresi } from './kapanma-yorumu.ts';
import { useKapanma, useKapanmalar } from './kapanma-sorgusu.ts';
import { baytMetni } from './saglik-ozeti.ts';
import { sureMetni } from './sure.ts';

const zamanMetni = (iso: string): string => `${yerelGun(iso).split('-').reverse().slice(0, 2).join('.')} ${yerelSaat(iso)}`;

// Dar ekranda (telefon) kayıt seçilince ayrıntı tek başına görünür ve "Geri" listeye döner; geniş ekranda yan yana durur.
function useGenisEkran(): boolean {
  const [genis, genisYaz] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 801px)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const m = window.matchMedia('(min-width: 801px)');
    const dinle = () => { genisYaz(m.matches); };
    m.addEventListener('change', dinle);
    return () => { m.removeEventListener('change', dinle); };
  }, []);
  return genis;
}

function NedenRozeti({ neden }: { neden: KapanmaSatiri['neden'] }) {
  const b = NEDEN_BILGISI[neden];
  return <Rozet ton={b.ton}><Simge ad={b.simge} boyut="k" /> {b.ad}</Rozet>;
}

function Ayrinti({ k, simdi, git }: { k: KapanmaAyrintisi; simdi: number; git: (a: IzlemeAdresi) => void }) {
  const gunlukVar = gunlukDosyasiVarMi(k.kapandiAn, simdi);
  return (
    <div className="tc-izleme-ayrinti">
      <p className="tc-izleme-ozet" data-ton={NEDEN_BILGISI[k.neden].ton}>{kapanmaOzeti(k)}</p>
      <dl className="tc-sistem-liste">
        <dt>Neden</dt><dd><NedenRozeti neden={k.neden} /></dd>
        <dt>Dayanak</dt><dd>{k.kanit ?? 'Tanı raporu ve bekçi günlüğünde neden bulunamadı'}</dd>
        <dt>Çıkış</dt><dd>{cikisKoduAciklamasi(k)}</dd>
        <dt>Bellek</dt><dd>{k.bellek === null ? 'yok' : `Yığın ${baytMetni(k.bellek.yiginBayt)}, süreç ${baytMetni(k.bellek.rssBayt)}`}</dd>
        <dt>Süren istekler</dt>
        <dd>
          {k.surenIstekler.length === 0 ? 'yok' : k.surenIstekler.map((i, n) => (
            <span key={`${String(n)}-${i.adres}`} className="tc-izleme-satir">{i.yontem} {i.adres}{i.kisiId === null ? '' : ` · kişi ${String(i.kisiId)}`} · {sureMetni(i.sureSn)}</span>
          ))}
        </dd>
      </dl>
      <p className="tc-sistem-soluk">{k.hataSatirlari.length} hata satırı (en çok 50 saklanır)</p>
      {k.hataSatirlari.length > 0 && (
        <pre className="tc-izleme-kod">{k.hataSatirlari.map((h) => `${yerelSaat(h.zaman)} ${GUNLUK_DUZEY_BILGISI[h.duzey].ad.toLocaleUpperCase('tr-TR')} ${h.ileti}${h.hataKodu === null ? '' : `  [hata kodu ${h.hataKodu}]`}`).join('\n')}</pre>
      )}
      <Dugme simge="search" disabled={!gunlukVar} onClick={() => { git(kapanmaGunlukAdresi(k)); }}>Günlükte bu saati aç ({zamanMetni(k.kapandiAn)})</Dugme>
      {!gunlukVar && <p className="tc-sistem-soluk">Günlük dosyası silinmiş (60 gün saklanır).</p>}
    </div>
  );
}

export function KapanmalarSekmesi({ kayit, sec, git, simdi = Date.now() }: { kayit: number | null; sec: (id: number | null) => void; git: (a: IzlemeAdresi) => void; simdi?: number }) {
  const liste = useKapanmalar();
  const genis = useGenisEkran();
  const kapanmalar = liste.data?.kapanmalar ?? [];
  // Geniş ekranda seçim yoksa en yeni kayıt açılır; dar ekranda liste görünür.
  const secili = kayit ?? (genis ? (kapanmalar[0]?.id ?? null) : null);
  const ayrinti = useKapanma(secili);

  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" hata={liste.error} yenile={() => { void liste.refetch(); }} />;
  if (kapanmalar.length === 0) return <DurumKutusu durum="bos" mesaj="Son 90 günde sunucu kapanması kaydedilmedi" />;

  return (
    <div className="tc-izleme-kapanmalar" data-secili={secili !== null ? '' : undefined}>
      <ul className="tc-izleme-liste" aria-label="Kapanmalar">
        {kapanmalar.map((k) => (
          <li key={k.id} aria-current={k.id === secili ? 'true' : undefined}>
            <button type="button" onClick={() => { sec(k.id); }}>
              <span className="tc-izleme-liste-ust">
                <strong>{k.id === secili && <Simge ad="check" boyut="k" />} {zamanMetni(k.kapandiAn)}</strong>
                <NedenRozeti neden={k.neden} />
              </span>
              <span className="tc-sistem-soluk">Kapalı kaldı: {sureMetni(k.kapaliSn)}</span>
            </button>
          </li>
        ))}
      </ul>
      {secili !== null && (
        <section className="tc-izleme-detay" aria-label="Kapanma ayrıntısı">
          <Dugme tur="ikincil" simge="chev-left" className="tc-izleme-geri" onClick={() => { sec(null); }}>Kapanmalar</Dugme>
          {ayrinti.isPending && <DurumKutusu durum="yukleniyor" />}
          {ayrinti.isError && <DurumKutusu durum="hata" hata={ayrinti.error} yenile={() => { void ayrinti.refetch(); }} />}
          {ayrinti.data && <Ayrinti k={ayrinti.data} simdi={simdi} git={git} />}
        </section>
      )}
    </div>
  );
}
