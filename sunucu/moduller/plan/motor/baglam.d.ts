// Motor vm bağlamında koşar (plan-motoru.ts baglam): bağlamın verdiği adlar burada bildirilir.
// Sunucuda tesisin saat dilimi; çerçevede tanımsızdır, girdi.js yerel saate döner.
declare var GIRDI_SAAT_DILIMI: string | undefined;
// Bağlamın kendisi; kancalar bir kez kurulsun diye bayraklarını üstüne yazar.
declare var self: Record<string, unknown>;
