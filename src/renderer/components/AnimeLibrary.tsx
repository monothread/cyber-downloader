import { useEffect, useRef, useState } from 'react';
import type { AnimeEpisodeRecord, LibraryAnime } from '@shared/anime';
import type { MessageKey, Translator } from '@shared/i18n';
import { useTranslator } from '../i18n/useTranslator';
import { useAnimeStore } from '../store/animeStore';
import { animeErrorKey, animeStatusKey, downloadedCount, groupLibrary, matchesSearch, resumePosition, seasonLabel, seriesNames, type LibraryGroup } from './animeText';
import { AnimeRemove } from './AnimeRemove';
import { cleanSeasonName, cleanSeriesName, isValidSeason, suggestSeries } from '@shared/series';
import { TextField } from './fields';
import { SeriesFields } from './SeriesFields';
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

function SeriesEditor({ anime, t, onClose }: { anime: LibraryAnime; t: Translator; onClose: () => void }) {
    const library = useAnimeStore((state) => {
        return state.library;
    });
    const setSeries = useAnimeStore((state) => {
        return state.setSeries;
    });
    const suggested = suggestSeries(anime.title);
    const [series, setSeriesName] = useState(anime.series ?? suggested.series);
    const [season, setSeason] = useState(anime.season ?? suggested.season);
    const [seasonName, setSeasonName] = useState(anime.seasonName ?? '');
    const [problem, setProblem] = useState<MessageKey | null>(null);

    async function save(): Promise<void> {
        const cleaned = cleanSeriesName(series);
        if (cleaned === null || !isValidSeason(season)) {
            setProblem('anime.series.error.invalid');
            return;
        }
        const name = cleanSeasonName(seasonName);
        if (name === undefined) {
            setProblem('anime.series.error.invalid');
            return;
        }
        const response = await setSeries(anime.id, cleaned, season, name);
        if (response.ok) {
            onClose();
            return;
        }
        setProblem(response.reason === 'season-taken' ? 'anime.series.error.taken' : 'anime.series.error.invalid');
    }

    async function clear(): Promise<void> {
        await setSeries(anime.id, null, null, null);
        onClose();
    }

    return (
        <div className="series-editor" role="group" aria-label={`${t('anime.series.edit')}: ${anime.title}`}>
            <SeriesFields
                series={series}
                season={season}
                seasonName={seasonName}
                suggestions={seriesNames(library)}
                onSeriesChange={setSeriesName}
                onSeasonChange={setSeason}
                onSeasonNameChange={setSeasonName}
            />
            {problem !== null && (
                <p className="field__warning" role="alert">
                    {t(problem)}
                </p>
            )}
            <div className="job__actions">
                <button
                    type="button"
                    className="btn btn--small btn--primary"
                    onClick={() => {
                        void save();
                    }}
                >
                    {t('anime.series.save')}
                </button>
                {anime.series !== null && (
                    <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                            void clear();
                        }}
                    >
                        {t('anime.series.clear')}
                    </button>
                )}
                <button type="button" className="btn btn--small btn--ghost" onClick={onClose}>
                    {t('anime.series.cancel')}
                </button>
            </div>
        </div>
    );
}

// An anime of the library, as a season of its series: a row that opens to show what can be done with it.
function AnimeEntry({ anime, t, startExpanded = false }: { anime: LibraryAnime; t: Translator; startExpanded?: boolean }) {
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
    const [expanded, setExpanded] = useState(focused || startExpanded);
    const [editing, setEditing] = useState(false);
    const card = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (focused) {
            card.current?.scrollIntoView?.({ block: 'center' });
        }
    }, [focused]);

    const audio = <span className="badge">{anime.audio === 'dub' ? t('anime.audio.dub') : t('anime.audio.sub')}</span>;
    const progress = t('anime.library.progress', { done: downloadedCount(anime), total: anime.episodes.length });
    const toggle = (
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
    );
    const more = (
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
    );
    const folder = downloadedCount(anime) > 0 && (
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
    );
    const edit = (
        <button
            type="button"
            className="btn btn--small"
            aria-expanded={editing}
            aria-label={`${t('anime.series.edit')}: ${anime.title}`}
            onClick={() => {
                setEditing(!editing);
            }}
        >
            {t('anime.series.edit')}
        </button>
    );
    const remove = (
        <AnimeRemove
            label={t('anime.remove.anime')}
            ariaLabel={`${t('anime.remove.anime')}: ${anime.title}`}
            onRemove={() => {
                void removeAnime(anime.id);
            }}
        />
    );
    const editor = editing && (
        <SeriesEditor
            anime={anime}
            t={t}
            onClose={() => {
                setEditing(false);
            }}
        />
    );
    const episodes = expanded && (
        <ul className="history__list">
            {anime.episodes.map((episode) => {
                return <EpisodeRow key={episode.id} anime={anime} episode={episode} t={t} />;
            })}
        </ul>
    );

    return (
        <section ref={card} className="series__season" data-testid="anime-season">
            <div className="season__row">
                <span className="season__chip" title={seasonLabel(anime, t)}>
                    {seasonLabel(anime, t)}
                </span>
                <h4 className="season__title" title={anime.title}>
                    {anime.title}
                </h4>
                <span className="season__meta">{progress}</span>
                {audio}
                <span className="season__actions">
                    {toggle}
                    {more}
                </span>
            </div>
            {expanded && (
                <div className="season__panel">
                    <div className="job__actions">
                        {folder}
                        {edit}
                        {remove}
                    </div>
                    {editor}
                    {episodes}
                </div>
            )}
        </section>
    );
}

// How many seasons a series has, in words.
function seasonsText(group: LibraryGroup, t: Translator): string {
    return group.entries.length === 1 ? t('anime.series.seasonOne') : t('anime.series.seasons', { count: group.entries.length });
}

// The card of a series: its name, how many seasons it has and the way into its own screen.
function SeriesCard({ group, t, onOpen }: { group: LibraryGroup; t: Translator; onOpen: () => void }) {
    const removeAnime = useAnimeStore((state) => {
        return state.removeAnime;
    });
    const name = group.series;

    return (
        <article className="job job--done series library__card" data-testid="anime-card" aria-label={name}>
            <header className="job__head">
                <h3 className="series__title" title={name}>
                    {name}
                </h3>
                <span className="job__badges">
                    <span className="badge">{seasonsText(group, t)}</span>
                </span>
            </header>
            <div className="job__actions library__footer">
                <button type="button" className="btn btn--small btn--primary" aria-label={`${t('anime.series.open')}: ${name}`} onClick={onOpen}>
                    {t('anime.series.open')}
                </button>
                <AnimeRemove
                    label={t('anime.series.remove')}
                    ariaLabel={`${t('anime.series.remove')}: ${name}`}
                    onRemove={() => {
                        void group.entries.reduce(async (previous, anime) => {
                            await previous;
                            await removeAnime(anime.id);
                        }, Promise.resolve());
                    }}
                />
            </div>
        </article>
    );
}

// What is open on the screen of the library besides the cards: one series (by the key of its card).
type LibraryView = { key: string };

// The screen of one series: its seasons, each with its buttons and episodes, and the way back.
function SeriesView({ group, t, onBack }: { group: LibraryGroup; t: Translator; onBack: () => void }) {
    const removeAnime = useAnimeStore((state) => {
        return state.removeAnime;
    });
    const name = group.series;
    return (
        <section className="library__view" aria-label={name}>
            <div className="queue__toolbar">
                <button type="button" className="btn btn--small btn--ghost" onClick={onBack}>
                    {t('anime.back')}
                </button>
                <span className="section-label">{name}</span>
            </div>
            <article className="job job--done series" data-testid="series-view">
                <header className="job__head">
                    <h3 className="series__title" title={name}>
                        {name}
                    </h3>
                    <span className="job__badges">
                        <span className="badge">{seasonsText(group, t)}</span>
                        <AnimeRemove
                            label={t('anime.series.remove')}
                            ariaLabel={`${t('anime.series.remove')}: ${name}`}
                            onRemove={() => {
                                void group.entries.reduce(async (previous, anime) => {
                                    await previous;
                                    await removeAnime(anime.id);
                                }, Promise.resolve());
                            }}
                        />
                    </span>
                </header>
                {group.entries.map((anime) => {
                    return <AnimeEntry key={anime.id} anime={anime} t={t} startExpanded={group.entries.length === 1} />;
                })}
            </article>
        </section>
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
    // Coming from the search ("VIEW IN LIBRARY") the series of the anime that was being looked at is open.
    const [view, setView] = useState<LibraryView | null>(() => {
        const state = useAnimeStore.getState();
        const focus = state.libraryFocus;
        const group = focus === null ? undefined : groupLibrary(state.library).find((candidate) => {
            return candidate.entries.some((entry) => {
                return entry.id === focus;
            });
        });
        return group ? { key: group.key } : null;
    });

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
    const openGroup = view ? groupLibrary(library).find((group) => { return group.key === view.key; }) : undefined;
    if (openGroup) {
        return <SeriesView group={openGroup} t={t} onBack={() => { setView(null); }} />;
    }
    const shown = library.filter((anime) => {
        return matchesSearch(anime.title, search) || (anime.series !== null && matchesSearch(anime.series, search));
    });
    const groups = groupLibrary(shown);
    return (
        <section className="queue library" aria-label={t('anime.library.aria')}>
            <div className="field-row">
                <TextField label={t('anime.library.search.label')} value={search} placeholder={t('anime.library.search.placeholder')} onChange={setSearch} />
                {importButton}
            </div>
            <span className="section-label">{t('anime.library.label', { count: groups.length })}</span>
            {shown.length === 0 && <p className="empty">{t('anime.library.search.none')}</p>}
            {groups.map((group) => {
                return (
                    <SeriesCard
                        key={group.key}
                        group={group}
                        t={t}
                        onOpen={() => {
                            setView({ key: group.key });
                        }}
                    />
                );
            })}
        </section>
    );
}
