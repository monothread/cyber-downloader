import { useEffect, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { useFullscreenIdle } from '../hooks/useFullscreenIdle';
import { useTranslator } from '../i18n/useTranslator';
import {
    MAX_SUBTITLE_SCALE,
    MIN_SUBTITLE_SCALE,
    readSubtitleScale,
    saveSubtitleScale,
    scalePercent,
    stepSubtitleScale
} from './subtitleScale';

// A subtitle the viewer can choose. The id is also the id of its <track>, which is how the control finds it.
export interface SubtitleOption {
    id: string;
    label: string;
}

interface VideoControlsProps {
    video: RefObject<HTMLVideoElement | null>;
    subtitles: readonly SubtitleOption[];
    // The id of the subtitle being shown; null when they are off.
    selectedSubtitle: string | null;
    onSelectSubtitle: (id: string | null) => void;
}

const SUBTITLES_OFF = 'off';

interface PlaybackState {
    paused: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
}

const INITIAL_STATE: PlaybackState = { paused: true, currentTime: 0, duration: 0, volume: 1, muted: false };
const SEEK_STEP_SECONDS = 5;
// A single click waits this long for a second one, so a double click does not also pause the video.
const DOUBLE_CLICK_WAIT_MS = 250;
const SYNC_EVENTS = ['play', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata', 'volumechange', 'seeked', 'ended'];

export function formatClock(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = String(total % 60).padStart(2, '0');
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${rest}`;
    }
    return `${minutes}:${rest}`;
}

function readState(element: HTMLVideoElement): PlaybackState {
    return {
        paused: element.paused,
        currentTime: element.currentTime,
        duration: Number.isFinite(element.duration) ? element.duration : 0,
        volume: element.volume,
        muted: element.muted
    };
}

function setCurrentTime(element: HTMLVideoElement, seconds: number): void {
    element.currentTime = seconds;
}

function setVolume(element: HTMLVideoElement, value: number): void {
    element.volume = value;
    element.muted = value === 0;
}

function toggleMuted(element: HTMLVideoElement): void {
    element.muted = !element.muted;
}

function togglePlayback(element: HTMLVideoElement): void {
    if (element.paused) {
        void element.play().catch(() => {
            return undefined;
        });
    } else {
        element.pause();
    }
}

function toggleStageFullscreen(element: HTMLVideoElement): void {
    const stage = element.parentElement;
    if (!stage) {
        return;
    }
    if (document.fullscreenElement) {
        void document.exitFullscreen();
    } else {
        void stage.requestFullscreen();
    }
}

function setTrackMode(track: TextTrack, mode: TextTrackMode): void {
    track.mode = mode;
}

function setScaleVariable(element: HTMLVideoElement, scale: number): void {
    element.style.setProperty('--subtitle-scale', String(scale));
}

function progressStyle(percent: number): CSSProperties {
    return { '--progress': `${percent}%` } as CSSProperties;
}

// The control bar of the player. It drives the <video> through its own API, so it looks the same in every theme.
export function VideoControls({ video, subtitles, selectedSubtitle, onSelectSubtitle }: VideoControlsProps) {
    const t = useTranslator();
    const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
    const [subtitleScale, setSubtitleScale] = useState(readSubtitleScale);
    const hidden = useFullscreenIdle(video);

    // The size is a variable on the video, which the style of the subtitles reads (see .player__video::cue).
    useEffect(() => {
        const element = video.current;
        if (element) {
            setScaleVariable(element, subtitleScale);
        }
    }, [video, subtitleScale]);

    function resizeSubtitles(direction: 1 | -1): void {
        const next = stepSubtitleScale(subtitleScale, direction);
        setSubtitleScale(next);
        saveSubtitleScale(next);
    }

    useEffect(() => {
        const element = video.current;
        if (!element) {
            return undefined;
        }
        const sync = (): void => {
            setState(readState(element));
        };
        SYNC_EVENTS.forEach((name) => {
            element.addEventListener(name, sync);
        });
        sync();
        return () => {
            SYNC_EVENTS.forEach((name) => {
                element.removeEventListener(name, sync);
            });
        };
    }, [video]);

    useEffect(() => {
        const element = video.current;
        if (!element) {
            return undefined;
        }
        let pending: ReturnType<typeof setTimeout> | null = null;
        const cancelPending = (): void => {
            if (pending !== null) {
                clearTimeout(pending);
                pending = null;
            }
        };
        const onClick = (): void => {
            cancelPending();
            pending = setTimeout(() => {
                pending = null;
                togglePlayback(element);
            }, DOUBLE_CLICK_WAIT_MS);
        };
        const onDoubleClick = (): void => {
            cancelPending();
            toggleStageFullscreen(element);
        };
        element.addEventListener('click', onClick);
        element.addEventListener('dblclick', onDoubleClick);
        return () => {
            cancelPending();
            element.removeEventListener('click', onClick);
            element.removeEventListener('dblclick', onDoubleClick);
        };
    }, [video]);

    // Shows the chosen subtitle and hides the others. Run again when the list changes: the tracks are added with it.
    useEffect(() => {
        const element = video.current;
        if (!element) {
            return;
        }
        Array.from(element.textTracks).forEach((track) => {
            setTrackMode(track, track.id === selectedSubtitle ? 'showing' : 'disabled');
        });
    }, [video, subtitles, selectedSubtitle]);

    function togglePlay(): void {
        if (video.current) {
            togglePlayback(video.current);
        }
    }

    function seekTo(seconds: number): void {
        const element = video.current;
        if (element) {
            setCurrentTime(element, seconds);
        }
    }

    function changeVolume(value: number): void {
        const element = video.current;
        if (element) {
            setVolume(element, value);
        }
    }

    function toggleMute(): void {
        const element = video.current;
        if (element) {
            toggleMuted(element);
        }
    }

    function toggleFullscreen(): void {
        if (video.current) {
            toggleStageFullscreen(video.current);
        }
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
            return;
        }
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        seekTo(Math.min(Math.max(state.currentTime + direction * SEEK_STEP_SECONDS, 0), state.duration));
        event.preventDefault();
    }

    const silent = state.muted || state.volume === 0;
    const seekPercent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    const volumePercent = silent ? 0 : state.volume * 100;

    return (
        <div className="player__controls" data-playing={!state.paused} data-hidden={hidden} onKeyDown={onKeyDown}>
            <button
                type="button"
                className="player__button"
                aria-label={state.paused ? t('anime.player.play') : t('anime.player.pause')}
                onClick={togglePlay}
            >
                {state.paused ? '▶' : '❚❚'}
            </button>
            <span className="player__time">{formatClock(state.currentTime)}</span>
            <input
                type="range"
                className="player__range player__seek"
                aria-label={t('anime.player.seek')}
                min={0}
                max={state.duration}
                step={0.1}
                value={Math.min(state.currentTime, state.duration)}
                style={progressStyle(seekPercent)}
                onChange={(event) => {
                    seekTo(Number(event.target.value));
                }}
            />
            <span className="player__time">{formatClock(state.duration)}</span>
            <button
                type="button"
                className="player__button"
                aria-label={silent ? t('anime.player.unmute') : t('anime.player.mute')}
                onClick={toggleMute}
            >
                {silent ? '🔇' : '🔊'}
            </button>
            <input
                type="range"
                className="player__range player__volume"
                aria-label={t('anime.player.volume')}
                min={0}
                max={1}
                step={0.05}
                value={silent ? 0 : state.volume}
                style={progressStyle(volumePercent)}
                onChange={(event) => {
                    changeVolume(Number(event.target.value));
                }}
            />
            {subtitles.length > 0 && (
                <select
                    className="player__select"
                    aria-label={t('anime.player.subtitles')}
                    value={selectedSubtitle ?? SUBTITLES_OFF}
                    onChange={(event) => {
                        onSelectSubtitle(event.target.value === SUBTITLES_OFF ? null : event.target.value);
                    }}
                >
                    <option value={SUBTITLES_OFF}>{t('anime.player.subtitlesOff')}</option>
                    {subtitles.map((option) => {
                        return (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        );
                    })}
                </select>
            )}
            {subtitles.length > 0 && (
                <span className="player__size" role="group" aria-label={t('anime.player.subtitleSize')}>
                    <button
                        type="button"
                        className="player__button"
                        aria-label={t('anime.player.subtitleSmaller')}
                        disabled={subtitleScale <= MIN_SUBTITLE_SCALE}
                        onClick={() => {
                            resizeSubtitles(-1);
                        }}
                    >
                        A−
                    </button>
                    <span className="player__time">{scalePercent(subtitleScale)}</span>
                    <button
                        type="button"
                        className="player__button"
                        aria-label={t('anime.player.subtitleLarger')}
                        disabled={subtitleScale >= MAX_SUBTITLE_SCALE}
                        onClick={() => {
                            resizeSubtitles(1);
                        }}
                    >
                        A+
                    </button>
                </span>
            )}
            <button type="button" className="player__button" aria-label={t('anime.player.fullscreen')} onClick={toggleFullscreen}>
                ⛶
            </button>
        </div>
    );
}
