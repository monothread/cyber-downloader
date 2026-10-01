import { useTranslator } from '../i18n/useTranslator';
import { useAnimeStore, type AnimeBrowseView } from '../store/animeStore';
import { activeJobCount } from './animeText';
import { AnimeJobs } from './AnimeJobs';
import { AnimeLibrary } from './AnimeLibrary';
import { AnimePlayer } from './AnimePlayer';
import { AnimeSearch } from './AnimeSearch';
import { AnimeStreamPlayer } from './AnimeStreamPlayer';

const VIEWS: ReadonlyArray<{ id: AnimeBrowseView; label: 'anime.nav.search' | 'anime.nav.library' }> = [
    { id: 'search', label: 'anime.nav.search' },
    { id: 'library', label: 'anime.nav.library' }
];

export function AnimePanel() {
    const t = useTranslator();
    const status = useAnimeStore((state) => {
        return state.status;
    });
    const view = useAnimeStore((state) => {
        return state.view;
    });
    const setView = useAnimeStore((state) => {
        return state.setView;
    });
    const openDownloads = useAnimeStore((state) => {
        return state.openDownloads;
    });
    const closeDownloads = useAnimeStore((state) => {
        return state.closeDownloads;
    });
    const active = useAnimeStore((state) => {
        return activeJobCount(state.jobs);
    });

    if (!status.available) {
        return (
            <section className="panel" aria-label={t('anime.aria')}>
                <p className="field__warning" role="alert">
                    {t('anime.unavailable.title')}
                </p>
                <p className="field__hint">{t('anime.unavailable.hint')}</p>
            </section>
        );
    }
    if (view === 'downloads') {
        return (
            <section className="anime" aria-label={t('anime.aria')}>
                <div className="queue__toolbar">
                    <button type="button" className="btn btn--small btn--ghost" onClick={closeDownloads}>
                        {t('anime.back')}
                    </button>
                </div>
                <AnimeJobs />
                <AnimePlayer />
                <AnimeStreamPlayer />
            </section>
        );
    }
    return (
        <section className="anime" aria-label={t('anime.aria')}>
            <div className="anime__bar">
                <nav className="tabs" aria-label={t('anime.aria')}>
                    {VIEWS.map((item) => {
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={`tab ${view === item.id ? 'tab--active' : ''}`}
                                aria-current={view === item.id ? 'page' : undefined}
                                onClick={() => {
                                    setView(item.id);
                                }}
                            >
                                {t(item.label)}
                            </button>
                        );
                    })}
                </nav>
                <button type="button" className={`btn btn--small${active > 0 ? ' btn--primary' : ''}`} onClick={openDownloads}>
                    {t('anime.jobs.label', { count: active })}
                </button>
            </div>
            {view === 'search' ? <AnimeSearch /> : <AnimeLibrary />}
            <AnimePlayer />
            <AnimeStreamPlayer />
        </section>
    );
}
