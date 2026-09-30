import { useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '../store/appStore';

interface LinkRow {
    id: number;
    value: string;
    error: string | null;
    // Folder chosen for this link only; null uses the folder from the settings.
    directory: string | null;
}

export const EMPTY_LINKS_MESSAGE = 'Paste at least one video URL.';
const GENERIC_ADD_ERROR = 'Could not add the download.';

function createRow(id: number): LinkRow {
    return { id, value: '', error: null, directory: null };
}

export function UrlInput() {
    const nextId = useRef(1);
    const [rows, setRows] = useState<LinkRow[]>([createRow(0)]);
    const [focusId, setFocusId] = useState<number | null>(null);
    const addUrls = useAppStore((state) => {
        return state.addUrls;
    });
    const settings = useAppStore((state) => {
        return state.settings;
    });
    const saveSettings = useAppStore((state) => {
        return state.saveSettings;
    });
    const chooseDirectory = useAppStore((state) => {
        return state.chooseDirectory;
    });

    function newRow(): LinkRow {
        const row = createRow(nextId.current);
        nextId.current += 1;
        return row;
    }

    function updateRow(id: number, value: string): void {
        setRows((previous) => {
            return previous.map((row) => {
                return row.id === id ? { ...row, value, error: null } : row;
            });
        });
    }

    function setRowDirectory(id: number, directory: string | null): void {
        setRows((previous) => {
            return previous.map((row) => {
                return row.id === id ? { ...row, directory } : row;
            });
        });
    }

    async function chooseRowDirectory(id: number): Promise<void> {
        const directory = await chooseDirectory();
        if (directory) {
            setRowDirectory(id, directory);
        }
    }

    function addRow(): void {
        const row = newRow();
        setRows((previous) => {
            return [...previous, row];
        });
        setFocusId(row.id);
    }

    function removeRow(id: number): void {
        setRows((previous) => {
            return previous.filter((row) => {
                return row.id !== id;
            });
        });
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const filled = rows.filter((row) => {
            return row.value.trim().length > 0;
        });
        if (filled.length === 0) {
            setRows((previous) => {
                return previous.map((row, index) => {
                    return index === 0 ? { ...row, error: EMPTY_LINKS_MESSAGE } : row;
                });
            });
            return;
        }
        const results = await addUrls(
            filled.map((row) => {
                return { url: row.value.trim(), downloadDir: row.directory };
            })
        );
        const failed = filled.flatMap((row, index) => {
            const result = results[index];
            return result && !result.ok ? [{ ...row, error: result.message ?? GENERIC_ADD_ERROR }] : [];
        });
        setRows(failed.length > 0 ? failed : [newRow()]);
    }

    return (
        <form
            className="url-input"
            onSubmit={(event) => {
                void handleSubmit(event);
            }}
        >
            <span className="section-label">TARGET LINKS</span>
            <div className="link-rows">
                {rows.map((row, index) => {
                    return (
                        <div key={row.id} className="link-row">
                            <div className="link-row__line">
                                <input
                                    className={`input link-row__input ${row.error ? 'input--invalid' : ''}`}
                                    type="text"
                                    inputMode="url"
                                    spellCheck={false}
                                    autoComplete="off"
                                    autoFocus={row.id === focusId}
                                    aria-label={`Link ${index + 1}`}
                                    aria-invalid={row.error !== null}
                                    placeholder="https://..."
                                    title={row.value}
                                    value={row.value}
                                    onChange={(event) => {
                                        updateRow(row.id, event.target.value);
                                    }}
                                />
                                <button
                                    type="button"
                                    className={`btn btn--small ${row.directory ? 'btn--hot' : 'btn--ghost'}`}
                                    aria-label={`Choose folder for link ${index + 1}`}
                                    title={row.directory ?? 'Save this link in another folder'}
                                    onClick={() => {
                                        void chooseRowDirectory(row.id);
                                    }}
                                >
                                    FOLDER
                                </button>
                                {rows.length > 1 && (
                                    <button
                                        type="button"
                                        className="btn btn--small btn--ghost"
                                        aria-label={`Remove link ${index + 1}`}
                                        onClick={() => {
                                            removeRow(row.id);
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            {row.directory && (
                                <p className="link-row__folder">
                                    <span title={row.directory}>Saving to: {row.directory}</span>
                                    <button
                                        type="button"
                                        className="btn btn--small btn--ghost"
                                        aria-label={`Use the default folder for link ${index + 1}`}
                                        onClick={() => {
                                            setRowDirectory(row.id, null);
                                        }}
                                    >
                                        ✕
                                    </button>
                                </p>
                            )}
                            {row.error && (
                                <p className="link-row__error" role="alert">
                                    {row.error}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="url-input__row">
                <label className="toggle">
                    <input
                        type="checkbox"
                        checked={settings.audioOnly}
                        onChange={(event) => {
                            void saveSettings({ ...settings, audioOnly: event.target.checked });
                        }}
                    />
                    <span>AUDIO ONLY</span>
                </label>
                <div className="url-input__buttons">
                    <button type="button" className="btn" onClick={addRow}>
                        + ADD LINK
                    </button>
                    <button type="submit" className="btn btn--primary">
                        DOWNLOAD
                    </button>
                </div>
            </div>
        </form>
    );
}
