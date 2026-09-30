import {
    AUDIO_FORMATS,
    BROWSERS,
    MAX_CONCURRENT,
    MAX_TITLE_LENGTH,
    MIN_CONCURRENT,
    MIN_TITLE_LENGTH,
    RESOLUTIONS,
    VIDEO_CONTAINERS
} from '@shared/constants';
import { useEffect } from 'react';
import type { MaxResolution } from '@shared/types';
import { useAutoSaveSettings, type SaveStatus } from '../hooks/useAutoSaveSettings';
import { useAppStore } from '../store/appStore';
import { NumberField, SelectField, TextField, ToggleField } from './fields';
import { UpdateActions } from './UpdateActions';
import { updateSummary } from './updateText';

const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
    idle: 'Changes are saved automatically.',
    pending: 'Unsaved changes…',
    saving: 'Saving…',
    saved: 'All changes saved.',
    error: 'Could not save the settings.'
};

function formatResolution(resolution: MaxResolution): string {
    return resolution === 'best' ? 'Best available' : `Up to ${resolution}p`;
}

export function SettingsPanel() {
    const stored = useAppStore((state) => {
        return state.settings;
    });
    const saveSettings = useAppStore((state) => {
        return state.saveSettings;
    });
    const chooseDirectory = useAppStore((state) => {
        return state.chooseDirectory;
    });
    const appUpdate = useAppStore((state) => {
        return state.appUpdate;
    });
    const checkAppUpdate = useAppStore((state) => {
        return state.checkAppUpdate;
    });
    const traySupport = useAppStore((state) => {
        return state.traySupport;
    });
    const refreshTraySupport = useAppStore((state) => {
        return state.refreshTraySupport;
    });
    const { draft, status, change, edit } = useAutoSaveSettings(stored, saveSettings);
    const trayWarning = draft.closeToTray && traySupport !== null && !traySupport.available ? traySupport.reason : null;

    useEffect(() => {
        void refreshTraySupport();
    }, [draft.closeToTray, refreshTraySupport]);
    const updateInProgress = appUpdate.status === 'checking' || appUpdate.status === 'downloading';

    async function handleChooseDirectory(): Promise<void> {
        const directory = await chooseDirectory();
        if (directory) {
            change('downloadDir', directory);
        }
    }

    return (
        <section className="settings" aria-label="Settings">
            <p className={`save-status save-status--${status}`} aria-live="polite">
                {SAVE_STATUS_TEXT[status]}
            </p>

            <fieldset className="panel">
                <legend>OUTPUT</legend>
                <div className="field-row">
                    <TextField
                        label="Download folder"
                        value={draft.downloadDir}
                        placeholder="Default: system Downloads folder"
                        onChange={(value) => {
                            edit('downloadDir', value);
                        }}
                    />
                    <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                            void handleChooseDirectory();
                        }}
                    >
                        BROWSE
                    </button>
                </div>
                <NumberField
                    label="Max title length (characters)"
                    value={draft.maxTitleLength}
                    min={MIN_TITLE_LENGTH}
                    max={MAX_TITLE_LENGTH}
                    hint="Long titles are cut in the file name so the download does not fail."
                    onChange={(value) => {
                        edit('maxTitleLength', value);
                    }}
                />
                <ToggleField
                    label="Restrict file names (ASCII only)"
                    checked={draft.restrictFilenames}
                    onChange={(value) => {
                        change('restrictFilenames', value);
                    }}
                />
            </fieldset>

            <fieldset className="panel">
                <legend>QUALITY & FORMAT</legend>
                <SelectField
                    label="Video quality"
                    value={draft.maxResolution}
                    options={RESOLUTIONS}
                    formatOption={formatResolution}
                    hint="Always picks the best video + best audio within the limit."
                    onChange={(value) => {
                        change('maxResolution', value);
                    }}
                />
                <SelectField
                    label="Video container"
                    value={draft.videoContainer}
                    options={VIDEO_CONTAINERS}
                    onChange={(value) => {
                        change('videoContainer', value);
                    }}
                />
                <ToggleField
                    label="Audio only"
                    checked={draft.audioOnly}
                    onChange={(value) => {
                        change('audioOnly', value);
                    }}
                />
                <SelectField
                    label="Audio format"
                    value={draft.audioFormat}
                    options={AUDIO_FORMATS}
                    onChange={(value) => {
                        change('audioFormat', value);
                    }}
                />
            </fieldset>

            <fieldset className="panel">
                <legend>BROWSER COOKIES</legend>
                <ToggleField
                    label="Use cookies from my browser"
                    checked={draft.useBrowserCookies}
                    hint="Needed for age-restricted, private or members-only videos."
                    onChange={(value) => {
                        change('useBrowserCookies', value);
                    }}
                />
                <SelectField
                    label="Browser"
                    value={draft.cookiesBrowser}
                    options={BROWSERS}
                    onChange={(value) => {
                        change('cookiesBrowser', value);
                    }}
                />
                <TextField
                    label="Browser profile (optional)"
                    value={draft.cookiesProfile}
                    onChange={(value) => {
                        edit('cookiesProfile', value);
                    }}
                />
            </fieldset>

            <fieldset className="panel">
                <legend>PLAYLISTS & SUBTITLES</legend>
                <ToggleField
                    label="Download whole playlist"
                    checked={draft.downloadPlaylist}
                    onChange={(value) => {
                        change('downloadPlaylist', value);
                    }}
                />
                <ToggleField
                    label="Download subtitles"
                    checked={draft.writeSubtitles}
                    onChange={(value) => {
                        change('writeSubtitles', value);
                    }}
                />
                <TextField
                    label="Subtitle languages"
                    value={draft.subtitleLangs}
                    hint="Comma separated, e.g. en,pt"
                    onChange={(value) => {
                        edit('subtitleLangs', value);
                    }}
                />
                <ToggleField
                    label="Embed subtitles in the video"
                    checked={draft.embedSubtitles}
                    onChange={(value) => {
                        change('embedSubtitles', value);
                    }}
                />
            </fieldset>

            <fieldset className="panel">
                <legend>ADVANCED</legend>
                <NumberField
                    label="Simultaneous downloads"
                    value={draft.maxConcurrent}
                    min={MIN_CONCURRENT}
                    max={MAX_CONCURRENT}
                    onChange={(value) => {
                        edit('maxConcurrent', value);
                    }}
                />
                <TextField
                    label="Speed limit"
                    value={draft.rateLimit}
                    placeholder="e.g. 2M or 500K"
                    onChange={(value) => {
                        edit('rateLimit', value);
                    }}
                />
                <TextField
                    label="yt-dlp path"
                    value={draft.ytdlpPath}
                    placeholder="Default: bundled yt-dlp"
                    onChange={(value) => {
                        edit('ytdlpPath', value);
                    }}
                />
                <TextField
                    label="ffmpeg path"
                    value={draft.ffmpegPath}
                    placeholder="Default: bundled ffmpeg"
                    onChange={(value) => {
                        edit('ffmpegPath', value);
                    }}
                />
                <TextField
                    label="JavaScript runtime"
                    value={draft.jsRuntime}
                    placeholder="Default: bundled deno"
                    hint="Optional override, e.g. node or RUNTIME:/path/to/binary."
                    onChange={(value) => {
                        edit('jsRuntime', value);
                    }}
                />
                <TextField
                    label="Extra yt-dlp arguments"
                    value={draft.extraArgs}
                    hint="Passed as-is to yt-dlp, including options that run commands (e.g. --exec). Only use arguments you trust."
                    onChange={(value) => {
                        edit('extraArgs', value);
                    }}
                />
            </fieldset>

            <fieldset className="panel">
                <legend>WINDOW</legend>
                <ToggleField
                    label="Keep running in the system tray when the window is closed"
                    checked={draft.closeToTray}
                    hint="Downloads keep going in the background. Right-click the tray icon to quit completely."
                    onChange={(value) => {
                        change('closeToTray', value);
                    }}
                />
                {trayWarning && (
                    <p className="field__warning" role="alert">
                        {trayWarning}
                    </p>
                )}
            </fieldset>

            <fieldset className="panel">
                <legend>APP UPDATES</legend>
                <p className="update-status" aria-live="polite">
                    {updateSummary(appUpdate)}
                </p>
                <div className="field-row">
                    <button
                        type="button"
                        className="btn btn--small"
                        disabled={updateInProgress}
                        onClick={() => {
                            void checkAppUpdate();
                        }}
                    >
                        CHECK FOR UPDATES
                    </button>
                    <UpdateActions />
                </div>
                <ToggleField
                    label="Check for updates on startup"
                    checked={draft.checkUpdatesOnStart}
                    onChange={(value) => {
                        change('checkUpdatesOnStart', value);
                    }}
                />
            </fieldset>
        </section>
    );
}
