import { useState, type FormEvent } from 'react';
import { useAppStore } from '../store/appStore';

export function UrlInput() {
    const [value, setValue] = useState('');
    const addUrls = useAppStore((state) => {
        return state.addUrls;
    });
    const settings = useAppStore((state) => {
        return state.settings;
    });
    const saveSettings = useAppStore((state) => {
        return state.saveSettings;
    });

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        await addUrls(value);
        setValue('');
    }

    return (
        <form
            className="url-input"
            onSubmit={(event) => {
                void handleSubmit(event);
            }}
        >
            <label className="section-label" htmlFor="url-field">
                TARGET URL(S)
            </label>
            <textarea
                id="url-field"
                className="input url-input__field"
                rows={2}
                placeholder="https://... (paste one or more links, separated by spaces or new lines)"
                value={value}
                onChange={(event) => {
                    setValue(event.target.value);
                }}
            />
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
                <button type="submit" className="btn btn--primary">
                    DOWNLOAD
                </button>
            </div>
        </form>
    );
}
