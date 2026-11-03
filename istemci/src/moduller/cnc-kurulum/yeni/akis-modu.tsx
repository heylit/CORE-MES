import { cizimModu, useCizimModu } from './sahne/Sahne.tsx';

// Kurulum ve Takım Ömrü'nün gezinme biçimi (1843) modülün tek 2B/3D seçiminden gelir (1921 a): 2B kartlı akış, 3D çark. Ayrı
// düğmesi yoktur; seçim üst şeritteki çizim modu anahtarıyla yapılır. Kartlı akışta sürekli 3B çizim yoktur.
export type AkisModu = 'kart' | 'cark';
const akisi = (m: '3d' | '2b'): AkisModu => (m === '3d' ? 'cark' : 'kart');
export function akisModu(): AkisModu { return akisi(cizimModu()); }
export function useAkisModu(): AkisModu { return akisi(useCizimModu()); }
