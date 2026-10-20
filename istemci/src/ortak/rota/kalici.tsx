import { Suspense, createContext, useContext, useEffect, useRef, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { DurumKutusu } from '../arayuz/DurumKutusu.tsx';
import { HataSiniri } from '../arayuz/HataSiniri.tsx';
import type { ModulRotasi } from './kesif.ts';

const EkranGorunurBaglami = createContext(true);

// Kalıcı ekran gizliyken de çalışır; adres değiştirmek gibi kullanıcıyı o ekrana çeken işi yalnız görünürken yapar.
export const useEkranGorunur = (): boolean => useContext(EkranGorunurBaglami);

// Tarayıcı boşta beklemeyi bilmiyorsa kısa bir gecikme yeter: amaç ilk çizimle yarışmamaktır.
function bostaCalistir(is: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const kimlik = window.requestIdleCallback(is);
    return () => { window.cancelIdleCallback(kimlik); };
  }
  const zaman = window.setTimeout(is, 1000);
  return () => { window.clearTimeout(zaman); };
}

// Kalıcı rota (ModulRotasi.kalici) ilk açılışta kurulur, başka sayfaya geçince silinmez, gizlenir: dönüşte yeniden yüklenmez,
// yarım iş yerinde kalır. Oturum kapanınca ya da sayfa kapatılınca kabukla birlikte kalkar. Rotanın kendi yerinde boş eleman durur.
export function KaliciEkranlar({ rotalar }: { rotalar: readonly ModulRotasi[] }) {
  const { pathname } = useLocation();
  const [acilmis, acilmisYaz] = useState<readonly string[]>([]);
  const aktif = rotalar.find((r) => matchPath(r.yol, pathname) !== null)?.yol ?? null;
  useEffect(() => {
    if (aktif !== null && !acilmis.includes(aktif)) acilmisYaz((l) => [...l, aktif]);
  }, [aktif, acilmis]);
  // Yetkisi düşen ya da kapatılan sayfanın ekranı listeden çıkınca kalkar.
  // Liste yalnız görebildiği sayfaları taşır (rotaPlani): başka rolün prototipi indirilmez. Yükleme hatası sessizdir,
  // açılışta ekran kendi hatasını gösterir.
  const yuklenen = useRef(new Set<string>());
  useEffect(() => {
    const bekleyen = rotalar.filter((r) => r.onYukle !== undefined && !yuklenen.current.has(r.yol));
    if (bekleyen.length === 0) return undefined;
    return bostaCalistir(() => {
      for (const r of bekleyen) {
        yuklenen.current.add(r.yol);
        void r.onYukle?.().catch(() => undefined);
      }
    });
  }, [rotalar]);
  const kurulu = rotalar.filter((r) => r.yol === aktif || acilmis.includes(r.yol));
  return kurulu.map((r) => (
    <div key={r.yol} className="tc-kalici-ekran" hidden={r.yol !== aktif}>
      <EkranGorunurBaglami.Provider value={r.yol === aktif}>
        <HataSiniri>
          <Suspense fallback={<DurumKutusu durum="yukleniyor" />}><r.ekran /></Suspense>
        </HataSiniri>
      </EkranGorunurBaglami.Provider>
    </div>
  ));
}
