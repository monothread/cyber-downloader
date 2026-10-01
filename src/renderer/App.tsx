import { useEffect } from 'react';
import { AnimePanel } from './components/AnimePanel';
import { BinaryStatus } from './components/BinaryStatus';
import { HistoryList } from './components/HistoryList';
import { QueueList } from './components/QueueList';
import { SettingsPanel } from './components/SettingsPanel';
import { Toast } from './components/Toast';
import { UpdateBanner } from './components/UpdateBanner';
import { UrlInput } from './components/UrlInput';
import type { MessageKey } from '@shared/i18n';
import { useCursorGlow } from './hooks/useCursorGlow';
import { useAppLanguage, useTranslator } from './i18n/useTranslator';
import { useAnimeStore } from './store/animeStore';
import { useAppStore, type Tab } from './store/appStore';
import { applyTheme, DARK_SCHEME_QUERY, rememberTheme } from './theme/resolveTheme';

const TABS: ReadonlyArray<{ id: Tab; label: MessageKey }> = [
    { id: 'downloads', label: 'tab.downloads' },
    { id: 'anime', label: 'tab.anime' },
    { id: 'history', label: 'tab.history' },
    { id: 'settings', label: 'tab.settings' }
];

export function App() {
    const t = useTranslator();
    const language = useAppLanguage();
    const tab = useAppStore((state) => {
        return state.tab;
    });
    const setTab = useAppStore((state) => {
        return state.setTab;
    });
    const init = useAppStore((state) => {
        return state.init;
    });
    const ready = useAppStore((state) => {
        return state.binaries !== null;
    });
    const initAnime = useAnimeStore((state) => {
        return state.init;
    });
    // The anime section only exists on Linux; elsewhere its tab is left out.
    const animeSupported = useAnimeStore((state) => {
        return state.status.supported;
    });
    const visibleTabs = TABS.filter((item) => {
        return item.id !== 'anime' || animeSupported;
    });

    const theme = useAppStore((state) => {
        return state.settings.theme;
    });

    useCursorGlow(theme === 'cyberpunk');

    useEffect(() => {
        applyTheme(theme);
        rememberTheme(theme);
        if (theme !== 'device' || typeof window.matchMedia !== 'function') {
            return undefined;
        }
        const query = window.matchMedia(DARK_SCHEME_QUERY);
        const follow = (): void => {
            applyTheme('device');
        };
        query.addEventListener('change', follow);
        return () => {
            query.removeEventListener('change', follow);
        };
    }, [theme]);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    useEffect(() => {
        let dispose: (() => void) | null = null;
        let cancelled = false;
        void Promise.all([init(), initAnime()]).then(([unsubscribeApp, unsubscribeAnime]) => {
            const unsubscribe = (): void => {
                unsubscribeApp();
                unsubscribeAnime();
            };
            if (cancelled) {
                unsubscribe();
                return;
            }
            dispose = unsubscribe;
        });
        return () => {
            cancelled = true;
            dispose?.();
        };
    }, [init, initAnime]);

    return (
        <div className="app">
            <header className="app__header">
                <h1 className="logo" data-text="PULLWAVE">
                    PULLWAVE
                </h1>
                <BinaryStatus />
            </header>
            <UpdateBanner />
            <nav className="tabs" aria-label={t('nav.sections')}>
                {visibleTabs.map((item) => {
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={`tab ${tab === item.id ? 'tab--active' : ''}`}
                            aria-current={tab === item.id ? 'page' : undefined}
                            onClick={() => {
                                setTab(item.id);
                            }}
                        >
                            {t(item.label)}
                        </button>
                    );
                })}
            </nav>
            <main className="app__main">
                {!ready && <p className="empty">{t('app.booting')}</p>}
                {ready && tab === 'downloads' && (
                    <>
                        <UrlInput />
                        <QueueList />
                    </>
                )}
                {ready && tab === 'anime' && animeSupported && <AnimePanel />}
                {ready && tab === 'history' && <HistoryList />}
                {ready && tab === 'settings' && <SettingsPanel />}
            </main>
            <Toast />
        </div>
    );
}
