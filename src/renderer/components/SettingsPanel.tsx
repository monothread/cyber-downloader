import { useState } from 'react';
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
import type { MaxResolution, Settings } from '@shared/types';
import { useAppStore } from '../store/appStore';
import { NumberField, SelectField, TextField, ToggleField } from './fields';
import { UpdateActions } from './UpdateActions';
import { updateSummary } from './updateText';

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
    const setNotice = useAppStore((state) => {
        return state.setNotice;
    });
    const appUpdate = useAppStore((state) => {
        return state.appUpdate;
    });
    const checkAppUpdate = useAppStore((state) => {
        return state.checkAppUpdate;
    });
    const [draft, setDraft] = useState<Settings>(stored);
    const updateInProgress = appUpdate.status === 'checking' || appUpdate.status === 'downloading';

    function update<K extends keyof Settings>(key: K, value: Settings[K]): void {
        setDraft((previous) => {
            return { ...previous, [key]: value };
        });
    }

    async function handleChooseDirectory(): Promise<void> {
        const directory = await chooseDirectory();
        if (directory) {
            update('downloadDir', directory);
        }
    }

    async function handleSave(): Promise<void> {
        const saved = await saveSettings(draft);
        setDraft(saved);
        setNotice({ kind: 'info', message: 'Settings saved.' });
    }

    return (
        <section className="settings" aria-label="Settings">
            <fieldset className="panel">
                <legend>OUTPUT</legend>
                <div className="field-row">
                    <TextField
                        label="Download folder"
                        value={draft.downloadDir}
                        placeholder="Default: system Downloads folder"
                        onChange={(value) => {
                            update('downloadDir', value);
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
                        update('maxTitleLength', value);
                    }}
                />
                <ToggleField
                    label="Restrict file names (ASCII only)"
                    checked={draft.restrictFilenames}
                    onChange={(value) => {
                        update('restrictFilenames', value);
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
                        update('maxResolution', value);
                    }}
                />
                <SelectField
                    label="Video container"
                    value={draft.videoContainer}
                    options={VIDEO_CONTAINERS}
                    onChange={(value) => {
                        update('videoContainer', value);
                    }}
                />
                <ToggleField
                    label="Audio only"
                    checked={draft.audioOnly}
                    onChange={(value) => {
                        update('audioOnly', value);
                    }}
                />
                <SelectField
                    label="Audio format"
                    value={draft.audioFormat}
                    options={AUDIO_FORMATS}
                    onChange={(value) => {
                        update('audioFormat', value);
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
                        update('useBrowserCookies', value);
                    }}
                />
                <SelectField
                    label="Browser"
                    value={draft.cookiesBrowser}
                    options={BROWSERS}
                    onChange={(value) => {
                        update('cookiesBrowser', value);
                    }}
                />
                <TextField
                    label="Browser profile (optional)"
                    value={draft.cookiesProfile}
                    onChange={(value) => {
                        update('cookiesProfile', value);
                    }}
                />
            </fieldset>

            <fieldset className="panel">
                <legend>PLAYLISTS & SUBTITLES</legend>
                <ToggleField
                    label="Download whole playlist"
                    checked={draft.downloadPlaylist}
                    onChange={(value) => {
                        update('downloadPlaylist', value);
                    }}
                />
                <ToggleField
                    label="Download subtitles"
                    checked={draft.writeSubtitles}
                    onChange={(value) => {
                        update('writeSubtitles', value);
                    }}
                />
                <TextField
                    label="Subtitle languages"
                    value={draft.subtitleLangs}
                    hint="Comma separated, e.g. en,pt"
                    onChange={(value) => {
                        update('subtitleLangs', value);
                    }}
                />
                <ToggleField
                    label="Embed subtitles in the video"
                    checked={draft.embedSubtitles}
                    onChange={(value) => {
                        update('embedSubtitles', value);
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
                        update('maxConcurrent', value);
                    }}
                />
                <TextField
                    label="Speed limit"
                    value={draft.rateLimit}
                    placeholder="e.g. 2M or 500K"
                    onChange={(value) => {
                        update('rateLimit', value);
                    }}
                />
                <TextField
                    label="yt-dlp path"
                    value={draft.ytdlpPath}
                    placeholder="Default: bundled yt-dlp"
                    onChange={(value) => {
                        update('ytdlpPath', value);
                    }}
                />
                <TextField
                    label="ffmpeg path"
                    value={draft.ffmpegPath}
                    placeholder="Default: bundled ffmpeg"
                    onChange={(value) => {
                        update('ffmpegPath', value);
                    }}
                />
                <TextField
                    label="JavaScript runtime"
                    value={draft.jsRuntime}
                    placeholder="Default: bundled deno"
                    hint="Optional override, e.g. node or RUNTIME:/path/to/binary."
                    onChange={(value) => {
                        update('jsRuntime', value);
                    }}
                />
                <TextField
                    label="Extra yt-dlp arguments"
                    value={draft.extraArgs}
                    hint="Passed as-is to yt-dlp, including options that run commands (e.g. --exec). Only use arguments you trust."
                    onChange={(value) => {
                        update('extraArgs', value);
                    }}
                />
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
                        update('checkUpdatesOnStart', value);
                    }}
                />
            </fieldset>

            <div className="settings__actions">
                <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                        void handleSave();
                    }}
                >
                    SAVE SETTINGS
                </button>
            </div>
        </section>
    );
}
