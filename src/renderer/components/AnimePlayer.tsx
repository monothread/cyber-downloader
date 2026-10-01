import { useEffect, useRef, useState } from 'react';
import { animeMediaUrl, type AnimeEpisodeRecord, type LibraryAnime } from '@shared/anime';
import { useTranslator } from '../i18n/useTranslator';
import { useAnimeStore } from '../store/animeStore';
import { isWatched, nextDownloadedEpisode, resumePosition } from './animeText';

// How often the position is saved while watching.
export const SAVE_INTERVAL_SECONDS = 5;

interface PlayerViewProps {
    anime: LibraryAnime;
    episode: AnimeEpisodeRecord;
}

// One episode being watched. It is created again for each episode (see `key` below), so nothing carries over.
function PlayerView({ anime, episode }: PlayerViewProps) {
    const t = useTranslator();
    const play = useAnimeStore((state) => {
        return state.play;
    });
    const closePlayer = useAnimeStore((state) => {
        return state.closePlayer;
    });
    const saveProgress = useAnimeStore((state) => {
        return state.saveProgress;
    });
    const refreshLibrary = useAnimeStore((state) => {
        return state.refreshLibrary;
    });
    const video = useRef<HTMLVideoElement | null>(null);
    const lastSaved = useRef(0);
    const [failed, setFailed] = useState(false);

    function save(): void {
        const element = video.current;
        if (!element || !Number.isFinite(element.duration)) {
            return;
        }
        lastSaved.current = element.currentTime;
        void saveProgress({
            episodeId: episode.id,
            positionSeconds: element.currentTime,
            durationSeconds: element.duration,
            watched: isWatched(element.currentTime, element.duration)
        });
    }

    function close(): void {
        save();
        closePlayer();
        void refreshLibrary();
    }

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                close();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    });

    const next = nextDownloadedEpisode(anime, episode);
    const title = t('anime.job.title', { title: anime.title, episode: episode.number });

    return (
        <div className="player" role="dialog" aria-modal="true" aria-label={title}>
            <div className="player__box">
                <header className="job__head">
                    <h2 className="player__title">{title}</h2>
                    <span className="anime__actions">
                        {next && (
                            <button
                                type="button"
                                className="btn btn--small"
                                onClick={() => {
                                    save();
                                    play(anime.id, next.id);
                                }}
                            >
                                {t('anime.player.next')}
                            </button>
                        )}
                        <button type="button" className="btn btn--small btn--hot" autoFocus onClick={close}>
                            {t('anime.player.close')}
                        </button>
                    </span>
                </header>
                {failed && (
                    <p className="field__warning" role="alert">
                        {t('anime.player.error')}
                    </p>
                )}
                <video
                    ref={video}
                    className="player__video"
                    src={animeMediaUrl('episode', episode.id)}
                    crossOrigin="anonymous"
                    controls
                    autoPlay
                    onLoadedMetadata={(event) => {
                        const position = resumePosition(episode);
                        if (position !== null) {
                            event.currentTarget.currentTime = position;
                        }
                    }}
                    onTimeUpdate={(event) => {
                        if (Math.abs(event.currentTarget.currentTime - lastSaved.current) >= SAVE_INTERVAL_SECONDS) {
                            save();
                        }
                    }}
                    onPause={save}
                    onEnded={save}
                    onError={() => {
                        setFailed(true);
                    }}
                >
                    <track kind="subtitles" src={animeMediaUrl('subtitle', episode.id)} label="Subtitles" default />
                </video>
            </div>
        </div>
    );
}

export function AnimePlayer() {
    const playing = useAnimeStore((state) => {
        return state.playing;
    });
    const library = useAnimeStore((state) => {
        return state.library;
    });
    const anime = library.find((candidate) => {
        return candidate.id === playing?.animeId;
    });
    const episode = anime?.episodes.find((candidate) => {
        return candidate.id === playing?.episodeId;
    });
    if (!anime || !episode) {
        return null;
    }
    return <PlayerView key={episode.id} anime={anime} episode={episode} />;
}
