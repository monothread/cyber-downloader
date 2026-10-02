import { useState } from 'react';
import { useTranslator } from '../i18n/useTranslator';
import { useAnimeStore } from '../store/animeStore';
import { suggestSeries } from '@shared/series';
import { animeErrorKey, downloadedAnime, seriesNames } from './animeText';
import { SeriesFields } from './SeriesFields';

// The episodes of the anime that was opened: pick some, or take the whole season.
export function AnimeDetail() {
    const t = useTranslator();
    const selection = useAnimeStore((state) => {
        return state.selection;
    });
    const library = useAnimeStore((state) => {
        return state.library;
    });
    const closeResult = useAnimeStore((state) => {
        return state.closeResult;
    });
    const downloadEpisodes = useAnimeStore((state) => {
        return state.downloadEpisodes;
    });
    const watchEpisode = useAnimeStore((state) => {
        return state.watchEpisode;
    });
    const showInLibrary = useAnimeStore((state) => {
        return state.showInLibrary;
    });
    const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
    // What the anime is joined to already, or what its title suggests: it is saved with the first download.
    const entry = library.find((candidate) => {
        return candidate.title === selection?.result.title && candidate.audio === selection.audio;
    });
    const suggested = suggestSeries(selection?.result.title ?? '');
    const [series, setSeries] = useState(entry?.series ?? suggested.series);
    const [season, setSeason] = useState(entry?.season ?? suggested.season);
    const [seasonName, setSeasonName] = useState(entry?.seasonName ?? '');

    const anime = library.find((candidate) => {
        return candidate.title === selection?.result.title && candidate.audio === selection.audio;
    });
    const downloaded = new Set(
        (anime?.episodes ?? [])
            .filter((episode) => {
                return episode.status === 'done';
            })
            .map((episode) => {
                return episode.number;
            })
    );

    if (!selection) {
        return null;
    }
    const saved = downloadedAnime(library, selection.result.title, selection.audio);

    function toggle(number: string): void {
        setPicked((current) => {
            const next = new Set(current);
            if (next.has(number)) {
                next.delete(number);
            } else {
                next.add(number);
            }
            return next;
        });
    }

    function download(numbers: string[]): void {
        void downloadEpisodes(numbers, series.trim().length > 0 ? { series, season, seasonName } : null);
        setPicked(new Set());
    }

    return (
        <section className="anime__detail" aria-label={selection.result.title}>
            <div className="queue__toolbar">
                <button type="button" className="btn btn--small btn--ghost" onClick={closeResult}>
                    {t('anime.back')}
                </button>
                <span className="section-label">{selection.result.title}</span>
                {saved && (
                    <button
                        type="button"
                        className="btn btn--small btn--primary"
                        onClick={() => {
                            showInLibrary(saved.id);
                        }}
                    >
                        {t('anime.library.view')}
                    </button>
                )}
            </div>
            <SeriesFields
                series={series}
                season={season}
                seasonName={seasonName}
                suggestions={seriesNames(library)}
                onSeriesChange={setSeries}
                onSeasonChange={setSeason}
                onSeasonNameChange={setSeasonName}
            />
            {selection.status === 'loading' && <p className="empty">{t('anime.episodes.loading')}</p>}
            {selection.status === 'error' && selection.error && (
                <p className="field__warning" role="alert" title={selection.error.raw}>
                    {t(animeErrorKey(selection.error.code))}
                </p>
            )}
            {selection.status === 'ready' && (
                <>
                    <div className="queue__toolbar">
                        <span className="section-label">{t('anime.episodes.label', { count: selection.episodes.length })}</span>
                        <span className="anime__actions">
                            <button
                                type="button"
                                className="btn btn--small btn--ghost"
                                onClick={() => {
                                    setPicked(new Set(selection.episodes));
                                }}
                            >
                                {t('anime.selectAll')}
                            </button>
                            <button
                                type="button"
                                className="btn btn--small btn--ghost"
                                disabled={picked.size === 0}
                                onClick={() => {
                                    setPicked(new Set());
                                }}
                            >
                                {t('anime.selectNone')}
                            </button>
                            <button
                                type="button"
                                className="btn btn--small btn--hot"
                                disabled={picked.size !== 1}
                                title={t('anime.watch.hint')}
                                onClick={() => {
                                    const [episode] = picked;
                                    if (episode !== undefined) {
                                        void watchEpisode(episode);
                                    }
                                }}
                            >
                                {t('anime.watch')}
                            </button>
                            <button
                                type="button"
                                className="btn btn--small btn--primary"
                                disabled={picked.size === 0}
                                onClick={() => {
                                    download(selection.episodes.filter((number) => {
                                        return picked.has(number);
                                    }));
                                }}
                            >
                                {t('anime.download.selected', { count: picked.size })}
                            </button>
                        </span>
                    </div>
                    <div className="episode-grid" role="group" aria-label={t('anime.episodes.label', { count: selection.episodes.length })}>
                        {selection.episodes.map((number) => {
                            const isDownloaded = downloaded.has(number);
                            return (
                                <button
                                    key={number}
                                    type="button"
                                    className={`episode-chip${isDownloaded ? ' episode-chip--done' : ''}`}
                                    aria-pressed={picked.has(number)}
                                    title={isDownloaded ? t('anime.inLibrary') : undefined}
                                    onClick={() => {
                                        toggle(number);
                                    }}
                                >
                                    {t('anime.episode', { number })}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}
