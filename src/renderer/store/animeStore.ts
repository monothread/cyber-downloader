import { create } from 'zustand';
import type { AniError, AnimeAudio, AnimeSeriesResponse, AnimeJob, AnimeProgressUpdate, AnimeSearchResult, AnimeStatus, AnimeStream, LibraryAnime } from '@shared/anime';
import { cleanSeasonName, cleanSeriesName, isValidSeason, type SeriesChoice } from '@shared/series';
import { createTranslator, type MessageKey, type MessageParams } from '@shared/i18n';
import { resolveAppLanguage } from '../i18n/language';
import { useAppStore } from './appStore';

export type AnimeView = 'search' | 'library' | 'downloads';
// The views the downloads screen can go back to.
export type AnimeBrowseView = Exclude<AnimeView, 'downloads'>;

export interface AnimeSearchState {
    query: string;
    // The audio picked on the screen; null follows the setting.
    audio: AnimeAudio | null;
    status: 'idle' | 'searching' | 'done' | 'error';
    results: AnimeSearchResult[];
    error: AniError | null;
    // What the results belong to: positions mean something only for the search that produced them.
    searchedQuery: string;
    searchedAudio: AnimeAudio;
}

export interface AnimeSelection {
    result: AnimeSearchResult;
    query: string;
    audio: AnimeAudio;
    status: 'loading' | 'ready' | 'error';
    episodes: string[];
    error: AniError | null;
}

export interface PlayingEpisode {
    animeId: number;
    episodeId: number;
}

// An episode being watched without downloading it.
export interface StreamingEpisode {
    title: string;
    episode: string;
    status: 'loading' | 'ready' | 'error';
    stream: AnimeStream | null;
    error: AniError | null;
}

export interface AnimeState {
    status: AnimeStatus;
    // ani-cli is being updated.
    updatingCli: boolean;
    view: AnimeView;
    // Where BACK goes from the downloads screen.
    returnView: AnimeBrowseView;
    jobs: AnimeJob[];
    library: LibraryAnime[];
    search: AnimeSearchState;
    selection: AnimeSelection | null;
    playing: PlayingEpisode | null;
    streaming: StreamingEpisode | null;
    // The anime of the library the screen goes to when it is opened from the search (its episodes are shown).
    libraryFocus: number | null;
    init: () => Promise<() => void>;
    updateCli: () => Promise<void>;
    setView: (view: AnimeBrowseView) => void;
    openDownloads: () => void;
    closeDownloads: () => void;
    setQuery: (query: string) => void;
    setAudio: (audio: AnimeAudio) => void;
    runSearch: () => Promise<void>;
    openResult: (result: AnimeSearchResult) => Promise<void>;
    // Opens an anime of the library in the search, as if it had been found there, so more episodes can be downloaded.
    openLibraryAnime: (anime: LibraryAnime) => Promise<void>;
    // Asks for a folder of anime and puts what is in it into the library, then says what it did.
    importLibrary: () => Promise<void>;
    // Goes to the library, to the anime that was being looked at in the search.
    showInLibrary: (animeId: number) => void;
    closeResult: () => void;
    // Downloads episodes of the opened anime; `joined` is the series and season it is saved under (none leaves it as it is).
    downloadEpisodes: (episodes: string[], joined?: SeriesChoice | null) => Promise<void>;
    // Joins an anime of the library to a series with a season number, or takes it out of one (null, null), then reads the library.
    setSeries: (animeId: number, series: string | null, season: number | null, seasonName: string | null) => Promise<AnimeSeriesResponse>;
    cancelJob: (episodeId: number) => Promise<void>;
    retryJob: (episodeId: number) => Promise<void>;
    clearFinishedJobs: () => Promise<void>;
    removeEpisode: (episodeId: number) => Promise<void>;
    removeAnime: (animeId: number) => Promise<void>;
    play: (animeId: number, episodeId: number) => void;
    closePlayer: () => void;
    watchEpisode: (episode: string) => Promise<void>;
    closeStream: () => void;
    saveProgress: (update: AnimeProgressUpdate) => Promise<void>;
    // Marks an episode of the library as watched (or not), keeping the position it was left at.
    setWatched: (episodeId: number, watched: boolean) => Promise<void>;
    refreshLibrary: () => Promise<void>;
}

export const INITIAL_SEARCH: AnimeSearchState = {
    query: '',
    audio: null,
    status: 'idle',
    results: [],
    error: null,
    searchedQuery: '',
    searchedAudio: 'sub'
};

export const UNSUPPORTED_STATUS: AnimeStatus = { supported: false, available: false, aniCli: null };

// The audio in use: the one picked on the screen or, if none, the one in the settings.
export function effectiveAudio(search: AnimeSearchState, settingsAudio: AnimeAudio): AnimeAudio {
    return search.audio ?? settingsAudio;
}

function translateNow(key: MessageKey, params?: MessageParams): string {
    return createTranslator(resolveAppLanguage(useAppStore.getState().settings.language))(key, params);
}

function notify(kind: 'error' | 'info', message: string): void {
    useAppStore.getState().setNotice({ kind, message });
}

function upsertAnimeJob(jobs: AnimeJob[], job: AnimeJob): AnimeJob[] {
    const exists = jobs.some((candidate) => {
        return candidate.episodeId === job.episodeId;
    });
    if (!exists) {
        return [...jobs, job];
    }
    return jobs.map((candidate) => {
        return candidate.episodeId === job.episodeId ? job : candidate;
    });
}

export const useAnimeStore = create<AnimeState>((set, get) => {
    return {
        status: UNSUPPORTED_STATUS,
        updatingCli: false,
        view: 'search',
        returnView: 'search',
        jobs: [],
        library: [],
        search: INITIAL_SEARCH,
        selection: null,
        playing: null,
        streaming: null,
        libraryFocus: null,

        init: async () => {
            const api = window.api;
            const status = await api.getAnimeStatus();
            set({ status });
            if (!status.supported) {
                return (): void => {
                    return undefined;
                };
            }
            const [library, jobs] = await Promise.all([api.listAnimeLibrary(), api.listAnimeJobs()]);
            set({ library, jobs });
            const unsubscribers = [
                api.onAnimeJobUpdate((job) => {
                    set((state) => {
                        return { jobs: upsertAnimeJob(state.jobs, job) };
                    });
                }),
                api.onAnimeLibraryChanged(() => {
                    void get().refreshLibrary();
                })
            ];
            return (): void => {
                unsubscribers.forEach((unsubscribe) => {
                    unsubscribe();
                });
            };
        },

        updateCli: async () => {
            set({ updatingCli: true });
            const result = await window.api.updateAniCli();
            set({ updatingCli: false, status: await window.api.getAnimeStatus() });
            notify(result.ok ? 'info' : 'error', result.output || translateNow(result.ok ? 'notice.ytdlpUpToDate' : 'notice.updateFailed'));
        },

        setView: (view) => {
            set({ view, returnView: view, libraryFocus: null });
            // Files can be moved or deleted while the app is open: the library says which ones are gone when it is shown.
            if (view === 'library') {
                void get().refreshLibrary();
            }
        },

        openDownloads: () => {
            set((state) => {
                return state.view === 'downloads' ? state : { view: 'downloads', returnView: state.view };
            });
        },

        closeDownloads: () => {
            set((state) => {
                return { view: state.returnView };
            });
        },

        setQuery: (query) => {
            set((state) => {
                return { search: { ...state.search, query } };
            });
        },

        setAudio: (audio) => {
            set((state) => {
                return { search: { ...state.search, audio } };
            });
        },

        runSearch: async () => {
            const { search } = get();
            const query = search.query.trim();
            if (query.length === 0) {
                return;
            }
            const audio = effectiveAudio(search, useAppStore.getState().settings.animeAudio);
            set((state) => {
                return { selection: null, search: { ...state.search, status: 'searching', error: null, results: [] } };
            });
            const response = await window.api.searchAnime(query, audio);
            set((state) => {
                if (response.ok) {
                    return { search: { ...state.search, status: 'done', results: response.results, searchedQuery: query, searchedAudio: audio } };
                }
                return { search: { ...state.search, status: 'error', error: response.error, searchedQuery: query, searchedAudio: audio } };
            });
        },

        openResult: async (result) => {
            const { search } = get();
            const selection: AnimeSelection = {
                result,
                query: search.searchedQuery,
                audio: search.searchedAudio,
                status: 'loading',
                episodes: [],
                error: null
            };
            set({ selection });
            const response = await window.api.listAnimeEpisodes(selection.query, result.index, selection.audio);
            set((state) => {
                // The user may have gone back or opened another result while this one was loading.
                if (state.selection?.result !== result) {
                    return state;
                }
                if (response.ok) {
                    return { selection: { ...selection, status: 'ready', episodes: response.episodes } };
                }
                return { selection: { ...selection, status: 'error', error: response.error } };
            });
        },

        importLibrary: async () => {
            const response = await window.api.importAnimeLibrary();
            if (!response.ok) {
                return;
            }
            set({ library: await window.api.listAnimeLibrary() });
            notify('info', translateNow('anime.import.done', { added: response.added, relinked: response.relinked, skipped: response.skipped, ignored: response.ignored }));
        },

        openLibraryAnime: async (anime) => {
            // An anime that was found on the disk does not know its place in the search: it is searched by its title instead.
            if (anime.searchIndex < 1) {
                set((state) => {
                    return {
                        view: 'search',
                        returnView: 'search',
                        selection: null,
                        search: { ...state.search, query: anime.query, audio: anime.audio, status: 'idle', error: null, results: [] }
                    };
                });
                await get().runSearch();
                return;
            }
            const result: AnimeSearchResult = { index: anime.searchIndex, title: anime.title };
            set((state) => {
                return {
                    view: 'search',
                    returnView: 'search',
                    search: {
                        ...state.search,
                        query: anime.query,
                        audio: anime.audio,
                        status: 'done',
                        error: null,
                        results: [result],
                        searchedQuery: anime.query,
                        searchedAudio: anime.audio
                    }
                };
            });
            await get().openResult(result);
        },

        showInLibrary: (animeId) => {
            set({ view: 'library', returnView: 'library', selection: null, libraryFocus: animeId });
            void get().refreshLibrary();
        },

        closeResult: () => {
            set({ selection: null });
        },

        downloadEpisodes: async (episodes, joined = null) => {
            const { selection } = get();
            if (!selection || episodes.length === 0) {
                return;
            }
            const name = cleanSeasonName(joined?.seasonName ?? '');
            if (joined && (cleanSeriesName(joined.series) === null || !isValidSeason(joined.season) || name === undefined)) {
                notify('error', translateNow('anime.series.error.invalid'));
                return;
            }
            const response = await window.api.downloadAnime({
                title: selection.result.title,
                query: selection.query,
                index: selection.result.index,
                audio: selection.audio,
                episodes,
                ...(joined ? { series: cleanSeriesName(joined.series) as string, season: joined.season, seasonName: name as string | null } : {})
            });
            if (response.ok) {
                notify('info', translateNow('anime.notice.queued', { count: episodes.length, title: response.anime.title }));
                return;
            }
            notify('error', translateNow('anime.notice.queueFailed', { reason: response.message }));
        },

        setSeries: async (animeId, series, season, seasonName) => {
            const response = await window.api.setAnimeSeries(animeId, series, season, seasonName);
            if (response.ok) {
                set({ library: await window.api.listAnimeLibrary() });
            }
            return response;
        },

        cancelJob: async (episodeId) => {
            await window.api.cancelAnimeJob(episodeId);
        },

        retryJob: async (episodeId) => {
            await window.api.retryAnimeJob(episodeId);
        },

        clearFinishedJobs: async () => {
            await window.api.clearFinishedAnimeJobs();
            set({ jobs: await window.api.listAnimeJobs() });
        },

        removeEpisode: async (episodeId) => {
            await window.api.removeAnimeEpisode(episodeId);
            set((state) => {
                return {
                    jobs: state.jobs.filter((job) => {
                        return job.episodeId !== episodeId;
                    })
                };
            });
        },

        removeAnime: async (animeId) => {
            await window.api.removeAnime(animeId);
            set((state) => {
                return {
                    jobs: state.jobs.filter((job) => {
                        return job.animeId !== animeId;
                    })
                };
            });
        },

        play: (animeId, episodeId) => {
            set({ playing: { animeId, episodeId } });
        },

        closePlayer: () => {
            set({ playing: null });
        },

        watchEpisode: async (episode) => {
            const { selection } = get();
            if (!selection) {
                return;
            }
            const loading: StreamingEpisode = { title: selection.result.title, episode, status: 'loading', stream: null, error: null };
            set({ streaming: loading });
            const response = await window.api.openAnimeStream({ query: selection.query, index: selection.result.index, audio: selection.audio, episode });
            // The user may have closed the player (or started another episode) while the video was being found.
            if (get().streaming !== loading) {
                if (response.ok) {
                    void window.api.closeAnimeStream(response.stream.sessionId);
                }
                return;
            }
            set({ streaming: response.ok ? { ...loading, status: 'ready', stream: response.stream } : { ...loading, status: 'error', error: response.error } });
        },

        closeStream: () => {
            const { streaming } = get();
            if (streaming?.stream) {
                void window.api.closeAnimeStream(streaming.stream.sessionId);
            }
            set({ streaming: null });
        },

        saveProgress: async (update) => {
            await window.api.saveAnimeProgress(update);
        },

        setWatched: async (episodeId, watched) => {
            const episode = get()
                .library.flatMap((anime) => {
                    return anime.episodes;
                })
                .find((candidate) => {
                    return candidate.id === episodeId;
                });
            if (!episode) {
                return;
            }
            await window.api.saveAnimeProgress({ episodeId, positionSeconds: episode.positionSeconds, durationSeconds: episode.durationSeconds, watched });
            set({ library: await window.api.listAnimeLibrary() });
        },

        refreshLibrary: async () => {
            set({ library: await window.api.listAnimeLibrary() });
        }
    };
});
