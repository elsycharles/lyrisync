/**
 * UI strings. French is the source language; English must mirror its shape exactly
 * (enforced by the `Messages` type).
 */
export const fr = {
  app: {
    tagline: 'Paroles synchronisées, directement dans le navigateur',
    footer: 'Tout se passe dans votre navigateur. Aucun fichier n’est envoyé à un serveur.',
    languageToggle: 'English',
    languageToggleLabel: 'Switch to English',
    theme: { system: 'Thème auto', light: 'Thème clair', dark: 'Thème sombre' },
    themeLabel: 'Changer de thème',
  },
};

export type Messages = typeof fr;

export const en: Messages = {
  app: {
    tagline: 'Synced lyrics, right in your browser',
    footer: 'Everything runs in your browser. No file is ever sent to a server.',
    languageToggle: 'Français',
    languageToggleLabel: 'Passer en français',
    theme: { system: 'Auto theme', light: 'Light theme', dark: 'Dark theme' },
    themeLabel: 'Change theme',
  },
};

export const messages = { fr, en } as const;
export type Lang = keyof typeof messages;
