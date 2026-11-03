import { useRegisterSW } from 'virtual:pwa-register/react';
import { useI18n } from '../i18n/useI18n';

/** Offline-ready notice and "new version" prompt from the service worker. */
export function UpdatePrompt() {
  const { t } = useI18n();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('[lyrisync] service worker registration failed', error);
    },
  });

  if (!offlineReady && !needRefresh) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="toast" role="status">
      <span>{needRefresh ? t.pwa.updateAvailable : t.pwa.offlineReady}</span>
      <div className="toast__actions">
        {needRefresh && (
          <button type="button" className="btn btn--primary btn--small" onClick={() => void updateServiceWorker(true)}>
            {t.pwa.reload}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--small" onClick={close}>
          {t.pwa.dismiss}
        </button>
      </div>
    </div>
  );
}
