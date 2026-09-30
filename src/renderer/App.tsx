import { useEffect } from 'react';
import { BinaryStatus } from './components/BinaryStatus';
import { HistoryList } from './components/HistoryList';
import { QueueList } from './components/QueueList';
import { SettingsPanel } from './components/SettingsPanel';
import { Toast } from './components/Toast';
import { UpdateBanner } from './components/UpdateBanner';
import { UrlInput } from './components/UrlInput';
import { useAppStore, type Tab } from './store/appStore';
import { applyTheme, DARK_SCHEME_QUERY, rememberTheme } from './theme/resolveTheme';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
    { id: 'downloads', label: 'DOWNLOADS' },
    { id: 'history', label: 'HISTORY' },
    { id: 'settings', label: 'SETTINGS' }
];

export function App() {
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

    const theme = useAppStore((state) => {
        return state.settings.theme;
    });

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
        let dispose: (() => void) | null = null;
        let cancelled = false;
        void init().then((unsubscribe) => {
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
    }, [init]);

    return (
        <div className="app">
            <header className="app__header">
                <h1 className="logo" data-text="CYBER//DL">
                    CYBER//DL
                </h1>
                <BinaryStatus />
            </header>
            <UpdateBanner />
            <nav className="tabs" aria-label="Sections">
                {TABS.map((item) => {
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
                            {item.label}
                        </button>
                    );
                })}
            </nav>
            <main className="app__main">
                {!ready && <p className="empty">// BOOTING SYSTEMS…</p>}
                {ready && tab === 'downloads' && (
                    <>
                        <UrlInput />
                        <QueueList />
                    </>
                )}
                {ready && tab === 'history' && <HistoryList />}
                {ready && tab === 'settings' && <SettingsPanel />}
            </main>
            <Toast />
        </div>
    );
}
