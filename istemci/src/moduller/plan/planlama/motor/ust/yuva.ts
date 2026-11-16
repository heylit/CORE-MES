import { createContext } from 'react';
import type { BekleyenDegisiklik } from '../../tipler.ts';

// Plan şeridinde sayfanın kendi içeriğini çizdiği iki yer (3317): şeridin satırında bir yuva ve şeridin altında bir yuva. Şerit sayfanın
// dışında, iskelette durur; sayfa içeriğini bu öğelere taşır (portal), böylece durum sayfada kalır. Yuva yokken ikisi de null.
// dis: bu açılışın birleşmesinden gelen, henüz kayda yazılmamış başka sayfa değişikliği (salt okunur kişide hiç yazılmaz); sayfa kendi listesine katar.
export interface SeritYuvalari { satir: HTMLElement | null; alt: HTMLElement | null; dis?: BekleyenDegisiklik | null }
export const SeritYuvasi = createContext<SeritYuvalari>({ satir: null, alt: null });
// Şeride verilir: yuva öğeleri bağlanınca iskelete bildirilir.
export interface SeritYuvaBaglari { satir: (el: HTMLElement | null) => void; alt: (el: HTMLElement | null) => void }
