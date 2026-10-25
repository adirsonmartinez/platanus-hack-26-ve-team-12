// Which project files the chat may open with the computer's default app ("Abrir en el navegador"):
// pages, images and PDFs only, so a click can never run a script or a program. Pure; tested in
// fileOpen.test.js. Secrets are refused before this (isBlockedRealPath), and "Mostrar en la carpeta"
// only reveals the file.
const OPENABLE = /\.(?:html?|svg|pdf|png|jpe?g|gif|webp)$/i;

const canOpen = (rel) => OPENABLE.test(String(rel ?? ''));

module.exports = { canOpen };
