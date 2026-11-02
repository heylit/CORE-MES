import { useSyncExternalStore } from 'react';
import { Dugme } from '../../../ortak/arayuz/index.ts';
import { glAl } from './sahne/gl.ts';

// Kurulum ve Takım Ömrü'nün gezinme biçimi (1843): kartlı akış varsayılandır; 3D çark seçilebilir. Kartlı akışta sürekli 3B çizim
// yoktur (ölçüm: çark boşta da her karede çiziliyordu). Seçim her bilgisayarın kendi tercihidir, tarayıcıda tutulur; 3D açılamayan
// bilgisayarda yalnız kartlı akış vardır.
export type AkisModu = 'kart' | 'cark';
const ANAHTAR = 'tmiv2.cnc-kurulum.akis-modu';
const dinleyiciler = new Set<() => void>();
let mod: AkisModu = ilkMod();

function ilkMod(): AkisModu {
  if (glAl() === null) return 'kart';
  let kayitli: string | null = null;
  try { kayitli = localStorage.getItem(ANAHTAR); } catch { /* tarayıcı deposu kapalı */ }
  return kayitli === 'cark' ? 'cark' : 'kart';
}
export function akisModu(): AkisModu { return mod; }
export function akisModunuSec(m: AkisModu): void {
  const yeni: AkisModu = m === 'cark' && glAl() !== null ? 'cark' : 'kart';
  if (yeni === mod) return;
  mod = yeni;
  try { localStorage.setItem(ANAHTAR, yeni); } catch { /* tarayıcı deposu kapalı */ }
  for (const d of dinleyiciler) d();
}
export function useAkisModu(): AkisModu {
  return useSyncExternalStore((d) => { dinleyiciler.add(d); return () => { dinleyiciler.delete(d); }; }, akisModu, akisModu);
}

export function AkisModuSecici() {
  const m = useAkisModu(), uc = glAl() !== null;
  return (
    <span className="tc-cy-mod" role="group" aria-label="Gezinme biçimi">
      <Dugme tur={m === 'kart' ? 'birincil' : 'ikincil'} simge="list" aria-pressed={m === 'kart'} title="Kartlı akış (hafif)" onClick={() => { akisModunuSec('kart'); }}>Kartlar</Dugme>
      <Dugme tur={m === 'cark' ? 'birincil' : 'ikincil'} simge="cube" aria-pressed={m === 'cark'} disabled={!uc}
        title={uc ? '3D çark' : 'Bu bilgisayarda 3D çizim kapalı (ekran kartı yok)'} onClick={() => { akisModunuSec('cark'); }}>3D çark</Dugme>
    </span>
  );
}
