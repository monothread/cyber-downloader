import { useEffect, useRef, useState } from 'react';
import type { AnimeEpisodeRecord, LibraryAnime } from '@shared/anime';
import type { Translator } from '@shared/i18n';
import { useTranslator } from '../i18n/useTranslator';
import { useAnimeStore } from '../store/animeStore';
import { animeErrorKey, animeStatusKey, downloadedCount, matchesSearch, resumePosition } from './animeText';
import { AnimeRemove } from './AnimeRemove';
import { TextField } from './fields';
import { formatBytes, formatDuration } from './jobStatus';

interface EpisodeRowProps {
    anime: LibraryAnime;
    episode: AnimeEpisodeRecord;
    t: Translator;
}

function episodeMeta(episode: AnimeEpisodeRecord, t: Translator): string {
    const parts: string[] = [t(animeStatusKey(episode.status))];
    if (episode.sizeBytes !== null) {
        parts.push(formatBytes(episode.sizeBytes));
    }
    const resume = resumePosition(episode);
    if (!episode.watched && resume !== null) {
        parts.push(t('anime.resume', { time: formatDuration(resume) }));
    }
    return parts.join(' · ');
}

function EpisodeRow({ anime, episode, t }: EpisodeRowProps) {
    const play = useAnimeStore((state) => {
        return state.play;
    });
    const retryJob = useAnimeStore((state) => {
        return state.retryJob;
    });
    const removeEpisode = useAnimeStore((state) => {
        return state.removeEpisode;
    });
    const setWatched = useAnimeStore((state) => {
        return state.setWatched;
    });
    const label = t('anime.episode', { number: episode.number });
    const playable = !episode.fileMissing;

    return (
        <li
            className={`history__item${episode.status === 'error' || episode.fileMissing ? ' history__item--error' : ''}${episode.watched ? ' history__item--watched' : ''}`}
            data-testid="anime-episode"
        >
            <div className="history__main">
                <span className="history__title">
                    {episode.watched && (
                        <span className="watched-mark" role="img" aria-label={t('anime.watched')} title={t('anime.watched')}>
                            ✓
                        </span>
                    )}
                    {label}
                    {episode.fileMissing && (
                        <span className="missing-mark" role="img" aria-label={t('anime.fileMissing')} title={t('anime.fileMissing.hint')}>
                            !
                        </span>
                    )}
                </span>
                <span className="history__meta">{episodeMeta(episode, t)}</span>
                {episode.error && (
                    <span className="history__meta" title={episode.error.raw}>
                        {t(animeErrorKey(episode.error.code))}
                    </span>
                )}
            </div>
            <span className="anime__actions">
                {episode.status === 'done' && (
                    <>
                        <button
                            type="button"
                            className="btn btn--small btn--primary"
                            disabled={!playable}
                            aria-label={`${t('anime.play')}: ${anime.title} ${label}`}
                            onClick={() => {
                                play(anime.id, episode.id);
                            }}
                        >
                            {t('anime.play')}
                        </button>
                        <button
                            type="button"
                            className="btn btn--small"
                            aria-pressed={episode.watched}
                            aria-label={`${t(episode.watched ? 'anime.markUnwatched' : 'anime.markWatched')}: ${anime.title} ${label}`}
                            onClick={() => {
                                void setWatched(episode.id, !episode.watched);
                            }}
                        >
                            {t(episode.watched ? 'anime.markUnwatched' : 'anime.markWatched')}
                        </button>
                    </>
                )}
                {(episode.status === 'error' || episode.status === 'cancelled') && (
                    <button
                        type="button"
                        className="btn btn--small"
                        aria-label={`${t('anime.job.retry')}: ${anime.title} ${label}`}
                        onClick={() => {
                            void retryJob(episode.id);
                        }}
                    >
                        {t('anime.job.retry')}
                    </button>
                )}
                <AnimeRemove
                    label={t('anime.remove')}
                    ariaLabel={`${t('anime.remove')}: ${anime.title} ${label}`}
                    onRemove={() => {
                        void removeEpisode(episode.id);
                    }}
                />
            </span>
        </li>
    );
}

function AnimeCard({ anime, t }: { anime: LibraryAnime; t: Translator }) {
    const removeAnime = useAnimeStore((state) => {
        return state.removeAnime;
    });
    const openLibraryAnime = useAnimeStore((state) => {
        return state.openLibraryAnime;
    });
    // Coming from the search, the anime is shown open and in view.
    const focused = useAnimeStore((state) => {
        return state.libraryFocus === anime.id;
    });
    const [expanded, setExpanded] = useState(focused);
    const card = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (focused) {
            card.current?.scrollIntoView?.({ block: 'center' });
        }
    }, [focused]);

    return (
        <article ref={card} className="job job--done" data-testid="anime-card">
            <header className="job__head">
                <h3 className="job__title" title={anime.title}>
                    {anime.title}
                </h3>
                <span className="job__badges">
                    <span className="badge">{anime.audio === 'dub' ? t('anime.audio.dub') : t('anime.audio.sub')}</span>
                </span>
            </header>
            <div className="job__meta">
                <span>{t('anime.library.progress', { done: downloadedCount(anime), total: anime.episodes.length })}</span>
            </div>
            <div className="job__actions">
                <button
                    type="button"
                    className="btn btn--small"
                    aria-expanded={expanded}
                    onClick={() => {
                        setExpanded(!expanded);
                    }}
                >
                    {expanded ? t('anime.library.hide') : t('anime.library.show')}
                </button>
                <button
                    type="button"
                    className="btn btn--small btn--primary"
                    aria-label={`${t('anime.library.more')}: ${anime.title}`}
                    onClick={() => {
                        void openLibraryAnime(anime);
                    }}
                >
                    {t('anime.library.more')}
                </button>
                {downloadedCount(anime) > 0 && (
                    <button
                        type="button"
                        className="btn btn--small"
                        aria-label={`${t('anime.openFolder')}: ${anime.title}`}
                        onClick={() => {
                            void window.api.openAnimeFolder(anime.id);
                        }}
                    >
                        {t('anime.openFolder')}
                    </button>
                )}
                <AnimeRemove
                    label={t('anime.remove.anime')}
                    ariaLabel={`${t('anime.remove.anime')}: ${anime.title}`}
                    onRemove={() => {
                        void removeAnime(anime.id);
                    }}
                />
            </div>
            {expanded && (
                <ul className="history__list">
                    {anime.episodes.map((episode) => {
                        return <EpisodeRow key={episode.id} anime={anime} episode={episode} t={t} />;
                    })}
                </ul>
            )}
        </article>
    );
}

export function AnimeLibrary() {
    const t = useTranslator();
    const library = useAnimeStore((state) => {
        return state.library;
    });
    const importLibrary = useAnimeStore((state) => {
        return state.importLibrary;
    });
    const [search, setSearch] = useState('');

    const importButton = (
        <button
            type="button"
            className="btn"
            title={t('anime.import.hint')}
            onClick={() => {
                void importLibrary();
            }}
        >
            {t('anime.import.button')}
        </button>
    );
    if (library.length === 0) {
        return (
            <section className="queue" aria-label={t('anime.library.aria')}>
                <div className="field-row">{importButton}</div>
                <p className="empty">{t('anime.library.empty')}</p>
            </section>
        );
    }
    const shown = library.filter((anime) => {
        return matchesSearch(anime.title, search);
    });
    return (
        <section className="queue" aria-label={t('anime.library.aria')}>
            <div className="field-row">
                <TextField label={t('anime.library.search.label')} value={search} placeholder={t('anime.library.search.placeholder')} onChange={setSearch} />
                {importButton}
            </div>
            <span className="section-label">{t('anime.library.label', { count: shown.length })}</span>
            {shown.length === 0 && <p className="empty">{t('anime.library.search.none')}</p>}
            {shown.map((anime) => {
                return <AnimeCard key={anime.id} anime={anime} t={t} />;
            })}
        </section>
    );
}
