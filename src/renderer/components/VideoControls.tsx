import { useEffect, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { useFullscreenIdle } from '../hooks/useFullscreenIdle';
import { useSubtitleStyle } from '../hooks/useSubtitleStyle';
import { useVideoBuffer } from '../hooks/useVideoBuffer';
import { useTranslator } from '../i18n/useTranslator';
import { seekHover, type SeekHover } from './seekHover';
import { hasPlayerSettings, PlayerSettings, type SubtitleOption } from './PlayerSettings';

// Kept here, where the player's other files already import it from.
export type { SubtitleOption } from './PlayerSettings';

interface VideoControlsProps {
    video: RefObject<HTMLVideoElement | null>;
    subtitles: readonly SubtitleOption[];
    // The id of the subtitle being shown; null when they are off.
    selectedSubtitle: string | null;
    onSelectSubtitle: (id: string | null) => void;
}

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

function progressStyle(percent: number): CSSProperties {
    return { '--progress': `${percent}%` } as CSSProperties;
}

function seekStyle(percent: number, bufferedPercent: number): CSSProperties {
    return { '--progress': `${percent}%`, '--buffered': `${bufferedPercent}%` } as CSSProperties;
}

// The control bar of the player. It drives the <video> through its own API, so it looks the same in every theme.
export function VideoControls({ video, subtitles, selectedSubtitle, onSelectSubtitle }: VideoControlsProps) {
    const t = useTranslator();
    const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
    const subtitleStyle = useSubtitleStyle(video);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [hover, setHover] = useState<SeekHover | null>(null);
    const { loading, bufferedPercent } = useVideoBuffer(video);
    // The bar stays while the settings are open: they are part of it.
    const hidden = useFullscreenIdle(video) && !settingsOpen;

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

    // The tooltip sits in the bar, so its position is measured from the bar: the timeline's own offset plus the mouse on it.
    function hoverTimeline(input: HTMLInputElement, clientX: number): void {
        const found = seekHover(clientX, input.getBoundingClientRect(), state.duration);
        setHover(found === null ? null : { time: found.time, offset: input.offsetLeft + found.offset });
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
        <>
            {loading && (
                <div className="player__loading" role="status" aria-label={t('anime.player.loading')}>
                    <span className="player__spinner" aria-hidden="true" />
                </div>
            )}
            <div className="player__controls" data-playing={!state.paused} data-hidden={hidden} onKeyDown={onKeyDown}>
                <button
                    type="button"
                    className="player__button"
                    aria-label={state.paused ? t('anime.player.play') : t('anime.player.pause')}
                    onClick={togglePlay}
                >
                    {state.paused ? '▶' : '❚❚'}
                </button>
                {hover !== null && (
                    <span className="player__hover" role="tooltip" style={{ left: hover.offset }}>
                        {formatClock(hover.time)}
                    </span>
                )}
                <span className="player__time">{formatClock(state.currentTime)}</span>
                <input
                    type="range"
                    className="player__range player__seek"
                    aria-label={t('anime.player.seek')}
                    min={0}
                    max={state.duration}
                    step={0.1}
                    value={Math.min(state.currentTime, state.duration)}
                    style={seekStyle(seekPercent, bufferedPercent)}
                    onMouseMove={(event) => {
                        hoverTimeline(event.currentTarget, event.clientX);
                    }}
                    onMouseLeave={() => {
                        setHover(null);
                    }}
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
                {hasPlayerSettings(subtitles) && (
                    <PlayerSettings
                        open={settingsOpen}
                        onOpenChange={setSettingsOpen}
                        subtitles={subtitles}
                        selectedSubtitle={selectedSubtitle}
                        onSelectSubtitle={onSelectSubtitle}
                        subtitleStyle={subtitleStyle}
                    />
                )}
                <button type="button" className="player__button" aria-label={t('anime.player.fullscreen')} onClick={toggleFullscreen}>
                    ⛶
                </button>
            </div>
        </>
    );
}
