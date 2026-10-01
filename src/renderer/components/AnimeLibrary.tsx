import { useState } from 'react';
import type { AnimeEpisodeRecord, LibraryAnime } from '@shared/anime';
import type { Translator } from '@shared/i18n';
import { useTranslator } from '../i18n/useTranslator';
import { useAnimeStore } from '../store/animeStore';
import { animeErrorKey, animeStatusKey, downloadedCount, resumePosition } from './animeText';
import { AnimeRemove } from './AnimeRemove';
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
    if (episode.watched) {
        parts.push(t('anime.watched'));
    } else if (resume !== null) {
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
    const label = t('anime.episode', { number: episode.number });

    return (
        <li className={`history__item${episode.status === 'error' ? ' history__item--error' : ''}`} data-testid="anime-episode">
            <div className="history__main">
                <span className="history__title">{label}</span>
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
                            aria-label={`${t('anime.play')}: ${anime.title} ${label}`}
                            onClick={() => {
                                play(anime.id, episode.id);
                            }}
                        >
                            {t('anime.play')}
                        </button>
                        {episode.filePath && (
                            <button
                                type="button"
                                className="btn btn--small"
                                aria-label={`${t('anime.showFile')}: ${anime.title} ${label}`}
                                onClick={() => {
                                    void window.api.showItemInFolder(episode.filePath ?? '');
                                }}
                            >
                                {t('anime.showFile')}
                            </button>
                        )}
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
    const [expanded, setExpanded] = useState(false);

    return (
        <article className="job job--done" data-testid="anime-card">
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

    if (library.length === 0) {
        return <p className="empty">{t('anime.library.empty')}</p>;
    }
    return (
        <section className="queue" aria-label={t('anime.library.aria')}>
            <span className="section-label">{t('anime.library.label', { count: library.length })}</span>
            {library.map((anime) => {
                return <AnimeCard key={anime.id} anime={anime} t={t} />;
            })}
        </section>
    );
}
